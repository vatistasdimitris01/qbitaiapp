

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { performance } from 'perf_hooks';
import { GoogleGenAI, Tool, Type, Part, Content, GenerateContentResponse } from "@google/genai";
import type { GroundingChunk } from '../types';

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

interface AIResponse {
    text: string;
    groundingChunks?: GroundingChunk[];
    downloadableFiles?: { name: string; content: string }[];
    thinkingText?: string;
    duration?: number;
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
}

const parseResponse = (response: GenerateContentResponse): Omit<AIResponse, 'downloadableFiles' | 'groundingChunks' | 'duration' | 'usageMetadata'> => {
    let rawText = response.text ?? "";
    let thinkingText: string | undefined = undefined;

    const thinkingMatch = rawText.match(/<thinking>([\s\S]*?)<\/thinking>/);
    if (thinkingMatch && thinkingMatch[1]) {
        thinkingText = thinkingMatch[1].trim();
        rawText = rawText.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
    }
    
    return {
        text: rawText,
        thinkingText,
    };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const startTime = performance.now();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    if (!process.env.API_KEY) {
        return res.status(500).json({ error: 'API_KEY environment variable not set.' });
    }

    try {
        const { history, message, attachments, personaInstruction, location, language } = req.body as {
            history: ApiMessage[],
            message: string, // Note: message and attachments are from the most recent user turn
            attachments?: ApiAttachment[],
            personaInstruction?: string,
            location?: LocationInfo | null,
            language?: string
        };

        let finalSystemInstruction = personaInstruction
            ? `${defaultSystemInstruction}\n\n---\n\n**Persona Instructions:**\n${personaInstruction}`
            : defaultSystemInstruction;

        if (language) {
            const languageMap: { [key: string]: string } = {
                'en': 'English',
                'el': 'Greek (Ελληνικά)',
            };
            const fullLanguageName = languageMap[language] || language;
            finalSystemInstruction += `\n\n**IMPORTANT:** The user is communicating in ${fullLanguageName}. You MUST respond in ${fullLanguageName}.`;
        }

        // Manually construct the conversation history in the format Gemini expects.
        const contents: Content[] = [];
        for (const msg of history) {
            const parts: Part[] = [];
            // Add location context to the latest user message
            if (msg.author === 'user' && msg === history[history.length - 1] && location) {
                 parts.push({ text: `Context: User is in ${location.city}, ${location.country}.\n\nUser message: ${msg.text}` });
            } else {
                 parts.push({ text: msg.text });
            }

            if (msg.attachments) {
                for (const file of msg.attachments) {
                    parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
                }
            }
            contents.push({
                role: msg.author === 'user' ? 'user' : 'model',
                parts: parts,
            });
        }
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        let downloadableFiles: { name: string, content: string }[] | undefined;
        let finalResponse: GenerateContentResponse | undefined;

        for (let i = 0; i < 5; i++) {
            // FIX: The 'tools' and 'systemInstruction' properties must be placed inside a 'config' object.
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents,
                config: {
                    tools,
                    systemInstruction: finalSystemInstruction,
                },
            });

            finalResponse = response;
            const functionCalls = response.candidates?.[0]?.content?.parts.filter(part => !!part.functionCall) || [];

            if (functionCalls.length === 0) {
                break; // No more function calls, we have the final response.
            }

            // Add the model's tool-calling request to the history
            contents.push(response.candidates![0].content);
            const call = functionCalls[0].functionCall!;
            let toolResponsePart: Part | null = null;
            
            if (call.name === 'create_files' && call.args) {
                const { files } = call.args as { files: { filename: string, content: string }[] };
                const createdFilenames = files.map(f => f.filename);
                toolResponsePart = {
                    functionResponse: {
                        name: 'create_files',
                        response: { files_created: createdFilenames.map(filename => ({ filename, status: "SUCCESS" })) }
                    }
                };
                downloadableFiles = files.map(f => ({
                    name: f.filename,
                    content: Buffer.from(f.content).toString('base64')
                }));
            } else if (call.name === 'web_search' && call.args) {
                 const { query } = call.args as { query: string };
                if (!process.env.GOOGLE_SEARCH_API_KEY || !process.env.GOOGLE_SEARCH_ENGINE_ID) {
                    toolResponsePart = { functionResponse: { name: 'web_search', response: { summary: "The web_search tool is not configured on the server." } } };
                } else {
                    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
                    try {
                        const searchRes = await fetch(searchUrl);
                        if (!searchRes.ok) throw new Error(`Google Search API responded with status ${searchRes.status}`);
                        const searchData = await searchRes.json();
                        let summary = searchData.items?.map((item: any) => `Title: ${item.title}\nSnippet: ${item.snippet}`).join('\n\n') || "No relevant information found.";
                         if (language) {
                            const languageMap: { [key: string]: string } = { 'en': 'English', 'el': 'Greek (Ελληνικά)' };
                            const fullLanguageName = languageMap[language] || language;
                            summary += `\n\n---\n**IMPORTANT REMINDER:** Based on these search results, formulate your final answer to the user strictly in ${fullLanguageName}.`;
                        }
                        toolResponsePart = { functionResponse: { name: 'web_search', response: { summary } } };
                    } catch (searchError: any) {
                        console.error("Error during Google Custom Search:", searchError);
                        toolResponsePart = { functionResponse: { name: 'web_search', response: { summary: "There was an error performing the web search." } } };
                    }
                }
            }
            
            if (toolResponsePart) {
                contents.push({ role: 'tool', parts: [toolResponsePart] });
            } else {
                break;
            }
        }
        
        if (!finalResponse) {
            throw new Error("Failed to get a final response from the AI model.");
        }

        const parsed = parseResponse(finalResponse);
        const usageMetadata = finalResponse.usageMetadata;
        const endTime = performance.now();
        const duration = endTime - startTime;

        if (downloadableFiles && downloadableFiles.length > 0) {
            const fileNames = downloadableFiles.map(f => `\`${f.name}\``).join(', ');
            const confirmationText = downloadableFiles.length > 1
                ? `I've created the files ${fileNames} for you. You can download them below.`
                : `I've created the file ${fileNames} for you. You can download it below.`;

            // ALWAYS override the model's text response with our own standard confirmation
            // when files are created. This ensures a consistent, safe message is displayed
            // and prevents potentially malformed model output from breaking the UI.
            parsed.text = confirmationText;
        }


        return res.status(200).json({ ...parsed, downloadableFiles, duration, usageMetadata });

    } catch (error: any) {
        console.error("Error in sendMessage API:", error);
        res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}
