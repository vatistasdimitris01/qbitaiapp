import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Message, FileAttachment, Conversation, Persona, LocationInfo, AIStatus } from './types';
import { MessageType } from './types';
import ChatInput, { ChatInputHandle } from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import LocationBanner from './components/LocationBanner';
import CodeAnalysisModal from './components/CodeAnalysisModal';
import SelectionPopup from './components/SelectionPopup';
import DragDropOverlay from './components/DragDropOverlay';
import Lightbox from './components/Lightbox';
import GreetingMessage from './components/GreetingMessage';
import { useTranslations } from './hooks/useTranslations';
import { streamMessageToAI } from './services/geminiService';
import { pythonExecutorReady, stopPythonExecution } from './services/pythonExecutorService';
import { translations } from './translations';
import { LayoutGridIcon, ChevronDownIcon } from './components/icons';

type Language = keyof typeof translations;

const isLanguage = (lang: any): lang is Language => {
  return typeof lang === 'string' && lang in translations;
};

const initialPersonas: Persona[] = [
  { id: 'persona-doc', name: 'Doctor', instruction: 'You are a helpful medical assistant providing information. You are not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.' },
  { id: 'persona-eng', name: 'Engineer', instruction: 'You are a senior software engineer. Provide clear, concise, and technically accurate answers. Use code examples in markdown format when appropriate. Be direct and to the point.' },
  { id: 'persona-teach', name: 'Teacher', instruction: 'You are a friendly and patient teacher. Explain concepts clearly and simply, as if you are talking to a student. Use analogies and examples to make topics understandable.' },
];

type ExecutionResult = {
  output: string | null;
  error: string;
  type: 'string' | 'image-base64' | 'plotly-json' | 'error';
  downloadableFile?: { filename: string; mimetype: string; data: string; };
};

const useDebouncedEffect = (effect: () => void, deps: React.DependencyList, delay: number) => {
    useEffect(() => {
        const handler = setTimeout(() => effect(), delay);
        return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, delay]);
};

const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const GREETINGS = [
    "What are you working on?",
    "Where should we begin?",
    "Hey, Ready to dive in?",
    "What’s on your mind today?",
    "Ready when you are.",
    "What’s on the agenda today?",
    "Good to see you!",
    "How can I help?",
];

const getRandomGreeting = () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)];

// Helper to remove large data (like base64 images) before saving to local storage
const sanitizeForStorage = (conversations: Conversation[]): Conversation[] => {
    return conversations.map(convo => ({
        ...convo,
        messages: convo.messages.map(msg => ({
            ...msg,
            // If files exist, keep metadata but strip huge dataUrl content to save space
            files: msg.files?.map(f => ({
                ...f,
                dataUrl: f.dataUrl.length > 50000 ? '' : f.dataUrl // Truncate large dataUrls
            }))
        }))
    }));
};

const safeLocalStorageSetItem = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.error(`Failed to save ${key} to localStorage:`, e);
    }
};


