import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import type { Message, GroundingChunk } from '../types';
import { 
    BrainIcon, ChevronDownIcon, SearchIcon, CopyIcon, RefreshCwIcon, FileTextIcon, 
    DownloadIcon
} from './icons';

interface ChatMessageProps {
  message: Message;
  onRegenerate: (messageId: string) => void;
}

const IconButton: React.FC<{ children: React.ReactNode; onClick?: () => void; 'aria-label': string }> = ({ children, onClick, 'aria-label': ariaLabel }) => (
  <button onClick={onClick} className="p-1 text-muted-foreground hover:text-foreground transition-colors" aria-label={ariaLabel}>
    {children}
  </button>
);

const GroundingDisplay: React.FC<{ chunks: GroundingChunk[] }> = ({ chunks }) => {
    return (
        <div className="mt-2 space-y-3 pl-6 border-l border-default ml-2">
            <div className="flex gap-2 text-sm text-muted-foreground">
                <div className="relative mt-0.5">
                    <SearchIcon className="size-4" />
                </div>
                <div className="flex-1 space-y-2">
                    <div>Used Google Search and found the following sources:</div>
                    <div className="flex flex-wrap items-center gap-2">
                        {chunks.map((chunk, i) => (
                             <a 
                                key={i}
                                href={chunk.web.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center rounded-md border border-transparent bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 gap-1 px-2 py-0.5 font-normal text-xs truncate"
                                title={chunk.web.title}
                            >
                               {new URL(chunk.web.uri).hostname}
                            </a>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Simple HTML escape function to prevent XSS
const escapeHtml = (html: string) => {
    return html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRegenerate }) => {
  const isUser = message.author === 'user';
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const isImageFile = (fileName: string) => /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.text).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    });
  };
  
  const { parsedThinkingText, parsedResponseText, hasThinkingTag } = useMemo(() => {
    if (isUser) return { parsedThinkingText: null, parsedResponseText: message.text, hasThinkingTag: false };
    const text = message.text || '';
    
    // This regex handles complete, partial, and no thinking blocks for a smooth streaming experience.
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
    
    return { parsedThinkingText: message.thinkingText || null, parsedResponseText: text, hasThinkingTag: false };
  }, [message.text, message.thinkingText, isUser]);


  const htmlContent = useMemo(() => {
    if (isUser) return '';

    // Step 1: Parse markdown with a custom renderer ONLY for non-conflicting features (like Mermaid).
    const renderer = new marked.Renderer();
    renderer.code = (token) => {
      const code = token.text;
      const lang = token.lang;
      if (lang === 'mermaid') {
        return `<div class="mermaid" aria-label="Mermaid diagram">${code}</div>`;
      }
      const safeLang = lang || 'plaintext';
      const escapedCode = escapeHtml(code);
      return `<pre><code class="language-${safeLang}">${escapedCode}</code></pre>`;
    };
    
    // NO custom link renderer is used. This fixes the crash.
    const rawHtml = marked.parse(parsedResponseText, { 
      breaks: true, 
      gfm: true,
      renderer,
    }) as string;

    // Step 2: Post-process the raw HTML to inject the custom citation UI.
    if (!message.groundingChunks || message.groundingChunks.length === 0) {
        return rawHtml;
    }

    // This regex finds links generated by marked from markdown like `[text](1)`
    const processedHtml = rawHtml.replace(/<a href="(\d+)">([\s\S]*?)<\/a>/g, (match, href, text) => {
        const citationIndex = parseInt(href, 10);
        const source = message.groundingChunks?.[citationIndex - 1];
        
        if (source) {
            const domain = new URL(source.web.uri).hostname;
            const safeUri = escapeHtml(source.web.uri);
            const safeTitle = escapeHtml(source.web.title);
            const safeDomain = escapeHtml(domain);

            return `<span class="group inline items-center gap-1.5 align-middle">` +
                     `<span class="transition-colors group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 rounded">${text}</span>` +
                     `<a href="${safeUri}" target="_blank" rel="noopener noreferrer" title="${safeTitle}" ` +
                        `class="inline-flex items-center border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:ring-offset-2 dark:border-zinc-800 dark:focus:ring-zinc-300 border-transparent bg-zinc-100 text-zinc-900 hover:bg-zinc-100/80 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-800/80 rounded-full no-underline">` +
                           `${safeDomain}` +
                     `</a>` +
                   `</span>`;
        }
        // If it's a numeric link but not a valid citation, just render the text.
        // This prevents broken links if the AI hallucinates a citation number.
        return text; 
    });

    return processedHtml;

  }, [parsedResponseText, message.groundingChunks, isUser]);

  const thinkingHtml = useMemo(() => {
    if (!parsedThinkingText) return '';
    return marked.parse(parsedThinkingText, { breaks: true, gfm: true }) as string;
  }, [parsedThinkingText]);

  useEffect(() => {
    if (contentRef.current && !isUser) {
        try {
            if ((window as any).renderMathInElement && (window as any).katex) {
                (window as any).renderMathInElement(contentRef.current, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false},
                        {left: '\\(', right: '\\)', display: false},
                        {left: '\\[', right: '\\]', display: true}
                    ],
                    throwOnError : false
                });
            }
        } catch (error) {
            console.error('KaTeX rendering error:', error);
        }

        try {
            if ((window as any).hljs) {
              contentRef.current.querySelectorAll('pre code').forEach((block) => {
                  (window as any).hljs.highlightElement(block as HTMLElement);
              });
            }
        } catch (error) {
            console.error('highlight.js error:', error);
        }

        try {
            const mermaidElements = contentRef.current.querySelectorAll('.mermaid');
            if (mermaidElements.length > 0 && (window as any).mermaid) {
                mermaidElements.forEach((el, i) => {
                    const id = `mermaid-graph-${message.id}-${i}`;
                    const code = el.textContent || '';
                    if (code) {
                        try {
                           (window as any).mermaid.render(id, code, (svgCode: string) => {
                                el.innerHTML = svgCode;
                           });
                        } catch (e) {
                           el.innerHTML = "Error rendering diagram.";
                           console.error("Mermaid render error:", e)
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
  }, [htmlContent, isUser, message.id]);

  const hasThinking = !isUser && ((message.groundingChunks && message.groundingChunks.length > 0) || hasThinkingTag || parsedThinkingText);
  const hasAttachments = isUser && message.attachments && message.attachments.length > 0;
  const hasDownloads = !isUser && message.downloadableFiles && message.downloadableFiles.length > 0;
  const hasDuration = !isUser && typeof message.duration === 'number';

  return (
    <div className={`flex w-full my-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`group flex flex-col w-full max-w-3xl ${isUser ? 'items-end' : 'items-start'}`}>
        
        {hasThinking && (
            <div className="w-full mb-2 border border-default rounded-lg p-3">
                <button
                    type="button"
                    onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                    className="flex w-full items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
                    aria-expanded={isThinkingOpen}
                >
                    <BrainIcon className="size-4" />
                    <span className="flex-1 text-left font-medium">Chain of Thought</span>
                    <ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} />
                </button>
                {isThinkingOpen && (
                    <div className="pt-2 mt-2 border-t border-default">
                        {message.groundingChunks && message.groundingChunks.length > 0 && (
                            <GroundingDisplay chunks={message.groundingChunks} />
                        )}
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
        
        {hasAttachments && (
          <div className="flex flex-wrap justify-end gap-2 mb-2">
            {message.attachments?.map((file, index) =>
              isImageFile(file.name) ? (
                <img
                  key={index}
                  src={file.preview}
                  alt={file.name}
                  className="w-32 h-32 object-cover rounded-lg border border-default"
                />
              ) : (
                <div
                  key={index}
                  className="w-32 h-32 flex flex-col items-center justify-center text-center p-2 bg-gray-100 dark:bg-gray-800 border border-default rounded-lg"
                  title={file.name}
                >
                  <FileTextIcon className="size-8 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground break-all truncate">
                    {file.name}
                  </span>
                </div>
              )
            )}
          </div>
        )}

        {isUser ? (
            <>
                <div className="relative px-4 py-2 rounded-full bg-gray-100 dark:bg-zinc-800 text-foreground">
                   {message.text ? (
                    <p className="whitespace-pre-wrap">{message.text}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 mt-2 transition-opacity opacity-0 group-hover:opacity-100">
                    <IconButton onClick={handleCopy} aria-label="Copy message">
                        {isCopied ? <span className="text-xs px-1">Copied!</span> : <CopyIcon className="size-4" />}
                    </IconButton>
                </div>
            </>
        ) : (
            <>
                <div className="w-full">
                    <div
                        ref={contentRef}
                        className="prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: htmlContent }}
                    />
                     {message.text === '' && (
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.3s]"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:-0.15s]"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                        </div>
                     )}
                    {hasDownloads && (
                        <div className="mt-4 border-t border-default pt-3 space-y-2">
                            {message.downloadableFiles?.map((file, index) =>
                            <a
                                key={index}
                                href={file.url}
                                download={file.name}
                                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-100 dark:bg-sidebar-active dark:text-sidebar-active-fg rounded-lg hover:bg-blue-200 dark:hover:opacity-80 transition-colors"
                            >
                                <DownloadIcon className="size-4" />
                                <span>Download {file.name}</span>
                            </a>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2 mt-2 transition-opacity opacity-0 group-hover:opacity-100">
                    <IconButton onClick={handleCopy} aria-label="Copy message">
                        {isCopied ? <span className="text-xs px-1">Copied!</span> : <CopyIcon className="size-4" />}
                    </IconButton>
                    <IconButton onClick={() => onRegenerate(message.id)} aria-label="Regenerate response">
                        <RefreshCwIcon className="size-4" />
                    </IconButton>
                </div>
            </>
        )}
        
        {hasDuration && (
          <div className="text-xs text-muted mt-1.5">
            Generated in { (message.duration! / 1000).toFixed(1) }s
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;