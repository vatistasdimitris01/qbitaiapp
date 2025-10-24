

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import type { Message, MessageContent, AIStatus, GroundingChunk, MapsGroundingChunk } from '../types';
import { MessageType } from '../types';
import {
    BrainIcon, ChevronDownIcon, SearchIcon, CopyIcon, RefreshCwIcon, FileTextIcon, CodeXmlIcon, CheckIcon, GitForkIcon
} from './icons';
import { CodeExecutor } from './CodeExecutor';
import AITextLoading from './AITextLoading';


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
}

const IconButton: React.FC<{ children: React.ReactNode; onClick?: () => void; 'aria-label': string }> = ({ children, onClick, 'aria-label': ariaLabel }) => (
    <button onClick={onClick} className="p-1.5 text-muted-foreground md:hover:bg-background rounded-md md:hover:text-foreground transition-colors" aria-label={ariaLabel}>
        {children}
    </button>
);

// Simple HTML escape function to prevent XSS
const escapeHtml = (html: string) => {
    const text = document.createTextNode(html);
    const p = document.createElement('p');
    p.appendChild(text);
    return p.innerHTML;
};

const isImageFile = (mimeType: string) => mimeType.startsWith('image/');
const isVideoFile = (mimeType: string) => mimeType.startsWith('video/');
const isAudioFile = (mimeType: string) => mimeType.startsWith('audio/');