const App: React.FC = () => {
  const [isPythonReady, setIsPythonReady] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>('idle');
  
  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Default logic handled in useEffect
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState<Language>('en');
  const [userLocation, setUserLocation] = useState<LocationInfo | null>(null);
  const [appHeight, setAppHeight] = useState(window.innerHeight);
  
  const [analysisModalContent, setAnalysisModalContent] = useState<{ code: string; lang: string } | null>(null);
  const [executionResults, setExecutionResults] = useState<Record<string, ExecutionResult>>({});
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const [chatInputText, setChatInputText] = useState('');
  const [replyContextText, setReplyContextText] = useState<string | null>(null);
  const [selectionPopup, setSelectionPopup] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxState, setLightboxState] = useState<{
    images: { url: string; alt: string; source?: string }[];
    startIndex: number;
  } | null>(null);
  const [greeting, setGreeting] = useState(getRandomGreeting());


  const mainContentRef = useRef<HTMLElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const dragCounter = useRef(0);
  const { t, setLang, lang } = useTranslations(language);

  // Set initial sidebar state based on screen width - default closed (rail) for desktop
  useEffect(() => {
    // If user preference exists, could load here. Default to true (expanded) for desktop if space allows? 
    // The prompt implied it starts "closed" as icons. Let's initialize false (collapsed rail) for desktop.
    // For mobile, false means hidden.
    if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true); // Default open on large screens
    }
  }, []);

  const checkPythonReady = useCallback(() => {
    pythonExecutorReady().then(() => {
        console.log('Python worker environment ready.');
        if (!isPythonReady) setIsPythonReady(true);
    }).catch(e => {
        console.error('Failed to prepare Python worker environment:', e);
        if (isPythonReady) setIsPythonReady(false);
    });
  }, [isPythonReady]);

  useEffect(() => {
    checkPythonReady();
  }, [checkPythonReady]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
        const handleControllerChange = () => { window.location.reload(); };
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
        const registerServiceWorker = async () => {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                registration.onupdatefound = () => {
                    const installingWorker = registration.installing;
                    if (installingWorker) {
                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                installingWorker.postMessage({ type: 'SKIP_WAITING' });
                            }
                        };
                    }
                };
            } catch (error) { console.error('Service worker registration failed:', error); }
        };
        window.addEventListener('load', registerServiceWorker);
        return () => {
            window.removeEventListener('load', registerServiceWorker);
            navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        };
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setAppHeight(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleSelection = () => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.toString().trim().length < 3) {
            setSelectionPopup(null);
            return;
        }
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as HTMLElement;
            if (element && mainContentRef.current?.contains(element) && !element.closest('textarea, input, [contenteditable="true"], .selection-popup-container')) {
                const rect = range.getBoundingClientRect();
                setSelectionPopup({ visible: true, x: rect.left + rect.width / 2, y: rect.top, text: selection.toString().trim() });
            } else { setSelectionPopup(null); }
        }
    }
    const handleMouseUp = () => setTimeout(handleSelection, 10);
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); dragCounter.current++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);
  const handleDragOver = useCallback((e: DragEvent) => { e.preventDefault(); e.stopPropagation(); }, []);
  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false); dragCounter.current = 0;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) chatInputRef.current?.handleFiles(files);
  }, []);

  useEffect(() => {
    try {
        const savedConvos = localStorage.getItem('conversations');
        const savedActiveId = localStorage.getItem('activeConversationId');
        const savedPersonas = localStorage.getItem('personas');
        const savedTheme = localStorage.getItem('theme');
        const savedLang = localStorage.getItem('language');
        const savedResults = localStorage.getItem('executionResults');

        const loadedConvos = savedConvos ? JSON.parse(savedConvos) : [];
        setConversations(loadedConvos);
        if (savedPersonas) setPersonas(JSON.parse(savedPersonas)); else setPersonas(initialPersonas);
        if (savedTheme) setTheme(savedTheme); else setTheme('dark');
        if (savedLang && isLanguage(savedLang)) setLanguage(savedLang);
        if (savedResults) setExecutionResults(JSON.parse(savedResults));
        
        if (savedActiveId && loadedConvos.some((c: Conversation) => c.id === savedActiveId)) {
            setActiveConversationId(savedActiveId);
        } else {
            setActiveConversationId(null);
        }
    } catch (error) {
        console.error("Error loading state from localStorage:", error);
    }
  }, []);

  useDebouncedEffect(() => {
      const sanitized = sanitizeForStorage(conversations);
      safeLocalStorageSetItem('conversations', JSON.stringify(sanitized));
  }, [conversations], 1000);

  useDebouncedEffect(() => {
      safeLocalStorageSetItem('executionResults', JSON.stringify(executionResults));
  }, [executionResults], 1000);

  useEffect(() => {
    if (activeConversationId) safeLocalStorageSetItem('activeConversationId', activeConversationId);
    else localStorage.removeItem('activeConversationId');
  }, [activeConversationId]);

  useEffect(() => safeLocalStorageSetItem('personas', JSON.stringify(personas)), [personas]);

  useEffect(() => {
    safeLocalStorageSetItem('theme', theme);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      document.documentElement.classList.toggle('dark', isDark);
    };
    applyTheme();
    const handleSystemThemeChange = () => { if (theme === 'system') applyTheme(); };
    mediaQuery.addEventListener('change', handleSystemThemeChange);
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange);
  }, [theme]);
  
  useEffect(() => {
    safeLocalStorageSetItem('language', language);
    setLang(language);
  }, [language, setLang]);

  const activeConversation = useMemo(() => {
    if (!activeConversationId) return undefined;
    return conversations.find(c => c.id === activeConversationId);
  }, [conversations, activeConversationId]);

  useEffect(() => {
    if (activeConversation?.title && activeConversation.title !== t('sidebar.newChat')) {
      document.title = `Qbit - ${activeConversation.title}`;
    } else {
      document.title = 'Qbit - AI Chat Assistant';
    }
  }, [activeConversation, t]);

  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    if (mainContentRef.current) mainContentRef.current.scrollTo({ top: mainContentRef.current.scrollHeight, behavior });
  }, []);

  const handleScrollToBottomClick = () => scrollToBottom('smooth');
  const handleScroll = useCallback(() => {
      const main = mainContentRef.current;
      if (main) {
          // Show if user has scrolled up more than 1000px from the bottom
          const distanceFromBottom = main.scrollHeight - main.scrollTop - main.clientHeight;
          setShowScrollToBottom(distanceFromBottom > 1000);
      }
  }, []);

  const handleNewChat = useCallback(() => {
    const newConvo: Conversation = {
        id: Date.now().toString(),
        title: t('sidebar.newChat'),
        messages: [],
        createdAt: new Date().toISOString(),
        greeting: getRandomGreeting(),
    };
    setConversations(prev => [newConvo, ...prev]);
    setActiveConversationId(newConvo.id);
    setChatInputText('');
    setReplyContextText(null);
    setAiStatus('idle');
    chatInputRef.current?.focus();
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  }, [t]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
    // Clean up status
    setAiStatus('idle');
    setIsLoading(false);
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConversationId === id) {
        setActiveConversationId(null);
    }
  }, [activeConversationId]);

  const handleAbortGeneration = useCallback(() => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
        setIsLoading(false);
        setAiStatus('idle');
    }
  }, []);

  const handleSendMessage = useCallback(async (text: string, attachments: File[] = []) => {
    if (!text.trim() && attachments.length === 0) return;
    
    let currentConvoId = activeConversationId;
    let currentConvo = conversations.find(c => c.id === currentConvoId);

    if (!currentConvoId || !currentConvo) {
        const newConvo: Conversation = {
            id: Date.now().toString(),
            title: text.slice(0, 30) || t('sidebar.newChat'),
            messages: [],
            createdAt: new Date().toISOString(),
            greeting: getRandomGreeting(),
        };
        setConversations(prev => [newConvo, ...prev]);
        currentConvoId = newConvo.id;
        currentConvo = newConvo;
        setActiveConversationId(newConvo.id);
    }

    const processedAttachments: FileAttachment[] = [];
    for (const file of attachments) {
        processedAttachments.push({
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl: await fileToDataURL(file)
        });
    }

    const newUserMessage: Message = {
        id: Date.now().toString(),
        type: MessageType.USER,
        content: text,
        files: processedAttachments,
    };

    // Update conversation with user message
    setConversations(prev => prev.map(c => {
        if (c.id === currentConvoId) {
            const title = (c.messages.length === 0 && c.title === t('sidebar.newChat')) 
                ? text.slice(0, 40) 
                : c.title;
            return { ...c, title, messages: [...c.messages, newUserMessage] };
        }
        return c;
    }));

    setIsLoading(true);
    setAiStatus('thinking');
    setTimeout(() => scrollToBottom('smooth'), 100);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const aiMessageId = (Date.now() + 1).toString();
    setConversations(prev => prev.map(c => {
        if (c.id === currentConvoId) {
            return { 
                ...c, 
                messages: [...c.messages, { id: aiMessageId, type: MessageType.AI_RESPONSE, content: '' }] 
            };
        }
        return c;
    }));

    const history = currentConvo.messages;
    const personaInstruction = currentConvo?.personaId ? personas.find(p => p.id === currentConvo.personaId)?.instruction : undefined;

    await streamMessageToAI(
        history,
        text,
        attachments,
        personaInstruction,
        userLocation,
        language,
        abortController.signal,
        (update) => {
            setConversations(prev => prev.map(c => {
                if (c.id === currentConvoId) {
                    const messages = [...c.messages];
                    const msgIndex = messages.findIndex(m => m.id === aiMessageId);
                    if (msgIndex === -1) return c;

                    const msg = messages[msgIndex];
                    
                    if (update.type === 'chunk') {
                        setAiStatus('generating');
                        msg.content = (msg.content as string) + update.payload;
                    } else if (update.type === 'usage') {
                        msg.usageMetadata = update.payload;
                    } else if (update.type === 'sources') {
                         msg.groundingChunks = update.payload;
                    } else if (update.type === 'searching') {
                        setAiStatus('searching');
                    } else if (update.type === 'tool_call') {
                        if (!msg.toolCalls) msg.toolCalls = [];
                        msg.toolCalls.push(update.payload);
                    }
                    
                    messages[msgIndex] = { ...msg };
                    return { ...c, messages };
                }
                return c;
            }));
            scrollToBottom('smooth');
        },
        (duration) => {
            setConversations(prev => prev.map(c => {
                if (c.id === currentConvoId) {
                     const messages = [...c.messages];
                     const msgIndex = messages.findIndex(m => m.id === aiMessageId);
                     if (msgIndex !== -1) {
                         messages[msgIndex] = { ...messages[msgIndex], generationDuration: duration };
                     }
                     return { ...c, messages };
                }
                return c;
            }));
            setIsLoading(false);
            setAiStatus('idle');
            abortControllerRef.current = null;
        },
        (errorMsg) => {
             setConversations(prev => prev.map(c => {
                if (c.id === currentConvoId) {
                     const messages = [...c.messages];
                     const msgIndex = messages.findIndex(m => m.id === aiMessageId);
                     if (msgIndex !== -1) {
                         if ((messages[msgIndex].content as string).length === 0) {
                             messages[msgIndex] = { ...messages[msgIndex], type: MessageType.ERROR, content: errorMsg };
                         } else {
                             messages[msgIndex] = { ...messages[msgIndex], content: (messages[msgIndex].content as string) + `\n\n[Error: ${errorMsg}]` };
                         }
                     }
                     return { ...c, messages };
                }
                return c;
            }));
            setIsLoading(false);
            setAiStatus('error');
            abortControllerRef.current = null;
        }
    );
  }, [activeConversationId, conversations, personas, userLocation, language, t, scrollToBottom]);

  const handleRegenerate = useCallback((messageId: string) => {
    const convo = activeConversation;
    if (!convo) return;
    
    const msgIndex = convo.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    let targetUserMsgIndex = -1;
    if (convo.messages[msgIndex].type === MessageType.AI_RESPONSE || convo.messages[msgIndex].type === MessageType.ERROR) {
         for (let i = msgIndex - 1; i >= 0; i--) {
             if (convo.messages[i].type === MessageType.USER) {
                 targetUserMsgIndex = i;
                 break;
             }
         }
    } else {
        targetUserMsgIndex = msgIndex;
    }

    if (targetUserMsgIndex !== -1) {
        const userMsg = convo.messages[targetUserMsgIndex];
        const text = userMsg.content as string;
        const updatedMessages = convo.messages.slice(0, targetUserMsgIndex);
        
        setConversations(prev => prev.map(c => {
            if(c.id === convo.id) return { ...c, messages: updatedMessages };
            return c;
        }));
        
        // We re-send the text. Re-attaching files is skipped for simplicity here, assuming they are processed in handleSendMessage context if provided.
        // If files are needed, one would need to reconstruct File objects or adapt logic to reuse existing Attachment data URLs.
        handleSendMessage(text, []); 
    }
  }, [activeConversation, handleSendMessage, conversations]);

  const handleFork = useCallback((messageId: string) => {
    const convo = activeConversation;
    if (!convo) return;
    
    const msgIndex = convo.messages.findIndex(m => m.id === messageId);
    if (msgIndex === -1) return;

    const newMessages = convo.messages.slice(0, msgIndex + 1);
    const newConvo: Conversation = {
        id: Date.now().toString(),
        title: t('sidebar.forkedChatTitle', { oldTitle: convo.title }),
        messages: newMessages,
        createdAt: new Date().toISOString(),
        greeting: getRandomGreeting(),
        personaId: convo.personaId
    };
    
    setConversations(prev => [newConvo, ...prev]);
    setActiveConversationId(newConvo.id);
  }, [activeConversation, t]);

  const handleStoreExecutionResult = useCallback((messageId: string, partIndex: number, result: ExecutionResult) => {
    const key = `${messageId}_${partIndex}`;
    setExecutionResults(prev => ({ ...prev, [key]: result }));
  }, []);

  const handleFixRequest = useCallback((code: string, lang: string, error: string) => {
    const prompt = `I encountered an error with the following ${lang} code:\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\nError:\n${error}\n\nPlease fix the code.`;
    handleSendMessage(prompt);
  }, [handleSendMessage]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans selection:bg-accent-blue/20 selection:text-foreground">
        <Sidebar
            isOpen={isSidebarOpen}
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onNewChat={handleNewChat}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={handleDeleteConversation}
            onOpenSettings={() => setIsSettingsOpen(true)}
            t={t}
        />
        
        <main 
            ref={mainContentRef}
            className={`flex-1 flex flex-col h-full relative transition-all duration-200 ease-linear
                ${isSidebarOpen ? 'lg:ml-[260px]' : 'lg:ml-[60px]'}
                bg-background w-full
            `}
            onScroll={handleScroll}
            onDragEnter={handleDragEnter as any} 
            onDragOver={handleDragOver as any} 
            onDragLeave={handleDragLeave as any} 
            onDrop={handleDrop as any}
        >
            <LocationBanner onLocationUpdate={(loc, detectedLang) => {
                setUserLocation(loc);
                if (detectedLang && isLanguage(detectedLang) && language === 'en') {
                     setLanguage(detectedLang);
                }
            }} t={t} />

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent p-4 md:p-6 pb-44">
                <div className="max-w-3xl mx-auto flex flex-col min-h-full">
                     {(!activeConversation || activeConversation.messages.length === 0) ? (
                        <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-fade-in-up">
                            <GreetingMessage text={activeConversation?.greeting || greeting} />
                        </div>
                     ) : (
                         activeConversation.messages.map((msg, index) => (
                             <ChatMessage
                                 key={msg.id}
                                 message={msg}
                                 onRegenerate={handleRegenerate}
                                 onFork={handleFork}
                                 isLoading={isLoading && index === activeConversation.messages.length - 1}
                                 aiStatus={aiStatus}
                                 onShowAnalysis={(code, lang) => setAnalysisModalContent({ code, lang })}
                                 executionResults={executionResults}
                                 onStoreExecutionResult={handleStoreExecutionResult}
                                 onFixRequest={handleFixRequest}
                                 onStopExecution={() => stopPythonExecution()}
                                 isPythonReady={isPythonReady}
                                 t={t}
                                 onOpenLightbox={(images, startIdx) => setLightboxState({ images, startIndex: startIdx })}
                                 isLast={index === activeConversation.messages.length - 1}
                                 onSendSuggestion={(text) => handleSendMessage(text)}
                             />
                         ))
                     )}
                     <div className="h-4" />
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent z-20">
                 <div className="max-w-3xl mx-auto">
                    {showScrollToBottom && (
                        <button
                            onClick={handleScrollToBottomClick}
                            className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 p-2 bg-token-surface shadow-lg rounded-full text-token-secondary hover:text-token-primary border border-token transition-all animate-bounce"
                            aria-label={t('chat.scrollToBottom')}
                        >
                            <ChevronDownIcon className="size-5" />
                        </button>
                    )}
                    
                    <ChatInput
                        ref={chatInputRef}
                        text={chatInputText}
                        onTextChange={setChatInputText}
                        onSendMessage={handleSendMessage}
                        isLoading={isLoading}
                        t={t}
                        onAbortGeneration={handleAbortGeneration}
                        replyContextText={replyContextText}
                        onClearReplyContext={() => setReplyContextText(null)}
                        language={language}
                    />
                 </div>
            </div>

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                theme={theme}
                setTheme={setTheme}
                language={language}
                setLanguage={setLanguage}
                personas={personas}
                setPersonas={setPersonas}
                conversations={conversations}
                setConversations={setConversations}
                activeConversationId={activeConversationId}
                t={t}
            />
            
            {analysisModalContent && (
                <CodeAnalysisModal
                    code={analysisModalContent.code}
                    lang={analysisModalContent.lang}
                    onClose={() => setAnalysisModalContent(null)}
                    t={t}
                />
            )}
            
            {lightboxState && (
                <Lightbox
                    images={lightboxState.images}
                    startIndex={lightboxState.startIndex}
                    onClose={() => setLightboxState(null)}
                />
            )}
            
            {selectionPopup && selectionPopup.visible && (
                <SelectionPopup
                    x={selectionPopup.x}
                    y={selectionPopup.y}
                    text={selectionPopup.text}
                    onAsk={(text) => {
                        setSelectionPopup(null);
                        handleSendMessage(text);
                    }}
                    t={t}
                />
            )}

            {isDragging && <DragDropOverlay t={t} />}
        </main>
    </div>
  );
};

export default App;