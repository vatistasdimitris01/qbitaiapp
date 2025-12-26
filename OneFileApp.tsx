
import React, { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, createContext, useContext } from 'react';
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

export type Theme = 'theme-slate' | 'theme-light' | 'theme-matrix';

export interface Tab {
  id: number;
  url: string | null;
  title?: string;
}

export interface CitationSource {
  url: string;
  title: string;
  description?: string;
  quote?: string;
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
  id:string;
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
    updateBanner: { text: 'A new version is available!', button: 'Refresh', },
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
      placeholder: 'Start a conversation with KIPP.', scrollToBottom: 'Scroll to bottom', replyContext: 'In reference to the following text:\n"""\n{context}\n"""',
      input: { placeholder: 'Ask KIPP anything...', disclaimer: 'KIPP can make mistakes. Check important info.', attach: 'Attach', submit: 'Submit', stop: 'Stop generation', },
      message: { thinking: 'Chain of Thought', grounding: 'Used Google Search and found the following sources:', copy: 'Copy message', regenerate: 'Regenerate response', viewCode: 'View Code', fork: 'Fork conversation', },
    },
    settings: {
      header: 'Settings', appearance: 'Appearance', behavior: 'Behavior', data: 'Data Controls', langTitle: 'Language / Γλώσσα',
      switches: { autoScroll: 'Enable Auto Scroll', docMode: 'Enable Document Mode', haptics: 'Haptic Feedback', wrapCode: 'Wrap Long Lines For Code', previews: 'Show Chat Previews', starry: 'Enable Starry Background' },
      buttons: { delete: 'Delete All Conversations', clear: 'Clear App Cache', deleteAction: 'Delete', clearAction: 'Clear' },
      themes: { light: 'Light', dark: 'Dark', system: 'System', },
    },
    dragDrop: { title: 'Add anything', subtitle: 'Drop any file here to add it to the conversation', },
    selectionPopup: { ask: 'Ask KIPP' }
  },
  el: {
    loader: { text: 'KIPP', subtext: 'Προετοιμασία περιβάλλοντος...', },
    updateBanner: { text: 'Μια νέα έκδοση είναι διαθέσιμη!', button: 'Ανανέωση', },
    welcome: {
      skip: 'Παράλειψη Οδηγού', next: 'Επόμενο', back: 'Πίσω', getStarted: 'Ξεκινήστε το Ταξίδι σας',
      steps: {
        intro: { title: 'Η Ψυχή του KIPP', story: 'Το KIPP δεν είναι απλώς μια διεπαφή AI. Είναι ένας χώρος όπου η αισθητική και η νοημοσύνη συγκλίνουν.', sub: 'Νοημοσύνη, εκλεπτυσμένη.', },
        workspace: { title: 'Ο Ψηφιακός σας Χώρος', description: 'Η διεπαφή έχει σχεδιαστεί για να εξαφανίζεται, ώστε οι ιδέες σας να βρίσκονται στο επίκεντρο.', sidebar: 'Ιστορικό & Εξατομίκευση', sidebar_desc: 'Πρόσβαση στις προηγούμενες σκέψεις σας και προσαρμογή του AI στα αριστερά.', input: 'Πολυτροπική Είσοδος', input_desc: 'Σύρετε αρχεία, ηχογραφήστε φωνή ή επικολλήστε κώδικα. Το KIPP τα χειρίζεται όλα.', },
        features: { title: 'Καθαρή Ισχύς, Τοπική Εκτέλεση', description: 'Το KIPP προχωρά πέρα από το κείμενο. Οπτικοποιεί δεδομένα και εκτελεί κώδικα στον περιηγητή σας.', examples: { stock: 'Ανάλυση αγορών', python: 'Εκτέλεση μαθηματικών', web: 'Αναζήτηση στον ιστό', } },
        location: { title: 'Γειωμένο στον Κόσμο σας', description: 'Για να παρέχει τις πιο σχετικές απαντήσεις, το KIPP μπορεί να χρησιμοποιήσει την τοποθεσία σας.', allow: 'Επιτρέψτε την Πρόσβαση', denied: 'Η πρόσβαση στην τοποθεσία απορρίφθηκε. Μπορείτε να το αλλάξετε στις ρυθμίσεις του περιηγητή σας.', }
      }
    },
    sidebar: { header: 'KIPP', newChat: 'Νέα Συνομιλία', search: 'Αναζήτηση...', recent: 'Πρόσφατο Ιστορικό', settings: 'Ρυθμίσεις', close: 'Κλείσιμο πλευρικού μενού', open: 'Άνοιγμα πλευρικού μενού', remove: 'Διαγραφή συνομιλίας', confirmDelete: 'Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή τη συνομιλία;', forkedChatTitle: 'Αντίγραφο του "{oldTitle}"', history: 'Ιστορικό' },
    chat: {
      placeholder: 'Ξεκινήστε μια συζήτηση με το KIPP.', scrollToBottom: 'Μετάβαση στο τέλος', replyContext: 'Σε αναφορά στο παρακάτω κείμενο:\n"""\n{context}\n"""',
      input: { placeholder: 'Ρωτήστε το KIPP οτιδήποτε...', disclaimer: 'Το KIPP μπορεί να κάνει λάθη. Ελέγξτε σημαντικές πληροφορίες.', attach: 'Επισύναψη', submit: 'Αποστολή', stop: 'Διακοπή παραγωγής', },
      message: { thinking: 'Αλυσίδα Σκέψης', grounding: 'Χρησιμοποιήθηκε η Αναζήτηση Google και βρέθηκαν οι εξής πηγές:', copy: 'Αντιγραφή μηνύματος', regenerate: 'Επαναπαραγωγή απάντησης', viewCode: 'Προβολή Κώδικα', fork: 'Δημιουργία αντιγράφου', },
    },
    settings: {
      header: 'Ρυθμίσεις', appearance: 'Εμφάνιση', behavior: 'Συμπεριφορά', data: 'Δεδομένα', langTitle: 'Γλώσσα / Language',
      switches: { autoScroll: 'Αυτόματη Κύλιση', docMode: 'Λειτουργία Εγγράφου', haptics: 'Απτική Ανάδραση', wrapCode: 'Αναδίπλωση Κώδικα', previews: 'Προεπισκόπηση Συνομιλιών', starry: 'Έναστρο Φόντο' },
      buttons: { delete: 'Διαγραφή Όλων των Συνομιλιών', clear: 'Εκκαθάριση Cache Εφαρμογής', deleteAction: 'Διαγραφή', clearAction: 'Εκκαθάριση' },
      themes: { light: 'Φωτεινό', dark: 'Σκοτεινό', system: 'Σύστημα', },
    },
    dragDrop: { title: 'Προσθέστε οτιδήποτε', subtitle: 'Σύρετε οποιοδήποτε αρχείο εδώ για να το προσθέσετε στη συνομιλία', },
    selectionPopup: { ask: 'Ρωτήστε το KIPP' }
  },
};

// ==========================================
// 3. SERVICES (GEMINI & PYTHON)
// ==========================================

// --- GEMINI SERVICE ---
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

// --- PYTHON EXECUTOR SERVICE ---
export type PythonExecutorUpdate = {
    type: 'stdout' | 'stderr' | 'plot' | 'download' | 'success' | 'error';
    data?: any;
    plotType?: string;
    error?: string;
    filename?: string;
    mimetype?: string;
};

type UpdateCallback = (update: PythonExecutorUpdate) => void;

let pythonWorker: Worker | null = null;
let pythonReadyPromise: Promise<void> | null = null;
let pythonExecutionCallback: UpdateCallback | null = null;
let isPythonExecuting = false;

const initializePythonWorker = () => {
    console.groupCollapsed("%c kipp environments ", "color: gray; font-style: italic; font-weight: bold; border: 1px solid gray; border-radius: 4px;");
    console.log("Spinning up execution worker...");
    
    pythonWorker = new Worker('/python.worker.js');
    pythonReadyPromise = new Promise((resolve, reject) => {
        const readyListener = (event: MessageEvent) => {
            if (event.data.type === 'ready') {
                pythonWorker?.removeEventListener('message', readyListener);
                pythonWorker?.addEventListener('message', (event: MessageEvent) => {
                    if (pythonExecutionCallback) {
                        pythonExecutionCallback(event.data as PythonExecutorUpdate);
                    }
                });
                console.log("KIPP Python Environment: READY");
                console.groupEnd();
                resolve();
            }
        };
        pythonWorker.addEventListener('message', readyListener);
        pythonWorker.onerror = (e) => {
            console.groupCollapsed("%c KIPP Error ", "background: #ef4444; color: white; font-weight: bold; border-radius: 4px;");
            console.error("Pyodide Environment Failed to initialize:", e);
            console.groupEnd();
            console.groupEnd();
            reject(e);
        };
    });
};

if (typeof window !== 'undefined' && !pythonWorker) { initializePythonWorker(); }

const runPythonCode = async (code: string, callback: UpdateCallback): Promise<void> => {
    if (!pythonWorker || !pythonReadyPromise) { initializePythonWorker(); }
    try { await pythonReadyPromise; } catch (e) { callback({ type: 'error', error: 'Python environment failed to load.' }); return; }
    if (isPythonExecuting) { callback({ type: 'error', error: 'Another execution is already in progress.' }); return; }
    isPythonExecuting = true;
    pythonExecutionCallback = (update) => {
        callback(update);
        if (update.type === 'success' || update.type === 'error') {
            isPythonExecuting = false;
            pythonExecutionCallback = null;
        }
    };
    pythonWorker!.postMessage({ code });
};

const stopPythonExecution = () => {
    if (!pythonWorker) return;
    pythonWorker.terminate();
    if (pythonExecutionCallback) { pythonExecutionCallback({ type: 'error', error: 'Execution stopped by user.' }); }
    isPythonExecuting = false;
    pythonExecutionCallback = null;
    pythonWorker = null;
    pythonReadyPromise = null;
    initializePythonWorker();
};

// ==========================================
// 4. HOOKS
// ==========================================

const useTranslations = (lang: keyof typeof translations = 'en') => {
  const t = useCallback((key: string, params?: Record<string, string>): string => {
    const keys = key.split('.');
    let result: any = translations[lang] || translations.en;
    for (const k of keys) {
      result = result?.[k];
      if (result === undefined) {
        let fallbackResult: any = translations.en;
        for (const fk of keys) { fallbackResult = fallbackResult?.[fk]; }
        result = fallbackResult || key;
        break;
      }
    }
    let template = typeof result === 'string' ? result : key;
    if (params) {
      Object.keys(params).forEach(paramKey => {
        const regex = new RegExp(`\\{${paramKey}\\}`, 'g');
        template = template.replace(regex, params[paramKey]);
      });
    }
    return template;
  }, [lang]);
  return { t, lang };
};

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => { ref.current = value; });
  return ref.current;
}

// ==========================================
// 5. ICONS
// ==========================================

