import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { marked } from 'marked';

// ==========================================
// 1. TYPES
// ==========================================

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

// Fix: Added missing ImageInfo interface to resolve compilation errors
export interface ImageInfo {
  url: string;
  alt: string;
  source?: string;
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
  dataUrl: string;
}

export type Tool = 'web-search' | 'code-execution' | 'agent-mode' | null;

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
  tool?: Tool;
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
  id: string;
  title: string;
  messages: Message[];
  personaId?: string;
  createdAt: string;
  greeting?: string;
}

export type AIStatus = 'idle' | 'thinking' | 'searching' | 'generating' | 'complete' | 'error';

// ==========================================
// 2. TRANSLATIONS
// ==========================================

const translations = {
  en: {
    loader: { text: 'KIPP', subtext: 'Preparing environment...', },
    welcome: {
      skip: 'Skip Tutorial', next: 'Next', back: 'Back', getStarted: 'Begin Your Journey',
      steps: {
        intro: { title: 'The Soul of KIPP', story: 'KIPP (Kosmic Intelligence Pattern Perceptron) isn’t just another AI interface. It’s a space where aesthetics and intelligence converge.', sub: 'Intelligence, refined.', },
        workspace: { title: 'Your Digital Workspace', description: 'The interface is designed to disappear so your ideas can take center stage.', sidebar: 'History & Personalization', sidebar_desc: 'Access your past thoughts and customize the AI persona on the left.', input: 'Multimodal Input', input_desc: 'Drop files, record voice, or paste code. KIPP handles it all natively.', },
        features: { title: 'Pure Power, Native Execution', description: 'KIPP goes beyond text. It visualizes data and runs code directly in your browser.', examples: { stock: 'Analyze the markets', python: 'Execute complex math', web: 'Search the global web', } },
        location: { title: 'Grounded in Your World', description: 'To provide the most relevant answers KIPP can use your location.', allow: 'Allow Location Access', denied: 'Location access denied. You can change this in your browser settings.', }
      }
    },
    sidebar: { header: 'KIPP', newChat: 'New Chat', search: 'Search...', recent: 'Recent History', settings: 'Settings', close: 'Close sidebar', open: 'Open sidebar', remove: 'Remove chat', confirmDelete: 'Are you sure you want to delete this chat?', forkedChatTitle: 'Fork of "{oldTitle}"', history: 'History' },
    chat: {
      placeholder: 'Start a conversation with KIPP.', scrollToBottom: 'Scroll to bottom',
      input: { placeholder: 'Ask KIPP anything...', attach: 'Attach', submit: 'Submit', stop: 'Stop generation', },
      message: { thinking: 'Chain of Thought', grounding: 'Sources:', copy: 'Copy message', regenerate: 'Regenerate response', fork: 'Fork conversation', },
    },
    settings: {
      header: 'Settings', appearance: 'Appearance', behavior: 'Behavior', data: 'Data Controls', langTitle: 'Language / Γλώσσα',
      switches: { autoScroll: 'Enable Auto Scroll', haptics: 'Haptic Feedback', wrapCode: 'Wrap Long Lines For Code' },
      buttons: { delete: 'Delete All Conversations', clear: 'Clear App Cache', deleteAction: 'Delete', clearAction: 'Clear' },
      themes: { light: 'Light', dark: 'Dark', system: 'System', },
    },
    dragDrop: { title: 'Add anything', subtitle: 'Drop any file here to add it to the conversation', },
    selectionPopup: { ask: 'Ask KIPP' }
  }
};

// ==========================================
// 3. SERVICES (GEMINI & PYTHON)
// ==========================================

export interface StreamUpdate {
  type: 'chunk' | 'usage' | 'end' | 'error' | 'searching' | 'sources' | 'tool_call' | 'search_result_count' | 'tool_call_detected';
  payload?: any;
}

const streamMessageToAI = async (
  conversationHistory: Message[],
  message: string,
  attachments: File[],
  personaInstruction: string | undefined,
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

  const getTextFromMessageContent = (content: MessageContent): string => {
    if (typeof content === 'string') return content;
    return '';
  };

  const historyForApi = conversationHistory.map(msg => ({
    type: msg.type,
    content: getTextFromMessageContent(msg.content),
    toolCalls: msg.toolCalls,
    files: msg.files?.map(f => ({
      mimeType: f.type,
      data: f.dataUrl.startsWith('data:') ? f.dataUrl.split(',')[1] : null,
    })).filter(f => f.data),
  }));

  try {
    const payload = { history: historyForApi, message, personaInstruction, location, language };
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

    if (!response.ok) throw new Error(`API failed: ${response.status}`);
    if (!response.body) throw new Error("No body");

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
    if (error instanceof Error && error.name === 'AbortError') return;
    onError(error instanceof Error ? error.message : String(error));
  } finally {
    safeOnFinish();
  }
};

