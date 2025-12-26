


import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageType, Message, FileAttachment, Conversation, 
  LocationInfo, AIStatus, Persona, ExecutionResult 
} from './types';
import { useTranslations } from './hooks/useTranslations';
import { streamMessageToAI } from './services/geminiService';
import { stopPythonExecution } from './services/pythonExecutorService';
import { Sidebar } from './components/Sidebar';
import { ChatInput, ChatMessage, ChatInputHandle } from './components/Chat';
import { AppShell, ContentArea, GreetingMessage, DragDropOverlay } from './components/UI';
import { SettingsModal, WelcomeModal, Lightbox } from './components/Modals';

const App: React.FC = () => {
  const [isPythonReady, setIsPythonReady] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [personas, setPersonas] = useState<Persona[]>([{ id: 'persona-doc', name: 'Doctor', instruction: 'You are a helpful medical assistant.' }, { id: 'persona-eng', name: 'Engineer', instruction: 'You are a senior software engineer.' }, { id: 'persona-teach', name: 'Teacher', instruction: 'You are a friendly and patient teacher.' }]);
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>('idle');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState<any>('en');
  const [userLocation, setUserLocation] = useState<LocationInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [executionResults, setExecutionResults] = useState<Record<string, ExecutionResult>>({});
  const [chatInputText, setChatInputText] = useState('');
  const [replyContextText, setReplyContextText] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{ images: any[]; startIndex: number; } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const { t } = useTranslations(language);

  // Initial Setup
  useEffect(() => {
    if (window.innerWidth >= 1024) setIsSidebarOpen(true);
    const savedConvos = localStorage.getItem('conversations');
    let loadedConvos: Conversation[] = [];
    if (savedConvos) { loadedConvos = JSON.parse(savedConvos); setConversations(loadedConvos); }
    const params = new URLSearchParams(window.location.search);
    const chatId = params.get('c');
    if (chatId && loadedConvos.some(c => c.id === chatId)) { setActiveConversationId(chatId); }
    const hasSeenWelcome = localStorage.getItem('welcome_seen');
    if (!hasSeenWelcome) setShowWelcome(true);
    // Simulate Python ready (worker loaded via service)
    setTimeout(() => setIsPythonReady(true), 2000);
  }, []);

  useEffect(() => { localStorage.setItem('conversations', JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => { const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches); document.documentElement.classList.toggle('dark', isDark); }, [theme]);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const currentParam = params.get('c'); if (activeConversationId) { if (activeConversationId !== currentParam) { const newUrl = `${window.location.pathname}?c=${activeConversationId}`; window.history.pushState({ path: newUrl }, '', newUrl); } } else if (currentParam) { const newUrl = window.location.pathname; window.history.pushState({ path: newUrl }, '', newUrl); } }, [activeConversationId]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (!isDragging) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === e.target) setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); if (e.dataTransfer.files && e.dataTransfer.files.length > 0) chatInputRef.current?.handleFiles(e.dataTransfer.files); };
  
  const handleSendMessage = useCallback(async (text: string, attachments: File[] = []) => {
    if (!text.trim() && attachments.length === 0) return;
    let currentConvoId = activeConversationId;
    const fileAttachments: FileAttachment[] = await Promise.all(attachments.map(async file => { const reader = new FileReader(); const dataUrl = await new Promise<string>((resolve) => { reader.onload = (e) => resolve(e.target?.result as string); reader.readAsDataURL(file); }); return { name: file.name, type: file.type, size: file.size, dataUrl }; }));
    const newUserMsg: Message = { id: Date.now().toString(), type: MessageType.USER, content: text, files: fileAttachments };
    const aiMsgId = (Date.now() + 1).toString();
    let history: Message[] = [];
    setConversations(prev => {
        let conversationsCopy = [...prev];
        let convo = conversationsCopy.find(c => c.id === currentConvoId);
        if (!convo) { convo = { id: Date.now().toString(), title: text.slice(0, 40) || 'New Conversation', messages: [], createdAt: new Date().toISOString() }; conversationsCopy = [convo, ...conversationsCopy]; currentConvoId = convo.id; setActiveConversationId(convo.id); }
        history = [...convo.messages];
        convo.messages.push(newUserMsg, { id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' });
        return conversationsCopy;
    });
    setIsLoading(true); setAiStatus('thinking');
    const abort = new AbortController(); abortControllerRef.current = abort;
    await streamMessageToAI(history, text, attachments, undefined, userLocation, language, abort.signal, (update) => {
        setConversations(prev => prev.map(c => {
            if (c.id === currentConvoId) {
                const messages = [...c.messages]; const idx = messages.findIndex(m => m.id === aiMsgId);
                if (idx !== -1) {
                    if (update.type === 'chunk') { setAiStatus('generating'); messages[idx].content += update.payload; }
                    else if (update.type === 'searching') setAiStatus('searching');
                    else if (update.type === 'sources') messages[idx].groundingChunks = update.payload;
                    else if (update.type === 'search_result_count') messages[idx].searchResultCount = update.payload;
                    else if (update.type === 'tool_call') { 
                        const existingToolCalls = messages[idx].toolCalls || []; 
                        messages[idx].toolCalls = [...existingToolCalls, update.payload]; 
                    }
                }
                return { ...c, messages };
            }
            return c;
        }));
    }, () => { setIsLoading(false); setAiStatus('idle'); }, () => { setIsLoading(false); setAiStatus('error'); });
  }, [activeConversationId, userLocation, language]);

  const handleRegenerate = useCallback(async (messageId: string) => {
    if (!activeConversationId || isLoading) return;
    const convo = conversations.find(c => c.id === activeConversationId); if (!convo) return;
    const msgIndex = convo.messages.findIndex(m => m.id === messageId); if (msgIndex === -1) return;
    let historyToKeep: Message[] = []; let lastUserMessage: Message | null = null;
    if (convo.messages[msgIndex].type === MessageType.AI_RESPONSE) { historyToKeep = convo.messages.slice(0, msgIndex); lastUserMessage = historyToKeep[historyToKeep.length - 1]; } 
    else if (convo.messages[msgIndex].type === MessageType.USER) { historyToKeep = convo.messages.slice(0, msgIndex); lastUserMessage = convo.messages[msgIndex]; }
    if (!lastUserMessage || lastUserMessage.type !== MessageType.USER) return;
    const aiMsgId = (Date.now() + 1).toString();
    setConversations(prev => prev.map(c => {
        if (c.id === activeConversationId) {
            const newMessages = convo.messages[msgIndex].type === MessageType.AI_RESPONSE ? [...convo.messages.slice(0, msgIndex), { id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' }] : [...convo.messages.slice(0, msgIndex + 1), { id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' }];
            return { ...c, messages: newMessages };
        }
        return c;
    }));
    setIsLoading(true); setAiStatus('thinking');
    const abort = new AbortController(); abortControllerRef.current = abort;
    const apiHistory = historyToKeep.slice(0, historyToKeep.length - 1);
    const messageText = typeof lastUserMessage.content === 'string' ? lastUserMessage.content : '';
    await streamMessageToAI(apiHistory, messageText, [], undefined, userLocation, language, abort.signal, (update) => {
        setConversations(prev => prev.map(c => {
            if (c.id === activeConversationId) {
                const messages = [...c.messages]; const idx = messages.findIndex(m => m.id === aiMsgId);
                if (idx !== -1) {
                    if (update.type === 'chunk') { setAiStatus('generating'); messages[idx].content += update.payload; }
                    else if (update.type === 'searching') setAiStatus('searching');
                    else if (update.type === 'sources') messages[idx].groundingChunks = update.payload;
                    else if (update.type === 'search_result_count') messages[idx].searchResultCount = update.payload;
                    else if (update.type === 'tool_call') { 
                        const existingToolCalls = messages[idx].toolCalls || []; 
                        messages[idx].toolCalls = [...existingToolCalls, update.payload]; 
                    }
                }
                return { ...c, messages };
            }
            return c;
        }));
    }, () => { setIsLoading(false); setAiStatus('idle'); }, () => { setIsLoading(false); setAiStatus('error'); });
  }, [activeConversationId, conversations, userLocation, language, isLoading]);

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className="h-full w-full relative">
        {isDragging && <DragDropOverlay t={t} />}
        <AppShell isSidebarOpen={isSidebarOpen}>
            <Sidebar isOpen={isSidebarOpen} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} conversations={conversations} activeConversationId={activeConversationId} onNewChat={() => { setActiveConversationId(null); setChatInputText(''); const newUrl = window.location.pathname; window.history.pushState({ path: newUrl }, '', newUrl); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} onSelectConversation={(id) => { setActiveConversationId(id); if (window.innerWidth < 1024) setIsSidebarOpen(false); }} onDeleteConversation={(id) => setConversations(prev => prev.filter(c => c.id !== id))} onOpenSettings={() => setIsSettingsOpen(true)} t={t} />
            <ContentArea isPushed={isSidebarOpen}>
                {!isSidebarOpen && (<button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-[70] size-12 rounded-full bg-white dark:bg-white/10 backdrop-blur-2xl border border-white/10 flex flex-col items-center justify-center gap-1.5 shadow-2xl transition-all"><div className="w-5 h-[2.5px] bg-foreground rounded-full"></div><div className="w-5 h-[2.5px] bg-foreground rounded-full"></div></button>)}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-48 scrollbar-none"><div className="max-w-3xl mx-auto flex flex-col min-h-full">{(!activeConversation || activeConversation.messages.length === 0) ? (<div className="flex-1 flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-fade-in-up"><GreetingMessage /></div>) : (activeConversation.messages.map((msg, index) => (<ChatMessage key={msg.id} message={msg} onRegenerate={handleRegenerate} onFork={() => {}} isLoading={isLoading && index === activeConversation.messages.length - 1} aiStatus={aiStatus} executionResults={executionResults} onStoreExecutionResult={(msgId, partIdx, res) => setExecutionResults(prev => ({...prev, [`${msgId}_${partIdx}`]: res}))} onFixRequest={() => {}} onStopExecution={() => stopPythonExecution()} isPythonReady={isPythonReady} t={t} onOpenLightbox={(imgs, idx) => setLightboxState({ images: imgs, startIndex: idx })} isLast={index === activeConversation.messages.length - 1} onSendSuggestion={handleSendMessage} />)))}</div></div>
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent z-20"><div className="max-w-3xl mx-auto"><ChatInput ref={chatInputRef} text={chatInputText} onTextChange={setChatInputText} onSendMessage={handleSendMessage} isLoading={isLoading} t={t} onAbortGeneration={() => abortControllerRef.current?.abort()} replyContextText={replyContextText} onClearReplyContext={() => setReplyContextText(null)} language={language} /></div></div>
                <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} conversations={conversations} setConversations={setConversations} t={t} />
                {lightboxState && <Lightbox images={lightboxState.images} startIndex={lightboxState.startIndex} onClose={() => setLightboxState(null)} />}
                {showWelcome && (<WelcomeModal onComplete={() => { setShowWelcome(false); localStorage.setItem('welcome_seen', 'true'); }} onLocationUpdate={(loc, lang) => { setUserLocation(loc); if(lang) setLanguage(lang); }} t={t} />)}
            </ContentArea>
        </AppShell>
    </div>
  );
};

export default App;