interface IconProps { className?: string; }
const ChevronsRightIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="13 17 18 12 13 7" /><polyline points="7 17 12 12 7 7" /></svg>);
const RefreshCwIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M3 21v-5h5"></path></svg>);
const MessageRefreshIcon: React.FC<IconProps> = ({ className }) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} strokeWidth="2"><path d="M4 20V15H4.31241 15H9M4.31241 15C5.51251 18.073 8.50203 20.25 12 20.25C15.8582 20.25 19.0978 17.6016 20 14.0236M20 4V9H19.6876M19.6876 9H15M19.6876 9C18.4875 5.92698 15.498 3.75 12 3.75C8.14184 3.75 4.90224 6.3984 4 9.9764" stroke="currentColor"></path></svg>);
const MessageCopyIcon: React.FC<IconProps> = ({ className }) => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} strokeWidth="2"><rect x="3" y="8" width="13" height="13" rx="4" stroke="currentColor"></rect><path fillRule="evenodd" clipRule="evenodd" d="M13 2.00004L12.8842 2.00002C12.0666 1.99982 11.5094 1.99968 11.0246 2.09611C9.92585 2.31466 8.95982 2.88816 8.25008 3.69274C7.90896 4.07944 7.62676 4.51983 7.41722 5.00004H9.76392C10.189 4.52493 10.7628 4.18736 11.4147 4.05768C11.6802 4.00488 12.0228 4.00004 13 4.00004H14.6C15.7366 4.00004 16.5289 4.00081 17.1458 4.05121C17.7509 4.10066 18.0986 4.19283 18.362 4.32702C18.9265 4.61464 19.3854 5.07358 19.673 5.63807C19.8072 5.90142 19.8994 6.24911 19.9488 6.85428C19.9992 7.47112 20 8.26343 20 9.40004V11C20 11.9773 19.9952 12.3199 19.9424 12.5853C19.8127 13.2373 19.4748 13.8114 19 14.2361V16.5829C20.4795 15.9374 21.5804 14.602 21.9039 12.9755C22.0004 12.4907 22.0002 11.9334 22 11.1158L22 11V9.40004V9.35725C22 8.27346 22 7.3993 21.9422 6.69141C21.8826 5.96256 21.7568 5.32238 21.455 4.73008C20.9757 3.78927 20.2108 3.02437 19.27 2.545C18.6777 2.24322 18.0375 2.1174 17.3086 2.05785C16.6007 2.00002 15.7266 2.00003 14.6428 2.00004L14.6 2.00004H13Z" fill="currentColor"></path></svg>);
const CornerDownRightIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path></svg>);
const PaperclipIcon: React.FC<IconProps> = ({ className }) => (<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>);
const MicIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></svg>);
const ChevronDownIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m6 9 6 6 6-6"></path></svg>);
const ChevronLeftIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m15 18-6-6 6-6" /></svg>);
const ChevronRightIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6" /></svg>);
const ArrowUpIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m5 12 7-7 7 7"></path><path d="M12 19V5"></path></svg>);
const BrainIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"></path><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"></path><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"></path><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"></path><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"></path><path d="M3.477 10.896a4 4 0 0 1 .585-.396"></path><path d="M19.938 10.5a4 4 0 0 1 .585.396"></path><path d="M6 18a4 4 0 0 1-1.967-.516"></path><path d="M19.967 17.484A4 4 0 0 1 18 18"></path></svg>);
const SearchIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>);
const CopyIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>);
const XIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>);
const SquarePenIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path></svg>);
const Trash2Icon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>);
const SettingsIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>);
const FileTextIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>);
const TerminalIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" /></svg>);
const SunIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg>);
const MapPinIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>);
const CheckIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M20 6 9 17l-5-5" /></svg>);
const GitForkIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="6" r="3" /><path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" /><path d="M12 12v3" /></svg>);
const ReplyIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg>);
const DownloadIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>);
const PlayIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="5 3 19 12 5 21 5 3"/></svg>);
const PauseIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>);
const ChevronsUpDownIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="7 15 12 20 17 15"/><polyline points="7 9 12 4 17 9"/></svg>);
const ChevronsDownUpIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="7 20 12 15 17 20"/><polyline points="7 4 12 9 17 4"/></svg>);
const EyeIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>);
const Wand2Icon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v1"/><path d="M11 2v2"/><path d="M15 5v.5"/><path d="M20 11h-1"/><path d="M11 20v-1"/><path d="M5 14v1"/><path d="M2 11h1"/><path d="M11 20v1"/></svg>);
const ArrowRightIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>);
const CodeXmlIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>);
const ImageIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>);
const Maximize2Icon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>);
const BarChartIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>);

// ==========================================
// 6. DESIGN SYSTEM
// ==========================================

const AppShell: React.FC<{ isSidebarOpen: boolean; children: React.ReactNode }> = ({ children }) => (<div className="flex h-screen w-full bg-background overflow-hidden relative">{children}</div>);
const ContentArea: React.FC<{ isPushed: boolean; children: React.ReactNode }> = ({ isPushed, children }) => (<main className={`flex-1 flex flex-col h-full relative transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${isPushed ? 'lg:translate-x-[320px] lg:w-[calc(100%-320px)]' : 'translate-x-0 w-full'}`}>{children}</main>);
const Button: React.FC<{ variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' | 'icon'; onClick?: () => void; children: React.ReactNode; className?: string }> = ({ variant = 'primary', size = 'md', onClick, children, className = '' }) => {
    let baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
    let variantStyles = "";
    switch(variant) { case 'primary': variantStyles = "bg-foreground text-background hover:bg-foreground/90"; break; case 'secondary': variantStyles = "bg-surface-l2 text-foreground hover:bg-surface-l3"; break; case 'danger': variantStyles = "bg-red-500 text-white hover:bg-red-600"; break; case 'ghost': variantStyles = "hover:bg-surface-l2 text-foreground"; break; }
    let sizeStyles = "";
    switch(size) { case 'sm': sizeStyles = "h-8 px-3 text-xs"; break; case 'md': sizeStyles = "h-10 px-4 py-2"; break; case 'icon': sizeStyles = "h-10 w-10"; break; }
    return (<button className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`} onClick={onClick}>{children}</button>);
};
const Text: React.FC<{ variant?: 'h1' | 'h2' | 'body' | 'small'; children: React.ReactNode; className?: string }> = ({ variant = 'body', children, className = '' }) => {
    let styles = "";
    switch(variant) { case 'h1': styles = "text-2xl font-bold tracking-tight"; break; case 'h2': styles = "text-xl font-semibold tracking-tight"; break; case 'body': styles = "text-base"; break; case 'small': styles = "text-sm font-medium leading-none"; break; }
    return <div className={`${styles} ${className}`}>{children}</div>
};
const Surface: React.FC<{ level?: 'base' | 'l1' | 'l2' | 'l3'; interactive?: boolean; onClick?: () => void; children: React.ReactNode; className?: string }> = ({ level = 'base', interactive, onClick, children, className = '' }) => {
    let bg = "";
    switch(level) { case 'base': bg = "bg-surface-base"; break; case 'l1': bg = "bg-surface-l1"; break; case 'l2': bg = "bg-surface-l2"; break; case 'l3': bg = "bg-surface-l3"; break; }
    return (<div className={`${bg} ${interactive ? 'cursor-pointer hover:opacity-80' : ''} rounded-lg border border-border ${className}`} onClick={onClick}>{children}</div>);
}

// ==========================================
// 7. SMALL COMPONENTS
// ==========================================

const SkeletonLoader: React.FC<{ className?: string }> = ({ className }) => (<div className={`bg-token-surface-secondary animate-skeleton-pulse rounded-md ${className}`} />);
const GeneratingLoader: React.FC = () => (<div className="flex items-center justify-center"><div className="w-6 h-6 text-foreground"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%"><g transform="translate(12,12)"><circle r="1.6" className="loader-circle" opacity="0.2" /><circle r="1.6" transform="translate(6.4,0)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out' }} /><circle r="1.6" transform="translate(6.4,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.1s' }} /><circle r="1.6" transform="translate(0,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.2s' }} /><circle r="1.6" transform="translate(-6.4,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.3s' }} /><circle r="1.6" transform="translate(-6.4,0)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.4s' }} /><circle r="1.6" transform="translate(-6.4,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.5s' }} /><circle r="1.6" transform="translate(0,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.6s' }} /><circle r="1.6" transform="translate(6.4,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.7s' }} /></g></svg></div><style>{`@keyframes pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } } .loader-circle { fill: currentColor; }`}</style></div>);

const AITextLoading: React.FC<{ texts?: string[] }> = ({ texts = ["Thinking...", "Processing...", "Analyzing...", "Computing...", "Almost there..."] }) => {
    const [currentTextIndex, setCurrentTextIndex] = useState(0);
    const [animationKey, setAnimationKey] = useState(0);
    useEffect(() => {
        if (texts.length === 0) return;
        const timer = setInterval(() => { setCurrentTextIndex((prev) => (prev + 1) % texts.length); setAnimationKey(prev => prev + 1); }, 1500);
        return () => clearInterval(timer);
    }, [texts]);
    if (texts.length === 0) return null;
    return (<div className="flex items-center justify-start py-2"><div className="relative w-full"><div key={animationKey} className="ai-text-loading text-base font-medium animate-fade-in-up">{texts[currentTextIndex]}</div></div></div>);
};

const AudioPlayer: React.FC<{ src: string; t: (key: string) => string; }> = ({ src, t }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onPlay = () => setIsPlaying(true); const onPause = () => setIsPlaying(false); const onEnded = () => setIsPlaying(false);
        audio.addEventListener('play', onPlay); audio.addEventListener('pause', onPause); audio.addEventListener('ended', onEnded);
        return () => { audio.removeEventListener('play', onPlay); audio.removeEventListener('pause', onPause); audio.removeEventListener('ended', onEnded); };
    }, []);
    return (<div className="flex items-center gap-3 px-4 py-3 bg-user-message rounded-full"><audio ref={audioRef} src={src} preload="metadata"></audio><button onClick={() => audioRef.current && (isPlaying ? audioRef.current.pause() : audioRef.current.play())} aria-label={isPlaying ? t('chat.audio.pause') : t('chat.audio.play')} className="flex items-center justify-center size-8 rounded-full bg-foreground text-background flex-shrink-0">{isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}</button></div>);
};

const InlineImage: React.FC<{ src: string; alt: string; onExpand: () => void; }> = ({ src, alt, onExpand }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  return (
    <div className="relative inline-block align-middle my-1 mx-2 w-48 h-32 rounded-lg overflow-hidden group border border-default bg-token-surface-secondary">
      {status === 'loading' && <SkeletonLoader className="absolute inset-0" />}
      {status === 'error' && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground p-2 text-center text-xs">Image failed to load</div>}
      <img src={src} alt={alt} className={`w-full h-full object-cover transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setStatus('loaded')} onError={() => setStatus('error')} loading="lazy" />
      {status === 'loaded' && <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={onExpand}><Maximize2Icon className="size-8 text-white" /></div>}
    </div>
  );
};

