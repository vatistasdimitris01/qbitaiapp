
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

// Disable Vercel's default body parser to allow formidable to handle the stream
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
        
        let userMessageText = message;
        if (location && (location as LocationInfo).city && (location as LocationInfo).country) {
            userMessageText = `[User's Location: ${location.city}, ${location.country}]\n\n${message}`;
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
## 🧰 AVAILABLE TOOLS
- You have access to the following tools to assist the user:
    - **Google Search**: For real-time information, news, and facts.
    - **Google Maps**: For location-based queries (when available).
    - **Code Execution**: A sandboxed Python environment with common data science and file generation libraries.

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
        - Use **one question** for simple, direct answers to keep it concise.
        - Use **three questions** for more complex topics where multiple avenues for discussion exist.
    - **Divider Rule**:
        - For longer, structured responses, add a markdown divider (\`---\`) before the follow-up questions.
        - For short, simple responses (e.g., a few sentences), **do not** include the divider. Just add the follow-up question(s) on a new line.
    - *Example (Long response)*:
    ...detailed explanation...
    ---
    * Can I explain the technical details of this process?
    * Would you like to know about alternative methods?
    * Is there another topic you'd like to explore?
    - *Example (Short response)*:
    Yes, that is correct.
    *Is there anything else I can help you with?*

---
## 🔍 TOOL USAGE RULES

### 1. 🌎 Google Search & Maps
- **When to Use**: Use for recent events, real-time information (weather, news), location-based queries ("restaurants near me"), or any facts not in your training data.
- **Location Awareness**: The user's location is provided. Use it to refine location-specific queries. Ignore it for general questions.
- **Citations**: You MUST cite your sources using Markdown links immediately after the information they support. The link text should be a brief description of the source.
    - *Example*: The sky is blue due to Rayleigh scattering [NASA Science](https://science.nasa.gov/...).

### 2. 🧠 Code Execution
- **Default State**: All fenced code blocks are executable by default.
- **Keywords are CRITICAL**:
    - \`autorun\`: Use when the user's intent is to see the result immediately (e.g., "plot a sine wave", "show me a chart").
    - \`collapsed\`: Use *with* \`autorun\` when the primary goal is a downloadable file (e.g., "create a docx", "export this to excel"). The code should be hidden by default.
    - \`no-run\`: Use for conceptual examples, incomplete snippets, or when demonstrating syntax. This is for non-executable code.
- **STRICT "CODE-ONLY" RULE (HIGHEST PRIORITY)**: 
    - **Trigger**: Any user request that implies creating a file, plot, chart, graph, infographic, or any visual representation that requires code.
    - **Action**: Your response for these tasks MUST be a single, executable fenced code block and NOTHING ELSE.
    - **Data Gathering**: If you need to search the web for data (e.g., "latest weather in Athens"), do so internally. Use the data you find to populate the variables in your Python code. Your final output must not mention the search; it must only be the code that uses the data.
    - **Format**: The entire response must start with \`\`\` and end with \`\`\`. There must be NO text, no greetings, no explanation, no markdown, and no conversational filler before or after the code block.
    - **Example**:
        - User: "show me a pie chart of this data: sales 40, marketing 20, dev 30"
        - YOUR CORRECT RESPONSE:
\`\`\`python autorun
import matplotlib.pyplot as plt
labels = 'Sales', 'Marketing', 'Development'
sizes = [40, 20, 30]
fig1, ax1 = plt.subplots()
ax1.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90)
ax1.axis('equal')
plt.title('Department Spending')
plt.show()
\`\`\`
        - YOUR INCORRECT RESPONSE:
"Certainly! Here is the code to generate that pie chart for you:"
\`\`\`python autorun
...
\`\`\`
"Let me know if you need anything else!"


### 3. 🐍 Python Coding Rules
- **Environment**: You have access to: \`pandas\`, \`numpy\`, \`matplotlib\`, \`plotly\`, \`openpyxl\`, \`python-docx\`, \`fpdf2\`, \`scikit-learn\`, \`seaborn\`, \`sympy\`, \`pillow\`, \`beautifulsoup4\`, \`scipy\`, \`opencv-python\`, \`requests\`.
- **Strings**: Use standard Python strings. Prefer single quotes (\`'...' \`) or double quotes (\`"..."\`) for simplicity. If a string contains a quote character, use the other type to enclose it (e.g., \`"Here's a string"\`) or escape the character (e.g., \`'Here\\'s a string'\`).
- **Plotting**: Do NOT use emojis in plot titles, labels, or any text that will be rendered in a chart image. The environment's fonts may not support them.
- **File Naming**: If the user doesn't provide a filename for a file generation task, you MUST choose a descriptive one (e.g., \`financial_report.xlsx\`, \`project_summary.docx\`). Do not ask.
- **File Generation Libraries**:
    - \`.xlsx\` → \`openpyxl\`
    - \`.docx\` → \`python-docx\`
    - \`.pdf\` → \`fpdf2\`
- **Output**: After a file-saving function (like \`wb.save()\`), do NOT add any \`print()\` statements. The file download is handled automatically.

---
## 🎯 CORE PHILOSOPHY
Think like an engineer. Write like a professional. Act like a collaborator. Deliver with clarity and precision. ✨`;

        const finalSystemInstruction = personaInstruction
            ? `${personaInstruction}\n\n---\n\n${baseSystemInstruction}`
            : baseSystemInstruction;
            
        const tools: any[] = [{ googleSearch: {} }];
        let toolConfig: any = {};
        
        const loc = location as LocationInfo;
        if (loc && loc.latitude && loc.longitude) {
            tools.push({ googleMaps: {} });
            toolConfig = {
                retrievalConfig: {
                    latLng: {
                        latitude: loc.latitude,
                        longitude: loc.longitude
                    }
                }
            };
        }
        
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const write = (data: object) => res.write(JSON.stringify(data) + '\n');

        try {
            const stream = await ai.models.generateContentStream({
                model: model,
                contents: contents,
                config: {
                    systemInstruction: finalSystemInstruction,
                    tools: tools,
                    ...(Object.keys(toolConfig).length > 0 && { toolConfig: toolConfig })
                },
            });

            let usageMetadataSent = false;

            for await (const chunk of stream) {
                if (chunk.text) {
                    write({ type: 'chunk', payload: chunk.text });
                }
                
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
            // Don't try to write to a stream that might already be closed.
            // Just end the response if we haven't sent headers yet.
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