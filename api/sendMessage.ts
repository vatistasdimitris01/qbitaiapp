// FIX: Implemented the missing sendMessage API endpoint.
// This Vercel Edge Function streams responses from the Google GenAI API.

import { GoogleGenAI, Content } from "@google/genai";

// Vercel Edge Function config
export const config = {
  runtime: 'edge',
};

// Type definitions to match what the frontend sends
interface HistoryItem {
    author: 'user' | 'ai';
    text: string;
}

interface ApiAttachment {
    mimeType: string;
    data: string; // base64 encoded
}

// The main handler for the API route
export default async function handler(req: Request) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { history, message, attachments, personaInstruction } = await req.json();

        // As per guidelines, the API key MUST be from process.env.API_KEY
        // Ensure API_KEY is set in your Vercel environment variables
        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable is not set.");
        }
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        // Convert the conversation history from the client to the format required by the Gemini API.
        const geminiHistory: Content[] = (history as HistoryItem[]).map(msg => ({
            role: msg.author === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
        }));

        // Prepare the parts for the user's current message, including any text and attachments.
        const userMessageParts: any[] = [{ text: message }];
        if (attachments && (attachments as ApiAttachment[]).length > 0) {
            for (const attachment of attachments as ApiAttachment[]) {
                userMessageParts.push({
                    inlineData: {
                        mimeType: attachment.mimeType,
                        data: attachment.data,
                    },
                });
            }
        }
        
        // Combine history with the new user message to form the full conversation context.
        const contents: Content[] = [
            ...geminiHistory,
            {
                role: 'user',
                parts: userMessageParts,
            }
        ];

        // Per guidelines, use gemini-2.5-flash
        const model = 'gemini-2.5-flash';

        // Set up the streaming response to send data back to the client as it's generated.
        const responseStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                
                const write = (data: object) => {
                    controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
                };

                try {
                    const stream = await ai.models.generateContentStream({
                        model: model,
                        contents: contents,
                        config: {
                            systemInstruction: personaInstruction,
                        },
                    });

                    let usageMetadataSent = false;

                    for await (const chunk of stream) {
                        const text = chunk.text;
                        if (text) {
                            write({ type: 'chunk', payload: text });
                        }

                        // Usage metadata is often available at the end. We send it once.
                        if (chunk.usageMetadata && !usageMetadataSent) {
                             write({ type: 'usage', payload: chunk.usageMetadata });
                             usageMetadataSent = true;
                        }
                        
                        const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
                        if (groundingMetadata?.groundingChunks?.length) {
                           write({ type: 'grounding', payload: groundingMetadata.groundingChunks });
                        }
                    }
                    
                    write({ type: 'end' });
                    controller.close();
                } catch (error) {
                    console.error("Error during Gemini stream processing:", error);
                    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
                    write({ type: 'error', payload: errorMessage });
                    controller.close();
                }
            },
        });

        return new Response(responseStream, {
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'X-Content-Type-Options': 'nosniff',
             },
        });

    } catch (error) {
        console.error('Error in sendMessage handler:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: `Failed to process request: ${errorMessage}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