const SelectionPopup: React.FC<{ x: number; y: number; text: string; onAsk: (text: string) => void; t: (key: string) => string; }> = ({ x, y, text, onAsk, t }) => (
    <div className="fixed z-[100] selection-popup-container" style={{ left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -115%)' }} onMouseDown={(e) => e.preventDefault()}>
      <div className="animate-fade-in-up">
        <button onClick={(e) => { e.stopPropagation(); onAsk(text); }} className="flex items-center gap-2 px-3 py-1.5 bg-card text-foreground rounded-lg shadow-2xl border border-default text-sm font-medium hover:bg-token-surface-secondary transition-colors"><ArrowRightIcon className="size-4" /><span>{t('selectionPopup.ask')}</span></button>
      </div>
    </div>
);

const DragDropOverlay: React.FC<{ t: (key: string) => string; }> = ({ t }) => (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[200] flex flex-col items-center justify-center pointer-events-none animate-fade-in-up">
        <div className="relative mb-6"><FileTextIcon className="absolute top-1/2 left-1/2 -translate-x-[90%] -translate-y-[60%] size-16 text-blue-300/50 dark:text-blue-500/30 transform -rotate-12" /><CodeXmlIcon className="absolute top-1/2 left-1/2 -translate-x-[10%] -translate-y-[40%] size-16 text-blue-300/50 dark:text-blue-500/30 transform rotate-12" /><ImageIcon className="relative size-20 text-blue-500" /></div>
        <h2 className="text-2xl font-bold text-foreground">{t('dragDrop.title')}</h2><p className="text-muted-foreground mt-1">{t('dragDrop.subtitle')}</p>
    </div>
);

const GreetingMessage: React.FC = () => (
    <div className="animate-fade-in-up flex flex-col items-center justify-center space-y-4">
      <div className="relative w-48 h-48 md:w-64 md:h-64">
        <img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP Logo" className="w-full h-full object-contain dark:hidden pointer-events-none drop-shadow-sm" />
        <img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP Logo" className="w-full h-full object-contain hidden dark:block pointer-events-none drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
      </div>
    </div>
);

// ==========================================
// 8. MEDIUM COMPONENTS
// ==========================================

// Image Gallery
interface ImageInfo { url: string; alt: string; source?: string; }
const GalleryImage: React.FC<{ image: ImageInfo; className?: string; overlayText?: string | null; onClick: () => void; }> = ({ image, className, overlayText, onClick }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  return (
    <div className={`relative rounded-lg overflow-hidden cursor-pointer group bg-token-surface-secondary border border-default ${className}`} onClick={onClick}>
      {status === 'loading' && <SkeletonLoader className="absolute inset-0" />}
      {status === 'error' && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground p-2 text-center text-xs">Error</div>}
      <img src={image.url} alt={image.alt} className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`} loading="lazy" onLoad={() => setStatus('loaded')} onError={() => setStatus('error')} />
      {status === 'loaded' && (<><div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />{overlayText && (<div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xl font-medium backdrop-blur-[2px]">{overlayText}</div>)}</>)}
    </div>
  );
};
const ImageGallery: React.FC<{ images: ImageInfo[]; onImageClick: (index: number) => void; }> = ({ images, onImageClick }) => {
  if (!images || images.length === 0) return null;
  const len = images.length;
  if (len === 1) return (<div className="not-prose my-2"><GalleryImage image={images[0]} className="aspect-video max-w-sm" onClick={() => onImageClick(0)} /></div>);
  if (len === 2) return (<div className="not-prose my-2 grid grid-cols-2 gap-1.5 max-w-lg"><GalleryImage image={images[0]} className="aspect-square" onClick={() => onImageClick(0)} /><GalleryImage image={images[1]} className="aspect-square" onClick={() => onImageClick(1)} /></div>);
  if (len >= 4) { const visibleImages = images.slice(0, 4); const hiddenCount = images.length - 4; return (<div className="not-prose my-2 grid grid-cols-2 gap-1.5 max-w-md">{visibleImages.map((image, index) => { const overlay = index === 3 && hiddenCount > 0 ? `+${hiddenCount}` : null; return <GalleryImage key={index} image={image} overlayText={overlay} onClick={() => onImageClick(index)} className="aspect-[4/3]" />; })}</div>); }
  return (<div className="not-prose my-2 grid grid-cols-3 gap-1.5 max-w-xl">{images.map((img, i) => <GalleryImage key={i} image={img} className="aspect-square" onClick={() => onImageClick(i)} />)}</div>);
};

// Lightbox
const Lightbox: React.FC<{ images: ImageInfo[]; startIndex: number; onClose: () => void; }> = ({ images, startIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [imageLoaded, setImageLoaded] = useState(false);
  const goToPrevious = useCallback(() => { setImageLoaded(false); setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1)); }, [images.length]);
  const goToNext = useCallback(() => { setImageLoaded(false); setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1)); }, [images.length]);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') goToPrevious(); if (e.key === 'ArrowRight') goToNext(); if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevious, goToNext, onClose]);
  const currentImage = images[currentIndex];
  if (!currentImage) return null;
  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-fade-in-up" role="dialog" aria-modal="true" onClick={onClose}>
      <header className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 text-white z-10"><div className="font-mono text-sm bg-black/20 px-2 py-1 rounded-md">{currentIndex + 1} / {images.length}</div><button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-black/20 hover:bg-white/20"><XIcon className="size-6" /></button></header>
      <main className="relative flex items-center justify-center w-full h-full" onClick={(e) => e.stopPropagation()}>
        {images.length > 1 && (<button onClick={goToPrevious} className="absolute left-4 p-2 rounded-full bg-black/20 hover:bg-white/20 text-white z-10"><ChevronLeftIcon className="size-8" /></button>)}
        <div className="flex flex-col items-center justify-center max-w-full max-h-full">
          {!imageLoaded && <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/50"></div>}
          <img key={currentIndex} src={currentImage.url} alt={currentImage.alt} className={`max-w-full max-h-[80vh] object-contain rounded-lg transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setImageLoaded(true)} />
          <footer className={`mt-4 text-center text-white/80 text-sm transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}><p>{currentImage.alt}</p></footer>
        </div>
        {images.length > 1 && (<button onClick={goToNext} className="absolute right-4 p-2 rounded-full bg-black/20 hover:bg-white/20 text-white z-10"><ChevronRightIcon className="size-8" /></button>)}
      </main>
    </div>
  );
};

// Generative UI (Stock Widget & Charts)
declare global { interface Window { Plotly: any; } }
const ChartRenderer: React.FC<{ type: string; data: any; title?: string; height?: string; colors?: string[] }> = ({ type, data, title, height, colors }) => {
    const chartRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!window.Plotly || !chartRef.current || !data) return;
        let plotData: any[] = [];
        let layout: any = { title: title ? { text: title, font: { color: '#e4e4e4' } } : undefined, autosize: true, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)', font: { color: '#888' }, margin: { t: title ? 30 : 10, r: 10, l: 30, b: 30 }, xaxis: { gridcolor: '#333', zerolinecolor: '#333' }, yaxis: { gridcolor: '#333', zerolinecolor: '#333' }, showlegend: false, };
        const defaultColor = colors ? colors[0] : '#1d9bf0';
        try {
            if (type === 'line' || type === 'bar') {
                if (Array.isArray(data)) { plotData = data.map((trace: any, i: number) => ({ ...trace, type: type, marker: { color: colors ? colors[i % colors.length] : defaultColor }, line: { color: colors ? colors[i % colors.length] : defaultColor, width: 2 } })); } 
                else if (data.x && data.y) { plotData = [{ x: data.x, y: data.y, type: type, marker: { color: defaultColor }, line: { color: defaultColor, width: 2 } }]; }
            } else if (type === 'pie' || type === 'donut') { if (data.labels && data.values) { plotData = [{ ...data, type: 'pie', hole: type === 'donut' ? 0.6 : 0 }]; } }
            if (plotData.length > 0) { window.Plotly.react(chartRef.current, plotData, layout, { responsive: true, displayModeBar: false }); }
        } catch (e) { console.error("Chart rendering failed", e); }
    }, [type, data, title, colors]);
    return (<div style={{ height: height || '320px' }} className="w-full"><div ref={chartRef} className="w-full h-full" /></div>);
};

const StockWidget: React.FC<{ symbol: string; price: string; change: string; changePercent: string; chartData: any; history?: any; stats: any; currency?: string; }> = ({ symbol = 'N/A', price = '0.00', change = '', changePercent = '', chartData, history = {}, stats = {}, currency = '$' }) => {
    const safeChange = String(change || '0.00'); const safeChangePercent = String(changePercent || '0.00%'); const isNegative = safeChange.includes('-') || safeChangePercent.includes('-');
    const trendColor = isNegative ? 'text-[#ef4444]' : 'text-[#22c55e]'; const chartColor = isNegative ? '#ef4444' : '#22c55e';
    const [activeRange, setActiveRange] = useState('1D');
    const currentData = React.useMemo(() => { if (activeRange === '1D') return chartData; if (history && history[activeRange]) return history[activeRange]; return chartData; }, [activeRange, chartData, history]);
    return (
        <div className="bg-[#121212] border border-[#27272a] rounded-xl overflow-hidden shadow-lg my-4 max-w-3xl font-sans text-[#e4e4e7]">
            <div className="p-5 flex flex-wrap justify-between items-start gap-4">
                <div><div className="text-sm text-[#a1a1aa] font-medium mb-1">{symbol}</div><div className="text-5xl font-bold tracking-tight mb-2 text-white">{currency}{price}</div><div className={`text-sm font-medium ${trendColor} flex items-center gap-1.5`}><span className="font-bold">{safeChange}</span><span>({safeChangePercent})</span></div></div>
                <div className="flex bg-[#27272a] rounded-lg overflow-hidden p-1 self-center">{['1D', '5D', '1M', '6M', '1Y', '5Y'].map(r => (<button key={r} onClick={() => setActiveRange(r)} disabled={r !== '1D' && (!history || !history[r])} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${activeRange === r ? 'bg-[#3f3f46] text-white' : 'text-[#a1a1aa] hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed'}`}>{r}</button>))}</div>
            </div>
            <div className="h-[340px] w-full px-2 relative"><ChartRenderer type="line" data={currentData} height="340px" colors={[chartColor]} /></div>
            {stats && Object.keys(stats).length > 0 && (<div className="bg-[#18181b] border-t border-[#27272a] p-5 grid grid-cols-2 sm:grid-cols-3 gap-y-4 gap-x-12">{Object.entries(stats).map(([key, value]) => (<div key={key} className="flex justify-between items-center text-sm"><span className="text-[#a1a1aa] font-normal">{key}</span><span className="text-white font-medium">{String(value || '-')}</span></div>))}</div>)}
        </div>
    );
};
const GenerativeUI: React.FC<{ toolName: string; args: any; }> = ({ toolName, args }) => {
    if (!args) return null;
    if (toolName === 'render_stock_widget') return <StockWidget symbol={args.symbol} price={args.price} change={args.change} changePercent={args.changePercent} chartData={args.chartData} history={args.history} stats={args.stats} currency={args.currency} />;
    return (<div className="p-4 bg-gray-50 dark:bg-[#252525] border border-gray-200 dark:border-[#333] rounded-lg my-2"><div className="flex items-center gap-2 mb-2"><BarChartIcon className="size-4 text-blue-500" /><span className="text-xs font-mono text-gray-500 uppercase">{toolName}</span></div><pre className="text-xs overflow-x-auto text-gray-600 dark:text-gray-300">{JSON.stringify(args, null, 2)}</pre></div>);
};

