import { FileAttachment, LocationInfo, Message, MessageContent, MessageType } from "../types";

export interface StreamUpdate {
    type: 'chunk' | 'searching' | 'sources' | 'usage' | 'end' | 'error';
    payload?: any;
}

// This function now opens a streaming connection to our secure serverless function
export const streamMessageToAI = async (
    conversationHistory: Message[],
    message: string,
    attachments: FileAttachment[] | undefined,
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
        // For other types, return a placeholder or string representation if needed for history
        return '';
    };

    // Sanitize and convert history to the format the API expects
    const sanitizedHistory = conversationHistory.map(msg => {
        const text = getTextFromMessageContent(msg.content);
        let attachmentText = '';
        if (msg.files && msg.files.length > 0) {
            attachmentText = msg.files.map(a => `[User previously uploaded image: ${a.name}]`).join('\n');
        }
        
        return {
            author: msg.type === MessageType.USER ? 'user' : 'ai',
            text: `${text}\n${attachmentText}`.trim(),
        };
    });

    const apiAttachments = attachments?.map(file => {
        return {
            mimeType: file.type,
            data: file.dataUrl.split(',')[1],
        };
    });

    try {
        const response = await fetch('/api/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                history: sanitizedHistory,
                message,
                attachments: apiAttachments,
                personaInstruction,
                location,
                language
            }),
            signal // Pass the signal to the fetch call
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

        // Process any remaining data in buffer
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

    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
             console.log("Stream aborted by user.");
             // Don't call onError for user-initiated aborts
        } else {
            console.error("Error streaming message to AI:", error);
            onError(error instanceof Error ? error.message : String(error));
        }
    } finally {
        const duration = Date.now() - startTime;
        onFinish(duration);
    }
};


// This is no longer needed as chat history is managed by the client and sent with each request
export const deleteChatSession = (conversationId: string) => {
    // This function is now a no-op.
};