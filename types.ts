
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
  dataUrl: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: any;
}

export type MessageContent = string | CodeBlockContent | AgentPlanContent;

export interface Message {
  id: string;
  type: MessageType;
  content: MessageContent;
  files?: FileAttachment[];
  toolCalls?: ToolCall[];
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
  groundingChunks?: GroundingChunk[];
  searchResultCount?: number;
  generationDuration?: number;
}

export interface LocationInfo {
  city: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export interface Persona {
  id: string;
  name: string;
  instruction: string;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  personaId?: string;
  createdAt: string;
  greeting?: string;
}

export type AIStatus = 'idle' | 'thinking' | 'searching' | 'generating' | 'complete' | 'error';

export type ExecutionResult = {
  output: string | null;
  error: string;
  type: 'string' | 'image-base64' | 'plotly-json' | 'error';
  downloadableFile?: { filename: string; mimetype: string; data: string };
};
