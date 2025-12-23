import { GoogleGenAI, Content, Part, GenerateContentParameters, Type } from "@google/genai";

export const config = {
  runtime: 'edge',
};

const encoder = new TextEncoder();

/**
 * Safely converts an ArrayBuffer to a Base64 string in an Edge environment.
 * Avoids "Maximum call stack size exceeded" by processing in chunks.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const formData = await req.formData();
    const payloadJSON = formData.get('payload') as string;
    if (!payloadJSON) throw new Error("Missing payload.");

    const parsed = JSON.parse(payloadJSON);
    const history = parsed.history ?? [];
    const { message, personaInstruction, location } = parsed;
    const uploadedFiles = formData.getAll('file') as File[];

    // Access environment variables safely for Edge
    const ENV = process.env;
    const GOOGLE_CSE_ID = ENV.GOOGLE_CSE_ID;

    // 1. Gather API keys for rotation
    const apiKeys: string[] = [];
    const primary = ENV.API_KEY || "";
    primary.split(',').forEach(k => {
      const t = k.trim();
      if (t && !apiKeys.includes(t)) apiKeys.push(t);
    });

    for (let i = 2; i <= 10; i++) {
      const val = (ENV as any)[`API_KEY_${i}`];
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
          msg.files.forEach((f: any) => {
            if (f.data) parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
          });
        }
        geminiHistory.push({ role: 'user', parts });
      } else if (msg.type === 'AI_RESPONSE') {
        const parts: Part[] = [];
        const content = msg.content === "[Output contains no text]" ? "" : (msg.content || "");

        // Remove <thinking> tags to avoid signature conflicts in reconstructed history
        const cleanText = content.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
        if (cleanText) parts.push({ text: cleanText });

        if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
          msg.toolCalls.forEach((tc: any) => {
            parts.push({ functionCall: { name: tc.name, args: tc.args } });
          });
        }

        if (parts.length > 0) {
          geminiHistory.push({ role: 'model', parts });
          if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
            msg.toolCalls.forEach((tc: any) => {
              geminiHistory.push({
                role: 'function',
                parts: [{ functionResponse: { name: tc.name, response: { result: "OK" } } }]
              });
            });
          }
        }
      }
    }

    const userParts: Part[] = [{ text: message }];
    for (const file of uploadedFiles) {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      userParts.push({ inlineData: { mimeType: file.type || 'application/octet-stream', data: base64 } });
    }

    const contents: Content[] = [...geminiHistory, { role: 'user', parts: userParts }];
    const modelName = 'gemini-3-flash-preview';

    const locationStr = location ? `User location: ${location.city}, ${location.country}. ` : '';
    const systemInstruction = `${personaInstruction || ''}
You are Qbit, an advanced AI assistant. 
Current Date: ${new Date().toLocaleDateString()}.
${locationStr}

CRITICAL:
- Use 'google_search' for real-time data like weather, news, and current events.
- Summarize search results concisely.`;

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (obj: object) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

        let currentKeyIndex = 0;
        let attemptSuccess = false;

        while (!attemptSuccess && currentKeyIndex < apiKeys.length) {
          const activeKey = apiKeys[currentKeyIndex];
          const ai = new GoogleGenAI({ apiKey: activeKey });

          try {
            let genParams: GenerateContentParameters = {
              model: modelName,
              contents,
              config: {
                systemInstruction,
                // Setting thinkingBudget to 0 prevents the 'thought_signature' requirement for tool calls
                thinkingConfig: { thinkingBudget: 0 },
                tools: [{
                  functionDeclarations: [{
                    name: 'google_search',
                    description: 'Live web search for weather, news, stocks, and current events.',
                    parameters: {
                      type: Type.OBJECT,
                      properties: { query: { type: Type.STRING } },
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

            let currentStream = await ai.models.generateContentStream(genParams);
            let turnCount = 0;
            let activeTurn = true;

            while (activeTurn && turnCount < 4) {
              activeTurn = false;
              turnCount++;
              let activeFC: any = null;
              const turnPartsCaptured: Part[] = [];

              for await (const chunk of currentStream) {
                if (chunk.text) enqueue({ type: 'chunk', payload: chunk.text });

                const candidates = chunk.candidates;
                if (candidates?.[0]?.content?.parts) {
                  for (const part of candidates[0].content.parts) {
                    turnPartsCaptured.push(part);
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
                  let searchResult = "No search results.";

                  if (activeKey && GOOGLE_CSE_ID) {
                    try {
                      const resS = await fetch(`https://www.googleapis.com/customsearch/v1?key=${activeKey}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(fc.args.query)}&num=10`);
                      const sJson = await resS.json();
                      if (sJson.items) {
                        const sourceChunks = sJson.items.map((i: any) => ({ web: { uri: i.link, title: i.title } }));
                        enqueue({ type: 'sources', payload: sourceChunks });
                        enqueue({ type: 'search_result_count', payload: parseInt(sJson.searchInformation?.totalResults || "0", 10) });
                        searchResult = sJson.items.map((i: any, idx: number) => `[${idx+1}] ${i.title}\n${i.snippet}`).join('\n\n');
                      }
                    } catch (e) {
                      searchResult = "Web search failed.";
                    }
                  }

                  // Append exactly what the model returned (including internal SDK state) 
                  // and then append the function response
                  contents.push({ role: 'model', parts: turnPartsCaptured });
                  contents.push({
                    role: 'function',
                    parts: [{ functionResponse: { name: 'google_search', response: { result: searchResult } } }]
                  });

                  genParams = { ...genParams, contents };
                  currentStream = await ai.models.generateContentStream(genParams);
                  activeTurn = true;
                }
              }
            }
            enqueue({ type: 'end' });
            attemptSuccess = true;
          } catch (err: any) {
            const errorMsg = String(err.message || err).toLowerCase();
            if ((errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("limit")) && currentKeyIndex < apiKeys.length - 1) {
              currentKeyIndex++;
              continue;
            }
            enqueue({ type: 'error', payload: err.message || "A generation error occurred." });
            attemptSuccess = true;
          }
        }
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
