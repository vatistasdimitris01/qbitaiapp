
import { FileAttachment, LocationInfo, Message, MessageContent, MessageType } from "../types";

export interface StreamUpdate {
    type: 'chunk' | 'usage' | 'end' | 'error' | 'searching' | 'sources' | 'tool_call' | 'search_result_count';
    payload?: any;
}

export const streamMessageToAI = async (
    conversationHistory: Message[],
    message: string,
    attachments: File[],
    personaInstruction: string | undefined,
    location: LocationInfo | null,
    language: string | undefined,
    signal: AbortSignal,
    onUpdate: (update: StreamUpdate) => void,
    onFinish: (duration: number) => void,
    onError: (error: string) => void
): Promise<void> => {
    const startTime = Date.now();
    let fullResponseAccumulator = "";
    let toolCallsMade: string[] = [];

    const getTextFromMessageContent = (content: MessageContent): string => {
        if (typeof content === 'string') return content;
        return '';
    };

    const historyForApi = conversationHistory.map(msg => ({
        type: msg.type,
        content: getTextFromMessageContent(msg.content),
        toolCalls: msg.toolCalls,
        files: msg.files?.map(f => ({
            mimeType: f.type,
            data: f.dataUrl.startsWith('data:') ? f.dataUrl.split(',')[1] : null,
        })).filter(f => f.data),
    }));

    try {
        const payload = {
            history: historyForApi,
            message,
            personaInstruction,
            location,
            language,
        };

        // Console Log: Request
        console.groupCollapsed("%c Qbit API Request ", "background: #1d9bf0; color: white; font-weight: bold; border-radius: 4px;");
        console.log("Endpoint: POST /api/sendMessage");
        console.log("Payload:", {
            history: payload.history,
            message: payload.message,
            location: payload.location,
            language: payload.language
        });
        console.groupEnd();

        const formData = new FormData();
        formData.append('payload', JSON.stringify(payload));

        if (attachments) {
            for (const file of attachments) {
                formData.append('file', file);
            }
        }

        const response = await fetch('/api/sendMessage', {
            method: 'POST',
            body: formData,
            signal,
        });

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                const errorData = await response.json();
                if (errorData?.error?.message) errorMessage = errorData.error.message;
            } catch (e) {}
            throw new Error(errorMessage);
        }

        if (!response.body) throw new Error("Response body is empty.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processStream = async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    try {
                        const update: StreamUpdate = JSON.parse(line);
                        
                        if (update.type === 'chunk') {
                            fullResponseAccumulator += update.payload;
                        } else if (update.type === 'tool_call') {
                            toolCallsMade.push(update.payload.name);
                        } else if (update.type === 'error') {
                            throw new Error(update.payload);
                        } else if (update.type === 'end') {
                            return;
                        }
                        
                        onUpdate(update);
                    } catch (e) {
                        if (e instanceof Error && e.message.includes("Unexpected end of JSON input")) continue;
                        throw e;
                    }
                }
            }
        };

        await processStream();

        const duration = Date.now() - startTime;
        
        // Console Log: Response
        console.groupCollapsed("%c Qbit AI Response ", "background: #22c55e; color: white; font-weight: bold; border-radius: 4px;");
        console.log("Duration:", (duration / 1000).toFixed(2), "s");
        if (toolCallsMade.length > 0) console.log("Tools Used:", toolCallsMade);
        console.log("Content:", fullResponseAccumulator || "[Tool Call Only]");
        console.groupEnd();

        onFinish(duration);

    } catch (error) {
        const duration = Date.now() - startTime;
        if (error instanceof Error && error.name === 'AbortError') {
             // Abort is silent
        } else {
            const errorMsg = error instanceof Error ? error.message : String(error);
            
            // Console Log: Error (Red Group)
            console.groupCollapsed("%c Qbit Error ", "background: #ef4444; color: white; font-weight: bold; border-radius: 4px;");
            console.error("Message:", errorMsg);
            console.log("Trace:", error);
            console.groupEnd();

            onError(errorMsg);
            onFinish(duration);
        }
    }
};

export const deleteChatSession = (conversationId: string) => {};
