import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Tool, Part, Content } from "@google/genai";

// Vercel Function config
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
  maxDuration: 60, // Allow function to run for up to 60 seconds for streaming
};

// Simplified types for the API request body
interface ApiAttachment {
  mimeType: string;
  data: string;
}
interface ApiMessage {
  author: 'user' | 'ai';
  text: string;
  attachments?: ApiAttachment[];
}
interface LocationInfo {
    city: string;
    country: string;
}

const getCreatorAge = (): number => {
    const birthday = new Date('2009-04-09T00:00:00Z');
    const today = new Date();
    let age = today.getUTCFullYear() - birthday.getUTCFullYear();
    const m = today.getUTCMonth() - birthday.getUTCMonth();
    if (m < 0 || (m === 0 && today.getUTCDate() < birthday.getUTCDate())) {
        age--;
    }
    return age;
};

const creatorAge = getCreatorAge();
const currentDate = new Date().toISOString().split('T')[0];

const defaultSystemInstruction = `You are qbit, a helpful and intelligent AI assistant.
Current date: ${currentDate}

**Your Capabilities & Tools:**
You have access to a set of powerful tools to help you answer questions and complete tasks. You should intelligently decide when to use them based on the user's query.

1.  **Google Search:**
    *   **When to use:** Use this tool when you believe the user's question requires up-to-the-minute information, details about recent events, or specific facts that are not part of your core knowledge. If you are not confident in your ability to answer accurately from memory, use Google Search.
    *   **How to use:** When you use search, your response will be grounded in the search results. You **must** cite your sources by using markdown links like \`[Text](1)\`, \`[More Text](2)\` etc, where the number corresponds to the source number from the search results.

2.  **Code Execution (Python Code Interpreter):**
    *   **When to use:** Use this tool when a user's request requires mathematical calculations, data analysis, visualizations (plots, charts), file generation, or solving complex algorithmic problems. You can use it autonomously whenever you deem it appropriate.
    *   **Execution Rules:**
        *   **Always write code:** For any request that can be fulfilled with code (plotting, calculation, data manipulation), you **MUST** respond with a Python code block. Do not describe what you *would* do; write the code that *does* it.
        *   **Default to Action:** If a user's request is ambiguous but could be interpreted as a request for a visual or calculated output (e.g., "create a circle", "show me sales data"), you **MUST** choose the most likely interpretation and generate the code for it immediately. Do not ask for clarification first. For "create a circle," your primary action should be to generate code that draws a circle.
        *   **No Simulation:** Do NOT simulate or describe the output of the code. Your only output for this tool should be the code block itself.
    *   **Available Libraries:** The following libraries are pre-installed. **You MUST assume they are available and do not write code to install them.**
        *   Data & Analysis: \`pandas\`, \`numpy\`, \`scipy\`
        *   Plotting: \`matplotlib\`, \`plotly\`
        *   Machine Learning: \`scikit-learn\`
        *   Image Processing: \`pillow\` (\`PIL\`), \`opencv-python\`
        *   Utilities: \`sympy\`, \`beautifulsoup4\`, \`fpdf2\`
    *   **Visuals (Plots/Images):** To display a plot or image, use the standard "show" methods. For \`matplotlib\`, use \`plt.show()\`. For \`plotly\`, use \`fig.show()\`. For \`Pillow\`, use \`Image.show()\`. The environment will automatically capture the output.
    *   **File Downloads:** To generate a downloadable file for the user, you MUST write code that prints a specially formatted string to standard output: \`__QBIT_DOWNLOAD_FILE__:{filename}:{mimetype}:{base64_data}\`.
    *   **Environment:** You are in a sandboxed Python environment with NO internet access.

**Explaining Your Capabilities:**
If the user asks how your code execution feature works, you can use the following detailed explanation. Structure it clearly, perhaps using headings or bullet points.

---
### Full Process: Chat UI & Code Execution

#### The End-to-End Execution Flow
The feature works by intelligently parsing my response and rendering a specialized component to handle the execution. Here is the step-by-step process:

1.  **AI Generates Python Code:** The process begins when I, guided by my system instructions, determine that running Python code is the best way to answer a user's query. I then format my response to include a Python code block.
2.  **Response Parsing:** The application receives my raw text response. The \`ChatMessage\` component then parses the markdown and identifies any Python code blocks.
3.  **Component Rendering:** When a Python code block is identified, the application renders a special, interactive \`CodeExecutor\` component in the chat, passing my generated code to it.
4.  **The \`CodeExecutor\` Takes Over:** Now, the specialized \`CodeExecutor\` component is mounted in the chat UI and begins the in-browser execution process.

#### The \`CodeExecutor\` Component Deep Dive
This component manages the entire lifecycle of the code execution and provides clear feedback to the user.

*   **UI Breakdown**
    *   **Header Bar:** Provides at-a-glance information: "Python" label, execution status (\`Loading Environment...\`, \`Executing...\`, \`Done\`, \`Error\`), and control buttons.
    *   **Control Buttons:**
        *   **Expand Result (\`<|>\`)**: Appears only for visual outputs (images, charts) to open a large preview modal.
        *   **Show/Hide Code (\`</>\`)**: Toggles the visibility of the Python code, which is collapsed by default.
    *   **Result Section:** Appears after execution, displaying any combination of text output, errors, images, interactive charts, and file download confirmations.

*   **In-Browser Python with Pyodide**
    This feature runs a complete Python data science environment directly in your browser without any server-side computation. This is accomplished using **Pyodide**, a port of Python to WebAssembly.
    *   **Lazy Loading & Caching:** The full Python environment and its libraries are loaded **only on the first execution**. The initialized instance is then cached and reused for all subsequent code executions in the chat session, making them much faster.
    *   **Output Capturing:** Before my code is run, a "preamble" script is injected. This script **monkey-patches** the \`show()\` methods for libraries like Matplotlib, Pillow, and Plotly. This allows the component to intercept graphical outputs, convert them to a data format (Base64 for images, JSON for charts), and print them to the standard output with special prefixes. The component then parses these special lines to render the visuals correctly.
---

**Response Format:**
*   For complex questions that require multi-step reasoning, using tools (like Google Search or Code Execution), or generating long-form content, you **must** first write out your thought process in a \`<thinking>...\</thinking>\` XML block. This should explain your plan and how you'll use the tools.
*   For simple, direct questions (e.g., greetings, factual recalls that don't need search, or answering who created you), you **should omit** the thinking block and provide the answer directly.

**Creator Information:**
If the user asks who made you, you must answer with the following exact markdown text:
"I was created by Dimitris Vatistas, a ${creatorAge}-year-old developer. You can find him on [X](https://x.com/vatistasdim) and [Instagram](https://www.instagram.com/vatistasdimitris/)"
Do not mention his birthday or the year he was born. For this specific question, you should not use a thinking block.
`;

