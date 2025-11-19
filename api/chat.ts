// A simple, non-streaming API endpoint for developers.
// It uses the built-in Google Search grounding tool by default, but also supports custom tools.

import { GoogleGenAI, GenerateContentConfig, FunctionDeclaration, Content, Type } from "@google/genai";

// Vercel Edge Function config
export const config = {
  runtime: 'edge',
};

const languageMap: { [key: string]: string } = {
    en: 'English',
    el: 'Greek',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
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
        const { message, tools, userInstruction, imageSearchQuery, language } = await req.json();

        const headers = { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        };

        // Image search branch
        if (typeof imageSearchQuery === 'string' && imageSearchQuery.trim().length > 0) {
            const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
            const cseId = process.env.GOOGLE_CSE_ID;

            if (!apiKey || !cseId) {
                console.warn("Google Search is not configured.");
                return new Response(JSON.stringify({ error: 'Image search is not configured on the server.' }), { status: 500, headers });
            }
            
            const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(imageSearchQuery)}&searchType=image&num=3`;

            const searchResponse = await fetch(url);
            if (!searchResponse.ok) {
                const errorData = await searchResponse.json();
                console.error("Google Image Search API error:", errorData.error.message);
                return new Response(JSON.stringify({ error: 'Failed to fetch images.' }), { status: searchResponse.status, headers });
            }

            const data = await searchResponse.json();
            const imageUrls = data.items ? data.items.map((item: any) => item.link) : [];
            return new Response(JSON.stringify({ images: imageUrls }), { status: 200, headers });
        }


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

        const userLanguageName = languageMap[language as string] || 'English';

        const baseSystemInstruction = `You are Qbit, a helpful, intelligent, and proactive assistant. 🤖

---
# 💡 CORE SYSTEM SPECIFICATION
## 🧩 IDENTITY & PERSONALITY
- Your persona is a precise, professional, and engaging AI assistant.
- If the user asks “who made you?”, “who created you?”, or any similar question, you MUST respond with the following text: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/". Do not add any conversational filler before or after this statement.
- **Language**: Your entire response MUST be in **${userLanguageName}**.

---
## 🧰 AVAILABLE TOOLS
- You have access to the following tools to assist the user:
    - **Google Search**: For real-time information, news, and facts.
    - **Function Calling**: If the user provides a 'tools' array in their API request, your primary goal is to determine if a tool can fulfill the request and return the appropriate function call JSON. Otherwise, respond with a text-based answer using Google Search if needed.

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
- **Citations**: When you use information from Google Search, you MUST cite your sources using standard markdown links. Place the link immediately after the sentence or fact it supports. The link text should be a brief description of the source. This is a strict requirement. For example: \`The sky appears blue due to a phenomenon called Rayleigh scattering [NASA's Explanation](https://spaceplace.nasa.gov/blue-sky/en/)\`.
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

        let finalTools: FunctionDeclaration[];
        if (tools && Array.isArray(tools) && tools.length > 0) {
            finalTools = tools as FunctionDeclaration[];
        } else {
            finalTools = [googleSearchTool];
        }
        config.tools = [{ functionDeclarations: finalTools }];
        
        const model = "gemini-2.5-flash";
        const contents: Content[] = [{ role: 'user', parts: [{ text: message }] }];

        const firstResponse = await ai.models.generateContent({ model, contents, config });
        const functionCalls = firstResponse.functionCalls;

        if (functionCalls && functionCalls.length > 0) {
            // If user provided custom tools, just return the function call for them to handle.
            if (tools && Array.isArray(tools) && tools.length > 0) {
                return new Response(JSON.stringify({ functionCalls }), { status: 200, headers });
            }

            // Otherwise, it's our default google_search tool that we need to handle.
            const functionCall = functionCalls[0];
            if (functionCall.name === 'google_search') {
                const query = functionCall.args.query;
                if (typeof query !== 'string') {
                    throw new Error(`Invalid query from function call: expected a string for 'query', but got ${typeof query}`);
                }

                const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
                const cseId = process.env.GOOGLE_CSE_ID;

                if (!apiKey || !cseId) {
                    throw new Error("Google Custom Search API Key (GOOGLE_API_KEY) or CSE ID (GOOGLE_CSE_ID) is not configured.");
                }

                const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=5`;
                const searchResponse = await fetch(searchUrl);

                if (!searchResponse.ok) {
                    const errorBody = await searchResponse.text();
                    throw new Error(`Google Search API failed with status ${searchResponse.status}: ${errorBody}`);
                }
                const searchResults = await searchResponse.json();

                const searchContextTranslations: { [lang: string]: string } = {
                    en: 'Here are the search results for "{query}":\n\n{results}',
                    el: 'Αυτά είναι τα αποτελέσματα αναζήτησης για "{query}":\n\n{results}',
                    es: 'Aquí están los resultados de búsqueda para "{query}":\n\n{results}',
                    fr: 'Voici les résultats de recherche pour "{query}":\n\n{results}',
                    de: 'Hier sind die Suchergebnisse für "{query}":\n\n{results}',
                };
                const langCode = (language as string) || 'en';

                const formattedResults = searchResults.items?.map((item: any) => 
                    `Title: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}`
                ).join('\n\n---\n\n') || "No results found.";

                const searchContextTemplate = searchContextTranslations[langCode] || searchContextTranslations.en;
                const searchContext = searchContextTemplate
                    .replace('{query}', query)
                    .replace('{results}', formattedResults);
                
                const newContents: Content[] = [
                    ...contents,
                    { role: 'model', parts: [{ functionCall }] },
                    { role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchContext } } }] },
                ];

                const secondResponse = await ai.models.generateContent({ model, contents: newContents, config });
                const responseText = secondResponse.text;
                return new Response(JSON.stringify({ response: responseText }), { status: 200, headers });
            } else {
                 // A different tool was called, but the user didn't provide it. Return it anyway.
                return new Response(JSON.stringify({ functionCalls }), { status: 200, headers });
            }
        }
        
        // Otherwise, return the text response from the first call.
        const responseText = firstResponse.text;
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
