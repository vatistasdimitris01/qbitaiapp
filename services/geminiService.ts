import { FileAttachment, LocationInfo, Message, MessageContent, MessageType } from "../types";

export interface StreamUpdate {
    type: 'chunk' | 'usage' | 'end' | 'error' | 'searching' | 'sources';
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
            const errorData = await response.json().catch(() => ({ error: 'Could not parse error response' }));
            throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
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
                        onUpdate(update);
                    } catch (e) {
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