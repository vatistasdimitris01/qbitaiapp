import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
// FIX: Removed PreviewContent from import as it is not defined in types.ts and was unused.
import type { Message, FileAttachment, Conversation, Persona, LocationInfo, AIStatus } from './types';
import { MessageType } from './types';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import LocationBanner from './components/LocationBanner';
import CodeAnalysisModal from './components/CodeAnalysisModal';
import { useTranslations } from './hooks/useTranslations';
import { streamMessageToAI } from './services/geminiService';
import { getPyodide } from './services/pyodideService';
import { translations } from './translations';
import { LayoutGridIcon, SquarePenIcon, ChevronDownIcon } from './components/icons';

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

const App: React.FC = () => {
  const [isAppReady, setIsAppReady] = useState(false);
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

  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  
  const [analysisModalContent, setAnalysisModalContent] = useState<{ code: string; lang: string } | null>(null);
  const [executionResults, setExecutionResults] = useState<Record<string, ExecutionResult>>({});
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);


  const mainContentRef = useRef<HTMLElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { t, setLang, lang } = useTranslations(language);
  
  const handleUpdate = () => {
    if (waitingWorkerRef.current) {
        waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
        // The page will reload after the new service worker takes control.
        setShowUpdateBanner(false);
    }
  };


  // Service Worker Update Handler
  useEffect(() => {
    if ('serviceWorker' in navigator) {
        const handleControllerChange = () => {
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
                                    // New update available
                                    waitingWorkerRef.current = installingWorker;
                                    setShowUpdateBanner(true);
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

  // Pre-load Pyodide environment on app startup
  useEffect(() => {
    // Don't pre-load if app is already considered ready (e.g. from a quick refresh)
    if (isAppReady) return;

    getPyodide().then(() => {
        console.log('Pyodide environment pre-loaded and ready.');
        setIsAppReady(true);
    }).catch(e => {
        console.error('Failed to pre-load Pyodide environment:', e);
        // Load app anyway, code execution might fail but chat is still usable.
        setIsAppReady(true);
    });
  }, [isAppReady]);

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
                    case 'sources':
                        const sourcesMessage: Message = {
                            id: `sources-${aiMessageId}`,
                            type: MessageType.AI_SOURCES,
                            content: update.payload,
                        };
                        const aiMsgIndex = newMessages.findIndex(m => m.id === aiMessageId);
                        if (aiMsgIndex > -1) {
                            // Replace agent action with sources
                            const agentActionIndex = newMessages.findIndex(m => m.type === MessageType.AGENT_ACTION);
                             if (agentActionIndex !== -1) {
                                newMessages.splice(agentActionIndex, 1, sourcesMessage);
                            } else {
                                const existingSourcesIndex = newMessages.findIndex(m => m.id === sourcesMessage.id);
                                if (existingSourcesIndex === -1) {
                                    newMessages.splice(aiMsgIndex, 0, sourcesMessage);
                                } else {
                                    newMessages[existingSourcesIndex] = sourcesMessage;
                                }
                            }
                        }
                        break;
                    case 'usage':
                        newMessages = newMessages.map(msg =>
                            msg.id === aiMessageId ? { ...msg, usageMetadata: update.payload } : msg
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
                const targetMsgIndex = newMessages.findIndex(m => m.id === messageIdToRegenerate);

                if (targetMsgIndex === -1) return c;

                switch (update.type) {
                    case 'chunk':
                        setAiStatus('generating');
                        newMessages[targetMsgIndex] = {
                            ...newMessages[targetMsgIndex],
                            content: (newMessages[targetMsgIndex].content as string) + update.payload
                        };
                        break;
                    case 'searching':
                         setAiStatus('searching');
                         const searchActionMessage: Message = {
                            id: `searching-${messageIdToRegenerate}`,
                            type: MessageType.AGENT_ACTION,
                            content: `Searching for: "${update.payload}"`,
                        };
                         if (targetMsgIndex > -1) {
                             const existingSearchIndex = newMessages.findIndex(m => m.id === searchActionMessage.id);
                             if (existingSearchIndex === -1) {
                                 newMessages.splice(targetMsgIndex, 0, searchActionMessage);
                             } else {
                                 newMessages[existingSearchIndex] = searchActionMessage;
                             }
                         }
                        break;
                    case 'sources':
                        const sourcesMessage: Message = { 
                            id: `sources-${messageIdToRegenerate}`, 
                            type: MessageType.AI_SOURCES, 
                            content: update.payload 
                        };
                         const agentActionIndex = newMessages.findIndex(m => m.type === MessageType.AGENT_ACTION);
                         if (agentActionIndex !== -1) {
                            newMessages.splice(agentActionIndex, 1, sourcesMessage);
                        } else {
                            const existingSourcesIndex = newMessages.findIndex(m => m.id === sourcesMessage.id);
                            if (existingSourcesIndex === -1) {
                                newMessages.splice(targetMsgIndex, 0, sourcesMessage);
                            } else {
                                newMessages[existingSourcesIndex] = sourcesMessage;
                            }
                        }
                        break;
                    case 'usage':
                        newMessages[targetMsgIndex] = {
                            ...newMessages[targetMsgIndex],
                            usageMetadata: update.payload
                        };
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

  if (!isAppReady) {
    return <Loader t={t} />;
  }

  return (
    <div style={{ height: appHeight }} className="flex bg-background text-foreground font-sans overflow-hidden">
      {showUpdateBanner && (
        <div className="absolute top-0 left-0 right-0 bg-blue-500 text-white text-sm text-center p-2 flex items-center justify-center gap-4 z-[100]">
            <p>{t('updateBanner.text')}</p>
            <button onClick={handleUpdate} className="bg-white text-blue-500 font-semibold px-3 py-1 rounded-md hover:opacity-90">
                {t('updateBanner.button')}
            </button>
        </div>
      )}
      
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
                            executionResults={executionResults}
                            onStoreExecutionResult={handleStoreExecutionResult}
                            onFixRequest={handleFixCodeRequest}
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
    </div>
  );
};

export default App;