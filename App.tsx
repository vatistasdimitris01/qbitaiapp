
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
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  }, [t]);

  const handleSendMessage = useCallback(async (text: string, attachments: File[] = []) => {
    if (!text.trim() && attachments.length === 0) return;
    let currentConvoId = activeConversationId;
    if (!currentConvoId) {
        const newConvo: Conversation = { id: Date.now().toString(), title: text.slice(0, 30) || 'New Chat', messages: [], createdAt: new Date().toISOString(), greeting: getRandomGreeting() };
        setConversations(prev => [newConvo, ...prev]);
        currentConvoId = newConvo.id;
        setActiveConversationId(newConvo.id);
    }

    const processedFiles: FileAttachment[] = [];
    for (const f of attachments) {
        processedFiles.push({ name: f.name, type: f.type, size: f.size, dataUrl: await fileToDataURL(f) });
    }

    const newUserMsg: Message = { id: Date.now().toString(), type: MessageType.USER, content: text, files: processedFiles };
    const aiMsgId = (Date.now() + 1).toString();

    setConversations(prev => prev.map(c => c.id === currentConvoId ? { ...c, messages: [...c.messages, newUserMsg, { id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' }] } : c));
    setIsLoading(true);
    setAiStatus('thinking');

    const abort = new AbortController();
    abortControllerRef.current = abort;

    await streamMessageToAI(
        conversations.find(c => c.id === currentConvoId)?.messages || [],
        text,
        attachments,
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
                        if (update.type === 'chunk') { setAiStatus('generating'); messages[idx].content += update.payload; }
                        else if (update.type === 'sources') { messages[idx].groundingChunks = [...(messages[idx].groundingChunks || []), ...update.payload]; }
                    }
                    return { ...c, messages };
                }
                return c;
            }));
        },
        () => { setIsLoading(false); setAiStatus('idle'); },
        (err) => { setIsLoading(false); setAiStatus('error'); }
    );
  }, [activeConversationId, conversations, userLocation, language]);

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
            onDeleteConversation={(id) => setConversations(prev => prev.filter(c => c.id !== id))}
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
            {/* Updated 2-Line Toggle Trigger Button (=) - Dark circle for both modes with white bars */}
            {!isSidebarOpen && (
                <button 
                    onClick={() => setIsSidebarOpen(true)}
                    className="fixed top-4 left-4 z-[70] size-12 rounded-full bg-[#141414] dark:bg-white/5 backdrop-blur-2xl border border-white/10 flex flex-col items-center justify-center gap-1.5 shadow-2xl active:scale-95 transition-all"
                >
                    <div className="w-5 h-[2.5px] bg-white rounded-full"></div>
                    <div className="w-5 h-[2.5px] bg-white rounded-full"></div>
                </button>
            )}

            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-48 scrollbar-none">
                <div className="max-w-3xl mx-auto flex flex-col min-h-full">
                     {(!activeConversationId || conversations.find(c => c.id === activeConversationId)?.messages.length === 0) ? (
                        <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-fade-in-up">
                            <GreetingMessage />
                        </div>
                     ) : (
                         conversations.find(c => c.id === activeConversationId)?.messages.map((msg, index) => (
                             <ChatMessage
                                 key={msg.id}
                                 message={msg}
                                 onRegenerate={() => {}}
                                 onFork={() => {}}
                                 isLoading={isLoading && index === (conversations.find(c => c.id === activeConversationId)?.messages.length || 0) - 1}
                                 aiStatus={aiStatus}
                                 onShowAnalysis={(code, lang) => {}}
                                 executionResults={executionResults}
                                 onStoreExecutionResult={() => {}}
                                 onFixRequest={() => {}}
                                 onStopExecution={() => stopPythonExecution()}
                                 isPythonReady={isPythonReady}
                                 t={t}
                                 onOpenLightbox={(imgs, idx) => setLightboxState({ images: imgs, startIndex: idx })}
                                 isLast={index === (conversations.find(c => c.id === activeConversationId)?.messages.length || 0) - 1}
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
