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
}

const languageMap: { [key: string]: string } = {
    en: 'English',
    el: 'Greek',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
};

const searchContextTranslations: { [lang: string]: string } = {
    en: 'Search results for "{query}":\n{results}',
    el: 'Αποτελέσματα αναζήτησης για "{query}":\n{results}',
    es: 'Resultados de búsqueda para "{query}":\n{results}',
    fr: 'Résultats de recherche pour "{query}":\n{results}',
    de: 'Suchergebnisse für "{query}":\n{results}',
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
            .map(msg => ({
                role: msg.type === 'USER' ? 'user' : 'model',
                parts: [
                    ...(msg.content ? [{ text: msg.content }] : []),
                    ...(msg.files ? msg.files.map(file => ({ inlineData: { mimeType: file.mimeType, data: file.data } })) : [])
                ] as Part[],
            })).filter(c => c.parts.length > 0);
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const write = (data: object) => res.write(JSON.stringify(data) + '\n');
        
        const userMessageParts: Part[] = [{ text: message }];
        if (fileList.length > 0) {
            for (const file of fileList) {
                const base64Data = (await fs.promises.readFile(file.filepath)).toString('base64');
                userMessageParts.push({ inlineData: { mimeType: file.mimetype || 'application/octet-stream', data: base64Data } });
            }
        }
        
        const contents: Content[] = [...geminiHistory, { role: 'user', parts: userMessageParts }];
        const model = 'gemini-flash-lite-latest'; // Explicitly using the Lite model
        const langCode = (language as string) || 'en';
        const userLanguageName = languageMap[langCode] || 'English';
        
        const baseSystemInstruction = `You are Qbit, a highly intelligent and helpful AI assistant.

**Your Capabilities & Tools:**

1.  **React Web Applications (Interactive UI)**
    *   **What you can do:** Create full interactive web components, dashboards, games, calculators, and tools.
    *   **How to do it:** Output code in a \`\`\`react\`\`\` block.
    *   **IMPORTANT RULES:**
        *   **NO** external imports (like \`import ... from 'lucide-react'\`). The environment pre-loads React, ReactDOM, and Tailwind CSS ONLY.
        *   **NO** \`import\` statements at all. Assume \`React\`, \`useState\`, \`useEffect\`, etc., are globally available or destructure them from \`React\`.
        *   **Define a component named \`App\`** as the entry point.
        *   **Use Tailwind CSS** for styling.
        *   Example:
            \`\`\`react
            const { useState } = React;
            function App() {
               return <div className="p-4 bg-blue-500 text-white">Hello World</div>;
            }
            \`\`\`

2.  **Python Code Execution (Data & Logic)**
    *   **What you can do:** Analyze data, solve complex math, generate plots (Matplotlib/Plotly), and **create downloadable files** (PDF, Excel, CSV, Text).
    *   **How to do it:** Output code in a \`\`\`python\`\`\` block.
    *   **Libraries:** \`numpy\`, \`pandas\`, \`matplotlib\`, \`scipy\`, \`sklearn\`, \`networkx\`, \`sympy\`, \`fpdf\`, \`openpyxl\`.
    *   **Output:** Print results to stdout. Generated plots are automatically shown. 
    *   **File Creation:** When you use libraries to save files (e.g., \`workbook.save("data.xlsx")\`), the system automatically detecting it. **The code block will be hidden**, and a download button will be displayed to the user.

3.  **Google Search (Grounding)**
    *   **What you can do:** Search the live web for real-time information.
    *   **How to do it:** Use the \`google_search\` tool.
    *   **Output:** The search results will be provided to you. Synthesize them into a response.

4.  **Image Gallery Search**
    *   **What you can do:** Show visual examples of places, things, or concepts.
    *   **How to do it:** Output \`!gallery["search query"]\` on a separate line.

**General Guidelines:**

1.  **Language**: Respond in ${userLanguageName}.
2.  **Identity**: Created by Vatistas Dimitris (X: @vatistasdim, Insta: @vatistasdimitris).
3.  **No Inline Links**: Do NOT include markdown links \`[text](url)\` in your response unless specifically asked for a list of links. Citations are handled automatically.
4.  **Places & Lists**:
    *   When listing places/products, show **5 images** for each item using the gallery syntax.
    *   Include **Rating**, **Reviews count**, **Best for**, **Worst for**.
    *   Format:
        ### [Item Name]
        **Rating**: ⭐⭐⭐⭐½ (1.2k reviews)
        !gallery["[Item Name]"]
        [Description]
        **Best for**: [Text] | **Worst for**: [Text]
5.  **Proactive Creation**: If a user asks for a "timer", build a React Timer app. If they ask for "analysis", use Python. If they ask to "create a file", write Python to generate it. Don't just talk; create.

Think step-by-step.`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n${baseSystemInstruction}` : baseSystemInstruction;
        
        const googleSearchTool: FunctionDeclaration = {
            name: 'google_search',
            description: 'Get information from the web using Google Search.',
            parameters: {
                type: Type.OBJECT,
                properties: {
                  query: { type: Type.STRING, description: 'The search query.' },
                },
                required: ['query'],
            },
        };

        const config: GenerateContentConfig = {
            systemInstruction: finalSystemInstruction,
            tools: [{ functionDeclarations: [googleSearchTool] }],
        };

        try {
            const initialStream = await ai.models.generateContentStream({ model, contents, config });
            let functionCallToHandle: FunctionCall | null = null;

            for await (const chunk of initialStream) {
                if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                    functionCallToHandle = chunk.functionCalls[0];
                    break;
                }
                if (chunk.text) write({ type: 'chunk', payload: chunk.text });
                if (chunk.usageMetadata) write({ type: 'usage', payload: chunk.usageMetadata });
            }

            if (functionCallToHandle) {
                const functionCall = functionCallToHandle;
                if (functionCall.name !== 'google_search') throw new Error(`Unsupported function: ${functionCall.name}`);

                write({ type: 'searching' });
                const query = functionCall.args.query as string;
                
                const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
                const cseId = process.env.GOOGLE_CSE_ID;
                if (!apiKey || !cseId) throw new Error("Search config missing.");

                const searchResponse = await fetch(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}&num=5`);
                const searchResults = await searchResponse.json();
                
                if (searchResults.items) {
                    const groundingChunks = searchResults.items.map((item: any) => ({
                        web: { uri: item.link, title: item.title },
                    }));
                    write({ type: 'sources', payload: groundingChunks });
                }

                const formattedResults = searchResults.items?.map((item: any) => 
                    `Title: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}`
                ).join('\n\n---\n\n') || "No results.";

                const searchContext = (searchContextTranslations[langCode] || searchContextTranslations.en)
                    .replace('{query}', query)
                    .replace('{results}', formattedResults);
                
                const newContents: Content[] = [
                    ...contents,
                    { role: 'model', parts: [{ functionCall }] },
                    { role: 'function', parts: [{ functionResponse: { name: 'google_search', response: { content: searchContext } } }] },
                ];
                
                const finalStream = await ai.models.generateContentStream({ model, contents: newContents, config });
                for await (const chunk of finalStream) {
                    if (chunk.text) write({ type: 'chunk', payload: chunk.text });
                    if (chunk.usageMetadata) write({ type: 'usage', payload: chunk.usageMetadata });
                }
            }
        } finally {
            write({ type: 'end' });
            res.end();
        }
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: { message: error instanceof Error ? error.message : String(error) } });
    }
}