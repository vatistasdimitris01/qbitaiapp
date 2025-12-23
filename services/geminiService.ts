
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
    console.log("[GeminiService] Starting stream...", { messageLength: message.length, attachmentCount: attachments?.length });
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

        const formData = new FormData();
        formData.append('payload', JSON.stringify(payload));

        if (attachments) {
            for (const file of attachments) {
                formData.append('file', file);
            }
        }

        console.log("[GeminiService] Fetching /api/sendMessage...");
        const response = await fetch('/api/sendMessage', {
            method: 'POST',
            body: formData,
            signal,
        });

        console.log("[GeminiService] Response status:", response.status);

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

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            
            // Handle potentially split JSON lines
            const lines = buffer.split('\n');
            // Keep the last line in the buffer as it might be incomplete
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim() === '') continue;
                try {
                    const update: StreamUpdate = JSON.parse(line);
                    
                    if (update.type === 'chunk') {
                        fullResponseAccumulator += (update.payload || "");
                    } else if (update.type === 'tool_call') {
                        toolCallsMade.push(update.payload.name);
                        console.log("[GeminiService] Tool Call detected:", update.payload.name);
                    } else if (update.type === 'error') {
                        throw new Error(update.payload);
                    } else if (update.type === 'end') {
                        console.log("[GeminiService] Stream ended cleanly.");
                        onUpdate(update); // Send end signal
                        return; // Exit normally
                    }
                    
                    onUpdate(update);
                } catch (e) {
                    if (e instanceof Error && e.message.includes("Unexpected end of JSON input")) {
                        console.warn("Malformed JSON line in stream (ignoring):", line);
                    } else {
                        console.error("JSON Parse Error:", e);
                        throw e;
                    }
                }
            }
        }

        const duration = Date.now() - startTime;
        console.log("[GeminiService] Finished in", duration, "ms");
        onFinish(duration);

    } catch (error) {
        const duration = Date.now() - startTime;
        if (error instanceof Error && error.name === 'AbortError') {
             console.log("[GeminiService] Request aborted by user.");
        } else {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.error("[GeminiService] Fatal Stream Error:", errorMsg);
            onError(errorMsg);
            onFinish(duration);
        }
    }
};

export const deleteChatSession = (conversationId: string) => {};
