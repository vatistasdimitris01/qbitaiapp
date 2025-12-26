
import { Message, MessageType, LocationInfo, FileAttachment } from '../types';

export interface StreamUpdate {
    type: 'chunk' | 'usage' | 'end' | 'error' | 'searching' | 'sources' | 'tool_call' | 'search_result_count' | 'tool_call_detected';
    payload?: any;
}

export const streamMessageToAI = async (
    conversationHistory: Message[],
    message: string,
    attachments: File[],
    location: LocationInfo | null,
    language: string | undefined,
    signal: AbortSignal,
    onUpdate: (update: StreamUpdate) => void,
    onFinish: (duration: number) => void,
    onError: (error: string) => void
): Promise<void> => {
    const startTime = Date.now();
    let hasFinished = false;

    const safeOnFinish = () => {
        if (!hasFinished) {
            hasFinished = true;
            onFinish(Date.now() - startTime);
        }
    };

    const historyForApi = conversationHistory.map(msg => ({
        type: msg.type,
        content: msg.content,
        toolCalls: msg.toolCalls,
        files: msg.files?.map(f => ({
            mimeType: f.type,
            data: f.dataUrl.startsWith('data:') ? f.dataUrl.split(',')[1] : null,
        })).filter(f => f.data),
    }));

    try {
        const payload = { history: historyForApi, message, location, language };
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

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine) continue;
                try {
                    const update: StreamUpdate = JSON.parse(trimmedLine);
                    if (update.type === 'error') { throw new Error(update.payload); } 
                    else if (update.type === 'end') { onUpdate(update); safeOnFinish(); return; }
                    onUpdate(update);
                } catch (e) {
                    if (!(e instanceof SyntaxError)) { throw e; }
                }
            }
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') { console.log("[GeminiService] Request aborted."); } 
        else { const errorMsg = error instanceof Error ? error.message : String(error); onError(errorMsg); }
    } finally {
        safeOnFinish();
    }
};
