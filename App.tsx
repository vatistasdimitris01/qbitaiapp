import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Message, Attachment, Conversation, Persona, LocationInfo } from './types';
import ChatInput from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import LocationBanner from './components/LocationBanner';
import { useTranslations } from './hooks/useTranslations';
import { streamMessageToAI } from './services/geminiService';
import { translations } from './translations';
import { LayoutGridIcon } from './components/icons';

type Language = keyof typeof translations;

const isLanguage = (lang: any): lang is Language => {
  return typeof lang === 'string' && lang in translations;
};

const initialPersonas: Persona[] = [
  { id: 'persona-doc', name: 'Doctor', instruction: 'You are a helpful medical assistant providing information. You are not a substitute for professional medical advice, diagnosis, or treatment. Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.' },
  { id: 'persona-eng', name: 'Engineer', instruction: 'You are a senior software engineer. Provide clear, concise, and technically accurate answers. Use code examples in markdown format when appropriate. Be direct and to the point.' },
  { id: 'persona-teach', name: 'Teacher', instruction: 'You are a friendly and patient teacher. Explain concepts clearly and simply, as if you are talking to a student. Use analogies and examples to make topics understandable.' },
];

const App: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState('system');
  const [language, setLanguage] = useState<Language>('en');
  const [userLocation, setUserLocation] = useState<LocationInfo | null>(null);
  const [appHeight, setAppHeight] = useState(window.innerHeight);

  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  const mainContentRef = useRef<HTMLElement>(null);
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

  // Load state from localStorage on initial render
  useEffect(() => {
    const savedConvos = localStorage.getItem('conversations');
    const savedActiveId = localStorage.getItem('activeConversationId');
    const savedPersonas = localStorage.getItem('personas');
    const savedTheme = localStorage.getItem('theme');
    const savedLang = localStorage.getItem('language');

    const loadedConvos = savedConvos ? JSON.parse(savedConvos) : [];
    setConversations(loadedConvos);

    if (savedPersonas) {
        setPersonas(JSON.parse(savedPersonas));
    } else {
        setPersonas(initialPersonas);
    }
    
    if (savedTheme) setTheme(savedTheme);
    if (savedLang && isLanguage(savedLang)) setLanguage(savedLang);
    

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
  }, [activeConversation?.messages?.slice(-1)[0]?.text, isLoading]);

  const handleNewChat = () => {
    const newConversation: Conversation = {
        id: `convo-${Date.now()}`,
        title: t('newChat'),
        messages: [],
        createdAt: new Date().toISOString(),
    };
    setConversations(prev => [newConversation, ...prev]);
    setActiveConversationId(newConversation.id);
    setIsMobileSidebarOpen(false);
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

  const handleSendMessage = async (text: string, attachments: Attachment[] = []) => {
    if (!activeConversationId || !activeConversation) return;
    const trimmedText = text.trim();
    if (isLoading || (!trimmedText && attachments.length === 0)) return;

    const messageText = trimmedText === '' && attachments.length > 0
        ? t('describeFiles').replace('{count}', attachments.length.toString())
        : trimmedText;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      author: 'user',
      text: messageText,
      attachments,
    };
    
    const isFirstMessage = activeConversation.messages.length === 0;
    const conversationHistoryForState = [...activeConversation.messages, userMessage];

    const aiMessageId = `ai-${Date.now()}`;
    const placeholderAiMessage: Message = {
      id: aiMessageId,
      author: 'ai',
      text: '',
    };

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

    const currentPersona = personas.find(p => p.id === activeConversation.personaId);
    const attachmentsForApi = attachments.map(({ data, mimeType }) => ({ data, mimeType }));

    await streamMessageToAI(
        activeConversation.messages, // History before the user's new message
        messageText,
        attachmentsForApi,
        currentPersona?.instruction,
        userLocation,
        lang,
        (update) => { // onUpdate callback
            setConversations(prev => prev.map(c => {
                if (c.id !== activeConversationId) return c;

                const newMessages = c.messages.map(msg => {
                    if (msg.id !== aiMessageId) return msg;

                    let updatedMsg = { ...msg };
                    switch (update.type) {
                        case 'chunk':
                            updatedMsg.text += update.payload;
                            break;
                        case 'grounding':
                            updatedMsg.groundingChunks = update.payload;
                            break;
                        case 'usage':
                            updatedMsg.usageMetadata = update.payload;
                            break;
                    }
                    return updatedMsg;
                });
                return { ...c, messages: newMessages };
            }));
        },
        (duration) => { // onFinish callback
            setConversations(prev => prev.map(c => {
                if (c.id !== activeConversationId) return c;
                const newMessages = c.messages.map(msg =>
                    msg.id === aiMessageId ? { ...msg, duration } : msg
                );
                return { ...c, messages: newMessages };
            }));
            setIsLoading(false);
        },
        (errorText) => { // onError callback
            setConversations(prev => prev.map(c => {
                if (c.id !== activeConversationId) return c;
                const newMessages = c.messages.map(msg =>
                    msg.id === aiMessageId ? { ...msg, text: `Sorry, an error occurred: ${errorText}` } : msg
                );
                return { ...c, messages: newMessages };
            }));
            setIsLoading(false);
        }
    );
  };
  
  const handleRegenerate = async (messageIdToRegenerate: string) => {
    if (!activeConversation || isLoading) return;

    const messageIndex = activeConversation.messages.findIndex(msg => msg.id === messageIdToRegenerate);
    if (messageIndex > 0 && activeConversation.messages[messageIndex].author === 'ai') {
        const lastUserMessage = activeConversation.messages.slice(0, messageIndex).reverse().find(msg => msg.author === 'user');

        if (lastUserMessage) {
            setIsLoading(true);
            const historyForRegeneration = activeConversation.messages.slice(0, messageIndex - 1);
            
            const aiMessageId = `ai-${Date.now()}`;
            const placeholderAiMessage: Message = {
              id: aiMessageId,
              author: 'ai',
              text: '',
            };
            
            // Set state with history up to the point of regeneration, including the new placeholder
            setConversations(prev => prev.map(c => 
              c.id === activeConversationId ? { ...c, messages: [...historyForRegeneration, lastUserMessage, placeholderAiMessage] } : c
            ));

            const currentPersona = personas.find(p => p.id === activeConversation.personaId);
            const attachmentsForApi = lastUserMessage.attachments?.map(({ data, mimeType }) => ({ data, mimeType }));

            await streamMessageToAI(
                historyForRegeneration,
                lastUserMessage.text,
                attachmentsForApi,
                currentPersona?.instruction,
                userLocation,
                lang,
                (update) => { // onUpdate
                    setConversations(prev => prev.map(c => {
                        if (c.id !== activeConversationId) return c;
                        const newMessages = c.messages.map(msg => {
                            if (msg.id !== aiMessageId) return msg;
                            let updatedMsg = { ...msg };
                            switch (update.type) {
                                case 'chunk':
                                    updatedMsg.text += update.payload;
                                    break;
                                case 'grounding':
                                    updatedMsg.groundingChunks = update.payload;
                                    break;
                                case 'usage':
                                    updatedMsg.usageMetadata = update.payload;
                                    break;
                            }
                            return updatedMsg;
                        });
                        return { ...c, messages: newMessages };
                    }));
                },
                (duration) => { // onFinish
                    setConversations(prev => prev.map(c => {
                        if (c.id !== activeConversationId) return c;
                        const newMessages = c.messages.map(msg =>
                            msg.id === aiMessageId ? { ...msg, duration } : msg
                        );
                        return { ...c, messages: newMessages };
                    }));
                    setIsLoading(false);
                },
                (errorText) => { // onError
                    setConversations(prev => prev.map(c => {
                        if (c.id !== activeConversationId) return c;
                        const newMessages = c.messages.map(msg =>
                            msg.id === aiMessageId ? { ...msg, text: `Sorry, an error occurred: ${errorText}` } : msg
                        );
                        return { ...c, messages: newMessages };
                    }));
                    setIsLoading(false);
                }
            );
        }
    }
  };
  
  const handleLocationUpdate = (locationInfo: LocationInfo, detectedLang?: string) => {
      setUserLocation(locationInfo);
      if(localStorage.getItem('language') === null && detectedLang && isLanguage(detectedLang)) {
          setLanguage(detectedLang);
      }
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
      {/* Mobile Sidebar */}
      <div className="md:hidden">
          <div 
              className={`fixed inset-0 bg-black/30 z-40 transition-opacity ${isMobileSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              onClick={() => setIsMobileSidebarOpen(false)}
          ></div>
          <Sidebar 
            isOpen={isMobileSidebarOpen} 
            toggleSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            isMobile={true}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onNewChat={handleNewChat}
            onSelectConversation={(id) => { setActiveConversationId(id); setIsMobileSidebarOpen(false); }}
            onDeleteConversation={handleDeleteConversation}
            onOpenSettings={() => setIsSettingsOpen(true)}
            t={t}
          />
      </div>
      {/* Desktop Sidebar */}
      <div className="hidden md:flex">
          <Sidebar 
            isOpen={isSidebarOpen} 
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            isMobile={false}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onNewChat={handleNewChat}
            onSelectConversation={setActiveConversationId}
            onDeleteConversation={handleDeleteConversation}
            onOpenSettings={() => setIsSettingsOpen(true)}
            t={t}
          />
       </div>

       {!isMobileSidebarOpen && (
         <div className="md:hidden fixed top-4 left-4 z-30">
            <button
                onClick={() => setIsMobileSidebarOpen(true)}
                className="p-2 rounded-lg bg-background/80 backdrop-blur-sm hover:bg-background text-foreground transition-colors border border-default"
                title={t('openSidebar')}
            >
                <LayoutGridIcon className="size-5" />
            </button>
        </div>
      )}
      
      {/* Main Content */}
      <div className={`flex-1 flex flex-col h-full transition-all duration-300 ${isSidebarOpen ? 'md:ml-64' : 'md:ml-16'}`}>
        <LocationBanner onLocationUpdate={handleLocationUpdate} t={t} />
        
        <main ref={mainContentRef} className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-4">
            {activeConversation && activeConversation.messages.length > 0 ? (
              activeConversation.messages.map((msg, index) => {
                const isLastAiMessage = index === activeConversation.messages.length - 1 && msg.author === 'ai';
                const isCurrentlyLoading = isLoading && isLastAiMessage;
                return <ChatMessage key={msg.id} message={msg} onRegenerate={handleRegenerate} isLoading={isCurrentlyLoading} />;
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
              <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} t={t} />
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
    </div>
  );
};

export default App;