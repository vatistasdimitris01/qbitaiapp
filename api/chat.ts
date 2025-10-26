// A simple, non-streaming API endpoint for developers.
// It uses the built-in Google Search grounding tool by default, but also supports custom tools.

import { GoogleGenAI, GenerateContentConfig, FunctionDeclaration } from "@google/genai";

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
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }

    try {
        const { message, tools } = await req.json();

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

        const config: GenerateContentConfig = {
            systemInstruction: "You are a helpful AI assistant. You have access to Google Search for real-time information. Please provide concise and accurate answers. Format your responses using Markdown. If a user provides tools, your primary goal is to determine if a tool can fulfill the user's request and return the appropriate function call.",
        };

        // If custom tools are provided, use them. Otherwise, default to Google Search.
        if (tools && Array.isArray(tools) && tools.length > 0) {
            config.tools = [{ functionDeclarations: tools as FunctionDeclaration[] }];
        } else {
            config.tools = [{ googleSearch: {} }];
        }

        const geminiResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: message }] }],
            config,
        });
        
        const functionCalls = geminiResponse.functionCalls;
        const headers = { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        };

        // If the model returns a function call, send that back.
        if (functionCalls && functionCalls.length > 0) {
            return new Response(JSON.stringify({ functionCalls }), { status: 200, headers });
        }
        
        // Otherwise, return the text response.
        const responseText = geminiResponse.text;
        return new Response(JSON.stringify({ response: responseText }), { status: 200, headers });

    } catch (error) {
        console.error('Error in /api/chat handler:', error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return new Response(JSON.stringify({ error: `Failed to process request: ${errorMessage}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}