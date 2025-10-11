
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import type { Message, GroundingChunk, PreviewContent, MessageContent, CodeBlockContent } from '../types';
import { MessageType } from '../types';
import {
BrainIcon, ChevronDownIcon, SearchIcon, CopyIcon, RefreshCwIcon, FileTextIcon
} from './icons';
import { CodeExecutor } from './CodeExecutor';

interface ChatMessageProps {
message: Message;
onRegenerate: (messageId: string) => void;
isLoading: boolean;
onPreview: (content: PreviewContent) => void;
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
const text = document.createTextNode(html);
const p = document.createElement('p');
p.appendChild(text);
return p.innerHTML;
};

const isImageFile = (mimeType: string) => mimeType.startsWith('image/');

// Helper to get string content from MessageContent
const getTextFromMessage = (content: MessageContent): string => {
    if (typeof content === 'string') {
        return content;
    }
    return ''; // Other content types are handled as structured data.
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRegenerate, isLoading, onPreview }) => {
const isUser = message.type === MessageType.USER;
const [isThinkingOpen, setIsThinkingOpen] = useState(false);
const [isCopied, setIsCopied] = useState(false);
const contentRef = useRef<HTMLDivElement>(null);

const handleCopy = () => {
const textToCopy = getTextFromMessage(message.content);
if (textToCopy) {
    navigator.clipboard.writeText(textToCopy).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    });
}
};

const { parsedThinkingText, parsedResponseText, hasThinkingTag } = useMemo(() => {
const messageText = getTextFromMessage(message.content);
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
}, [message.content, isUser]);

const isThinkingInProgress = useMemo(() => {
const messageText = getTextFromMessage(message.content);
return hasThinkingTag && !messageText.includes('</thinking>');
}, [hasThinkingTag, message.content]);

useEffect(() => {
if (isThinkingInProgress) {
setIsThinkingOpen(true);
}
}, [isThinkingInProgress]);

const contentParts = useMemo(() => {
    if (message.type === MessageType.USER) return [];
    
    let textToRender = '';
    if (message.type === MessageType.AI_RESPONSE) {
      textToRender = parsedResponseText || getTextFromMessage(message.content) || '';
    } else if (message.type === MessageType.AI_CODE || message.type === MessageType.AI_EXECUTABLE_CODE) {
      const { lang, code } = message.content as CodeBlockContent;
      return [{ type: 'code', lang, code }];
    }
    
    if (!textToRender) return [];

    const parts: { type: 'text' | 'code'; content?: string; lang?: string; code?: string }[] = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(textToRender)) !== null) {
        if (match.index > lastIndex) {
            const textPart = textToRender.substring(lastIndex, match.index).trim();
            if (textPart) {
                parts.push({ type: 'text', content: textPart });
            }
        }

        const lang = match[1] || 'plaintext';
        const code = match[2].trim();
        parts.push({ type: 'code', lang, code });
        
        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < textToRender.length) {
        const remainingText = textToRender.substring(lastIndex).trim();
        if (remainingText) {
            parts.push({ type: 'text', content: remainingText });
        }
    }

    if (parts.length === 0 && textToRender) {
        parts.push({ type: 'text', content: textToRender });
    }

    return parts;
}, [parsedResponseText, message.type, message.content]);

const markedRenderer = useMemo(() => {
const renderer = new marked.Renderer();
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
return `<pre><code class="language-${safeLang} hljs">${highlighted}</code></pre>`;
}
} catch(e) { /* language not supported */ }

return `<pre><code class="language-${safeLang}">${escapedCode}</code></pre>`;
};
return renderer;
}, []);

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
const mermaidElements = contentRef.current.querySelectorAll('.mermaid');
if (mermaidElements.length > 0 && (window as any).mermaid) {
mermaidElements.forEach((el, i) => {
const id = `mermaid-graph-${message.id || 'msg'}-${i}`;
const code = el.textContent || '';
if (code && !el.hasAttribute('data-processed')) {
try {
(window as any).mermaid.render(id, code, (svgCode: string) => {
el.innerHTML = svgCode;
el.setAttribute('data-processed', 'true');
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
}, [contentParts, message.type, message.id]);

const hasThinking = !isUser && ((message.type === MessageType.AI_SOURCES && Array.isArray(message.content) && message.content.length > 0) || hasThinkingTag || parsedThinkingText);
const hasAttachments = isUser && message.files && message.files.length > 0;
const showBreathingIndicator = !isUser && isLoading && contentParts.length === 0;

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
{message.type === MessageType.AI_SOURCES && Array.isArray(message.content) && (
<GroundingDisplay chunks={message.content as GroundingChunk[]} />
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
    {message.files?.map((file, index) =>
      isImageFile(file.type) ? (
        <img
          key={index}
          src={file.dataUrl}
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
           {typeof message.content === 'string' && message.content ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
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
        <div ref={contentRef} className="prose prose-sm max-w-none w-full">
          {contentParts.map((part, index) => {
              if (part.type === 'text' && part.content) {
                  const html = marked.parse(part.content, { breaks: true, gfm: true, renderer: markedRenderer }) as string;
                  return <div key={index} dangerouslySetInnerHTML={{ __html: html }} />;
              }
              if (part.type === 'code' && part.code) {
                  const lang = part.lang?.toLowerCase() || 'plaintext';
                  if (message.type === MessageType.AI_EXECUTABLE_CODE) {
                      return (
                          <div key={index} className="not-prose my-4">
                              <CodeExecutor code={part.code} onPreview={onPreview} />
                          </div>
                      );
                  }
                  if (lang === 'mermaid') {
                      return <div key={index} className="mermaid">{part.code}</div>;
                  }
                  const safeLang = escapeHtml(lang);
                  const highlightLang = safeLang === 'python-example' ? 'python' : safeLang;
                  const escapedCode = escapeHtml(part.code);
                  let highlightedHtml = escapedCode;
                  try {
                      if ((window as any).hljs) {
                          highlightedHtml = (window as any).hljs.highlight(escapedCode, { language: highlightLang, ignoreIllegals: true }).value;
                      }
                  } catch(e) { /* language not supported */ }
      
                  return (
                      <pre key={index}>
                          <code className={`language-${safeLang} hljs`} dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
                      </pre>
                  );
              }
              return null;
          })}
          {showBreathingIndicator && (
              <div className="pt-2">
                  <span className="typing-indicator breathing"></span>
              </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-2 transition-opacity opacity-0 group-hover:opacity-100">
            <IconButton onClick={handleCopy} aria-label="Copy message">
                {isCopied ? <span className="text-xs px-1">Copied!</span> : <CopyIcon className="size-4" />}
            </IconButton>
            <IconButton onClick={() => message.id && onRegenerate(message.id)} aria-label="Regenerate response">
                <RefreshCwIcon className="size-4" />
            </IconButton>
        </div>
    </>
)}

</div>
</div>
);
};
export default ChatMessage;
