
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Content, Part } from "@google/genai";
import formidable from 'formidable';
import fs from 'fs';

// --- Interfaces ---
interface ApiAttachment {
    mimeType: string;
    data: string; // base64 encoded
}

interface HistoryItem {
    type: 'USER' | 'AI_RESPONSE';
    content: string;
    files?: ApiAttachment[];
}

interface LocationInfo {
    city: string;
    country: string;
    latitude?: number;
    longitude?: number;
}

interface GoogleSearchResultItem {
    title: string;
    link: string;
    snippet: string;
}

interface FormattedSearchResult {
    searchContext: string;
    searchResults: { web: { uri: string; title: string; } }[];
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

// --- Helper Functions ---

const parseForm = (req: VercelRequest): Promise<{ fields: formidable.Fields; files: formidable.Files }> => {
    const form = formidable({});
    return new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
            if (err) reject(err);
            else resolve({ fields, files });
        });
    });
};

const performWebSearch = async (query: string, location: LocationInfo | null): Promise<FormattedSearchResult> => {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;

    if (!apiKey || !cseId) {
        console.warn("Google Search is not configured. Missing GOOGLE_API_KEY or GOOGLE_CSE_ID.");
        return { searchContext: "", searchResults: [] };
    }

    let searchQuery = query;
    if (location?.city && location?.country) {
        if (/\b(near me|nearby|around here)\b/i.test(searchQuery)) {
            searchQuery = searchQuery.replace(/\b(near me|nearby|around here)\b/i, `in ${location.city}, ${location.country}`);
        }
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(searchQuery)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Google Search API error:", errorData.error.message);
            return { searchContext: "", searchResults: [] };
        }
        const data = await response.json();
        if (!data.items || data.items.length === 0) {
            return { searchContext: "", searchResults: [] };
        }
        const searchItems = data.items.slice(0, 5) as GoogleSearchResultItem[];
        
        const searchContext = "Here are the top web search results:\n\n" + searchItems.map((item, index) => 
            `[${index + 1}] Title: ${item.title}\nURL: ${item.link}\nSnippet: ${item.snippet}`
        ).join('\n\n');

        const searchResults = searchItems.map(item => ({
            web: {
                uri: item.link,
                title: item.title,
            }
        }));
        
        return { searchContext, searchResults };
    } catch (error) {
        console.error("Error performing web search:", error);
        return { searchContext: "", searchResults: [] };
    }
};

// --- Main Handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: 'Method not allowed' } });
    }

    try {
        const { fields, files } = await parseForm(req);
        const payload = JSON.parse(fields.payload as string);
        
        const { history, message, personaInstruction, location, language } = payload as {
            history: HistoryItem[];
            message: string;
            personaInstruction?: string;
            location: LocationInfo | null;
            language?: string;
        };

        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        const systemInstruction = `You are Qbit, a helpful, intelligent, and proactive assistant. 🤖

---
# 💡 CORE SYSTEM SPECIFICATION
## 🧩 IDENTITY & PERSONALITY
- Your persona is a precise, professional, and engaging AI assistant.
- If the user asks “who made you?”, “who created you?”, or any similar question, you MUST respond with the following text: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/". Do not add any conversational filler before or after this statement.

---
## 🧰 AVAILABLE TOOLS
- You have access to Google Search for real-time information. When context from the web is provided, your primary goal is to synthesize that information into a coherent, helpful answer for the user.

---
## ✍️ STYLE, TONE & FORMATTING
- **Markdown Usage**: Use Markdown to structure your responses for clarity.
    - **Lists of Places**: For lists of places (restaurants, landmarks, shops, etc.), you MUST format each item with a title, a few bullet points with details, and an image gallery tag like this: \`!gallery["a realistic photo of Karamanlidika restaurant Athens"]\`. Separate each place with a markdown divider (\`---\`).
- **Tone**: Maintain a confident, helpful, and neutral tone.
- **Emojis**: Use emojis sparingly and only where they genuinely add value.

---
## ⚙️ INTERACTION RULES
- **Citations**: When you use information from Google Search, you MUST cite your sources. The search results will be provided to you with numbered sources like \`[1] Title: ...\`.
- **Response Finale & Engagement**: Your goal is to keep the conversation flowing naturally.
    - At the end of your response, ask one or three context-aware follow-up questions to encourage interaction.
    - For longer, structured responses, add a markdown divider (\`---\`) before the follow-up questions.
- **Code**: For brief code elements, use single backticks (\\\`code\\\`).

---
## 🎯 CORE PHILOSOPHY
Think like an engineer. Write like a professional. Act like a collaborator. Deliver with clarity and precision. ✨`;

        const finalSystemInstruction = personaInstruction
            ? `${personaInstruction}\n\n---\n\n${systemInstruction}`
            : systemInstruction;

        let userMessageForAI = message;
        let groundingChunks: FormattedSearchResult['searchResults'] = [];
        
        const requiresSearch = /\b(search|latest|current|who is|what is|find|news)\b/i.test(message) || /\b(near me|nearby|restaurants|hotels)\b/i.test(message);

        if (requiresSearch) {
            res.write(JSON.stringify({ type: 'searching' }) + '\n');
            const searchResult = await performWebSearch(message, location);
            if (searchResult.searchContext) {
                userMessageForAI = `Based on the following web search results, please answer my question.\n\n---\n\n${searchResult.searchContext}\n\n---\n\nMy question is: "${message}"`;
                groundingChunks = searchResult.searchResults;
                res.write(JSON.stringify({ type: 'sources', payload: groundingChunks }) + '\n');
            }
        }

        const historyForGemini: Content[] = history.map(msg => ({
            role: msg.type === 'USER' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        const userParts: Part[] = [];
        
        let contextPreamble = `Current date: ${new Date().toISOString()}.`;
        if (language && languageMap[language]) {
            contextPreamble += ` Please respond in ${languageMap[language]}.`;
        }

        userParts.push({ text: `${contextPreamble}\n\n${userMessageForAI}` });

        if (files.file) {
            const uploadedFiles = Array.isArray(files.file) ? files.file : [files.file];
            for (const file of uploadedFiles) {
                const fileBuffer = fs.readFileSync(file.filepath);
                userParts.push({
                    inlineData: {
                        mimeType: file.mimetype || 'application/octet-stream',
                        data: fileBuffer.toString('base64'),
                    },
                });
            }
        }
        
        const stream = await ai.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents: [...historyForGemini, { role: 'user', parts: userParts }],
            config: {
                systemInstruction: finalSystemInstruction
            },
        });

        res.setHeader('Content-Type', 'application/octet-stream');
        res.writeHead(200);

        let totalPromptTokens = 0;
        let totalCandidatesTokens = 0;

        for await (const chunk of stream) {
            if (chunk.text) {
                res.write(JSON.stringify({ type: 'chunk', payload: chunk.text }) + '\n');
            }
            if (chunk.usageMetadata) {
                totalPromptTokens += chunk.usageMetadata.promptTokenCount;
                totalCandidatesTokens += chunk.usageMetadata.candidatesTokenCount;
            }
        }
        
        res.write(JSON.stringify({ type: 'usage', payload: {
            promptTokenCount: totalPromptTokens,
            candidatesTokenCount: totalCandidatesTokens,
            totalTokenCount: totalPromptTokens + totalCandidatesTokens
        }}) + '\n');
        
        res.write(JSON.stringify({ type: 'end' }) + '\n');
        res.end();

    } catch (error) {
        console.error('Error in sendMessage handler:', error);
        res.status(500).json({ error: { message: error instanceof Error ? error.message : 'An unknown error occurred' } });
    }
}
