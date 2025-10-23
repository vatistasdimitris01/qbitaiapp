

export enum MessageType {
  USER = 'USER',
  AI_RESPONSE = 'AI_RESPONSE',
  AI_SOURCES = 'AI_SOURCES',
  SYSTEM = 'SYSTEM',
  ERROR = 'ERROR',
  AGENT_ACTION = 'AGENT_ACTION',
  AGENT_PLAN = 'AGENT_PLAN',
}

export interface WebGroundingChunk {
    web: {
        uri: string;
        title: string;
    };
}

export interface MapsPlaceReviewSnippet {
    uri: string;
    quote: string;
    author: string;
}

export interface MapsPlaceAnswerSource {
    reviewSnippets: MapsPlaceReviewSnippet[];
}

export interface MapsGroundingChunk {
    maps: {
        uri: string;
        title: string;
        latitude?: number;
        longitude?: number;
        placeAnswerSources: MapsPlaceAnswerSource[];
    }
}

export type GroundingChunk = WebGroundingChunk | MapsGroundingChunk;


export interface CodeBlockContent {
    lang: string;
    code: string;
}

export interface AgentPlanContent {
    goal: string;
    steps: string[];
    currentStep: number;
}

export interface FileAttachment {
    name: string;
    type: string;
    size: number;
    dataUrl: string; // Base64 or object URL for preview
}

export type Tool = 'web-search' | 'code-execution' | 'agent-mode' | null;

export type MessageContent = string | CodeBlockContent | AgentPlanContent;

export interface Message {
  id: string;
  type: MessageType;
  content: MessageContent;
  files?: FileAttachment[];
  tool?: Tool;
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  groundingChunks?: GroundingChunk[];
}

export type Theme = 'theme-slate' | 'theme-light' | 'theme-matrix';

export interface Tab {
  id: number;
  url: string | null;
  title?: string;
}

// FIX: Add missing 'CitationSource' interface.
export interface CitationSource {
  url: string;
  title: string;
  description?: string;
  quote?: string;
}

// Re-added for application structure
export interface Persona {
  id: string;
  name: string;
  instruction: string;
}

export interface LocationInfo {
    city: string;
    country: string;
    latitude?: number;
    longitude?: number;
}

export interface Conversation {
  id:string;
  title: string;
  messages: Message[];
  personaId?: string;
  createdAt: string;
}

export type AIStatus = 'idle' | 'thinking' | 'searching' | 'generating' | 'complete' | 'error';