
import { GoogleGenAI, Content, Part, GenerateContentParameters, Type } from "@google/genai";

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

        // 2. Prepare History
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
                    const regex = /<thinking>([\s\S]*?)<\/thinking>/g;
                    let lastIdx = 0;
                    let match;
                    while ((match = regex.exec(content)) !== null) {
                        if (match.index > lastIdx) {
                            parts.push({ text: content.slice(lastIdx, match.index).trim() });
                        }
                        // Use correct Part structure for thought if supported
                        parts.push({ thought: match[1].trim() } as any);
                        lastIdx = regex.lastIndex;
                    }
                    if (lastIdx < content.length) {
                        const remaining = content.slice(lastIdx).trim();
                        if (remaining) parts.push({ text: remaining });
                    }
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
        // Using gemini-3-flash-preview as recommended for general text tasks with tool calling
        const modelName = 'gemini-3-flash-preview';
        
        const locationStr = location ? `User location: ${location.city}, ${location.country}. ` : '';
        const systemInstruction = `${personaInstruction || ''}
You are Qbit, an advanced AI assistant.
Current Date: ${new Date().toLocaleDateString()}.
${locationStr}

MANDATORY PROTOCOL FOR REAL-TIME DATA:
1. For ANY query requiring up-to-date information (weather, current news, sports scores, stock prices, or events after your cutoff), you MUST use the 'google_search' tool.
2. If you are unsure of the current state of something, SEARCH.
3. When searching for weather, use a query like "current weather and forecast in [City]".
4. Do NOT say you can't check real-time info; just use the tool.
5. You may use <thinking> tags to plan, but you MUST follow with a function call if real-time info is needed.
6. Once results are retrieved, provide a comprehensive and helpful answer based ONLY on those results.`;

        const genParams: GenerateContentParameters = {
            model: modelName,
            contents,
            config: {
                systemInstruction,
                thinkingConfig: { thinkingBudget: 2000 },
                tools: [{ 
                    functionDeclarations: [{ 
                        name: 'google_search', 
                        description: 'Performs a live web search to retrieve real-time data about weather, news, events, and general facts.', 
                        parameters: { 
                            type: Type.OBJECT, 
                            properties: { 
                                query: { 
                                    type: Type.STRING,
                                    description: 'The search query to send to Google.'
                                } 
                            }, 
                            required: ['query'] 
                        } 
                    }] 
                }],
                toolConfig: { 
                    functionCallingConfig: { 
                        mode: 'AUTO' as any 
                    } 
                }
            },
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
                        let currentStream = await ai.models.generateContentStream(genParams);
                        let turnLoop = true;

                        while (turnLoop) {
                            turnLoop = false;
                            let activeFC: any = null;
                            const turnPartsCaptured: Part[] = [];

                            for await (const chunk of currentStream) {
                                if (chunk.text) {
                                    enqueue({ type: 'chunk', payload: chunk.text });
                                }

                                const candidates = chunk.candidates;
                                if (candidates?.[0]?.content?.parts) {
                                    for (const part of candidates[0].content.parts) {
                                        turnPartsCaptured.push(part);
                                        if ('thought' in part && (part as any).thought) {
                                            enqueue({ type: 'chunk', payload: `<thinking>\n${(part as any).thought}\n</thinking>` });
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
                                    let searchResult = "Unable to perform search at this time.";

                                    if (activeKey && cseId) {
                                        try {
                                            const resS = await fetch(`https://www.googleapis.com/customsearch/v1?key=${activeKey}&cx=${cseId}&q=${encodeURIComponent(fc.args.query)}&num=10`);
                                            const sJson = await resS.json();
                                            if (sJson.items) {
                                                const sourceChunks = sJson.items.map((i: any) => ({ web: { uri: i.link, title: i.title } }));
                                                enqueue({ type: 'sources', payload: sourceChunks });
                                                enqueue({ type: 'search_result_count', payload: parseInt(sJson.searchInformation?.totalResults || "0", 10) });
                                                searchResult = "LATEST WEB SEARCH RESULTS:\n\n" + sJson.items.map((i: any, idx: number) => `Source [${idx+1}]: ${i.title}\nSnippet: ${i.snippet}\nLink: ${i.link}`).join('\n\n');
                                            } else {
                                                searchResult = "No relevant web results were found for the query: " + fc.args.query;
                                            }
                                        } catch (e) {
                                            searchResult = "An error occurred during the web search process.";
                                        }
                                    }
                                    
                                    contents.push({ role: 'model', parts: turnPartsCaptured });
                                    contents.push({ role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResult } } }] });
                                    
                                    genParams.contents = contents;
                                    currentStream = await ai.models.generateContentStream(genParams);
                                    turnLoop = true;
                                } else {
                                    // Generic handling for other potential tools
                                    enqueue({ type: 'tool_call', payload: { name: fc.name, args: fc.args, id: fc.id } });
                                    contents.push({ role: 'model', parts: turnPartsCaptured });
                                    contents.push({ role: 'function', parts: [{ functionResponse: { name: fc.name, response: { result: "Success" } } }] });
                                    genParams.contents = contents;
                                    currentStream = await ai.models.generateContentStream(genParams);
                                    turnLoop = true;
                                }
                            }
                        }
                        enqueue({ type: 'end' });
                        attemptSuccess = true;
                    } catch (err: any) {
                        const errorMsg = String(err.message || err).toLowerCase();
                        if ((errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("exhausted")) && currentKeyIndex < apiKeys.length - 1) {
                            currentKeyIndex++;
                            continue;
                        }
                        enqueue({ type: 'error', payload: err.message || "An error occurred during generation." });
                        attemptSuccess = true;
                    }
                }
                controller.close();
            }
        });

        return new Response(stream, {
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'X-Content-Type-Options': 'nosniff'
            },
        });

    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
