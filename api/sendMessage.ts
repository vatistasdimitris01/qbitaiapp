
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
                         parts.push({ functionResponse: { name: tc.name, response: { content: "Handled" } } }); 
                     });
                }
                return { role: msg.type === 'USER' ? 'user' : 'model', parts: parts } as Content;
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
        const modelName = 'gemini-3-flash-preview';
        
        const locationStr = location ? `User location: ${location.city}, ${location.country}. ` : '';
        const baseSystemInstruction = `You are Qbit, an AI assistant.
- Location: ${locationStr}
- Web search: Use 'google_search'.
- Python: Use 'python_execution'.`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
        const genConfig: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            tools: [{ 
                functionDeclarations: [
                    { name: 'google_search', description: 'Search the web for up-to-date info.', parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] } }
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
                    if (chunk.candidates?.[0]?.finishReason === 'SAFETY') {
                        write({ type: 'error', payload: 'Blocked by safety filters.' });
                    }

                    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                        functionCallToHandle = chunk.functionCalls[0];
                    }
                    
                    const text = chunk.text || '';
                    if (text) {
                        write({ type: 'chunk', payload: text });
                    }
                }

                if (functionCallToHandle) {
                    const fc = functionCallToHandle;
                    if (fc.name === 'google_search') {
                        write({ type: 'searching' });
                        const query = fc.args.query as string;
                        const apiKey = process.env.API_KEY;
                        const cseId = process.env.GOOGLE_CSE_ID;
                        
                        let searchResultText = "Search unavailable.";
                        if (apiKey && cseId) {
                            try {
                                const resS = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=10`);
                                const sJson = await resS.json();
                                if (sJson.items) {
                                    const chunks = sJson.items.map((i: any) => ({ web: { uri: i.link, title: i.title } }));
                                    write({ type: 'sources', payload: chunks });
                                    searchResultText = sJson.items.map((i: any) => `Title: ${i.title}\nSnippet: ${i.snippet}`).join('\n\n');
                                }
                            } catch (e) {}
                        }
                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResultText } } }] });
                        currentStream = await ai.models.generateContentStream({ model: modelName, contents, config: genConfig });
                        keepGoing = true;
                    } else {
                        write({ type: 'tool_call', payload: { name: fc.name, args: fc.args, id: fc.id } });
                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: fc.name, response: { content: "Complete" } } }] });
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
        if (res.headersSent) { 
            write({ type: 'error', payload: msg }); 
            res.end(); 
        } else {
            res.status(500).json({ error: { message: msg } });
        }
    }
}
