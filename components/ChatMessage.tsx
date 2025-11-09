
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import type { Message, AIStatus } from '../types';
import { MessageType } from '../types';
import {
    BrainIcon, ChevronDownIcon, CopyIcon, RefreshCwIcon, FileTextIcon, CodeXmlIcon, CheckIcon, GitForkIcon, MapPinIcon
} from './icons';
import { CodeExecutor } from './CodeExecutor';
import AITextLoading from './AITextLoading';
import AudioPlayer from './AudioPlayer';
import ImageGallery from './ImageGallery';
import InlineImage from './InlineImage';
import SkeletonLoader from './SkeletonLoader';

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

const IconButton: React.FC<{ children: React.ReactNode; onClick?: () => void; 'aria-label': string }> = ({ children, onClick, 'aria-label': ariaLabel }) => (
    <button onClick={onClick} className="p-1.5 text-muted-foreground md:hover:bg-background rounded-md md:hover:text-foreground transition-colors" aria-label={ariaLabel}>
        {children}
    </button>
);

const isImageFile = (mimeType: string) => mimeType.startsWith('image/');
const isVideoFile = (mimeType: string) => mimeType.startsWith('video/');
const isAudioFile = (mimeType: string) => mimeType.startsWith('audio/');

const getTextFromMessage = (content: any): string => {
    if (typeof content === 'string') return content;
    return '';
}

