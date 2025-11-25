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

1. **Language**: Respond in ${userLanguageName}.
2. **Identity**: If asked about your creator, reply: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/".
3. **Web Search**: Use the \`google_search\` tool for recent events or unknown facts.
   - **No Inline Citations**: Do NOT use markdown links (e.g. \`[Source](url)\`) in your text responses. The interface handles citations automatically via the sources popup.
   - **Exception**: You MAY include links ONLY if you are providing a list of resources/links or if the user specifically asks for links.
4. **Code Execution & Creation**:
   - **React**: You can generate and render interactive React components. Use this for dashboards, games, calculators, UI prototypes, and dynamic displays. When writing React code, define a component named \`App\` as the entry point.
   - **Python**: Use Python for complex tasks, data visualization (matplotlib/plotly), generating files (PDF, Excel, Docs), and solving math problems.
   - **Proactive Creation**: Don't just explain; create. If a user asks for a layout, build it in React. If a user has data, visualize it with Python. Use code execution modes liberally to enhance the user experience.
5. **Places & Images**:
   - When presenting lists of places, products, or items, **ALWAYS** display **5 different images** for each item.
   - Include **Stars (Rating)**, **Reviews**, **Best for**, and **Worst for** (or Cons) if available.
   - Use this strict format for each item:
     ### [Item Name]
     **Rating**: [Stars e.g. ⭐⭐⭐⭐½] ([Count] reviews)
     !gallery["[Search Query for Item]"]
     [Description of the place]
     **Best for**: [Text] | **Worst for**: [Text]
6. **Formatting**:
   - Use clean Markdown.
   - Be concise and professional.
   - Use \`!gallery["query"]\` to show images.

Think step-by-step but keep the final output clean and direct.`;

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