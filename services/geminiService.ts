import { Attachment, LocationInfo, Message } from "../types";

export interface StreamUpdate {
    type: 'chunk' | 'files' | 'usage' | 'end' | 'error';
    payload?: any;
}

// Helper function for delayed execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// This function now opens a streaming connection to our secure serverless function
export const streamMessageToAI = async (
    conversationHistory: Message[],
    message: string,
    attachments: Omit<Attachment, 'preview' | 'name'>[] | undefined,
    personaInstruction: string | undefined,
    location: LocationInfo | null,
    language: string | undefined,
    onUpdate: (update: StreamUpdate) => void,
    onFinish: (duration: number) => void,
    onError: (error: string) => void
): Promise<void> => {
    const startTime = Date.now();

    // Sanitize history to prevent "413 Content Too Large" errors.
    const sanitizedHistory = conversationHistory.map(msg => {
        if (!msg.attachments || msg.attachments.length === 0) {
            return msg;
        }
        const attachmentText = msg.attachments.map(a => `[User previously uploaded image: ${a.name}]`).join('\n');
        const { attachments, ...restOfMsg } = msg;
        return {
            ...restOfMsg,
            text: `${msg.text}\n${attachmentText}`.trim(),
        };
    });

    try {
        const response = await fetch('/api/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                history: sanitizedHistory,
                message,
                attachments,
                personaInstruction,
                location,
                language
            })
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
            try {
                const update: StreamUpdate = JSON.parse(buffer);
                onUpdate(update);
            } catch (e) {
                console.error("Failed to parse final stream buffer:", buffer, e);
            }
        }

    } catch (error) {
        console.error("Error streaming message to AI:", error);
        onError(error instanceof Error ? error.message : String(error));
    } finally {
        const duration = Date.now() - startTime;
        onFinish(duration);
    }
};


// This is no longer needed as chat history is managed by the client and sent with each request
export const deleteChatSession = (conversationId: string) => {
    // This function is now a no-op.
};