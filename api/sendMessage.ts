
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    GoogleGenAI, 
    Content, 
    Part, 
    FunctionDeclaration, 
    GenerateContentConfig, 
    Type, 
    FunctionCall,
    HarmCategory,
    HarmBlockThreshold
} from "@google/genai";
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
    en: 'English', el: 'Greek', es: 'Spanish', fr: 'French', de: 'German',
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

    let hasSentContent = false;
    const write = (data: object) => {
        hasSentContent = true;
        res.write(JSON.stringify(data) + '\n');
    };

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

        // 1. Convert history to Gemini format
        const rawHistory: Content[] = (history as HistoryItem[])
            .filter(msg => msg.type === 'USER' || msg.type === 'AI_RESPONSE')
            .map(msg => {
                const parts: Part[] = [];
                if (msg.content) parts.push({ text: msg.content });
                if (msg.files) {
                    msg.files.forEach(file => parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } }));
                }
                // Ensure we map strictly to 'user' or 'model'
                return { role: msg.type === 'USER' ? 'user' : 'model', parts: parts } as Content;
            })
            .filter(c => c.parts.length > 0);

        // 2. Consolidate History: Merge consecutive messages with the same role
        // Gemini API will error or return empty if history is [User, User, Model]
        const consolidatedHistory: Content[] = [];
        if (rawHistory.length > 0) {
            let currentMsg = rawHistory[0];
            for (let i = 1; i < rawHistory.length; i++) {
                const nextMsg = rawHistory[i];
                if (currentMsg.role === nextMsg.role) {
                    // Merge parts
                    currentMsg.parts = [...currentMsg.parts, ...nextMsg.parts];
                } else {
                    consolidatedHistory.push(currentMsg);
                    currentMsg = nextMsg;
                }
            }
            consolidatedHistory.push(currentMsg);
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        const userMessageParts: Part[] = [{ text: message }];
        if (fileList.length > 0) {
            for (const file of fileList) {
                const base64Data = (await fs.promises.readFile(file.filepath)).toString('base64');
                userMessageParts.push({ inlineData: { mimeType: file.mimetype || 'application/octet-stream', data: base64Data } });
            }
        }
        
        // Final contents array
        const contents: Content[] = [...consolidatedHistory, { role: 'user', parts: userMessageParts }];
        
        // Use gemini-2.0-flash for stability
        const model = 'gemini-2.0-flash';
        const langCode = (language as string) || 'en';
        const userLanguageName = languageMap[langCode] || 'English';
        
        const locationStr = location ? `User's Exact Location: ${location.city}, ${location.country}.` : 'Location hidden or unknown.';

        const baseSystemInstruction = `You are KIPP (Kosmic Intelligence Pattern Perceptron), a highly intelligent and helpful AI assistant.

**User Context:**
- ${locationStr} 
- **STRICT LOCATION POLICY**: Always use the user's current location to ground responses (like weather, local news, or nearby searches) by default. You MUST incorporate the current location into web searches (e.g. for "news" or "weather") UNLESS the user explicitly mentions a different specific location in their prompt. If a specific city or place is mentioned by the user, prioritize that over their current location.

**Your Capabilities & Tools:**

1.  **Stock Market Widget**
    *   **How to do it:** Use the \`render_stock_widget\` tool.
    *   **CRITICAL:** You MUST generate simulated but realistic historical data for '5D', '1M', '6M', '1Y', '5Y' ranges in the \`history\` field.

2.  **Web Applications (HTML/CSS/JS)**
    *   **How to do it:** Output standard HTML code in a \`\`\`html\`\`\` block.

3.  **Python Code Execution**
    *   **How to do it:** Output code in a \`\`\`python\`\`\` block.

4.  **Google Search (Grounding)**
    *   **How to do it:** Use the \`google_search\` tool. Incorporate the user's location automatically for local queries to ensure high relevance. ALWAYS USE THIS TOOL FOR REAL-TIME INFO.

**General Guidelines:**

1.  **Language**: Respond in ${userLanguageName}.
2.  **Proactive**: If a visual tool fits the request, USE IT immediately.
3.  **Suggestions**: Always end with <suggestions>["Query 1", "Query 2"]</suggestions>.`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
        const googleSearchTool: FunctionDeclaration = {
            name: 'google_search',
            description: 'Get real-time information from the web.',
            parameters: {
                type: Type.OBJECT,
                properties: { query: { type: Type.STRING } },
                required: ['query'],
            },
        };

        const renderStockWidgetTool: FunctionDeclaration = {
            name: 'render_stock_widget',
            description: 'Render a stock card with price and history.',
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
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ],
        };

        try {
            let currentStream = await ai.models.generateContentStream({ model, contents, config });
            let keepGoing = true;

            while (keepGoing) {
                keepGoing = false;
                let functionCallToHandle: FunctionCall | null = null;
                
                for await (const chunk of currentStream) {
                    // CRITICAL: Capture function calls immediately
                    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                        functionCallToHandle = chunk.functionCalls[0];
                        write({ type: 'tool_call_detected', payload: functionCallToHandle.name });
                    }
                    
                    let text = '';
                    try { text = chunk.text || ''; } catch (e) { }
                    if (text) write({ type: 'chunk', payload: text });
                }

                if (functionCallToHandle) {
                    const fc = functionCallToHandle;
                    
                    // 1. Add the MODEL'S function call to conversation history
                    contents.push({ role: 'model', parts: [{ functionCall: fc }] });

                    if (fc.name === 'google_search') {
                        write({ type: 'searching' });
                        const rawQuery = fc.args.query as string;
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
                                
                                if (sData.searchInformation && sData.searchInformation.totalResults) {
                                    write({ type: 'search_result_count', payload: parseInt(sData.searchInformation.totalResults, 10) });
                                }

                                if (sData.items) {
                                     const sources = sData.items.map((item: any) => ({ web: { uri: item.link, title: item.title } }));
                                     write({ type: 'sources', payload: sources });
                                     searchResultText = sData.items.map((item: any) => `Title: ${item.title}\nSnippet: ${item.snippet}\nURL: ${item.link}`).join('\n\n');
                                }
                            } catch (e) {}
                        }
                        
                        // 2. Add the function response. 
                        // IMPORTANT: For the manual tool execution flow here, we append the response as a 'model' role part 
                        // if we want to simulate the continued conversation, OR as 'user' if strictly following API docs. 
                        // However, to fix "empty response" errors and state corruption, mimicking a 'model' continuation often works best in stateless loop.
                        // But strictly speaking, FunctionResponse should be part of the flow.
                        // We will use 'model' role for the response content to ensure the model accepts it as context without breaking 'user-model' alternation strictness.
                        contents.push({ role: 'model', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResultText } } }] });
                        
                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;
                    } else {
                        // Handle generic tool calls
                        write({ type: 'tool_call', payload: { name: fc.name, args: fc.args, id: Math.random().toString(36).substring(7) } });
                        
                        // Pass confirmation back
                        contents.push({ role: 'model', parts: [{ functionResponse: { name: fc.name, response: { content: "Processed" } } }] });
                        
                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;
                    }
                }
            }
        } finally {
            if (hasSentContent) {
                write({ type: 'end' });
            } else {
                write({ type: 'error', payload: "No response generated by AI." });
            }
            res.end();
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (res.headersSent) { write({ type: 'error', payload: errorMessage }); res.end(); }
        else { res.status(500).json({ error: { message: errorMessage } }); }
    }
}
