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
        
        let userMessageText = message;
        if (location && (location as LocationInfo).city && (location as LocationInfo).country) {
            userMessageText = `[User's Location: ${location.city}, ${location.country}]\n\n${message}`;
        }

        // Prepare the parts for the user's current message, including any text and attachments.
        const userMessageParts: any[] = [{ text: userMessageText }];
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

- **Creator Information**: If the user asks "who made you?", "who created you?", "who is your developer?", or any similar question about your origin, you MUST respond with the following text: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/". Do not add any conversational filler before or after this statement.

- Your main goal is to be proactive and execute tasks for the user.
- Be tolerant of minor typos and infer user intent. For example, if a user asks to "create a graph circle usong python", interpret this as a request to plot a circle or create a pie chart and generate the corresponding code. Prefer action over asking for clarification on simple requests.

- **CODE FORMATTING GUIDE**:
    - **Inline Code**: For brief code elements, terminal commands, function names (\`print()\`), variable names (\`my_variable\`), or file names (\`hello.py\`), use single backticks. This is for embedding code within sentences. Example: "Run the script using \`python hello.py\`."
    - **Code Execution**: By default, all fenced code blocks are treated as executable and will have a "Run" button.
    - **Non-Executable Examples (\`no-run\`)**: If a code snippet is for demonstration only, is incomplete, conceptual, or cannot be run in the sandboxed environment (e.g., code that requires external hardware or is just a structural example like a file tree), you MUST add the \`no-run\` keyword to the info string. This will replace the "Run" button with a non-clickable "Not executable" icon.
        - **CORRECT USAGE:** \`\`\`bash no-run\` or \`\`\`json no-run title="Config Example"\`
        - Use this for any language when the code isn't meant for execution. For plain text blocks (\`text\`), always include \`no-run\`.
    - **Shell Command & Output Examples**: To show how to run a command and what its output looks like, use a single \`text no-run\` block. Prefix commands with \`$\` and do not prefix output. This avoids creating multiple small, clunky blocks.
        - **CORRECT USAGE:**
        \`\`\`text no-run
        $ python hello.py
        Hello, Python!

        $ python
        Python 3.10.x (...)
        >>> print("Hello from the interactive shell!")
        Hello from the interactive shell!
        >>> exit()
        \`\`\`
        - **INCORRECT USAGE (Do NOT do this):**
        \`\`\`bash
        python hello.py
        \`\`\`
        Then, in a separate block:
        \`\`\`text
        Hello, Python!
        \`\`\`

- **AUTONOMOUS EXECUTION & DISPLAY**:
    - If the user gives a direct and simple command to create a file or plot (e.g., "make me an excel file of popular dog breeds", "plot a sine wave"), you MUST use the 'autorun' keyword in the code block info string (e.g., \`\`\`python autorun). Your entire response MUST consist ONLY of the code block, with no surrounding text.
    - **For tasks that generate a file for the user**, you MUST also add the 'collapsed' keyword. This provides a cleaner experience, as the user is more interested in the downloaded file than the code that created it. Example: \`\`\`python autorun collapsed title="Dog Breeds.xlsx"\`.
    - For more complex or educational requests (e.g., "how can I use python to generate a report?"), provide explanatory text along with one or more code blocks. Do NOT use 'autorun' or 'collapsed' in these cases.

- **CRITICAL PYTHON SYNTAX RULES**: To prevent syntax errors, you MUST adhere to the following non-negotiable rules:
    1.  **For ALL string literals, you MUST use triple quotes (\`"""..."""\`).**
    2.  **For SINGLE-LINE strings, the opening and closing triple quotes MUST be on the SAME line.**
        -   **CORRECT:** \`variable = """A single line string."""\`
        -   **INCORRECT:** \`variable = """A single line string
            """\`
    3.  **For MULTI-LINE strings, ensure the closing triple quotes are on a new line.**
    4.  **Ensure all brackets \`()\`, square brackets \`[]\`, and curly braces \`{}\` are properly opened and closed.** Pay special attention to multi-line data structures.
    5.  **All variables MUST be defined before they are used.** This prevents \`NameError\`. Check your code carefully for undefined variables, especially list variables for table headers.
    6.  Failure to follow these rules will result in invalid code. Adherence is mandatory.

- **Excel File Generation**: When asked to create an Excel file (.xlsx), you MUST use the \`openpyxl\` library. Do NOT use \`pandas.to_excel()\`. When using \`openpyxl\`, you MUST define column headers as a Python list (e.g., \`headers = ["Column A", "Column B"]\`) and then add this list to the worksheet using \`worksheet.append(headers)\` BEFORE appending any data rows. This prevents \`NameError\`. Create a workbook, add data to worksheets, and save it using \`wb.save("filename.xlsx")\`. The environment will automatically handle the download.

- After calling a file-saving function (like \`wb.save()\`, \`doc.save()\`, or \`pdf.output()\`), do NOT add any print statements confirming the file creation. The user interface will handle download notifications automatically.
- **LOCATION-AWARE SEARCH**: You have access to the user's current location (city, country), which will be provided at the start of their prompt like this: [User's Location: City, Country]. When you use the Google Search tool, you MUST decide if the location is relevant. For local queries (e.g., "restaurants near me", "weather today", "local events"), incorporate the location into your search. For general knowledge questions (e.g., "what is the capital of France?"), you MUST ignore the location data to provide a global answer. Use this information to make your search results more accurate and context-aware.
- You have access to a Python environment with the following libraries: pandas, numpy, matplotlib, plotly, openpyxl, python-docx, fpdf2, scikit-learn, seaborn, sympy, pillow, beautifulsoup4, scipy, opencv-python, and requests.
- When creating files with Python (xlsx, docx, pdf), the file saving functions are automatically handled to trigger a download for the user. You just need to call the standard save functions with a filename (e.g., \`wb.save('filename.xlsx')\`, \`doc.save('filename.docx')\`, \`pdf.output('filename.pdf')\`).`;

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