// ==========================================
// 4. UTILS & HOOKS
// ==========================================

const useTranslations = (lang: 'en' = 'en') => {
  const t = useCallback((key: string, params?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: any = (translations as any)[lang];
    for (const k of keys) {
      result = result?.[k];
    }
    let template = typeof result === 'string' ? result : key;
    if (params) {
      Object.keys(params).forEach(p => template = template.replace(`{${p}}`, params[p]));
    }
    return template;
  }, [lang]);
  return { t, lang };
};

// ==========================================
// 5. ICONS
// ==========================================

interface IconProps { className?: string; }
const ChevronsRightIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={className}><polyline points="13 17 18 12 13 7" /><polyline points="7 17 12 12 7 7" /></svg>);
const SearchIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>);
const BrainIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" /><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" /></svg>);
const ChevronDownIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="m6 9 6 6 6-6"></path></svg>);
const ChevronLeftIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="m15 18-6-6 6-6" /></svg>);
const ChevronRightIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="m9 18 6-6-6-6" /></svg>);
const XIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M18 6 6 18M6 6l12 12"></path></svg>);
const SquarePenIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path></svg>);
const Trash2Icon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"></path></svg>);
const SettingsIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>);
const MapPinIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>);
const CopyIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>);
const CheckIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><polyline points="20 6 9 17 4 12"></polyline></svg>);
const RefreshCwIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"></path></svg>);
const GitForkIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9M12 12v3" /></svg>);
const ArrowUpIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>);
const PaperclipIcon = ({ className }: IconProps) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>);

// ==========================================
// 6. COMPONENTS
// ==========================================

const GeneratingLoader = () => (<div className="flex items-center justify-center h-full"><div className="w-2 h-2 bg-foreground rounded-full animate-bounce [animation-delay:-0.3s]"></div><div className="w-2 h-2 bg-foreground rounded-full animate-bounce [animation-delay:-0.15s] mx-1"></div><div className="w-2 h-2 bg-foreground rounded-full animate-bounce"></div></div>);

const SkeletonLoader: React.FC<{ className?: string }> = ({ className }) => (<div className={`bg-gray-200 dark:bg-zinc-800 animate-pulse rounded-md ${className}`} />);

