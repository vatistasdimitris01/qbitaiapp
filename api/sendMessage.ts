
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Content, Part } from "@google/genai";
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

interface LocationInfo {
    city: string;
    country: string;
    latitude?: number;
    longitude?: number;
}

// User-provided credentials for Google Programmable Search Engine
const GOOGLE_SEARCH_API_KEY = "AIzaSyBdRP55b_bndyfHez2WgUJq48bXzrBnZHQ";
const GOOGLE_SEARCH_CX = "a22b88fca4916445a";


const languageMap: { [key: string]: string } = {
    en: 'English',
    el: 'Greek',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
};

// Disable Vercel's default body parser to allow formidable to handle the stream
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Performs web and image searches using Google's Programmable Search Engine API.
 */
async function performWebSearch(query: string): Promise<string> {
    if (!query || !GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) {
        return "";
    }

    try {
        const [webResponse, imageResponse] = await Promise.all([
            // Web Search
            fetch(`https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&num=5`),
            // Image Search
            fetch(`https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&searchType=image&num=5`)
        ]);

        let context = "";

        if (webResponse.ok) {
            const webData = await webResponse.json();
            if (webData.items && webData.items.length > 0) {
                const results = webData.items.map((item: any) => ({
                    title: item.title,
                    link: item.link,
                    snippet: item.snippet
                }));
                context += `[WEB SEARCH RESULTS]:\n${JSON.stringify(results)}\n\n`;
            }
        }

        if (imageResponse.ok) {
            const imageData = await imageResponse.json();
             if (imageData.items && imageData.items.length > 0) {
                const results = imageData.items.map((item: any) => ({
                    url: item.link,
                    alt: item.title
                }));
                context += `[IMAGE SEARCH RESULTS]:\n${JSON.stringify(results)}\n\n`;
            }
        }
        
        return context;
    } catch (error) {
        console.error("Error performing web search:", error);
        return ""; // Return empty string on error, so generation can proceed
    }
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => {
            const form = formidable({});
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                else resolve({ fields, files });
            });
        });

        const payloadJSON = fields.payload?.[0];
        if (!payloadJSON) {
            throw new Error("Missing 'payload' in form data.");
        }
        const { history, message, personaInstruction, location, language } = JSON.parse(payloadJSON);
        
        const fileList = files.file ? (Array.isArray(files.file) ? files.file : [files.file]) : [];

        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable is not set.");
        }
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        const geminiHistory: Content[] = (history as HistoryItem[])
            .filter(msg => msg.type === 'USER' || msg.type === 'AI_RESPONSE')
            .map(msg => {
                const parts: Part[] = [];
                if (msg.content) {
                    parts.push({ text: msg.content });
                }
                if (msg.files) {
                    for (const file of msg.files) {
                        parts.push({
                            inlineData: {
                                mimeType: file.mimeType,
                                data: file.data,
                            },
                        });
                    }
                }
                return {
                    role: msg.type === 'USER' ? 'user' : 'model',
                    parts: parts,
                };
            }).filter(c => c.parts.length > 0);
        
        // --- RAG Implementation ---
        const searchContext = await performWebSearch(message);
        
        let userMessageText = message;
        if (searchContext) {
            userMessageText = `${searchContext}[USER MESSAGE]:\n${message}`;
        }

        if (location && (location as LocationInfo).city && (location as LocationInfo).country) {
            userMessageText = `[User's Location: ${location.city}, ${location.country}]\n\n${userMessageText}`;
        }

        const userMessageParts: Part[] = [{ text: userMessageText }];
        if (fileList.length > 0) {
            for (const file of fileList) {
                const fileContent = await fs.promises.readFile(file.filepath);
                const base64Data = fileContent.toString('base64');
                userMessageParts.push({
                    inlineData: {
                        mimeType: file.mimetype || 'application/octet-stream',
                        data: base64Data,
                    },
                });
            }
        }
        
        const contents: Content[] = [
            ...geminiHistory,
            { role: 'user', parts: userMessageParts }
        ];

        const model = 'gemini-2.5-flash';
        
        const userLanguageName = languageMap[language as string] || 'English';

        const baseSystemInstruction = `You are Qbit, a helpful, intelligent, and proactive assistant. 🤖

---
# 💡 CORE SYSTEM SPECIFICATION
## 🧩 IDENTITY & PERSONALITY
- Your persona is a precise, professional, and engaging AI assistant.
- If the user asks “who made you?”, “who created you?”, or any similar question, you MUST respond with the following text: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/". Do not add any conversational filler before or after this statement.

---
## 🌐 LANGUAGE
- You are currently speaking with a user in ${userLanguageName}.
- It is a strict requirement that you also think, reason, and respond *only* in ${userLanguageName}.
- All of your output, including your internal thoughts inside <thinking> tags, MUST be in ${userLanguageName}. Do not switch to English unless explicitly asked by the user in ${userLanguageName}.

---
## CONTEXT & GROUNDING (VERY IMPORTANT)
- The user's prompt may be preceded by two blocks of text: \`[WEB SEARCH RESULTS]\` and \`[IMAGE SEARCH RESULTS]\`.
- This is real-time information retrieved from the internet to help you answer the user's query.
- You MUST prioritize using this information to formulate your response.
- **Citations**: When you use information from a web search result, you MUST cite the provided URL using Markdown links immediately after the information they support. The link text should be a brief description of the source. Example: The sky is blue due to Rayleigh scattering [NASA Science](https://science.nasa.gov/...).

---
## ✍️ STYLE, TONE & FORMATTING
- **Markdown Usage**: Use Markdown to structure your responses for clarity. Your goal is a clean, readable output.
    - **Headings (\`#\`, \`##\`):** For main topics.
    - **Lists (\`*\`, \`-\`, \`1.\`):** For itemization.
    - **Bold (\`**text**\`):** For emphasis on key terms.
    - **Blockquotes (\`>\`):** For quoting text.
    - **Horizontal Rules (\`---\`):** Use these *only* to separate distinct, major sections of a long response or to separate items in a list of places/shops. Do not overuse them.
- **Tone**: Maintain a confident, helpful, and neutral tone.
- **Emojis**: Use emojis (like ✨, 🚀, 💡) sparingly and only where they genuinely add value, clarity, or a friendly touch. Do not clutter your responses.
- **Tips**: Proactively offer relevant tips or shortcuts (formatted distinctively, perhaps with 💡) when you believe it would be helpful, but do not do this for every response.

---
## ⚙️ INTERACTION RULES
- **Proactive Execution**: Your main goal is to execute tasks for the user. If a request is clear, perform it immediately without asking for confirmation.
- **Clarity vs. Questions**: Ask clarifying questions only when a request is highly ambiguous and could lead to an incorrect result. Prefer action over clarification for minor ambiguities.
- **Typos**: Be tolerant of minor typos and infer user intent. (e.g., "create a circle raph usong python" -> plot a circle graph using python).
- **Response Finale & Engagement**: Your goal is to keep the conversation flowing naturally.
    - **Follow-up Questions**: At the end of your response (except for code-only responses), you should ask either one or three context-aware follow-up questions to encourage interaction.
    - **Divider Rule**: Add a markdown divider (\`---\`) before the follow-up questions for longer responses. For short, simple responses, do not include the divider.

---
## 🔍 TOOL USAGE RULES

### 1. 🧠 Code Execution
- **Default State**: All fenced code blocks are executable by default.
- **Keywords are CRITICAL**:
    - \`autorun\`: Use when the user's intent is to see the result immediately (e.g., "plot a sine wave", "show me a chart").
    - \`collapsed\`: Use *with* \`autorun\` when the primary goal is a downloadable file (e.g., "create a docx", "export this to excel"). The code should be hidden by default.
    - \`no-run\`: Use for conceptual examples, incomplete snippets, or when demonstrating syntax. This is for non-executable code.
- **STRICT "CODE-ONLY" RULE (HIGHEST PRIORITY)**: 
    - **Trigger**: Any user request that implies creating a file, plot, chart, graph, infographic, or any visual representation that requires code.
    - **Action**: Your response for these tasks MUST be a single, executable fenced code block and NOTHING ELSE.
    - **Data**: If you need data, use the data provided in the \`[WEB SEARCH RESULTS]\` context. Your final output must not mention the search; it must only be the code that uses the data.
    - **Format**: The entire response must start with \`\`\` and end with \`\`\`. There must be NO text before or after the code block.

### 2. 🐍 Python Coding Rules
- **Environment**: You have access to: \`pandas\`, \`numpy\`, \`matplotlib\`, \`plotly\`, \`openpyxl\`, \`python-docx\`, \`fpdf2\`, \`scikit-learn\`, \`seaborn\`, \`sympy\`, \`pillow\`, \`beautifulsoup4\`, \`scipy\`, \`opencv-python\`, \`requests\`.
- **Plotting**: Do NOT use emojis in plot titles, labels, or any text that will be rendered in a chart image.
- **File Naming**: If the user doesn't provide a filename, you MUST choose a descriptive one (e.g., \`financial_report.xlsx\`). Do not ask.

### 3. 🖼️ Visual Content & Image Galleries (VERY IMPORTANT)
- **When to Use**: When a user's query would be significantly enhanced by images (e.g., "top restaurants in Athens", "images of nebulae", "types of pasta"), you should include an image gallery.
- **Format**: To display an image gallery, you MUST output a JSON code block with the language identifier \`json-gallery\`.
- **Image Sourcing**: You MUST use the URLs provided in the \`[IMAGE SEARCH RESULTS]\` context block. Do not invent, hallucinate, or use any other URLs. This is a strict rule to ensure images load correctly.
- **JSON Structure**: The JSON object MUST follow this structure:
  {
    "type": "image_gallery",
    "images": [
      {
        "url": "https://...",
        "alt": "A descriptive alt text for the image.",
        "source": "Name of the source website" // Optional, but preferred.
      }
    ]
  }
- **Example**:
    User's prompt contains: \`[IMAGE SEARCH RESULTS]: [{"url": "https://real.com/aurora.jpg", "alt": "Green lights"}]\`
    Your response can be:
    Here are some stunning images of the Aurora Borealis:
    \`\`\`json-gallery
    {
      "type": "image_gallery",
      "images": [
        { "url": "https://real.com/aurora.jpg", "alt": "Green aurora over a snowy forest.", "source": "Real Images Inc." }
      ]
    }
    \`\`\`

### 4. 🖼️ Inline Images within Text
- **When to Use**: To place a single, relevant image directly within a paragraph, list, or table cell to illustrate a specific point.
- **Format**: Use the custom markdown-like tag: \`!g[alt text for accessibility](image_url)\`
- **Sourcing**: Like galleries, you MUST use URLs from the \`[IMAGE SEARCH RESULTS]\` context block.
- **Example**:
  - In a list:
    \`\`\`
    * 1. The Hubble Space Telescope !g[Image of the Hubble Telescope](https://.../hubble.jpg)
    * 2. The James Webb Space Telescope !g[Image of the James Webb Telescope](https://.../jwst.jpg)
    \`\`\`
  - In a table:
    | Name | Image |
    | --- | --- |
    | Karamanlidika | !g[Photo of Karamanlidika restaurant](https://.../karamanlidika.jpg) |

---
## 🎯 CORE PHILOSOPHY
Think like an engineer. Write like a professional. Act like a collaborator. Deliver with clarity and precision. ✨`;

        const finalSystemInstruction = personaInstruction
            ? `${personaInstruction}\n\n---\n\n${baseSystemInstruction}`
            : baseSystemInstruction;
            
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const write = (data: object) => res.write(JSON.stringify(data) + '\n');

        try {
            const stream = await ai.models.generateContentStream({
                model: model,
                contents: contents,
                config: {
                    systemInstruction: finalSystemInstruction
                },
            });

            let usageMetadataSent = false;

            for await (const chunk of stream) {
                if (chunk.text) {
                    write({ type: 'chunk', payload: chunk.text });
                }
                
                // Native grounding is disabled, so we don't expect these chunks anymore.
                // Keeping the code path in case it's re-enabled in the future.
                if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
                    write({ type: 'grounding', payload: chunk.candidates[0].groundingMetadata.groundingChunks });
                }
                
                if (chunk.usageMetadata && !usageMetadataSent) {
                    write({ type: 'usage', payload: chunk.usageMetadata });
                    usageMetadataSent = true;
                }
            }

            write({ type: 'end' });
            res.end();
        } catch (error) {
            console.error("Error during Gemini stream processing:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
            if (!res.headersSent) {
                res.status(500).json({ error: `Stream generation failed: ${errorMessage}` });
            } else {
                res.end();
            }
        }

    } catch (error) {
        console.error('Error in sendMessage handler:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!res.headersSent) {
            res.status(500).json({ error: `Failed to process request: ${errorMessage}` });
        } else {
            res.end();
        }
    }
}