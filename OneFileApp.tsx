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
        workspace: { title: 'Ο Ψηφιακός σας Χώρος', description: 'Η διεπαφή έχει σχεδιαστεί για να εξαφανίζεται, ώστε οι ιδέες σας να βρίσκονται στο επίκεντρο.', sidebar: 'Ιστορικό & Εξατομίκευση', sidebar_desc: 'Πρόσβαση στις προηγούμενες σκέψεις σας και προσαρμογή του AI στα αριστεέρ.', input: 'Πολυτροπική Είσοδος', input_desc: 'Σύρετε αρχεία, ηχογραφήστε φωνή ή επικολλήστε κώδικα. Το KIPP τα χειρίζεται όλα.', },
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
const SettingsIcon: React.FC<IconProps> = ({ className }) => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path><circle cx="12" cy="12" r="3"></circle></svg>);
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
  if (len >= 4) { const visibleImages = images.slice(0, 4); const hiddenCount = images.length - 4; return (<div className="not-prose my-2 grid grid-cols-2 gap-1.5 max-w-md">{visibleImages.map((image, index) => { const overlay = index ===