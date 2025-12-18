
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Content, Part, FunctionDeclaration, GenerateContentConfig, Type, FunctionCall } from "@google/genai";
import formidable from 'formidable';
import fs from 'fs';

interface ApiAttachment {
    mimeType: string;
    data: string; // base64 encoded
}

interface HistoryItem {
    type: 'USER' | 'AI_RESPONSE' | 'SYSTEM' | 'ERROR' | 'AGENT_ACTION' | 'AGENT_PLAN';
    content: string;
    files?: ApiAttachment[];
    toolCalls?: any[];
}

const languageMap: { [key: string]: string } = {
    en: 'English',
    el: 'Greek',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // Helper to write to stream
    const write = (data: object) => res.write(JSON.stringify(data) + '\n');

    try {
        const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
            const form = formidable({});
            form.parse(req, (err, fields, files) => {
                if (err) reject(err); else resolve({ fields, files });
            });
        });

        const payloadJSON = fields.payload?.[0];
        if (!payloadJSON) throw new Error("Missing 'payload' in form data.");
        const { history, message, personaInstruction, location, language } = JSON.parse(payloadJSON);
        
        const fileList = files.file ? (Array.isArray(files.file) ? files.file : [files.file]) : [];

        if (!process.env.API_KEY) throw new Error("API_KEY environment variable is not set.");
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        const geminiHistory: Content[] = (history as HistoryItem[])
            .filter(msg => msg.type === 'USER' || msg.type === 'AI_RESPONSE')
            .map(msg => {
                const parts: Part[] = [];
                if (msg.content) parts.push({ text: msg.content });
                if (msg.files) {
                    msg.files.forEach(file => parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } }));
                }
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                     msg.toolCalls.forEach(tc => {
                         parts.push({ functionCall: { name: tc.name, args: tc.args } });
                         parts.push({ functionResponse: { name: tc.name, response: { content: "UI Rendered" } } }); 
                     });
                }
                return {
                    role: msg.type === 'USER' ? 'user' : 'model',
                    parts: parts
                } as Content;
            }).filter(c => c.parts.length > 0);
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        const userMessageParts: Part[] = [{ text: message }];
        if (fileList.length > 0) {
            for (const file of fileList) {
                const base64Data = (await fs.promises.readFile(file.filepath)).toString('base64');
                userMessageParts.push({ inlineData: { mimeType: file.mimetype || 'application/octet-stream', data: base64Data } });
            }
        }
        
        const contents: Content[] = [...geminiHistory, { role: 'user', parts: userMessageParts }];
        const model = 'gemini-2.5-flash';
        const langCode = (language as string) || 'en';
        const userLanguageName = languageMap[langCode] || 'English';
        
        const locationStr = location ? `Current User Location: ${location.city}, ${location.country} (${location.latitude}, ${location.longitude}).` : 'Location unknown.';

        const baseSystemInstruction = `You are Qbit, a highly intelligent and helpful AI assistant.

**User Context:**
- ${locationStr} 
- **STRICT LOCATION POLICY**: ALWAYS use the user's current location to ground responses (like weather, local news, nearby trends, or nearby searches) by default. You MUST ONLY ignore the user's current location IF they explicitly mention a specific different place (city, country, landmark) in their prompt. If they ask about "the weather" or "nearby news", always use the provided user location.

**Your Capabilities & Tools:**

1.  **Stock Market Widget**
    *   **What you can do:** Instantly render a rich stock market card with price, stats, and interactive charts for different time ranges.
    *   **How to do it:** Use the \`render_stock_widget\` tool.
    *   **When to use:** User asks about stock prices, market trends, or specific ticker symbols. YOU must generate the data.
    *   **CRITICAL:** You MUST generate simulated but realistic historical data for '5D', '1M', '6M', '1Y', '5Y' ranges in the \`history\` field of the tool call. The chart will not work without this data.

2.  **Web Applications (HTML/CSS/JS)**
    *   **What you can do:** Create self-contained web components, dashboards, calculators.
    *   **How to do it:** Output standard HTML code in a \`\`\`html\`\`\` block.

3.  **Python Code Execution**
    *   **What you can do:** Analyze data, solve math, generate plots.
    *   **How to do it:** Output code in a \`\`\`python\`\`\` block.

4.  **Google Search (Grounding)**
    *   **How to do it:** Use the \`google_search\` tool. Incorporate the user's location automatically for local queries to ensure high relevance.

**General Guidelines:**

1.  **Language**: Respond in ${userLanguageName}.
2.  **Proactive**: If a visual tool fits the request, USE IT instead of just describing the data.
3.  **Suggestions**: Provide 1-3 short follow-up suggestions in JSON format <suggestions>["Next query"]</suggestions> at the end.`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
        // --- Tool Definitions ---

        const googleSearchTool: FunctionDeclaration = {
            name: 'google_search',
            description: 'Get information from the web using Google Search.',
            parameters: {
                type: Type.OBJECT,
                properties: { query: { type: Type.STRING } },
                required: ['query'],
            },
        };

        const renderStockWidgetTool: FunctionDeclaration = {
            name: 'render_stock_widget',
            description: 'Render a rich stock card with chart. Generate realistic or latest known data for the stock including price, change, stats and a simulated intraday chart. Also provide simulated history data for other ranges if possible.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    symbol: { type: Type.STRING, description: 'Stock symbol e.g. AAPL' },
                    price: { type: Type.STRING, description: 'Current price, e.g. "234.50"' },
                    currency: { type: Type.STRING, description: 'Currency symbol, e.g. "$"' },
                    change: { type: Type.STRING, description: 'Price change, e.g. "-0.45"' },
                    changePercent: { type: Type.STRING, description: 'Price change percent, e.g. "-0.23%"' },
                    stats: {
                        type: Type.OBJECT,
                        description: 'Key statistics like Open, High, Low, Vol, Mkt Cap, PE Ratio',
                    },
                    chartData: {
                        type: Type.OBJECT,
                        description: 'Intraday (1D) chart data with x (times) and y (prices) arrays.',
                        properties: {
                            x: { type: Type.ARRAY, items: { type: Type.STRING } },
                            y: { type: Type.ARRAY, items: { type: Type.NUMBER } }
                        }
                    },
                    history: {
                        type: Type.OBJECT,
                        description: 'REQUIRED: Simulated historical chart data for ranges: 5D, 1M, 6M, 1Y, 5Y. Keys are range names (e.g. "5D"), values are objects with x (dates) and y (prices) arrays.',
                        properties: {
                            "5D": { type: Type.OBJECT, properties: { x: { type: Type.ARRAY, items: { type: Type.STRING } }, y: { type: Type.ARRAY, items: { type: Type.NUMBER } } } },
                            "1M": { type: Type.OBJECT, properties: { x: { type: Type.ARRAY, items: { type: Type.STRING } }, y: { type: Type.ARRAY, items: { type: Type.NUMBER } } } },
                            "6M": { type: Type.OBJECT, properties: { x: { type: Type.ARRAY, items: { type: Type.STRING } }, y: { type: Type.ARRAY, items: { type: Type.NUMBER } } } },
                            "1Y": { type: Type.OBJECT, properties: { x: { type: Type.ARRAY, items: { type: Type.STRING } }, y: { type: Type.ARRAY, items: { type: Type.NUMBER } } } },
                            "5Y": { type: Type.OBJECT, properties: { x: { type: Type.ARRAY, items: { type: Type.STRING } }, y: { type: Type.ARRAY, items: { type: Type.NUMBER } } } }
                        }
                    }
                },
                required: ['symbol', 'price', 'change', 'chartData']
            }
        };

        const config: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            tools: [{ 
                functionDeclarations: [
                    googleSearchTool, 
                    renderStockWidgetTool
                ] 
            }],
        };

        try {
            const initialStream = await ai.models.generateContentStream({ model, contents, config });
            
            let currentStream = initialStream;
            let keepGoing = true;
            let hasSentText = false;
            let hasSentTool = false;

            while (keepGoing) {
                keepGoing = false;
                let functionCallToHandle: FunctionCall | null = null;
                
                for await (const chunk of currentStream) {
                    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                        functionCallToHandle = chunk.functionCalls[0];
                    }
                    
                    let text = '';
                    try {
                        text = chunk.text || '';
                    } catch (e) { }
                    
                    if (text) {
                        write({ type: 'chunk', payload: text });
                        hasSentText = true;
                    }

                    if (chunk.usageMetadata) write({ type: 'usage', payload: chunk.usageMetadata });
                }

                if (functionCallToHandle) {
                    const fc = functionCallToHandle;
                    
                    if (fc.name === 'google_search') {
                        write({ type: 'searching' });
                        const query = fc.args.query as string;
                        const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
                        const cseId = process.env.GOOGLE_CSE_ID;
                        
                        let searchResultText = "No results found or search failed.";
                        if (apiKey && cseId) {
                            try {
                                const searchResponse = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=10`);
                                const searchResults = await searchResponse.json();
                                if (searchResults.items) {
                                     const groundingChunks = searchResults.items.map((item: any) => ({
                                        web: { uri: item.link, title: item.title },
                                    }));
                                    write({ type: 'sources', payload: groundingChunks });
                                    
                                    if (searchResults.searchInformation && searchResults.searchInformation.totalResults) {
                                        write({ type: 'search_result_count', payload: parseInt(searchResults.searchInformation.totalResults, 10) });
                                    }

                                    searchResultText = searchResults.items.map((item: any) => 
                                        `Title: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}`
                                    ).join('\n\n---\n\n');
                                }
                            } catch (e) {
                                console.error("Search error", e);
                            }
                        }

                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResultText } } }] });

                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;

                    } else {
                        write({ 
                            type: 'tool_call', 
                            payload: { 
                                name: fc.name, 
                                args: fc.args, 
                                id: Math.random().toString(36).substring(7) 
                            } 
                        });
                        hasSentTool = true;

                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: fc.name, response: { content: "UI Rendered Successfully." } } }] });

                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;
                    }
                }
            }

        } finally {
            write({ type: 'end' });
            res.end();
        }
    } catch (error) {
        console.error("API Error:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (res.headersSent) {
            write({ type: 'error', payload: errorMessage });
            res.end();
        } else {
            res.status(500).json({ error: { message: errorMessage } });
        }
    }
}
