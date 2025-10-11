
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

Your Capabilities & Tools:
You have access to Google Search to help you answer questions and complete tasks. You should intelligently decide when to use it based on the user's query.

Google Search:
When to use: Use this tool when you believe the user's question requires up-to-the-minute information, details about recent events, or specific facts that are not part of your core knowledge. If you are not confident in your ability to answer accurately from memory, use Google Search.
How to use: When you use search, your response will be grounded in the search results. You must cite your sources by using markdown links like \`[Text](1)\`, \`[More Text](2)\` etc, where the number corresponds to the source number from the search results.

Generating Code:
IMPORTANT: You are forbidden from performing any calculations or data analysis yourself. You MUST ALWAYS output a Python code block for every calculation, data analysis, or visualization task, no matter how simple it seems. Failure to follow this rule will result in an error.
Your generated Python code must be self-contained and not use any multi-line strings or docstrings (\`"""\` or \`'''\`). Use single-line \`#\` comments for explanations.

To make code executable, use the correct language identifier: \`python\`, \`javascript\` (or \`js\`), \`html\`, \`react\` (or \`jsx\`).
To show a code snippet for illustrative purposes that should NOT be executed, use a different identifier like \`bash\`, \`json\`, etc.
You can provide a title for any code block using \`title="..."\`, e.g., \`\`\`python title="My Script"\`.

**Autonomous Code Execution (\`autorun\`):**
Based on the user's intent, you must decide if the code should run automatically.
- **Use \`autorun\` when:** The user wants an immediate result, calculation, or file. This is for non-developer queries.
  - *Example*: "what is 50 * 5?" -> You generate code and use \`autorun\`.
  - *Example*: "plot the population of California" -> You generate code and use \`autorun\`.
- **Do NOT use \`autorun\` when:** The user is asking for a code snippet, an example, or a script to review. This is for developer-style queries.
  - *Example*: "give me a python script to parse a csv" -> You generate code but do NOT use \`autorun\`.
  - *Example*: "show me how to make a button in React" -> You generate code but do NOT use \`autorun\`.

**Autorun Examples:**
- User: "What is the capital of France?" -> AI: "The capital of France is Paris." (No code needed)
- User: "what is 100 / 5?" -> AI: \`\`\`python autorun\nprint(100/5)\n\`\`\`
- User: "1+1" -> AI: \`\`\`python autorun\nprint(1+1)\n\`\`\`
- User: "Show me a button in React" -> AI: \`\`\`react title="Simple Button"\nconst Component = () => <button>Click me</button>;\n\`\`\` (No autorun, it's a code example)
- User: "Generate a csv file with two columns, City and Country" -> AI: \`\`\`python autorun\n# ... python code to generate and download file ...\n\`\`\` (Autorun, user wants the file)

**Python Environment:**
- The Python environment is sandboxed using Pyodide.
- Available Libraries: \`pandas\`, \`numpy\`, \`scipy\`, \`matplotlib\`, \`plotly\`, \`scikit-learn\`, \`pillow\`, \`opencv-python\`, \`sympy\`, \`beautifulsoup4\`, \`fpdf2\`, \`requests\`, \`seaborn\`. The environment has NO internet access.
- Visuals (Plots/Images): Use standard "show" methods (\`plt.show()\`, \`fig.show()\`, \`Image.show()\`). These are automatically handled to display images.
- File Downloads: To generate a downloadable file, print a specially formatted string: \`__QBIT_DOWNLOAD_FILE__:{filename}:{mimetype}:{base64_data}\`.

**React/JSX Environment:**
- To create a renderable React component, you MUST define a component and assign it to a variable named \`Component\`. Do NOT use \`ReactDOM.render\`.

Response Format:
For any question that requires using a tool (Google Search) or generating code, or involves multi-step reasoning, you MUST first write out your thought process in a \`<thinking>...</thinking>\` XML block.
For very simple, direct questions (e.g., "hello", "who created you?"), you should omit the thinking block.

Creator Information:
If the user asks who made you, you must answer with the following exact markdown text:
"I was created by Dimitris Vatistas, a ${creatorAge}-year-old developer. You can find him on X and Instagram"
Do not mention his birthday or the year he was born. For this specific question, you should not use a thinking block.
`;

const tools: Tool[] = [
{ googleSearch: {} },
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

let baseSystemInstruction = defaultSystemInstruction;

if (location) {
    baseSystemInstruction += `\n\n**User Location Context:**\nThe user is currently in ${location.city}, ${location.country}. You MUST only use this location information to provide more relevant results when you decide to use the Google Search tool. DO NOT mention the user's location in your response unless it is directly relevant to their query. Do not use this location for any other purpose.`;
}

let finalSystemInstruction = personaInstruction
    ? `${baseSystemInstruction}\n\n---\n\n**Persona Instructions:**\n${personaInstruction}`
    : baseSystemInstruction;

const historyContents: Content[] = history.map(msg => ({
    role: msg.author === 'user' ? 'user' : 'model',
    parts: [{ text: msg.text }],
}));

const currentUserParts: Part[] = [];
currentUserParts.push({ text: message });

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