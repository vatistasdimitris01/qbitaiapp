import { Attachment, LocationInfo, Message } from "../types";

export interface AIResponse {
    text: string;
    groundingChunks?: any[];
    downloadableFile?: { name: string; content: string }; // content instead of url
    thinkingText?: string;
}

// This function now sends the request to our secure serverless function
export const sendMessageToAI = async (
    conversationHistory: Message[],
    message: string,
    attachments?: Omit<Attachment, 'preview' | 'name'>[],
    personaInstruction?: string,
    location?: LocationInfo | null
): Promise<AIResponse> => {
    try {
        const response = await fetch('/api/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                history: conversationHistory,
                message,
                attachments,
                personaInstruction,
                location
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'API request failed');
        }

        const data: AIResponse = await response.json();
        return data;

    } catch (error) {
        console.error("Error sending message to AI:", error);
        return { text: "Sorry, I encountered an error. Please try again." };
    }
};

// This is no longer needed as chat history is managed by the client and sent with each request
export const deleteChatSession = (conversationId: string) => {
    // This function is now a no-op.
};