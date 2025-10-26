// A simple, non-streaming API endpoint for developers.
// It uses the built-in Google Search grounding tool.

import { GoogleGenAI } from "@google/genai";

// Vercel Edge Function config
export const config = {
  runtime: 'edge',
};

// The main handler for the API route
export default async function handler(req: Request) {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
        });
    }
    
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { message } = await req.json();

        if (typeof message !== 'string' || message.trim().length === 0) {
            return new Response(JSON.stringify({ error: 'Message is required and must be a non-empty string.' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            });
        }
        
        // As per guidelines, the API key MUST be from process.env.API_KEY
        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable is not set.");
        }
        
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        const geminiResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: message }] }],
            config: {
                tools: [{googleSearch: {}}],
                systemInstruction: "You are a helpful AI assistant. You have access to Google Search for real-time information. Please provide concise and accurate answers. Format your responses using Markdown."
            },
        });
        
        const responseText = geminiResponse.text;
        
        return new Response(JSON.stringify({ response: responseText }), {
            status: 200,
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
        });

    } catch (error) {
        console.error('Error in /api/chat handler:', error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return new Response(JSON.stringify({ error: `Failed to process request: ${errorMessage}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}
