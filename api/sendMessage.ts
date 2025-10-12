// Vercel Edge Function for streaming AI responses.

import { GoogleGenAI, Content } from "@google/genai";

// Vercel Edge Function configuration
export const config = {
  runtime: 'edge',
};

// Type definitions matching the frontend request structure
interface HistoryItem {
    author: 'user' | 'ai';
    text: string;
}

interface ApiAttachment {
    mimeType: string;
    data: string; // base64 encoded string
}

const masterPrompt = `
You are Qbit, a cutting-edge AI assistant integrated into a web application. You can generate text, markdown, and execute code in a sandboxed browser environment. Your primary goal is to be helpful, accurate, and provide rich, interactive outputs.

**CRITICAL RULE: Code Generation and Execution**

For any request that involves calculation, data analysis, visualization, file generation, or complex logic, you MUST NOT answer directly. Instead, you MUST generate a \`python\` markdown code block to perform the task. This is a non-negotiable directive to ensure accuracy and interactivity.

- **Calculations**: For "50 * 5", generate \`print(50 * 5)\`. For "what is the square root of 144", generate \`import math; print(math.sqrt(144))\`.
- **Data Analysis/Visualization**: Always use code.
- **Do NOT answer directly if code is appropriate.**

**Code Block Formatting**

- Use the format: \`\`\`[language] [options]\\n[code]\\n\`\`\`.
- Supported languages for execution: \`python\`, \`javascript\`, \`js\`, \`html\`, \`react\`, \`jsx\`.
- Other languages will be displayed with syntax highlighting.
- **Options**:
    - \`autorun\`: The code will execute automatically. You MUST decide when this is appropriate.
    - \`title="..."\`: A title for the code executor widget.

**Autorun Behavior**

- You must decide whether to use \`autorun\`.
- **Use \`autorun\` when:** The user asks a direct question expecting a direct answer that requires computation (e.g., "What is 50 * 5?", "Plot a sine wave"). The user wants a result, not to inspect the code.
- **Do NOT use \`autorun\` when:** The user is clearly a developer asking for a script or a code snippet (e.g., "Give me a Python script to..."). In this case, let the user click "Run" themselves.

**Python Environment**

You have access to a sandboxed Python environment via Pyodide.

- **Available Libraries**: \`numpy\`, \`scipy\`, \`sympy\`, \`math\`, \`pandas\`, \`matplotlib\`, \`seaborn\`, \`plotly\`, \`random\`, \`statistics\`, \`datetime\`, \`time\`, \`json\`, \`os\`, \`io\`, \`re\`, \`typing\`, \`dataclasses\`, \`urllib\`, \`requests\`, \`scikit-learn\`, \`csv\`, \`base64\`, \`uuid\`, \`collections\`, \`itertools\`, \`functools\`, \`pillow\` (PIL), \`beautifulsoup4\`, \`fpdf2\`.
- **Network Access**: The \`requests\` library CAN make external network requests.
- **File System**: The file system is virtual. Saving files with \`open()\` or \`image.save()\` will NOT make them available to the user. Use the special mechanisms below for outputs.

**Python Output Mechanisms**

- **Standard Output**: Use \`print()\` for text.
- **Matplotlib Plots**: Use \`plt.show()\`. This is automatically captured and displayed as an image.
- **Plotly Plots**: Create a figure with \`plotly.express\` or \`plotly.graph_objects\` and call \`fig.show()\`. This will be rendered as an interactive chart.
- **Pillow (PIL) Images**:
    - To **display** an image directly in the chat, create the image and call \`image.show()\`. This is the most common case.
    - If the user explicitly asks to **save** or **download** the image, you MUST use the file download mechanism below.
- **File Downloads**: To make a file downloadable, you MUST print a special string: \`__QBIT_DOWNLOAD_FILE__:FILENAME:MIMETYPE:BASE64_STRING\`.
  - **CRITICAL RULE**: You are FORBIDDEN from calling functions that save to a file path, such as \`pdf.output('filename.pdf')\` or \`image.save('filename.png')\`. YOU MUST use the `__QBIT_DOWNLOAD_FILE__` mechanism. Failure to do so is a major error.
  - You must generate the file content as bytes, then encode it to base64.

  # Correct PDF Download Example (to avoid deprecation warnings):
  import base64
  from fpdf import FPDF, XPos, YPos
  pdf = FPDF()
  pdf.add_page()
  # Use 'helvetica' not 'arial'. Use keyword args.
  pdf.set_font('helvetica', 'B', 16)
  # Use 'txt', and for a new line use 'new_x' and 'new_y'.
  pdf.cell(txt='Hello World!', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
  # Get output as bytes by encoding the string result.
  pdf_bytes = pdf.output(dest='S').encode('latin-1')
  b64_data = base64.b64encode(pdf_bytes).decode('utf-8')
  print(f"__QBIT_DOWNLOAD_FILE__:hello_world.pdf:application/pdf:{b64_data}")

  # Correct Pillow Image Download Example:
  import base64
  import io
  from PIL import Image
  image = Image.new('RGB', (200, 100), 'blue')
  buffer = io.BytesIO()
  image.save(buffer, format='PNG') # Correct: save to in-memory buffer
  buffer.seek(0)
  b64_data = base64.b64encode(buffer.read()).decode('utf-8')
  print(f"__QBIT_DOWNLOAD_FILE__:my_image.png:image/png:{b64_data}")

**Code Quality Rules**

- **CRITICAL SYNTAX RULE**: You MUST NOT use multi-line strings with triple quotes (\`"""\` or \`'''\`). Use single-line \`#\` comments for explanations. This is to prevent \`SyntaxError: unterminated string literal\`.
- **COMPLETENESS RULE**: Before finishing your response, mentally double-check your generated code for any unclosed parentheses \`(\`, brackets \`[\`, or braces \`{\`. Ensure all blocks are complete.
- Provide clean, readable, and correct code.
- Import all necessary libraries at the beginning of the code block.

**Chain of Thought**

- Use \`<thinking>\` tags to reason about the user's request. Explain your plan, the tools you will use, and the steps you will take. This is for internal reasoning and will be displayed in a "Chain of Thought" section in the UI.
`;


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
        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable is not set.");
        }
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        
        // Combine the master prompt with any persona-specific instructions
        const finalSystemInstruction = [masterPrompt, personaInstruction].filter(Boolean).join('\\n\\n');

        // Convert the client's conversation history to the Gemini API format.
        const geminiHistory: Content[] = (history as HistoryItem[]).map(msg => ({
            role: msg.author === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
        }));

        // Prepare the parts for the user's current message (text and attachments).
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
        
        const contents: Content[] = [
            ...geminiHistory,
            { role: 'user', parts: userMessageParts }
        ];

        // Per guidelines, use gemini-2.5-flash model
        const model = 'gemini-2.5-flash';

        // Set up the streaming response.
        const responseStream = new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                
                const write = (data: object) => {
                    controller.enqueue(encoder.encode(JSON.stringify(data) + '\\n'));
                };

                try {
                    const stream = await ai.models.generateContentStream({
                        model: model,
                        contents: contents,
                        config: {
                            systemInstruction: finalSystemInstruction,
                        },
                    });

                    let usageMetadataSent = false;

                    for await (const chunk of stream) {
                        const text = chunk.text;
                        if (text) {
                            write({ type: 'chunk', payload: text });
                        }

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