
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import type { Message, AIStatus, GroundingChunk } from '../types';
import { MessageType } from '../types';
import {
    BrainIcon, ChevronDownIcon, CheckIcon, GitForkIcon, MessageRefreshIcon, MessageCopyIcon, CornerDownRightIcon, SearchIcon, MapPinIcon
} from './icons';
import { CodeExecutor } from './CodeExecutor';
import ImageGallery from './ImageGallery';
import InlineImage from './InlineImage';
import GroundingSources from './GroundingSources';
import GenerativeUI from './GenerativeUI';
import GeneratingLoader from './GeneratingLoader';

type ExecutionResult = {
  output: string | null;
  error: string;
  type: 'string' | 'image-base64' | 'plotly-json' | 'error';
  downloadableFile?: { filename: string; mimetype: string; data: string; };
};

interface ChatMessageProps {
    message: Message;
    onRegenerate: (messageId: string) => void;
    onFork: (messageId: string) => void;
    isLoading: boolean;
    aiStatus: AIStatus;
    onShowAnalysis: (code: string, lang: string) => void;
    executionResults: Record<string, ExecutionResult>;
    onStoreExecutionResult: (messageId: string, partIndex: number, result: ExecutionResult) => void;
    onFixRequest: (code: string, lang: string, error: string) => void;
    onStopExecution: () => void;
    isPythonReady: boolean;
    t: (key: string) => string;
    onOpenLightbox: (images: any[], startIndex: number) => void;
    isLast: boolean;
    onSendSuggestion: (text: string) => void;
}

const isImageFile = (mimeType: string) => mimeType.startsWith('image/');

const getTextFromMessage = (content: any): string => {
    if (typeof content === 'string') return content;
    return '';
}

const textToHtml = (text: string): string => {
    if (!text) return '';
    const placeholders: { [key:string]: string } = {};
    let placeholderId = 0;
    const mathRegex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\(.+?\\\)|(\$[^\$\n\r]+?\$))/g;
    const textWithPlaceholders = text.replace(mathRegex, (match) => {
        const id = `__QBIT_PLACEHOLDER_${placeholderId++}__`;
        placeholders[id] = match;
        return id;
    });
    let html = marked.parse(textWithPlaceholders, { breaks: true, gfm: true }) as string;
    for (const id in placeholders) {
        html = html.replace(id, placeholders[id]);
    }
    return html;
};

const GallerySearchLoader: React.FC<{ query: string, onOpenLightbox: (images: any[], index: number) => void }> = ({ query, onOpenLightbox }) => {
    const [images, setImages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchImages = async () => {
            try {
                setLoading(true);
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageSearchQuery: query })
                });
                const data = await res.json();
                if (data.images && Array.isArray(data.images)) {
                    setImages(data.images.map((url: string) => ({ url, alt: query })));
                }
            } catch (e) {
                console.error("Failed to fetch gallery images", e);
            } finally {
                setLoading(false);
            }
        }
        if (query) fetchImages();
    }, [query]);

    if (loading) return (
         <div className="grid grid-cols-3 gap-1.5 my-2 max-w-xl">
             {[1,2,3].map(i => <div key={i} className="aspect-square bg-surface-l2 animate-pulse rounded-lg" />)}
         </div>
    );
    
    if (images.length === 0) return null;

    return <ImageGallery images={images} onImageClick={(i) => onOpenLightbox(images, i)} />;
}

// Globe/Browsing Icon
const GlobeIcon: React.FC<{className?: string}> = ({className}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path>
        <path d="M2 12h20"></path>
    </svg>
);

const SearchCounter: React.FC<{ target: number }> = ({ target }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        if (target <= 0) return;
        
        let start = 0;
        const duration = 1000; // 1 second animation
        const startTime = performance.now();
        
        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Ease out cubic
            const ease = 1 - Math.pow(1 - progress, 3);
            
            const current = Math.floor(ease * target);
            setCount(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                setCount(target);
            }
        };

        requestAnimationFrame(animate);
    }, [target]);

    return <span>{count.toLocaleString()}</span>;
};


