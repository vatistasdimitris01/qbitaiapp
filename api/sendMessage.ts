
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

        // Correctly obtain API key exclusively from process.env.API_KEY
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
        // Using gemini-3-flash-preview as recommended for general text tasks as per guidelines
        const model = 'gemini-3-flash-preview';
        const langCode = (language as string) || 'en';
        
        const locationStr = location ? `Current User Location: ${location.city}, ${location.country} (Lat: ${location.latitude}, Lon: ${location.longitude}).` : 'Location unknown.';

        const baseSystemInstruction = `You are Qbit, an AI assistant.
- User Context: ${locationStr}
- Web access: Use 'google_search'.
- Stock info: Use 'render_stock_widget'.`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
        const config: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            tools: [{ 
                functionDeclarations: [
                    { name: 'google_search', description: 'Web search', parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] } },
                    { name: 'render_stock_widget', description: 'Stock info', parameters: { type: Type.OBJECT, properties: { symbol: { type: Type.STRING }, price: { type: Type.STRING }, change: { type: Type.STRING }, chartData: { type: Type.OBJECT } }, required: ['symbol', 'price', 'change', 'chartData'] } }
                ] 
            }],
        };

        try {
            let currentStream = await ai.models.generateContentStream({ model, contents, config });
            let keepGoing = true;
            let totalChunks = 0;
            // Declare functionCallToHandle outside the while loop to resolve the scope error on line 173
            let functionCallToHandle: FunctionCall | null = null;

            while (keepGoing) {
                keepGoing = false;
                functionCallToHandle = null;
                
                for await (const chunk of currentStream) {
                    if (chunk.candidates?.[0]?.finishReason) {
                        const reason = chunk.candidates[0].finishReason;
                        if (reason === 'MAX_TOKENS') write({ type: 'error', payload: 'Token limit reached.' });
                        if (reason === 'SAFETY') write({ type: 'error', payload: 'Response blocked by safety filters.' });
                    }

                    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                        functionCallToHandle = chunk.functionCalls[0];
                    }
                    
                    const text = chunk.text || '';
                    if (text) {
                        totalChunks++;
                        write({ type: 'chunk', payload: text });
                    }
                    if (chunk.usageMetadata) write({ type: 'usage', payload: chunk.usageMetadata });
                }

                if (functionCallToHandle) {
                    const fc = functionCallToHandle;
                    if (fc.name === 'google_search') {
                        write({ type: 'searching' });
                        const query = fc.args.query as string;
                        // Correctly obtain API key exclusively from process.env.API_KEY
                        const apiKey = process.env.API_KEY;
                        const cseId = process.env.GOOGLE_CSE_ID;
                        
                        let searchResultText = "Search failed.";
                        if (apiKey && cseId) {
                            const resS = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=10`);
                            const sJson = await resS.json();
                            if (sJson.items) {
                                const chunks = sJson.items.map((i: any) => ({ web: { uri: i.link, title: i.title } }));
                                write({ type: 'sources', payload: chunks });
                                if (sJson.searchInformation?.totalResults) write({ type: 'search_result_count', payload: parseInt(sJson.searchInformation.totalResults, 10) });
                                searchResultText = sJson.items.map((i: any) => `Title: ${i.title}\nSnippet: ${i.snippet}`).join('\n\n');
                            }
                        }
                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResultText } } }] });
                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;
                    } else {
                        write({ type: 'tool_call', payload: { name: fc.name, args: fc.args, id: Math.random().toString(36) } });
                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: fc.name, response: { content: "Done" } } }] });
                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;
                    }
                }
            }
            if (totalChunks === 0 && !functionCallToHandle) {
                write({ type: 'error', payload: 'API returned an empty response. This might be due to a token limit or restricted content.' });
            }
        } finally {
            write({ type: 'end' });
            res.end();
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (res.headersSent) { write({ type: 'error', payload: msg }); res.end(); }
        else res.status(500).json({ error: { message: msg } });
    }
}
