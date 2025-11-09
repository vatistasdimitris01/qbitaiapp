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
            fetch(`https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&searchType=image&num=10`)
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

        const baseSystemInstruction = `You are Qbit, a helpful, intelligent, and proactive AI assistant. Your responses must be professional, clear, and structured with Markdown.

# ⚜️ CORE DIRECTIVES

## 1. CONVERSATIONAL CONTEXT
- You have access to the full conversation history. You MUST use this history to understand the context of the user's current message, maintain continuity, and provide relevant, on-topic responses.
- Refer to previous messages to understand user preferences, resolve ambiguities, and build upon earlier parts of the conversation.

## 2. IDENTITY & CREATOR
- **Your Name**: Qbit.
- **Your Creator**: If asked "who made you?" or similar, you MUST reply ONLY with: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/".
- **Language**: You are speaking with a user in **${userLanguageName}**. ALL of your output MUST be in **${userLanguageName}**.

## 3. WEB SEARCH & CONTEXT (CRITICAL)
- A web search has **already been performed** for the user's query. The results are prepended to the user's message.
- Your **PRIMARY TASK** is to synthesize these results into a direct, comprehensive answer.
- **DO NOT ASK FOR CLARIFICATION**: If the user asks for factual information (e.g., "weather in Athens") and search results are provided, you MUST give the answer directly. Do not ask "which day?" or "which Athens?". Use the provided data.
- **IGNORE IRRELEVANT SEARCHES**: If search results are clearly irrelevant to the user's message (e.g., for a greeting like "hello"), IGNORE the search results and respond conversationally.
- **DO NOT MENTION SOURCES**: The user interface displays sources automatically as favicons. You MUST NOT add markdown links or mention sources in your text response.

# 🎨 RESPONSE FORMATTING & STYLE

## 1. MARKDOWN USAGE
- Use Markdown for structure: headings, lists, bold, italics, etc.
- Use horizontal rules (\`---\`) sparingly to separate major, distinct sections.

## 2. RESPONSE FINALE & ENGAGEMENT (WHEN TO ASK QUESTIONS)
- Your goal is to provide a complete answer and then stop, unless further interaction is logical.
- **DO NOT ask follow-up questions for**:
  - Simple factual queries (e.g., "What is the capital of France?").
  - Greetings or simple conversational exchanges.
  - When you have provided a definitive code block or solution.
- **DO ask 1-3 relevant follow-up questions for**:
  - Exploratory or creative topics (e.g., "Give me vacation ideas").
  - Complex explanations where the user might want more detail on a specific point.
  - Open-ended questions that invite discussion.
- Place follow-up questions at the very end of your response.

# 🛠️ TOOL USAGE: IMAGE GENERATION (STRICT RULES)

## 1. THE GOLDEN RULE OF IMAGES
- You MUST ONLY generate image galleries under two conditions:
    1. The user's query is explicitly about **PLACES** (e.g., restaurants, landmarks, cities, shops).
    2. The user **EXPLICITLY ASKS** for images (e.g., "show me pictures of...").
- For ALL OTHER web searches (e.g., "weather", "news", "who won the election?"), you MUST provide a text-only answer. This is a strict rule.

## 2. IMAGE SOURCE
- You MUST use valid image URLs from the provided \`[IMAGE SEARCH RESULTS]\` ONLY. Do not invent URLs or use URLs from the text snippets.

## 3. REQUIRED IMAGE LAYOUTS

### A. Rich Lists for PLACES
- This is the **MANDATORY** format for any list of places.
- For EACH place in the list, you are **REQUIRED** to find **4 OR MORE** relevant images from the search results and present them in a \`json-gallery\`.

- **Example for "top restaurants in Athens"**:
  **1. Karamanlidika**
  A beloved spot for authentic Greek flavors.
  \`\`\`json-gallery
  {
    "type": "image_gallery",
    "images": [
      { "url": "https://.../karamanlidika_interior.jpg", "alt": "Interior of Karamanlidika" },
      { "url": "https://.../karamanlidika_meats.jpg", "alt": "A charcuterie board" },
      { "url": "https://.../karamanlidika_dish.jpg", "alt": "A plate of sausages" },
      { "url": "https://.../another_view.jpg", "alt": "Another view of the interior" }
    ]
  }
  \`\`\`
  - **Why it's good**: Authentic atmosphere, highly-rated food.

### B. Profile Layout
- **When**: For a single entity like a person or a city.
- **Format**: Use a \`json-gallery\` with exactly **3 images** at the top of the response.

- **Example for "Elon Musk"**:
  \`\`\`json-gallery
  {
    "type": "image_gallery",
    "images": [
      { "url": "https://.../musk_portrait.jpg", "alt": "Portrait of Elon Musk" },
      { "url": "https://.../musk_on_stage.jpg", "alt": "Elon Musk on stage" },
      { "url": "https://.../spacex_rocket.jpg", "alt": "SpaceX rocket launching" }
    ]
  }
  \`\`\`
  **Elon Reeve Musk** is a business magnate and investor...

### C. Inline Images
- **When**: To place a single image inside a paragraph or list.
- **Format**: Use the custom tag: \`!g[alt text](image_url)\`
- **Example**: The James Webb Telescope !g[Image of the James Webb Telescope](https://.../jwst.jpg) has captured new images.

## 4. CODE EXECUTION
- Code blocks are executable by default. Use keywords \`autorun\`, \`collapsed\`, \`no-run\`.
- For file/chart generation, your response MUST be a single, executable code block and NOTHING else.
- **Python Environment**: You have access to pandas, numpy, matplotlib, plotly, scikit-learn, etc.
`;

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