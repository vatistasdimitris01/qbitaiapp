import type { VercelRequest, VercelResponse } from '@vercel/node';
// FIX: Removed non-exported 'Role' type from import.
import { GoogleGenAI, Tool, Type, Part, Content, GenerateContentResponse } from "@google/genai";

// Simplified types for the API request body
interface ApiAttachment {
  mimeType: string;
  data: string;
}
interface ApiMessage {
  author: 'user' | 'ai';
  text: string;
  attachments?: ApiAttachment[];
}
interface LocationInfo {
    city: string;
    country: string;
}

const getCreatorAge = (): number => {
    const birthday = new Date('2009-04-09T00:00:00Z');
    const today = new Date();
    let age = today.getUTCFullYear() - birthday.getUTCFullYear();
    const m = today.getUTCMonth() - birthday.getUTCMonth();
    if (m < 0 || (m === 0 && today.getUTCDate() < birthday.getUTCDate())) {
        age--;
    }
    return age;
};

const creatorAge = getCreatorAge();
const defaultSystemInstruction = `You are qbit, a helpful AI assistant. You should use all your available tools to best respond to the user's request.
If the user asks who made you, you must answer with the following exact text:
"I was created by Dimitris Vatistas, a ${creatorAge}-year-old developer. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/"
Do not mention his birthday or the year he was born.
For every response, first write out your thought process in a <thinking>...</thinking> XML block, then write the final answer for the user. The thought process should briefly explain your reasoning for the answer. For the specific question about who made you, your thought should be simple, like "The user is asking about my creator. I will provide the standard information."`;

const tools: Tool[] = [
    {
        functionDeclarations: [
            {
                name: 'create_file',
                description: 'Creates a file with the given content and filename. Call this function when the user asks to create a file (e.g., "create a csv file with this data", "make a python script for me").',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        filename: { type: Type.STRING },
                        content: { type: Type.STRING },
                    },
                    required: ['filename', 'content'],
                },
            },
            {
                name: 'web_search',
                description: "Performs a web search to find real-time information. Use this tool if you don't know the answer or suspect your knowledge might be outdated.",
                parameters: {
                    type: Type.OBJECT,
                    properties: { query: { type: Type.STRING } },
                    required: ['query'],
                },
            },
        ],
    },
];

interface AIResponse {
    text: string;
    groundingChunks?: any[];
    downloadableFile?: { name: string; content: string };
    thinkingText?: string;
}

const parseResponse = (response: GenerateContentResponse): Omit<AIResponse, 'downloadableFile'> => {
    let rawText = response.text;
    let thinkingText: string | undefined = undefined;

    const thinkingMatch = rawText.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch && thinkingMatch[1]) {
        thinkingText = thinkingMatch[1].trim();
        rawText = rawText.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
    }
    
    return {
        text: rawText,
        thinkingText,
        groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks,
    };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    if (!process.env.API_KEY) {
        return res.status(500).json({ error: 'API_KEY environment variable not set.' });
    }

    try {
        const { history, message, attachments, personaInstruction, location } = req.body as {
            history: ApiMessage[],
            message: string,
            attachments?: ApiAttachment[],
            personaInstruction?: string,
            location?: LocationInfo | null
        };

        const finalSystemInstruction = personaInstruction
            ? `${defaultSystemInstruction}\n\n---\n\n**Persona Instructions:**\n${personaInstruction}`
            : defaultSystemInstruction;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        // Convert client history to Gemini history format, excluding the last user message which is sent separately.
        const geminiHistory: Content[] = history.slice(0, -1).map((msg: ApiMessage) => ({
            // FIX: Removed 'as Role' cast as Role type is not exported from @google/genai
            role: msg.author === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }], // Note: attachments in history are not yet handled here for simplicity
        }));
        
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: { tools, systemInstruction: finalSystemInstruction },
            history: geminiHistory,
        });

        let userMessageText = message;
        if (location) {
            userMessageText = `Context: User is in ${location.city}, ${location.country}.\n\nUser message: ${message}`;
        }
        const messageParts: Part[] = [{ text: userMessageText }];
        
        if (attachments && attachments.length > 0) {
            attachments.forEach(file => {
                messageParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
            });
        }
        
        const response = await chat.sendMessage({ message: messageParts });
        const functionCalls = response.candidates?.[0]?.content?.parts.filter(part => !!part.functionCall) || [];

        if (functionCalls.length > 0) {
            const call = functionCalls[0].functionCall!;

            if (call.name === 'create_file' && call.args) {
                const { filename, content } = call.args as { filename: string, content: string };
                const toolResponsePart: Part = { functionResponse: { name: 'create_file', response: { success: true } } };
                const finalResponse = await chat.sendMessage({ message: [toolResponsePart] });
                const parsed = parseResponse(finalResponse);
                
                return res.status(200).json({ ...parsed, downloadableFile: { name: filename, content } });
            } else if (call.name === 'web_search' && call.args) {
                const { query } = call.args as { query: string };
                const searchResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash', contents: query, config: { tools: [{ googleSearch: {} }] }
                });
                const toolResponsePart: Part = { functionResponse: { name: 'web_search', response: { summary: searchResponse.text } } };
                const finalResponse = await chat.sendMessage({ message: [toolResponsePart] });
                const parsed = parseResponse(finalResponse);
                return res.status(200).json({ ...parsed, groundingChunks: searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks });
            }
        }

        const parsed = parseResponse(response);
        return res.status(200).json(parsed);

    } catch (error: any) {
        console.error("Error in sendMessage API:", error);
        res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}