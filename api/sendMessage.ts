// FIX: Implemented the missing sendMessage API endpoint.
// This Vercel Edge Function streams responses from the Google GenAI API.

import { GoogleGenAI, Content, FunctionDeclaration, Type, Part } from "@google/genai";

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

const googleSearchTool: FunctionDeclaration = {
  name: 'google_search',
  description: 'Search Google for recent information, events, and topics. Use this for any user query that requires up-to-date information from the web.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: 'The search query to send to Google.'
      }
    },
    required: ['query']
  }
};

async function performGoogleSearch(query: string) {
    const API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
    const ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID;
    if (!API_KEY || !ENGINE_ID) {
        throw new Error("Google Search API Key or Engine ID is not configured.");
    }
    const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${ENGINE_ID}&q=${encodeURIComponent(query)}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Google Search API failed with status ${response.status}`);
    }
    const data = await response.json();
    const items = data.items || [];
    return items.slice(0, 5).map((item: any) => ({
        web: {
          title: item.title,
          uri: item.link,
          snippet: item.snippet,
        }
    }));
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
        
        let contents: Content[] = [
            ...geminiHistory,
            { role: 'user', parts: userMessageParts }
        ];

        const model = 'gemini-2.5-flash';

        const baseSystemInstruction = `You are a helpful and brilliant assistant.

- **Creator Information**: If the user asks "who made you?", "who created you?", "who is your developer?", or any similar question about your origin, you MUST respond with the following text: "I was created by Vatistas Dimitris. You can find him on X: https://x.com/vatistasdim and Instagram: https://www.instagram.com/vatistasdimitris/". Do not add any conversational filler before or after this statement.
- **Web Search**: You have a tool named \`google_search\` that you can use to search the web for recent information. When a user asks a question that requires current events, data, or information not in your training data, you should call this tool with a relevant search query. When you receive the search results, synthesize the information to formulate a comprehensive answer.
- **Location-Aware Search**: The user's location is provided in their prompt. If their query is location-specific (e.g., "weather", "restaurants near me"), use this information to create a better search query for the \`google_search\` tool. For general questions, ignore the location.
- Your main goal is to be proactive and execute tasks for the user.
- Be tolerant of minor typos and infer user intent. For example, if a user asks to "create a graph circle usong python", interpret this as a request to plot a circle or create a pie chart and generate the corresponding code. Prefer action over asking for clarification on simple requests.
- **CODE FORMATTING GUIDE**:
    - **Inline Code**: For brief code elements, terminal commands, function names (\`print()\`), variable names (\`my_variable\`), or file names (\`hello.py\`), use single backticks.
    - **Code Execution**: By default, all fenced code blocks are treated as executable and will have a "Run" button.
    - **Non-Executable Examples (\`no-run\`)**: If a code snippet is for demonstration only, is incomplete, or conceptual, you MUST add the \`no-run\` keyword to the info string.
    - **Shell Command & Output Examples**: Use a single \`text no-run\` block. Prefix commands with \`$\` and do not prefix output.
- **AUTONOMOUS EXECUTION & DISPLAY**:
    - If the user gives a direct and simple command to create a file or plot (e.g., "plot a sine wave"), you MUST use the 'autorun' keyword in the code block info string (e.g., \`\`\`python autorun). Your entire response MUST consist ONLY of the code block.
    - For tasks that generate a file for the user, you MUST also add the 'collapsed' keyword.
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
                    // First call to check for tool use
                    const firstStream = await ai.models.generateContentStream({
                        model: model,
                        contents: contents,
                        config: {
                            systemInstruction: finalSystemInstruction,
                            tools: [{ functionDeclarations: [googleSearchTool] }],
                        },
                    });

                    let accumulatedFunctionCall: any = null;
                    let textOutput = '';
                    let usageMetadata: any = null;

                    for await (const chunk of firstStream) {
                        if (chunk.text) {
                            textOutput += chunk.text;
                        }
                        if (chunk.functionCalls) {
                            accumulatedFunctionCall = chunk.functionCalls[0];
                        }
                        if (chunk.usageMetadata) {
                            usageMetadata = chunk.usageMetadata;
                        }
                    }

                    if (accumulatedFunctionCall) {
                        const query = accumulatedFunctionCall.args.query;
                        write({ type: 'searching', payload: query });

                        const searchResults = await performGoogleSearch(query);
                        write({ type: 'sources', payload: searchResults });

                        // FIX: Changed tool response to be a structured JSON object instead of a pre-formatted string.
                        // This is more robust and less likely to confuse the model.
                        const toolResponsePart: Part = {
                            functionResponse: {
                                name: 'google_search',
                                response: {
                                    results: searchResults.map((result: any) => ({
                                        title: result.web.title,
                                        link: result.web.uri,
                                        snippet: result.web.snippet,
                                    })),
                                },
                            },
                        };
                        
                        contents.push({ role: 'model', parts: [{ functionCall: accumulatedFunctionCall }] });
                        // FIX: The role for a function response must be 'tool'. Using 'user' can cause the model to ignore the tool output.
                        contents.push({ role: 'tool', parts: [toolResponsePart] });

                        // Second call to get the final answer based on search results
                        const secondStream = await ai.models.generateContentStream({
                            model: model,
                            contents: contents,
                            // CRITICAL: Do not provide tools in the second call to prevent recursion.
                            config: { systemInstruction: finalSystemInstruction }
                        });
                        
                        let usageMetadataSent = false;
                        for await (const chunk of secondStream) {
                             if (chunk.text) {
                                write({ type: 'chunk', payload: chunk.text });
                            }
                            if (chunk.usageMetadata && !usageMetadataSent) {
                                write({ type: 'usage', payload: chunk.usageMetadata });
                                usageMetadataSent = true;
                            }
                        }

                    } else {
                        // No tool use, just stream the text we got from the first call
                        if (textOutput) {
                            write({ type: 'chunk', payload: textOutput });
                        }
                        if (usageMetadata) {
                            write({ type: 'usage', payload: usageMetadata });
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