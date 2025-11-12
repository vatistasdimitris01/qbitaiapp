import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Content, Part, FunctionDeclaration, GenerateContentConfig, Type } from "@google/genai";
import formidable from 'formidable';
import fs from 'fs';

interface ApiAttachment {
    mimeType: string;
    data: string; // base66 encoded
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
        
        const userMessageParts: Part[] = [{ text: message }];
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

## 2. WEB SEARCH & CONTEXT

- **Tool Use**: You have access to a \`google_search\` tool. Use it by returning a function call when the user's query requires up-to-the-minute information, details about recent events, or specifics about people, companies, or places for which you lack sufficient knowledge. For general knowledge, historical facts, or creative tasks, rely on your internal knowledge first.
- **Search Results**: After you call the \`google_search\` tool, you will be provided with the search results. You MUST base your final answer on the information provided in these results.
- **Citations**: When you use information from the search results, you MUST cite your sources. The search results will include a URL for each snippet. Cite using standard markdown links like \`[Title](url)\` immediately after the sentence or fact it supports. This is a strict requirement.

# 🎨 RESPONSE FORMATTING & STYLE

## 1. MARKDOWN USAGE

- Use Markdown for structure: headings, lists, bold, italics.
- Use horizontal rules (\`---\`) sparingly to separate major sections.
- **Lists of Places**: When you generate a list of places (e.g., restaurants, landmarks, points of interest), you MUST follow this structure for each item:
  - A heading for the place name (e.g., \`### 1. Place Name\`).
  - A line with key details like rating or type in bold (e.g., \`**★ 4.7 • Fine dining restaurant**\`).
  - An image gallery tag. The format is \`!gallery["A descriptive image search query for the place"]\`. For example, for 'Oiko Restaurant' in Athens, you would write \`!gallery["Oiko Restaurant Athens fine dining"]\`. You MUST do this for at least the first 3 items in any list of places.
  - A bulleted list of details (e.g., Location, Why it's good, Tip).

## 2. ENGAGEMENT

- Your goal is to provide a complete answer.
- Ask 1-3 relevant follow-up questions for exploratory topics, complex explanations, or open-ended questions to keep the conversation going. Place them at the very end of your response.
`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n---\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
        const googleSearchTool: FunctionDeclaration = {
            name: 'google_search',
            description: 'Get information from the web using Google Search. Use this for current events, news, or for topics you do not have sufficient internal knowledge about.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                  query: {
                    type: Type.STRING,
                    description: 'The search query.',
                  },
                },
                required: ['query'],
            },
        };

        const config: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            tools: [{ functionDeclarations: [googleSearchTool] }],
        };

        try {
            const firstResponse = await ai.models.generateContent({ model, contents, config });
            const functionCalls = firstResponse.functionCalls;

            if (functionCalls && functionCalls.length > 0) {
                const functionCall = functionCalls[0];
                if (functionCall.name !== 'google_search') {
                    throw new Error(`Unsupported function call: ${functionCall.name}`);
                }

                write({ type: 'searching' });
                const query = functionCall.args.query;
                
                if (typeof query !== 'string') {
                    throw new Error(`Invalid query from function call: expected a string for 'query', but got ${typeof query}`);
                }
                
                const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
                const cseId = process.env.GOOGLE_CSE_ID;

                if (!apiKey || !cseId) {
                    throw new Error("Server configuration error: Google Custom Search API Key (GOOGLE_API_KEY) or CSE ID (GOOGLE_CSE_ID) is not set. Please configure environment variables.");
                }

                const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=5`;
                const searchResponse = await fetch(searchUrl);

                if (!searchResponse.ok) {
                    const errorBody = await searchResponse.text();
                    throw new Error(`Google Search API failed with status ${searchResponse.status}. Please check your API key, CSE ID, or Google Cloud project setup. Details: ${errorBody}`);
                }
                const searchResults = await searchResponse.json();
                
                if (searchResults.items && searchResults.items.length > 0) {
                    const groundingChunks = searchResults.items.map((item: any) => ({
                        web: {
                            uri: item.link,
                            title: item.title,
                        },
                    }));
                    write({ type: 'sources', payload: groundingChunks });
                }

                const formattedResults = searchResults.items?.map((item: any) => 
                    `Title: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}`
                ).join('\n\n---\n\n') || "No results found.";

                const searchContext = `Here are the search results for "${query}":\n\n${formattedResults}`;
                
                const newContents: Content[] = [
                    ...contents,
                    { role: 'model', parts: [{ functionCall }] },
                    { role: 'user', parts: [{ functionResponse: { name: 'google_search', response: { content: searchContext } } }] },
                ];
                
                const stream = await ai.models.generateContentStream({ model, contents: newContents, config });
                let usageMetadataSent = false;
                for await (const chunk of stream) {
                    const text = chunk.text;
                    if (text) write({ type: 'chunk', payload: text });
                    if (chunk.usageMetadata && !usageMetadataSent) {
                        write({ type: 'usage', payload: chunk.usageMetadata });
                        usageMetadataSent = true;
                    }
                }
            } else {
                const text = firstResponse.text;
                if (text) write({ type: 'chunk', payload: text });
                if (firstResponse.usageMetadata) write({ type: 'usage', payload: firstResponse.usageMetadata });
            }
            
            write({ type: 'end' });
            res.end();

        } catch (error) {
            console.error("Error during Gemini API call:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
            if (!res.headersSent) res.status(500).json({ error: `API call failed: ${errorMessage}` });
            else res.end();
        }

    } catch (error) {
        console.error('Error in sendMessage handler:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!res.headersSent) res.status(500).json({ error: `Failed to process request: ${errorMessage}` });
        else res.end();
    }
}