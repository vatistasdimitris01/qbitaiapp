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

async function performImageSearch(query: string): Promise<string> {
    const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
    const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;

    if (!query || !GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) {
        return "";
    }
    try {
        const imageResponse = await fetch(`https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${encodeURIComponent(query)}&searchType=image&num=10`);

        if (imageResponse.ok) {
            const imageData = await imageResponse.json();
             if (imageData.items && imageData.items.length > 0) {
                const results = imageData.items.map((item: any) => ({ url: item.link, alt: item.title }));
                return `[IMAGE SEARCH RESULTS]:\n${JSON.stringify(results)}\n\n`;
            }
        }
        return "";
    } catch (error) {
        console.error("Error performing image search:", error);
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
        
        const imageContext = await performImageSearch(message);
        let userMessageText = message;
        if (imageContext) userMessageText = `${imageContext}[USER MESSAGE]:\n${message}`;
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

## 3. AVAILABLE TOOLS & CONTEXT (CRITICAL)
- **Tool 1: Internal Google Search**: You have a built-in tool to search the web for real-time information. You MUST use this to answer factual questions. The UI will display the sources you use automatically, so **DO NOT** add source links in your text.
- **Context 2: Pre-fetched Image Results**: For your convenience, a separate image search has already been performed. The results are provided in the user's message under \`[IMAGE SEARCH RESULTS]\`. You MUST use this context when creating image galleries.
- **IGNORE IRRELEVANT SEARCHES**: If your internal search results are clearly irrelevant (e.g., for a greeting like "hello"), IGNORE them and respond conversationally.

# 🎨 RESPONSE FORMATTING & STYLE

## 1. MARKDOWN USAGE
- Use Markdown for structure: headings, lists, bold, italics.
- Use horizontal rules (\`---\`) sparingly to separate major sections.

## 2. ENGAGEMENT (WHEN TO ASK QUESTIONS)
- Your goal is to provide a complete answer and then stop, unless further interaction is logical.
- **DO NOT ask follow-up questions for**: Simple factual queries, greetings, or when you provide a definitive code solution.
- **DO ask 1-3 relevant follow-up questions for**: Exploratory topics (e.g., "vacation ideas"), complex explanations, or open-ended questions.
- Place follow-up questions at the very end of your response.

# 🛠️ TOOL USAGE: IMAGE GENERATION

## 1. WHEN TO GENERATE IMAGES
- You MUST **ALWAYS** generate an image gallery when the user's query is about any of the following topics:
    - **PEOPLE** (e.g., "who is elon musk?")
    - **PLACES**, **RESTAURANTS**, or **SHOPS** (e.g., "best restaurants in athens")
- You MUST ALSO generate an image gallery if the user **EXPLICITLY ASKS** for images (e.g., "show me pictures of...").
- For ALL OTHER web searches (e.g., "weather", "news"), you MUST provide a text-only answer.

## 2. HOW TO GENERATE IMAGE GALLERIES (JSON STRUCTURE)
- To display images, you MUST use a markdown code block with the language identifier \`json-gallery\`.
- The JSON inside this block MUST follow this exact structure:
    - The root is an object.
    - It MUST have a key \`"type"\` with the string value \`"image_gallery"\`.
    - It MUST have a key \`"images"\` which is an array of objects.
    - Each object in the \`"images"\` array MUST have two keys:
      1. \`"url"\`: The value for this key **MUST** be the exact, complete, and unmodified URL copied directly from the \`[IMAGE SEARCH RESULTS]\` context.
      2. \`"alt"\`: A brief, descriptive text for the image.

## 3. REQUIRED IMAGE LAYOUTS & QUANTITY
### A. Rich Lists for Places
- This is the **MANDATORY** format for any list of places, restaurants, or shops.
- For **EACH** item in the list, you are **REQUIRED** to find **4 OR MORE** relevant images from the search results and present them in a single \`json-gallery\` block immediately following the item's title or description.
### B. Profile Layout (for People)
- When the query is about a single person, use a \`json-gallery\` with exactly **3 images**.
### C. Inline Images
- To place a single image inside text, use the tag: \`!g[alt text][URL]\`. The URL must be copied exactly from the search results.

# ✅ FINAL REVIEW CHECKLIST (MANDATORY & CRITICAL)
Before you output your final response, you MUST perform this final check on any image gallery or inline image you have created. This is not optional.
1.  **URL VERIFICATION**: Go through every single image URL you have used. Does the URL string match **EXACTLY, character-for-character**, a URL from the provided \`[IMAGE SEARCH RESULTS]\`?
2.  **NO INVENTED URLS**: Have you invented *any* URLs? This includes placeholders like \`example.com\`, relative paths like \`image.jpg\`, or any URL not present in the search results.
3.  **CORRECTION**: If you find ANY URL that fails the check, you **MUST** delete it and replace it with a valid URL from your search results. If you cannot find a valid replacement, remove the image from your response.

Failing to follow this final check is a critical failure. Your primary goal with images is reliability.
`;

        const finalSystemInstruction = personaInstruction ? `${personaInstruction}\n\n---\n\n${baseSystemInstruction}` : baseSystemInstruction;
            
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const write = (data: object) => res.write(JSON.stringify(data) + '\n');

        try {
            const stream = await ai.models.generateContentStream({ 
                model, 
                contents, 
                config: { 
                    systemInstruction: finalSystemInstruction,
                    tools: [{ googleSearch: {} }],
                } 
            });
            let usageMetadataSent = false;
            for await (const chunk of stream) {
                const partTexts = chunk.candidates?.[0]?.content?.parts?.map(p => p.text ?? '') ?? [];
                const text = partTexts.join('');
                if (text) {
                    write({ type: 'chunk', payload: text });
                }

                const groundingChunks = chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
                if (groundingChunks) {
                    write({ type: 'grounding', payload: groundingChunks });
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