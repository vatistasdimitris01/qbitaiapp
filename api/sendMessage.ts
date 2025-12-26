
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
                return { role: msg.type === 'USER' ? 'user' : 'model', parts: parts } as Content;
            })
            .filter(c => c.parts.length > 0);

        // 2. Consolidate History: Merge consecutive messages with the same role
        const consolidatedHistory: Content[] = [];
        if (rawHistory.length > 0) {
            let currentMsg = rawHistory[0];
            for (let i = 1; i < rawHistory.length; i++) {
                const nextMsg = rawHistory[i];
                if (currentMsg.role === nextMsg.role) {
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
        
        const contents: Content[] = [...consolidatedHistory, { role: 'user', parts: userMessageParts }];
        const model = 'gemini-3-flash-preview';
        const langCode = (language as string) || 'en';
        const userLanguageName = languageMap[langCode] || 'English';
        const locationStr = location ? `User's Exact Location: ${location.city}, ${location.country}.` : 'Location hidden or unknown.';

        const baseSystemInstruction = `You are KIPP (Kosmic Intelligence Pattern Perceptron).
- ${locationStr}
- Current Language: ${userLanguageName}.
- STRICT GROUNDING: Use the 'google_search' tool for all factual or real-time queries.
- SYNTHESIS: Once search results are provided via the 'tool' role, synthesize a natural response in ${userLanguageName}.
- End with <suggestions>["Query 1", "Query 2"]</suggestions>.`;

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

        const config: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            tools: [{ functionDeclarations: [googleSearchTool] }],
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
                    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                        functionCallToHandle = chunk.functionCalls[0];
                        write({ type: 'tool_call_detected', payload: functionCallToHandle.name });
                    }
                    
                    const text = chunk.text;
                    if (text) write({ type: 'chunk', payload: text });
                }

                if (functionCallToHandle) {
                    const fc = functionCallToHandle;
                    
                    // 1. MUST add the model turn with the function call to context
                    contents.push({ role: 'model', parts: [{ functionCall: fc }] });

                    if (fc.name === 'google_search') {
                        write({ type: 'searching' });
                        const rawQuery = fc.args.query as string;
                        const query = (location && !rawQuery.toLowerCase().includes(location.city.toLowerCase())) 
                            ? `${rawQuery} in ${location.city}` 
                            : rawQuery;

                        const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
                        const cseId = process.env.GOOGLE_CSE_ID;
                        
                        let searchResultText = "Search yielded no specific results.";
                        if (apiKey && cseId) {
                            try {
                                const sRes = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=10`);
                                const sData = await sRes.json();
                                
                                if (sData.searchInformation?.totalResults) {
                                    write({ type: 'search_result_count', payload: parseInt(sData.searchInformation.totalResults, 10) });
                                }

                                if (sData.items) {
                                     const sources = sData.items.map((item: any) => ({ web: { uri: item.link, title: item.title } }));
                                     write({ type: 'sources', payload: sources });
                                     searchResultText = sData.items.map((item: any) => `Title: ${item.title}\nSnippet: ${item.snippet}\nURL: ${item.link}`).join('\n\n');
                                }
                            } catch (e) { console.error("Search failed:", e); }
                        }
                        
                        // 2. Add the tool turn with the response, referencing the original call id
                        contents.push({ 
                            role: 'tool', 
                            parts: [{ 
                                functionResponse: { 
                                    name: 'google_search', 
                                    response: { content: searchResultText },
                                    id: fc.id 
                                } 
                            }] 
                        });
                        
                        // Trigger synthesis pass
                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;
                    }
                }
            }
        } finally {
            if (hasSentContent) write({ type: 'end' });
            res.end();
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (res.headersSent) { write({ type: 'error', payload: errorMessage }); res.end(); }
        else { res.status(500).json({ error: { message: errorMessage } }); }
    }
}
