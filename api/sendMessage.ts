
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
        const model = 'gemini-flash-lite-latest';
        const langCode = (language as string) || 'en';
        const userLanguageName = languageMap[langCode] || 'English';
        
        const locationContext = location ? `[USER LOCATION: ${location.city}, ${location.country}]. You have full permission to use this location to make your answers more relevant, personalized, and helpful. Feel free to proactively provide info about weather, local time, or nearby interests if it adds value to the conversation.` : 'Location data is currently unavailable.';

        const baseSystemInstruction = `You are Qbit, an intelligent AI assistant.
${locationContext}

Guidelines:
1. Language: Always respond in ${userLanguageName}.
2. Continuity: You are in a continuous conversation. Refer back to previous messages when helpful.
3. Proactive Location: Use the user's location naturally to provide local insights (weather, events, places) whenever it feels appropriate.
4. Search: If you need up-to-date or specific external facts, use the google_search tool.
5. Suggestions: Provide a few helpful follow-up queries using <suggestions>["Option A", "Option B"]</suggestions> at the end of your response.`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
        const googleSearchTool: FunctionDeclaration = {
            name: 'google_search',
            description: 'Perform a web search for real-time info.',
            parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] },
        };

        const config: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            tools: [{ functionDeclarations: [googleSearchTool] }],
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
                                const q = location ? `${query} in ${location.city}` : query;
                                const searchResponse = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(q)}&num=10`);
                                const searchResults = await searchResponse.json();
                                if (searchResults.items) {
                                     const sources = searchResults.items.map((item: any) => ({ web: { uri: item.link, title: item.title } }));
                                     write({ type: 'sources', payload: sources });
                                     searchResultText = searchResults.items.map((item: any) => `Title: ${item.title}\nURL: ${item.link}`).join('\n');
                                }
                            } catch (e) { }
                        }
                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResultText } } }] });
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
        if (!res.headersSent) res.status(500).json({ error: { message: errorMessage } });
        else { write({ type: 'error', payload: errorMessage }); res.end(); }
    }
}
