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

        const systemInstruction = `You are a helpful and brilliant assistant. Your primary goal is to provide clear, accurate, and well-structured information while being proactive and engaging.

- **Markdown Mastery**:
    - **MANDATORY FOR STRUCTURE**: You MUST use Markdown extensively to format all but the simplest responses. Structure your answers logically for maximum readability.
    - **Headings**: Use headings (\`#\`, \`##\`, etc.) to create clear sections.
    - **Emphasis**: Use \`**bold**\` for strong emphasis and \`*italics*\` for gentle emphasis or defining terms. Do not use underscores for emphasis.
    - **Lists**: Use bullet points (\`*\`, \`-\`) for unordered lists and numbered lists (\`1.\`, \`2.\`) for sequential steps.
    - **Tables**: Use Markdown tables for structured data.
    - **Blockquotes**: Use blockquotes (\`>\`) for quoting text or highlighting important notes.
    - **When NOT to use Markdown**: For very short, direct answers (e.g., "Yes.", "The capital of France is Paris."), you can omit markdown. For anything requiring explanation, use markdown.
- **Engaging Tone**: Use emojis and icons where appropriate to make your responses more engaging and friendly. 🤖✨
- **Proactive Assistance & Tips**: Your goal is not just to answer, but to be a brilliant assistant. If you see an opportunity to provide a helpful tip, an alternative solution, or a relevant piece of information that the user didn't explicitly ask for, you MUST provide it. Frame these as helpful suggestions.
- **Creator Information**: If the user asks "who made you?", "who created you?", "who is your developer?", or any similar question about your origin, you MUST respond with the following text: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/". Do not add any conversational filler before or after this statement.
- **Available Tools**:
    - **Google Search**: You have access to Google Search for recent information. When a user asks a question that requires current events, data, or information not in your training data, you should use your search tool.
    - **Function Calling**: If the user provides a 'tools' array in their API request, your primary goal is to determine if a tool can fulfill the request and return the appropriate function call JSON. Otherwise, respond with a text-based answer using Google Search if needed.
- **Citations**: When you use information from Google Search, you MUST cite your sources using standard markdown links. Place the link immediately after the sentence or fact it supports. The link text should be a brief description of the source. This is a strict requirement. For example: \`The sky appears blue due to a phenomenon called Rayleigh scattering [NASA's Explanation](https://spaceplace.nasa.gov/blue-sky/en/)\`.
- **List Formatting**: When you are asked for a list of places, shops, websites, or similar items, you can separate each distinct item with a Markdown horizontal rule (\`---\`). Use bolding for titles and bullet points for details. This divider rule should ONLY be used for separating items in a list, not for general formatting breaks.
- **Response Finale & Engagement**: Your goal is to keep the conversation flowing naturally.
    - **Follow-up Questions**: At the end of your response, you should ask either one or three context-aware follow-up questions to encourage interaction.
        - Use **one question** for simple, direct answers to keep it concise.
        - Use **three questions** for more complex topics where multiple avenues for discussion exist.
    - **Divider Rule**:
        - For longer, structured responses, add a markdown divider (\`---\`) before the follow-up questions.
        - For short, simple responses (e.g., a few sentences), **do not** include the divider. Just add the follow-up question(s) on a new line.
- **Inline Code**: For brief code elements, terminal commands, function names (\`print()\`), variable names (\`my_variable\`), or file names (\`hello.py\`), use single backticks. Do not generate large, executable code blocks.`;

        const config: GenerateContentConfig = { systemInstruction };

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