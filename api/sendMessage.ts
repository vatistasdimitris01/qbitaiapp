import type { VercelRequest, VercelResponse } from '@vercel/node';
import formidable from 'formidable';
import fs from 'fs';

interface ApiAttachment {
    mimeType: string;
    data: string; // base64 encoded
}

interface HistoryItem {
    type: 'USER' | 'AI_RESPONSE' | 'SYSTEM' | 'ERROR' | 'AGENT_ACTION' | 'AGENT_PLAN';
    content: string;
    files?: ApiAttachment[];
    toolCalls?: any[];
}

const languageMap: { [key: string]: string } = {
    en: 'English', el: 'Greek', es: 'Spanish', fr: 'French', de: 'German',
};

export const config = {
    api: {
        bodyParser: false,
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const write = (data: object) => res.write(JSON.stringify(data) + '\n');

    try {
        const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
            const form = formidable({});
            form.parse(req, (err, fields, files) => {
                if (err) reject(err); else resolve({ fields, files });
            });
        });

        const payloadJSON = fields.payload?.[0];
        if (!payloadJSON) throw new Error("Missing 'payload' in form data.");
        const { history, message, personaInstruction, location, language } = JSON.parse(payloadJSON);

        const fileList = files.file ? (Array.isArray(files.file) ? files.file : [files.file]) : [];

        if (!process.env.API_KEY) throw new Error("API_KEY environment variable is not set.");

        const API_KEY = process.env.API_KEY;
        const MODEL = 'gemini-2.5-flash-lite'; // or gemini-1.5-pro if preferred
        const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?key=${API_KEY}`;

        // Build history in Gemini format
        const geminiHistory: any[] = (history as HistoryItem[])
            .filter(msg => msg.type === 'USER' || msg.type === 'AI_RESPONSE')
            .map(msg => {
                const parts: any[] = [];
                if (msg.content) parts.push({ text: msg.content });
                if (msg.files) {
                    msg.files.forEach(file => parts.push({
                        inlineData: { mimeType: file.mimeType, data: file.data }
                    }));
                }
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    msg.toolCalls.forEach(tc => {
                        parts.push({ functionCall: { name: tc.name, args: tc.args } });
                        parts.push({ functionResponse: { name: tc.name, response: { content: "Processed" } } });
                    });
                }
                return { role: msg.type === 'USER' ? 'user' : 'model', parts };
            }).filter(c => c.parts.length > 0);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');

        // Build current user message parts
        const userMessageParts: any[] = [{ text: message }];
        if (fileList.length > 0) {
            for (const file of fileList) {
                const base64Data = (await fs.promises.readFile(file.filepath)).toString('base64');
                userMessageParts.push({
                    inlineData: {
                        mimeType: file.mimetype || 'application/octet-stream',
                        data: base64Data
                    }
                });
            }
        }

        let contents: any[] = [...geminiHistory, { role: 'user', parts: userMessageParts }];

        const langCode = (language as string) || 'en';
        const userLanguageName = languageMap[langCode] || 'English';

        const locationStr = location ? `User's Exact Location: ${location.city}, ${location.country}.` : 'Location hidden or unknown.';

        const baseSystemInstruction = `You are KIPP (Kosmic Intelligence Pattern Perceptron), a highly intelligent and helpful AI assistant.

**User Context:**
- ${locationStr} 
- **STRICT LOCATION POLICY**: Always use the user's current location to ground responses (like weather, local news, or nearby searches) by default. You MUST incorporate the current location into web searches (e.g. for "news" or "weather") UNLESS the user explicitly mentions a different specific location in their prompt. If a specific city or place is mentioned by the user, prioritize that over their current location.
- **NEVER** claim you don't have access to the user's location if the location context above provides a city and country. Use that information as your primary ground truth for all local-intent queries.

**Your Capabilities & Tools:**

1.  **Stock Market Widget**
    *   **How to do it:** Use the \`render_stock_widget\` tool.
    *   **CRITICAL:** You MUST generate simulated but realistic historical data for '5D', '1M', '6M', '1Y', '5Y' ranges in the \`history\` field.

2.  **Web Applications (HTML/CSS/JS)**
    *   **How to do it:** Output standard HTML code in a \`\`\`html\`\`\` block.

3.  **Python Code Execution**
    *   **How to do it:** Output code in a \`\`\`python\`\`\` block.

4.  **Google Search (Grounding)**
    *   **How to do it:** Use the \`google_search\` tool. Incorporate the user's location automatically for local queries to ensure high relevance. ALWAYS USE THIS TOOL FOR REAL-TIME INFO.

**General Guidelines:**

1.  **Language**: Respond in ${userLanguageName}.
2.  **Proactive**: If a visual tool fits the request, USE IT immediately.
3.  **Suggestions**: Always end with <suggestions>["Query 1", "Query 2"]</suggestions>.`;

        const finalSystemInstruction = personaInstruction
            ? `${personaInstruction}\n\n${baseSystemInstruction}`
            : baseSystemInstruction;

        // Tool declarations
        const tools = [
            {
                functionDeclarations: [
                    {
                        name: 'google_search',
                        description: 'Get real-time information from the web.',
                        parameters: {
                            type: 'OBJECT',
                            properties: { query: { type: 'STRING' } },
                            required: ['query'],
                        },
                    },
                    {
                        name: 'render_stock_widget',
                        description: 'Render a stock card with price and history.',
                        parameters: {
                            type: 'OBJECT',
                            properties: {
                                symbol: { type: 'STRING' },
                                price: { type: 'STRING' },
                                change: { type: 'STRING' },
                                stats: { type: 'OBJECT' },
                                chartData: { type: 'OBJECT' },
                                history: { type: 'OBJECT' }
                            },
                            required: ['symbol', 'price', 'change', 'chartData']
                        }
                    }
                ]
            }
        ];

        let keepGoing = true;

        while (keepGoing) {
            keepGoing = false;
            let functionCallToHandle: any = null;

            const requestBody = {
                contents,
                systemInstruction: { parts: [{ text: finalSystemInstruction }] },
                tools,
                generationConfig: { responseMimeType: "text/plain" }
            };

            const response = await fetch(BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Gemini API error ${response.status}: ${errText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

                for (const line of lines) {
                    const jsonStr = line.replace('data: ', '').trim();
                    if (jsonStr === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(jsonStr);
                        const candidates = parsed.candidates || [];
                        for (const candidate of candidates) {
                            const content = candidate.content;
                            if (content?.parts) {
                                for (const part of content.parts) {
                                    if (part.text) {
                                        write({ type: 'chunk', payload: part.text });
                                    }
                                    if (part.functionCall) {
                                        functionCallToHandle = part.functionCall;
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.error("Failed to parse stream chunk:", jsonStr);
                    }
                }
            }

            // Handle tool calls
            if (functionCallToHandle) {
                const fc = functionCallToHandle;

                if (fc.name === 'google_search') {
                    write({ type: 'searching' });
                    const rawQuery = fc.args.query as string;
                    const query = (location && !rawQuery.toLowerCase().includes(location.city.toLowerCase()))
                        ? `${rawQuery} in ${location.city}`
                        : rawQuery;

                    const googleApiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
                    const cseId = process.env.GOOGLE_CSE_ID;

                    let searchResultText = "Search failed.";
                    if (googleApiKey && cseId) {
                        try {
                            const sRes = await fetch(`https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=10`);
                            const sData = await sRes.json();

                            if (sData.searchInformation?.totalResults) {
                                write({ type: 'search_result_count', payload: parseInt(sData.searchInformation.totalResults, 10) });
                            }

                            if (sData.items) {
                                const sources = sData.items.map((item: any) => ({ web: { uri: item.link, title: item.title } }));
                                write({ type: 'sources', payload: sources });
                                searchResultText = sData.items.map((item: any) => `Title: ${item.title}\nSnippet: ${item.snippet}\nURL: ${item.link}`).join('\n\n');
                            }
                        } catch (e) {
                            console.error(e);
                        }
                    }

                    contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                    contents.push({
                        role: 'tool',
                        parts: [{ functionResponse: { name: 'google_search', response: { content: searchResultText } } }]
                    });
                    keepGoing = true;
                } else {
                    // Other tools (like render_stock_widget)
                    write({ type: 'tool_call', payload: { name: fc.name, args: fc.args, id: Math.random().toString(36).substring(7) } });

                    contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                    contents.push({
                        role: 'tool',
                        parts: [{ functionResponse: { name: fc.name, response: { content: "Processed" } } }]
                    });
                    keepGoing = true;
                }
            }
        }

        write({ type: 'end' });
        res.end();

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (res.headersSent) {
            write({ type: 'error', payload: errorMessage });
            res.end();
        } else {
            res.status(500).json({ error: { message: errorMessage } });
        }
    }
}