const getDomain = (url: string): string => {
    if (!url) return 'source';
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (e) {
        return url.split('/')[2] || 'source';
    }
};

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRegenerate, onFork, isLoading, aiStatus, onShowAnalysis, executionResults, onStoreExecutionResult, onFixRequest, onStopExecution, isPythonReady, t, onOpenLightbox }) => {
    const isUser = message.type === MessageType.USER;
    const [isThinkingOpen, setIsThinkingOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (aiStatus === 'thinking' || aiStatus === 'searching') setIsThinkingOpen(true);
    }, [aiStatus]);

    const messageText = useMemo(() => getTextFromMessage(message.content), [message.content]);
    const isShortUserMessage = isUser && !messageText.includes('\n') && messageText.length < 50;

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
    
        const codeBlockRegex = /```([\w-]+)?(?:[^\n]*)?\n([\s\S]*?)```/g;
        const inlineImageRegex = /!g\[(.*?)\]\((.*?)\)/g;
        let parts: any[] = [];
        let lastIndex = 0;
        let match;
        let partIndex = 0;
    
        // First pass: extract code blocks
        while ((match = codeBlockRegex.exec(textToRender)) !== null) {
            if (match.index > lastIndex) parts.push({ type: 'text', content: textToRender.substring(lastIndex, match.index) });
            const lang = match[1] || 'plaintext';
            const code = match[2];
            if (lang === 'json-gallery') {
                try {
                    const galleryData = JSON.parse(code);
                    if (galleryData.type === 'image_gallery' && Array.isArray(galleryData.images)) {
                        parts.push({ type: 'gallery', images: galleryData.images });
                    }
                } catch (e) { /* Incomplete or invalid JSON, will be handled as text */ }
            } else {
                parts.push({ type: 'code', lang, code, info: match[0].split('\n')[0].substring(3).trim(), partIndex: partIndex++ });
            }
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < textToRender.length) parts.push({ type: 'text', content: textToRender.substring(lastIndex) });
    
        // Second pass: process text parts for inline images
        let finalParts: any[] = [];
        parts.forEach(part => {
            if (part.type !== 'text') {
                finalParts.push(part); return;
            }
            let lastTextIndex = 0;
            let inlineMatch;
            while ((inlineMatch = inlineImageRegex.exec(part.content)) !== null) {
                if (inlineMatch.index > lastTextIndex) finalParts.push({ type: 'text', content: part.content.substring(lastTextIndex, inlineMatch.index) });
                finalParts.push({ type: 'inline-image', alt: inlineMatch[1], url: inlineMatch[2] });
                lastTextIndex = inlineMatch.index + inlineMatch[0].length;
            }
            if (lastTextIndex < part.content.length) finalParts.push({ type: 'text', content: part.content.substring(lastTextIndex) });
        });
        return finalParts;
    }, [parsedResponseText]);

    const allImages = useMemo(() => {
        const collectedImages: { url: string; alt: string; source?: string }[] = [];
        renderableContent.forEach(part => {
            if (part.type === 'gallery') collectedImages.push(...part.images);
            else if (part.type === 'inline-image') collectedImages.push({ url: part.url, alt: part.alt });
        });
        return collectedImages;
    }, [renderableContent]);


    const hasContent = useMemo(() => parsedResponseText.trim().length > 0, [parsedResponseText]);
    const hasSources = !isUser && message.groundingChunks && message.groundingChunks.length > 0;

    const handleCopy = () => {
        const textToCopy = isUser ? messageText : parsedResponseText;
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                setIsCopied(true);
                setTimeout(() => setIsCopied(false), 2000);
            });
        }
    };

    const pythonCodeBlocks = useMemo(() => renderableContent.filter(part => part.type === 'code' && part.lang === 'python').map(part => part.code || ''), [renderableContent]);
    const thinkingHtml = useMemo(() => parsedThinkingText ? marked.parse(parsedThinkingText, { breaks: true, gfm: true }) as string : '', [parsedThinkingText]);

    useEffect(() => {
        if (contentRef.current && message.type !== MessageType.USER) {
            try {
                if ((window as any).renderMathInElement) (window as any).renderMathInElement(contentRef.current, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}], throwOnError: false });
                const mermaidElements = contentRef.current.querySelectorAll('.mermaid');
                if (mermaidElements.length > 0 && (window as any).mermaid) {
                    (window as any).mermaid.initialize({ startOnLoad: false, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default' });
                    (window as any).mermaid.run({ nodes: mermaidElements });
                }
                contentRef.current.querySelectorAll('input[type=checkbox]').forEach((el) => el.setAttribute('disabled', 'true'));
            } catch (error) { console.error('Post-render processing error:', error); }
        }
    }, [renderableContent, message.type, message.id]);

    const hasThinking = !isUser && (hasThinkingTag || parsedThinkingText);
    const hasAttachments = isUser && message.files && message.files.length > 0;
    const isAudioOnlyMessage = useMemo(() => isUser && message.files?.length === 1 && isAudioFile(message.files[0].type) && message.content === t('chat.input.audioMessage'), [isUser, message.files, message.content, t]);

    const loadingTexts = useMemo(() => ({
        thinking: [t('chat.status.thinking'), t('chat.status.processing'), t('chat.status.analyzing'), t('chat.status.consulting')],
        searching: [t('chat.status.searching'), t('chat.status.finding'), t('chat.status.consultingGoogle')],
        generating: [t('chat.status.generating'), t('chat.status.composing'), t('chat.status.formatting')],
    })[aiStatus] || [t('chat.status.thinking')], [aiStatus, t]);

    if (!isUser && isLoading && !hasContent && !hasThinking) {
        return (
            <div className="flex w-full my-4 justify-start">
                <div className="flex flex-col w-full max-w-3xl space-y-2">
                    <SkeletonLoader className="h-4 w-4/5" />
                    <SkeletonLoader className="h-4 w-full" />
                    <SkeletonLoader className="h-4 w-2/3" />
                </div>
            </div>
        );
    }
    
    if (!isUser && !isLoading && !hasContent && !hasThinking) return null;

    return (
        <div className={`flex w-full my-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className="group flex flex-col w-full max-w-3xl">
                {hasThinking && (
                    <div className="w-full mb-2">
                        <button type="button" onClick={() => setIsThinkingOpen(!isThinkingOpen)} className="flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground" aria-expanded={isThinkingOpen}>
                            <BrainIcon className="size-4" /><span className="flex-1 text-left font-medium hidden sm:inline">{t('chat.message.thinking')}</span>
                            <ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isThinkingOpen && (
                            <div className="pt-2 mt-2 border-t border-default">
                                <div className="mt-2 space-y-3 pl-6 border-l border-default ml-2"><div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: thinkingHtml }} /></div>
                            </div>
                        )}
                    </div>
                )}
                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    {isUser ? (
                        isAudioOnlyMessage ? <AudioPlayer src={message.files![0].dataUrl} t={t} /> : (
                            <>
                                {messageText && <div className={`w-fit max-w-full ${isShortUserMessage ? 'rounded-full px-5 py-2.5' : 'rounded-xl px-4 py-3'} bg-user-message text-foreground`}><p className="whitespace-pre-wrap">{messageText}</p></div>}
                                {hasAttachments && (
                                    <div className={`flex flex-wrap justify-end gap-2 max-w-full ${messageText ? 'mt-2' : ''}`}>
                                        {message.files?.map((file, index) => (
                                            <div key={index} className={`${isAudioFile(file.type) ? 'w-auto' : 'w-48'} flex-shrink-0`}>
                                                {isImageFile(file.type) ? <img src={file.dataUrl} alt={file.name} className="w-full h-auto object-cover rounded-lg border border-default" />
                                                    : isVideoFile(file.type) ? <video src={file.dataUrl} controls className="w-full h-auto rounded-lg border border-default bg-black" />
                                                    : isAudioFile(file.type) ? <AudioPlayer src={file.dataUrl} t={t} />
                                                    : <div className="w-full h-24 flex flex-col items-center justify-center text-center p-2 bg-gray-100 dark:bg-gray-800 border border-default rounded-lg" title={file.name}><FileTextIcon className="size-8 text-muted-foreground mb-1" /><span className="text-xs text-muted-foreground break-all truncate w-full">{file.name}</span></div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )
                    ) : (
                        <div ref={contentRef} className="w-full">
                            <div className="prose prose-sm max-w-none">
                                {renderableContent.map((part, index) => {
                                    if (part.type === 'gallery') {
                                        const startIndex = allImages.findIndex(img => img.url === part.images[0]?.url);
                                        return <ImageGallery key={`gallery-${index}`} images={part.images} onImageClick={(imageIndex) => onOpenLightbox(allImages, startIndex >= 0 ? startIndex + imageIndex : 0)} />;
                                    }
                                    if (part.type === 'inline-image') {
                                        const imageIndex = allImages.findIndex(img => img.url === part.url);
                                        return <InlineImage key={`inline-image-${index}`} src={part.url} alt={part.alt} onExpand={() => onOpenLightbox(allImages, imageIndex >= 0 ? imageIndex : 0)} />;
                                    }
                                    if (part.type === 'code') {
                                        const { lang, code, info, partIndex } = part;
                                        const key = `${message.id}_${partIndex}`;
                                        const title = info.match(/title="([^"]+)"/)?.[1];
                                        const infoWithoutTitle = title ? info.replace(/title="[^"]+"/, '') : info;
                                        const keywords = new Set(infoWithoutTitle.trim().split(/\s+/).filter(Boolean));
                                        const baseLang = keywords.values().next().value || lang;
                                        const isLegacyExample = baseLang.endsWith('-example');
                                        const finalLang = isLegacyExample ? baseLang.slice(0, -'-example'.length) : baseLang;
                                        return <CodeExecutor key={key} code={code} lang={finalLang} title={title} isExecutable={!keywords.has('no-run') && !isLegacyExample} autorun={keywords.has('autorun')} initialCollapsed={keywords.has('collapsed')} persistedResult={executionResults[key]} onExecutionComplete={(result) => onStoreExecutionResult(message.id, partIndex, result)} onFixRequest={(execError) => onFixRequest(code, finalLang, execError)} onStopExecution={onStopExecution} isPythonReady={isPythonReady} isLoading={isLoading} t={t} />;
                                    }
                                    // Sanitize text content to prevent rendering incomplete gallery code blocks during streaming
                                    const sanitizedContent = (isLoading && index === renderableContent.length - 1) ? part.content.replace(/```json-gallery[\s\S]*$/, '') : part.content;
                                    if (sanitizedContent.trim() === '') return null;

                                    let finalHtml = marked.parse(sanitizedContent, { breaks: true, gfm: true }) as string;
                                    if (isLoading && aiStatus === 'generating' && index === renderableContent.length - 1) {
                                        const cursorHtml = '<span class="typing-indicator cursor" style="margin-bottom: -0.2em; height: 1.2em"></span>';
                                        finalHtml = finalHtml.endsWith('</p>') ? `${finalHtml.slice(0, -4)} ${cursorHtml}</p>` : `${finalHtml}${cursorHtml}`;
                                    }
                                    return <div key={`text-${index}`} dangerouslySetInnerHTML={{ __html: finalHtml }} />;
                                })}
                                {isLoading && renderableContent.length === 0 && (aiStatus === 'thinking' || aiStatus === 'searching' || aiStatus === 'generating') && <AITextLoading texts={loadingTexts} />}
                            </div>
                        </div>
                    )}
                    <div className={`flex items-center ${isUser ? 'justify-end' : 'justify-start w-full'} gap-4 mt-2 transition-opacity duration-300 ${isUser ? 'opacity-100 md:opacity-0 md:group-hover:opacity-100' : (isLoading || (!hasContent && !hasSources) ? 'opacity-0 pointer-events-none' : 'opacity-100')}`}>
                         <div className="flex items-center gap-1">
                            {!isUser && (
                                <>
                                    <IconButton onClick={handleCopy} aria-label={t('chat.message.copy')}>{isCopied ? <CheckIcon className="size-4 text-green-500" /> : <CopyIcon className="size-4" />}</IconButton>
                                    <IconButton onClick={() => message.id && onRegenerate(message.id)} aria-label={t('chat.message.regenerate')}><RefreshCwIcon className="size-4" /></IconButton>
                                    <IconButton onClick={() => message.id && onFork(message.id)} aria-label={t('chat.message.fork')}><GitForkIcon className="size-4" /></IconButton>
                                    {pythonCodeBlocks.length > 0 && <IconButton onClick={() => onShowAnalysis(pythonCodeBlocks.join('\n\n# --- \n\n'), 'python')} aria-label={t('chat.message.viewCode')}><CodeXmlIcon className="size-5" /></IconButton>}
                                </>
                            )}
                            {isUser && <IconButton onClick={handleCopy} aria-label={t('chat.message.copy')}>{isCopied ? <CheckIcon className="size-4 text-green-500" /> : <CopyIcon className="size-4" />}</IconButton>}
                        </div>
                        {hasSources && (
                            <div className="flex items-center gap-2">
                                <div className="w-px h-4 bg-border" />
                                <div className="flex items-center -space-x-2">
                                {message.groundingChunks?.slice(0, 5).map((chunk, index) => {
                                    if ('web' in chunk && chunk.web.uri) {
                                        return <a href={chunk.web.uri} target="_blank" rel="noopener noreferrer" title={chunk.web.title} key={index}><img src={`https://www.google.com/s2/favicons?sz=24&domain_url=${getDomain(chunk.web.uri)}`} alt={getDomain(chunk.web.uri)} className="size-5 rounded-full bg-token-surface-secondary ring-2 ring-background" onError={(e) => { (e.target as HTMLImageElement).src = 'https://www.google.com/s2/favicons?sz=24&domain_url=google.com'; }} /></a>;
                                    }
                                    if ('maps' in chunk && chunk.maps.uri) {
                                        return <a href={chunk.maps.uri} target="_blank" rel="noopener noreferrer" title={chunk.maps.title} key={index}><div className="size-5 rounded-full bg-blue-100 dark:bg-blue-900/50 ring-2 ring-background flex items-center justify-center"><MapPinIcon className="size-3 text-blue-500" /></div></a>;
                                    }
                                    return null;
                                })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
export default ChatMessage;
