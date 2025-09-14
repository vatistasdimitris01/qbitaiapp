import { GoogleGenAI, Chat, GenerateContentResponse, Part, Tool, Type } from "@google/genai";
import { Attachment, LocationInfo } from "../types";

let ai: GoogleGenAI | null = null;

interface ChatSession {
    chat: Chat;
    instruction: string;
}
const chatSessions = new Map<string, ChatSession>();

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


const getAi = () => {
    if (!ai) {
        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable not set.");
        }
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return ai;
};

const tools: Tool[] = [
    {
        functionDeclarations: [
            {
                name: 'create_file',
                description: 'Creates a downloadable file with the given content and filename for the user. Call this function when the user asks to create a file (e.g., "create a csv file with this data", "make a python script for me").',
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        filename: {
                            type: Type.STRING,
                            description: 'The name of the file to create, including the extension (e.g., data.csv, script.py).',
                        },
                        content: {
                            type: Type.STRING,
                            description: 'The content to be written into the file.',
                        },
                    },
                    required: ['filename', 'content'],
                },
            },
            {
                name: 'web_search',
                description: "Performs a web search to find real-time information or answer questions about recent events. Use this tool if you don't know the answer or suspect your knowledge might be outdated.",
                parameters: {
                    type: Type.OBJECT,
                    properties: {
                        query: {
                            type: Type.STRING,
                            description: 'A concise and effective search query.',
                        },
                    },
                    required: ['query'],
                },
            },
        ],
    },
];


const getChatSession = (conversationId: string, systemInstruction: string) => {
    const existingSession = chatSessions.get(conversationId);

    if (existingSession && existingSession.instruction === systemInstruction) {
        return existingSession.chat;
    }

    // Instruction changed or new conversation, create a new chat session.
    // Note: This resets the conversation history for the AI model upon persona change.
    const aiInstance = getAi();
    const newChat = aiInstance.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            tools: tools,
            systemInstruction: systemInstruction,
        },
    });
    chatSessions.set(conversationId, { chat: newChat, instruction: systemInstruction });
    return newChat;
};

export const deleteChatSession = (conversationId: string) => {
    chatSessions.delete(conversationId);
};

export interface AIResponse {
    text: string;
    groundingChunks?: any[];
    downloadableFile?: { name: string; url: string };
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

export const sendMessageToAI = async (
    conversationId: string,
    message: string,
    attachments?: Omit<Attachment, 'preview' | 'name'>[],
    personaInstruction?: string,
    location?: LocationInfo | null
): Promise<AIResponse> => {
    const finalSystemInstruction = personaInstruction
        ? `${defaultSystemInstruction}\n\n---\n\n**Persona Instructions:**\n${personaInstruction}`
        : defaultSystemInstruction;

    const chat = getChatSession(conversationId, finalSystemInstruction);

    try {
        let userMessageText = message;
        if (location) {
            userMessageText = `Context: User is in ${location.city}, ${location.country}.\n\nUser message: ${message}`;
        }
        const messageParts: Part[] = [{ text: userMessageText }];
        
        if (attachments && attachments.length > 0) {
            attachments.forEach(file => {
                messageParts.push({
                    inlineData: {
                        mimeType: file.mimeType,
                        data: file.data
                    }
                });
            });
        }
        
        const response: GenerateContentResponse = await chat.sendMessage({
            message: messageParts,
        });

        const functionCalls = response.candidates?.[0]?.content?.parts.filter(part => !!part.functionCall) || [];

        if (functionCalls.length > 0) {
            const call = functionCalls[0].functionCall!;

            if (call.name === 'create_file' && call.args) {
                const { filename, content } = call.args as { filename: string, content: string };
                
                const blob = new Blob([content], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const downloadableFile = { name: filename, url };

                const toolResponsePart: Part = {
                    functionResponse: {
                        name: 'create_file',
                        response: {
                            success: true,
                            message: `File "${filename}" created successfully. Inform the user that they can download it now.`,
                        },
                    },
                };

                const finalResponse = await chat.sendMessage({ message: [toolResponsePart] });
                const parsed = parseResponse(finalResponse);
                
                return {
                    ...parsed,
                    downloadableFile: downloadableFile,
                };
            } else if (call.name === 'web_search' && call.args) {
                const { query } = call.args as { query: string };
                
                const aiInstance = getAi();
                const searchResponse = await aiInstance.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: query,
                    config: {
                        tools: [{ googleSearch: {} }],
                    },
                });

                const searchResultText = searchResponse.text;
                const searchChunks = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
                
                const toolResponsePart: Part = {
                    functionResponse: {
                        name: 'web_search',
                        response: {
                            summary: searchResultText,
                        },
                    },
                };

                const finalResponse = await chat.sendMessage({ message: [toolResponsePart] });
                const parsed = parseResponse(finalResponse);

                return {
                    ...parsed,
                    groundingChunks: searchChunks, // Prioritize grounding chunks from the direct search call
                };
            }
        }

        const parsed = parseResponse(response);
        return parsed;
    } catch (error) {
        console.error("Error sending message to AI:", error);
        return { text: "Sorry, I encountered an error. Please try again." };
    }
};