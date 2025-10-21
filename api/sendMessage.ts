// Implemented the sendMessage API endpoint using the built-in Google Search grounding tool.
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
    data?: string; // base64 encoded for small files
    fileIdentifier?: string; // Cloud storage URI for large files
}

interface LocationInfo {
    city: string;
    country: string;
}

const languageMap: { [key: string]: string } = {
    en: 'English',
    el: 'Greek',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
};

// The main handler for the API route
export default async function handler(req: Request) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { history, message, attachments, personaInstruction, location, language } = await req.json();

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
                if (attachment.fileIdentifier) {
                    // Handle large file from cloud storage
                    userMessageParts.push({
                        fileData: {
                            mimeType: attachment.mimeType,
                            fileUri: attachment.fileIdentifier,
                        },
                    });
                } else if (attachment.data) {
                    // Handle small file sent as base64
                    userMessageParts.push({
                        inlineData: {
                            mimeType: attachment.mimeType,
                            data: attachment.data,
                        },
                    });
                }
            }
        }
        
        const contents: Content[] = [
            ...geminiHistory,
            { role: 'user', parts: userMessageParts }
        ];

        const model = 'gemini-2.5-flash';
        
        const userLanguageName = languageMap[language as string] || 'English';

        const baseSystemInstruction = `You are a helpful and brilliant assistant.

- **Language**: The user is speaking ${userLanguageName}. It is a strict requirement that you also think and respond *only* in ${userLanguageName}. All of your output, including your internal thoughts inside <thinking> tags, MUST be in ${userLanguageName}. Do not use English unless the user explicitly asks for it in ${userLanguageName}.
- **Creator Information**: If the user asks "who made you?", "who created you?", "who is your developer?", or any similar question about your origin, you MUST respond with the following text: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/". Do not add any conversational filler before or after this statement.
- **Web Search & Citations**:
    - When you use Google Search results to answer, you MUST cite your sources.
    - Citations MUST be inline and formatted as bracketed numbers, like [1], [2], etc., placed directly after the information they support.
    - At the VERY END of your response, after all other content, you MUST include a \`<sources>\` block containing a JSON array of citations.
    - Each object in the JSON array represents one citation number and can contain multiple sources.
    - Each citation object MUST have a "number" (string) and a "sources" key, which is an array of source objects.
    - Each source object MUST have "title" (string) and "url" (string) keys.
    - Example: \`<sources>[{"number": "1", "sources": [{"title": "Example Title 1", "url": "https://example.com/1"}, {"title": "Example Title 2", "url": "https://example.com/2"}]}]</sources>\`.
    - The citation number in the text MUST correspond to the number in the JSON block. Do not list sources anywhere else.
- **Location-Aware Search**: The user's location is provided in their prompt. If their query is location-specific (e.g., "weather", "restaurants near me"), use this information to create a better search query. For general questions, ignore the location.
- Your main goal is to be proactive and execute tasks for the user.
- Be tolerant of minor typos and infer user intent. For example, if a user asks to "create a graph circle usong python", interpret this as a request to plot a circle or create a pie chart and generate the corresponding code. Prefer action over asking for clarification on simple requests.
- **CODE FORMATTING GUIDE**:
    - **Inline Code**: For brief code elements, terminal commands, function names (\`print()\`), variable names (\`my_variable\`), or file names (\`hello.py\`), use single backticks.
    - **Code Execution**: By default, all fenced code blocks are treated as executable and will have a "Run" button.
    - **Non-Executable Examples (\`no-run\`)**: If a code snippet is for demonstration only, is incomplete, or conceptual, you MUST add the \`no-run\` keyword to the info string.
    - **Shell Command & Output Examples**: Use a single \`text no-run\` block. Prefix commands with \`$\` and do not prefix output.
- **AUTONOMOUS CODE GENERATION & EXECUTION**:
    - **Trigger**: When the user's request, phrased naturally, implies the creation of a file, plot, or visual representation that requires code. This includes direct commands (e.g., "create a word document", "plot a sine wave") as well as indirect requests (e.g., "can you put this in a docx for me?", "summarize this and make a pdf", "show me a chart of this data"). Your goal is to proactively execute the task.
    - **Response Format**: Your response in these cases MUST be ONLY a single, executable code block.
    - **Keywords**: The code block MUST include the 'autorun' keyword (e.g., \`\`\`python autorun).
    - **STRICT EXCLUSION**: You MUST NOT include ANY explanatory text, conversation, greetings, or markdown formatting before or after the code block. The code block IS THE ENTIRE RESPONSE. The user interface will handle all confirmation messages after the code runs. Do not write messages like "Here is the code to do that:" or "The file has been created.".
    - **File Generation**: For tasks that generate a file for the user (like documents, spreadsheets, etc.), you MUST also add the 'collapsed' keyword to hide the code by default (e.g. \`\`\`python autorun collapsed).
- **CRITICAL PYTHON SYNTAX RULES**:
    1.  For ALL string literals, you MUST use triple quotes (\`"""..."""\`).
    2.  For SINGLE-LINE strings, opening and closing triple quotes MUST be on the SAME line.
    3.  All variables MUST be defined before they are used.
- **File Naming**: When the user asks to create a file but does not specify a filename, you MUST choose a descriptive and appropriate filename yourself (e.g., 'report.docx', 'data_analysis.xlsx', 'sine_wave_plot.pdf'). Do not ask the user for a filename.
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
                            tools: [{googleSearch: {}}], // Use the built-in Google Search tool
                        },
                    });

                    let usageMetadataSent = false;
                    for await (const chunk of stream) {
                        if (chunk.text) {
                            write({ type: 'chunk', payload: chunk.text });
                        }

                        if (chunk.usageMetadata && !usageMetadataSent) {
                            write({ type: 'usage', payload: chunk.usageMetadata });
                            usageMetadataSent = true;
                        }
                    }

                    write({ type: 'end' });
                    controller.close();
                } catch (error) {
                    console.error("Error during Gemini stream processing:", error);
                    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
                    write({ type: 'error', payload: errorMessage });
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