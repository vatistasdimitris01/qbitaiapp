
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Message, FileAttachment, Conversation, Persona, LocationInfo, AIStatus } from './types';
import { MessageType } from './types';
import ChatInput, { ChatInputHandle } from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import Lightbox from './components/Lightbox';
import GreetingMessage from './components/GreetingMessage';
import WelcomeModal from './components/WelcomeModal';
import { useTranslations } from './hooks/useTranslations';
import { streamMessageToAI } from './services/geminiService';
import { stopPythonExecution } from './services/pythonExecutorService';
import { translations } from './translations';
import { AppShell, ContentArea } from './components/DesignSystem';

type Language = keyof typeof translations;

const initialPersonas: Persona[] = [
  { id: 'persona-doc', name: 'Doctor', instruction: 'You are a helpful medical assistant.' },
  { id: 'persona-eng', name: 'Engineer', instruction: 'You are a senior software engineer.' },
  { id: 'persona-teach', name: 'Teacher', instruction: 'You are a friendly and patient teacher.' },
];

const App: React.FC = () => {
  const [isPythonReady, setIsPythonReady] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>('idle');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState<Language>('en');
  const [userLocation, setUserLocation] = useState<LocationInfo | null>(null);
  const [executionResults, setExecutionResults] = useState<Record<string, any>>({});
  const [chatInputText, setChatInputText] = useState('');
  const [replyContextText, setReplyContextText] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: any[]; startIndex: number; } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const { t } = useTranslations(language);

  // Initialize
  useEffect(() => {
    if (window.innerWidth >= 1024) setIsSidebarOpen(true);
    
    const savedConvos = localStorage.getItem('conversations');
    if (savedConvos) setConversations(JSON.parse(savedConvos));
    setPersonas(initialPersonas);

    const hasSeenWelcome = localStorage.getItem('welcome_seen');
    if (!hasSeenWelcome) {
        setShowWelcome(true);
    } else {
        // Try to get location silently if already seen welcome
        navigator.geolocation.getCurrentPosition((pos) => {
            const { latitude, longitude } = pos.coords;
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
                .then(res => res.json())
                .then(data => {
                    const city = data?.address?.city || data?.address?.town || 'Unknown';
                    setUserLocation({ city, country: data?.address?.country || 'Unknown', latitude, longitude });
                });
        }, () => {});
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  }, [theme]);

  const handleNewChat = useCallback(() => {
    setActiveConversationId(null);
    setChatInputText('');
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  }, []);

  const handleSendMessage = useCallback(async (text: string, attachments: File[] = []) => {
    if (!text.trim() && attachments.length === 0) return;
    
    let currentConvoId = activeConversationId;
    const newUserMsg: Message = { id: Date.now().toString(), type: MessageType.USER, content: text };
    const aiMsgId = (Date.now() + 1).toString();

    // Get history before updating state
    const currentActiveConvo = conversations.find(c => c.id === currentConvoId);
    const history = currentActiveConvo ? currentActiveConvo.messages : [];

    setConversations(prev => {
        let conversationsCopy = [...prev];
        let convo = conversationsCopy.find(c => c.id === currentConvoId);
        if (!convo) {
            convo = { id: Date.now().toString(), title: text.slice(0, 40), messages: [], createdAt: new Date().toISOString() };
            conversationsCopy = [convo, ...conversationsCopy];
            currentConvoId = convo.id;
            setActiveConversationId(convo.id);
        }
        convo.messages.push(newUserMsg, { id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' });
        return conversationsCopy;
    });

    setIsLoading(true);
    setAiStatus('thinking');
    const abort = new AbortController();
    abortControllerRef.current = abort;

    await streamMessageToAI(history, text, attachments, undefined, userLocation, language, abort.signal, (update) => {
        setConversations(prev => prev.map(c => {
            if (c.id === currentConvoId) {
                const messages = [...c.messages];
                const idx = messages.findIndex(m => m.id === aiMsgId);
                if (idx !== -1) {
                    if (update.type === 'chunk') { setAiStatus('generating'); messages[idx].content += update.payload; }
                    else if (update.type === 'searching') setAiStatus('searching');
                }
                return { ...c, messages };
            }
            return c;
        }));
    }, (duration) => { 
        setIsLoading(false); setAiStatus('idle'); 
    }, (err) => { setIsLoading(false); setAiStatus('error'); });
  }, [activeConversationId, userLocation, language, conversations]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return (
    <AppShell isSidebarOpen={isSidebarOpen}>
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
        
        <ContentArea isPushed={isSidebarOpen}>
            {!isSidebarOpen && (
                <button 
                    onClick={() => setIsSidebarOpen(true)}
                    className="fixed top-4 left-4 z-[70] size-12 rounded-full bg-white dark:bg-white/10 backdrop-blur-2xl border border-white/10 flex flex-col items-center justify-center gap-1.5 shadow-2xl transition-all"
                >
                    <div className="w-5 h-[2.5px] bg-foreground rounded-full"></div>
                    <div className="w-5 h-[2.5px] bg-foreground rounded-full"></div>
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
                                 onRegenerate={() => {}}
                                 onFork={() => {}}
                                 isLoading={isLoading && index === activeConversation.messages.length - 1}
                                 aiStatus={aiStatus}
                                 onShowAnalysis={() => {}}
                                 executionResults={executionResults}
                                 onStoreExecutionResult={() => {}}
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
            {showWelcome && (
                <WelcomeModal 
                    onComplete={() => { setShowWelcome(false); localStorage.setItem('welcome_seen', 'true'); }} 
                    onLocationUpdate={(loc, lang) => { setUserLocation(loc); if(lang) setLanguage(lang as any); }}
                    t={t}
                />
            )}
        </ContentArea>
    </AppShell>
  );
};

export default App;
