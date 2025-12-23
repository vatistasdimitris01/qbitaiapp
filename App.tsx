
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message, FileAttachment, Conversation, Persona, LocationInfo, AIStatus } from './types';
import { MessageType } from './types';
import ChatInput, { ChatInputHandle } from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import Lightbox from './components/Lightbox';
import GreetingMessage from './components/GreetingMessage';
import { useTranslations } from './hooks/useTranslations';
import { streamMessageToAI } from './services/geminiService';
import { stopPythonExecution } from './services/pythonExecutorService';
import { translations } from './translations';

type Language = keyof typeof translations;

const initialPersonas: Persona[] = [
  { id: 'persona-doc', name: 'Doctor', instruction: 'You are a helpful medical assistant.' },
  { id: 'persona-eng', name: 'Engineer', instruction: 'You are a senior software engineer.' },
  { id: 'persona-teach', name: 'Teacher', instruction: 'You are a friendly and patient teacher.' },
];

const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const getRandomGreeting = () => [
    "What are you working on?",
    "Where should we begin?",
    "Hey, Ready to dive in?",
    "What’s on your mind today?",
    "Ready when you are.",
][Math.floor(Math.random() * 5)];

const sanitizeForStorage = (conversations: Conversation[]): Conversation[] => {
    return conversations.map(convo => ({
        ...convo,
        messages: convo.messages.map(msg => ({
            ...msg,
            files: msg.files?.map(f => ({ ...f, dataUrl: f.dataUrl.length > 50000 ? '' : f.dataUrl }))
        }))
    }));
};