const SearchStatus: React.FC<{ sources?: GroundingChunk[], resultCount?: number }> = ({ sources, resultCount }) => {
    const [step, setStep] = useState(0); // 0: Searching, 1: Found/Browsing
    
    useEffect(() => {
        if (sources && sources.length > 0) {
            setStep(1);
        }
    }, [sources]);

    return (
        <div className="flex flex-col gap-1 cursor-crosshair text-sm mb-4 animate-fade-in-up">
            <div className="flex flex-row items-center gap-2 cursor-pointer hover:opacity-80">
                <div className="flex flex-row items-center gap-2 text-foreground">
                    <SearchIcon className={`size-4 ${step === 0 ? 'animate-pulse text-accent-blue' : 'text-muted-foreground'}`} />
                    <div className={step === 0 ? 'font-medium' : 'text-muted-foreground'}>
                        {step === 0 ? 'Searching the web' : 'Searching the web'}
                    </div>
                </div>
                {step === 1 && (
                    <div className="text-muted-foreground text-xs">
                        {resultCount && resultCount > 0 ? (
                            <>
                                <SearchCounter target={resultCount} /> results
                            </>
                        ) : (
                            `${sources?.length || 0} results`
                        )}
                    </div>
                )}
            </div>
            
            {step === 1 && sources && sources.length > 0 && (
                <div className="flex flex-row items-center gap-2 cursor-pointer hover:opacity-80 animate-fade-in-up">
                    <div className="flex flex-row items-center gap-2 text-foreground">
                        <GlobeIcon className="size-4 animate-pulse text-accent-blue" />
                        <div className="font-medium">Browsing</div>
                    </div>
                    {/* Show first source link as a sample */}
                    <div className="text-muted-foreground text-xs truncate max-w-[200px]">
                        {'web' in sources[0] ? sources[0].web.uri : sources[0].maps.uri}
                    </div>
                </div>
            )}
        </div>
    );
};


