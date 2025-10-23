import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Message, FileAttachment, Conversation, Persona, LocationInfo, AIStatus, GroundingChunk, MapsGroundingChunk } from './types';
import { MessageType } from './types';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import LocationBanner from './components/LocationBanner';
import CodeAnalysisModal from './components/CodeAnalysisModal';
import { useTranslations } from './hooks/useTranslations';
import { streamMessageToAI } from './services/geminiService';
import { pythonExecutorReady, stopPythonExecution } from './services/pythonExecutorService';
import { translations } from './translations';
import { LayoutGridIcon, SquarePenIcon, ChevronDownIcon, ChevronLeftIcon, ArrowUpIcon, MapPinIcon, BrainIcon } from './components/icons';

type Language = keyof typeof translations;

const isLanguage = (lang: any): lang is Language => {
  return typeof lang === 'string' && lang in translations;
};

const initialPersonas: Persona[] = [
  { id: 'persona-doc', name: 'Doctor', instruction: 'You are a helpful medical assistant providing information. You are not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.' },
  { id: 'persona-eng', name: 'Engineer', instruction: 'You are a senior software engineer. Provide clear, concise, and technically accurate answers. Use code examples in markdown format when appropriate. Be direct and to the point.' },
  { id: 'persona-teach', name: 'Teacher', instruction: 'You are a friendly and patient teacher. Explain concepts clearly and simply, as if you are talking to a student. Use analogies and examples to make topics understandable.' },
];

// Define a type for serializable execution results
type ExecutionResult = {
  output: string | null;
  error: string;
  type: 'string' | 'image-base64' | 'plotly-json' | 'error';
  downloadableFile?: { filename: string; mimetype: string; data: string; };
};


// Loader component and its dependencies
interface TextHoverEffectProps {
  text: string;
  className?: string;
}

const TextHoverEffect: React.FC<TextHoverEffectProps> = ({ text, className }) => {
  const [activeLetterIndex, setActiveLetterIndex] = useState<number | null>(null);
  const letters = useMemo(() => text.split(''), [text]);

  useEffect(() => {
    let index = 0;
    const intervalId = setInterval(() => {
      setActiveLetterIndex(index);
      index = (index + 1) % letters.length;
    }, 300);
    
    // Set initial active letter to start the animation
    setActiveLetterIndex(0);

    return () => clearInterval(intervalId);
  }, [letters.length]);

  return (
    <div className={`flex justify-center items-center ${className}`}>
      {letters.map((letter, i) => (
        <span
          key={i}
          className="text-4xl sm:text-6xl md:text-8xl font-bold transition-all duration-300 ease-in-out"
          style={{
            color: i === activeLetterIndex ? 'var(--foreground)' : 'var(--muted-foreground)',
            opacity: i === activeLetterIndex ? 1 : 0.5,
            transform: i === activeLetterIndex ? 'scale(1.1)' : 'scale(1)',
          }}
        >
          {letter}
        </span>
      ))}
    </div>
  );
};

const Loader: React.FC<{t: (key:string) => string}> = ({t}) => {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-background text-foreground">
      <TextHoverEffect text={t('loader.text')} />
      <div className="flex items-center mt-12 text-muted-foreground text-sm">
        <svg className="animate-spin h-4 w-4 mr-2.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span>{t('loader.subtext')}</span>
      </div>
    </div>
  );
};

// --- MapView Component and its dependencies ---

interface MapViewProps {
    isOpen: boolean;
    onClose: () => void;
    initialChunks: MapsGroundingChunk[];
    conversationHistory: Message[];
    onTurnComplete: (messages: Message[]) => void;
    location: LocationInfo | null;
    language: string;
    t: (key: string, params?: Record<string, string>) => string;
}

// A simple hashing function to create pseudo-random, but deterministic positions for map pins.
// This is a fallback for when real coordinates are not provided by the API.
const simpleHash = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    const a = Math.abs((hash * hash) % 10000);
    return a / 10000;
};

