export type Author = 'user' | 'ai';

export interface GroundingChunk {
  web: {
    uri: string;
    title: string;
  };
}

export interface Attachment {
  name: string;
  mimeType: string;
  data: string; // base64 encoded string
  preview: string; // data URL for preview
}

export interface Message {
  id: string;
  author: Author;
  text: string;
  groundingChunks?: GroundingChunk[];
  attachments?: Attachment[];
  downloadableFiles?: {
    name: string;
    url: string;
  }[];
  thinkingText?: string;
  duration?: number;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export interface Persona {
  id: string;
  name: string;
  instruction: string;
}

export interface LocationInfo {
    city: string;
    country: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  personaId?: string;
  createdAt: string;
}