// Grounding Sources
const getHostname = (url: string) => { try { return new URL(url).hostname; } catch (e) { return 'google.com'; } };
const getDomainLabel = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'source'; } };
const GroundingSources: React.FC<{ chunks: GroundingChunk[]; t: (key: string) => string; }> = ({ chunks, t }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    if (!chunks || chunks.length === 0) return null;
    const visiblePills = chunks.slice(0, 3);
    return (
        <>
            <button type="button" className="flex items-center gap-2 group px-3 py-1.5 rounded-full bg-white dark:bg-[#141414] hover:bg-gray-50 dark:hover:bg-[#292929] border border-gray-200 dark:border-[#27272a] transition-all shadow-sm" onClick={() => setIsModalOpen(true)}>
                <div className="flex items-center -space-x-2">{visiblePills.map((chunk, index) => { const icon = 'web' in chunk ? `https://www.google.com/s2/favicons?sz=64&domain_url=${getHostname(chunk.web.uri)}` : null; return (<div key={index} className="size-5 rounded-full bg-white dark:bg-[#141414] border-2 border-white dark:border-[#141414] ring-1 ring-gray-200 dark:ring-[#27272a] overflow-hidden flex items-center justify-center">{icon ? <img src={icon} alt="" className="size-3" /> : <MapPinIcon className="size-5 text-blue-500" />}</div>); })}</div>
                <div className="text-[11px] font-bold text-gray-500 dark:text-[#a1a1aa] group-hover:text-black dark:group-hover:text-white transition-colors uppercase tracking-widest">{chunks.length} sources</div>
            </button>
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in-up" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white dark:bg-[#141414] rounded-[2.5rem] shadow-2xl w-full max-w-md max-h-[75vh] flex flex-col overflow-hidden border border-gray-200 dark:border-[#27272a]" onClick={e => e.stopPropagation()}>
                        <header className="flex items-center justify-between p-7 pb-2"><div className="flex flex-col"><h3 className="text-xl font-extrabold text-black dark:text-white tracking-tight">Sources</h3><p className="text-[10px] text-gray-400 dark:text-[#a1a1aa] font-bold uppercase tracking-widest mt-1">Verified Information</p></div><button onClick={() => setIsModalOpen(false)} className="p-2.5 rounded-full bg-gray-50 dark:bg-[#1f1f1f] hover:bg-gray-100 dark:hover:bg-[#292929] transition-colors border border-gray-100 dark:border-[#27272a]"><XIcon className="size-5 text-black dark:text-white" /></button></header>
                        <div className="flex-1 overflow-y-auto p-4 scrollbar-none flex flex-col gap-1">{chunks.map((chunk, i) => { const isWeb = 'web' in chunk; const url = isWeb ? chunk.web.uri : (chunk as any).maps.uri; const title = isWeb ? chunk.web.title : (chunk as any).maps.title; const fav = isWeb ? `https://www.google.com/s2/favicons?sz=64&domain_url=${getHostname(url)}` : null; return (<a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-[#292929] transition-all border border-transparent hover:border-gray-100 dark:hover:border-white/5 group"><div className="size-10 rounded-xl bg-gray-50 dark:bg-[#1f1f1f] flex items-center justify-center shrink-0 border border-gray-100 dark:border-[#27272a] transition-colors group-hover:bg-white dark:group-hover:bg-[#141414]">{fav ? <img src={fav} alt="" className="size-5 rounded-sm" /> : <MapPinIcon className="size-5 text-blue-500" />}</div><div className="flex-1 min-w-0"><p className="text-sm font-bold text-black dark:text-white truncate">{title}</p><p className="text-[10px] text-gray-400 dark:text-[#a1a1aa] truncate uppercase tracking-widest font-bold mt-0.5">{getDomainLabel(url)}</p></div></a>); })}</div>
                    </div>
                </div>
            )}
        </>
    );
};

// ==========================================
// 9. LARGE COMPONENTS
// ==========================================

// --- Welcome Modal ---
const WelcomeModal: React.FC<{ onComplete: () => void; onLocationUpdate: (loc: LocationInfo, lang?: string) => void; t: (key: string) => string; }> = ({ onComplete, onLocationUpdate, t }) => {
  const [step, setStep] = useState(0);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [activeExample, setActiveExample] = useState<string | null>(null);

  const handleLocationRequest = () => {
    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          const city = data?.address?.city || 'Unknown City';
          const country = data?.address?.country || 'Unknown Country';
          const countryCode = data?.address?.country_code?.toUpperCase();
          const countryToLang: any = { GR: 'el', ES: 'es', FR: 'fr', DE: 'de' };
          onLocationUpdate({ city, country, latitude, longitude }, countryCode ? countryToLang[countryCode] : undefined);
          setLocationStatus('granted');
        } catch { setLocationStatus('granted'); }
      }, () => setLocationStatus('denied'));
  };

  const steps = [
    { title: t('welcome.steps.intro.title'), story: t('welcome.steps.intro.story'), visual: (<div className="relative flex items-center justify-center h-full w-full group"><div className="absolute inset-0 bg-gradient-to-tr from-accent-blue/5 to-transparent rounded-3xl" /><div className="relative animate-pulse flex flex-col items-center"><img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP" className="w-32 h-32 md:w-64 md:h-64 object-contain hidden dark:block" /><img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP" className="w-32 h-32 md:w-64 md:h-64 object-contain dark:hidden" /></div></div>) },
    { title: t('welcome.steps.workspace.title'), story: t('welcome.steps.workspace.description'), visual: (<div className="flex flex-col h-full w-full bg-background rounded-2xl md:rounded-3xl border border-border overflow-hidden shadow-inner relative max-h-[400px] md:max-h-full"><div className="flex h-full"><div className="w-16 md:w-24 h-full border-r border-border bg-sidebar p-2 flex flex-col gap-2 shrink-0"><div className="size-6 bg-surface-l2 rounded-md mx-auto" /><div className="w-full h-3 md:h-4 bg-surface-l2 rounded" /></div><div className="flex-1 flex flex-col p-4 gap-4"><div className="w-3/4 h-8 bg-surface-l1 border border-border rounded-xl self-end animate-fade-in-up" /><div className="w-full h-24 bg-surface-l2 rounded-2xl animate-fade-in-up delay-100" /></div></div></div>) },
    { title: t('welcome.steps.features.title'), story: t('welcome.steps.features.description'), visual: (<div className="flex flex-col h-full w-full bg-surface-base rounded-2xl md:rounded-3xl border border-border p-4 md:p-6 gap-4 overflow-hidden shadow-inner max-h-[400px] md:max-h-full"><div className="flex flex-wrap gap-2 justify-center md:justify-start"><button onClick={() => setActiveExample('stock')} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeExample === 'stock' ? 'bg-foreground text-background border-foreground' : 'bg-card border-default text-muted-foreground'}`}>{t('welcome.steps.features.examples.stock')}</button><button onClick={() => setActiveExample('python')} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeExample === 'python' ? 'bg-foreground text-background border-foreground' : 'bg-card border-default text-muted-foreground'}`}>{t('welcome.steps.features.examples.python')}</button></div><div className="flex-1 rounded-2xl border border-border bg-card shadow-lg p-4 overflow-hidden relative flex flex-col justify-center">{!activeExample ? (<div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2"><SearchIcon className="size-8 opacity-20" /><span className="text-center px-4">Click an example</span></div>) : (<div className="animate-fade-in-up space-y-4 w-full">{activeExample === 'stock' && (<div className="h-24 w-full bg-[#121212] rounded-xl p-3 border border-white/10"><div className="text-xs text-white/50">AAPL</div><div className="text-green-500 text-xs">+1.24%</div></div>)}{activeExample === 'python' && (<div className="p-2 bg-foreground text-background rounded text-xs font-mono">Execution Output: 42.0</div>)}</div>)}</div></div>) },
    { title: t('welcome.steps.location.title'), story: t('welcome.steps.location.description'), visual: (<div className="flex flex-col h-full w-full items-center justify-center p-6 gap-6 text-center"><div className="size-20 md:size-32 rounded-full bg-accent-blue/10 flex items-center justify-center animate-bounce shadow-[0_0_30px_rgba(29,155,240,0.1)]"><MapPinIcon className="size-8 md:size-12 text-accent-blue" /></div><div className="space-y-4 w-full max-w-xs">{locationStatus === 'granted' ? (<div className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center gap-3 text-green-600 font-bold"><CheckIcon className="size-5" /> Granted</div>) : (<button onClick={handleLocationRequest} disabled={locationStatus === 'requesting'} className="w-full py-3 md:py-4 bg-accent-blue text-white rounded-2xl font-bold hover:opacity-90 transition-all">{locationStatus === 'requesting' ? 'Requesting...' : t('welcome.steps.location.allow')}</button>)}</div></div>) }
  ];

  const isLast = step === steps.length - 1;
  return (
    <div className="fixed inset-0 z-[300] bg-background flex flex-col md:flex-row overflow-hidden">
        <div className="relative w-full h-[45%] md:h-full md:w-7/12 bg-surface-base order-1 md:order-2 flex items-center justify-center p-6 md:p-12 overflow-hidden border-b md:border-b-0 md:border-l border-border"><div className="w-full h-full max-w-lg md:max-w-3xl relative flex flex-col justify-center">{steps[step].visual}</div></div>
        <div className="w-full h-[55%] md:h-full md:w-5/12 bg-background order-2 md:order-1 flex flex-col justify-between p-6 md:p-12 lg:p-16 relative z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] md:shadow-none">
            <div className="absolute top-6 right-6 md:top-8 md:left-8 md:right-auto"><button onClick={onComplete} className="text-xs text-muted-foreground hover:text-foreground font-semibold uppercase tracking-wider transition-colors px-2 py-1">{t('welcome.skip')}</button></div>
            <div className="flex-1 flex flex-col justify-center mt-8 md:mt-0"><div className="space-y-3 md:space-y-6"><h2 className="text-2xl md:text-4xl lg:text-5xl font-extrabold text-foreground tracking-tight leading-tight">{steps[step].title}</h2><p className="text-sm md:text-lg text-muted-foreground leading-relaxed font-medium">{steps[step].story}</p></div></div>
            <div className="flex items-center justify-between pt-6"><div className="flex gap-2">{steps.map((_, i) => (<div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${step === i ? 'w-6 md:w-8 bg-accent-blue' : 'w-1.5 bg-border'}`} />))}</div><div className="flex gap-3 md:gap-4">{step > 0 && (<button onClick={() => setStep(step - 1)} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">{t('welcome.back')}</button>)}<button onClick={() => isLast ? onComplete() : setStep(step + 1)} className="px-6 py-2.5 md:px-8 md:py-3 bg-foreground text-background rounded-xl md:rounded-2xl font-bold hover:opacity-90 transition-all flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95">{isLast ? t('welcome.getStarted') : t('welcome.next')}{!isLast && <ChevronRightIcon className="size-4 md:size-5" />}</button></div></div>
        </div>
    </div>
  );
};

// --- Settings Modal ---
const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void; theme: string; setTheme: (theme: string) => void; language: string; setLanguage: (language: any) => void; conversations: Conversation[]; setConversations: (conversations: Conversation[]) => void; t: (key: string) => string; }> = ({ isOpen, onClose, theme, setTheme, language, setLanguage, setConversations, t }) => {
  const [activeTab, setActiveTab] = useState<'Appearance' | 'Behavior' | 'Data Controls' | null>(window.innerWidth >= 1024 ? 'Appearance' : null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => { if (isOpen) { setIsVisible(true); } else { const timer = setTimeout(() => setIsVisible(false), 300); return () => clearTimeout(timer); } }, [isOpen]);
  if (!isVisible && !isOpen) return null;
  const ListItem = ({ label, icon, onClick }: { label: string, icon: React.ReactNode, onClick: () => void }) => (<Surface level="l1" interactive onClick={onClick} className="flex items-center justify-between p-4 mb-2"><div className="flex items-center gap-3"><div className="size-8 rounded-full bg-surface-l2 flex items-center justify-center text-muted-foreground">{icon}</div><Text variant="body" className="font-bold">{label}</Text></div><ChevronRightIcon className="size-4 text-muted-foreground opacity-50" /></Surface>);
  return (
    <div className={`fixed inset-0 z-[200] flex items-end lg:items-center justify-center transition-all duration-300 ${isOpen ? 'bg-black/60 backdrop-blur-sm' : 'bg-transparent pointer-events-none'}`} onClick={onClose}>
      <div className={`bg-background w-full fixed bottom-0 left-0 right-0 h-[85vh] rounded-t-[2rem] border-t border-border shadow-2xl lg:static lg:w-[90vw] lg:h-[85vh] lg:max-w-6xl lg:rounded-[2.5rem] lg:border lg:border-border flex flex-col overflow-hidden relative transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-full lg:translate-y-0 lg:scale-95 lg:opacity-0'}`} onClick={e => e.stopPropagation()}>
        <div className="lg:hidden flex items-center justify-between p-6 pt-8 shrink-0 bg-background/80 backdrop-blur-md z-10 border-b border-border rounded-t-[2rem]">{activeTab ? (<button onClick={() => setActiveTab(null)} className="flex items-center gap-2 font-extrabold text-foreground"><ChevronLeftIcon className="size-6" /><span>{t(`settings.${activeTab.toLowerCase().replace(' ', '')}`)}</span></button>) : (<Text variant="h2">{t('settings.header')}</Text>)}<Button variant="secondary" size="icon" onClick={onClose} className="rounded-full"><XIcon className="size-5" /></Button></div>
        <button onClick={onClose} className="hidden lg:flex absolute top-6 right-6 z-50 p-2 rounded-full bg-surface-l2 hover:bg-surface-l3 transition-colors"><XIcon className="size-5" /></button>
        <div className="flex flex-1 h-full overflow-hidden">
            <aside className="hidden lg:flex w-72 p-8 flex-shrink-0 border-r border-border flex-col gap-2 h-full bg-surface-base/50">
              <div className="py-2 mb-6"><Text variant="h1" className="text-3xl">{t('settings.header')}</Text></div>
              {[{ id: 'Appearance', label: t('settings.appearance'), icon: <SunIcon className="size-5" /> }, { id: 'Behavior', label: t('settings.behavior'), icon: <SettingsIcon className="size-5" /> }, { id: 'Data Controls', label: t('settings.data'), icon: <TerminalIcon className="size-5" /> }].map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`inline-flex items-center whitespace-nowrap text-base font-bold transition-all duration-200 rounded-2xl py-4 gap-4 px-5 justify-start ${activeTab === tab.id ? 'bg-foreground text-background shadow-lg scale-[1.02]' : 'text-muted-foreground hover:bg-surface-l2 hover:text-foreground'}`}>{tab.icon}{tab.label}</button>))}
            </aside>
            <main className="flex-1 overflow-y-auto h-full relative scrollbar-none flex flex-col bg-background">
              {!activeTab && (<div className="lg:hidden p-4 space-y-2 animate-fade-in-up"><ListItem label={t('settings.appearance')} icon={<SunIcon className="size-4" />} onClick={() => setActiveTab('Appearance')} /><ListItem label={t('settings.behavior')} icon={<SettingsIcon className="size-4" />} onClick={() => setActiveTab('Behavior')} /><ListItem label={t('settings.data')} icon={<TerminalIcon className="size-4" />} onClick={() => setActiveTab('Data Controls')} /></div>)}
              {(activeTab || window.innerWidth >= 1024) && (
                  <div className={`flex-1 flex flex-col p-6 lg:p-12 max-w-4xl ${!activeTab ? 'hidden lg:flex' : 'animate-fade-in-up h-full'}`}>
                      {activeTab === 'Appearance' && (<div className="flex flex-col gap-12"><div className="space-y-6"><Text variant="h2" className="lg:hidden">{t('settings.appearance')}</Text><div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{(['light', 'dark', 'system'] as const).map(th => (<button key={th} onClick={() => setTheme(th)} className={`relative overflow-hidden inline-flex items-center justify-center gap-2 text-sm font-bold rounded-[1.5rem] flex-col p-6 border-2 transition-all duration-200 ${theme === th ? 'bg-surface-l1 border-foreground text-foreground shadow-xl scale-[1.02]' : 'bg-surface-base border-transparent text-muted-foreground hover:bg-surface-l2'}`}><div className={`size-12 rounded-full mb-3 flex items-center justify-center ${theme === th ? 'bg-foreground text-background' : 'bg-surface-l3'}`}><SunIcon className="size-6" /></div><p className="capitalize">{t(`settings.themes.${th}`)}</p></button>))}</div></div><div className="space-y-6"><Text variant="small" className="uppercase tracking-widest opacity-60">{t('settings.langTitle')}</Text><div className="flex gap-4"><Button variant={language === 'en' ? 'primary' : 'secondary'} className="flex-1 h-12 rounded-xl text-base" onClick={() => setLanguage('en')}>English</Button><Button variant={language === 'el' ? 'primary' : 'secondary'} className="flex-1 h-12 rounded-xl text-base" onClick={() => setLanguage('el')}>Ελληνικά</Button></div></div></div>)}
                      {activeTab === 'Data Controls' && (<div className="flex flex-col gap-8"><Surface className="bg-red-500/5 border-red-500/10 p-8 rounded-3xl"><div className="flex items-center justify-between"><div className="space-y-1"><Text variant="body" className="font-bold text-red-600 dark:text-red-400">{t('settings.buttons.delete')}</Text><p className="text-xs text-red-600/60 dark:text-red-400/60">This action cannot be undone.</p></div><Button variant="danger" size="md" onClick={() => { if(confirm(t('sidebar.confirmDelete'))) setConversations([]); }}>{t('settings.buttons.deleteAction')}</Button></div></Surface></div>)}
                  </div>
              )}
            </main>
        </div>
      </div>
    </div>
  );
};

// --- Code Executor ---
type DownloadableFile = { filename: string; mimetype: string; data: string };
type ExecutionResult = { output: string | null; error: string; type: 'string' | 'image-base64' | 'plotly-json' | 'error'; downloadableFile?: DownloadableFile; };
const downloadFile = (filename: string, mimetype: string, base64: string) => { const byteCharacters = atob(base64); const byteNumbers = new Array(byteCharacters.length); for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); } const byteArray = new Uint8Array(byteNumbers); const blob = new Blob([byteArray], { type: mimetype }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); };
const ActionButton: React.FC<{ onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean; }> = ({ onClick, title, children, disabled = false }) => (<button onClick={onClick} title={title} disabled={disabled} className="p-1.5 rounded-md text-muted-foreground hover:bg-token-surface-secondary hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent">{children}</button>);

const CodeExecutor: React.FC<{ code: string; lang: string; title?: string; isExecutable: boolean; autorun?: boolean; initialCollapsed?: boolean; persistedResult?: ExecutionResult; onExecutionComplete: (result: ExecutionResult) => void; onFixRequest?: (error: string) => void; onStopExecution: () => void; isPythonReady: boolean; isLoading?: boolean; t: (key: string, params?: Record<string, string>) => string; }> = ({ code, lang, title, isExecutable, autorun, initialCollapsed = false, persistedResult, onExecutionComplete, onFixRequest, onStopExecution, isPythonReady, isLoading = false, t }) => {
    const plotlyRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
    const [output, setOutput] = useState<any>('');
    const [error, setError] = useState<string>('');
    const [downloadableFile, setDownloadableFile] = useState<DownloadableFile | null>(null);
    const [highlightedCode, setHighlightedCode] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
    const [hasRunOnce, setHasRunOnce] = useState(!!persistedResult);
    const prevIsLoading = usePrevious(isLoading);

    const runPython = useCallback(async () => {
        setStatus('executing'); setHasRunOnce(true);
        let stdoutBuffer = ''; let stderrBuffer = ''; let finalResult: ExecutionResult | null = null; let currentRunDownloadableFile: DownloadableFile | null = null;
        runPythonCode(code, (update: PythonExecutorUpdate) => {
            switch (update.type) {
                case 'stdout': stdoutBuffer += update.data + '\n'; setOutput((prev:any) => (typeof prev === 'string' ? prev : '') + update.data + '\n'); break;
                case 'stderr': stderrBuffer += update.error + '\n'; setError(stderrBuffer.trim()); break;
                case 'plot': if (update.plotType === 'plotly') { setOutput(update.data); finalResult = { output: update.data, error: '', type: 'plotly-json' }; } else { setOutput(<img src={`data:image/png;base64,${update.data}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />); finalResult = { output: update.data, error: '', type: 'image-base64' }; } break;
                case 'download': const fileInfo = { filename: update.filename!, mimetype: update.mimetype!, data: update.data! }; setDownloadableFile(fileInfo); currentRunDownloadableFile = fileInfo; setIsCollapsed(true); break;
                case 'success': setStatus('success'); let resultToPersist: ExecutionResult; if (finalResult) { resultToPersist = { ...finalResult, error: stderrBuffer.trim() }; } else if (stdoutBuffer.trim()) { resultToPersist = { output: stdoutBuffer.trim(), error: stderrBuffer.trim(), type: 'string' }; } else if (currentRunDownloadableFile) { const msg = t('code.fileSuccess', {filename: currentRunDownloadableFile.filename}); setOutput(msg); resultToPersist = { output: msg, error: stderrBuffer.trim(), type: 'string' }; } else { resultToPersist = { output: null, error: stderrBuffer.trim(), type: 'string' }; } if (currentRunDownloadableFile) { resultToPersist.downloadableFile = currentRunDownloadableFile; } onExecutionComplete(resultToPersist); break;
                case 'error': const errorMsg = update.error || stderrBuffer.trim(); setError(errorMsg); setStatus('error'); const errorResult: ExecutionResult = { output: null, error: errorMsg, type: 'error' }; if (currentRunDownloadableFile) { errorResult.downloadableFile = currentRunDownloadableFile; } onExecutionComplete(errorResult); break;
            }
        });
    }, [code, onExecutionComplete, t]);

    const handleRunCode = useCallback(async () => {
        setOutput(''); setError(''); setDownloadableFile(null);
        if (lang.toLowerCase() === 'python') await runPython(); 
        else { const errorMsg = "Language not supported for execution"; setError(errorMsg); setStatus('error'); onExecutionComplete({ output: null, error: errorMsg, type: 'error' }); }
    }, [lang, runPython, onExecutionComplete]);

    useEffect(() => {
        if (persistedResult) {
            const { output: savedOutput, error: savedError, type, downloadableFile: savedFile } = persistedResult;
            if (type === 'error') { setError(savedError); setStatus('error'); } else { if (savedError) setError(savedError); if (savedOutput !== null) { if (type === 'image-base64') setOutput(<img src={`data:image/png;base64,${savedOutput}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />); else if (type === 'plotly-json') setOutput(savedOutput); else setOutput(savedOutput); } setStatus('success'); }
            if (savedFile) { setDownloadableFile(savedFile); setIsCollapsed(true); }
            setHasRunOnce(true);
        }
    }, [persistedResult, lang]);

    useEffect(() => { if (autorun && hasRunOnce && !downloadableFile) setIsCollapsed(false); }, [autorun, hasRunOnce, downloadableFile]);
    useEffect(() => { if (autorun && isPythonReady && prevIsLoading && !isLoading && !persistedResult) handleRunCode(); }, [isLoading, prevIsLoading, autorun, isPythonReady, persistedResult, handleRunCode]);
    useEffect(() => { setHighlightedCode(code); }, [code]);
    useEffect(() => { if (isExecutable && hasRunOnce && lang === 'python' && plotlyRef.current && typeof output === 'string' && output.startsWith('{')) { try { const spec = JSON.parse(output); if (window.Plotly) window.Plotly.newPlot(plotlyRef.current, spec.data, spec.layout || {}, { responsive: true }); } catch (e) { console.error(e); setError("Chart error"); } } }, [output, lang, isExecutable, hasRunOnce]);

    const isPython = lang.toLowerCase() === 'python';
    const showCodeBlock = !downloadableFile || status === 'error';
    const lineCount = code.trim().split('\n').length;

    return (
        <div className="not-prose my-4 font-sans max-w-full">
            {showCodeBlock && (
                <div className="bg-code-bg border border-default rounded-lg overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-background/30">
                        <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{title || lang}</span>{isCollapsed && lineCount > 1 && (<span className="text-[10px] text-muted-foreground ml-2 lowercase">{lineCount} lines hidden</span>)}{isPython && !isPythonReady && status !== 'executing' && (<span className="text-[10px] text-yellow-600 dark:text-yellow-500 opacity-80">Loading env...</span>)}</div>
                        <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                            <ActionButton onClick={() => setIsCollapsed(!isCollapsed)} title={isCollapsed ? 'Expand' : 'Collapse'}>{isCollapsed ? <ChevronsUpDownIcon className="size-3.5" /> : <ChevronsDownUpIcon className="size-3.5" />}</ActionButton>
                            {isExecutable ? (status === 'executing' ? (<ActionButton onClick={() => { stopPythonExecution(); onStopExecution(); setStatus('idle'); setError("Stopped"); }} title="Stop"><div className="w-2.5 h-2.5 bg-foreground rounded-sm animate-pulse"></div></ActionButton>) : (<ActionButton onClick={handleRunCode} title={hasRunOnce ? 'Run Again' : 'Run'} disabled={isPython && !isPythonReady}>{hasRunOnce ? <RefreshCwIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}</ActionButton>)) : null}
                            <ActionButton onClick={() => { navigator.clipboard.writeText(code); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }} title="Copy">{isCopied ? <CheckIcon className="size-3.5 text-green-500" /> : <CopyIcon className="size-3.5" />}</ActionButton>
                        </div>
                    </div>
                    <div className={`transition-all duration-300 ${isCollapsed ? 'max-h-0' : 'max-h-[500px]'} overflow-y-auto`}><div className="p-0 bg-code-bg"><pre className="!m-0 !p-3 overflow-x-auto code-block-area rounded-none bg-transparent"><code className={`language-${lang} !text-[13px] !leading-relaxed`}>{highlightedCode}</code></pre></div></div>
                </div>
            )}
            <div className="mt-2 space-y-2">
                {isExecutable && status === 'executing' && (<div className="flex items-center text-xs text-muted-foreground px-2 py-1"><span className="animate-spin mr-2">⟳</span><span>Executing...</span></div>)}
                {isExecutable && hasRunOnce && (status === 'success' || status === 'error') && (
                    <div className="flex flex-col gap-2">
                        {error && (<div className={`output-block ${status === 'error' ? 'error' : 'success'}`}><pre className={`text-sm whitespace-pre-wrap ${status === 'error' ? 'text-red-500' : ''}`}>{error}</pre>{status === 'error' && onFixRequest && <button onClick={() => onFixRequest(error)} className="p-1 text-muted-foreground hover:bg-background rounded-md"><Wand2Icon className="size-4" /></button>}</div>)}
                        {status !== 'error' && output && (typeof output !== 'string' ? <div>{output}</div> : (lang === 'python' && output.startsWith('{') ? <div ref={plotlyRef} className="w-full min-h-[450px] rounded-xl bg-white p-2 border border-default"></div> : <div className="text-sm output-block success"><pre>{output.trim()}</pre></div>))}
                        {downloadableFile && <button onClick={() => downloadFile(downloadableFile.filename, downloadableFile.mimetype, downloadableFile.data)} className="flex items-center gap-2 text-foreground/90 hover:text-foreground group"><DownloadIcon className="size-4" /><span className="font-medium border-b-2 border-dotted border-foreground/30 group-hover:border-foreground/80 transition-colors pb-0.5">Download {downloadableFile.filename}</span></button>}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Sidebar ---
const Sidebar: React.FC<{ isOpen: boolean; toggleSidebar: () => void; conversations: Conversation[]; activeConversationId: string | null; onNewChat: () => void; onSelectConversation: (id: string) => void; onDeleteConversation: (id: string) => void; onOpenSettings: () => void; t: (key: string) => string; }> = ({ isOpen, toggleSidebar, conversations, activeConversationId, onNewChat, onSelectConversation, onDeleteConversation, onOpenSettings, t }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const filteredConversations = conversations.filter(convo => convo.title.toLowerCase().includes(searchTerm.toLowerCase()));
  return (
    <div className={`flex flex-col h-full bg-sidebar z-[100] fixed inset-y-0 left-0 transform transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] border-r border-border w-full lg:w-[320px] ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
      <div className="h-[6rem] flex flex-col justify-center px-6 shrink-0"><div className="flex items-center justify-between w-full"><button onClick={(e) => { e.stopPropagation(); onNewChat(); }} className="p-1 rounded-xl hover:bg-surface-l2 transition-colors focus:outline-none"><div className="flex items-center justify-center size-10"><img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP Logo" className="w-full h-full object-contain dark:hidden pointer-events-none" /><img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP Logo" className="w-full h-full object-contain hidden dark:block pointer-events-none" /></div></button><button onClick={(e) => { e.stopPropagation(); toggleSidebar(); }} className="size-12 rounded-full bg-white dark:bg-white/10 backdrop-blur-2xl border border-white/10 flex items-center justify-center shadow-xl active:scale-95 transition-all text-black dark:text-white"><ChevronsRightIcon className="size-6" /></button></div></div>
      <div className="px-6 mb-6 relative h-12 flex items-center"><div className="flex items-center gap-2 w-full relative"><div className={`relative flex items-center h-12 px-4 rounded-full bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 text-muted-foreground focus-within:text-black dark:focus-within:text-white transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-sm ${isSearchFocused ? 'w-full z-10' : 'w-[calc(100%-104px)]'}`}><SearchIcon className="size-5 mr-3 shrink-0" /><input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setIsSearchFocused(false)} placeholder={t('sidebar.search')} className="bg-transparent border-none outline-none text-sm w-full h-full placeholder:text-muted-foreground/60 font-medium text-black dark:text-white" /></div><div className={`flex items-center gap-2 transition-all duration-300 absolute right-0 ${isSearchFocused ? 'opacity-0 scale-75 pointer-events-none translate-x-4' : 'opacity-100 scale-100 translate-x-0'}`}><button onClick={(e) => { e.stopPropagation(); onOpenSettings(); }} className="size-12 rounded-full bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 flex items-center justify-center text-black dark:text-white hover:opacity-80 transition-all shadow-lg"><SettingsIcon className="size-5" /></button><button onClick={(e) => { e.stopPropagation(); onNewChat(); }} className="size-12 rounded-full bg-white dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 flex items-center justify-center text-black dark:text-white hover:opacity-80 transition-all shadow-lg"><SquarePenIcon className="size-5" /></button></div></div></div>
      <div className="flex min-h-0 flex-col overflow-auto grow relative overflow-x-hidden scrollbar-none px-6 space-y-1"><div className="flex flex-col gap-1 mt-2">{filteredConversations.length > 0 && (<div className="py-2 pl-3 text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-40">{t('sidebar.recent')}</div>)}{filteredConversations.map(convo => (<button key={convo.id} onClick={(e) => { e.stopPropagation(); onSelectConversation(convo.id); }} className={`flex items-center gap-3 rounded-2xl text-left w-full h-[52px] transition-all px-4 text-sm group ${activeConversationId === convo.id ? 'bg-surface-l1 text-foreground font-bold' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}><span className="flex-1 truncate select-none">{convo.title}</span><div className="size-8 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-colors opacity-100" onClick={(e) => { e.stopPropagation(); if (confirm(t('sidebar.confirmDelete'))) onDeleteConversation(convo.id); }}><Trash2Icon className="size-4" /></div></button>))}</div></div>
    </div>
  );
};

// --- Chat Input ---
export interface ChatInputHandle { focus: () => void; handleFiles: (files: FileList) => void; }
const ChatInput = forwardRef<ChatInputHandle, { text: string; onTextChange: (text: string) => void; onSendMessage: (text: string, files: File[]) => void; isLoading: boolean; t: (key: string, params?: Record<string, string>) => string; onAbortGeneration: () => void; replyContextText: string | null; onClearReplyContext: () => void; language: string; }>(({ text, onTextChange, onSendMessage, isLoading, t, onAbortGeneration, replyContextText, onClearReplyContext }, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null); const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]); const [previews, setPreviews] = useState<string[]>([]);
  const handleFiles = (files: FileList) => { const newFiles = Array.from(files); setAttachedFiles(prev => [...prev, ...newFiles]); newFiles.forEach(file => { if (file.type.startsWith('image/')) { const reader = new FileReader(); reader.onload = (e) => setPreviews(prev => [...prev, e.target?.result as string]); reader.readAsDataURL(file); } else { setPreviews(prev => [...prev, 'file']); } }); };
  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus(), handleFiles: (files: FileList) => handleFiles(files) }));
  useEffect(() => { if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`; } }, [text]);
  const handleSend = () => { if ((text.trim() || attachedFiles.length > 0) && !isLoading) { onSendMessage(text, attachedFiles); onTextChange(''); setAttachedFiles([]); setPreviews([]); if (textareaRef.current) textareaRef.current.style.height = 'auto'; if (fileInputRef.current) fileInputRef.current.value = ''; } };
  const hasContent = text.trim().length > 0 || attachedFiles.length > 0;
  return (
    <div className="w-full flex flex-col gap-2">
      {(replyContextText || previews.length > 0) && (<div className="flex flex-col gap-2 px-2 mb-1">{replyContextText && (<div className="flex items-center gap-2 bg-surface-l1 dark:bg-[#111] border border-border p-2 rounded-xl text-xs text-muted-foreground animate-fade-in-up shadow-sm"><ReplyIcon className="size-3 shrink-0" /><span className="truncate flex-1">{replyContextText}</span><button onClick={onClearReplyContext} className="p-1 hover:bg-surface-l2 rounded-full"><XIcon className="size-3" /></button></div>)}{previews.length > 0 && (<div className="flex flex-wrap gap-2 animate-fade-in-up">{previews.map((src, i) => (<div key={i} className="relative group size-16 rounded-xl border border-border overflow-hidden bg-surface-l1 shadow-sm">{src === 'file' ? (<div className="w-full h-full flex items-center justify-center text-[10px] p-1 text-center truncate bg-surface-l2 text-foreground font-medium">{attachedFiles[i]?.name}</div>) : (<img src={src} className="w-full h-full object-cover" alt="" />)}<button onClick={() => { setAttachedFiles(prev => prev.filter((_, idx) => idx !== i)); setPreviews(prev => prev.filter((_, idx) => idx !== i)); }} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 shadow-md transition-transform active:scale-90"><XIcon className="size-3" /></button></div>))}</div>)}</div>)}
      <div className="bg-white dark:bg-[#1f1f1f] rounded-[1.75rem] border border-gray-200 dark:border-[#27272a] flex items-end gap-2 p-2 relative shadow-lg">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center size-10 rounded-full cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0 mb-0.5"><input type="file" ref={fileInputRef} onChange={(e) => e.target.files && handleFiles(e.target.files)} className="hidden" multiple /><PaperclipIcon className="size-5 text-muted-foreground" /></button>
        <textarea ref={textareaRef} value={text} onChange={(e) => onTextChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder="Ask KIPP anything..." className="flex-1 bg-transparent outline-none text-foreground placeholder-muted-foreground text-[16px] py-2.5 px-1 resize-none max-h-[200px]" rows={1} />
        <div className="flex items-center justify-center size-10 flex-shrink-0 mb-0.5">{isLoading ? (<button onClick={onAbortGeneration} className="size-8 flex items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"><div className="size-3 bg-current rounded-sm"></div></button>) : (<button onClick={handleSend} disabled={!hasContent} className={`flex items-center justify-center size-8 rounded-full transition-all ${hasContent ? 'bg-foreground text-background scale-110' : 'bg-transparent text-muted-foreground opacity-30 cursor-default'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-[2.5]"><path d="m5 12 7-7 7 7" stroke="currentColor"></path><path d="M12 19V5" stroke="currentColor"></path></svg></button>)}</div>
      </div>
    </div>
  );
});
ChatInput.displayName = 'ChatInput';

// --- Chat Message ---
const textToHtml = (text: string): string => {
    if (!text) return '';
    const placeholders: { [key:string]: string } = {}; let placeholderId = 0; const mathRegex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\(.+?\\\)|(\$[^\$\n\r]+?\$))/g;
    const textWithPlaceholders = text.replace(mathRegex, (match) => { const id = `__KIPP_PLACEHOLDER_${placeholderId++}__`; placeholders[id] = match; return id; });
    let html = marked.parse(textWithPlaceholders, { breaks: true, gfm: true }) as string;
    for (const id in placeholders) { html = html.replace(id, placeholders[id]); }
    return html;
};

const GallerySearchLoader: React.FC<{ query: string, onOpenLightbox: (images: any[], index: number) => void }> = ({ query, onOpenLightbox }) => {
    const [images, setImages] = useState<any[]>([]); const [loading, setLoading] = useState(true);
    useEffect(() => { const fetchImages = async () => { try { setLoading(true); const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageSearchQuery: query }) }); const data = await res.json(); if (data.images && Array.isArray(data.images)) { setImages(data.images.map((url: string) => ({ url, alt: query }))); } } catch (e) {} finally { setLoading(false); } }; if (query) fetchImages(); }, [query]);
    if (loading) return (<div className="grid grid-cols-3 gap-1.5 my-2 max-w-xl">{[1,2,3].map(i => <div key={i} className="aspect-square bg-surface-l2 animate-pulse rounded-lg" />)}</div>);
    if (images.length === 0) return null;
    return <ImageGallery images={images} onImageClick={(i) => onOpenLightbox(images, i)} />;
}
const SearchStatus: React.FC<{ sources?: GroundingChunk[], resultCount?: number }> = ({ sources, resultCount }) => {
    const [step, setStep] = useState(0); useEffect(() => { if (sources && sources.length > 0) setStep(1); }, [sources]);
    return (<div className="flex flex-col gap-1 cursor-crosshair text-sm mb-4 animate-fade-in-up"><div className="flex flex-row items-center gap-2 cursor-pointer hover:opacity-80"><div className="flex flex-row items-center gap-2 text-foreground"><SearchIcon className={`size-4 ${step === 0 ? 'animate-pulse text-accent-blue' : 'text-muted-foreground'}`} /><div className={step === 0 ? 'font-medium' : 'text-muted-foreground'}>Searching the web</div></div>{step === 1 && (<div className="text-muted-foreground text-xs font-mono ml-1">{resultCount && resultCount > 0 ? <>{resultCount} results</> : `${sources?.length || 0} sources`}</div>)}</div>{step === 1 && sources && sources.length > 0 && (<div className="flex flex-row items-center gap-2 cursor-pointer hover:opacity-80 animate-fade-in-up"><div className="flex flex-row items-center gap-2 text-foreground"><div className="size-4 rounded-full bg-accent-blue/10 flex items-center justify-center"><div className="size-2 bg-accent-blue rounded-full animate-pulse"></div></div><div className="font-medium">Browsing</div></div><div className="text-muted-foreground text-xs truncate max-w-[200px]">{'web' in sources[0] ? sources[0].web.uri : (sources[0] as any).maps.uri}</div></div>)}</div>);
};

