
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import type { Message, AIStatus } from '../types';
import { MessageType } from '../types';
import {
    BrainIcon, ChevronDownIcon, CheckIcon, GitForkIcon, MessageRefreshIcon, MessageCopyIcon, CornerDownRightIcon
} from './icons';
import { CodeExecutor } from './CodeExecutor';
import AITextLoading from './AITextLoading';
import ImageGallery from './ImageGallery';
import InlineImage from './InlineImage';
import GroundingSources from './GroundingSources';

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

const iconBtnClass = "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-8 w-8 rounded-full text-gray-500 dark:text-[#a1a1aa] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#333333]";
const shareFactBtnClass = "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-9 rounded-xl px-3.5 py-1.5 text-sm text-gray-500 dark:text-[#a1a1aa] hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#333333] border border-transparent hover:border-gray-200 dark:hover:border-[#333]";

const IconButton: React.FC<{ children: React.ReactNode; onClick?: () => void; title: string }> = ({ children, onClick, title }) => (
    <button onClick={onClick} className={iconBtnClass} title={title}>
        {children}
    </button>
);

const SuggestionButton: React.FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => (
    <button onClick={onClick} className={shareFactBtnClass}>
        {children}
    </button>
);

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
             {[1,2,3].map(i => <div key={i} className="aspect-square bg-gray-100 dark:bg-[#292929] animate-pulse rounded-lg" />)}
         </div>
    );
    
    if (images.length === 0) return null;

    return <ImageGallery images={images} onImageClick={(i) => onOpenLightbox(images, i)} />;
}


const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRegenerate, onFork, isLoading, aiStatus, onShowAnalysis, executionResults, onStoreExecutionResult, onFixRequest, onStopExecution, isPythonReady, t, onOpenLightbox, isLast, onSendSuggestion }) => {
    const isUser = message.type === MessageType.USER;
    const [isThinkingOpen, setIsThinkingOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (aiStatus === 'thinking' || aiStatus === 'searching') setIsThinkingOpen(true);
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
        const inlineImageRegex = /!g\[(.*?)\]\((.*?)\)/g;

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
            <div className="flex justify-end w-full mb-8">
                <div className="flex flex-col items-end max-w-[85%]">
                     <div className="bg-[#f4f4f5] dark:bg-[#212121] text-gray-900 dark:text-gray-200 px-5 py-3 rounded-[24px] rounded-br-lg border border-gray-200 dark:border-[#333333] shadow-sm mb-2">
                        <div className="whitespace-pre-wrap leading-relaxed text-[16px]">{messageText}</div>
                    </div>
                    
                    {/* Attachments */}
                    {message.files && message.files.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-2 mb-2">
                            {message.files.map((file, i) => (
                                <div key={i} className="relative group rounded-xl overflow-hidden border border-gray-200 dark:border-[#333333]">
                                    {isImageFile(file.type) ? (
                                        <img src={file.dataUrl} alt={file.name} className="h-24 w-auto object-cover" />
                                    ) : (
                                        <div className="h-24 w-24 bg-gray-100 dark:bg-[#292929] flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 p-2 text-center">
                                            {file.name}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <div className="flex space-x-2">
                        <IconButton title="Copy" onClick={handleCopy}>
                            {isCopied ? <CheckIcon className="size-4 text-green-500" /> : <MessageCopyIcon className="size-4" />}
                        </IconButton>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full mb-8 max-w-[95%]">
             {/* Thinking Block */}
             {hasThinkingTag && parsedThinkingText && (
                <div className="mb-4">
                     <div onClick={() => setIsThinkingOpen(!isThinkingOpen)} className="flex items-center gap-2 cursor-pointer text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-gray-200 transition-colors w-fit p-1 rounded-lg">
                        <BrainIcon className={`size-4 ${isLoading && aiStatus === 'thinking' ? 'animate-pulse text-[#1d9bf0]' : ''}`} />
                        <span className="text-sm font-medium">{t('chat.message.thinking')}</span>
                        <ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} />
                    </div>
                    {isThinkingOpen && (
                        <div className="mt-2 pl-3 border-l-2 border-gray-200 dark:border-[#333] text-gray-500 dark:text-gray-400 text-sm italic whitespace-pre-wrap animate-fade-in-up">
                            {parsedThinkingText}
                        </div>
                    )}
                </div>
            )}
            
            {/* Main AI Message Content */}
            <div className="text-gray-900 dark:text-[#e4e4e7] text-[16px] leading-relaxed w-full">
                 {/* Empty State / Loading */}
                 {!parsedResponseText && isLoading && !parsedThinkingText && (
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                        {aiStatus === 'searching' && <span className="animate-pulse">Searching the web...</span>}
                        {aiStatus === 'generating' && <AITextLoading />}
                        {aiStatus === 'thinking' && !hasThinkingTag && <span className="animate-pulse">Thinking...</span>}
                    </div>
                )}
                
                {renderableContent.map((part: any, index: number) => {
                    if (part.type === 'code') {
                         const resultKey = `${message.id}_${part.partIndex}`;
                         const result = executionResults[resultKey];
                         // Auto-execute if not executed yet and isPythonReady (for Python)
                         const isPython = part.lang === 'python';
                         const shouldAutorun = isPython && !result;

                         return (
                            <div key={index} className="w-full my-4">
                                <CodeExecutor
                                    code={part.code}
                                    lang={part.lang}
                                    isExecutable={['python', 'javascript', 'js', 'html', 'react', 'jsx'].includes(part.lang.toLowerCase())}
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

            {/* Sources */}
            {message.groundingChunks && message.groundingChunks.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                    <GroundingSources chunks={message.groundingChunks} t={t} />
                </div>
            )}

            {/* AI Action Icons Row */}
            <div className="flex items-center space-x-0 mt-3 text-gray-500 text-sm">
                <IconButton title={t('chat.message.regenerate')} onClick={() => onRegenerate(message.id)}>
                    <MessageRefreshIcon className="size-4" />
                </IconButton>
                <IconButton title={t('chat.message.copy')} onClick={handleCopy}>
                    {isCopied ? <CheckIcon className="size-4 text-green-500" /> : <MessageCopyIcon className="size-4" />}
                </IconButton>
                <IconButton title={t('chat.message.fork')} onClick={() => onFork(message.id)}>
                    <GitForkIcon className="size-4" />
                </IconButton>
                {message.generationDuration && (
                     <span className="ml-2 text-gray-500 dark:text-gray-600 text-xs select-none">{(message.generationDuration / 1000).toFixed(1)}s</span>
                )}
            </div>
            
            {/* Suggestions */}
            {isLast && suggestions.length > 0 && !isLoading && (
                 <div className="mt-4 flex flex-col items-start gap-2 animate-fade-in-up">
                    {suggestions.map((suggestion, idx) => (
                        <SuggestionButton key={idx} onClick={() => onSendSuggestion(suggestion)}>
                             <CornerDownRightIcon className="size-4 text-gray-500" />
                             <span className="truncate max-w-[300px]">{suggestion}</span>
                        </SuggestionButton>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ChatMessage;
