
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Conversation, Message, MessageType, LocationInfo, AIStatus, FileAttachment, ExecutionResult } from './types';
import { streamMessageToAI } from './services/geminiService';
import { stopPythonExecution } from './services/pythonExecutorService';
import Sidebar from './components/Sidebar';
import ChatInput, { ChatInputHandle } from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import GreetingMessage from './components/GreetingMessage';
import SettingsModal from './components/SettingsModal';
import WelcomeModal from './components/WelcomeModal';
import Lightbox from './components/Lightbox';
import DragDropOverlay from './components/DragDropOverlay';
import { AppShell, ContentArea } from './components/DesignSystem';
import useTranslations from './hooks/useTranslations';

const App: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>('idle');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState<any>('en');
  const [userLocation, setUserLocation] = useState<LocationInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [executionResults, setExecutionResults] = useState<Record<string, ExecutionResult>>({});
  const [chatInputText, setChatInputText] = useState('');
  const [lightboxState, setLightboxState] = useState<{ images: any[]; startIndex: number; } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const { t } = useTranslations(language);

  useEffect(() => {
    const savedConvos = localStorage.getItem('conversations');
    if (savedConvos) setConversations(JSON.parse(savedConvos));
    const params = new URLSearchParams(window.location.search);
    const chatId = params.get('c');
    if (chatId) setActiveConversationId(chatId);
    if (!localStorage.getItem('welcome_seen')) setShowWelcome(true);
  }, []);

  useEffect(() => { localStorage.setItem('conversations', JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);

  const handleSendMessage = useCallback(async (text: string, attachments: File[] = []) => {
    if (!text.trim() && attachments.length === 0) return;
    let currentConvoId = activeConversationId;
    const fileAttachments: FileAttachment[] = await Promise.all(attachments.map(async file => {
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve) => {
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.readAsDataURL(file);
        });
        return { name: file.name, type: file.type, size: file.size, dataUrl };
    }));

    const newUserMsg: Message = { id: Date.now().toString(), type: MessageType.USER, content: text, files: fileAttachments };
    const aiMsgId = (Date.now() + 1).toString();
    let history: Message[] = [];

    setConversations(prev => {
        let copy = [...prev];
        let convo = copy.find(c => c.id === currentConvoId);
        if (!convo) {
            convo = { id: Date.now().toString(), title: text.slice(0, 40) || 'New Chat', messages: [], createdAt: new Date().toISOString() };
            copy = [convo, ...copy];
            currentConvoId = convo.id;
            setActiveConversationId(convo.id);
        }
        history = [...convo.messages];
        convo.messages.push(newUserMsg, { id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' });
        return copy;
    });

    setIsLoading(true); setAiStatus('thinking');
    const abort = new AbortController(); abortControllerRef.current = abort;

    await streamMessageToAI(history, text, attachments, userLocation, language, abort.signal, (update) => {
        setConversations(prev => prev.map(c => {
            if (c.id === currentConvoId) {
                const messages = [...c.messages];
                const idx = messages.findIndex(m => m.id === aiMsgId);
                if (idx !== -1) {
                    if (update.type === 'chunk') { setAiStatus('generating'); messages[idx].content += update.payload; }
                    else if (update.type === 'searching') setAiStatus('searching');
                    else if (update.type === 'sources') messages[idx].groundingChunks = update.payload;
                    else if (update.type === 'search_result_count') messages[idx].searchResultCount = update.payload;
                    else if (update.type === 'tool_call') {
                        const existing = messages[idx].toolCalls || [];
                        messages[idx].toolCalls = [...existing, update.payload];
                    }
                }
                return { ...c, messages };
            }
            return c;
        }));
    }, () => { setIsLoading(false); setAiStatus('idle'); }, (err) => { setIsLoading(false); setAiStatus('error'); });
  }, [activeConversationId, userLocation, language]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return (
    <div onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDrop={(e) => { e.preventDefault(); setIsDragging(false); chatInputRef.current?.handleFiles(e.dataTransfer.files); }} className="h-full w-full relative">
        {isDragging && <DragDropOverlay t={t} />}
        <AppShell isSidebarOpen={isSidebarOpen}>
            <Sidebar isOpen={isSidebarOpen} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} conversations={conversations} activeConversationId={activeConversationId} onNewChat={() => { setActiveConversationId(null); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} onSelectConversation={(id) => { setActiveConversationId(id); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} onDeleteConversation={(id) => setConversations(prev => prev.filter(c => c.id !== id))} onOpenSettings={() => setIsSettingsOpen(true)} t={t} />
            <ContentArea isPushed={isSidebarOpen}>
                {!isSidebarOpen && (<button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-[70] size-12 rounded-full bg-white dark:bg-white/10 backdrop-blur-2xl border border-white/10 flex flex-col items-center justify-center gap-1.5 shadow-2xl transition-all"><div className="w-5 h-[2.5px] bg-foreground rounded-full"></div><div className="w-5 h-[2.5px] bg-foreground rounded-full"></div></button>)}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-48 scrollbar-none">
                    <div className="max-w-3xl mx-auto flex flex-col min-h-full">
                        {(!activeConversation || activeConversation.messages.length === 0) ? <div className="flex-1 flex flex-col items-center justify-center min-h-[50vh]"><GreetingMessage /></div> : (activeConversation.messages.map((msg, index) => (
                            <ChatMessage key={msg.id} message={msg} onRegenerate={() => {}} onFork={() => {}} isLoading={isLoading && index === activeConversation.messages.length - 1} aiStatus={aiStatus} executionResults={executionResults} onStoreExecutionResult={(msgId, pIdx, res) => setExecutionResults(prev => ({...prev, [`${msgId}_${pIdx}`]: res}))} onFixRequest={() => {}} onStopExecution={() => stopPythonExecution()} isPythonReady={true} t={t} onOpenLightbox={(imgs, idx) => setLightboxState({ images: imgs, startIndex: idx })} isLast={index === activeConversation.messages.length - 1} onSendSuggestion={handleSendMessage} />
                        )))}
                    </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent z-20">
                    <div className="max-w-3xl mx-auto">
                        <ChatInput ref={chatInputRef} text={chatInputText} onTextChange={setChatInputText} onSendMessage={handleSendMessage} isLoading={isLoading} t={t} onAbortGeneration={() => abortControllerRef.current?.abort()} replyContextText={null} onClearReplyContext={() => {}} language={language} />
                    </div>
                </div>
                <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} conversations={conversations} setConversations={setConversations} t={t} />
                {lightboxState && <Lightbox images={lightboxState.images} startIndex={lightboxState.startIndex} onClose={() => setLightboxState(null)} />}
                {showWelcome && <WelcomeModal onComplete={() => { setShowWelcome(false); localStorage.setItem('welcome_seen', 'true'); }} onLocationUpdate={(loc, lang) => { setUserLocation(loc); if(lang) setLanguage(lang); }} t={t} />}
            </ContentArea>
        </AppShell>
    </div>
  );
};

export default App;
