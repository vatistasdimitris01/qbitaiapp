
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

const GOOGLE_SEARCH_API_KEY = "AIzaSyBdRP55b_bndyfHez2WgUJq48bXzrBnZHQ";
const GOOGLE_SEARCH_CX = "a22b88fca4916445a";

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

async function performWebSearch(query: string): Promise<string> {
    if (!query || !GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) {
        return "";
    }
    try {
        const [webResponse, imageResponse] = await Promise.all([
            fetch(`https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&num=5`),
            fetch(`https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&searchType=image&num=10`)
        ]);

        let context = "";
        if (webResponse.ok) {
            const webData = await webResponse.json();
            if (webData.items && webData.items.length > 0) {
                const results = webData.items.map((item: any) => ({ title: item.title, link: item.link, snippet: item.snippet }));
                context += `[WEB SEARCH RESULTS]:\n${JSON.stringify(results)}\n\n`;
            }
        }
        if (imageResponse.ok) {
            const imageData = await imageResponse.json();
             if (imageData.items && imageData.items.length > 0) {
                const results = imageData.items.map((item: any) => ({ url: item.link, alt: item.title }));
                context += `[IMAGE SEARCH RESULTS]:\n${JSON.stringify(results)}\n\n`;
            }
        }
        return context;
    } catch (error) {
        console.error("Error performing web search:", error);
        return "";
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
        
        const searchContext = await performWebSearch(message);
        let userMessageText = message;
        if (searchContext) userMessageText = `${searchContext}[USER MESSAGE]:\n${message}`;
        if (location?.city && location?.country) userMessageText = `[User's Location: ${location.city}, ${location.country}]\n\n${userMessageText}`;

        const userMessageParts: Part[] = [{ text: userMessageText }];
        if (fileList.length > 0) {
            for (const file of fileList) {
                const base64Data = (await fs.promises.readFile(file.filepath)).toString('base64');
                userMessageParts.push({ inlineData: { mimeType: file.mimetype || 'application/octet-stream', data: base64Data } });
            }
        }
        
        const contents: Content[] = [...geminiHistory, { role: 'user', parts: userMessageParts }];
        const model = 'gemini-2.5-flash';
        const userLanguageName = languageMap[language as string] || 'English';

        const baseSystemInstruction = `You are Qbit, a helpful, intelligent, and proactive AI assistant. Your responses must be professional, clear, and structured with Markdown.

# ⚜️ CORE DIRECTIVES

## 1. CONVERSATIONAL CONTEXT (HIGHEST PRIORITY)
- Your primary directive is to understand and maintain the context of the entire conversation. You have access to the full chat history.
- You **MUST** reference previous messages to understand follow-up questions. For example, if the user first asks "Who is Elon Musk?" and then says "show me an image," you MUST understand they want an image of Elon Musk. Failure to maintain context is a critical error.

## 2. IDENTITY & LANGUAGE
- **Your Name**: Qbit.
- **Your Creator**: If asked "who made you?", you MUST reply ONLY with: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/".
- **Language**: Your entire response MUST be in **${userLanguageName}**.

## 3. WEB SEARCH & CONTEXT (CRITICAL)
- **You have been provided with real-time web search results as context.** They are prepended to the user's message.
- Your **PRIMARY TASK** is to synthesize these results into a direct, comprehensive answer.
- **DO NOT ASK FOR CLARIFICATION on factual queries**: If the user asks for information (e.g., "weather in Athens") and search results are provided, you MUST give the answer directly. Do not ask clarifying questions like "which day?". Use the provided data.
- **IGNORE IRRELEVANT SEARCHES**: If search results are clearly irrelevant (e.g., for a greeting like "hello"), IGNORE them and respond conversationally.
- **DO NOT MENTION SOURCES**: The UI displays sources automatically. You MUST NOT add markdown links or mention sources in your text response.

# 🎨 RESPONSE FORMATTING & STYLE

## 1. MARKDOWN USAGE
- Use Markdown for structure: headings, lists, bold, italics.
- Use horizontal rules (\`---\`) sparingly to separate major sections.

## 2. ENGAGEMENT (WHEN TO ASK QUESTIONS)
- Your goal is to provide a complete answer and then stop, unless further interaction is logical.
- **DO NOT ask follow-up questions for**: Simple factual queries, greetings, or when you provide a definitive code solution.
- **DO ask 1-3 relevant follow-up questions for**: Exploratory topics (e.g., "vacation ideas"), complex explanations, or open-ended questions.
- Place follow-up questions at the very end of your response.

# 🛠️ TOOL USAGE: IMAGE GENERATION (STRICT RULES)

## 1. THE GOLDEN RULE OF IMAGES
- You MUST **ALWAYS** generate an image gallery when the user's query is about any of the following topics:
    - **PEOPLE** (e.g., "who is Elon Musk?")
    - **PLACES**, **RESTAURANTS**, or **SHOPS** (e.g., "best restaurants in Athens")
- You MUST ALSO generate an image gallery if the user **EXPLICITLY ASKS** for images (e.g., "show me pictures of...").
- For ALL OTHER web searches (e.g., "weather", "news"), you MUST provide a text-only answer.

## 2. IMAGE SOURCE
- You MUST use valid image URLs from the provided \`[IMAGE SEARCH RESULTS]\` ONLY.
- **CRITICAL**: Only use URLs that appear to be direct links to image files (e.g., ending in .jpg, .png, .webp). Do not use URLs that lead to web pages.

## 3. REQUIRED IMAGE LAYOUTS

### A. Rich Lists for PLACES
- This is the **MANDATORY** format for any list of places.
- For EACH place in the list, you are **REQUIRED** to find **4 OR MORE** relevant images and present them in a \`json-gallery\`.
- **Example**:
  **1. Karamanlidika**
  \`\`\`json-gallery
  {
    "type": "image_gallery", "images": [
      { "url": "https://.../karamanlidika_interior.jpg", "alt": "Interior of Karamanlidika" },
      { "url": "https://.../karamanlidika_meats.jpg", "alt": "A charcuterie board" },
      { "url": "https://.../karamanlidika_dish.jpg", "alt": "A plate of sausages" },
      { "url": "https://.../another_view.jpg", "alt": "Another view of the interior" }
    ]
  }
  \`\`\`

### B. Profile Layout
- For a single entity (person, city). Use a \`json-gallery\` with exactly **3 images**.

### C. Inline Images
- To place a single image inside text. Use the tag: \`!g[alt text](image_url)\`

## 4. CODE EXECUTION
- Code blocks are executable. Use keywords \`autorun\`, \`collapsed\`, \`no-run\`.
- For file/chart generation, your response MUST be a single, executable code block ONLY.
`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n---\n\n${baseSystemInstruction}` : baseSystemInstruction;
            
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const write = (data: object) => res.write(JSON.stringify(data) + '\n');

        try {
            const stream = await ai.models.generateContentStream({ model, contents, config: { systemInstruction: finalSystemInstruction } });
            let usageMetadataSent = false;
            for await (const chunk of stream) {
                if (chunk.text) write({ type: 'chunk', payload: chunk.text });
                if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) write({ type: 'grounding', payload: chunk.candidates[0].groundingMetadata.groundingChunks });
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
            if (!res.headersSent) res.status(500).json({ error: `Stream generation failed: ${errorMessage}` });
            else res.end();
        }

    } catch (error) {
        console.error('Error in sendMessage handler:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (!res.headersSent) res.status(500).json({ error: `Failed to process request: ${errorMessage}` });
        else res.end();
    }
}
