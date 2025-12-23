
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

        // 1. Gather API keys for rotation
        const apiKeys: string[] = [];
        const primary = process.env.API_KEY || "";
        primary.split(',').forEach(k => {
            const t = k.trim();
            if (t && !apiKeys.includes(t)) apiKeys.push(t);
        });

        for (let i = 2; i <= 10; i++) {
            const val = (process.env as any)[`API_KEY_${i}`];
            if (val) {
                val.split(',').forEach((k: string) => {
                    const t = k.trim();
                    if (t && !apiKeys.includes(t)) apiKeys.push(t);
                });
            }
        }

        if (apiKeys.length === 0) throw new Error("No API keys found.");

        // 2. Prepare History with part preservation
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
                
                if (content && content.includes('<thinking>')) {
                    const rawParts = content.split(/<\/?thinking>/g);
                    rawParts.forEach((p, i) => {
                        if (i % 2 === 1) {
                             parts.push({ thought: p.trim() } as any);
                        } else if (p.trim()) {
                             parts.push({ text: p.trim() });
                        }
                    });
                } else if (content) {
                    parts.push({ text: content });
                }

                if (msg.toolCalls) {
                    msg.toolCalls.forEach((tc: any) => parts.push({ functionCall: { name: tc.name, args: tc.args } }));
                }
                
                if (parts.length > 0) {
                    geminiHistory.push({ role: 'model', parts });
                    if (msg.toolCalls) {
                        msg.toolCalls.forEach((tc: any) => {
                            geminiHistory.push({ 
                                role: 'function', 
                                parts: [{ functionResponse: { name: tc.name, response: { content: "Complete" } } }] 
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
        const modelName = 'gemini-2.5-flash-lite';
        
        const locationStr = location ? `User location: ${location.city}, ${location.country}. ` : '';
        const systemInstruction = `${personaInstruction || ''}
You are Qbit, a world-class AI assistant. 
Current Date: ${new Date().toLocaleDateString()}.
${locationStr}

MANDATORY TOOL USAGE RULES:
1. You MUST use the 'google_search' tool for any query involving real-time information, including but not limited to: weather, news, sports scores, current events, stock prices, or any information post-dating your knowledge cutoff.
2. If a user asks about the weather, ALWAYS call 'google_search' with a query like "weather in [City]".
3. Do NOT apologize for not having real-time data; simply use the 'google_search' tool to find it.
4. Your internal knowledge is for general reasoning and historical data. For anything current, use the tool.
5. Use your internal thinking process (<thinking> tags) to plan your search.`;

        const genConfig: GenerateContentConfig = {
            systemInstruction,
            tools: [{ 
                functionDeclarations: [{ 
                    name: 'google_search', 
                    description: 'Searches the live web for real-time data such as weather, news, stock prices, sports scores, and current events.', 
                    parameters: { 
                        type: Type.OBJECT, 
                        properties: { 
                            query: { 
                                type: Type.STRING,
                                description: 'The search query to find up-to-date information.'
                            } 
                        }, 
                        required: ['query'] 
                    } 
                }] 
            }],
        };

        const stream = new ReadableStream({
            async start(controller) {
                const enqueue = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

                let currentKeyIndex = 0;
                let attemptSuccess = false;

                while (!attemptSuccess && currentKeyIndex < apiKeys.length) {
                    const activeKey = apiKeys[currentKeyIndex];
                    const ai = new GoogleGenAI({ apiKey: activeKey });
                    
                    try {
                        let currentStream = await ai.models.generateContentStream({ model: modelName, contents, config: genConfig });
                        let turnLoop = true;

                        while (turnLoop) {
                            turnLoop = false;
                            let activeFC: any = null;
                            const turnPartsCaptured: Part[] = [];

                            for await (const chunk of currentStream) {
                                if (chunk.text) enqueue({ type: 'chunk', payload: chunk.text });

                                const candidates = chunk.candidates;
                                if (candidates?.[0]?.content?.parts) {
                                    for (const part of candidates[0].content.parts) {
                                        turnPartsCaptured.push(part);

                                        if ('thought' in part && (part as any).thought) {
                                            enqueue({ type: 'chunk', payload: `<thinking>\n${(part as any).thought}\n</thinking>` });
                                        }
                                        if ('text' in part && part.text && !chunk.text) {
                                            enqueue({ type: 'chunk', payload: part.text });
                                        }
                                        if ('functionCall' in part && part.functionCall) {
                                            activeFC = part.functionCall;
                                        }
                                    }
                                }
                            }

                            if (activeFC) {
                                const fc = activeFC;
                                if (fc.name === 'google_search') {
                                    enqueue({ type: 'searching' });
                                    const cseId = process.env.GOOGLE_CSE_ID;
                                    let searchResult = "Search currently unavailable.";

                                    if (activeKey && cseId) {
                                        try {
                                            const resS = await fetch(`https://www.googleapis.com/customsearch/v1?key=${activeKey}&cx=${cseId}&q=${encodeURIComponent(fc.args.query)}&num=10`);
                                            const sJson = await resS.json();
                                            if (sJson.items) {
                                                const sourceChunks = sJson.items.map((i: any) => ({ web: { uri: i.link, title: i.title } }));
                                                enqueue({ type: 'sources', payload: sourceChunks });
                                                enqueue({ type: 'search_result_count', payload: parseInt(sJson.searchInformation?.totalResults || "0", 10) });
                                                searchResult = sJson.items.map((i: any) => `Source: ${i.title}\nURL: ${i.link}\nInfo: ${i.snippet}`).join('\n\n');
                                            } else {
                                                searchResult = "No relevant search results were found for this query.";
                                            }
                                        } catch (e) {
                                            searchResult = "An error occurred while attempting to search the web.";
                                        }
                                    }
                                    
                                    contents.push({ role: 'model', parts: turnPartsCaptured });
                                    contents.push({ role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResult } } }] });
                                    
                                    currentStream = await ai.models.generateContentStream({ model: modelName, contents, config: genConfig });
                                    turnLoop = true;
                                } else {
                                    enqueue({ type: 'tool_call', payload: { name: fc.name, args: fc.args, id: fc.id } });
                                    contents.push({ role: 'model', parts: turnPartsCaptured });
                                    contents.push({ role: 'function', parts: [{ functionResponse: { name: fc.name, response: { content: "Complete" } } }] });
                                    currentStream = await ai.models.generateContentStream({ model: modelName, contents, config: genConfig });
                                    turnLoop = true;
                                }
                            }
                        }
                        enqueue({ type: 'end' });
                        attemptSuccess = true;
                    } catch (err: any) {
                        const errorMsg = String(err.message || err).toLowerCase();
                        const isRetryable = errorMsg.includes("429") || 
                                           errorMsg.includes("too many requests") || 
                                           errorMsg.includes("resource_exhausted") || 
                                           errorMsg.includes("quota");

                        if (isRetryable && currentKeyIndex < apiKeys.length - 1) {
                            currentKeyIndex++;
                            continue;
                        }
                        
                        enqueue({ type: 'error', payload: err.message || "An unexpected error occurred during message generation." });
                        attemptSuccess = true;
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
