
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  MessageType, Message, Conversation, LocationInfo, 
  AIStatus, ExecutionResult, FileAttachment 
} from './types';
import { useTranslations } from './hooks/useTranslations';
import { Sidebar } from './components/Sidebar';
import { ChatInput, ChatMessage } from './components/Chat';
import { SettingsModal, WelcomeModal, Lightbox } from './components/Modals';
import { streamMessageToAI } from './services/geminiService';
import { stopPythonExecution } from './services/pythonExecutorService';

const App: React.FC = () => {
  const [isPythonReady, setIsPythonReady] = useState(false);
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
  const [executionResults, setExecutionResults] = useState<Record<string, any>>({});
  const [chatInputText, setChatInputText] = useState('');
  const [lightboxState, setLightboxState] = useState<{ images: any[]; startIndex: number; } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { t } = useTranslations(language);

  useEffect(() => {
    const savedConvos = localStorage.getItem('conversations');
    if (savedConvos) setConversations(JSON.parse(savedConvos));
    const hasSeenWelcome = localStorage.getItem('welcome_seen');
    if (!hasSeenWelcome) setShowWelcome(true);
    setTimeout(() => setIsPythonReady(true), 2000);
  }, []);

  useEffect(() => { localStorage.setItem('conversations', JSON.stringify(conversations)); }, [conversations]);
  
  useEffect(() => { 
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches); 
    document.documentElement.classList.toggle('dark', isDark); 
  }, [theme]);

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
      let conversationsCopy = [...prev];
      let convo = conversationsCopy.find(c => c.id === currentConvoId);
      if (!convo) { 
        convo = { id: Date.now().toString(), title: text.slice(0, 40) || 'New Chat', messages: [], createdAt: new Date().toISOString() }; 
        conversationsCopy = [convo, ...conversationsCopy]; 
        currentConvoId = convo.id; 
        setActiveConversationId(convo.id); 
      }
      history = [...convo.messages];
      convo.messages.push(newUserMsg, { id: aiMsgId, type: MessageType.AI_RESPONSE, content: '' });
      return conversationsCopy;
    });
    
    setIsLoading(true); setAiStatus('thinking');
    const abort = new AbortController(); abortControllerRef.current = abort;
    
    await streamMessageToAI(history, text, attachments, undefined, userLocation, language, abort.signal, (update) => {
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

  const activeConversation = conversations.find(c => c.id === activeConversationId);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar isOpen={isSidebarOpen} toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} conversations={conversations} activeConversationId={activeConversationId} onNewChat={() => setActiveConversationId(null)} onSelectConversation={setActiveConversationId} onDeleteConversation={(id) => setConversations(prev => prev.filter(c => c.id !== id))} onOpenSettings={() => setIsSettingsOpen(true)} t={t} />
      <main className={`flex-1 flex flex-col h-full relative transition-all duration-500 ${isSidebarOpen ? 'lg:pl-[320px]' : ''}`}>
        {!isSidebarOpen && <button onClick={() => setIsSidebarOpen(true)} className="fixed top-4 left-4 z-[70] p-3 rounded-full bg-surface-l1 border border-border shadow-lg">Menu</button>}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32">
          <div className="max-w-3xl mx-auto space-y-8">
            {(!activeConversation || activeConversation.messages.length === 0) ? (
              <div className="h-full flex flex-col items-center justify-center opacity-40 py-20">
                <img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP" className="size-48 mb-8" />
                <h1 className="text-4xl font-bold">KIPP</h1>
              </div>
            ) : (
              activeConversation.messages.map((msg, index) => (
                <ChatMessage key={msg.id} message={msg} onRegenerate={() => {}} onFork={() => {}} isLoading={isLoading && index === activeConversation.messages.length - 1} aiStatus={aiStatus} executionResults={executionResults} onStoreExecutionResult={(msgId, partIdx, res) => setExecutionResults(prev => ({...prev, [`${msgId}_${partIdx}`]: res}))} onFixRequest={() => {}} onStopExecution={() => stopPythonExecution()} isPythonReady={isPythonReady} t={t} onOpenLightbox={(imgs, idx) => setLightboxState({ images: imgs, startIndex: idx })} isLast={index === activeConversation.messages.length - 1} onSendSuggestion={handleSendMessage} />
              ))
            )}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
          <div className="max-w-3xl mx-auto">
            <ChatInput text={chatInputText} onTextChange={setChatInputText} onSendMessage={handleSendMessage} isLoading={isLoading} t={t} onAbortGeneration={() => abortControllerRef.current?.abort()} replyContextText={null} onClearReplyContext={() => {}} language={language} />
          </div>
        </div>
      </main>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage} conversations={conversations} setConversations={setConversations} t={t} />
      {lightboxState && <Lightbox images={lightboxState.images} startIndex={lightboxState.startIndex} onClose={() => setLightboxState(null)} />}
      {showWelcome && <WelcomeModal onComplete={() => { setShowWelcome(false); localStorage.setItem('welcome_seen', 'true'); }} onLocationUpdate={(loc) => setUserLocation(loc)} t={t} />}
    </div>
  );
};

export default App;