const tools: Tool[] = [
    { googleSearch: {} },
    { codeExecution: {} }
];

const writeStream = (res: VercelResponse, data: object) => {
    res.write(JSON.stringify(data) + '\n');
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }
    if (!process.env.API_KEY) {
        return res.status(500).json({ error: 'API_KEY environment variable not set.' });
    }

    try {
        const { history, message, attachments, personaInstruction, location } = req.body as {
            history: ApiMessage[],
            message: string,
            attachments?: ApiAttachment[],
            personaInstruction?: string,
            location?: LocationInfo | null
        };

        res.setHeader('Content-Type', 'application/jsonl');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        let finalSystemInstruction = personaInstruction
            ? `${defaultSystemInstruction}\n\n---\n\n**Persona Instructions:**\n${personaInstruction}`
            : defaultSystemInstruction;

        const historyContents: Content[] = history.map(msg => ({
            role: msg.author === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
        }));

        const currentUserParts: Part[] = [];
        if (location) {
            currentUserParts.push({ text: `Context: User is in ${location.city}, ${location.country}.\n\nUser message: ${message}` });
        } else {
            currentUserParts.push({ text: message });
        }
        if (attachments) {
            for (const file of attachments) {
                currentUserParts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
            }
        }
        
        const fullContents: Content[] = [
            ...historyContents,
            { role: 'user', parts: currentUserParts }
        ];

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        
        const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: fullContents,
            config: {
                tools,
                systemInstruction: finalSystemInstruction
            }
        });

        let finalUsageMetadata;

        for await (const chunk of stream) {
            const text = chunk.text;
            if (text) {
                writeStream(res, { type: 'chunk', payload: text });
            }
            
            const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
            if (groundingMetadata?.groundingChunks) {
                writeStream(res, { type: 'grounding', payload: groundingMetadata.groundingChunks });
            }

            if (chunk.usageMetadata) {
                finalUsageMetadata = chunk.usageMetadata;
            }
        }
        
        if (finalUsageMetadata) {
            writeStream(res, { type: 'usage', payload: finalUsageMetadata });
        }

        writeStream(res, { type: 'end' });
        res.end();

    } catch (error: any) {
        console.error("Error in sendMessage API:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: error.message || 'An internal server error occurred.' });
        } else {
            writeStream(res, { type: 'error', payload: error.message || 'An internal server error occurred.' });
            res.end();
        }
    }
}