const ChatMessage: React.FC<{ message: Message; onRegenerate: (messageId: string) => void; onFork: (messageId: string) => void; isLoading: boolean; aiStatus: AIStatus; executionResults: Record<string, ExecutionResult>; onStoreExecutionResult: (messageId: string, partIndex: number, result: ExecutionResult) => void; onFixRequest: (code: string, lang: string, error: string) => void; onStopExecution: () => void; isPythonReady: boolean; t: (key: string) => string; onOpenLightbox: (images: any[], startIndex: number) => void; isLast: boolean; onSendSuggestion: (text: string) => void; }> = ({ message, onRegenerate, onFork, isLoading, aiStatus, executionResults, onStoreExecutionResult, onFixRequest, onStopExecution, isPythonReady, t, onOpenLightbox, isLast, onSendSuggestion }) => {
    const isUser = message.type === MessageType.USER; const isError = message.type === MessageType.ERROR; const [isThinkingOpen, setIsThinkingOpen] = useState(false); const [isCopied, setIsCopied] = useState(false);
    useEffect(() => { if (aiStatus === 'thinking' && isLast) setIsThinkingOpen(true); }, [aiStatus, isLast]);
    const messageText = useMemo(() => typeof message.content === 'string' ? message.content : '', [message.content]);
    const { parsedThinkingText, parsedResponseText, hasThinkingTag, suggestions } = useMemo(() => {
        if (isUser) return { parsedThinkingText: null, parsedResponseText: messageText, hasThinkingTag: false, suggestions: [] };
        let text = messageText || ''; let extractedSuggestions: string[] = [];
        const suggestionsMatch = text.match(/<suggestions>(.*?)<\/suggestions>/s); if (suggestionsMatch) { try { extractedSuggestions = JSON.parse(suggestionsMatch[1]); } catch (e) {} text = text.replace(/<suggestions>.*?<\/suggestions>/s, '').trim(); }
        const thinkingMatch = text.match(/<thinking>([\s\S]*?)(?:<\/thinking>|$)/); let thinking = null; let response = text; let hasTag = false;
        if (text.includes('<thinking>')) { hasTag = true; if (thinkingMatch) { thinking = thinkingMatch[1].trim(); if (text.includes('</thinking>')) { response = text.split('</thinking>')[1]?.trim() || ''; } else { response = ''; } } }
        return { parsedThinkingText: thinking, parsedResponseText: response, hasThinkingTag: hasTag, suggestions: extractedSuggestions };
    }, [messageText, isUser]);

    const renderableContent = useMemo(() => {
        const textToRender = parsedResponseText; if (!textToRender) return [];
        const blockRegex = /(```[\w\s\S]*?```|!gallery\[".*?"\])/g; let finalParts: any[] = []; let partIndex = 0;
        textToRender.split(blockRegex).filter(Boolean).forEach(part => {
            if (part.startsWith('```')) { const codeMatch = /```([\w-]+)?(?:[^\n]*)?\n([\s\S]*?)```/.exec(part); if (codeMatch) { const lang = codeMatch[1] || 'plaintext'; const code = codeMatch[2]; if (lang === 'json-gallery') { try { const galleryData = JSON.parse(code); if (galleryData.type === 'image_gallery' && Array.isArray(galleryData.images)) { finalParts.push({ type: 'gallery', images: galleryData.images }); } } catch (e) {} } else { finalParts.push({ type: 'code', lang, code, info: part.split('\n')[0].substring(3).trim(), partIndex: partIndex++ }); } } } 
            else if (part.startsWith('!gallery')) { const match = /!gallery\["(.*?)"\]/.exec(part); if (match && match[1]) finalParts.push({ type: 'gallery-search', query: match[1] }); } 
            else { finalParts.push({ type: 'text', content: part }); }
        });
        return finalParts;
    }, [parsedResponseText]);

    const handleCopy = () => { navigator.clipboard.writeText(parsedResponseText).then(() => { setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }); };
    if (isUser) {
        return (
            <div className="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-4 items-end">
                <div className="message-bubble relative rounded-3xl text-foreground min-h-7 prose dark:prose-invert break-words bg-surface-l1 border border-border max-w-[100%] @sm/mainview:max-w-[90%] px-4 py-2 rounded-br-lg shadow-sm"><div className="whitespace-pre-wrap leading-relaxed text-[16px]">{messageText}</div></div>
                {message.files && message.files.length > 0 && (<div className="flex flex-wrap justify-end gap-2 mt-2">{message.files.map((file, i) => (<div key={i} className="relative group rounded-xl overflow-hidden border border-border">{file.type.startsWith('image/') ? <img src={file.dataUrl} alt={file.name} className="h-20 w-auto object-cover" /> : <div className="h-20 w-20 bg-surface-l2 flex items-center justify-center text-xs text-muted-foreground p-2 text-center break-all">{file.name}</div>}</div>))}</div>)}
                <div className="flex items-center gap-2 mt-1 px-1"><button className="p-1 hover:bg-surface-l2 rounded-full text-muted-foreground hover:text-foreground transition-colors" title={t('chat.message.copy')} onClick={handleCopy}>{isCopied ? <CheckIcon className="size-3.5 text-green-500" /> : <MessageCopyIcon className="size-3.5" />}</button></div>
            </div>
        );
    }
    if (isError) { return (<div className="flex flex-col w-full mb-8 max-w-full"><div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 text-sm">{messageText || "An unknown error occurred."}</div><div className="flex items-center space-x-0 mt-2 text-muted-foreground"><button className="p-1 hover:bg-surface-l2 rounded-full" onClick={() => onRegenerate(message.id)} title={t('chat.message.regenerate')}><MessageRefreshIcon className="size-4" /></button></div></div>); }
    const uiToolCalls = (message.toolCalls || []).filter(tc => tc.name !== 'google_search'); const hasToolCalls = uiToolCalls.length > 0; const hasText = !!parsedResponseText; const hasContent = hasText || hasToolCalls; const isActuallyLastLoading = isLast && isLoading; const showSearchUI = (aiStatus === 'searching' && isActuallyLastLoading) || (message.groundingChunks && message.groundingChunks.length > 0 && isActuallyLastLoading && !hasContent);

    return (
        <div className="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-4 items-start">
             {hasThinkingTag && parsedThinkingText && (<div className="mb-2"><div onClick={() => setIsThinkingOpen(!isThinkingOpen)} className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors w-fit p-1 rounded-lg"><BrainIcon className={`size-4 ${isActuallyLastLoading && aiStatus === 'thinking' ? 'animate-pulse text-accent-blue' : ''}`} /><span className="text-sm font-medium">{t('chat.message.thinking')}</span><ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} /></div>{isThinkingOpen && <div className="mt-2 pl-3 border-l-2 border-border text-muted-foreground text-sm italic whitespace-pre-wrap animate-fade-in-up">{parsedThinkingText}</div>}</div>)}
            {showSearchUI && <SearchStatus sources={message.groundingChunks} resultCount={message.searchResultCount} />}
            <div className={`message-bubble relative rounded-3xl text-foreground prose dark:prose-invert break-words w-full max-w-none px-4 py-2 ${!hasContent ? 'min-h-0 py-0' : 'min-h-7'}`}>
                 {!hasContent && isActuallyLastLoading && !parsedThinkingText && !showSearchUI && (<div className="flex items-center gap-2 text-muted-foreground min-h-[28px]"><GeneratingLoader /></div>)}
                {hasToolCalls && <div className="w-full mb-4 space-y-4">{uiToolCalls.map((toolCall, idx) => <GenerativeUI key={idx} toolName={toolCall.name} args={toolCall.args} />)}</div>}
                {renderableContent.map((part: any, index: number) => {
                    if (part.type === 'code') { const resultKey = `${message.id}_${part.partIndex}`; const result = executionResults[resultKey]; const isPython = part.lang === 'python'; return <div key={index} className="w-full my-4 not-prose"><CodeExecutor code={part.code} lang={part.lang} title={part.lang.toUpperCase()} isExecutable={['python', 'html'].includes(part.lang.toLowerCase())} autorun={isPython && !result} onExecutionComplete={(res) => onStoreExecutionResult(message.id, part.partIndex, res)} onFixRequest={(err) => onFixRequest(part.code, part.lang, err)} persistedResult={result} onStopExecution={onStopExecution} isPythonReady={isPythonReady} isLoading={isLoading} t={t} /></div>; }
                    if (part.type === 'gallery-search') return <GallerySearchLoader key={index} query={part.query} onOpenLightbox={onOpenLightbox} />;
                    if (part.type === 'gallery') return <div key={index} className="my-4"><ImageGallery images={part.images.map((img: string) => ({ url: img, alt: 'Generated Image' }))} onImageClick={(i) => onOpenLightbox(part.images.map((img: string) => ({ url: img, alt: 'Generated Image' })), i)} /></div>;
                    return <div key={index} className="prose dark:prose-invert max-w-none w-full" dangerouslySetInnerHTML={{ __html: textToHtml(part.content) }} />;
                })}
            </div>
            {message.groundingChunks && message.groundingChunks.length > 0 && !isLoading && <div className="mt-2 flex flex-wrap gap-2"><GroundingSources chunks={message.groundingChunks} t={t} /></div>}
            {!isLoading && (
                <div className="flex items-center gap-2 mt-2 w-full justify-start px-2">
                    <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.regenerate')} onClick={() => onRegenerate(message.id)}><MessageRefreshIcon className="size-4" /></button>
                    <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.copy')} onClick={handleCopy}>{isCopied ? <CheckIcon className="size-4 text-green-500" /> : <MessageCopyIcon className="size-4" />}</button>
                    <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.fork')} onClick={() => onFork(message.id)}><GitForkIcon className="size-4" /></button>
                    {message.generationDuration && <span className="ml-2 text-muted-foreground text-xs select-none font-mono">{(message.generationDuration / 1000).toFixed(1)}s</span>}
                </div>
            )}
            {isLast && suggestions.length > 0 && !isLoading && (<div className="mt-4 flex flex-col items-start gap-2 animate-fade-in-up w-full">{suggestions.map((suggestion, idx) => (<button key={idx} onClick={() => onSendSuggestion(suggestion)} className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-9 rounded-xl px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-l2 border border-transparent hover:border-border"><CornerDownRightIcon className="size-3.5 text-muted-foreground" /><span className="truncate max-w-[300px]">{suggestion}</span></button>))}</div>)}
        </div>
    );
};

// ==========================================
// 10. MAIN APP
// ==========================================

const OneFileApp: React.FC = () => {
  const [isPythonReady, setIsPythonReady] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([{ id: 'persona-doc', name: 'Doctor', instruction: 'You are a helpful medical assistant.' }, { id: 'persona-eng', name: 'Engineer', instruction: 'You are a senior software engineer.' }, { id: 'persona-teach', name: 'Teacher', instruction: 'You are a friendly and patient teacher.' }]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>('idle');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState<any>('en');
  const [userLocation, setUserLocation] = useState<LocationInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [executionResults, setExecutionResults] = useState<Record<string, any>>({});
  const [chatInputText, setChatInputText] = useState('');
  const [replyContextText, setReplyContextText] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: any[]; startIndex: number; } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const { t } = useTranslations(language);

  // Initial Setup
  useEffect(() => {
    if (window.innerWidth >= 1024) setIsSidebarOpen(true);
    const savedConvos = localStorage.getItem('conversations');
    let loadedConvos: Conversation[] = [];
    if (savedConvos) { loadedConvos = JSON.parse(savedConvos); setConversations(loadedConvos); }
    const params = new URLSearchParams(window.location.search);
    const chatId = params.get('c');
    if (chatId && loadedConvos.some(c => c.id === chatId)) { setActiveConversationId(chatId); }
    const hasSeenWelcome = localStorage.getItem('welcome_seen');
    if (!hasSeenWelcome) setShowWelcome(true);
    // Simulate Python ready (worker loaded via service)
    setTimeout(() => setIsPythonReady(true), 2000);
  }, []);

  useEffect(() => { localStorage.setItem('conversations', JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => { const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', isDark); }, [theme]);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const currentParam = params.get('c'); if (activeConversationId) { if (activeConversationId !== currentParam) { const newUrl = `${window.location.pathname}?c=${activeConversationId}`; window.history.pushState({ path: newUrl }, '', newUrl); } } else if (currentParam) { const newUrl = window.location.pathname; window.history.pushState({ path: newUrl }, '', newUrl); } }, [activeConversationId]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (!isDragging) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === e.target) setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) chatInputRef.current?.handleFiles(e.dataTransfer.files); };
  
  const handleSendMessage = useCallback(async (text: string, attachments: File[] = []) => {
    if (!text.trim() && attachments.length === 0) return;
    let currentConvoId = activeConversationId;
    const fileAttachments: FileAttachment[] = await Promise.all(attachments.map(async file => { const reader = new FileReader(); const dataUrl = await new Promise<string>((resolve) => { reader.onload = (e) => resolve(e.target?.result as string); reader.readAsDataURL(file); }); return { name: file.name, type: file.type, size: file.size, dataUrl }; }));
    const newUserMsg: Message = { id: Date.now().toString(), type: MessageType.USER, content: text, files: fileAttachments };
    const aiMsgId = (Date.now() + 1).toString();
    let history: Message[] = [];
    setConversations(prev => {
        let conversationsCopy = [...prev];
        let convo = conversationsCopy.find(c => c.id === currentConvoId);
        if (!convo) { convo = { id: Date.now().toString(), title: text.slice(0, 40) || 'New Conversation', messages: [], createdAt: new Date().toISOString() }; conversationsCopy = [convo, ...conversationsCopy]; currentConvoId = convo.id; setActiveConversationId(convo.id); }
        history = [...convo.messages];
        convo.messages.push(newUserMsg, { id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' });
        return conversationsCopy;
    });
    setIsLoading(true); setAiStatus('thinking');
    const abort = new AbortController(); abortControllerRef.current = abort;
    await streamMessageToAI(history, text, attachments, undefined, userLocation, language, abort.signal, (update) => {
        setConversations(prev => prev.map(c => {
            if (c.id === currentConvoId) {
                const messages = [...c.messages]; const idx = messages.findIndex(m => m.id === aiMsgId);
                if (idx !== -1) {
                    if (update.type === 'chunk') { setAiStatus('generating'); messages[idx].content += update.payload; }
                    else if (update.type === 'searching') setAiStatus('searching');
                    else if (update.type === 'sources') messages[idx].groundingChunks = update.payload;
                    else if (update.type === 'search_result_count') messages[idx].searchResultCount = update.payload;
                    else if (update.type === 'tool_call') { 
                        const existingToolCalls = messages[idx].toolCalls || []; 
                        messages[idx].toolCalls = [...existingToolCalls, update.payload]; 
                    }
                }
                return { ...c, messages };
            }
            return c;
        }));
    }, () => { setIsLoading(false); setAiStatus('idle'); }, () => { setIsLoading(false); setAiStatus('error'); });
  }, [activeConversationId, userLocation, language]);

  const handleRegenerate = useCallback(async (messageId: string) => {
    if (!activeConversationId || isLoading) return;
    const convo = conversations.find(c => c.id === activeConversationId); if (!convo) return;
    const msgIndex = convo.messages.findIndex(m => m.id === messageId); if (msgIndex === -1) return;
    let historyToKeep: Message[] = []; let lastUserMessage: Message | null = null;
    if (convo.messages[msgIndex].type === MessageType.AI_RESPONSE) { historyToKeep = convo.messages.slice(0, msgIndex); lastUserMessage = historyToKeep[historyToKeep.length - 1]; } 
    else if (convo.messages[msgIndex].type === MessageType.USER) { historyToKeep = convo.messages.slice(0, msgIndex); lastUserMessage = convo.messages[msgIndex]; }
    if (!lastUserMessage || lastUserMessage.type !== MessageType.USER) return;
    const aiMsgId = (Date.now() + 1).toString();
    setConversations(prev => prev.map(c => {
        if (c.id === activeConversationId) {
            const newMessages = convo.messages[msgIndex].type === MessageType.AI_RESPONSE ? [...convo.messages.slice(0, msgIndex), { id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' }] : [...convo.messages.slice(0, msgIndex + 1), { id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' }];
            return { ...c, messages: newMessages };
        }
        return c;
    }));
    setIsLoading(true); setAiStatus('thinking');
    const abort = new AbortController(); abortControllerRef.current = abort;
    const apiHistory = historyToKeep.slice(0, historyToKeep.length - 1);
    const messageText = typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '';
    await streamMessageToAI(apiHistory, messageText, [], undefined, userLocation, language, abort.signal, (update) => {
        setConversations(prev => prev.map(c => {
            // FIX: Replaced currentConvoId with activeConversationId which is available in the closure
            if (c.id === activeConversationId) {
                const messages = [...c.messages]; const idx = messages.findIndex(m => m.id === aiMsgId);
                if (idx !== -1) {
                    if (update.type === 'chunk') { setAiStatus('generating'); messages[idx].content += update.payload; }
                    else if (update.type === 'searching') setAiStatus('searching');
                    else if (update.type === 'sources') messages[idx].groundingChunks = update.payload;
                    else if (update.type === 'search_result_count') messages[idx].searchResultCount = update.payload;
                    else if (update.type === 'tool_call') { 
                        const existingToolCalls = messages[idx].toolCalls || []; 
                        messages[idx].toolCalls = [...existingToolCalls, update.payload]; 
                    }
                }
                return { ...c, messages };
            }
            return c;
        }));
    }, () => { setIsLoading(false); setAiStatus('idle'); }, () => { setIsLoading(false); setAiStatus('error'); });
  }, [activeConversationId, conversations, userLocation, language, isLoading]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className="h-full w-full relative">
        {isDragging && <DragDropOverlay t={t} />}
        <AppShell isSidebarOpen={isSidebarOpen}>
            <Sidebar isOpen={isSidebarOpen} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} conversations={conversations} activeConversationId={activeConversationId} onNewChat={() => { setActiveConversationId(null); setChatInputText(''); const newUrl = window.location.pathname; window.history.pushState({ path: newUrl }, '', newUrl); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} onSelectConversation={(id) => { setActiveConversationId(id); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} onDeleteConversation={(id) => setConversations(prev => prev.filter(c => c.id !== id))} onOpenSettings={() => setIsSettingsOpen(true)} t={t} />
            <ContentArea isPushed={isSidebarOpen}>
                {!isSidebarOpen && (<button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-[70] size-12 rounded-full bg-white dark:bg-white/10 backdrop-blur-2xl border border-white/10 flex flex-col items-center justify-center gap-1.5 shadow-2xl transition-all"><div className="w-5 h-[2.5px] bg-foreground rounded-full"></div><div className="w-5 h-[2.5px] bg-foreground rounded-full"></div></button>)}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-48 scrollbar-none"><div className="max-w-3xl mx-auto flex flex-col min-h-full">{(!activeConversation || activeConversation.messages.length === 0) ? (<div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-fade-in-up"><GreetingMessage /></div>) : (activeConversation.messages.map((msg, index) => (<ChatMessage key={msg.id} message={msg} onRegenerate={handleRegenerate} onFork={() => {}} isLoading={isLoading && index === activeConversation.messages.length - 1} aiStatus={aiStatus} executionResults={executionResults} onStoreExecutionResult={(msgId, partIdx, res) => setExecutionResults(prev => ({...prev, [`${msgId}_${partIdx}`]: res}))} onFixRequest={() => {}} onStopExecution={() => stopPythonExecution()} isPythonReady={isPythonReady} t={t} onOpenLightbox={(imgs, idx) => setLightboxState({ images: imgs, startIndex: idx })} isLast={index === activeConversation.messages.length - 1} onSendSuggestion={handleSendMessage} />)))}</div></div>
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent z-20"><div className="max-w-3xl mx-auto"><ChatInput ref={chatInputRef} text={chatInputText} onTextChange={setChatInputText} onSendMessage={handleSendMessage} isLoading={isLoading} t={t} onAbortGeneration={() => abortControllerRef.current?.abort()} replyContextText={replyContextText} onClearReplyContext={() => setReplyContextText(null)} language={language} /></div></div>
                <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} conversations={conversations} setConversations={setConversations} t={t} />
                {lightboxState && <Lightbox images={lightboxState.images} startIndex={lightboxState.startIndex} onClose={() => setLightboxState(null)} />}
                {showWelcome && (<WelcomeModal onComplete={() => { setShowWelcome(false); localStorage.setItem('welcome_seen', 'true'); }} onLocationUpdate={(loc, lang) => { setUserLocation(loc); if(lang) setLanguage(lang); }} t={t} />)}
            </ContentArea>
        </AppShell>
    </div>
  );
};

export default OneFileApp;
