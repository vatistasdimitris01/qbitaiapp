import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Content, Part } from "@google/genai";
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
}

interface LocationInfo {
    city: string;
    country: string;
    latitude?: number;
    longitude?: number;
}

interface SearchResultItem {
    title: string;
    link: string;
    snippet: string;
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

const performWebSearch = async (query: string): Promise<string> => {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;

    if (!apiKey || !cseId) {
        console.warn("Google Search is not configured. Missing GOOGLE_API_KEY or GOOGLE_CSE_ID.");
        return "";
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Google Search API error:", errorData.error.message);
            return ""; // Fail gracefully
        }
        const data = await response.json();
        if (!data.items || data.items.length === 0) {
            return "";
        }
        const searchResults = data.items.slice(0, 5) as SearchResultItem[];
        return searchResults.map((item, index) => 
            `[${index + 1}] Title: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}`
        ).join('\n\n');

    } catch (error) {
        console.error("Failed to perform web search:", error);
        return "";
    }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

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
            .map(msg => ({
                role: msg.type === 'USER' ? 'user' : 'model',
                parts: [
                    ...(msg.content ? [{ text: msg.content }] : []),
                    ...(msg.files ? msg.files.map(file => ({ inlineData: { mimeType: file.mimeType, data: file.data } })) : [])
                ] as Part[],
            })).filter(c => c.parts.length > 0);
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const write = (data: object) => res.write(JSON.stringify(data) + '\n');
        
        write({ type: 'searching' });
        const searchContext = await performWebSearch(message);
        
        let userMessageText = message;
        if (searchContext) {
            userMessageText = `## Web Search Results:\n${searchContext}\n\n---\n\n## User Query:\n${message}`;
        }
        
        if (location?.city && location?.country) {
            userMessageText = `[User's Location: ${location.city}, ${location.country}]\n\n${userMessageText}`;
        }

        const userMessageParts: Part[] = [{ text: userMessageText }];
        if (fileList.length > 0) {
            for (const file of fileList) {
                const base64Data = (await fs.promises.readFile(file.filepath)).toString('base64');
                userMessageParts.push({ inlineData: { mimeType: file.mimetype || 'application/octet-stream', data: base64Data } });
            }
        }
        
        const contents: Content[] = [...geminiHistory, { role: 'user', parts: userMessageParts }];
        const model = 'gemini-2.5-flash';
        const userLanguageName = languageMap[language as string] || 'English';
        
        const baseSystemInstruction = `You are Qbit, a helpful, intelligent, and proactive AI assistant. Your responses must be professional, clear, and structured with Markdown.

# ⚜️ CORE DIRECTIVES

## 1. IDENTITY & LANGUAGE
- **Your Name**: Qbit.
- **Your Creator**: If asked "who made you?", you MUST reply ONLY with: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/".
- **Language**: Your entire response MUST be in **${userLanguageName}**.

## 2. WEB SEARCH & CITATIONS
- **Context**: You will receive web search results at the beginning of the prompt to provide context for answering the user's question.
- **Synthesize**: Your primary role is to synthesize the information from these search results into a coherent, comprehensive, and accurate answer.
- **Citation Requirement**: This is critical. You MUST cite your sources. After a sentence or paragraph that uses information from a source, add a Markdown link to it. For example: \`This is a fact from a source [Title of Source](https://example.com/source)\`.
- **Adherence**: Base your answers strictly on the provided search results. Do not invent facts. If the information is not in the provided context, state that you couldn't find the answer in the search results.

# 🎨 RESPONSE FORMATTING & STYLE

## 1. MARKDOWN USAGE
- Use Markdown for structure: headings, lists, bold, italics.
- Use horizontal rules (\`---\`) sparingly to separate major sections.

## 2. ENGAGEMENT
- Your goal is to provide a complete answer.
- Ask 1-3 relevant follow-up questions for exploratory topics, complex explanations, or open-ended questions to keep the conversation going. Place them at the very end of your response.
`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n---\n\n${baseSystemInstruction}` : baseSystemInstruction;

        try {
            const stream = await ai.models.generateContentStream({ 
                model, 
                contents, 
                config: { 
                    systemInstruction: finalSystemInstruction,
                } 
            });

            let usageMetadataSent = false;
            
            for await (const chunk of stream) {
                let text = '';
                if (chunk.candidates?.[0]?.content?.parts) {
                    for (const part of chunk.candidates[0].content.parts) {
                        if (part?.text) {
                            text += part.text;
                        }
                    }
                }

                if (text) {
                    write({ type: 'chunk', payload: text });
                }
                
                if (chunk.usageMetadata && !usageMetadataSent) {
                    write({ type: 'usage', payload: chunk.usageMetadata });
                    usageMetadataSent = true;
                }
            }
            write({ type: 'end' });
            res.end();
        } catch (error) {
            console.error("Error during Gemini stream processing:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
            if (!res.headersSent) res.status(500).json({ error: `Stream generation failed: ${errorMessage}` });
            else res.end();
        }

    } catch (error) {
        console.error('Error in sendMessage handler:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!res.headersSent) res.status(500).json({ error: `Failed to process request: ${errorMessage}` });
        else res.end();
    }
}