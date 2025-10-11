
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Buffer } from 'buffer';
import { GoogleGenAI, Tool, Type, Part, Content, GenerateContentResponse, Chat } from "@google/genai";

// Vercel Function config
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
  maxDuration: 60, // Allow function to run for up to 60 seconds for streaming
};

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
const currentDate = new Date().toISOString().split('T')[0];

const defaultSystemInstruction = `You are qbit, a helpful and intelligent AI assistant.
Current date: ${currentDate}

**Your Capabilities & Tools:**
You have access to a set of tools to help you answer questions and complete tasks. You should use them whenever appropriate.

1.  **File Creation (\`create_files\`):**
    *   **CRITICAL RULE:** Any user request that involves generating code (e.g., HTML, Python, JavaScript, CSS, etc.) or any other type of document (e.g., a report, a story, a list) **MUST** be fulfilled using the \`create_files\` tool.
    *   Do **NOT** display code or document content in a markdown block inside your response. The user's intent is **always** to receive a downloadable file.
    *   For example, if the user says "create an html website for a vet", your primary action is to call \`create_files\` with a payload like \`{ "files": [{ "filename": "index.html", "content": "<!DOCTYPE html>..." }] }\`. After calling the tool, your final text response to the user should be a simple confirmation, like "I've created the HTML file for the vet website for you."
    *   If a user requests a format you can't create directly (like a PDF or DOCX), generate the content as a markdown (.md) or text (.txt) file using the tool, and inform the user you've provided a text-based version they can convert.

2.  **Web Search (\`web_search\`):**
    *   You can search the web for up-to-date information on any topic. When you use this tool, I will provide you with a summary of the search results. You should use this summary to formulate your answer.
    *   Do not mention that you are summarizing search results or that you performed a web search; just provide the answer directly to the user as if you knew the information.

**Response Format:**
For every response, you must first write out your thought process in a <thinking>...</thinking> XML block. This should explain your reasoning and which tools you plan to use. After the thinking block, write the final, user-facing answer.

**Creator Information:**
If the user asks who made you, you must answer with the following exact markdown text:
"I was created by Dimitris Vatistas, a ${creatorAge}-year-old developer. You can find him on [X](https://x.com/vatistasdim) and [Instagram](https://www.instagram.com/vatistasdimitris/)"
Do not mention his birthday or the year he was born. For this specific question, your thought should be simple, like "<thinking>The user is asking about my creator. I will provide the standard information.</thinking>"
`;

const tools: Tool[] = [
    {
        functionDeclarations: [
            {
                name: 'create_files',
                description: "Use this tool to create any kind of text-based file, especially code files (like .html, .py, .js) and documents (.md, .txt). When a user asks for code or a document, you MUST use this function to create a downloadable file for them. Do not show code in your response.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        files: {
                            type: Type.ARRAY,
                            description: 'An array of files to create.',
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    filename: { 
                                        type: Type.STRING,
                                        description: 'The name of the file, including its extension (e.g., "my_script.py", "report.md").'
                                    },
                                    content: {
                                        type: Type.STRING,
                                        description: 'The full content of the file.'
                                    },
                                },
                                required: ['filename', 'content'],
                            }
                        }
                    },
                    required: ['files'],
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

const writeStream = (res: VercelResponse, data: object) => {
    res.write(JSON.stringify(data) + '\n');
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

        res.setHeader('Content-Type', 'application/jsonl');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let finalSystemInstruction = personaInstruction
            ? `${defaultSystemInstruction}\n\n---\n\n**Persona Instructions:**\n${personaInstruction}`
            : defaultSystemInstruction;

        const historyContents: Content[] = history.map(msg => ({
            role: msg.author === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
        }));

        const currentUserParts: Part[] = [];
        if (location) {
            currentUserParts.push({ text: `Context: User is in ${location.city}, ${location.country}.\n\nUser message: ${message}` });
        } else {
            currentUserParts.push({ text: message });
        }
        if (attachments) {
            for (const file of attachments) {
                currentUserParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
            }
        }

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const chat: Chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            history: historyContents,
            config: { tools, systemInstruction: finalSystemInstruction },
        });

        let stream = await chat.sendMessageStream({ parts: currentUserParts });
        let downloadableFiles: { name: string, content: string }[] | undefined;
        let finalUsageMetadata;

        const MAX_TOOL_ROUNDS = 5;
        for (let i = 0; i < MAX_TOOL_ROUNDS; i++) {
            let functionCalls: any[] = [];
            
            for await (const chunk of stream) {
                const text = chunk.text;
                if (text) {
                    writeStream(res, { type: 'chunk', payload: text });
                }
                if (chunk.candidates?.[0]?.content?.parts) {
                    for(const part of chunk.candidates[0].content.parts) {
                        if (part.functionCall) {
                            functionCalls.push(part.functionCall);
                        }
                    }
                }
                if (chunk.usageMetadata) {
                    finalUsageMetadata = chunk.usageMetadata;
                }
            }

            if (functionCalls.length > 0) {
                const call = functionCalls[0];
                let toolResponsePart: Part | null = null;

                if (call.name === 'create_files' && call.args) {
                    const { files } = call.args as { files: { filename: string, content: string }[] };
                    toolResponsePart = { functionResponse: { name: 'create_files', response: { files_created: files.map(f => f.filename) } } };
                    downloadableFiles = files.map(f => ({ name: f.filename, content: Buffer.from(f.content).toString('base64') }));
                } else if (call.name === 'web_search' && call.args) {
                    const { query } = call.args as { query: string };
                    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
                    try {
                        const searchRes = await fetch(searchUrl);
                        if (!searchRes.ok) throw new Error(`Google Search API responded with status ${searchRes.status}`);
                        const searchData = await searchRes.json();
                        const summary = searchData.items?.map((item: any) => `Title: ${item.title}\nSnippet: ${item.snippet}`).join('\n\n') || "No relevant information found.";
                        toolResponsePart = { functionResponse: { name: 'web_search', response: { summary } } };
                    } catch (searchError: any) {
                        toolResponsePart = { functionResponse: { name: 'web_search', response: { summary: "There was an error performing the web search." } } };
                    }
                }

                if (toolResponsePart) {
                    stream = await chat.sendMessageStream({ parts: [toolResponsePart] });
                } else {
                    break;
                }
            } else {
                break; // End of conversation turn
            }
        }

        if (downloadableFiles) {
            const fileNames = downloadableFiles.map(f => `\`${f.name}\``).join(', ');
            const confirmationText = downloadableFiles.length > 1
                ? `I've created the files ${fileNames} for you. You can download them below.`
                : `I've created the file ${fileNames} for you. You can download it below.`;
            writeStream(res, { type: 'chunk', payload: confirmationText });
            writeStream(res, { type: 'files', payload: downloadableFiles });
        }
        if (finalUsageMetadata) {
            writeStream(res, { type: 'usage', payload: finalUsageMetadata });
        }

        writeStream(res, { type: 'end' });
        res.end();

    } catch (error: any) {
        console.error("Error in sendMessage API:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'An internal server error occurred.' });
        } else {
            writeStream(res, { type: 'error', payload: error.message || 'An internal server error occurred.' });
            res.end();
        }
    }
}