const App: React.FC = () => {
  const [isPythonReady, setIsPythonReady] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>('idle');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState<Language>('en');
  const [userLocation, setUserLocation] = useState<LocationInfo | null>(null);
  const [executionResults, setExecutionResults] = useState<Record<string, any>>({});
  const [chatInputText, setChatInputText] = useState('');
  const [replyContextText, setReplyContextText] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: any[]; startIndex: number; } | null>(null);

  const mainContentRef = useRef<HTMLElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const touchStartRef = useRef<number | null>(null);
  const { t } = useTranslations(language);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current !== null) {
      const touchEnd = e.changedTouches[0].clientX;
      const diff = touchEnd - touchStartRef.current;
      if (touchStartRef.current < 60 && diff > 80 && !isSidebarOpen) {
        setIsSidebarOpen(true);
      }
      touchStartRef.current = null;
    }
  };

  useEffect(() => {
    if (window.innerWidth >= 1024) setIsSidebarOpen(true);
    
    // Attempt to get location for grounding
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
          try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
              const data = await res.json();
              if (data.address) {
                setUserLocation({
                    city: data.address.city || data.address.town || 'Unknown',
                    country: data.address.country || 'Unknown',
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude
                });
              }
          } catch(e) {}
      },
      () => {},
      { enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => {
    try {
        const savedConvos = localStorage.getItem('conversations');
        const savedActiveId = localStorage.getItem('activeConversationId');
        if (savedConvos) setConversations(JSON.parse(savedConvos));
        if (savedActiveId) setActiveConversationId(savedActiveId);
        setPersonas(initialPersonas);
    } catch (e) {}
  }, []);

  useEffect(() => {
    localStorage.setItem('conversations', JSON.stringify(sanitizeForStorage(conversations)));
  }, [conversations]);

  useEffect(() => {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, [theme]);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setChatInputText('');
    setReplyContextText(null);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  }, []);

  const handleSendMessage = useCallback(async (text: string, attachments: File[] = [], isRegeneration = false, targetConvoId?: string) => {
    if (!text.trim() && attachments.length === 0) return;
    
    let currentConvoId = targetConvoId || activeConversationId;
    let updatedConversations = [...conversations];

    if (!currentConvoId) {
        const newConvo: Conversation = { 
            id: Date.now().toString(), 
            title: text.slice(0, 40) || 'New Chat', 
            messages: [], 
            createdAt: new Date().toISOString(), 
            greeting: getRandomGreeting() 
        };
        updatedConversations = [newConvo, ...updatedConversations];
        currentConvoId = newConvo.id;
        setConversations(updatedConversations);
        setActiveConversationId(newConvo.id);
    }

    const processedFiles: FileAttachment[] = [];
    if (!isRegeneration) {
        for (const f of attachments) {
            processedFiles.push({ name: f.name, type: f.type, size: f.size, dataUrl: await fileToDataURL(f) });
        }
    }

    const newUserMsg: Message = { id: Date.now().toString(), type: MessageType.USER, content: text, files: processedFiles };
    const aiMsgId = (Date.now() + 1).toString();

    // If regeneration, we might be stripping the last AI message first
    setConversations(prev => prev.map(c => {
        if (c.id === currentConvoId) {
            let messages = [...c.messages];
            if (isRegeneration) {
                // Find index of the last user message and remove everything after it
                const lastUserIdx = [...messages].reverse().findIndex(m => m.type === MessageType.USER);
                if (lastUserIdx !== -1) {
                    messages = messages.slice(0, messages.length - lastUserIdx);
                }
            } else {
                messages.push(newUserMsg);
            }
            messages.push({ id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' });
            return { ...c, messages };
        }
        return c;
    }));
    
    setIsLoading(true);
    setAiStatus('thinking');

    const abort = new AbortController();
    abortControllerRef.current = abort;

    const currentConvo = updatedConversations.find(c => c.id === currentConvoId);
    // Use the potentially cleaned history if regenerating
    const history = currentConvo ? (isRegeneration ? currentConvo.messages.slice(0, -1) : currentConvo.messages) : [];

    await streamMessageToAI(
        history,
        text,
        isRegeneration ? [] : attachments,
        undefined,
        userLocation,
        language,
        abort.signal,
        (update) => {
            setConversations(prev => prev.map(c => {
                if (c.id === currentConvoId) {
                    const messages = [...c.messages];
                    const idx = messages.findIndex(m => m.id === aiMsgId);
                    if (idx !== -1) {
                        const targetMsg = { ...messages[idx] };
                        if (update.type === 'chunk') { 
                            setAiStatus('generating'); 
                            targetMsg.content = (targetMsg.content as string) + update.payload;
                        }
                        else if (update.type === 'sources') { 
                            targetMsg.groundingChunks = [...(targetMsg.groundingChunks || []), ...update.payload]; 
                        }
                        else if (update.type === 'searching') {
                            setAiStatus('searching');
                        }
                        else if (update.type === 'search_result_count') {
                            targetMsg.searchResultCount = update.payload;
                        }
                        else if (update.type === 'tool_call') {
                            targetMsg.toolCalls = [...(targetMsg.toolCalls || []), update.payload];
                        }
                        messages[idx] = targetMsg;
                    }
                    return { ...c, messages };
                }
                return c;
            }));
        },
        (duration) => { 
            setIsLoading(false); 
            setAiStatus('idle'); 
            setConversations(prev => prev.map(c => {
                if (c.id === currentConvoId) {
                    const messages = [...c.messages];
                    const idx = messages.findIndex(m => m.id === aiMsgId);
                    if (idx !== -1) {
                        messages[idx] = { ...messages[idx], generationDuration: duration };
                    }
                    return { ...c, messages };
                }
                return c;
            }));
        },
        (err) => { setIsLoading(false); setAiStatus('error'); }
    );
  }, [activeConversationId, conversations, userLocation, language]);

  const handleRegenerate = useCallback((messageId: string) => {
    if (isLoading) return;
    const convo = conversations.find(c => c.id === activeConversationId);
    if (!convo) return;
    
    const msgIdx = convo.messages.findIndex(m => m.id === messageId);
    if (msgIdx === -1) return;

    // Find the nearest preceding user message
    let lastUserQuery = '';
    for (let i = msgIdx; i >= 0; i--) {
        if (convo.messages[i].type === MessageType.USER) {
            lastUserQuery = convo.messages[i].content as string;
            break;
        }
    }

    if (lastUserQuery) {
        handleSendMessage(lastUserQuery, [], true, activeConversationId!);
    }
  }, [conversations, activeConversationId, handleSendMessage, isLoading]);

  const handleFork = useCallback((messageId: string) => {
    const convo = conversations.find(c => c.id === activeConversationId);
    if (!convo) return;
    
    const msgIdx = convo.messages.findIndex(m => m.id === messageId);
    if (msgIdx === -1) return;

    const newMessages = convo.messages.slice(0, msgIdx + 1);
    const newConvo: Conversation = {
        id: Date.now().toString(),
        title: t('sidebar.forkedChatTitle', { oldTitle: convo.title }),
        messages: newMessages,
        createdAt: new Date().toISOString(),
        greeting: convo.greeting
    };

    setConversations(prev => [newConvo, ...prev]);
    setActiveConversationId(newConvo.id);
  }, [conversations, activeConversationId, t]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return (
    <div 
        className="flex h-screen bg-background text-foreground overflow-hidden font-sans relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
    >
        <Sidebar
            isOpen={isSidebarOpen}
            toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onNewChat={handleNewChat}
            onSelectConversation={(id) => { setActiveConversationId(id); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
            onDeleteConversation={(id) => {
                setConversations(prev => prev.filter(c => c.id !== id));
                if (activeConversationId === id) setActiveConversationId(null);
            }}
            onOpenSettings={() => setIsSettingsOpen(true)}
            t={t}
        />
        
        <main 
            ref={mainContentRef}
            className={`flex-1 flex flex-col h-full relative transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]
                ${isSidebarOpen ? 'lg:ml-[320px]' : 'ml-0'}
                bg-background w-full
            `}
        >
            {!isSidebarOpen && (
                <button 
                    onClick={() => setIsSidebarOpen(true)}
                    className="fixed top-4 left-4 z-[70] size-12 rounded-full bg-[#141414] dark:bg-white/10 backdrop-blur-2xl border border-white/10 flex flex-col items-center justify-center gap-1.5 shadow-2xl active:scale-95 transition-all"
                >
                    <div className="w-5 h-[2.5px] bg-white rounded-full"></div>
                    <div className="w-5 h-[2.5px] bg-white rounded-full"></div>
                </button>
            )}

            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-48 scrollbar-none">
                <div className="max-w-3xl mx-auto flex flex-col min-h-full">
                     {(!activeConversation || activeConversation.messages.length === 0) ? (
                        <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-fade-in-up">
                            <GreetingMessage />
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
                                 onShowAnalysis={(code, lang) => {}}
                                 executionResults={executionResults}
                                 onStoreExecutionResult={(msgId, partIdx, res) => {
                                     setExecutionResults(prev => ({ ...prev, [`${msgId}_${partIdx}`]: res }));
                                 }}
                                 onFixRequest={() => {}}
                                 onStopExecution={() => stopPythonExecution()}
                                 isPythonReady={isPythonReady}
                                 t={t}
                                 onOpenLightbox={(imgs, idx) => setLightboxState({ images: imgs, startIndex: idx })}
                                 isLast={index === activeConversation.messages.length - 1}
                                 onSendSuggestion={handleSendMessage}
                             />
                         ))
                     )}
                </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent z-20">
                 <div className="max-w-3xl mx-auto">
                    <ChatInput
                        ref={chatInputRef}
                        text={chatInputText}
                        onTextChange={setChatInputText}
                        onSendMessage={handleSendMessage}
                        isLoading={isLoading}
                        t={t}
                        onAbortGeneration={() => abortControllerRef.current?.abort()}
                        replyContextText={replyContextText}
                        onClearReplyContext={() => setReplyContextText(null)}
                        language={language}
                    />
                 </div>
            </div>

            <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} personas={personas} setPersonas={setPersonas} conversations={conversations} setConversations={setConversations} activeConversationId={activeConversationId} t={t} />
            {lightboxState && <Lightbox images={lightboxState.images} startIndex={lightboxState.startIndex} onClose={() => setLightboxState(null)} />}
        </main>
    </div>
  );
};

export default App;
