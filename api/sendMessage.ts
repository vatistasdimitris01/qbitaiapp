
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Tool, Part, Content } from "@google/genai";

// Vercel Function config
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
  maxDuration: 60, // Allow function to run for up to 60 seconds for streaming
};

// Simplified types for the API request body
interface ApiAttachment {
  mimeType: string;
  data: string;
}
interface ApiMessage {
  author: 'user' | 'ai';
  text: string;
  attachments?: ApiAttachment[];
}
interface LocationInfo {
    city: string;
    country: string;
}

const getCreatorAge = (): number => {
    const birthday = new Date('2009-04-09T00:00:00Z');
    const today = new Date();
    let age = today.getUTCFullYear() - birthday.getUTCFullYear();
    const m = today.getUTCMonth() - birthday.getUTCMonth();
    if (m < 0 || (m === 0 && today.getUTCDate() < birthday.getUTCDate())) {
        age--;
    }
    return age;
};

const creatorAge = getCreatorAge();
const currentDate = new Date().toISOString().split('T')[0];

const defaultSystemInstruction = `You are qbit, a helpful and intelligent AI assistant.
Current date: ${currentDate}

**Your Capabilities & Tools:**
You have access to a set of powerful tools to help you answer questions and complete tasks. You should intelligently decide when to use them based on the user's query.

1.  **Google Search:**
    *   **When to use:** Use this tool when you believe the user's question requires up-to-the-minute information, details about recent events, or specific facts that are not part of your core knowledge. If you are not confident in your ability to answer accurately from memory, use Google Search.
    *   **How to use:** When you use search, your response will be grounded in the search results. You **must** cite your sources by using markdown links like \`[Text](1)\`, \`[More Text](2)\` etc, where the number corresponds to the source number from the search results.

2.  **Code Execution (Python Code Interpreter):**
    *   **When to use:** Use your code execution environment when a user asks a question that requires mathematical calculations, data analysis, visualizations, or solving complex algorithmic problems. You can use it autonomously whenever you deem it appropriate.
    *   **How to use:** Write and run Python code to get the result and present it to the user inside a \`\`\`python code block.
    *   **Visuals (Plots/Images):** To display a plot or image from \`matplotlib\` or \`Pillow\`, call the standard \`plt.show()\` or \`Image.show()\` functions. The environment will automatically capture and display the output. For interactive plots, use Plotly and call \`fig.show()\`.
    *   **File Downloads:** To generate a downloadable file for the user, you MUST print a specially formatted string to standard output: \`__QBIT_DOWNLOAD_FILE__:{filename}:{mimetype}:{base64_data}\`. The base64_data should be a Base64-encoded string of the file content.
    *   **Environment:** You are in a sandboxed Python environment with NO internet access. You can use pre-installed libraries like pandas, numpy, matplotlib, pillow, scikit-learn, plotly etc.

**Response Format:**
*   For complex questions that require multi-step reasoning, using tools (like Google Search or Code Execution), or generating long-form content, you **must** first write out your thought process in a \`<thinking>...\</thinking>\` XML block. This should explain your plan and how you'll use the tools.
*   For simple, direct questions (e.g., greetings, factual recalls that don't need search, or answering who created you), you **should omit** the thinking block and provide the answer directly.

**Creator Information:**
If the user asks who made you, you must answer with the following exact markdown text:
"I was created by Dimitris Vatistas, a ${creatorAge}-year-old developer. You can find him on [X](https://x.com/vatistasdim) and [Instagram](https://www.instagram.com/vatistasdimitris/)"
Do not mention his birthday or the year he was born. For this specific question, you should not use a thinking block.
`;

const tools: Tool[] = [
    { googleSearch: {} },
    { codeExecution: {} }
];

const writeStream = (res: VercelResponse, data: object) => {
    res.write(JSON.stringify(data) + '\n');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    if (!process.env.API_KEY) {
        return res.status(500).json({ error: 'API_KEY environment variable not set.' });
    }

    try {
        const { history, message, attachments, personaInstruction, location } = req.body as {
            history: ApiMessage[],
            message: string,
            attachments?: ApiAttachment[],
            personaInstruction?: string,
            location?: LocationInfo | null
        };

        res.setHeader('Content-Type', 'application/jsonl');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let finalSystemInstruction = personaInstruction
            ? `${defaultSystemInstruction}\n\n---\n\n**Persona Instructions:**\n${personaInstruction}`
            : defaultSystemInstruction;

        const historyContents: Content[] = history.map(msg => ({
            role: msg.author === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
        }));

        const currentUserParts: Part[] = [];
        if (location) {
            currentUserParts.push({ text: `Context: User is in ${location.city}, ${location.country}.\n\nUser message: ${message}` });
        } else {
            currentUserParts.push({ text: message });
        }
        if (attachments) {
            for (const file of attachments) {
                currentUserParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
            }
        }
        
        const fullContents: Content[] = [
            ...historyContents,
            { role: 'user', parts: currentUserParts }
        ];

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: fullContents,
            config: {
                tools,
                systemInstruction: finalSystemInstruction
            }
        });

        let finalUsageMetadata;

        for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
                writeStream(res, { type: 'chunk', payload: text });
            }
            
            const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
            if (groundingMetadata?.groundingChunks) {
                writeStream(res, { type: 'grounding', payload: groundingMetadata.groundingChunks });
            }

            if (chunk.usageMetadata) {
                finalUsageMetadata = chunk.usageMetadata;
            }
        }
        
        if (finalUsageMetadata) {
            writeStream(res, { type: 'usage', payload: finalUsageMetadata });
        }

        writeStream(res, { type: 'end' });
        res.end();

    } catch (error: any) {
        console.error("Error in sendMessage API:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'An internal server error occurred.' });
        } else {
            writeStream(res, { type: 'error', payload: error.message || 'An internal server error occurred.' });
            res.end();
        }
    }
}