const GalleryImage: React.FC<{ image: ImageInfo; className?: string; overlayText?: string | null; onClick: () => void; }> = ({ image, className, overlayText, onClick }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  return (
    <div className={`relative rounded-lg overflow-hidden cursor-pointer group bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 ${className}`} onClick={onClick}>
      {status === 'loading' && <SkeletonLoader className="absolute inset-0" />}
      <img src={image.url} alt={image.alt} className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setStatus('loaded')} onError={() => setStatus('error')} />
      {status === 'loaded' && overlayText && (<div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xl font-medium backdrop-blur-[2px]">{overlayText}</div>)}
    </div>
  );
};

const ImageGallery: React.FC<{ images: ImageInfo[]; onImageClick: (index: number) => void; }> = ({ images, onImageClick }) => {
  if (!images || images.length === 0) return null;
  const len = images.length;
  if (len === 1) return (<div className="not-prose my-2"><GalleryImage image={images[0]} className="aspect-video max-w-sm" onClick={() => onImageClick(0)} /></div>);
  if (len === 2) return (<div className="not-prose my-2 grid grid-cols-2 gap-1.5 max-w-lg"><GalleryImage image={images[0]} className="aspect-square" onClick={() => onImageClick(0)} /><GalleryImage image={images[1]} className="aspect-square" onClick={() => onImageClick(1)} /></div>);
  const visibleImages = images.slice(0, 4);
  const hiddenCount = images.length - 4;
  return (<div className="not-prose my-2 grid grid-cols-2 gap-1.5 max-w-md">{visibleImages.map((image, index) => (<GalleryImage key={index} image={image} overlayText={index === 3 && hiddenCount > 0 ? `+${hiddenCount}` : null} onClick={() => onImageClick(index)} className="aspect-[4/3]" />))}</div>);
};

const GroundingSources: React.FC<{ chunks: GroundingChunk[]; t: (key: string) => string; }> = ({ chunks, t }) => {
  if (!chunks || chunks.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-4 border-t border-border pt-4">
      <div className="w-full text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">{t('chat.message.grounding')}</div>
      {chunks.map((chunk, i) => {
        const isWeb = 'web' in chunk;
        const uri = isWeb ? chunk.web.uri : (chunk as any).maps.uri;
        const title = isWeb ? chunk.web.title : (chunk as any).maps.title;
        return (
          <a key={i} href={uri} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-l2 border border-border text-xs font-medium hover:bg-surface-l3 transition-colors max-w-xs">
            {isWeb ? <SearchIcon className="size-3 shrink-0" /> : <MapPinIcon className="size-3 shrink-0" />}
            <span className="truncate">{title}</span>
          </a>
        );
      })}
    </div>
  );
};

const ChatMessage: React.FC<{ message: Message; onRegenerate: (id: string) => void; onFork: (id: string) => void; isLoading: boolean; aiStatus: AIStatus; isLast: boolean; t: (key: string) => string; }> = ({ message, onRegenerate, onFork, isLoading, aiStatus, isLast, t }) => {
  const isUser = message.type === MessageType.USER;
  const [isThinkingOpen, setIsThinkingOpen] = useState(isLast);
  const messageText = typeof message.content === 'string' ? message.content : '';

  const { thinking, response } = useMemo(() => {
    const thinkingMatch = messageText.match(/<thinking>([\s\S]*?)(?:<\/thinking>|$)/);
    let r = messageText;
    if (thinkingMatch) {
      r = messageText.split('</thinking>')[1]?.trim() || '';
    }
    return { thinking: thinkingMatch ? thinkingMatch[1] : null, response: r };
  }, [messageText]);

  const showSearchUI = (aiStatus === 'searching' && isLast && isLoading) || (message.groundingChunks && message.groundingChunks.length > 0 && isLast && isLoading);

  return (
    <div className={`flex flex-col w-full mb-8 animate-fade-in-up ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`max-w-[90%] md:max-w-[80%] rounded-3xl p-4 md:p-6 ${isUser ? 'bg-surface-l1 border border-border rounded-br-lg shadow-sm' : 'bg-transparent border-none'}`}>
        {!isUser && thinking && (
          <div className="mb-4">
            <button onClick={() => setIsThinkingOpen(!isThinkingOpen)} className="flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm font-medium transition-colors">
              <BrainIcon className={`size-4 ${isLast && aiStatus === 'thinking' ? 'animate-pulse' : ''}`} />
              <span>{t('chat.message.thinking')}</span>
              <ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} />
            </button>
            {isThinkingOpen && <div className="mt-2 pl-4 border-l-2 border-border text-sm italic text-muted-foreground whitespace-pre-wrap">{thinking}</div>}
          </div>
        )}

        {showSearchUI && (
          <div className="flex items-center gap-2 text-sm text-accent-blue font-medium mb-4 animate-pulse">
            <SearchIcon className="size-4" />
            <span>Searching the web...</span>
          </div>
        )}

        <div className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: marked.parse(response || (isLoading && isLast ? '...' : '')) }} />
        
        {message.groundingChunks && message.groundingChunks.length > 0 && <GroundingSources chunks={message.groundingChunks} t={t} />}
      </div>
      {!isLoading && !isUser && (
        <div className="flex items-center gap-1 mt-2 ml-4">
          <button onClick={() => onRegenerate(message.id)} className="p-2 hover:bg-surface-l2 rounded-full text-muted-foreground transition-colors" title={t('chat.message.regenerate')}><RefreshCwIcon className="size-4" /></button>
          <button onClick={() => onFork(message.id)} className="p-2 hover:bg-surface-l2 rounded-full text-muted-foreground transition-colors" title={t('chat.message.fork')}><GitForkIcon className="size-4" /></button>
        </div>
      )}
    </div>
  );
};

const ChatInput = forwardRef<{ focus: () => void; handleFiles: (f: FileList) => void }, any>(({ text, onTextChange, onSendMessage, isLoading, t }, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus(), handleFiles: (f: FileList) => {} }));

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  const handleSend = () => {
    if (text.trim() && !isLoading) {
      onSendMessage(text, []);
      onTextChange('');
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 border border-border rounded-[1.75rem] flex items-end gap-2 p-2 shadow-lg w-full max-w-3xl mx-auto">
      <button onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors mb-0.5"><PaperclipIcon className="size-5 text-muted-foreground" /></button>
      <textarea ref={textareaRef} value={text} onChange={(e) => onTextChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder={t('chat.input.placeholder')} className="flex-1 bg-transparent outline-none py-2.5 px-2 resize-none max-h-[200px] text-[16px]" rows={1} />
      <button onClick={handleSend} disabled={!text.trim() || isLoading} className={`size-8 rounded-full flex items-center justify-center transition-all flex-shrink-0 mb-1 ${text.trim() && !isLoading ? 'bg-foreground text-background scale-110' : 'bg-transparent text-muted-foreground opacity-30'}`}>
        <ArrowUpIcon className="size-4" />
      </button>
      <input type="file" ref={fileInputRef} className="hidden" multiple />
    </div>
  );
});

// ==========================================
// 7. MAIN APP
// ==========================================

const OneFileApp = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>('idle');
  const [inputText, setInputText] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<any>(null);
  const { t } = useTranslations();

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  const handleSendMessage = async (text: string, files: File[]) => {
    const convoId = activeConversationId || Date.now().toString();
    const aiMsgId = (Date.now() + 1).toString();
    const userMsg: Message = { id: Date.now().toString(), type: MessageType.USER, content: text };

    setConversations(prev => {
      const copy = [...prev];
      let convo = copy.find(c => c.id === convoId);
      if (!convo) {
        convo = { id: convoId, title: text.slice(0, 30), messages: [], createdAt: new Date().toISOString() };
        copy.unshift(convo);
      }
      convo.messages.push(userMsg, { id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' });
      return copy;
    });

    if (!activeConversationId) setActiveConversationId(convoId);
    setIsLoading(true);
    setAiStatus('thinking');
    const abort = new AbortController();
    abortControllerRef.current = abort;

    const history = activeConversation?.messages || [];
    await streamMessageToAI(history, text, files, undefined, null, 'en', abort.signal, (update) => {
      setConversations(prev => prev.map(c => {
        if (c.id === convoId) {
          const msgs = [...c.messages];
          const idx = msgs.findIndex(m => m.id === aiMsgId);
          if (idx !== -1) {
            if (update.type === 'chunk') { setAiStatus('generating'); msgs[idx].content += update.payload; }
            if (update.type === 'searching') setAiStatus('searching');
            if (update.type === 'sources') msgs[idx].groundingChunks = update.payload;
            if (update.type === 'search_result_count') msgs[idx].searchResultCount = update.payload;
          }
          return { ...c, messages: msgs };
        }
        return c;
      }));
    }, () => { setIsLoading(false); setAiStatus('idle'); }, (err) => { setIsLoading(false); setAiStatus('error'); });
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden relative">
      {/* SIDEBAR */}
      <aside className={`fixed inset-y-0 left-0 z-[100] w-full lg:w-[320px] bg-sidebar border-r border-border transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-24 px-6 flex items-center justify-between">
          <button onClick={() => { setActiveConversationId(null); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} className="size-10 bg-surface-l2 rounded-xl flex items-center justify-center hover:bg-surface-l3 transition-colors"><BrainIcon /></button>
          <button onClick={() => setIsSidebarOpen(false)} className="size-12 rounded-full bg-surface-l1 shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all"><XIcon className="size-6" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-50 mb-4 px-2">History</div>
          {conversations.map(c => (
            <button key={c.id} onClick={() => { setActiveConversationId(c.id); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} className={`w-full text-left px-4 py-3 rounded-2xl transition-all ${activeConversationId === c.id ? 'bg-surface-l1 font-bold' : 'hover:bg-surface-l2 text-muted-foreground'}`}>{c.title}</button>
          ))}
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className={`flex-1 flex flex-col transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${isSidebarOpen ? 'lg:translate-x-[320px] lg:w-[calc(100%-320px)]' : 'w-full'}`}>
        {!isSidebarOpen && (
          <button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-50 size-12 bg-surface-l1 shadow-xl rounded-full flex flex-col items-center justify-center gap-1 hover:scale-105 transition-transform"><div className="w-5 h-0.5 bg-foreground"></div><div className="w-5 h-0.5 bg-foreground"></div></button>
        )}
        
        <div className="flex-1 overflow-y-auto p-4 md:p-12 scrollbar-none">
          <div className="max-w-3xl mx-auto flex flex-col min-h-full justify-end">
            {(!activeConversation || activeConversation.messages.length === 0) ? (
              <div className="flex-1 flex flex-col items-center justify-center opacity-30"><BrainIcon className="size-24 mb-4" /><p className="text-xl font-medium tracking-tight">KIPP PRO PLAN</p></div>
            ) : (
              activeConversation.messages.map((m, i) => (
                <ChatMessage key={m.id} message={m} onRegenerate={() => {}} onFork={() => {}} isLoading={isLoading} aiStatus={aiStatus} isLast={i === activeConversation.messages.length - 1} t={t} />
              ))
            )}
          </div>
        </div>

        <div className="p-4 bg-gradient-to-t from-background via-background to-transparent z-10">
          <ChatInput ref={chatInputRef} text={inputText} onTextChange={setInputText} onSendMessage={handleSendMessage} isLoading={isLoading} t={t} />
        </div>
      </main>
    </div>
  );
};

export default OneFileApp;