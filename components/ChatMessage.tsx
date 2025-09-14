import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import type { Message, GroundingChunk } from '../types';
import { BrainIcon, ChevronDownIcon, SearchIcon, CopyIcon, RefreshCwIcon, FileTextIcon, DownloadIcon } from './icons';

interface ChatMessageProps {
  message: Message;
  onRegenerate: (messageId: string) => void;
}

const IconButton: React.FC<{ children: React.ReactNode; onClick?: () => void; 'aria-label': string }> = ({ children, onClick, 'aria-label': ariaLabel }) => (
  <button onClick={onClick} className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors" aria-label={ariaLabel}>
    {children}
  </button>
);

const GroundingDisplay: React.FC<{ chunks: GroundingChunk[] }> = ({ chunks }) => {
    return (
        <div className="mt-2 space-y-3 pl-6 border-l border-gray-200 dark:border-gray-600 ml-2">
            <div className="flex gap-2 text-sm text-gray-500 dark:text-white">
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
                                className="inline-flex items-center rounded-md border border-transparent bg-zinc-100 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100/80 dark:hover:bg-zinc-700/80 gap-1 px-2 py-0.5 font-normal text-xs truncate"
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
  
  const htmlContent = useMemo(() => {
    if (isUser) return '';
    const renderer = new marked.Renderer();
    
    renderer.link = ({ href, title, text }) => {
        const safeHref = (href || '').startsWith('http') ? href : '#';
        const titleAttr = title ? `title="${escapeHtml(title)}"` : '';
        return `<a
            href="${safeHref}"
            target="_blank"
            rel="noopener noreferrer"
            ${titleAttr}
        >
            ${text}
        </a>`;
    };

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

    let processedHtml = marked.parse(message.text, { 
      breaks: true, 
      gfm: true,
      renderer,
    }) as string;

    // Process citations: find [1], [2], etc. and turn them into links
    if (message.groundingChunks && message.groundingChunks.length > 0) {
        processedHtml = processedHtml.replace(/\[(\d+)\]/g, (match, numberStr) => {
            const number = parseInt(numberStr, 10);
            if (number > 0 && number <= message.groundingChunks!.length) {
                return `<a href="#msg-${message.id}-source-${number}" class="text-blue-500 dark:text-blue-400 no-underline"><sup>[${number}]</sup></a>`;
            }
            return match; // Return original if number is out of bounds
        });
    }

    return processedHtml;

  }, [message.id, message.text, message.groundingChunks, isUser]);

  const thinkingHtml = useMemo(() => {
    if (!message.thinkingText) return '';
    return marked.parse(message.thinkingText, { breaks: true, gfm: true }) as string;
  }, [message.thinkingText]);

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

  const hasThinking = !isUser && ((message.groundingChunks && message.groundingChunks.length > 0) || message.thinkingText);
  const hasAttachments = isUser && message.attachments && message.attachments.length > 0;
  const hasDownloads = !isUser && message.downloadableFiles && message.downloadableFiles.length > 0;
  const hasDuration = !isUser && typeof message.duration === 'number';
  const hasCitations = !isUser && message.groundingChunks && message.groundingChunks.length > 0;

  return (
    <div className={`flex my-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col w-full max-w-2xl ${isUser ? 'items-end' : 'items-start'}`}>
        
        {hasThinking && (
            <div className="w-full mb-2">
                <button
                    type="button"
                    onClick={() => setIsThinkingOpen(!isThinkingOpen)}
                    className="flex w-full items-center gap-2 text-gray-500 dark:text-gray-400 text-sm transition-colors hover:text-gray-900 dark:hover:text-gray-100"
                    aria-expanded={isThinkingOpen}
                >
                    <BrainIcon className="size-4" />
                    <span className="flex-1 text-left">Chain of Thought</span>
                    <ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} />
                </button>
                {isThinkingOpen && (
                    <>
                        {message.groundingChunks && message.groundingChunks.length > 0 && (
                            <GroundingDisplay chunks={message.groundingChunks} />
                        )}
                        {message.thinkingText && (
                            <div className="mt-2 space-y-3 pl-6 border-l border-gray-200 dark:border-gray-600 ml-2">
                                <div
                                    className="prose prose-sm max-w-none text-gray-500 dark:text-white"
                                    dangerouslySetInnerHTML={{ __html: thinkingHtml }}
                                />
                            </div>
                        )}
                    </>
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
                  className="w-24 h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                />
              ) : (
                <div
                  key={index}
                  className="w-24 h-24 flex flex-col items-center justify-center text-center p-2 bg-gray-100 dark:bg-gray-700 border dark:border-gray-600 rounded-lg"
                  title={file.name}
                >
                  <FileTextIcon className="size-8 text-gray-500 dark:text-gray-400 mb-1" />
                  <span className="text-xs text-gray-700 dark:text-gray-300 break-all truncate">
                    {file.name}
                  </span>
                </div>
              )
            )}
          </div>
        )}

        <div className={` ${isUser ? 'bg-muted border border-border rounded-3xl rounded-br-lg p-3 px-4' : ''}`}>
           {isUser && message.text ? (
            <p className="text-gray-800 dark:text-white whitespace-pre-wrap">{message.text}</p>
          ) : (
            <div
              ref={contentRef}
              className="prose prose-sm max-w-none text-gray-800 dark:text-white"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          )}
          {hasCitations && (
            <div className="mt-4 border-t dark:border-gray-600/50 pt-3">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Sources</h4>
              <ol className="list-decimal list-inside text-sm space-y-1">
                {message.groundingChunks?.map((chunk, index) => (
                  <li key={index} id={`msg-${message.id}-source-${index + 1}`} className="truncate">
                    <a href={chunk.web.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline" title={chunk.web.title}>
                      {chunk.web.title || new URL(chunk.web.uri).hostname}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {hasDownloads && (
            <div className="mt-4 border-t dark:border-gray-600/50 pt-3 space-y-2">
                {message.downloadableFiles?.map((file, index) =>
                  <a
                      key={index}
                      href={file.url}
                      download={file.name}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-100 dark:bg-sidebar-accent dark:text-sidebar-foreground rounded-lg hover:bg-blue-200 dark:hover:opacity-80 transition-colors"
                  >
                      <DownloadIcon className="size-4" />
                      <span>Download {file.name}</span>
                  </a>
                )}
            </div>
          )}
        </div>
        
        {!isUser && (
          <div className="flex items-center gap-2 mt-2 text-gray-500 dark:text-gray-400">
             {hasDuration && (
              <span className="text-xs mr-2">{ (message.duration! / 1000).toFixed(1) }s</span>
            )}
            <IconButton onClick={handleCopy} aria-label="Copy message">
                {isCopied ? <span className="text-xs">Copied!</span> : <CopyIcon className="size-4" />}
            </IconButton>
            <IconButton onClick={() => onRegenerate(message.id)} aria-label="Regenerate response">
                <RefreshCwIcon className="size-4" />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;