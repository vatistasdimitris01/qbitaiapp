
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
        
        const locationStr = location ? `Current User Location: ${location.city}, ${location.country} (Lat: ${location.latitude}, Lon: ${location.longitude}).` : 'Location unknown.';

        const baseSystemInstruction = `You are Qbit, a highly intelligent and helpful AI assistant.

**User Context & Critical Policy:**
- ${locationStr} 
- **LOCATION CAPABILITY**: You HAVE full access to the user's location details provided above. NEVER claim you do not have access to their location. If asked for local info like weather, use these coordinates/city.
- **WEB SEARCH CAPABILITY**: You HAVE real-time web access through the \`google_search\` tool. NEVER say you can't search the web or give outdated information when a search can resolve it.

**Your Capabilities & Tools:**

1.  **Stock Market Widget**
    *   **Tool:** \`render_stock_widget\`. Use it when users ask about price, charts, or history of ticker symbols.

2.  **Web Applications (HTML/CSS/JS)**
    *   **Output:** Standard HTML code blocks (\` \` \`html ... \` \` \`).

3.  **Python Code Execution**
    *   **Output:** Python code blocks.

4.  **Google Search (API and ID Powered)**
    *   **Tool:** \`google_search\`. Use this for ANY information that requires real-time facts, news, weather, or location-based trends. 
    *   **Search Engine Config:** This tool uses Google Custom Search with a specific API Key and CX ID.

**General Guidelines:**

1.  **Language**: Respond in ${userLanguageName}.
2.  **Suggestions**: Provide follow-up suggestions in JSON format <suggestions>["Next query"]</suggestions> at the end of relevant responses.`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
        const googleSearchTool: FunctionDeclaration = {
            name: 'google_search',
            description: 'Perform a web search to get real-time info, news, weather, or facts.',
            parameters: {
                type: Type.OBJECT,
                properties: { query: { type: Type.STRING, description: 'The search query string.' } },
                required: ['query'],
            },
        };

        const renderStockWidgetTool: FunctionDeclaration = {
            name: 'render_stock_widget',
            description: 'Render a rich stock card with chart.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    symbol: { type: Type.STRING, description: 'Stock symbol' },
                    price: { type: Type.STRING, description: 'Price' },
                    currency: { type: Type.STRING, description: 'Currency' },
                    change: { type: Type.STRING, description: 'Change' },
                    changePercent: { type: Type.STRING, description: 'Change %' },
                    stats: { type: Type.OBJECT },
                    chartData: { type: Type.OBJECT, properties: { x: { type: Type.ARRAY, items: { type: Type.STRING } }, y: { type: Type.ARRAY, items: { type: Type.NUMBER } } } },
                    history: { type: Type.OBJECT }
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

            while (keepGoing) {
                keepGoing = false;
                let functionCallToHandle: FunctionCall | null = null;
                
                for await (const chunk of currentStream) {
                    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                        functionCallToHandle = chunk.functionCalls[0];
                    }
                    
                    let text = '';
                    try { text = chunk.text || ''; } catch (e) { }
                    if (text) write({ type: 'chunk', payload: text });
                    if (chunk.usageMetadata) write({ type: 'usage', payload: chunk.usageMetadata });
                }

                if (functionCallToHandle) {
                    const fc = functionCallToHandle;
                    if (fc.name === 'google_search') {
                        write({ type: 'searching' });
                        const query = fc.args.query as string;
                        const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
                        const cseId = process.env.GOOGLE_CSE_ID;
                        
                        let searchResultText = "Search failed.";
                        if (apiKey && cseId) {
                            try {
                                const searchResponse = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=10`);
                                const searchResults = await searchResponse.json();
                                if (searchResults.items) {
                                     const groundingChunks = searchResults.items.map((item: any) => ({
                                        web: { uri: item.link, title: item.title },
                                    }));
                                    write({ type: 'sources', payload: groundingChunks });
                                    if (searchResults.searchInformation?.totalResults) {
                                        write({ type: 'search_result_count', payload: parseInt(searchResults.searchInformation.totalResults, 10) });
                                    }
                                    searchResultText = searchResults.items.map((item: any) => 
                                        `Title: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}`
                                    ).join('\n\n---\n\n');
                                }
                            } catch (e) { }
                        }
                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResultText } } }] });
                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;
                    } else {
                        write({ type: 'tool_call', payload: { name: fc.name, args: fc.args, id: Math.random().toString(36).substring(7) } });
                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: fc.name, response: { content: "UI Rendered" } } }] });
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
