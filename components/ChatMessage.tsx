
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import type { Message, AIStatus } from '../types';
import { MessageType } from '../types';
import {
    BrainIcon, ChevronDownIcon, CopyIcon, RefreshCwIcon, CheckIcon, GitForkIcon, ThumbsUpIcon, ThumbsDownIcon, MoreHorizontalIcon
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
}

const IconButton: React.FC<{ children: React.ReactNode; onClick?: () => void; title?: string }> = ({ children, onClick, title }) => (
    <button onClick={onClick} className="text-gray-500 hover:text-gray-300 transition-colors" title={title}>
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
             {[1,2,3].map(i => <div key={i} className="aspect-square bg-white/5 animate-pulse rounded-lg" />)}
         </div>
    );
    
    if (images.length === 0) return null;

    return <ImageGallery images={images} onImageClick={(i) => onOpenLightbox(images, i)} />;
}


const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRegenerate, onFork, isLoading, aiStatus, onShowAnalysis, executionResults, onStoreExecutionResult, onFixRequest, onStopExecution, isPythonReady, t, onOpenLightbox }) => {
    const isUser = message.type === MessageType.USER;
    const [isThinkingOpen, setIsThinkingOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (aiStatus === 'thinking' || aiStatus === 'searching') setIsThinkingOpen(true);
    }, [aiStatus]);

    const messageText = useMemo(() => getTextFromMessage(message.content), [message.content]);

    const { parsedThinkingText, parsedResponseText, hasThinkingTag } = useMemo(() => {
        if (isUser) return { parsedThinkingText: null, parsedResponseText: messageText, hasThinkingTag: false };
        const text = messageText || '';
        const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
        if (thinkingMatch) {
            return {
                parsedThinkingText: thinkingMatch[1].trim(),
                parsedResponseText: text.replace(/<thinking>[\s\S]*?<\/thinking>/, '').trim(),
                hasThinkingTag: true
            };
        }
        return { parsedThinkingText: null, parsedResponseText: text, hasThinkingTag: false };
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
                let lastTextIndex = 0;
                let inlineMatch;
                while ((inlineMatch = inlineImageRegex.exec(part)) !== null) {
                    if (inlineMatch.index > lastTextIndex) {
                        finalParts.push({ type: 'text', content: part.substring(lastTextIndex, inlineMatch.index) });
                    }
                    finalParts.push({ type: 'inline-image', alt: inlineMatch[1], url: inlineMatch[2] });
                    lastTextIndex = inlineMatch.index + inlineMatch[0].length;
                }
                if (lastTextIndex < part.length) {
                    finalParts.push({ type: 'text', content: part.substring(lastTextIndex) });
                }
            }
        });
        return finalParts;
    }, [parsedResponseText]);

    const handleCopy = () => {
        const textToCopy = isUser ? messageText : parsedResponseText;
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
            });
        }
    };

    const hasThinking = !isUser && (hasThinkingTag || parsedThinkingText);
    
    if (!isUser && !isLoading && !parsedResponseText && !hasThinking && !message.groundingChunks) return null;

    return (
        <div className={`flex w-full mb-8 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex flex-col w-full max-w-[760px] ${isUser ? 'items-end' : 'items-start'}`}>
                
                {/* Thinking Block */}
                {hasThinking && (
                    <div className="w-full mb-3">
                        <button onClick={() => setIsThinkingOpen(!isThinkingOpen)} className="flex items-center gap-2 bg-[#2f2f2f] text-gray-300 hover:text-white text-xs font-medium px-4 py-1.5 rounded-full border border-white/5 transition-colors">
                            <BrainIcon className="size-3.5" />
                            <span>{t('chat.message.thinking')}</span>
                            <ChevronDownIcon className={`size-3 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isThinkingOpen && (
                            <div className="mt-2 pl-3 border-l-2 border-white/20 text-sm text-gray-400 leading-relaxed prose-sm max-w-none">
                                <div dangerouslySetInnerHTML={{ __html: marked.parse(parsedThinkingText || '') }} />
                            </div>
                        )}
                    </div>
                )}
                
                {/* Message Content */}
                <div className={`flex flex-col relative ${isUser ? 'items-end' : 'items-start w-full'}`}>
                    {isUser ? (
                        // User Bubble: Dark background, light text, rounded corners
                         <div className="bg-[#1F1F1F] text-gray-100 px-5 py-2.5 rounded-[20px] text-[15px] leading-relaxed max-w-full">
                             {messageText}
                             {message.files && message.files.length > 0 && (
                                 <div className="mt-2 flex flex-wrap gap-2">
                                     {message.files.map((f, i) => (
                                         isImageFile(f.type) ? <img key={i} src={f.dataUrl} className="size-16 object-cover rounded-lg border border-white/10" alt="" /> :
                                         <div key={i} className="px-2 py-1 bg-white/5 rounded text-xs border border-white/10">{f.name}</div>
                                     ))}
                                 </div>
                             )}
                         </div>
                    ) : (
                        // AI Response: Text only, no bubble
                        <div ref={contentRef} className="w-full text-gray-200 text-[16px] leading-relaxed space-y-4">
                            {renderableContent.map((part, index) => {
                                if (part.type === 'code') {
                                    return <CodeExecutor key={`${message.id}-${index}`} code={part.code} lang={part.lang} isExecutable={true} isPythonReady={isPythonReady} t={t} onExecutionComplete={(res) => onStoreExecutionResult(message.id, part.partIndex, res)} onFixRequest={() => onFixRequest(part.code, part.lang, '')} onStopExecution={onStopExecution} />;
                                }
                                if (part.type === 'text') {
                                    return <div key={index} className="prose max-w-none prose-invert" dangerouslySetInnerHTML={{ __html: textToHtml(part.content) }} />;
                                }
                                if (part.type === 'gallery') {
                                    return <ImageGallery key={index} images={part.images} onImageClick={(i) => onOpenLightbox(part.images, i)} />;
                                }
                                if (part.type === 'gallery-search') {
                                    return <GallerySearchLoader key={index} query={part.query} onOpenLightbox={onOpenLightbox} />;
                                }
                                if (part.type === 'inline-image') {
                                    return <InlineImage key={index} src={part.url} alt={part.alt} onExpand={() => onOpenLightbox([{url: part.url, alt: part.alt}], 0)} />;
                                }
                                return null;
                            })}
                            {isLoading && renderableContent.length === 0 && <AITextLoading />}
                        </div>
                    )}

                    {/* Grounding Sources */}
                    {message.groundingChunks && message.groundingChunks.length > 0 && (
                         <div className="mt-2 mb-1">
                             <GroundingSources chunks={message.groundingChunks} t={t} />
                         </div>
                    )}

                    {/* Message Actions - AI Only */}
                    {!isLoading && !isUser && (
                        <div className="flex items-center gap-4 mt-2 pl-0.5">
                            <IconButton onClick={handleCopy} title={t('chat.message.copy')}>
                                {isCopied ? <CheckIcon className="size-3.5 text-green-500" /> : <CopyIcon className="size-3.5" />}
                            </IconButton>
                            <IconButton onClick={() => onRegenerate(message.id)} title={t('chat.message.regenerate')}>
                                <RefreshCwIcon className="size-3.5" />
                            </IconButton>
                            <IconButton title="Like">
                                <ThumbsUpIcon className="size-3.5" />
                            </IconButton>
                            <IconButton title="Dislike">
                                <ThumbsDownIcon className="size-3.5" />
                            </IconButton>
                            <IconButton onClick={() => onFork(message.id)} title={t('chat.message.fork')}>
                                <MoreHorizontalIcon className="size-3.5" />
                            </IconButton>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
export default ChatMessage;