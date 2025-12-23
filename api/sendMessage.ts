
import { GoogleGenAI, Type, Part } from "@google/genai";
import { getAvailableApiKeys, formatHistoryForGemini, executeGoogleSearch, arrayBufferToBase64 } from "./utils";

export const config = {
  runtime: 'edge',
};

const MODEL_NAME = 'gemini-3-flash-preview';

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const encoder = new TextEncoder();

  try {
    // 1. Parse Input
    const formData = await req.formData();
    const payloadJSON = formData.get('payload') as string;
    if (!payloadJSON) throw new Error("Missing payload.");

    const parsed = JSON.parse(payloadJSON);
    const { message, personaInstruction, location } = parsed;
    const uploadedFiles = formData.getAll('file') as File[];

    // 2. Prepare API Keys
    const apiKeys = getAvailableApiKeys();
    if (apiKeys.length === 0) throw new Error("No Gemini API keys configured.");

    // 3. Prepare Context & System Instructions
    const locationStr = location ? `Location: ${location.city}, ${location.country}. ` : '';
    const systemInstruction = `${personaInstruction || ''}\nYou are Qbit, an advanced AI. ${locationStr}Current Date: ${new Date().toLocaleDateString()}. Use 'google_search' for real-time queries.`;

    // 4. Build Content History
    const historyContents = formatHistoryForGemini(parsed.history || []);
    
    // Add current user turn
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
    // We add the user message to a "working copy" of contents that will be mutated if tools are used
    let sessionContents = [...historyContents, { role: 'user', parts: currentUserParts }];


    // 5. Define Tools (Strictly Custom Search, No Grounding)
    const tools = [{
      functionDeclarations: [{
        name: 'google_search',
        description: 'Searches the web for up-to-date information, news, weather, and facts.',
        parameters: {
          type: Type.OBJECT,
          properties: { query: { type: Type.STRING } },
          required: ['query']
        }
      }]
    }];


    // 6. Streaming Response with Retry Logic
    const stream = new ReadableStream({
      async start(controller) {
        const enqueue = (obj: any) => controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        
        let keyIndex = 0;
        let requestSuccess = false;

        // Retry Loop: Tries keys sequentially if one hits a Quota limit (429)
        while (!requestSuccess && keyIndex < apiKeys.length) {
          const activeKey = apiKeys[keyIndex];
          const ai = new GoogleGenAI({ apiKey: activeKey });
          
          try {
            // Configuration for this attempt
            const genConfig = {
              systemInstruction,
              tools,
              toolConfig: { functionCallingConfig: { mode: 'AUTO' as any } },
              thinkingConfig: { thinkingBudget: 0 } // Fix for tool use signature errors
            };

            // Initial Generation
            let currentStream = await ai.models.generateContentStream({
                model: MODEL_NAME,
                contents: sessionContents,
                config: genConfig
            });

            // Tool Use Loop (Max 4 turns to prevent infinite loops)
            let turnCount = 0;
            const MAX_TURNS = 4;
            let activeLoop = true;

            while (activeLoop && turnCount < MAX_TURNS) {
                activeLoop = false; // Assume we are done unless we find a tool call
                turnCount++;
                
                let toolCallFound: any = null;
                const modelPartsAccumulator: Part[] = [];

                // Read the stream
                for await (const chunk of currentStream) {
                    // 1. Send text chunks to UI
                    if (chunk.text) {
                        enqueue({ type: 'chunk', payload: chunk.text });
                    }

                    // 2. Accumulate parts for history
                    if (chunk.candidates?.[0]?.content?.parts) {
                        for (const part of chunk.candidates[0].content.parts) {
                            modelPartsAccumulator.push(part);
                            if ('functionCall' in part && part.functionCall) {
                                toolCallFound = part.functionCall;
                            }
                        }
                    }
                }

                // If Tool Call Detected
                if (toolCallFound) {
                    if (toolCallFound.name === 'google_search') {
                        // Notify UI
                        enqueue({ type: 'tool_call', payload: { name: 'google_search' } });
                        enqueue({ type: 'searching' });

                        // Execute Search (Server Side)
                        const { formattedResult, sources, count } = await executeGoogleSearch(toolCallFound.args.query, activeKey);

                        // Send Metadata to UI
                        if (sources.length > 0) {
                            enqueue({ type: 'sources', payload: sources });
                            enqueue({ type: 'search_result_count', payload: count });
                        }

                        // Update Session History with Model Call + Function Response
                        sessionContents.push({ role: 'model', parts: modelPartsAccumulator });
                        sessionContents.push({
                            role: 'function',
                            parts: [{ 
                                functionResponse: { 
                                    name: 'google_search', 
                                    response: { content: formattedResult } 
                                } 
                            }]
                        });

                        // Re-trigger Generation with new context
                        currentStream = await ai.models.generateContentStream({
                            model: MODEL_NAME,
                            contents: sessionContents,
                            config: genConfig
                        });
                        
                        activeLoop = true; // Continue loop to process the answer based on search
                    }
                }
            }

            enqueue({ type: 'end' });
            requestSuccess = true;

          } catch (err: any) {
            console.error(`API Key ending in ...${activeKey.slice(-4)} failed:`, err.message);
            
            const msg = String(err.message || err).toLowerCase();
            const isRetryable = msg.includes("429") || msg.includes("quota") || msg.includes("limit") || msg.includes("overloaded");

            if (isRetryable && keyIndex < apiKeys.length - 1) {
                console.warn("Retrying with next API key...");
                keyIndex++;
                continue; // Loop again with next key
            } else {
                // Fatal error
                enqueue({ type: 'error', payload: err.message || "An unexpected connection error occurred." });
                requestSuccess = true; // Exit loop
            }
          }
        }

        if (!requestSuccess && keyIndex >= apiKeys.length) {
             enqueue({ type: 'error', payload: "All API keys are currently overloaded. Please try again later." });
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
    console.error("Fatal API Error:", error);
    return new Response(JSON.stringify({ error: { message: error.message || "Internal Server Error" } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
