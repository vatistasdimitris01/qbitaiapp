
import { Content, Part } from "@google/genai";

/**
 * Aggregates and dedplicates API keys from environment variables.
 * Looks for API_KEY, API_KEY_2, ..., API_KEY_10.
 */
export function getAvailableApiKeys(): string[] {
    const keys: string[] = [];
    
    // Primary key
    if (process.env.API_KEY) {
        process.env.API_KEY.split(',').forEach(k => {
            const trimmed = k.trim();
            if (trimmed) keys.push(trimmed);
        });
    }

    // Secondary keys (2-10)
    for (let i = 2; i <= 10; i++) {
        const val = (process.env as any)[`API_KEY_${i}`];
        if (val) {
            val.split(',').forEach((k: string) => {
                const trimmed = k.trim();
                if (trimmed && !keys.includes(trimmed)) keys.push(trimmed);
            });
        }
    }
    
    return keys;
}

/**
 * Formats the application message history into Gemini Content format.
 * - Removes internal <thinking> tags to prevent context pollution.
 * - Handles file attachments (images).
 * - Formats Tool/Function calls from previous turns.
 */
export function formatHistoryForGemini(history: any[]): Content[] {
    const contents: Content[] = [];

    for (const msg of history) {
        if (msg.type === 'USER') {
            const parts: Part[] = [];
            if (msg.content) parts.push({ text: msg.content });
            
            if (msg.files) {
                msg.files.forEach((f: any) => {
                    if (f.data) {
                        parts.push({ 
                            inlineData: { 
                                mimeType: f.mimeType, 
                                data: f.data 
                            } 
                        });
                    }
                });
            }
            contents.push({ role: 'user', parts });
        } else if (msg.type === 'AI_RESPONSE') {
            const parts: Part[] = [];
            // Clean thinking tags from history to avoid model confusion
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
                
                // If model used tools, we must append the function response to maintain valid history
                if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
                    msg.toolCalls.forEach((tc: any) => {
                        contents.push({
                            role: 'function',
                            parts: [{ 
                                functionResponse: { 
                                    name: tc.name, 
                                    response: { result: "Success" } 
                                } 
                            }]
                        });
                    });
                }
            }
        }
    }
    return contents;
}

export interface SearchResult {
    formattedResult: string;
    sources: any[];
    count: number;
}

/**
 * Executes a web search using ONLY the Google Custom Search JSON API.
 * STRICTLY enforces usage of GOOGLE_CSE_ID.
 */
export async function executeGoogleSearch(query: string, apiKey: string): Promise<SearchResult> {
    const cseId = process.env.GOOGLE_CSE_ID;
    
    if (!cseId) {
        return {
            formattedResult: "Error: Google Custom Search Engine ID (GOOGLE_CSE_ID) is not configured on the server.",
            sources: [],
            count: 0
        };
    }

    // Allow a specific search key, otherwise fallback to the current generation key
    const searchApiKey = process.env.GOOGLE_SEARCH_API_KEY || apiKey;

    try {
        const res = await fetch(`https://www.googleapis.com/customsearch/v1?key=${searchApiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=8`);
        
        if (!res.ok) {
            const err = await res.json();
            console.error("Google Search API Error:", err);
            return {
                formattedResult: `Search failed: ${err.error?.message || res.statusText}`,
                sources: [],
                count: 0
            };
        }

        const data = await res.json();
        
        if (!data.items || data.items.length === 0) {
            return {
                formattedResult: "No relevant search results found.",
                sources: [],
                count: 0
            };
        }

        // Format for the LLM
        const formattedResult = data.items.map((item: any, index: number) => 
            `Source [${index + 1}]: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}`
        ).join('\n\n');

        // Extract metadata for the UI
        const sources = data.items.map((item: any) => ({
            web: { uri: item.link, title: item.title }
        }));

        const count = parseInt(data.searchInformation?.totalResults || "0", 10);

        return { formattedResult, sources, count };

    } catch (error: any) {
        return {
            formattedResult: `Search failed due to network error: ${error.message}`,
            sources: [],
            count: 0
        };
    }
}

/**
 * Edge-runtime safe ArrayBuffer to Base64
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
