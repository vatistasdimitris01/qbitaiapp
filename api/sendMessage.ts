
import { GoogleGenAI, Content, Part, GenerateContentConfig, Type } from "@google/genai";

export const config = {
  runtime: 'edge',
};

const encoder = new TextEncoder();

export default async function handler(req: Request) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
    }

    try {
        const formData = await req.formData();
        const payloadJSON = formData.get('payload') as string;
        if (!payloadJSON) throw new Error("Missing payload.");
        
        const { history, message, personaInstruction, location } = JSON.parse(payloadJSON);
        const uploadedFiles = formData.getAll('file') as File[];

        // Collect all potential API keys from environment
        const apiKeys: string[] = [];
        
        // 1. Check primary API_KEY (can be comma-separated)
        if (process.env.API_KEY) {
            process.env.API_KEY.split(',').forEach(k => {
                const trimmed = k.trim();
                if (trimmed && !apiKeys.includes(trimmed)) apiKeys.push(trimmed);
            });
        }
        
        // 2. Check for indexed keys (API_KEY_2, API_KEY_3, ...)
        for (let i = 2; i <= 10; i++) {
            const keyName = `API_KEY_${i}`;
            const val = (process.env as any)[keyName];
            if (val) {
                val.split(',').forEach((k: string) => {
                    const trimmed = k.trim();
                    if (trimmed && !apiKeys.includes(trimmed)) apiKeys.push(trimmed);
                });
            }
        }

        if (apiKeys.length === 0) throw new Error("No API keys found in environment.");

        const geminiHistory: Content[] = [];
        for (const msg of history) {
            if (msg.type === 'USER') {
                const parts: Part[] = [];
                if (msg.content) parts.push({ text: msg.content });
                if (msg.files) {
                    msg.files.forEach((f: any) => parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } }));
                }
                geminiHistory.push({ role: 'user', parts });
            } else if (msg.type === 'AI_RESPONSE') {
                const parts: Part[] = [];
                const content = msg.content === "[Output contains no text]" ? "" : msg.content;
                if (content) parts.push({ text: content });
                if (msg.toolCalls) {
                    msg.toolCalls.forEach((tc: any) => parts.push({ functionCall: { name: tc.name, args: tc.args } }));
                }
                if (parts.length > 0) {
                    geminiHistory.push({ role: 'model', parts });
                    if (msg.toolCalls) {
                        msg.toolCalls.forEach((tc: any) => {
                            geminiHistory.push({ 
                                role: 'function', 
                                parts: [{ functionResponse: { name: tc.name, response: { content: "Success" } } }] 
                            });
                        });
                    }
                }
            }
        }

        const userParts: Part[] = [{ text: message }];
        for (const file of uploadedFiles) {
            const buffer = await file.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            userParts.push({ inlineData: { mimeType: file.type || 'application/octet-stream', data: base64 } });
        }

        const contents: Content[] = [...geminiHistory, { role: 'user', parts: userParts }];
        const modelName = 'gemini-3-flash-preview';
        
        const locationStr = location ? `User location: ${location.city}, ${location.country}. ` : '';
        const systemInstruction = `${personaInstruction || ''}\nYou are Qbit, a world-class AI assistant.\nLocation: ${locationStr}\nWeb Search: ALWAYS use 'google_search' for real-time info. Reasoning: Use your internal thinking process.`;

        const genConfig: GenerateContentConfig = {
            systemInstruction,
            tools: [{ 
                functionDeclarations: [{ 
                    name: 'google_search', 
                    description: 'Search the web for current information.', 
                    parameters: { 
                        type: Type.OBJECT, 
                        properties: { query: { type: Type.STRING } }, 
                        required: ['query'] 
                    } 
                }] 
            }],
        };

        const stream = new ReadableStream({
            async start(controller) {
                const enqueue = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

                let currentKeyIndex = 0;
                let success = false;

                while (!success && currentKeyIndex < apiKeys.length) {
                    const activeKey = apiKeys[currentKeyIndex];
                    const ai = new GoogleGenAI({ apiKey: activeKey });
                    
                    try {
                        let currentStream = await ai.models.generateContentStream({ model: modelName, contents, config: genConfig });
                        let keepGoing = true;

                        while (keepGoing) {
                            keepGoing = false;
                            let functionCallToHandle: any = null;

                            for await (const chunk of currentStream) {
                                if (chunk.text) {
                                    enqueue({ type: 'chunk', payload: chunk.text });
                                }

                                const candidates = chunk.candidates;
                                if (candidates && candidates.length > 0) {
                                    const parts = candidates[0].content?.parts;
                                    if (parts) {
                                        for (const part of parts) {
                                            if ('thought' in part && (part as any).thought) {
                                                enqueue({ type: 'chunk', payload: `<thinking>\n${(part as any).thought}\n</thinking>` });
                                            }
                                            if ('text' in part && part.text && !chunk.text) {
                                                enqueue({ type: 'chunk', payload: part.text });
                                            }
                                            if ('functionCall' in part && part.functionCall) {
                                                functionCallToHandle = part.functionCall;
                                            }
                                        }
                                    }
                                }
                            }

                            if (functionCallToHandle) {
                                const fc = functionCallToHandle;
                                if (fc.name === 'google_search') {
                                    enqueue({ type: 'searching' });
                                    const query = fc.args.query as string;
                                    const cseId = process.env.GOOGLE_CSE_ID;

                                    let searchResultText = "Search unavailable.";
                                    if (activeKey && cseId) {
                                        try {
                                            // Using activeKey for the search tool as well
                                            const resS = await fetch(`https://www.googleapis.com/customsearch/v1?key=${activeKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=10`);
                                            const sJson = await resS.json();
                                            if (sJson.items) {
                                                const chunks = sJson.items.map((i: any) => ({ web: { uri: i.link, title: i.title } }));
                                                enqueue({ type: 'sources', payload: chunks });
                                                enqueue({ type: 'search_result_count', payload: parseInt(sJson.searchInformation?.totalResults || "0", 10) });
                                                searchResultText = sJson.items.map((i: any) => `Title: ${i.title}\nURL: ${i.link}\nSnippet: ${i.snippet}`).join('\n\n');
                                            } else {
                                                searchResultText = "No results found.";
                                            }
                                        } catch (e) {
                                            searchResultText = "Search error.";
                                        }
                                    }
                                    
                                    contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                                    contents.push({ role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResultText } } }] });
                                    
                                    currentStream = await ai.models.generateContentStream({ model: modelName, contents, config: genConfig });
                                    keepGoing = true;
                                } else {
                                    enqueue({ type: 'tool_call', payload: { name: fc.name, args: fc.args, id: fc.id } });
                                    contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                                    contents.push({ role: 'function', parts: [{ functionResponse: { name: fc.name, response: { content: "Complete" } } }] });
                                    currentStream = await ai.models.generateContentStream({ model: modelName, contents, config: genConfig });
                                    keepGoing = true;
                                }
                            }
                        }
                        enqueue({ type: 'end' });
                        success = true;
                    } catch (err: any) {
                        const errorStr = String(err.message || err);
                        const isRateLimit = errorStr.includes("429") || 
                                           errorStr.includes("Too Many Requests") || 
                                           errorStr.includes("RESOURCE_EXHAUSTED") ||
                                           errorStr.includes("quota");

                        if (isRateLimit) {
                            currentKeyIndex++;
                            if (currentKeyIndex < apiKeys.length) {
                                // Transparently retry with next key
                                continue;
                            }
                        }
                        
                        // If we're here, either it's not a rate limit error or we ran out of keys
                        enqueue({ type: 'error', payload: err.message || "An unexpected error occurred." });
                        success = true;
                    }
                }
                controller.close();
            }
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'X-Content-Type-Options': 'nosniff',
            },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
}
