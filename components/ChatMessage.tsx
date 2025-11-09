
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import type { Message, AIStatus } from '../types';
import { MessageType } from '../types';
import {
    BrainIcon, ChevronDownIcon, CopyIcon, RefreshCwIcon, FileTextIcon, CodeXmlIcon, CheckIcon, GitForkIcon
} from './icons';
import { CodeExecutor } from './CodeExecutor';
import AITextLoading from './AITextLoading';
import GroundingSources from './GroundingSources';
import AudioPlayer from './AudioPlayer';
import ImageGallery from './ImageGallery';

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
    if (typeof content === 'string') {
        return content;
    }
    return '';
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRegenerate, onFork, isLoading, aiStatus, onShowAnalysis, executionResults, onStoreExecutionResult, onFixRequest, onStopExecution, isPythonReady, t, onOpenLightbox }) => {
    const isUser = message.type === MessageType.USER;
    const [isThinkingOpen, setIsThinkingOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [typedText, setTypedText] = useState('');
    const contentRef = useRef<HTMLDivElement>(null);

    const responseTextRef = useRef('');
    const charIndexRef = useRef(0);
    const typingTimeoutRef = useRef<number | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const isAnimating = useRef(false);

    useEffect(() => {
        if (aiStatus === 'thinking' || aiStatus === 'searching') {
            setIsThinkingOpen(true);
        }
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
        const partialThinkingMatch = text.match(/<thinking>([\s\S]*)/);
        if (partialThinkingMatch) {
            return {
                parsedThinkingText: partialThinkingMatch[1],
                parsedResponseText: '',
                hasThinkingTag: true
            };
        }
        return { parsedThinkingText: null, parsedResponseText: text, hasThinkingTag: false };
    }, [messageText, isUser]);

    useEffect(() => {
        responseTextRef.current = parsedResponseText;
    }, [parsedResponseText]);

    useEffect(() => {
        const animate = () => {
            if (!isAnimating.current) return;
            const currentTarget = responseTextRef.current;
            if (charIndexRef.current < currentTarget.length) {
                const nextCharIndex = charIndexRef.current + 1;
                animationFrameRef.current = requestAnimationFrame(() => {
                    setTypedText(currentTarget.substring(0, nextCharIndex));
                });
                charIndexRef.current = nextCharIndex;
                typingTimeoutRef.current = window.setTimeout(animate, 2);
            } else {
                typingTimeoutRef.current = window.setTimeout(animate, 50);
            }
        };

        if (isLoading && aiStatus === 'generating') {
            if (!isAnimating.current) {
                isAnimating.current = true;
                animate();
            }
        } else {
            isAnimating.current = false;
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (!isLoading) {
                setTypedText(responseTextRef.current);
                charIndexRef.current = responseTextRef.current.length;
            }
        }
        return () => {
            isAnimating.current = false;
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [isLoading, aiStatus]);

    const renderableContent = useMemo(() => {
        const textToRender = (isLoading && aiStatus === 'generating') ? typedText : parsedResponseText;
        if (!textToRender) return [];

        const parts = [];
        const codeBlockRegex = /```(\w+)?(?:[^\n]*)?\n([\s\S]*?)```/g;
        let lastIndex = 0;
        let match;
        let partIndex = 0;

        while ((match = codeBlockRegex.exec(textToRender)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: 'text', content: textToRender.substring(lastIndex, match.index) });
            }
            const lang = match[1] || 'plaintext';
            const code = match[2];

            if (lang === 'json-gallery') {
                try {
                    const galleryData = JSON.parse(code);
                    if (galleryData.type === 'image_gallery' && Array.isArray(galleryData.images)) {
                        parts.push({
                            type: 'gallery',
                            images: galleryData.images,
                            partIndex: partIndex++
                        });
                    } else {
                        // Fallback to text if JSON is malformed
                        parts.push({ type: 'text', content: match[0] });
                    }
                } catch (e) {
                     // Fallback to text if JSON parsing fails
                    parts.push({ type: 'text', content: match[0] });
                }
            } else {
                parts.push({
                    type: 'code',
                    lang: lang,
                    code: code,
                    info: match[0].split('\n')[0].substring(3).trim(),
                    partIndex: partIndex++
                });
            }
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < textToRender.length) {
            parts.push({ type: 'text', content: textToRender.substring(lastIndex) });
        }
        return parts;
    }, [isLoading, aiStatus, typedText, parsedResponseText]);

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

    const pythonCodeBlocks = useMemo(() => {
        return renderableContent
            .filter(part => part.type === 'code' && part.lang === 'python')
            .map(part => part.code || '');
    }, [renderableContent]);
    
    const thinkingHtml = useMemo(() => {
        if (!parsedThinkingText) return '';
        return marked.parse(parsedThinkingText, { breaks: true, gfm: true }) as string;
    }, [parsedThinkingText]);

    useEffect(() => {
        if (contentRef.current && message.type !== MessageType.USER) {
            // KaTeX, Mermaid, and Checkbox rendering
            try {
                if ((window as any).renderMathInElement) {
                    (window as any).renderMathInElement(contentRef.current, { delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}], throwOnError: false });
                }
                const mermaidElements = contentRef.current.querySelectorAll('.mermaid');
                if (mermaidElements.length > 0 && (window as any).mermaid) {
                    (window as any).mermaid.initialize({ startOnLoad: false, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default' });
                    (window as any).mermaid.run({ nodes: mermaidElements });
                }
                contentRef.current.querySelectorAll('input[type=checkbox]').forEach((el) => el.setAttribute('disabled', 'true'));
            } catch (error) {
                console.error('Post-render processing error:', error);
            }
        }
    }, [renderableContent, message.type, message.id]);

    const hasThinking = !isUser && (hasThinkingTag || parsedThinkingText);
    const hasAttachments = isUser && message.files && message.files.length > 0;
    
    const isAudioOnlyMessage = useMemo(() => {
        return isUser &&
            message.files &&
            message.files.length === 1 &&
            isAudioFile(message.files[0].type) &&
            message.content === t('chat.input.audioMessage');
    }, [isUser, message.files, message.content, t]);

    const loadingTexts = useMemo(() => {
        // ... (loading texts logic remains the same)
        switch(aiStatus) {
            case 'thinking': return [t('chat.status.thinking'), t('chat.status.processing'), t('chat.status.analyzing'), t('chat.status.consulting')];
            case 'searching': return [t('chat.status.searching'), t('chat.status.finding'), t('chat.status.consultingGoogle')];
            case 'generating': return [t('chat.status.generating'), t('chat.status.composing'), t('chat.status.formatting')];
            default: return [t('chat.status.thinking')];
        }
    }, [aiStatus, t]);

    if (!isUser && !isLoading && !hasContent && !hasThinking) {
      return null;
    }

    return (
        <div className={`flex w-full my-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className="group flex flex-col w-full max-w-3xl">
                {hasThinking && (
                    <div className="w-full mb-2">
                        <button type="button" onClick={() => setIsThinkingOpen(!isThinkingOpen)} className="flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground" aria-expanded={isThinkingOpen}>
                            <BrainIcon className="size-4" />
                            <span className="flex-1 text-left font-medium hidden sm:inline">{t('chat.message.thinking')}</span>
                            <ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isThinkingOpen && (
                            <div className="pt-2 mt-2 border-t border-default">
                                <div className="mt-2 space-y-3 pl-6 border-l border-default ml-2">
                                    <div className="prose prose-sm max-w-none text-muted-foreground" dangerouslySetInnerHTML={{ __html: thinkingHtml }} />
                                </div>
                            </div>
                        )}
                    </div>
                )}
                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    {isUser ? (
                        isAudioOnlyMessage ? (
                            <AudioPlayer src={message.files![0].dataUrl} t={t} />
                        ) : (
                            <>
                            {messageText && (
                                    <div className={`w-fit max-w-full ${isShortUserMessage ? 'rounded-full' : 'rounded-xl'} bg-user-message text-foreground`}>
                                        <div className={`${isShortUserMessage ? 'px-5 py-2.5' : 'px-4 py-3'}`}>
                                            <p className="whitespace-pre-wrap">{messageText}</p>
                                        </div>
                                    </div>
                                )}
                                {hasAttachments && (
                                    <div className={`flex flex-wrap justify-end gap-2 max-w-full ${messageText ? 'mt-2' : ''}`}>
                                        {message.files?.map((file, index) => {
                                            const isAudio = isAudioFile(file.type);
                                            return (
                                                <div key={index} className={`${isAudio ? 'w-auto' : 'w-48'} flex-shrink-0`}>
                                                    {isImageFile(file.type) ? <img src={file.dataUrl} alt={file.name} className="w-full h-auto object-cover rounded-lg border border-default" />
                                                    : isVideoFile(file.type) ? <video src={file.dataUrl} controls className="w-full h-auto rounded-lg border border-default bg-black" />
                                                    : isAudio ? <AudioPlayer src={file.dataUrl} t={t} />
                                                    : <div className="w-full h-24 flex flex-col items-center justify-center text-center p-2 bg-gray-100 dark:bg-gray-800 border border-default rounded-lg" title={file.name}><FileTextIcon className="size-8 text-muted-foreground mb-1" /><span className="text-xs text-muted-foreground break-all truncate w-full">{file.name}</span></div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        )
                    ) : (
                        <div ref={contentRef} className="w-full">
                            <div className="prose prose-sm max-w-none">
                                {renderableContent.map((part, index) => {
                                    if (part.type === 'gallery') {
                                        return (
                                            <ImageGallery
                                                key={`gallery-${index}`}
                                                images={part.images}
                                                onImageClick={(startIndex) => onOpenLightbox(part.images, startIndex)}
                                            />
                                        );
                                    }
                                    if (part.type === 'code') {
                                        const { lang, code, info, partIndex } = part;
                                        const key = `${message.id}_${partIndex}`;
                                        
                                        const titleMatch = info.match(/title="([^"]+)"/);
                                        const title = titleMatch ? titleMatch[1] : undefined;
                                        const infoWithoutTitle = title ? info.replace(titleMatch[0], '') : info;
                                        const infoParts = infoWithoutTitle.trim().split(/\s+/).filter(Boolean);
                                        const baseLang = infoParts.length > 0 && infoParts[0].length > 0 ? infoParts[0] : lang;
                                        const keywords = new Set(infoParts.slice(1));
                                        
                                        const isLegacyExample = baseLang.endsWith('-example');
                                        const finalLang = isLegacyExample ? baseLang.substring(0, baseLang.length - '-example'.length) : baseLang;
                                        const isExecutable = !keywords.has('no-run') && !isLegacyExample;
                                        const autorun = keywords.has('autorun');
                                        const collapsed = keywords.has('collapsed');

                                        return (
                                            <CodeExecutor
                                                key={key}
                                                code={code}
                                                lang={finalLang}
                                                title={title}
                                                isExecutable={isExecutable}
                                                autorun={autorun}
                                                initialCollapsed={collapsed}
                                                persistedResult={executionResults[key]}
                                                onExecutionComplete={(result) => onStoreExecutionResult(message.id, partIndex, result)}
                                                onFixRequest={(execError) => onFixRequest(code, finalLang, execError)}
                                                onStopExecution={onStopExecution}
                                                isPythonReady={isPythonReady}
                                                isLoading={isLoading}
                                                t={t}
                                            />
                                        );
                                    } else { // part.type === 'text'
                                        const isLastPart = index === renderableContent.length - 1;
                                        let finalHtml = marked.parse(part.content, { breaks: true, gfm: true }) as string;
                                        
                                        if (isLastPart && isLoading && aiStatus === 'generating' && typedText.length < parsedResponseText.length) {
                                            const cursorHtml = '<span class="typing-indicator cursor" style="margin-bottom: -0.2em; height: 1.2em"></span>';
                                            if (finalHtml.endsWith('</p>')) {
                                                finalHtml = finalHtml.slice(0, -4) + ` ${cursorHtml}</p>`;
                                            } else {
                                                finalHtml += cursorHtml;
                                            }
                                        }
                                        
                                        return <div key={`text-${index}`} dangerouslySetInnerHTML={{ __html: finalHtml }} />;
                                    }
                                })}
                                {isLoading && renderableContent.length === 0 && (aiStatus === 'thinking' || aiStatus === 'searching' || aiStatus === 'generating') && (
                                    <AITextLoading texts={loadingTexts} />
                                )}
                            </div>
                        </div>
                    )}
                    <div className={`flex items-center ${isUser ? 'justify-end' : 'justify-between w-full'} gap-4 mt-2 transition-opacity duration-300 ${isUser ? 'opacity-100 md:opacity-0 md:group-hover:opacity-100' : (isLoading || (!hasContent && !hasSources) ? 'opacity-0 pointer-events-none' : 'opacity-100')}`}>
                        <div className="flex items-center gap-1">
                            <IconButton onClick={handleCopy} aria-label={t('chat.message.copy')}>
                                {isCopied ? <CheckIcon className="size-4 text-green-500" /> : <CopyIcon className="size-4" />}
                            </IconButton>
                            {!isUser && (
                                <>
                                    <IconButton onClick={() => message.id && onRegenerate(message.id)} aria-label={t('chat.message.regenerate')}>
                                        <RefreshCwIcon className="size-4" />
                                    </IconButton>
                                    <IconButton onClick={() => message.id && onFork(message.id)} aria-label={t('chat.message.fork')}>
                                        <GitForkIcon className="size-4" />
                                    </IconButton>
                                    {pythonCodeBlocks.length > 0 && (
                                        <IconButton onClick={() => onShowAnalysis(pythonCodeBlocks.join('\n\n# --- \n\n'), 'python')} aria-label={t('chat.message.viewCode')}>
                                            <CodeXmlIcon className="size-5" />
                                        </IconButton>
                                    )}
                                </>
                            )}
                        </div>
                        {hasSources && <GroundingSources chunks={message.groundingChunks!} t={t} />}
                    </div>
                </div>
            </div>
        </div>
    );
};
export default ChatMessage;