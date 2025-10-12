// FIX: Implemented the missing sendMessage API endpoint.
// This Vercel Edge Function streams responses from the Google GenAI API.

import { GoogleGenAI, Content } from "@google/genai";

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

// The main handler for the API route
export default async function handler(req: Request) {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    try {
        const { history, message, attachments, personaInstruction } = await req.json();

        // As per guidelines, the API key MUST be from process.env.API_KEY
        // Ensure API_KEY is set in your Vercel environment variables
        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable is not set.");
        }
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        // Convert the conversation history from the client to the format required by the Gemini API.
        const geminiHistory: Content[] = (history as HistoryItem[]).map(msg => ({
            role: msg.author === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
        }));

        // Prepare the parts for the user's current message, including any text and attachments.
        const userMessageParts: any[] = [{ text: message }];
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
        
        // Combine history with the new user message to form the full conversation context.
        const contents: Content[] = [
            ...geminiHistory,
            {
                role: 'user',
                parts: userMessageParts,
            }
        ];

        // Per guidelines, use gemini-2.5-flash
        const model = 'gemini-2.5-flash';

        const baseSystemInstruction = `You are a helpful and brilliant assistant.
- Your main goal is to be proactive and execute tasks for the user.
- Be tolerant of minor typos and infer user intent. For example, if a user asks to "create a graph circle usong python", interpret this as a request to plot a circle or create a pie chart and generate the corresponding code. Prefer action over asking for clarification on simple requests.
- When a user asks for a file (e.g., "create an excel file," "make a pdf report") or a data visualization (e.g., "plot this data"), you MUST respond with a runnable Python code block that generates the requested output.
- **IMPORTANT**: If the user's request is a direct command to create a file or plot, you MUST add the 'autorun' keyword to the code block's info string, like this: \`\`\`python autorun
- When using the 'autorun' keyword, your response MUST contain ONLY the code block. Do not add any surrounding text, explanations, or confirmation messages.
- Do NOT provide manual instructions, steps, or guidance on how to install dependencies or run the code. Generate the code directly.
- **CRITICAL PYTHON SYNTAX RULES**: To prevent syntax errors, you MUST adhere to the following non-negotiable rules:
    1.  **For ALL string literals, you MUST use triple quotes (\`"""..."""\`).**
    2.  **For SINGLE-LINE strings, the opening and closing triple quotes MUST be on the SAME line.**
        -   **CORRECT:** \`variable = """A single line string."""\`
        -   **INCORRECT:** \`variable = """A single line string
            """\`
    3.  **For MULTI-LINE strings, ensure the closing triple quotes are on a new line.**
    4.  **Ensure all brackets \`()\`, square brackets \`[]\`, and curly braces \`{}\` are properly opened and closed.** Pay special attention to multi-line data structures.
    5.  Failure to follow these rules will result in invalid code. Adherence is mandatory.
- After calling a file-saving function (like \`.to_excel()\`, \`.save()\`, or \`.output()\`), do NOT add any print statements confirming the file creation. The user interface will handle download notifications automatically.
- When asked for information that might be recent or requires web access, use the search tool to find up-to-date answers. Always cite the sources provided by the search tool.
- You have access to a Python environment with the following libraries: pandas, numpy, matplotlib, plotly, openpyxl, python-docx, fpdf2, scikit-learn, seaborn, sympy, pillow, beautifulsoup4, scipy, opencv-python, and requests.
- When creating files with Python (xlsx, docx, pdf), the file saving functions are automatically handled to trigger a download for the user. You just need to call the standard save functions with a filename (e.g., \`df.to_excel('filename.xlsx')\`, \`doc.save('filename.docx')\`, \`pdf.output('filename.pdf')\`).`;

        const finalSystemInstruction = personaInstruction
            ? `${personaInstruction}\n\n---\n\n${baseSystemInstruction}`
            : baseSystemInstruction;

        // Set up the streaming response to send data back to the client as it's generated.
        const responseStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                
                const write = (data: object) => {
                    controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
                };

                try {
                    const stream = await ai.models.generateContentStream({
                        model: model,
                        contents: contents,
                        config: {
                            systemInstruction: finalSystemInstruction,
                            tools: [{googleSearch: {}}],
                        },
                    });

                    let usageMetadataSent = false;

                    for await (const chunk of stream) {
                        const text = chunk.text;
                        if (text) {
                            write({ type: 'chunk', payload: text });
                        }

                        // Usage metadata is often available at the end. We send it once.
                        if (chunk.usageMetadata && !usageMetadataSent) {
                             write({ type: 'usage', payload: chunk.usageMetadata });
                             usageMetadataSent = true;
                        }
                        
                        const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
                        if (groundingMetadata?.groundingChunks?.length) {
                           write({ type: 'grounding', payload: groundingMetadata.groundingChunks });
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