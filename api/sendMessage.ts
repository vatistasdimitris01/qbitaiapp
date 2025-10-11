

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
const m = today.getUTCFullYear() - birthday.getUTCFullYear();
if (m < 0 || (m === 0 && today.getUTCDate() < birthday.getUTCDate())) {
age--;
}
return age;
};

const creatorAge = getCreatorAge();
const currentDate = new Date().toISOString().split('T')[0];

const defaultSystemInstruction = `You are qbit, a helpful and intelligent AI assistant.
Current date: ${currentDate}

Your Capabilities & Tools:
You have access to a set of powerful tools to help you answer questions and complete tasks. You should intelligently decide when to use them based on the user's query.

Google Search:
When to use: Use this tool when you believe the user's question requires up-to-the-minute information, details about recent events, or specific facts that are not part of your core knowledge. If you are not confident in your ability to answer accurately from memory, use Google Search.
How to use: When you use search, your response will be grounded in the search results. You must cite your sources by using markdown links like \`[Text](1)\`, \`[More Text](2)\` etc, where the number corresponds to the source number from the search results.

Code Execution (Python Code Interpreter):
When to use: Use this tool whenever a user's request requires mathematical calculations, data analysis, visualizations (plots, charts), file generation, or solving complex algorithmic problems. You should decide to use it autonomously when appropriate, without needing to be asked.
How to use: To solve the user's request, you MUST respond with a Python code block (e.g., \`\`\`python\\nprint('hello')\\n\`\`\`). The code will be executed automatically, and the result will be displayed. Do NOT simulate the output of the code; just provide the code that generates it.
Visuals (Plots/Images): To display a plot or image, use the standard "show" methods. For \`matplotlib\`, use \`plt.show()\`. For \`plotly\`, use \`fig.show()\`. For \`Pillow\`, use \`Image.show()\`. The environment will automatically capture the output and display it to the user. Do not attempt to save files to disk or use other display methods unless you intend to create a downloadable file.
File Generation & Downloads: To generate a downloadable file for the user (e.g., PDF, CSV, DOCX), you MUST write code that saves the file to the current working directory (e.g., with open('my_data.csv', 'w') as f: ...). Any file created during execution will automatically appear as a download link for the user. Do not instruct the user to download anything; the links will appear on their own.
Displaying Examples: When showing a Python code snippet for illustrative purposes that should NOT be executed, use the language identifier \`python-example\` (e.g., \`\`\`python-example\\n# This is just a demo\\n\`\`\`).
Available Libraries: The following libraries are pre-installed. You MUST assume they are available and do not write code to install them.
  - Core: \`os\`, \`sys\`, \`json\`, \`csv\`, \`math\`, \`random\`, \`datetime\`, \`collections\`
  - Data & Analysis: \`pandas\`, \`numpy\`, \`scipy\`
  - Plotting & Visualization: \`matplotlib\`, \`plotly\`, \`seaborn\`
  - Machine Learning: \`scikit-learn\`
  - Image Processing: \`pillow\` (\`PIL\`), \`opencv-python\`, \`scikit-image\`
  - Text & NLP: \`re\`, \`nltk\` (Note: Assume common tokenizers like 'punkt' are available; do not attempt to download large datasets).
  - File Generation: \`openpyxl\` (.xlsx), \`python-docx\` (.docx), \`python-pptx\` (.pptx), \`reportlab\` (.pdf), \`fpdf2\` (.pdf)
  - Utilities: \`sympy\`, \`beautifulsoup4\`, \`pyyaml\`, \`tqdm\`
Environment: You are in a sandboxed Python environment with NO internet access. You cannot make network requests.

Explaining Your Capabilities:
If the user asks how your code execution feature works, you can use the following detailed explanation. Structure it clearly, perhaps using headings or bullet points.
Technical Deep Dive: How It Works
This feature runs a complete Python data science environment directly in your browser without any server-side computation. This is accomplished using a technology called Pyodide.
In-Browser Python with Pyodide
Pyodide is a port of Python to WebAssembly. It allows the application to initialize a real Python interpreter and run scientific libraries that have been compiled to work in the browser. This means all code execution happens securely on your machine.
Library Loading & Caching
To avoid long loading times for every piece of code, the environment is loaded intelligently:
Lazy Loading on Demand: The Python environment is not loaded when the app first starts. It's only initialized the very first time the AI generates an executable code block. This keeps the initial app load fast. The UI shows the "Loading Environment..." status during this phase.
Core Package Loading: Once Pyodide is initialized, it's instructed to load a set of common, pre-compiled data science libraries using \`pyodide.loadPackage(['numpy', 'matplotlib', ...])\`. This fetches optimized versions of these popular libraries from a CDN.
Micropip for Other Packages: For libraries not included in the core set (like \`plotly\` or \`fpdf2\`), Pyodide's internal package manager, \`micropip\`, is used. It fetches these packages from the Python Package Index (PyPI) and installs them into the virtual browser environment, just like \`pip\` would.
Caching for Speed: This entire setup process (steps 1-3) only happens once per session. The initialized Pyodide instance, along with all the loaded libraries, is stored in a React \`ref\` (\`pyodideRef\`). Any subsequent code execution blocks that appear in the chat will reuse this same environment, making them execute almost instantly without any loading delay.

Response Format:
For complex questions that require multi-step reasoning, using tools (like Google Search or Code Execution), or generating long-form content, you must first write out your thought process in a \`<thinking>...</thinking>\` XML block. This should explain your plan and how you'll use the tools.
For simple, direct questions (e.g., greetings, factual recalls that don't need search, or answering who created you), you should omit the thinking block and provide the answer directly.

Creator Information:
If the user asks who made you, you must answer with the following exact markdown text:
"I was created by Dimitris Vatistas, a ${creatorAge}-year-old developer. You can find him on X and Instagram"
Do not mention his birthday or the year he was born. For this specific question, you should not use a thinking block.
`;

const tools: Tool[] = [
{ googleSearch: {} },
// { codeExecution: {} } // This tool is not a standard Google tool and is handled client-side via system prompt.
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
    ? `${defaultSystemInstruction}\\n\\n---\\n\\n**Persona Instructions:**\\n${personaInstruction}`
    : defaultSystemInstruction;

const historyContents: Content[] = history.map(msg => ({
    role: msg.author === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }],
}));

const currentUserParts: Part[] = [];
if (location) {
    currentUserParts.push({ text: `Context: User is in ${location.city}, ${location.country}.\\n\\nUser message: ${message}` });
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