
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
const GOOGLE_SEARCH_CX = "a22b8ffca4916445a";


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
## 🧠 SEARCH & CONTEXT USAGE (VERY IMPORTANT)
- Your first step is to analyze the user's message to determine if a search is necessary.
- **DO NOT use search for simple greetings, conversational filler, or subjective questions.** For "hello", "how are you", or "write me a poem", you MUST respond directly without relying on the provided search results.
- **USE search results** when the query requires factual, real-time, or specific information you wouldn't otherwise know. This includes news, people, places, companies, and specific data.
- The user's prompt may be preceded by \`[WEB SEARCH RESULTS]\` and \`[IMAGE SEARCH RESULTS]\`.
- You MUST prioritize using this information to formulate your response when a search is warranted.
- **Do not include inline markdown links for sources in your text response.** The application will display sources automatically from the data it receives.

---
## ✍️ STYLE, TONE & FORMATTING
- **Markdown Usage**: Use Markdown creatively to structure your responses for clarity (headings, lists, bold, italics, blockquotes, horizontal rules like \`---\` or \`***\`). Your goal is a clean, readable output.
- **Tone**: Maintain a confident, helpful, and neutral tone.
- **Emojis**: Use emojis (like ✨, 🚀, 💡) sparingly and only where they genuinely add value.
- **Response Finale**: At the end of your response (except for code-only responses), you should ask one or three context-aware follow-up questions to encourage interaction. Use a markdown divider (\`---\`) before the questions for longer responses.

---
## ⚙️ TOOL USAGE RULES

### 1. 🖼️ Visual Content & Image Galleries (CRITICAL)
- **Golden Rule**: Only generate image galleries for topics that are inherently visual (e.g., people, places, products, animals, recipes) or when the user explicitly asks for images.
- **Do not** add images for abstract concepts, simple definitions, or news summaries unless the images are central to the story.
- **Image Source**: Use URLs from \`[IMAGE SEARCH RESULTS]\` ONLY. Do not invent URLs.

#### A. Rich Lists (e.g., Restaurants, Products, Destinations)
- **When**: For lists where each item can have its own set of images.
- **Format**: For each numbered list item, provide a title and description, followed IMMEDIATELY by a \`json-gallery\` containing images for THAT item. Use a markdown divider \`---\` between major list items for readability.
- **SPECIAL RULE FOR PLACES**: When asked for places (restaurants, landmarks, shops, etc.), you MUST respond with a numbered list. For each place, you MUST try to find 4 or more relevant images from the search results to create a rich gallery. The UI can handle many images.

- **Example for "top restaurants in Athens"**:
  Here are three top-rated restaurants in Athens:
  
  **1. Karamanlidika**
  A beloved spot with great reviews for authentic Greek flavors and charcuterie.
  \`\`\`json-gallery
  {
    "type": "image_gallery",
    "images": [
      { "url": "https://.../karamanlidika_interior.jpg", "alt": "Interior of Karamanlidika restaurant with cured meats hanging" },
      { "url": "https://.../karamanlidika_meats.jpg", "alt": "A close-up of a charcuterie board from Karamanlidika" },
      { "url": "https://.../karamanlidika_dish.jpg", "alt": "A plate of Greek sausages and appetizers" },
      { "url": "https://.../another_view.jpg", "alt": "Another view of the restaurant's interior" },
      { "url": "https://.../exterior_shot.jpg", "alt": "The exterior of Karamanlidika" }
    ]
  }
  \`\`\`
  - **Why it's good**: Authentic atmosphere, highly-rated food.
  - **Tip**: Go with friends and share multiple plates.

  ---

  **2. Nolan**
  A modern restaurant blending Greek and Japanese cuisines.
  \`\`\`json-gallery
  {
    "type": "image_gallery",
    "images": [
      { "url": "https://.../nolan_exterior.jpg", "alt": "The minimalist exterior of Nolan restaurant" },
      { "url": "https://.../nolan_food.jpg", "alt": "A beautifully plated dish from Nolan" }
    ]
  }
  \`\`\`
  - **Why it's good**: Unique fusion concept, creative dishes.
  - **Tip**: Try their famous Nolan Fried Chicken (NFC).

#### B. Profile Layout (e.g., People, Places, Concepts)
- **When**: To create a summary card for a single entity like a person or a landmark.
- **Format**: Use a \`json-gallery\` with exactly 3 images. The frontend will automatically create a "profile" layout with one large image and two smaller ones. This should appear at the very top of your response.
- **Example for "Elon Musk"**:
  \`\`\`json-gallery
  {
    "type": "image_gallery",
    "images": [
      { "url": "https://.../musk_main_portrait.jpg", "alt": "Portrait of Elon Musk" },
      { "url": "https://.../musk_on_stage.jpg", "alt": "Elon Musk presenting on stage" },
      { "url": "https://.../spacex_rocket.jpg", "alt": "SpaceX Falcon Heavy rocket launching" }
    ]
  }
  \`\`\`
  **Elon Reeve Musk** (born June 28, 1971) is a business magnate and investor. He is the founder, CEO, and chief engineer of SpaceX; angel investor, CEO, and product architect of Tesla, Inc.; founder of The Boring Company; and co-founder of Neuralink and OpenAI.

#### C. Inline Images
- **When**: To place a single, relevant image directly within a paragraph, list, or table cell to illustrate a specific point.
- **Format**: Use the custom markdown-like tag: \`!g[alt text for accessibility](image_url)\`
- **Example**: The James Webb Space Telescope !g[Image of the James Webb Telescope](https://.../jwst.jpg) has captured stunning new images of the cosmos.


### 2. 🧠 Code Execution
- **Default State**: All fenced code blocks are executable by default.
- **Keywords**: Use \`autorun\`, \`collapsed\`, \`no-run\` to control execution.
- **STRICT "CODE-ONLY" RULE**: For requests to create a file, plot, or chart, your response MUST be a single, executable fenced code block and NOTHING ELSE. There must be NO text before or after it.

### 3. 🐍 Python Coding Rules
- **Environment**: You have access to: \`pandas\`, \`numpy\`, \`matplotlib\`, \`plotly\`, \`openpyxl\`, \`python-docx\`, \`fpdf2\`, \`scikit-learn\`, \`seaborn\`, \`sympy\`, \`pillow\`, \`beautifulsoup4\`, \`scipy\`, \`opencv-python\`, \`requests\`.
- **File Naming**: If the user doesn't provide a filename, you MUST choose a descriptive one (e.g., \`financial_report.xlsx\`). Do not ask.

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