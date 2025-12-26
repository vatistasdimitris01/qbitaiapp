
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { 
    GoogleGenAI, 
    Content, 
    Part, 
    GenerateContentConfig, 
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

        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
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

        const baseSystemInstruction = `You are KIPP (Kosmic Intelligence Pattern Perceptron), a modern and helpful AI assistant.
- ${locationStr}
- Current Language: ${userLanguageName}.
- Always respond in ${userLanguageName}.
- USE NATIVE SEARCH: Use the built-in googleSearch tool for factual or real-time queries.
- SUGGESTIONS: Always end your response with <suggestions>["Next Question 1", "Next Question 2"]</suggestions> where the questions are relevant to the topic.
- Formatting: Use clean Markdown.`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
        const config: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            tools: [{ googleSearch: {} }],
            safetySettings: [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            ],
        };

        const stream = await ai.models.generateContentStream({ model, contents, config });
        let sentGrounding = false;

        for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
                write({ type: 'chunk', payload: text });
            }

            // Extract grounding metadata if present
            const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
            if (groundingMetadata && !sentGrounding) {
                if (groundingMetadata.groundingChunks) {
                    write({ type: 'sources', payload: groundingMetadata.groundingChunks });
                    sentGrounding = true; // Usually grounding metadata comes towards the end or in specific chunks
                }
            }
        }
        
        write({ type: 'end' });
        res.end();

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("[API Error]", error);
        if (res.headersSent) { 
            write({ type: 'error', payload: errorMessage }); 
            res.end(); 
        } else { 
            res.status(500).json({ error: { message: errorMessage } }); 
        }
    }
}
