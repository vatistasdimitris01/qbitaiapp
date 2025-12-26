
import { GoogleGenAI, GenerateContentConfig, Content } from "@google/genai";

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

export default async function handler(req: Request) {
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
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    try {
        const { message, tools, userInstruction, imageSearchQuery, language } = await req.json();
        const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

        // Handle image search separately if requested
        if (typeof imageSearchQuery === 'string' && imageSearchQuery.trim().length > 0) {
            const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
            const cseId = process.env.GOOGLE_CSE_ID;
            if (!apiKey || !cseId) return new Response(JSON.stringify({ error: 'Search config missing' }), { status: 500, headers });
            
            const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(imageSearchQuery)}&searchType=image&num=5`);
            const data = await res.json();
            return new Response(JSON.stringify({ images: data.items ? data.items.map((i: any) => i.link) : [] }), { status: 200, headers });
        }

        if (!process.env.API_KEY) throw new Error("API_KEY not set.");
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        const userLanguageName = languageMap[language as string] || 'English';

        const systemInstruction = userInstruction 
            ? `${userInstruction}\n\nRespond in ${userLanguageName}. Use clean Markdown.`
            : `You are KIPP (Kosmic Intelligence Pattern Perceptron). Respond in ${userLanguageName}. Be helpful, concise, and precise. Use Markdown.`;

        const config: GenerateContentConfig = { 
            systemInstruction,
            tools: [{ googleSearch: {} }]
        };
        
        const model = "gemini-3-flash-preview";
        const contents: Content[] = [{ role: 'user', parts: [{ text: message }] }];

        const result = await ai.models.generateContent({ model, contents, config });
        
        return new Response(JSON.stringify({ 
            response: result.text,
            groundingChunks: result.candidates?.[0]?.groundingMetadata?.groundingChunks || []
        }), { status: 200, headers });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
}