// Helper to get string content from MessageContent
const getTextFromMessage = (content: MessageContent): string => {
    if (typeof content === 'string') {
        return content;
    }
    return ''; // Other content types are handled as structured data.
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRegenerate, onFork, isLoading, aiStatus, onShowAnalysis, executionResults, onStoreExecutionResult, onFixRequest, onStopExecution, isPythonReady, t }) => {
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

    if (message.type === MessageType.AGENT_ACTION && typeof message.content === 'string') {
        return (
            <div className="flex w-full my-4 justify-start animate-fade-in-up">
                <div className="flex items-center gap-2 text-muted-foreground text-sm px-2">
                    <SearchIcon className="size-4 flex-shrink-0" />
                    <span className="font-normal">{message.content}</span>
                </div>
            </div>
        );
    }

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

    // Update the ref whenever the response text changes. This doesn't re-trigger the typing effect.
    useEffect(() => {
        responseTextRef.current = parsedResponseText;
    }, [parsedResponseText]);

    useEffect(() => {
        const animate = () => {
            if (!isAnimating.current) return;
            
            const currentTarget = responseTextRef.current;
            if (charIndexRef.current < currentTarget.length) {
                // Animate character by character quickly.
                const nextCharIndex = charIndexRef.current + 1;
                animationFrameRef.current = requestAnimationFrame(() => {
                    setTypedText(currentTarget.substring(0, nextCharIndex));
                });
                charIndexRef.current = nextCharIndex;
                typingTimeoutRef.current = window.setTimeout(animate, 2); // Fast typing speed
            } else {
                // Done with current text, check for more in a bit.
                typingTimeoutRef.current = window.setTimeout(animate, 50);
            }
        };

        if (isLoading && aiStatus === 'generating') {
            if (!isAnimating.current) {
                // Start animation
                isAnimating.current = true;
                animate();
            }
        } else {
            // Stop animation
            isAnimating.current = false;
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            
            // If finished loading, ensure final text is displayed and cursor is at the end
            if (!isLoading) {
                setTypedText(responseTextRef.current);
                charIndexRef.current = responseTextRef.current.length;
            }
        }

        return () => {
            // Cleanup on unmount
            isAnimating.current = false;
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        };
    }, [isLoading, aiStatus]);


    useEffect(() => {
        if (aiStatus === 'thinking' || aiStatus === 'searching') {
            setIsThinkingOpen(true);
        }
    }, [aiStatus]);
    
    const markedRenderer = useMemo(() => {
        const renderer = new marked.Renderer();
        // FIX: Update renderer.link signature to match marked v5+ which uses a single token object argument.
        renderer.link = ({ href, title, tokens }: { href?: string, title?: string, tokens?: any[] }) => {
            const getPlainText = (ts: any[]): string => {
                return ts.map(t => t.tokens ? getPlainText(t.tokens) : t.text).join('');
            };
            const text = tokens ? getPlainText(tokens) : '';

            const escapedText = escapeHtml(text);
            const escapedTitle = escapeHtml(title || text);
            const escapedHref = escapeHtml(href || '');

            // Override standard links to render as citation pills
            if (href) {
                 return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer" title="${escapedTitle}" class="inline-flex h-5 items-center overflow-hidden rounded-md px-2 text-[11px] font-medium transition-colors duration-150 ease-in-out text-token-secondary bg-token-surface-secondary hover:bg-border no-underline relative -top-0.5 ml-1"><span class="max-w-[20ch] truncate">${escapedText}</span></a>`;
            }
            // Fallback for malformed links
            return text;
        };

        renderer.code = ({ text: code, lang }: { text: string; lang?: string }): string => {
            lang = (lang || 'plaintext').toLowerCase();
            if (lang === 'mermaid') {
                return `<div class="mermaid" aria-label="Mermaid diagram">${escapeHtml(code)}</div>`;
            }
            const safeLang = escapeHtml(lang);
            const escapedCode = escapeHtml(code);
             try {
                if ((window as any).hljs) {
                    const highlighted = (window as any).hljs.highlight(escapedCode, { language: safeLang, ignoreIllegals: true }).value;
                    return `<pre class="not-prose"><code class="language-${safeLang} hljs">${highlighted}</code></pre>`;
                }
            } catch (e) { /* language not supported */ }
            return `<pre class="not-prose"><code class="language-${safeLang}">${escapedCode}</code></pre>`;
        };
        return renderer;
    }, []);

    const contentParts = useMemo(() => {
        if (message.type === MessageType.USER) return [];

        const textToRender = (isLoading && aiStatus === 'generating') ? typedText : parsedResponseText;
    
        type ContentPart = {
            type: 'text' | 'code';
            content?: string;
            lang?: string;
            title?: string;
            code?: string;
            autorun?: boolean;
            collapsed?: boolean;
            noRun?: boolean;
        };
        const parts: ContentPart[] = [];
        const sections = textToRender.split('```');
    
        sections.forEach((section, index) => {
            if (index % 2 === 0) {
                // This is a text part
                if (section) {
                    parts.push({ type: 'text', content: section });
                }
            } else {
                // This is a code part (info string + code)
                const firstNewlineIndex = section.indexOf('\n');
                if (firstNewlineIndex === -1) {
                    // Incomplete info string or no code yet, treat as text for now
                    parts.push({ type: 'text', content: '```' + section });
                    return;
                }
                const infoString = section.substring(0, firstNewlineIndex).trim();
                const codeContent = section.substring(firstNewlineIndex + 1);
    
                const titleMatch = infoString.match(/title="([^"]+)"/);
                const title = titleMatch ? titleMatch[1] : undefined;

                const infoStringWithoutTitle = title ? infoString.replace(titleMatch[0], '') : infoString;
                const infoParts = infoStringWithoutTitle.trim().split(/\s+/);
                const lang = infoParts[0] || 'plaintext';
                const keywords = new Set(infoParts.slice(1));

                const isLegacyExample = lang.endsWith('-example');
                const baseLang = isLegacyExample ? lang.substring(0, lang.length - '-example'.length) : lang;
                
                parts.push({
                    type: 'code',
                    lang: baseLang,
                    autorun: keywords.has('autorun'),
                    collapsed: keywords.has('collapsed'),
                    noRun: keywords.has('no-run') || isLegacyExample,
                    title: title,
                    code: codeContent,
                });
            }
        });

        if (isLoading && aiStatus === 'generating' && typedText.length < parsedResponseText.length) {
            const cursorHtml = '<span class="typing-indicator cursor" style="margin-bottom: -0.2em; height: 1.2em"></span>';
            const lastPart = parts[parts.length - 1];
            if (lastPart && lastPart.type === 'text') {
                lastPart.content = (lastPart.content || '') + cursorHtml;
            } else {
                parts.push({ type: 'text', content: cursorHtml });
            }
        }
    
        return parts;
    }, [isLoading, typedText, parsedResponseText, message.type, aiStatus]);

    const hasRenderableContent = useMemo(() => {
      return contentParts.some(p => (p.type === 'text' && p.content && p.content.trim() !== '') || p.type === 'code');
    }, [contentParts]);


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
        return contentParts
            .filter(part => part.type === 'code' && part.lang === 'python' && part.code)
            .map(part => part.code!);
    }, [contentParts]);

    const thinkingHtml = useMemo(() => {
        if (!parsedThinkingText) return '';
        return marked.parse(parsedThinkingText, { breaks: true, gfm: true, renderer: markedRenderer }) as string;
    }, [parsedThinkingText, markedRenderer]);

    useEffect(() => {
        if (contentRef.current && message.type !== MessageType.USER) {
            try {
                if ((window as any).renderMathInElement && (window as any).katex) {
                    (window as any).renderMathInElement(contentRef.current, {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '$', right: '$', display: false },
                            { left: '\\(', right: '\\)', display: false },
                            { left: '\\[', right: '\\]', display: true }
                        ],
                        throwOnError: false
                    });
                }
            } catch (error) {
                console.error('KaTeX rendering error:', error);
            }

            try {
                const mermaidElements = contentRef.current.querySelectorAll('.mermaid');
                if (mermaidElements.length > 0 && (window as any).mermaid) {
                    (window as any).mermaid.initialize({ startOnLoad: false, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default' });
                    mermaidElements.forEach((el) => {
                        if (el.textContent && !el.getAttribute('data-processed')) {
                             try {
                                (window as any).mermaid.render(`mermaid-${message.id}-${Math.random().toString(36).substring(2)}`, el.textContent, (svgCode: string) => {
                                    el.innerHTML = svgCode;
                                    el.setAttribute('data-processed', 'true');
                                });
                            } catch(e) {
                                el.innerHTML = "Error rendering diagram";
                                console.error("Mermaid render error:", e);
                            }
                        }
                    });
                }
            } catch (error) {
                console.error('Mermaid rendering error:', error);
            }

            try {
                contentRef.current.querySelectorAll('input[type=checkbox]').forEach((el) => {
                    el.setAttribute('disabled', 'true');
                });
            } catch (error) {
                console.error('Task list checkbox error:', error);
            }
        }
    }, [contentParts, message.type, message.id, parsedResponseText]);

    const hasThinking = !isUser && (hasThinkingTag || parsedThinkingText);
    const hasAttachments = isUser && message.files && message.files.length > 0;
    
    const loadingTexts = useMemo(() => {
      switch(aiStatus) {
        case 'thinking': return [
          t('chat.status.thinking'),
          t('chat.status.processing'),
          t('chat.status.analyzing'),
          t('chat.status.consulting'),
        ];
        case 'searching': return [
          t('chat.status.searching'),
          t('chat.status.finding'),
          t('chat.status.consultingGoogle'),
        ];
        case 'generating': return [
          t('chat.status.generating'),
          t('chat.status.composing'),
          t('chat.status.formatting'),
        ];
        default: return [t('chat.status.thinking')];
      }
    }, [aiStatus, t]);


    if (!isUser && !hasRenderableContent && !isLoading && !hasThinking) {
      return null;
    }

    return (
        <div className={`flex w-full my-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div className="group flex flex-col w-full max-w-3xl">
                {hasThinking && (
                    <div className="w-full mb-2">
                        <button
                            type="button"
                            onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                            className="flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
                            aria-expanded={isThinkingOpen}
                        >
                            <BrainIcon className="size-4" />
                            <span className="flex-1 text-left font-medium hidden sm:inline">{t('chat.message.thinking')}</span>
                            <ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isThinkingOpen && (
                            <div className="pt-2 mt-2 border-t border-default">
                                {parsedThinkingText && (
                                    <div className="mt-2 space-y-3 pl-6 border-l border-default ml-2">
                                        <div
                                            className="prose prose-sm max-w-none text-muted-foreground"
                                            dangerouslySetInnerHTML={{ __html: thinkingHtml }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                    {isUser ? (
                        <>
                           {messageText && (
                                <div className={`
                                    w-fit max-w-full
                                    ${isShortUserMessage ? 'rounded-full' : 'rounded-xl'}
                                    bg-user-message text-foreground
                                `}>
                                    <div className={`${isShortUserMessage ? 'px-5 py-2.5' : 'px-4 py-3'}`}>
                                        <p className="whitespace-pre-wrap">{messageText}</p>
                                    </div>
                                </div>
                            )}

                            {hasAttachments && (
                                <div className={`flex flex-wrap justify-end gap-2 max-w-full ${messageText ? 'mt-2' : ''}`}>
                                    {message.files?.map((file, index) => (
                                        <div key={index} className="w-48 flex-shrink-0">
                                            {isImageFile(file.type) ? (
                                                <img src={file.dataUrl} alt={file.name} className="w-full h-auto object-cover rounded-lg border border-default" />
                                            ) : isVideoFile(file.type) ? (
                                                <video src={file.dataUrl} controls className="w-full h-auto rounded-lg border border-default bg-black" />
                                            ) : isAudioFile(file.type) ? (
                                                <div className="p-2 bg-gray-100 dark:bg-gray-800 border border-default rounded-lg">
                                                    <audio src={file.dataUrl} controls className="w-full" />
                                                    <p className="text-xs text-muted-foreground break-all truncate mt-1" title={file.name}>{file.name}</p>
                                                </div>
                                            ) : (
                                                <div className="w-full h-24 flex flex-col items-center justify-center text-center p-2 bg-gray-100 dark:bg-gray-800 border border-default rounded-lg" title={file.name}>
                                                    <FileTextIcon className="size-8 text-muted-foreground mb-1" />
                                                    <span className="text-xs text-muted-foreground break-all truncate w-full">{file.name}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="w-full">
                            <div ref={contentRef} className="prose prose-sm max-w-none">
                                {contentParts.map((part, index) => {
                                    if (part.type === 'text' && part.content) {
                                        const html = marked.parse(part.content, { breaks: true, gfm: true, renderer: markedRenderer }) as string;
                                        return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
                                    }
                                    if (part.type === 'code' && part.code) {
                                        const isExecutable = !part.noRun;
                                        const key = `${message.id}_${index}`;
                                        return (
                                            <CodeExecutor
                                                key={key}
                                                code={part.code}
                                                lang={part.lang!}
                                                title={part.title}
                                                isExecutable={isExecutable}
                                                autorun={part.autorun}
                                                initialCollapsed={part.collapsed}
                                                persistedResult={executionResults[key]}
                                                onExecutionComplete={(result) => onStoreExecutionResult(message.id, index, result)}
                                                onFixRequest={(execError) => onFixRequest(part.code!, part.lang!, execError)}
                                                onStopExecution={onStopExecution}
                                                isPythonReady={isPythonReady}
                                                isLoading={isLoading}
                                                t={t}
                                            />
                                        );
                                    }
                                    return null;
                                })}
                                
                                {isLoading && !parsedResponseText && (aiStatus === 'thinking' || aiStatus === 'searching') && (
                                    <AITextLoading texts={loadingTexts} />
                                )}
                            </div>
                        </div>
                    )}
                     <div className={`flex items-center gap-1 mt-2 transition-opacity duration-300 ${isUser ? 'opacity-100 md:opacity-0 md:group-hover:opacity-100' : (isLoading || !hasRenderableContent ? 'opacity-0 pointer-events-none' : 'opacity-100')}`}>
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
                                    <IconButton
                                        onClick={() => onShowAnalysis(pythonCodeBlocks.join('\n\n# --- \n\n'), 'python')}
                                        aria-label={t('chat.message.viewCode')}
                                    >
                                        <CodeXmlIcon className="size-5" />
                                    </IconButton>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
export default ChatMessage;