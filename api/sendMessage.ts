
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Content, Part, FunctionDeclaration, GenerateContentConfig, Type, FunctionCall } from "@google/genai";
import formidable from 'formidable';
import fs from 'fs';

interface ApiAttachment {
    mimeType: string;
    data: string;
}

interface HistoryItem {
    type: 'USER' | 'AI_RESPONSE' | 'SYSTEM' | 'ERROR' | 'AGENT_ACTION' | 'AGENT_PLAN';
    content: string;
    files?: ApiAttachment[];
    toolCalls?: any[];
}

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
        if (!payloadJSON) throw new Error("Missing payload.");
        const { history, message, personaInstruction, location, language } = JSON.parse(payloadJSON);
        
        const fileList = files.file ? (Array.isArray(files.file) ? files.file : [files.file]) : [];

        if (!process.env.API_KEY) throw new Error("API_KEY not set.");
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        const geminiHistory: Content[] = [];
        for (const msg of (history as HistoryItem[])) {
            if (msg.type === 'USER') {
                const parts: Part[] = [];
                if (msg.content) parts.push({ text: msg.content });
                if (msg.files) {
                    msg.files.forEach(f => parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } }));
                }
                geminiHistory.push({ role: 'user', parts });
            } else if (msg.type === 'AI_RESPONSE') {
                const parts: Part[] = [];
                // Filter out the "Output contains no text" placeholder from history
                const content = msg.content === "[Output contains no text]" ? "" : msg.content;
                if (content) parts.push({ text: content });
                if (msg.toolCalls) {
                    msg.toolCalls.forEach(tc => parts.push({ functionCall: { name: tc.name, args: tc.args } }));
                }
                if (parts.length > 0) {
                    geminiHistory.push({ role: 'model', parts });
                    if (msg.toolCalls) {
                        msg.toolCalls.forEach(tc => {
                            geminiHistory.push({ 
                                role: 'function', 
                                parts: [{ functionResponse: { name: tc.name, response: { content: "Handled" } } }] 
                            });
                        });
                    }
                }
            }
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
        
        const contents: Content[] = [...geminiHistory, { role: 'user', parts: userMessageParts }];
        const modelName = 'gemini-3-flash-preview';
        
        const locationStr = location ? `User location: ${location.city}, ${location.country}. ` : '';
        const baseSystemInstruction = `You are Qbit, a world-class AI assistant.
- User Location: ${locationStr}
- Web Search: You MUST use the 'google_search' tool for real-time information, news, current events, or when explicitly asked to search.
- Reasoning: Use your internal thinking process to plan complex answers.
- Response: Be helpful, accurate, and concise.`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
        const genConfig: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            tools: [{ 
                functionDeclarations: [
                    { 
                        name: 'google_search', 
                        description: 'Search the web using Google Search. Use this for current events, news, or general knowledge validation.', 
                        parameters: { 
                            type: Type.OBJECT, 
                            properties: { 
                                query: { type: Type.STRING, description: 'The search query.' } 
                            }, 
                            required: ['query'] 
                        } 
                    }
                ] 
            }],
        };

        try {
            let currentStream = await ai.models.generateContentStream({ model: modelName, contents, config: genConfig });
            let keepGoing = true;

            while (keepGoing) {
                keepGoing = false;
                let functionCallToHandle: FunctionCall | null = null;
                
                for await (const chunk of currentStream) {
                    // 1. Check for standard text via chunk.text (extracted by SDK)
                    const text = chunk.text;
                    if (text) {
                        write({ type: 'chunk', payload: text });
                    }

                    // 2. Iterate candidates/parts to catch thinking and other data
                    const candidates = chunk.candidates;
                    if (candidates && candidates.length > 0) {
                        const parts = candidates[0].content?.parts;
                        if (parts) {
                            for (const part of parts) {
                                // Explicitly handle reasoning part (thought)
                                if ('thought' in part && (part as any).thought) {
                                    write({ type: 'chunk', payload: `<thinking>\n${(part as any).thought}\n</thinking>` });
                                }
                                // If chunk.text failed but there's a text part, send it
                                if ('text' in part && part.text && !text) {
                                    write({ type: 'chunk', payload: part.text });
                                }
                                // Check for tool calls
                                if ('functionCall' in part && part.functionCall) {
                                    functionCallToHandle = part.functionCall;
                                }
                            }
                        }
                    }
                }

                if (functionCallToHandle) {
                    const fc = functionCallToHandle;
                    if (fc.name === 'google_search') {
                        write({ type: 'searching' });
                        const query = fc.args.query as string;
                        const apiKey = process.env.API_KEY;
                        const cseId = process.env.GOOGLE_CSE_ID;
                        
                        console.log(`[Qbit] Performing Google Search: "${query}"`);

                        let searchResultText = "Search results unavailable.";
                        if (apiKey && cseId) {
                            try {
                                const resS = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=10`);
                                const sJson = await resS.json();
                                if (sJson.items) {
                                    const chunks = sJson.items.map((i: any) => ({ web: { uri: i.link, title: i.title } }));
                                    write({ type: 'sources', payload: chunks });
                                    write({ type: 'search_result_count', payload: parseInt(sJson.searchInformation?.totalResults || "0", 10) });
                                    searchResultText = sJson.items.map((i: any) => `Title: ${i.title}\nURL: ${i.link}\nSnippet: ${i.snippet}`).join('\n\n');
                                } else {
                                    searchResultText = "No results found for this query.";
                                }
                            } catch (e) {
                                console.error("[Qbit] Search Error:", e);
                                searchResultText = "Search failed due to a network or configuration error.";
                            }
                        } else {
                            console.error("[Qbit] Missing Google Search credentials.");
                        }
                        
                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResultText } } }] });
                        
                        currentStream = await ai.models.generateContentStream({ model: modelName, contents, config: genConfig });
                        keepGoing = true;
                    } else {
                        // Handle other generic tool calls if any
                        write({ type: 'tool_call', payload: { name: fc.name, args: fc.args, id: fc.id } });
                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: fc.name, response: { content: "Success" } } }] });
                        currentStream = await ai.models.generateContentStream({ model: modelName, contents, config: genConfig });
                        keepGoing = true;
                    }
                }
            }
        } finally {
            write({ type: 'end' });
            res.end();
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("[Qbit] API Error:", msg);
        if (!res.headersSent) {
            res.status(500).json({ error: { message: msg } });
        } else {
            write({ type: 'error', payload: msg });
            res.end();
        }
    }
}
