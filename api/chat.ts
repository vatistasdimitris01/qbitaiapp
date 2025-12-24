import { GoogleGenAI, GenerateContentConfig, FunctionDeclaration, Content, Type } from "@google/genai";

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

        if (typeof imageSearchQuery === 'string' && imageSearchQuery.trim().length > 0) {
            const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
            const cseId = process.env.GOOGLE_CSE_ID;
            if (!apiKey || !cseId) return new Response(JSON.stringify({ error: 'Search config missing' }), { status: 500, headers });
            
            // Increased num from 3 to 5
            const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(imageSearchQuery)}&searchType=image&num=5`);
            const data = await res.json();
            return new Response(JSON.stringify({ images: data.items ? data.items.map((i: any) => i.link) : [] }), { status: 200, headers });
        }

        if (!process.env.API_KEY) throw new Error("API_KEY not set.");
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        const userLanguageName = languageMap[language as string] || 'English';

        const systemInstruction = userInstruction 
            ? `${userInstruction}\n\nRespond in ${userLanguageName}. Use clean Markdown.`
            : `You are Qbit. Respond in ${userLanguageName}. Be helpful, concise, and precise. Use Markdown.`;

        const config: GenerateContentConfig = { systemInstruction };
        const googleSearchTool: FunctionDeclaration = {
            name: 'google_search',
            description: 'Search the web.',
            parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING } }, required: ['query'] },
        };

        config.tools = [{ functionDeclarations: (tools && tools.length) ? tools : [googleSearchTool] }];
        
        const model = "gemini-flash-lite-latest";
        const contents: Content[] = [{ role: 'user', parts: [{ text: message }] }];

        const result = await ai.models.generateContent({ model, contents, config });
        
        // If tool call and it's google_search, handle it (simplistic version for this API)
        // For custom tools, return the call.
        if (result.functionCalls?.length) {
            const fc = result.functionCalls[0];
            if (tools?.length) return new Response(JSON.stringify({ functionCalls: result.functionCalls }), { status: 200, headers });
            
            if (fc.name === 'google_search') {
                 const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
                 const cseId = process.env.GOOGLE_CSE_ID;
                 const q = fc.args.query as string;
                 const sRes = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(q)}&num=5`);
                 const sData = await sRes.json();
                 const snippets = sData.items?.map((i:any) => i.snippet).join('\n') || 'No results';
                 
                 const newContents = [...contents, { role: 'model', parts: [{functionCall: fc}]}, { role: 'function', parts: [{functionResponse: {name: 'google_search', response: {content: snippets}}}]}];
                 const finalRes = await ai.models.generateContent({ model, contents: newContents as Content[], config });
                 return new Response(JSON.stringify({ response: finalRes.text }), { status: 200, headers });
            }
        }

        return new Response(JSON.stringify({ response: result.text }), { status: 200, headers });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }
}