
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Content, Part, FunctionDeclaration, GenerateContentConfig, Type, FunctionCall } from "@google/genai";
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
    en: 'English',
    el: 'Greek',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
};

export const config = {
  api: {
    bodyParser: false,
  },
};

// --- Yahoo Finance Helper ---
async function fetchYahooData(symbol: string) {
    // Yahoo Finance often requires a User-Agent to prevent 403 Forbidden
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    };

    try {
        const [quoteRes, chartRes, summaryRes] = await Promise.all([
            fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`, { headers }),
            // Fetching 1 month of data for a nice sparkline/chart
            fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`, { headers }), 
            // Fetching key stats
            fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail,defaultKeyStatistics,price`, { headers })
        ]);

        const quoteJson = await quoteRes.json();
        const chartJson = await chartRes.json();
        const summaryJson = await summaryRes.json();

        return {
            quote: quoteJson.quoteResponse?.result?.[0],
            chart: chartJson.chart?.result?.[0],
            summary: summaryJson.quoteSummary?.result?.[0]
        };
    } catch (e) {
        console.error("Yahoo fetch error:", e);
        return null;
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    // Helper to write to stream
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
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        const geminiHistory: Content[] = (history as HistoryItem[])
            .filter(msg => msg.type === 'USER' || msg.type === 'AI_RESPONSE')
            .map(msg => {
                const parts: Part[] = [];
                if (msg.content) parts.push({ text: msg.content });
                if (msg.files) {
                    msg.files.forEach(file => parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } }));
                }
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                     msg.toolCalls.forEach(tc => {
                         parts.push({ functionCall: { name: tc.name, args: tc.args } });
                         // Simplified response for history to save tokens
                         parts.push({ functionResponse: { name: tc.name, response: { content: "UI Rendered" } } }); 
                     });
                }
                return {
                    role: msg.type === 'USER' ? 'user' : 'model',
                    parts: parts
                } as Content;
            }).filter(c => c.parts.length > 0);
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        
        const userMessageParts: Part[] = [{ text: message }];
        if (fileList.length > 0) {
            for (const file of fileList) {
                const base64Data = (await fs.promises.readFile(file.filepath)).toString('base64');
                userMessageParts.push({ inlineData: { mimeType: file.mimetype || 'application/octet-stream', data: base64Data } });
            }
        }
        
        const contents: Content[] = [...geminiHistory, { role: 'user', parts: userMessageParts }];
        const model = 'gemini-2.5-flash';
        const langCode = (language as string) || 'en';
        const userLanguageName = languageMap[langCode] || 'English';
        
        const baseSystemInstruction = `You are Qbit, a highly intelligent and helpful AI assistant.

**Your Capabilities & Tools:**

1.  **Generative UI (Interactive Components)**
    *   **What you can do:** Instantly render interactive charts, KPI cards, tables, todo lists, and STOCK WIDGETS.
    *   **How to do it:** Use the provided tools.
    *   **When to use:** 
        *   User asks about stock prices -> Call \`get_stock_quote\`.
        *   User asks for data visualization -> Call \`render_chart\`.

2.  **Web Applications (HTML/CSS/JS)**
    *   **What you can do:** Create self-contained web components, dashboards, calculators.
    *   **How to do it:** Output standard HTML code in a \`\`\`html\`\`\` block.

3.  **Python Code Execution**
    *   **What you can do:** Analyze data, solve math, generate plots.
    *   **How to do it:** Output code in a \`\`\`python\`\`\` block.

4.  **Google Search (Grounding)**
    *   **How to do it:** Use the \`google_search\` tool.

**General Guidelines:**

1.  **Language**: Respond in ${userLanguageName}.
2.  **Proactive**: If a visual tool fits the request, USE IT instead of just describing the data.
3.  **Suggestions**: Provide 1-3 short follow-up suggestions in JSON format <suggestions>["Next query"]</suggestions> at the end.`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
        // --- Tool Definitions ---

        const googleSearchTool: FunctionDeclaration = {
            name: 'google_search',
            description: 'Get information from the web using Google Search.',
            parameters: {
                type: Type.OBJECT,
                properties: { query: { type: Type.STRING } },
                required: ['query'],
            },
        };

        const renderChartTool: FunctionDeclaration = {
            name: 'render_chart',
            description: 'Render an interactive chart (line, bar, pie, donut).',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    type: { type: Type.STRING, enum: ['line', 'bar', 'pie', 'donut'], description: 'The type of chart' },
                    title: { type: Type.STRING, description: 'Chart title' },
                    data: { 
                        type: Type.ARRAY, 
                        description: 'Array of objects with data points. For Line/Bar: [{x: "Label", y: 10}]. For Pie: [{label: "A", value: 10}]',
                        items: { type: Type.OBJECT } 
                    }
                },
                required: ['type', 'data']
            }
        };

        const getStockQuoteTool: FunctionDeclaration = {
            name: 'get_stock_quote',
            description: 'Get real-time stock quote, chart, and stats for a given symbol.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    symbol: { type: Type.STRING, description: 'Stock symbol e.g. AAPL' },
                },
                required: ['symbol']
            }
        };

        const renderKpiTool: FunctionDeclaration = {
            name: 'render_kpi_card',
            description: 'Render a key performance indicator (KPI) card with value and trend.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    value: { type: Type.STRING },
                    change: { type: Type.STRING, description: 'e.g. "+5%" or "-$200"' },
                    trend: { type: Type.STRING, enum: ['up', 'down', 'neutral'] }
                },
                required: ['title', 'value']
            }
        };

        const renderTableTool: FunctionDeclaration = {
            name: 'render_table',
            description: 'Render a data table.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    columns: { type: Type.ARRAY, items: { type: Type.STRING } },
                    data: { type: Type.ARRAY, items: { type: Type.OBJECT }, description: 'Array of row objects matching columns' }
                },
                required: ['columns', 'data']
            }
        };

        const createTodoTool: FunctionDeclaration = {
            name: 'create_todo_item',
            description: 'Create a todo list or item.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: 'List title' },
                    items: { 
                        type: Type.ARRAY, 
                        items: { 
                            type: Type.OBJECT, 
                            properties: { label: { type: Type.STRING }, due: { type: Type.STRING }, done: { type: Type.BOOLEAN } } 
                        } 
                    }
                },
                required: ['items']
            }
        };

        const renderCalendarEventTool: FunctionDeclaration = {
            name: 'render_calendar_event',
            description: 'Render a calendar event card.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    date: { type: Type.STRING },
                    time: { type: Type.STRING },
                    description: { type: Type.STRING }
                },
                required: ['title', 'date', 'time']
            }
        };
        
        const renderFlashcardsTool: FunctionDeclaration = {
            name: 'render_flashcards',
            description: 'Render a set of flashcards for study.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                    cards: { 
                        type: Type.ARRAY, 
                        items: { type: Type.OBJECT, properties: { front: { type: Type.STRING }, back: { type: Type.STRING } } } 
                    }
                },
                required: ['cards']
            }
        };

        const config: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            tools: [{ 
                functionDeclarations: [
                    googleSearchTool, 
                    renderChartTool,
                    getStockQuoteTool,
                    renderKpiTool, 
                    renderTableTool, 
                    createTodoTool,
                    renderCalendarEventTool,
                    renderFlashcardsTool
                ] 
            }],
        };

        try {
            const initialStream = await ai.models.generateContentStream({ model, contents, config });
            
            let currentStream = initialStream;
            let keepGoing = true;

            while (keepGoing) {
                keepGoing = false;
                let functionCallToHandle: FunctionCall | null = null;
                
                for await (const chunk of currentStream) {
                    // Safe handling of tool calls
                    if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                        functionCallToHandle = chunk.functionCalls[0];
                    }
                    
                    // Safe access to text with try-catch as getter might throw on non-text chunks
                    let text = '';
                    try {
                        text = chunk.text || '';
                    } catch (e) {
                        // ignore property access error
                    }
                    if (text) write({ type: 'chunk', payload: text });

                    if (chunk.usageMetadata) write({ type: 'usage', payload: chunk.usageMetadata });
                }

                if (functionCallToHandle) {
                    const fc = functionCallToHandle;
                    
                    if (fc.name === 'google_search') {
                        write({ type: 'searching' });
                        const query = fc.args.query as string;
                        const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
                        const cseId = process.env.GOOGLE_CSE_ID;
                        
                        let searchResultText = "No results found or search failed.";
                        if (apiKey && cseId) {
                            try {
                                const searchResponse = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=5`);
                                const searchResults = await searchResponse.json();
                                if (searchResults.items) {
                                     const groundingChunks = searchResults.items.map((item: any) => ({
                                        web: { uri: item.link, title: item.title },
                                    }));
                                    write({ type: 'sources', payload: groundingChunks });
                                    
                                    searchResultText = searchResults.items.map((item: any) => 
                                        `Title: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}`
                                    ).join('\n\n---\n\n');
                                }
                            } catch (e) {
                                console.error("Search error", e);
                            }
                        }

                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchResultText } } }] });

                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;

                    } else if (fc.name === 'get_stock_quote') {
                        write({ type: 'searching' }); // Show loading state
                        const symbol = fc.args.symbol as string;
                        
                        const stockData = await fetchYahooData(symbol);
                        
                        let functionResponseContent = "Could not fetch stock data.";
                        let toolCallPayload = null;

                        if (stockData && stockData.quote) {
                            const q = stockData.quote;
                            const c = stockData.chart;
                            const s = stockData.summary;

                            // Format Chart Data
                            const cleanChartData: { x: string[], y: number[] } = { x: [], y: [] };
                            if (c && c.timestamp && c.indicators && c.indicators.quote && c.indicators.quote[0]) {
                                const timestamps = c.timestamp;
                                const closes = c.indicators.quote[0].close;
                                timestamps.forEach((ts: number, i: number) => {
                                    if (closes[i] !== null && ts) {
                                        cleanChartData.x.push(new Date(ts * 1000).toISOString());
                                        cleanChartData.y.push(closes[i]);
                                    }
                                });
                            }

                            // Format Widget Data
                            toolCallPayload = {
                                name: 'get_stock_quote',
                                args: {
                                    symbol: q.symbol,
                                    price: q.regularMarketPrice?.toFixed(2) || 'N/A',
                                    currency: q.currency === 'USD' ? '$' : q.currency,
                                    change: q.regularMarketChange?.toFixed(2) || '0.00',
                                    changePercent: (q.regularMarketChangePercent?.toFixed(2) + '%') || '0.00%',
                                    chartData: cleanChartData,
                                    stats: {
                                        "Open": q.regularMarketOpen?.toFixed(2) || '-',
                                        "High": q.regularMarketDayHigh?.toFixed(2) || '-',
                                        "Low": q.regularMarketDayLow?.toFixed(2) || '-',
                                        "Vol": q.regularMarketVolume ? (q.regularMarketVolume / 1000000).toFixed(1) + 'M' : '-',
                                        "Mkt Cap": s?.summaryDetail?.marketCap?.fmt || '-',
                                        "PE Ratio": s?.summaryDetail?.trailingPE?.fmt || '-'
                                    }
                                },
                                id: Math.random().toString(36).substring(7)
                            };

                            // Provide text summary for AI
                            functionResponseContent = JSON.stringify({
                                symbol: q.symbol,
                                name: q.longName,
                                price: q.regularMarketPrice,
                                change: q.regularMarketChange,
                                percent: q.regularMarketChangePercent,
                                marketCap: s?.summaryDetail?.marketCap?.fmt,
                                peRatio: s?.summaryDetail?.trailingPE?.fmt,
                                description: s?.assetProfile?.longBusinessSummary ? s.assetProfile.longBusinessSummary.substring(0, 200) + '...' : ''
                            });
                        }

                        if (toolCallPayload) {
                            write({ type: 'tool_call', payload: toolCallPayload });
                        }

                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: 'get_stock_quote', response: { content: functionResponseContent } } }] });

                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;

                    } else {
                        // Generic Generative UI Tool Handling (Model imagines the data)
                        write({ 
                            type: 'tool_call', 
                            payload: { 
                                name: fc.name, 
                                args: fc.args, 
                                id: Math.random().toString(36).substring(7) 
                            } 
                        });

                        contents.push({ role: 'model', parts: [{ functionCall: fc }] });
                        contents.push({ role: 'function', parts: [{ functionResponse: { name: fc.name, response: { content: "UI Component Rendered Successfully." } } }] });

                        currentStream = await ai.models.generateContentStream({ model, contents, config });
                        keepGoing = true;
                    }
                }
            }

        } finally {
            write({ type: 'end' });
            res.end();
        }
    } catch (error) {
        console.error("API Error:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        // If headers are already sent, we must stream the error
        if (res.headersSent) {
            write({ type: 'error', payload: errorMessage });
            res.end();
        } else {
            res.status(500).json({ error: { message: errorMessage } });
        }
    }
}
