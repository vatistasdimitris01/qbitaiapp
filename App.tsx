

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { Message, FileAttachment, Conversation, Persona, LocationInfo, AIStatus, GroundingChunk, MapsGroundingChunk } from './types';
import { MessageType } from './types';
import ChatInput, { ChatInputHandle } from './components/ChatInput';
import ChatMessage from './components/ChatMessage';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import LocationBanner from './components/LocationBanner';
import CodeAnalysisModal from './components/CodeAnalysisModal';
import SelectionPopup from './components/SelectionPopup';
import DragDropOverlay from './components/DragDropOverlay';
import Lightbox from './components/Lightbox';
import GreetingMessage from './components/GreetingMessage';
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

// Custom hook for debouncing an effect
const useDebouncedEffect = (effect: () => void, deps: React.DependencyList, delay: number) => {
    useEffect(() => {
        const handler = setTimeout(() => effect(), delay);
        return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, delay]);
};

const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const GREETINGS = [
    "What are you working on?",
    "Where should we begin?",
    "Hey, Ready to dive in?",
    "What’s on your mind today?",
    "Ready when you are.",
    "What’s on the agenda today?",
    "Good to see you!",
    "How can I help?",
];

const getRandomGreeting = () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)];


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
  const [theme, setTheme] = useState('dark');
  const [language, setLanguage] = useState<Language>('en');
  const [userLocation, setUserLocation] = useState<LocationInfo | null>(null);
  const [appHeight, setAppHeight] = useState(window.innerHeight);
  
  const [analysisModalContent, setAnalysisModalContent] = useState<{ code: string; lang: string } | null>(null);
  const [executionResults, setExecutionResults] = useState<Record<string, ExecutionResult>>({});
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const [chatInputText, setChatInputText] = useState('');
  const [replyContextText, setReplyContextText] = useState<string | null>(null);
  const [selectionPopup, setSelectionPopup] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxState, setLightboxState] = useState<{
    images: { url: string; alt: string; source?: string }[];
    startIndex: number;
  } | null>(null);


  const mainContentRef = useRef<HTMLElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const dragCounter = useRef(0);
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

  // Text selection handler for "Ask Qbit" popup
  useEffect(() => {
    const handleSelection = () => {
        const selection = window.getSelection();

        // Condition to hide popup: no selection or selection is too short
        if (!selection || selection.isCollapsed || selection.toString().trim().length < 3) {
            setSelectionPopup(null);
            return;
        }

        // Condition to show popup
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as HTMLElement;

            // Only show if selection is within the chat area and not in an editable field or on the popup itself
            if (element && mainContentRef.current?.contains(element) && !element.closest('textarea, input, [contenteditable="true"], .selection-popup-container')) {
                const rect = range.getBoundingClientRect();
                setSelectionPopup({
                    visible: true,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                    text: selection.toString().trim(),
                });
            } else {
                 setSelectionPopup(null);
            }
        }
    }

    const handleMouseUp = () => {
        // Timeout ensures the selection object is updated before we check it
        setTimeout(handleSelection, 10);
    }
    
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
        document.removeEventListener('mouseup', handleMouseUp);
    };
}, []);

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current === 0) {
          setIsDragging(false);
      }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
          chatInputRef.current?.handleFiles(files);
      }
  }, []);

  useEffect(() => {
      window.addEventListener('dragenter', handleDragEnter);
      window.addEventListener('dragleave', handleDragLeave);
      window.addEventListener('dragover', handleDragOver);
      window.addEventListener('drop', handleDrop);
      return () => {
          window.removeEventListener('dragenter', handleDragEnter);
          window.removeEventListener('dragleave', handleDragLeave);
          window.removeEventListener('dragover', handleDragOver);
          window.removeEventListener('drop', handleDrop);
      };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

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
    
    if (savedTheme) {
        setTheme(savedTheme);
    } else {
        setTheme('dark');
    }

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

  // Debounced saving to localStorage to prevent performance issues during streaming
    useDebouncedEffect(() => {
        localStorage.setItem('conversations', JSON.stringify(conversations));
    }, [conversations], 500);

    useDebouncedEffect(() => {
        localStorage.setItem('executionResults', JSON.stringify(executionResults));
    }, [executionResults], 500);

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
        greeting: getRandomGreeting(),
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
              greeting: getRandomGreeting(),
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

  const handleAskWithSelection = (text: string) => {
    setReplyContextText(text);
    setSelectionPopup(null);
    setTimeout(() => chatInputRef.current?.focus(), 50);
  };
  
  const handleOpenLightbox = (images: any[], startIndex: number) => {
    setLightboxState({ images, startIndex });
  };

  const handleCloseLightbox = () => {
      setLightboxState(null);
  };

  const handleSendMessage = async (text: string, files: File[] = []) => {
    if (!activeConversationId || !activeConversation) return;
    const trimmedText = text.trim();
    if (isLoading || (!trimmedText && files.length === 0 && !replyContextText)) return;

    let messageToSend = trimmedText;
    if (trimmedText === '' && files.length > 0 && !replyContextText) {
        messageToSend = t('chat.input.messageWithFiles', { count: files.length.toString() });
    } else if (trimmedText === '' && replyContextText) {
        messageToSend = 'Please elaborate on this.';
    }

    if (replyContextText) {
        const contextPrefix = t('chat.replyContext', { context: replyContextText });
        messageToSend = `${contextPrefix}\n\n${messageToSend}`;
    }

    const userMessageId = `user-${Date.now()}`;
    const objectUrls: string[] = [];

    // --- Fast Track: Create message for immediate UI update with lightweight object URLs ---
    const uiAttachments: FileAttachment[] = files.map(file => {
        const url = URL.createObjectURL(file);
        objectUrls.push(url);
        return {
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl: url
        };
    });

    const userMessage: Message = {
        id: userMessageId,
        type: MessageType.USER,
        content: messageToSend,
        files: uiAttachments,
    };
    
    const isFirstMessage = activeConversation.messages.length === 0;
    
    const aiMessageId = `ai-${Date.now()}`;
    const placeholderAiMessage: Message = {
      id: aiMessageId,
      type: MessageType.AI_RESPONSE,
      content: '',
    };
    
    const conversationHistoryForState = [...activeConversation.messages, userMessage];
    
    setReplyContextText(null);

    setConversations(prev => prev.map(c => 
        c.id === activeConversationId 
            ? {
                ...c,
                messages: [...conversationHistoryForState, placeholderAiMessage],
                ...(isFirstMessage && messageToSend && { title: messageToSend.substring(0, 50) })
              }
            : c
    ));

    setTimeout(() => scrollToBottom('smooth'), 0);

    // --- Slow Track: Convert files to base64 for persistence, without blocking UI ---
    if (files.length > 0) {
      Promise.all(files.map(fileToDataURL)).then(dataUrls => {
          const persistentAttachments: FileAttachment[] = files.map((file, index) => ({
              name: file.name,
              type: file.type,
              size: file.size,
              dataUrl: dataUrls[index]
          }));

          setConversations(prev => prev.map(c => {
              if (c.id === activeConversationId) {
                  const updatedMessages = c.messages.map(msg =>
                      msg.id === userMessageId ? { ...msg, files: persistentAttachments } : msg
                  );
                  return { ...c, messages: updatedMessages };
              }
              return c;
          }));

          // Clean up the temporary object URLs after they've been replaced in the state
          objectUrls.forEach(url => URL.revokeObjectURL(url));
      });
    }

    // --- API Call ---
    setIsLoading(true);
    setAiStatus('thinking');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentPersona = personas.find(p => p.id === activeConversation.personaId);
    
    await streamMessageToAI(
        activeConversation.messages, // History
        messageToSend,
        files, // Pass raw File objects for efficient upload
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

    const historyForApi = activeConversation.messages.slice(0, lastUserMessageIndex);

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
        [], // Use empty array for files, as they are in history
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

  if (!isAppReady) {
    return <Loader t={t} />;
  }

  return (
    <div style={{ height: appHeight }} className="flex bg-background text-foreground font-sans overflow-hidden">
        {isDragging && <DragDropOverlay t={t} />}
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
              <div className="max-w-4xl mx-auto px-2 sm:px-6 pt-8 pb-4 h-full">
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
                                      onStopExecution={handleStopExecution}
                                      isPythonReady={isPythonReady}
                                      t={t}
                                      onOpenLightbox={handleOpenLightbox}
                                  />;
                      })
                  ) : activeConversation ? (
                      <div className="w-full h-full flex items-center justify-center">
                          <GreetingMessage text={activeConversation.greeting || "How can I help?"} />
                      </div>
                  ) : null}
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
                <ChatInput 
                  ref={chatInputRef}
                  text={chatInputText}
                  onTextChange={setChatInputText}
                  onSendMessage={handleSendMessage} 
                  isLoading={isLoading} 
                  t={t} 
                  onAbortGeneration={handleAbortGeneration}
                  replyContextText={replyContextText}
                  onClearReplyContext={() => setReplyContextText(null)}
                />
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
        {selectionPopup && selectionPopup.visible && (
            <SelectionPopup
                x={selectionPopup.x}
                y={selectionPopup.y}
                text={selectionPopup.text}
                onAsk={handleAskWithSelection}
                t={t}
            />
        )}
        {lightboxState && (
            <Lightbox
                images={lightboxState.images}
                startIndex={lightboxState.startIndex}
                onClose={handleCloseLightbox}
            />
        )}
    </div>
  );
};

export default App;