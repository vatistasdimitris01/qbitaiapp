// This Vercel Edge Function streams responses from the Google GenAI API.

import { GoogleGenAI, Content, Part } from "@google/genai";

// Vercel Edge Function config
export const config = {
  runtime: 'edge',
};

// Type definitions to match what the frontend sends
interface HistoryItem {
    author: 'user' | 'ai';
    text: string;
}

interface ApiAttachment {
    mimeType: string;
    data: string; // base64 encoded
}

interface LocationInfo {
    city: string;
    country: string;
}

// The main handler for the API route
export default async function handler(req: Request) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { history, message, attachments, personaInstruction, location } = await req.json();

        // As per guidelines, the API key MUST be from process.env.API_KEY
        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable is not set.");
        }
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        const geminiHistory: Content[] = (history as HistoryItem[]).map(msg => ({
            role: msg.author === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
        }));
        
        let userMessageText = message;
        if (location && (location as LocationInfo).city && (location as LocationInfo).country) {
            userMessageText = `[User's Location: ${location.city}, ${location.country}]\n\n${message}`;
        }

        const userMessageParts: Part[] = [{ text: userMessageText }];
        if (attachments && (attachments as ApiAttachment[]).length > 0) {
            for (const attachment of attachments as ApiAttachment[]) {
                userMessageParts.push({
                    inlineData: {
                        mimeType: attachment.mimeType,
                        data: attachment.data,
                    },
                });
            }
        }
        
        const contents: Content[] = [
            ...geminiHistory,
            { role: 'user', parts: userMessageParts }
        ];

        const model = 'gemini-2.5-flash';

        const baseSystemInstruction = `You are a helpful and brilliant assistant.

- **Creator Information**: If the user asks "who made you?", "who created you?", "who is your developer?", or any similar question about your origin, you MUST respond with the following text: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/". Do not add any conversational filler before or after this statement.
- **Web Search**: For any user query that requires up-to-date information from the web (e.g., current events, weather, recent data), your built-in Google Search tool will be automatically used.
- **Location-Aware Search**: The user's location is provided in their prompt. If their query is location-specific (e.g., "weather", "restaurants near me"), use this information to create a better search query. For general questions, ignore the location.
- Your main goal is to be proactive and execute tasks for the user.
- Be tolerant of minor typos and infer user intent. For example, if a user asks to "create a graph circle usong python", interpret this as a request to plot a circle or create a pie chart and generate the corresponding code. Prefer action over asking for clarification on simple requests.
- **CODE FORMATTING GUIDE**:
    - **Inline Code**: For brief code elements, terminal commands, function names (\`print()\`), variable names (\`my_variable\`), or file names (\`hello.py\`), use single backticks.
    - **Code Execution**: By default, all fenced code blocks are treated as executable and will have a "Run" button.
    - **Non-Executable Examples (\`no-run\`)**: If a code snippet is for demonstration only, is incomplete, or conceptual, you MUST add the \`no-run\` keyword to the info string.
    - **Shell Command & Output Examples**: Use a single \`text no-run\` block. Prefix commands with \`$\` and do not prefix output.
- **AUTONOMOUS EXECUTION & DISPLAY**:
    - For direct, simple commands from the user to create a plot, chart, or file (e.g., "plot a sine wave", "create an excel file with sales data"), your response MUST consist of only a single code block.
    - This code block MUST include the \`autorun\` keyword in its info string (e.g., \`\`\`python autorun).
    - Do NOT add any explanatory text before or after the code block in these direct command cases.
    - For tasks that generate a downloadable file, you MUST also add the 'collapsed' keyword.
- **CRITICAL PYTHON SYNTAX RULES**:
    1.  For ALL string literals, you MUST use triple quotes (\`"""..."""\`).
    2.  For SINGLE-LINE strings, opening and closing triple quotes MUST be on the SAME line.
    3.  All variables MUST be defined before they are used.
- **Excel File Generation**: When asked to create an Excel file (.xlsx), you MUST use the \`openpyxl\` library.
- After calling a file-saving function (like \`wb.save()\`), do NOT add any print statements.
- You have access to a Python environment with the following libraries: pandas, numpy, matplotlib, plotly, openpyxl, python-docx, fpdf2, scikit-learn, seaborn, sympy, pillow, beautifulsoup4, scipy, opencv-python, and requests.
- When creating files with Python (xlsx, docx, pdf), the file saving functions are automatically handled to trigger a download for the user.`;

        const finalSystemInstruction = personaInstruction
            ? `${personaInstruction}\n\n---\n\n${baseSystemInstruction}`
            : baseSystemInstruction;
            
        const responseStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                const write = (data: object) => controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));

                try {
                    const stream = await ai.models.generateContentStream({
                        model: model,
                        contents: contents,
                        config: {
                            systemInstruction: finalSystemInstruction,
                            tools: [{googleSearch: {}}],
                        },
                    });

                    let sourcesSent = false;
                    let usageMetadataSent = false;
                    
                    for await (const chunk of stream) {
                        if (chunk.text) {
                            write({ type: 'chunk', payload: chunk.text });
                        }
                        
                        const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
                        if (groundingMetadata?.groundingChunks && !sourcesSent) {
                            const sources = groundingMetadata.groundingChunks;
                            if (sources.length > 0) {
                                write({ type: 'sources', payload: sources });
                                sourcesSent = true;
                            }
                        }
                        
                        if (chunk.usageMetadata && !usageMetadataSent) {
                            write({ type: 'usage', payload: chunk.usageMetadata });
                            usageMetadataSent = true; // Only send usage once
                        }
                    }

                    write({ type: 'end' });
                } catch (error) {
                    console.error("Error during Gemini stream processing:", error);
                    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
                    write({ type: 'error', payload: errorMessage });
                } finally {
                    controller.close();
                }
            },
        });

        return new Response(responseStream, {
            headers: { 
                'Content-Type': 'application/json; charset=utf-8',
                'X-Content-Type-Options': 'nosniff',
             },
        });

    } catch (error) {
        console.error('Error in sendMessage handler:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: `Failed to process request: ${errorMessage}` }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}