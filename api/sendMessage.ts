import { GoogleGenAI, Content, Part, GenerateContentParameters, Type } from "@google/genai";

export const config = {
  runtime: 'edge',
};

const encoder = new TextEncoder();

/**
 * Memory-safe ArrayBuffer to Base64 conversion for Edge runtime.
 * Prevents "Maximum call stack size exceeded" on large files.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
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

    // Environment variables - accessed directly as required
    const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

    // 1. Key Rotation Logic
    const apiKeys: string[] = [];
    const primaryKey = process.env.API_KEY || "";
    if (primaryKey) {
      primaryKey.split(',').forEach(k => {
        const trimmed = k.trim();
        if (trimmed && !apiKeys.includes(trimmed)) apiKeys.push(trimmed);
      });
    }

    // Secondary keys
    for (let i = 2; i <= 10; i++) {
      const val = (process.env as any)[`API_KEY_${i}`];
      if (val) {
        val.split(',').forEach((k: string) => {
          const trimmed = k.trim();
          if (trimmed && !apiKeys.includes(trimmed)) apiKeys.push(trimmed);
        });
      }
    }

    if (apiKeys.length === 0) throw new Error("No Gemini API keys configured.");

    // 2. Prepare Contents (Interleaved sequence)
    const contents: Content[] = [];
    for (const msg of history) {
      if (msg.type === 'USER') {
        const parts: Part[] = [];
        if (msg.content) parts.push({ text: msg.content });
        if (msg.files) {
          msg.files.forEach((f: any) => {
            if (f.data) parts.push({ inlineData: { mimeType: f.mimeType, data: f.data } });
          });
        }
        contents.push({ role: 'user', parts });
      } else if (msg.type === 'AI_RESPONSE') {
        const parts: Part[] = [];
        // Remove <thinking> tags from history to prevent signature validation issues in new turns
        const textContent = (msg.content || "").replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
        if (textContent && textContent !== "[Output contains no text]") {
          parts.push({ text: textContent });
        }

        if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
          msg.toolCalls.forEach((tc: any) => {
            parts.push({ functionCall: { name: tc.name, args: tc.args } });
          });
        }

        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
          // If we added a model turn with tool calls, we MUST follow it with function responses
          if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
            msg.toolCalls.forEach((tc: any) => {
              contents.push({
                role: 'function',
                parts: [{ functionResponse: { name: tc.name, response: { result: "Success" } } }]
              });
            });
          }
        }
      }
    }

    // Add current user message
    const currentUserParts: Part[] = [{ text: message }];
    for (const file of uploadedFiles) {
      const buffer = await file.arrayBuffer();
      currentUserParts.push({ 
        inlineData: { 
          mimeType: file.type || 'application/octet-stream', 
          data: arrayBufferToBase64(buffer) 
        } 
      });
    }
    contents.push({ role: 'user', parts: currentUserParts });

    const modelName = 'gemini-3-flash-preview';
    const locationStr = location ? `Location: ${location.city}, ${location.country}. ` : '';
    const systemInstruction = `${personaInstruction || ''}\nYou are Qbit, an advanced AI. ${locationStr}Current Date: ${new Date().toLocaleDateString()}. Use 'google_search' for real-time queries.`;

    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (obj: any) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));

        let keyIndex = 0;
        let success = false;

        while (!success && keyIndex < apiKeys.length) {
          const activeKey = apiKeys[keyIndex];
          const ai = new GoogleGenAI({ apiKey: activeKey });

          try {
            let genParams: any = {
              model: modelName,
              contents: [...contents], // Use a fresh copy for this key attempt
              config: {
                systemInstruction,
                // CRITICAL: Disable thinking budget to resolve 'thought_signature' errors in tool loops
                thinkingConfig: { thinkingBudget: 0 },
                tools: [{
                  functionDeclarations: [{
                    name: 'google_search',
                    description: 'Searches the web for up-to-date information, news, weather, and facts.',
                    parameters: {
                      type: Type.OBJECT,
                      properties: { query: { type: Type.STRING } },
                      required: ['query']
                    }
                  }]
                }],
                toolConfig: { functionCallingConfig: { mode: 'AUTO' as any } }
              },
            };

            let currentStream = await ai.models.generateContentStream(genParams);
            let turnCount = 0;
            let activeLoop = true;

            while (activeLoop && turnCount < 4) {
              activeLoop = false;
              turnCount++;
              let activeFC: any = null;
              const capturedParts: Part[] = [];

              for await (const chunk of currentStream) {
                if (chunk.text) enqueue({ type: 'chunk', payload: chunk.text });

                if (chunk.candidates?.[0]?.content?.parts) {
                  for (const part of chunk.candidates[0].content.parts) {
                    capturedParts.push(part);
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
                  let searchResult = "Search unavailable.";

                  if (GOOGLE_CSE_ID) {
                    try {
                      // Google Custom Search API requires its own API key or works with Gemini keys depending on billing
                      // We use process.env.GOOGLE_SEARCH_API_KEY if available, else fallback to activeKey
                      const searchApiKey = process.env.GOOGLE_SEARCH_API_KEY || activeKey;
                      const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(fc.args.query)}&num=10`);
                      const data = await res.json();
                      if (data.items) {
                        const sources = data.items.map((i: any) => ({ web: { uri: i.link, title: i.title } }));
                        enqueue({ type: 'sources', payload: sources });
                        enqueue({ type: 'search_result_count', payload: parseInt(data.searchInformation?.totalResults || "0", 10) });
                        searchResult = data.items.map((i: any, idx: number) => `[${idx+1}] ${i.title}\n${i.snippet}`).join('\n\n');
                      } else {
                        searchResult = "No relevant search results found.";
                      }
                    } catch (e) {
                      searchResult = "Web search failed due to a technical error.";
                    }
                  }

                  // 3. Update history sequence correctly
                  // We MUST include the model's call and the function's response
                  genParams.contents.push({ role: 'model', parts: capturedParts });
                  genParams.contents.push({
                    role: 'function',
                    parts: [{ 
                      functionResponse: { 
                        name: 'google_search', 
                        response: { content: searchResult } // Wrapped as raw JSON/object
                      } 
                    }]
                  });

                  // Re-run stream with new context
                  currentStream = await ai.models.generateContentStream(genParams);
                  activeLoop = true;
                }
              }
            }

            enqueue({ type: 'end' });
            success = true;
          } catch (err: any) {
            const msg = String(err.message || err).toLowerCase();
            // Handle quota (429) or other retryable errors
            if ((msg.includes("429") || msg.includes("quota") || msg.includes("limit")) && keyIndex < apiKeys.length - 1) {
              keyIndex++;
              continue; 
            }
            enqueue({ type: 'error', payload: err.message || "An unexpected error occurred." });
            success = true; // Stop loop after reporting error if no keys left
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