const MapView: React.FC<MapViewProps> = ({ isOpen, onClose, initialChunks, conversationHistory, onTurnComplete, location, language, t }) => {
    const [chunks, setChunks] = useState(initialChunks);
    const [selectedChunk, setSelectedChunk] = useState<MapsGroundingChunk | null>(initialChunks[0] || null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const chatContentRef = useRef<HTMLDivElement>(null);

    // Effect to scroll chat view down when new messages are added
    useEffect(() => {
        if (chatContentRef.current) {
            chatContentRef.current.scrollTop = chatContentRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSendMessage = async () => {
        const text = inputValue.trim();
        if (!text || isLoading) return;

        const userMessage: Message = { id: `map-user-${Date.now()}`, type: MessageType.USER, content: text };
        const aiMessageId = `map-ai-${Date.now()}`;
        const aiMessage: Message = { id: aiMessageId, type: MessageType.AI_RESPONSE, content: '' };
        
        setMessages(prev => [...prev, userMessage, aiMessage]);
        setInputValue('');
        setIsLoading(true);

        const fullHistory = [...conversationHistory, ...messages, userMessage];

        let finalAiContent = '';
        let finalGroundingChunks: GroundingChunk[] = [];
        const controller = new AbortController();

        await streamMessageToAI(
            fullHistory, text, [], undefined, location, language, controller.signal,
            (update) => {
                if (update.type === 'chunk') {
                    finalAiContent += update.payload;
                    setMessages(prev => prev.map(m => m.id === aiMessageId ? { ...m, content: finalAiContent } : m));
                }
                if (update.type === 'grounding') {
                    finalGroundingChunks = update.payload;
                    const mapChunks = finalGroundingChunks.filter((c): c is MapsGroundingChunk => 'maps' in c);
                    setChunks(mapChunks);
                    if (mapChunks.length > 0) setSelectedChunk(mapChunks[0]); else setSelectedChunk(null);
                }
            },
            () => { // onFinish
                setIsLoading(false);
                const completeAiMessage: Message = { id: aiMessageId, type: MessageType.AI_RESPONSE, content: finalAiContent, groundingChunks: finalGroundingChunks };
                setMessages(prev => prev.map(m => m.id === aiMessageId ? completeAiMessage : m));
                onTurnComplete([userMessage, completeAiMessage]);
            },
            (error) => { // onError
                setIsLoading(false);
                const errorMessage: Message = { id: aiMessageId, type: MessageType.ERROR, content: error };
                setMessages(prev => prev.map(m => m.id === aiMessageId ? errorMessage : m));
                onTurnComplete([userMessage, errorMessage]);
            }
        );
    };

    const getPinPosition = (chunk: MapsGroundingChunk) => {
        const x = simpleHash(chunk.maps.title);
        const y = simpleHash(chunk.maps.uri);
        const padding = 0.08; // 8% padding from edges
        const top = (padding + y * (1 - padding * 2)) * 100;
        const left = (padding + x * (1 - padding * 2)) * 100;
        return { top: `${top}%`, left: `${left}%` };
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-background z-50 flex flex-col animate-fade-in-up">
            <header className="flex items-center gap-4 p-4 border-b border-default flex-shrink-0">
                <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
                    <ChevronLeftIcon className="size-6" />
                </button>
                <h2 className="text-lg font-semibold">{t('mapView.header')}</h2>
            </header>

            <div className="flex-1 relative overflow-hidden">
                <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('https://www.gstatic.com/ai/devsite/places-in-map.png')" }}>
                    {chunks.map((chunk, index) => (
                        <button key={index} onClick={() => setSelectedChunk(chunk)} style={getPinPosition(chunk)} className="absolute transform -translate-x-1/2 -translate-y-full transition-transform hover:scale-110">
                            <MapPinIcon className={`size-10 drop-shadow-lg ${selectedChunk?.maps.uri === chunk.maps.uri ? 'text-orange-500' : 'text-gray-700'}`} style={{ fill: 'currentColor' }}/>
                        </button>
                    ))}
                </div>

                {/* Chat Overlay */}
                <div ref={chatContentRef} className="absolute top-4 left-4 max-w-sm max-h-60 overflow-y-auto space-y-2 pointer-events-auto">
                    {messages.map(msg => (
                        <div key={msg.id} className={`max-w-xs text-sm p-2.5 rounded-xl shadow-lg ${msg.type === 'USER' ? 'bg-user-message text-foreground ml-auto' : 'bg-ai-message text-foreground'}`}>
                            {typeof msg.content === 'string' && msg.content}
                        </div>
                    ))}
                </div>

                {/* Selected Place Detail Card */}
                <div className={`absolute bottom-0 left-0 right-0 p-4 transition-transform duration-300 ease-in-out ${selectedChunk ? 'translate-y-0' : 'translate-y-full'}`}>
                    <div className="max-w-lg mx-auto bg-card rounded-2xl shadow-2xl p-4 border border-default">
                        {selectedChunk && (
                            <div>
                                <h3 className="font-bold text-lg">{selectedChunk.maps.title}</h3>
                                {selectedChunk.maps.placeAnswerSources?.[0]?.reviewSnippets?.[0] && (
                                     <blockquote className="mt-2 text-sm text-muted-foreground border-l-2 border-default pl-3 italic">
                                        "{selectedChunk.maps.placeAnswerSources[0].reviewSnippets[0].quote}"
                                     </blockquote>
                                )}
                                <a href={selectedChunk.maps.uri} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-semibold text-orange-500 hover:text-orange-600">
                                    {t('mapsCard.directions')} &rarr;
                                </a>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <footer className="p-4 border-t border-default flex-shrink-0 bg-background">
                <div className="max-w-lg mx-auto relative">
                     <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder={t('mapView.inputPlaceholder')}
                        className="w-full pl-4 pr-12 py-3 bg-token-surface-secondary border border-default rounded-full focus:outline-none focus:ring-2 focus:ring-orange-500"
                        disabled={isLoading}
                    />
                    <button onClick={handleSendMessage} disabled={isLoading || !inputValue.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 bg-neutral-900 text-white rounded-full flex items-center justify-center hover:bg-neutral-700 dark:bg-white dark:text-black dark:hover:bg-gray-200 disabled:opacity-50">
                        <ArrowUpIcon className="size-5" />
                    </button>
                </div>
            </footer>
        </div>
    );
};


const App: React.FC = () => {
  const [isAppReady, setIsAppReady] = useState(false);
  const [isPythonReady, setIsPythonReady] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>('idle');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState('system');
  const [language, setLanguage] = useState<Language>('en');
  const [userLocation, setUserLocation] = useState<LocationInfo | null>(null);
  const [appHeight, setAppHeight] = useState(window.innerHeight);
  
  const [analysisModalContent, setAnalysisModalContent] = useState<{ code: string; lang: string } | null>(null);
  const [executionResults, setExecutionResults] = useState<Record<string, ExecutionResult>>({});
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [mapViewState, setMapViewState] = useState<{ isOpen: boolean; chunks: MapsGroundingChunk[] }>({ isOpen: false, chunks: [] });


  const mainContentRef = useRef<HTMLElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { t, setLang, lang } = useTranslations(language);

  const checkPythonReady = useCallback(() => {
    // This function can be called multiple times (e.g., after stopping execution).
    // It attaches to the current `readyPromise` from the service.
    pythonExecutorReady().then(() => {
        console.log('Python worker environment ready.');
        if (!isPythonReady) setIsPythonReady(true);
    }).catch(e => {
        console.error('Failed to prepare Python worker environment:', e);
        if (isPythonReady) setIsPythonReady(false);
    });
  }, [isPythonReady]);


  // Initialize app and background services
  useEffect(() => {
    // The app UI is ready immediately.
    setIsAppReady(true);
    
    // Start loading the Python environment in the background.
    checkPythonReady();
  }, [checkPythonReady]);

  // Service Worker Auto-Update Handler
  useEffect(() => {
    if ('serviceWorker' in navigator) {
        const handleControllerChange = () => {
            // When the new service worker takes control, reload to get latest assets.
            window.location.reload();
        };
        
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

        const registerServiceWorker = async () => {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                registration.onupdatefound = () => {
                    const installingWorker = registration.installing;
                    if (installingWorker) {
                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed') {
                                if (navigator.serviceWorker.controller) {
                                    // A new service worker is installed and waiting.
                                    // Post message to the new worker to activate it immediately for an auto-update.
                                    installingWorker.postMessage({ type: 'SKIP_WAITING' });
                                }
                            }
                        };
                    }
                };
            } catch (error) {
                console.error('Service worker registration failed:', error);
            }
        };

        window.addEventListener('load', registerServiceWorker);

        return () => {
            window.removeEventListener('load', registerServiceWorker);
            navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        };
    }
  }, []);

  // Dynamic height for mobile keyboard fix
  useEffect(() => {
    const handleResize = () => {
      setAppHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load state from localStorage on initial render
  useEffect(() => {
    const savedConvos = localStorage.getItem('conversations');
    const savedActiveId = localStorage.getItem('activeConversationId');
    const savedPersonas = localStorage.getItem('personas');
    const savedTheme = localStorage.getItem('theme');
    const savedLang = localStorage.getItem('language');
    const savedResults = localStorage.getItem('executionResults');


    const loadedConvos = savedConvos ? JSON.parse(savedConvos) : [];
    setConversations(loadedConvos);

    if (savedPersonas) {
        setPersonas(JSON.parse(savedPersonas));
    } else {
        setPersonas(initialPersonas);
    }
    
    if (savedTheme) setTheme(savedTheme);
    if (savedLang && isLanguage(savedLang)) setLanguage(savedLang);
    if (savedResults) setExecutionResults(JSON.parse(savedResults));
    

    if (savedActiveId && loadedConvos.some((c: Conversation) => c.id === savedActiveId)) {
        setActiveConversationId(savedActiveId);
    } else if (loadedConvos.length > 0) {
        setActiveConversationId(loadedConvos[0].id);
    } else {
        handleNewChat();
    }
  // handleNewChat depends on `t`, which changes, but we only want to run this once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (activeConversationId) {
        localStorage.setItem('activeConversationId', activeConversationId);
    }
  }, [activeConversationId]);

  useEffect(() => {
    localStorage.setItem('personas', JSON.stringify(personas));
  }, [personas]);

  // Handles theme changes, including listening for system preferences
  useEffect(() => {
    localStorage.setItem('theme', theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const applyTheme = () => {
      const isDark = theme === 'dark' || (theme === 'system' && mediaQuery.matches);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    // Apply the theme immediately
    applyTheme();

    // Listener for system theme changes
    const handleSystemThemeChange = () => {
      if (theme === 'system') {
        applyTheme();
      }
    };
    
    mediaQuery.addEventListener('change', handleSystemThemeChange);

    // Cleanup listener on component unmount or when theme changes
    return () => {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [theme]);
  
  useEffect(() => {
    localStorage.setItem('language', language);
    setLang(language);
  }, [language, setLang]);

  useEffect(() => {
    localStorage.setItem('executionResults', JSON.stringify(executionResults));
  }, [executionResults]);


  const activeConversation = useMemo(() => {
    return conversations.find(c => c.id === activeConversationId);
  }, [conversations, activeConversationId]);

  // SEO: Update document title based on active conversation
  useEffect(() => {
    if (activeConversation && activeConversation.title && activeConversation.title !== t('sidebar.newChat')) {
      document.title = `Qbit - ${activeConversation.title}`;
    } else {
      document.title = 'Qbit - AI Chat Assistant';
    }
  }, [activeConversation, t]);

  const scrollToBottom = useCallback((behavior: 'auto' | 'smooth' = 'auto') => {
    if (mainContentRef.current) {
        mainContentRef.current.scrollTo({
            top: mainContentRef.current.scrollHeight,
            behavior,
        });
    }
  }, []);

  const handleScrollToBottomClick = () => {
    scrollToBottom('smooth');
  };

  const handleScroll = useCallback(() => {
      const main = mainContentRef.current;
      if (main) {
          const threshold = 400; // A bit more than a single message height
          const isNearBottom = main.scrollHeight - main.scrollTop - main.clientHeight < threshold;
          setShowScrollToBottom(!isNearBottom);
      }
  }, []);

  useEffect(() => {
      const main = mainContentRef.current;
      main?.addEventListener('scroll', handleScroll, { passive: true });
      return () => main?.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Scroll to bottom when conversation changes
  useEffect(() => {
    // A small timeout ensures the DOM has updated with the new messages
    setTimeout(() => scrollToBottom('auto'), 0);
  }, [activeConversationId, scrollToBottom]);

  // Auto-scroll logic for streaming AI responses
  useEffect(() => {
    if (isLoading && !showScrollToBottom) {
        scrollToBottom('smooth');
    }
  }, [activeConversation?.messages?.slice(-1)[0]?.content, isLoading, showScrollToBottom, scrollToBottom]);


  const handleNewChat = () => {
    const newConversation: Conversation = {
        id: `convo-${Date.now()}`,
        title: t('sidebar.newChat'),
        messages: [],
        createdAt: new Date().toISOString(),
    };
    setConversations(prev => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    setIsSidebarOpen(false); // Close sidebar for a better UX
  };

  const handleDeleteConversation = (id: string) => {
    const indexToDelete = conversations.findIndex(c => c.id === id);
    if (indexToDelete === -1) return;

    const newConversations = conversations.filter(c => c.id !== id);
    
    setConversations(newConversations);
    
    if (activeConversationId === id) {
        if (newConversations.length > 0) {
            const newIndex = Math.max(0, indexToDelete - 1);
            setActiveConversationId(newConversations[newIndex].id);
        } else {
           // Create a new chat if the last one was deleted
           const newConversation: Conversation = {
              id: `convo-${Date.now()}`,
              title: t('sidebar.newChat'),
              messages: [],
              createdAt: new Date().toISOString(),
           };
           setConversations([newConversation]);
           setActiveConversationId(newConversation.id);
        }
    }
  };

  const handleAbortGeneration = () => {
    if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
    }
    setIsLoading(false);
    setAiStatus('idle');
  };

  const handleSendMessage = async (text: string, attachments: FileAttachment[] = []) => {
    if (!activeConversationId || !activeConversation) return;
    const trimmedText = text.trim();
    if (isLoading || (!trimmedText && attachments.length === 0)) return;

    const messageText = trimmedText === '' && attachments.length > 0
        ? t('chat.input.placeholderWithFiles').replace('{count}', attachments.length.toString())
        : trimmedText;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      type: MessageType.USER,
      content: messageText,
      files: attachments,
    };
    
    const isFirstMessage = activeConversation.messages.length === 0;
    
    const aiMessageId = `ai-${Date.now()}`;
    const placeholderAiMessage: Message = {
      id: aiMessageId,
      type: MessageType.AI_RESPONSE,
      content: '',
    };
    
    const conversationHistoryForState = [...activeConversation.messages, userMessage];

    setConversations(prev => prev.map(c => 
        c.id === activeConversationId 
            ? {
                ...c,
                messages: [...conversationHistoryForState, placeholderAiMessage],
                ...(isFirstMessage && messageText && { title: messageText.substring(0, 50) })
              }
            : c
    ));
    // Ensure the view scrolls down to show the user's new message immediately.
    setTimeout(() => scrollToBottom('smooth'), 0);

    setIsLoading(true);
    setAiStatus('thinking');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentPersona = personas.find(p => p.id === activeConversation.personaId);
    
    await streamMessageToAI(
        conversationHistoryForState,
        messageText,
        attachments,
        currentPersona?.instruction,
        userLocation,
        lang,
        controller.signal,
        (update) => { // onUpdate callback
            setConversations(prev => prev.map(c => {
                if (c.id !== activeConversationId) return c;
        
                let newMessages = [...c.messages];
        
                switch (update.type) {
                    case 'chunk':
                        setAiStatus('generating');
                        newMessages = newMessages.map(msg =>
                            msg.id === aiMessageId ? { ...msg, content: (msg.content as string || '') + update.payload } : msg
                        );
                        break;
                    case 'searching':
                        setAiStatus('searching');
                        const searchActionMessage: Message = {
                            id: `searching-${aiMessageId}`,
                            type: MessageType.AGENT_ACTION,
                            content: `Searching for: "${update.payload}"`,
                        };
                         const aiMsgIdx = newMessages.findIndex(m => m.id === aiMessageId);
                        if (aiMsgIdx > -1) {
                            const existingSearchIndex = newMessages.findIndex(m => m.id === searchActionMessage.id);
                            if (existingSearchIndex === -1) {
                                newMessages.splice(aiMsgIdx, 0, searchActionMessage);
                            } else {
                                newMessages[existingSearchIndex] = searchActionMessage;
                            }
                        }
                        break;
                    case 'usage':
                        newMessages = newMessages.map(msg =>
                            msg.id === aiMessageId ? { ...msg, usageMetadata: update.payload } : msg
                        );
                        break;
                    case 'grounding':
                        newMessages = newMessages.map(msg =>
                            msg.id === aiMessageId ? { ...msg, groundingChunks: update.payload } : msg
                        );
                        break;
                }
                return { ...c, messages: newMessages };
            }));
        },
        (duration) => { // onFinish callback
            setIsLoading(false);
            abortControllerRef.current = null;
            setAiStatus('complete');
            setTimeout(() => setAiStatus('idle'), 500);
        },
        (errorText) => { // onError callback
            setConversations(prev => prev.map(c => {
                if (c.id !== activeConversationId) return c;
                const newMessages = c.messages.map(msg =>
                    msg.id === aiMessageId ? { ...msg, type: MessageType.ERROR, content: `Sorry, an error occurred: ${errorText}` } : msg
                );
                return { ...c, messages: newMessages };
            }));
            setIsLoading(false);
            abortControllerRef.current = null;
            setAiStatus('error');
            setTimeout(() => setAiStatus('idle'), 500);
        }
    );
  };
  
  const handleRegenerate = async (messageIdToRegenerate: string) => {
    if (!activeConversation || isLoading) return;

    const messageIndex = activeConversation.messages.findIndex(msg => msg.id === messageIdToRegenerate);
    if (messageIndex <= 0) return;

    const historyUpToRegenPoint = activeConversation.messages.slice(0, messageIndex);
    const lastUserMessageIndex = historyUpToRegenPoint.map(m => m.type).lastIndexOf(MessageType.USER);
    
    if (lastUserMessageIndex === -1) return;

    const lastUserMessage = historyUpToRegenPoint[lastUserMessageIndex];
    
    setIsLoading(true);
    setAiStatus('thinking');
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const historyForApi = activeConversation.messages.slice(0, lastUserMessageIndex + 1);

    const messagesForUi = [
        ...activeConversation.messages.slice(0, lastUserMessageIndex + 1),
        {
            id: messageIdToRegenerate,
            type: MessageType.AI_RESPONSE,
            content: '',
        }
    ];

    setConversations(prev =>
        prev.map(c =>
            c.id === activeConversationId ? { ...c, messages: messagesForUi } : c
        )
    );
    setTimeout(() => scrollToBottom('smooth'), 0);

    const currentPersona = personas.find(p => p.id === activeConversation.personaId);
    
    await streamMessageToAI(
        historyForApi,
        lastUserMessage.content as string,
        lastUserMessage.files || [],
        currentPersona?.instruction,
        userLocation,
        lang,
        controller.signal,
        (update) => {
            setConversations(prev => prev.map(c => {
                if (c.id !== activeConversationId) return c;
                let newMessages = [...c.messages];
                
                switch (update.type) {
                    case 'chunk':
                        setAiStatus('generating');
                        newMessages = newMessages.map(msg => 
                            msg.id === messageIdToRegenerate 
                                ? { ...msg, content: (msg.content as string) + update.payload } 
                                : msg
                        );
                        break;
                    case 'searching':
                         setAiStatus('searching');
                         const searchActionMessage: Message = {
                            id: `searching-${messageIdToRegenerate}`,
                            type: MessageType.AGENT_ACTION,
                            content: `Searching for: "${update.payload}"`,
                        };
                        const targetMsgIndex = newMessages.findIndex(m => m.id === messageIdToRegenerate);
                         if (targetMsgIndex > -1) {
                             const existingSearchIndex = newMessages.findIndex(m => m.id === searchActionMessage.id);
                             if (existingSearchIndex === -1) {
                                 newMessages.splice(targetMsgIndex, 0, searchActionMessage);
                             } else {
                                 newMessages[existingSearchIndex] = searchActionMessage;
                             }
                         }
                        break;
                    case 'usage':
                        newMessages = newMessages.map(msg => 
                            msg.id === messageIdToRegenerate 
                                ? { ...msg, usageMetadata: update.payload } 
                                : msg
                        );
                        break;
                    case 'grounding':
                        newMessages = newMessages.map(msg =>
                            msg.id === messageIdToRegenerate ? { ...msg, groundingChunks: update.payload } : msg
                        );
                        break;
                }
                return { ...c, messages: newMessages };
            }));
        },
        (duration) => {
            setIsLoading(false);
            abortControllerRef.current = null;
            setAiStatus('complete');
            setTimeout(() => setAiStatus('idle'), 500);
        },
        (errorText) => {
            setConversations(prev => prev.map(c => {
                if (c.id !== activeConversationId) return c;
                const newMessages = c.messages.map(msg => 
                    msg.id === messageIdToRegenerate 
                        ? { ...msg, type: MessageType.ERROR, content: `Sorry, an error occurred: ${errorText}` } 
                        : msg
                );
                return { ...c, messages: newMessages };
            }));
            setIsLoading(false);
            abortControllerRef.current = null;
            setAiStatus('error');
            setTimeout(() => setAiStatus('idle'), 500);
        }
    );
  };
  
  const handleLocationUpdate = (locationInfo: LocationInfo, detectedLang?: string) => {
      setUserLocation(locationInfo);
      if(localStorage.getItem('language') === null && detectedLang && isLanguage(detectedLang)) {
          setLanguage(detectedLang);
      }
  };
  
  const handleShowAnalysis = (code: string, lang: string) => {
    setAnalysisModalContent({ code, lang });
  };
  
  const handleStoreExecutionResult = (messageId: string, partIndex: number, result: ExecutionResult) => {
      const key = `${messageId}_${partIndex}`;
      setExecutionResults(prev => ({ ...prev, [key]: result }));
  };
  
  const handleStopExecution = () => {
    setIsPythonReady(false);
    stopPythonExecution();
    checkPythonReady(); // This will listen to the *new* readyPromise from the re-initialized worker
  };

  const handleFixCodeRequest = (code: string, lang: string, error: string) => {
    const message = `The following code block produced an error. Please analyze the code and the error message, identify the issue, and provide a corrected version of the code block.

Original Code (\`${lang}\`):
\`\`\`${lang}
${code}
\`\`\`

Error Message:
\`\`\`
${error}
\`\`\`
`;
    handleSendMessage(message);
  };

  const handleForkConversation = (fromMessageId: string) => {
    if (!activeConversation) return;

    const messageIndex = activeConversation.messages.findIndex(msg => msg.id === fromMessageId);
    if (messageIndex === -1) return;

    const forkedMessages = activeConversation.messages.slice(0, messageIndex + 1);

    const newConversation: Conversation = {
        id: `convo-${Date.now()}`,
        title: t('sidebar.forkedChatTitle', { oldTitle: activeConversation.title }),
        messages: forkedMessages,
        createdAt: new Date().toISOString(),
        personaId: activeConversation.personaId, // Carry over the persona
    };

    setConversations(prev => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    setIsSidebarOpen(false);
  };
  
  const handleSelectConversation = (id: string) => {
      setActiveConversationId(id);
      setIsSidebarOpen(false); // Close sidebar after selecting a conversation
  };

  const handleShowMap = (chunks: MapsGroundingChunk[]) => {
    setMapViewState({ isOpen: true, chunks });
  };

  const handleAddMessagesToConversation = (messages: Message[]) => {
      if (!activeConversationId) return;
      setConversations(prev => prev.map(c =>
          c.id === activeConversationId
              ? { ...c, messages: [...c.messages, ...messages] }
              : c
      ));
  };

  if (!isAppReady) {
    return <Loader t={t} />;
  }

  return (
    <div style={{ height: appHeight }} className="flex bg-background text-foreground font-sans overflow-hidden">
      {/* Floating Sidebar Toggle Button */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className={`fixed top-4 left-4 z-30 p-2 bg-card/80 backdrop-blur-md rounded-lg text-muted-foreground hover:text-foreground border border-default shadow-md transition-opacity duration-300 ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        aria-label={t('sidebar.open')}
      >
        <LayoutGridIcon className="size-5" />
      </button>

      {/* New Chat Button for PC */}
      <button
        onClick={handleNewChat}
        className={`fixed top-16 left-4 z-30 hidden p-2 bg-card/80 backdrop-blur-md rounded-lg text-muted-foreground hover:text-foreground border border-default shadow-md transition-opacity duration-300 md:block ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        aria-label={t('sidebar.newChat')}
      >
        <SquarePenIcon className="size-5" />
      </button>

      {/* Sidebar Overlay */}
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
      
      {/* Backdrop */}
      {isSidebarOpen && (
        <div 
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300"
          aria-hidden="true"
        ></div>
      )}
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative">
        <LocationBanner onLocationUpdate={handleLocationUpdate} t={t} />
        
        <main ref={mainContentRef} className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-2 sm:px-6 pt-8 pb-4">
            {activeConversation && activeConversation.messages.length > 0 ? (
              activeConversation.messages.map((msg, index) => {
                const isLastMessage = index === activeConversation.messages.length - 1;
                const isCurrentlyLoading = isLoading && isLastMessage;
                const currentAiStatus = isCurrentlyLoading ? aiStatus : 'idle';
                return <ChatMessage
                            key={msg.id}
                            message={msg}
                            onRegenerate={handleRegenerate}
                            onFork={handleForkConversation}
                            isLoading={isCurrentlyLoading}
                            aiStatus={currentAiStatus}
                            onShowAnalysis={handleShowAnalysis}
                            onShowMap={handleShowMap}
                            executionResults={executionResults}
                            onStoreExecutionResult={handleStoreExecutionResult}
                            onFixRequest={handleFixCodeRequest}
                            onStopExecution={handleStopExecution}
                            isPythonReady={isPythonReady}
                            t={t}
                        />;
              })
            ) : (
               <div className="text-center text-muted pt-16">
                 {t('chat.placeholder')}
               </div>
            )}
          </div>
        </main>
        
        <div className="mt-auto pt-4">
           {showScrollToBottom && (
              <button
                  onClick={handleScrollToBottomClick}
                  className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 p-2 bg-card/90 backdrop-blur-md rounded-full text-muted-foreground hover:text-foreground border border-default shadow-lg transition-all animate-fade-in-up"
                  aria-label={t('chat.scrollToBottom')}
              >
                  <ChevronDownIcon className="size-6" />
              </button>
          )}
          <footer className="max-w-4xl mx-auto px-4 sm:px-6 pb-4">
              <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} t={t} onAbortGeneration={handleAbortGeneration} />
          </footer>
        </div>
      </div>
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        theme={theme}
        setTheme={setTheme}
        language={lang}
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
      {mapViewState.isOpen && (
          <MapView
              isOpen={mapViewState.isOpen}
              onClose={() => setMapViewState({ isOpen: false, chunks: [] })}
              initialChunks={mapViewState.chunks}
              conversationHistory={activeConversation?.messages || []}
              onTurnComplete={handleAddMessagesToConversation}
              location={userLocation}
              language={lang}
              t={t}
          />
      )}
    </div>
  );
};

export default App;