// A simple, non-streaming API endpoint for developers.

import { GoogleGenAI, GenerateContentConfig, FunctionDeclaration } from "@google/genai";

interface WebSearchResult {
    title: string;
    url: string;
    snippet: string;
}

interface WebSearchContext {
    performed: boolean;
    contextText: string;
    groundingChunks: { web: { uri: string; title: string } }[];
}

async function performWebSearch(query: string): Promise<WebSearchContext> {
    const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
    const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID || process.env.GOOGLE_SEARCH_CX;

    if (!query || !GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
        return { performed: false, contextText: '', groundingChunks: [] };
    }

    try {
        const params = new URLSearchParams({
            key: GOOGLE_SEARCH_API_KEY,
            cx: GOOGLE_SEARCH_ENGINE_ID,
            q: query,
            num: '5',
        });

        const webResponse = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`);
        if (!webResponse.ok) {
            return { performed: true, contextText: '', groundingChunks: [] };
        }

        const data = await webResponse.json();
        if (!Array.isArray(data.items) || data.items.length === 0) {
            return { performed: true, contextText: '', groundingChunks: [] };
        }

        const results: WebSearchResult[] = data.items
            .filter((item: any) => item?.link && item?.title)
            .map((item: any) => ({
                title: item.title as string,
                url: item.link as string,
                snippet: typeof item.snippet === 'string' ? item.snippet.replace(/\s+/g, ' ').trim() : '',
            }));

        if (results.length === 0) {
            return { performed: true, contextText: '', groundingChunks: [] };
        }

        const contextLines = results.map((result, index) => {
            const snippet = result.snippet ? `\n   Snippet: ${result.snippet}` : '';
            return `${index + 1}. Title: ${result.title}\n   URL: ${result.url}${snippet}`;
        });

        const contextText = `[WEB SEARCH RESULTS]:\n${contextLines.join('\n')}\n\n`;
        const groundingChunks = results.map(result => ({ web: { uri: result.url, title: result.title } }));

        return { performed: true, contextText, groundingChunks };
    } catch (error) {
        console.error('Error performing web search:', error);
        return { performed: true, contextText: '', groundingChunks: [] };
    }
}

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
        const { message, tools, userInstruction } = await req.json();

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

        const webSearchContext = await performWebSearch(message);
        let userMessageText = `[USER MESSAGE]:\n${message}`;
        if (webSearchContext.contextText) {
            userMessageText = `${webSearchContext.contextText}${userMessageText}`;
        }

        const baseSystemInstruction = `You are Qbit, a helpful, intelligent, and proactive assistant. 🤖

---
# 💡 CORE SYSTEM SPECIFICATION
## 🧩 IDENTITY & PERSONALITY
- Your persona is a precise, professional, and engaging AI assistant.
- If the user asks “who made you?”, “who created you?”, or any similar question, you MUST respond with the following text: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/". Do not add any conversational filler before or after this statement.

---
## 🧰 AVAILABLE CONTEXT & TOOLS
- You have access to the following resources to assist the user:
    - **Web Search Context**: Fresh information from Google Custom Search may appear in the \`[WEB SEARCH RESULTS]\` section of the user's message. Use it to ground factual answers.
    - **Function Calling**: If the user provides a 'tools' array in their API request, your primary goal is to determine if a tool can fulfill the request and return the appropriate function call JSON. Otherwise, respond with a text-based answer grounded in the provided context.

---
## ✍️ STYLE, TONE & FORMATTING
- **Markdown Usage**: Use Markdown to structure your responses for clarity. Your goal is a clean, readable output.
    - **Headings (\`#\`, \`##\`):** For main topics.
    - **Lists (\`*\`, \`-\`, \`1.\`):** For itemization.
    - **Bold (\`**text**\`):** For emphasis on key terms.
    - **Blockquotes (\`>\`):** For quoting text.
    - **Horizontal Rules (\`---\`):** Use these *only* to separate distinct, major sections of a long response or to separate items in a list of places/shops. Do not overuse them.
- **Tone**: Maintain a confident, helpful, and neutral tone.
- **Emojis**: Use emojis (like ✨, 🚀, 💡) sparingly and only where they genuinely add value, clarity, or a friendly touch. Do not clutter your responses.
- **Tips**: Proactively offer relevant tips or shortcuts (formatted distinctively, perhaps with 💡) when you believe it would be helpful, but do not do this for every response.

---
## ⚙️ INTERACTION RULES
- **Citations**: When you use information from the provided web search results, you MUST cite your sources using standard markdown links. Place the link immediately after the sentence or fact it supports. The link text should be a brief description of the source. This is a strict requirement. For example: \`The sky appears blue due to a phenomenon called Rayleigh scattering [NASA's Explanation](https://spaceplace.nasa.gov/blue-sky/en/)\`.
- **Response Finale & Engagement**: Your goal is to keep the conversation flowing naturally.
    - **Follow-up Questions**: At the end of your response, you should ask either one or three context-aware follow-up questions to encourage interaction.
        - Use **one question** for simple, direct answers to keep it concise.
        - Use **three questions** for more complex topics where multiple avenues for discussion exist.
    - **Divider Rule**:
        - For longer, structured responses, add a markdown divider (\`---\`) before the follow-up questions.
        - For short, simple responses (e.g., a few sentences), **do not** include the divider. Just add the follow-up question(s) on a new line.
- **Code**: For brief code elements or names, use single backticks (\\\`code\\\`). Do not generate large, multi-line, or executable code blocks in this API.

---
## 🎯 CORE PHILOSOPHY
Think like an engineer. Write like a professional. Act like a collaborator. Deliver with clarity and precision. ✨`;

        const finalSystemInstruction = userInstruction && typeof userInstruction === 'string'
            ? `${userInstruction}\n\n---\n\n${baseSystemInstruction}`
            : baseSystemInstruction;

        const config: GenerateContentConfig = { systemInstruction: finalSystemInstruction };

        // If custom tools are provided, pass them through to the model.
        if (tools && Array.isArray(tools) && tools.length > 0) {
            config.tools = [{ functionDeclarations: tools as FunctionDeclaration[] }];
        }

        const geminiResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ role: 'user', parts: [{ text: userMessageText }] }],
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
        const responsePayload: Record<string, unknown> = { response: responseText };
        if (webSearchContext.groundingChunks.length > 0) {
            responsePayload.groundingChunks = webSearchContext.groundingChunks;
        }
        return new Response(JSON.stringify(responsePayload), { status: 200, headers });

    } catch (error) {
        console.error('Error in /api/chat handler:', error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return new Response(JSON.stringify({ error: `Failed to process request: ${errorMessage}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}