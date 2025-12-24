
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
        const model = 'gemini-2.5-flash-lite';
        const langCode = (language as string) || 'en';
        const userLanguageName = languageMap[langCode] || 'English';
        
        const locationStr = location ? `Current User Location: ${location.city}, ${location.country} (${location.latitude}, ${location.longitude}).` : 'Location unknown.';

        const baseSystemInstruction = `You are Qbit, a highly intelligent and helpful AI assistant.

**User Context:**
- ${locationStr} 
- **STRICT LOCATION POLICY**: Always use the user's current location to ground responses (like weather, local news, or nearby searches) by default. You have full access to this location. You MUST incorporate the current location into web searches (e.g. for "news" or "weather") UNLESS the user explicitly mentions a different specific location in their prompt. If a specific city or place is mentioned by the user, prioritize that over their current location.

**Your Capabilities & Tools:**

1.  **Stock Market Widget**
    *   **What you can do:** Instantly render a rich stock market card with price, stats, and interactive charts.
    *   **How to do it:** Use the \`render_stock_widget\` tool.
    *   **CRITICAL:** You MUST generate simulated but realistic historical data for '5D', '1M', '6M', '1Y', '5Y' ranges in the \`history\` field.

2.  **Web Applications (HTML/CSS/JS)**
    *   **How to do it:** Output standard HTML code in a \`\`\`html\`\`\` block.

3.  **Python Code Execution**
    *   **How to do it:** Output code in a \`\`\`python\`\`\` block.

4.  **Google Search (Grounding)**
    *   **How to do it:** Use the \`google_search\` tool. Incorporate the user's location automatically for local queries. ALWAYS USE THE PROVIDED TOOL FOR WEB SEARCH.

**General Guidelines:**

1.  **Language**: Respond in ${userLanguageName}.
2.  **Continuous Conversation**: Maintain the flow of conversation. You are provided with conversation history; use it to understand context.
3.  **Proactive**: If a visual tool (like stocks) or a search is needed, use it immediately.
4.  **Suggestions**: Provide 1-3 follow-up suggestions in JSON format <suggestions>["Query 1", "Query 2"]</suggestions> at the end.`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
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
            description: 'Render a stock card with chart. Keys: symbol, price, change, stats, chartData, history.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    symbol: { type: Type.STRING },
                    price: { type: Type.STRING },
                    change: { type: Type.STRING },
                    stats: { type: Type.OBJECT },
                    chartData: { type: Type.OBJECT },
                    history: { type: Type.OBJECT }
                },
                required: ['symbol', 'price', 'change', 'chartData']
            }
        };

        const config: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            tools: [{ functionDeclarations: [googleSearchTool, renderStockWidgetTool] }],
        };

        try {
            let currentStream = await ai.models.generateContentStream({ model, contents, config });
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
                        const rawQuery = fc.args.query as string;
                        // Proactively add location context to generic queries
                        const query = (location && !rawQuery.toLowerCase().includes(location.city.toLowerCase())) 
                            ? `${rawQuery} in ${location.city}` 
                            : rawQuery;

                        const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
                        const cseId = process.env.GOOGLE_CSE_ID;
                        
                        let searchResultText = "Search failed.";
                        if (apiKey && cseId) {
                            try {
                                const sRes = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=10`);
                                const sData = await sRes.json();
                                if (sData.items) {
                                     const sources = sData.items.map((item: any) => ({ web: { uri: item.link, title: item.title } }));
                                     write({ type: 'sources', payload: sources });
                                     searchResultText = sData.items.map((item: any) => `Title: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}`).join('\n\n');
                                }
                            } catch (e) {}
                        }
                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResultText } } }] });
                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;
                    } else {
                        write({ type: 'tool_call', payload: { name: fc.name, args: fc.args } });
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
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (res.headersSent) {
            write({ type: 'error', payload: errorMessage });
            res.end();
        } else {
            res.status(500).json({ error: { message: errorMessage } });
        }
    }
}
