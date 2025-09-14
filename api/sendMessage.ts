import type { VercelRequest, VercelResponse } from '@vercel/node';
import { performance } from 'perf_hooks';
// FIX: Removed non-exported 'Role' type from import.
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

const defaultSystemInstruction = `You are qbit, a large language model. You are not ChatGPT. Your model name is qbit.
Knowledge cutoff: 2024-06
Current date: ${currentDate}

If the user asks who made you, you must answer with the following exact text:
"I was created by Dimitris Vatistas, a ${creatorAge}-year-old developer. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/"
Do not mention his birthday or the year he was born.

For every response, first write out your thought process in a <thinking>...</thinking> XML block, then write the final answer for the user. The thought process should briefly explain your reasoning for the answer. For the specific question about who made you, your thought should be simple, like "The user is asking about my creator. I will provide the standard information."
`;

const tools: Tool[] = [
    {
        functionDeclarations: [
            {
                name: 'create_files',
                description: 'Creates one or more files with the given content and filenames. Call this function when the user asks to create any kind of file (e.g., code, documents, spreadsheets). You can create multiple files at once. If the user asks for a ZIP archive, use this function to create the individual files and inform the user that they can be downloaded separately.',
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
                                        description: 'The name of the file, including its extension (e.g., "my_script.py", "report.docx").'
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
}

const parseResponse = (response: GenerateContentResponse): Omit<AIResponse, 'downloadableFiles' | 'groundingChunks' | 'duration'> => {
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
            message: string,
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

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const geminiHistory: Content[] = history.slice(0, -1).map((msg: ApiMessage) => ({
            role: msg.author === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
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
            let toolResponsePart: Part | null = null;
            let finalResponse: GenerateContentResponse | null = null;
            let groundingChunks: GroundingChunk[] | undefined;
            let downloadableFiles: { name: string, content: string }[] | undefined;

            if (call.name === 'create_files' && call.args) {
                const { files } = call.args as { files: { filename: string, content: string }[] };
                toolResponsePart = { functionResponse: { name: 'create_files', response: { success: true, files_created: files.length } } };
                downloadableFiles = files.map(f => ({ name: f.filename, content: f.content }));
            
            } else if (call.name === 'web_search' && call.args) {
                const { query } = call.args as { query: string };
                const GOOGLE_SEARCH_API_KEY = 'AIzaSyBXIpu3bPdzi_5DTgnMVoZB1RUpJ3GhqeI';
                const GOOGLE_SEARCH_ENGINE_ID = '41cbe099d93374452';
                
                const searchTranslations = {
                    en: {
                        webSearchResults: 'Here are the top web search results:',
                        noResultsFound: 'No relevant results found.'
                    },
                    el: {
                        webSearchResults: 'Αυτά είναι τα κορυφαία αποτελέσματα αναζήτησης στον ιστό:',
                        noResultsFound: 'Δεν βρέθηκαν σχετικά αποτελέσματα.'
                    }
                };
                const langKey = (language === 'el' ? 'el' : 'en');


                if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
                    toolResponsePart = { functionResponse: { name: 'web_search', response: { summary: "Web search is not configured on the server." } } };
                } else {
                    let searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
                    if (language) {
                        searchUrl += `&lr=lang_${language}`;
                    }
                    try {
                        const searchRes = await fetch(searchUrl);
                        if (!searchRes.ok) throw new Error(`Google Search API responded with status ${searchRes.status}`);

                        const searchData = await searchRes.json();
                        const items = searchData.items?.slice(0, 5) || [];
                        
                        const summary = items.length > 0
                            ? searchTranslations[langKey].webSearchResults + "\n" + items.map((item: any) => `- Title: ${item.title}\n  URL: ${item.link}\n  Snippet: ${item.snippet}`).join('\n\n')
                            : searchTranslations[langKey].noResultsFound;

                        groundingChunks = items.map((item: any) => ({ web: { uri: item.link, title: item.title } }));
                        toolResponsePart = { functionResponse: { name: 'web_search', response: { summary } } };

                    } catch (searchError: any) {
                         console.error("Error calling Google Custom Search API:", searchError);
                         toolResponsePart = { functionResponse: { name: 'web_search', response: { summary: "There was an error performing the web search." } } };
                    }
                }
            }
            
            if (toolResponsePart) {
                finalResponse = await chat.sendMessage({ message: [toolResponsePart] });
                const parsed = parseResponse(finalResponse);
                const endTime = performance.now();
                const duration = endTime - startTime;
                return res.status(200).json({ ...parsed, groundingChunks, downloadableFiles, duration });
            }
        }

        const parsed = parseResponse(response);
        const endTime = performance.now();
        const duration = endTime - startTime;
        return res.status(200).json({ ...parsed, duration });

    } catch (error: any) {
        console.error("Error in sendMessage API:", error);
        res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}