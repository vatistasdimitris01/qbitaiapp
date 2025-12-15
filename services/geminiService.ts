

import { FileAttachment, LocationInfo, Message, MessageContent, MessageType } from "../types";

export interface StreamUpdate {
    type: 'chunk' | 'usage' | 'end' | 'error' | 'searching' | 'sources' | 'tool_call' | 'search_result_count';
    payload?: any;
}

// This function now opens a streaming connection to our secure serverless function
export const streamMessageToAI = async (
    conversationHistory: Message[],
    message: string,
    attachments: File[],
    personaInstruction: string | undefined,
    location: LocationInfo | null,
    language: string | undefined,
    signal: AbortSignal, // Added to allow aborting the request
    onUpdate: (update: StreamUpdate) => void,
    onFinish: (duration: number) => void,
    onError: (error: string) => void
): Promise<void> => {
    const startTime = Date.now();

    const getTextFromMessageContent = (content: MessageContent): string => {
        if (typeof content === 'string') {
            return content;
        }
        return '';
    };

    const historyForApi = conversationHistory.map(msg => ({
        type: msg.type,
        content: getTextFromMessageContent(msg.content),
        toolCalls: msg.toolCalls, // Pass previous tool calls to context if needed
        files: msg.files?.map(f => ({
            mimeType: f.type,
            // Ensure dataUrl is a base64 string for history
            data: f.dataUrl.startsWith('data:') ? f.dataUrl.split(',')[1] : null,
        })).filter(f => f.data), // Filter out files that might have object URLs
    }));

    try {
        const formData = new FormData();
        const payload = {
            history: historyForApi,
            message,
            personaInstruction,
            location,
            language,
        };
        formData.append('payload', JSON.stringify(payload));

        if (attachments) {
            for (const file of attachments) {
                formData.append('file', file);
            }
        }

        const response = await fetch('/api/sendMessage', {
            method: 'POST',
            body: formData, // The browser will set the correct multipart/form-data header
            signal,
        });

        if (!response.ok) {
            let errorMessage = `API request failed with status ${response.status}`;
            try {
                // Try to parse JSON error first
                const errorData = await response.json();
                if (errorData?.error?.message) {
                    errorMessage = errorData.error.message;
                }
            } catch (jsonError) {
                // If JSON parsing fails, try reading as text (e.g., HTML 403/500 error pages)
                try {
                    const textError = await response.text();
                    if (textError) {
                        // Truncate to avoid huge HTML dumps, just hint at the issue
                        errorMessage = `API Error: ${textError.substring(0, 100)}...`;
                    }
                } catch (textError) {
                    // Fallback to default message
                }
            }
            throw new Error(errorMessage);
        }

        if (!response.body) {
            throw new Error("Response body is empty.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processStream = async () => {
            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep the last partial line in buffer

                for (const line of lines) {
                    if (line.trim() === '') continue;
                    try {
                        const update: StreamUpdate = JSON.parse(line);
                        if (update.type === 'end') {
                            return; // Graceful end of stream
                        }
                        if (update.type === 'error') {
                            throw new Error(update.payload);
                        }
                        onUpdate(update);
                    } catch (e) {
                        // If it's the error we just threw, re-throw it to break the loop and hit the catch block below
                        if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
                             throw e;
                        }
                        console.error("Failed to parse stream line:", line, e);
                    }
                }
            }
        };

        await processStream();

        if (buffer.trim() !== '') {
            const lines = buffer.split('\n');
            for (const line of lines) {
                if (line.trim() === '') continue;
                try {
                    const update: StreamUpdate = JSON.parse(line);
                    if (update.type === 'error') throw new Error(update.payload);
                    onUpdate(update);
                } catch (e) {
                    console.error("Failed to parse final stream buffer line:", line, e);
                }
            }
        }
        
        const duration = Date.now() - startTime;
        onFinish(duration);

    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
             console.log("Stream aborted by user.");
        } else {
            console.error("Error streaming message to AI:", error);
            onError(error instanceof Error ? error.message : String(error));
            const duration = Date.now() - startTime;
            onFinish(duration);
        }
    }
};

export const deleteChatSession = (conversationId: string) => {
    // This function is now a no-op.
};