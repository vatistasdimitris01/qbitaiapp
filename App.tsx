
import React, { useState, useEffect, useRef, useMemo } from 'react';
// FIX: Removed PreviewContent from import as it is not defined in types.ts and was unused.
import type { Message, FileAttachment, Conversation, Persona, LocationInfo } from './types';
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
import { LayoutGridIcon, SquarePenIcon } from './components/icons';

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
};


const App: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
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
    getPyodide().then(() => {
        console.log('Pyodide environment pre-loaded and ready.');
    }).catch(e => {
        console.error('Failed to pre-load Pyodide environment:', e);
    });
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

  useEffect(() => {
    localStorage.setItem('theme', theme);
     if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
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
    if (activeConversation && activeConversation.title && activeConversation.title !== t('newChat')) {
      document.title = `Qbit - ${activeConversation.title}`;
    } else {
      document.title = 'Qbit - AI Chat Assistant';
    }
  }, [activeConversation, t]);

  const scrollToBottom = () => {
    if (mainContentRef.current) {
        requestAnimationFrame(() => {
          if (mainContentRef.current) {
            mainContentRef.current.scrollTop = mainContentRef.current.scrollHeight;
          }
        });
    }
  };

  useEffect(() => {
    // A small delay helps ensure content is rendered before scrolling.
    setTimeout(scrollToBottom, 100);
  }, [activeConversation?.messages?.slice(-1)[0]?.content, isLoading]);

  const handleNewChat = () => {
    const newConversation: Conversation = {
        id: `convo-${Date.now()}`,
        title: t('newChat'),
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
              title: t('newChat'),
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
  };

  const handleSendMessage = async (text: string, attachments: FileAttachment[] = []) => {
    if (!activeConversationId || !activeConversation) return;
    const trimmedText = text.trim();
    if (isLoading || (!trimmedText && attachments.length === 0)) return;

    const messageText = trimmedText === '' && attachments.length > 0
        ? t('describeFiles').replace('{count}', attachments.length.toString())
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
    setIsLoading(true);

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
                        newMessages = newMessages.map(msg =>
                            msg.id === aiMessageId ? { ...msg, content: (msg.content as string || '') + update.payload } : msg
                        );
                        break;
                    case 'grounding':
                        const sourcesMessage: Message = {
                            id: `sources-${aiMessageId}`,
                            type: MessageType.AI_SOURCES,
                            content: update.payload,
                        };
                        const aiMsgIndex = newMessages.findIndex(m => m.id === aiMessageId);
                        if (aiMsgIndex > -1) {
                            const existingSourcesIndex = newMessages.findIndex(m => m.id === sourcesMessage.id);
                            if (existingSourcesIndex === -1) {
                                newMessages.splice(aiMsgIndex, 0, sourcesMessage);
                            } else {
                                newMessages[existingSourcesIndex] = sourcesMessage;
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
                        newMessages[targetMsgIndex] = {
                            ...newMessages[targetMsgIndex],
                            content: (newMessages[targetMsgIndex].content as string) + update.payload
                        };
                        break;
                    case 'grounding':
                        const sourcesMessage: Message = { 
                            id: `sources-${messageIdToRegenerate}`, 
                            type: MessageType.AI_SOURCES, 
                            content: update.payload 
                        };
                        const existingSourcesIndex = newMessages.findIndex(m => m.id === sourcesMessage.id);
                        if (existingSourcesIndex === -1) {
                            newMessages.splice(targetMsgIndex, 0, sourcesMessage);
                        } else {
                            newMessages[existingSourcesIndex] = sourcesMessage;
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
  
  const handleSelectConversation = (id: string) => {
      setActiveConversationId(id);
      setIsSidebarOpen(false); // Close sidebar after selecting a conversation
  };

  return (
    <div style={{ height: appHeight }} className="flex bg-background text-foreground font-sans overflow-hidden">
      {showUpdateBanner && (
        <div className="absolute top-0 left-0 right-0 bg-blue-500 text-white text-sm text-center p-2 flex items-center justify-center gap-4 z-[100]">
            <p>A new version is available!</p>
            <button onClick={handleUpdate} className="bg-white text-blue-500 font-semibold px-3 py-1 rounded-md hover:opacity-90">
                Refresh
            </button>
        </div>
      )}
      
      {/* Floating Sidebar Toggle Button */}
      <button
        onClick={() => setIsSidebarOpen(true)}
        className={`fixed top-4 left-4 z-30 p-2 bg-card/80 backdrop-blur-md rounded-lg text-muted-foreground hover:text-foreground border border-default shadow-md transition-opacity duration-300 ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        aria-label={t('openSidebar')}
      >
        <LayoutGridIcon className="size-5" />
      </button>

      {/* New Chat Button for PC */}
      <button
        onClick={handleNewChat}
        className={`fixed top-16 left-4 z-30 hidden p-2 bg-card/80 backdrop-blur-md rounded-lg text-muted-foreground hover:text-foreground border border-default shadow-md transition-opacity duration-300 md:block ${isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
        aria-label={t('newChat')}
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
      <div className="flex-1 flex flex-col h-full">
        <LocationBanner onLocationUpdate={handleLocationUpdate} t={t} />
        
        <main ref={mainContentRef} className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-4">
            {activeConversation && activeConversation.messages.length > 0 ? (
              activeConversation.messages.map((msg, index) => {
                const isLastMessage = index === activeConversation.messages.length - 1;
                const isCurrentlyLoading = isLoading && isLastMessage;
                return <ChatMessage
                            key={msg.id}
                            message={msg}
                            onRegenerate={handleRegenerate}
                            isLoading={isCurrentlyLoading}
                            onShowAnalysis={handleShowAnalysis}
                            executionResults={executionResults}
                            onStoreExecutionResult={handleStoreExecutionResult}
                            onFixRequest={handleFixCodeRequest}
                        />;
              })
            ) : (
               <div className="text-center text-muted pt-16">
                 {t('startConversation')}
               </div>
            )}
          </div>
        </main>
        
        <div className="mt-auto pt-4">
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
        />
      )}
    </div>
  );
};

export default App;
