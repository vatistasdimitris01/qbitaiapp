
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Content, Part, Chat } from "@google/genai";
import formidable from 'formidable';
import fs from 'fs';

// --- Type Definitions ---
interface ApiAttachment {
    mimeType: string;
    data: string; // base64 encoded string
}

interface HistoryItem {
    type: 'USER' | 'AI_RESPONSE';
    content: string;
    files?: ApiAttachment[];
}

// --- Vercel Configuration ---
export const config = {
  api: {
    bodyParser: false,
  },
};

// --- Helper Functions ---
const fileToGenerativePart = async (file: formidable.File): Promise<Part> => {
    const fileData = await fs.promises.readFile(file.filepath);
    return {
        inlineData: {
            data: fileData.toString('base64'),
            mimeType: file.mimetype || 'application/octet-stream',
        },
    };
};

// --- Main API Handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const form = formidable({});
        const [fields, files] = await form.parse(req);
        
        const payloadStr = Array.isArray(fields.payload) ? fields.payload[0] : fields.payload;
        if (!payloadStr) {
            return res.status(400).json({ error: 'Missing payload in form data' });
        }
        
        const { history, message, personaInstruction } = JSON.parse(payloadStr) as {
            history: HistoryItem[];
            message: string;
            personaInstruction?: string;
        };

        const ai = new GoogleGenAI({apiKey: process.env.API_KEY!});

        const baseSystemInstruction = `You are Qbit, a helpful, intelligent, and proactive assistant. 🤖

Your primary function is to answer questions using your internal knowledge. You must only use the tools provided when absolutely necessary and according to the following strict rules.

---
# ⚙️ TOOL USAGE RULES

You have two tools: \`googleSearch\` and \`codeExecution\`.

## When to use \`googleSearch\`
- **DEFAULT BEHAVIOR**: DO NOT use this tool. Answer from your internal knowledge.
- **PERMITTED USE**: You may ONLY use \`googleSearch\` if the user's query **explicitly** asks for:
    1.  Real-time information (e.g., "what's the weather in London?", "latest stock prices").
    2.  News or information about very recent events (e.g., "what happened in tech this week?").
    3.  Specific, obscure facts that you are certain are not in your training data.
- **PROHIBITED USE**: You MUST NOT use \`googleSearch\` for:
    - Greetings, pleasantries, or small talk (e.g., "hello", "how are you", "hey").
    - General conversation or creative tasks (writing poems, stories).
    - Questions about yourself or your capabilities (e.g., "who are you?").
    - General knowledge questions that are not time-sensitive (e.g., "what is the capital of France?").

## When to use \`codeExecution\`
- Use this tool when asked to perform calculations, analyze data, generate plots/charts, or solve problems with Python code.
- Your Python environment includes libraries like Matplotlib, Plotly, Pandas, and NumPy.

---
# 💡 CORE SYSTEM SPECIFICATION

## 🧩 IDENTITY & PERSONALITY
- Your persona is a precise, professional, and engaging AI assistant.
- If the user asks “who made you?”, “who created you?”, or any similar question, you MUST respond with the following text: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/". Do not add any conversational filler before or after this statement.

## 📝 OUTPUT FORMATTING
- **Markdown Usage**: Use Markdown extensively to structure your responses for clarity (headings, lists, bold text, etc.).
- **Code Blocks**:
    - All code you generate MUST be inside a markdown code block with the correct language identifier (e.g., \`\`\`python).
    - To make a code block executable, add keywords like \`autorun\` or \`title="My Chart"\` to the language line. E.g., \`\`\`python autorun title="Data Analysis"\`.
- **Citations**: When you use information from Google Search, you MUST cite your sources. The grounding metadata will be available to you.
- **Response Finale**: At the end of a comprehensive response, ask a context-aware follow-up question to encourage further interaction.

---
## 🎯 CORE PHILOSOPHY
Think like an engineer. Write like a professional. Act like a collaborator. Deliver with clarity and precision. ✨`;

        const systemInstruction = personaInstruction ? `${personaInstruction}\n\n---\n\n${baseSystemInstruction}` : baseSystemInstruction;

        const historyForApi: Content[] = history.map(msg => {
            const parts: Part[] = [{ text: msg.content }];
            if (msg.files) {
                msg.files.forEach(file => {
                    parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
                });
            }
            return {
                role: msg.type === 'USER' ? 'user' : 'model',
                parts,
            };
        });

        const messageParts: Part[] = [{ text: message }];
        if (files.file) {
            const fileList = Array.isArray(files.file) ? files.file : [files.file];
            const fileParts = await Promise.all(fileList.map(fileToGenerativePart));
            messageParts.push(...fileParts);
        }

        const chat: Chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            history: historyForApi,
            config: {
                systemInstruction,
                tools: [{ codeExecution: {} }, { googleSearch: {} }],
            }
        });

        const result = await chat.sendMessageStream({ parts: messageParts });

        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        
        let sourcesSent = false;
        
        for await (const chunk of result.stream) {
            const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
            if (groundingChunks && groundingChunks.length > 0 && !sourcesSent) {
                res.write(JSON.stringify({ type: 'sources', payload: groundingChunks }) + '\n');
                sourcesSent = true; 
            }
            
            const text = chunk.text;
            if (text) {
                res.write(JSON.stringify({ type: 'chunk', payload: text }) + '\n');
            }

            if (chunk.usageMetadata) {
                res.write(JSON.stringify({ type: 'usage', payload: chunk.usageMetadata }) + '\n');
            }
        }
        
        res.write(JSON.stringify({ type: 'end' }));
        res.end();

    } catch (error: any) {
        console.error('Error in sendMessage API:', error);
        if (!res.headersSent) {
             res.status(500).json({ error: error.message || 'An internal server error occurred' });
        } else {
            res.write(JSON.stringify({ type: 'error', payload: error.message || 'An internal server error occurred' }));
            res.end();
        }
    }
}
