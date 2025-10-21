


export enum MessageType {
  USER = 'USER',
  AI_RESPONSE = 'AI_RESPONSE',
  SYSTEM = 'SYSTEM',
  ERROR = 'ERROR',
  AGENT_ACTION = 'AGENT_ACTION',
  AGENT_PLAN = 'AGENT_PLAN',
}

export interface CitationSource {
  title: string;
  url: string;
  description?: string;
  quote?: string;
}

export interface Citation {
  number: string;
  sources: CitationSource[];
}

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
    // For small files (< 4MB) for immediate preview
    dataUrl?: string;
    // For large files, tracks upload state
    uploadStatus?: 'uploading' | 'completed' | 'error';
    progress?: number; // 0-100
    // The reference to the file in cloud storage, e.g., 'gs://bucket-name/file-id'
    fileIdentifier?: string;
    // Client-side only: To hold the File object during upload
    file?: File;
    // Client-side only: To allow aborting uploads
    abortController?: AbortController;
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
  citations?: Citation[];
}

export type Theme = 'theme-slate' | 'theme-light' | 'theme-matrix';

export interface Tab {
  id: number;
  url: string | null;
  title?: string;
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
}

export interface Conversation {
  id:string;
  title: string;
  messages: Message[];
  personaId?: string;
  createdAt: string;
}

export type AIStatus = 'idle' | 'thinking' | 'searching' | 'generating' | 'complete' | 'error';