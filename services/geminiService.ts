import { Attachment, LocationInfo, Message } from "../types";

export interface AIResponse {
    text: string;
    groundingChunks?: any[];
    downloadableFiles?: { name: string; content: string }[]; // content instead of url
    thinkingText?: string;
    duration?: number;
    usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
        totalTokenCount: number;
    };
}

// Helper function for delayed execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// This function now sends the request to our secure serverless function
export const sendMessageToAI = async (
    conversationHistory: Message[],
    message: string,
    attachments?: Omit<Attachment, 'preview' | 'name'>[],
    personaInstruction?: string,
    location?: LocationInfo | null,
    language?: string
): Promise<AIResponse> => {
    const MAX_RETRIES = 3;
    const INITIAL_BACKOFF_MS = 1000;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await fetch('/api/sendMessage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    history: conversationHistory,
                    message,
                    attachments,
                    personaInstruction,
                    location,
                    language
                })
            });

            // If the model is overloaded (503), wait and retry, unless it's the last attempt.
            if (response.status === 503 && attempt < MAX_RETRIES - 1) {
                const backoffTime = INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000;
                console.log(`Model overloaded. Retrying in ${backoffTime.toFixed(0)}ms... (Attempt ${attempt + 1}/${MAX_RETRIES})`);
                await delay(backoffTime);
                continue; // Go to the next attempt
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Could not parse error response' }));
                const errorMessage = errorData.error?.message || errorData.error || `API request failed with status ${response.status}`;
                throw new Error(errorMessage);
            }

            const data: AIResponse = await response.json();
            return data; // Success

        } catch (error) {
            console.error(`Error sending message to AI (Attempt ${attempt + 1}/${MAX_RETRIES}):`, error);
            if (attempt === MAX_RETRIES - 1) {
                // This was the last attempt, return a user-facing error.
                const finalErrorMessage = error instanceof Error ? error.message : String(error);
                return { text: `Sorry, the request failed after multiple retries. Please try again later. (Error: ${finalErrorMessage})` };
            }
            // Add delay before the next retry for any type of error
            const backoffTime = INITIAL_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 1000;
            await delay(backoffTime);
        }
    }

    // Fallback error, should only be reached in an unexpected scenario.
    return { text: "An unexpected error occurred after multiple retries. Please try again." };
};


// This is no longer needed as chat history is managed by the client and sent with each request
export const deleteChatSession = (conversationId: string) => {
    // This function is now a no-op.
};