const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRegenerate, onFork, isLoading, aiStatus, onShowAnalysis, executionResults, onStoreExecutionResult, onFixRequest, onStopExecution, isPythonReady, t, onOpenLightbox, isLast, onSendSuggestion }) => {
    const isUser = message.type === MessageType.USER;
    const isError = message.type === MessageType.ERROR;
    
    const [isThinkingOpen, setIsThinkingOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
        if (aiStatus === 'thinking') setIsThinkingOpen(true);
    }, [aiStatus]);

    const messageText = useMemo(() => getTextFromMessage(message.content), [message.content]);

    const { parsedThinkingText, parsedResponseText, hasThinkingTag, suggestions } = useMemo(() => {
        if (isUser) return { parsedThinkingText: null, parsedResponseText: messageText, hasThinkingTag: false, suggestions: [] };
        
        let text = messageText || '';
        let extractedSuggestions: string[] = [];

        // Parse Suggestions <suggestions>...</suggestions>
        const suggestionsMatch = text.match(/<suggestions>(.*?)<\/suggestions>/s);
        if (suggestionsMatch) {
            try {
                extractedSuggestions = JSON.parse(suggestionsMatch[1]);
            } catch (e) {
                console.warn("Failed to parse suggestions JSON", e);
            }
            text = text.replace(/<suggestions>.*?<\/suggestions>/s, '').trim();
        }

        // Parse Thinking <thinking>...</thinking>
        const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
        let thinking = null;
        let response = text;
        let hasTag = false;

        if (thinkingMatch) {
            thinking = thinkingMatch[1].trim();
            response = text.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim();
            hasTag = true;
        }

        return {
            parsedThinkingText: thinking,
            parsedResponseText: response,
            hasThinkingTag: hasTag,
            suggestions: extractedSuggestions
        };
    }, [messageText, isUser]);

    const renderableContent = useMemo(() => {
        const textToRender = parsedResponseText;
        if (!textToRender) return [];
    
        const blockRegex = /(```[\w\s\S]*?```|!gallery\[".*?"\])/g;
        
        let finalParts: any[] = [];
        let partIndex = 0;

        textToRender.split(blockRegex).filter(Boolean).forEach(part => {
            if (part.startsWith('```')) {
                const codeMatch = /```([\w-]+)?(?:[^\n]*)?\n([\s\S]*?)```/.exec(part);
                if (codeMatch) {
                    const lang = codeMatch[1] || 'plaintext';
                    const code = codeMatch[2];
                    if (lang === 'json-gallery') {
                         try {
                            const galleryData = JSON.parse(code);
                            if (galleryData.type === 'image_gallery' && Array.isArray(galleryData.images)) {
                                finalParts.push({ type: 'gallery', images: galleryData.images });
                            }
                        } catch (e) { }
                    } else {
                        finalParts.push({ type: 'code', lang, code, info: part.split('\n')[0].substring(3).trim(), partIndex: partIndex++ });
                    }
                }
            } else if (part.startsWith('!gallery')) {
                const match = /!gallery\["(.*?)"\]/.exec(part);
                 if (match && match[1]) {
                    finalParts.push({ type: 'gallery-search', query: match[1] });
                 }
            } else {
                 finalParts.push({ type: 'text', content: part });
            }
        });

        return finalParts;
    }, [parsedResponseText]);

    const handleCopy = () => {
        navigator.clipboard.writeText(parsedResponseText).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    if (isUser) {
        return (
            <div className="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-4 items-end">
                <div className="message-bubble relative rounded-3xl text-foreground min-h-7 prose dark:prose-invert break-words bg-surface-l1 border border-border max-w-[100%] @sm/mainview:max-w-[90%] px-4 py-2 rounded-br-lg">
                    <div className="whitespace-pre-wrap leading-relaxed text-[16px]">{messageText}</div>
                </div>
                {/* Attachments */}
                {message.files && message.files.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-2 mt-2">
                        {message.files.map((file, i) => (
                            <div key={i} className="relative group rounded-xl overflow-hidden border border-border">
                                {isImageFile(file.type) ? (
                                    <img src={file.dataUrl} alt={file.name} className="h-20 w-auto object-cover" />
                                ) : (
                                    <div className="h-20 w-20 bg-surface-l2 flex items-center justify-center text-xs text-muted-foreground p-2 text-center break-all">
                                        {file.name}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    if (isError) {
        return (
            <div className="flex flex-col w-full mb-8 max-w-full">
                <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 text-sm">
                    {messageText || "An unknown error occurred."}
                </div>
                <div className="flex items-center space-x-0 mt-2 text-muted-foreground">
                    <button className="p-1 hover:bg-surface-l2 rounded-full" onClick={() => onRegenerate(message.id)} title={t('chat.message.regenerate')}>
                        <MessageRefreshIcon className="size-4" />
                    </button>
                </div>
            </div>
        )
    }

    // Check if we have any content to show (text or tools)
    const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
    const hasText = !!parsedResponseText;
    const hasContent = hasText || hasToolCalls;
    
    // Determine if we should show the search UI
    // Show search UI if:
    // 1. Status is 'searching'
    // 2. OR we have grounding chunks and we are still loading (generating text after search)
    // 3. OR we have grounding chunks but no text yet (so search is "done" but AI hasn't spoken)
    const showSearchUI = (aiStatus === 'searching') || (message.groundingChunks && message.groundingChunks.length > 0 && (!hasContent || isLoading));

    return (
        <div className="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-4 items-start">
             {/* Thinking Block */}
             {hasThinkingTag && parsedThinkingText && (
                <div className="mb-2">
                     <div onClick={() => setIsThinkingOpen(!isThinkingOpen)} className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors w-fit p-1 rounded-lg">
                        <BrainIcon className={`size-4 ${isLoading && aiStatus === 'thinking' ? 'animate-pulse text-accent-blue' : ''}`} />
                        <span className="text-sm font-medium">{t('chat.message.thinking')}</span>
                        <ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} />
                    </div>
                    {isThinkingOpen && (
                        <div className="mt-2 pl-3 border-l-2 border-border text-muted-foreground text-sm italic whitespace-pre-wrap animate-fade-in-up">
                            {parsedThinkingText}
                        </div>
                    )}
                </div>
            )}
            
            {/* Search Status */}
            {showSearchUI && (
                <SearchStatus sources={message.groundingChunks} resultCount={message.searchResultCount} />
            )}

            {/* Main AI Message Content */}
            <div className={`message-bubble relative rounded-3xl text-foreground min-h-7 prose dark:prose-invert break-words w-full max-w-none px-4 py-2 ${!hasContent ? 'min-h-0 py-0' : ''}`}>
                 {/* Empty State / Loading - Only show Generic loader if NOT searching and NOT generated content */}
                 {!hasContent && isLoading && !parsedThinkingText && !showSearchUI && (
                    <div className="flex items-center gap-2 text-muted-foreground min-h-[28px]">
                        {(aiStatus === 'generating' || (aiStatus === 'thinking' && !hasThinkingTag)) && (
                            <GeneratingLoader />
                        )}
                    </div>
                )}
                
                {/* Tool Calls (Generative UI) */}
                {hasToolCalls && (
                     <div className="w-full mb-4 space-y-4">
                         {message.toolCalls!.map((toolCall, idx) => (
                             <GenerativeUI key={idx} toolName={toolCall.name} args={toolCall.args} />
                         ))}
                     </div>
                )}

                {renderableContent.map((part: any, index: number) => {
                    if (part.type === 'code') {
                         const resultKey = `${message.id}_${part.partIndex}`;
                         const result = executionResults[resultKey];
                         const isPython = part.lang === 'python';
                         const shouldAutorun = isPython && !result;

                         return (
                            <div key={index} className="w-full my-4 not-prose">
                                <CodeExecutor
                                    code={part.code}
                                    lang={part.lang}
                                    title={part.lang.toUpperCase()}
                                    isExecutable={['python', 'html'].includes(part.lang.toLowerCase())}
                                    autorun={shouldAutorun}
                                    onExecutionComplete={(res) => onStoreExecutionResult(message.id, part.partIndex, res)}
                                    onFixRequest={(err) => onFixRequest(part.code, part.lang, err)}
                                    persistedResult={result}
                                    onStopExecution={onStopExecution}
                                    isPythonReady={isPythonReady}
                                    isLoading={isLoading}
                                    t={t}
                                />
                            </div>
                        );
                    }
                    if (part.type === 'gallery-search') {
                        return <GallerySearchLoader key={index} query={part.query} onOpenLightbox={onOpenLightbox} />;
                    }
                     if (part.type === 'gallery') {
                        const galleryImages = part.images.map((img: string) => ({ url: img, alt: 'Generated Image' }));
                        return <div key={index} className="my-4"><ImageGallery images={galleryImages} onImageClick={(i) => onOpenLightbox(galleryImages, i)} /></div>;
                    }

                    return (
                        <div key={index} className="prose dark:prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: textToHtml(part.content) }} />
                    );
                })}
            </div>

            {/* Sources (Final list) */}
            {message.groundingChunks && message.groundingChunks.length > 0 && !isLoading && (
                <div className="mt-2 flex flex-wrap gap-2">
                    <GroundingSources chunks={message.groundingChunks} t={t} />
                </div>
            )}

            {/* AI Action Icons Row - Always visible on mobile, hover only on desktop */}
            <div className="flex items-center gap-1 mt-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-200 w-full justify-start px-2">
                <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.regenerate')} onClick={() => onRegenerate(message.id)}>
                    <MessageRefreshIcon className="size-4" />
                </button>
                <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.copy')} onClick={handleCopy}>
                    {isCopied ? <CheckIcon className="size-4 text-green-500" /> : <MessageCopyIcon className="size-4" />}
                </button>
                <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.fork')} onClick={() => onFork(message.id)}>
                    <GitForkIcon className="size-4" />
                </button>
                {message.generationDuration && (
                     <span className="ml-2 text-muted-foreground text-xs select-none font-mono">{(message.generationDuration / 1000).toFixed(1)}s</span>
                )}
            </div>
            
            {/* Suggestions */}
            {isLast && suggestions.length > 0 && !isLoading && (
                 <div className="mt-4 flex flex-col items-start gap-2 animate-fade-in-up w-full">
                    {suggestions.map((suggestion, idx) => (
                        <button 
                            key={idx} 
                            onClick={() => onSendSuggestion(suggestion)}
                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-9 rounded-xl px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-l2 border border-transparent hover:border-border"
                        >
                             <CornerDownRightIcon className="size-3.5 text-muted-foreground" />
                             <span className="truncate max-w-[300px]">{suggestion}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ChatMessage;
