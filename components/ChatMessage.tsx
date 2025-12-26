
import React, { useMemo, useState, useEffect } from 'react';
import { marked } from 'marked';
import { Message, MessageType, AIStatus, ExecutionResult, GroundingChunk } from '../types';
import { BrainIcon, ChevronDownIcon, SearchIcon, MessageCopyIcon, MessageRefreshIcon, GitForkIcon, CheckIcon, CornerDownRightIcon } from './icons';
import CodeExecutor from './CodeExecutor';
import GeneratingLoader from './GeneratingLoader';
import GroundingSources from './GroundingSources';
import ImageGallery from './ImageGallery';

const textToHtml = (text: string): string => {
    if (!text) return '';
    const html = marked.parse(text, { breaks: true, gfm: true }) as string;
    return html;
};

const SearchStatus: React.FC<{ sources?: GroundingChunk[], resultCount?: number }> = ({ sources, resultCount }) => {
    const [step, setStep] = useState(0); 
    useEffect(() => { if (sources && sources.length > 0) setStep(1); }, [sources]);
    return (
        <div className="flex flex-col gap-1 cursor-crosshair text-sm mb-4 animate-fade-in-up">
            <div className="flex flex-row items-center gap-2 cursor-pointer hover:opacity-80">
                <SearchIcon className={`size-4 ${step === 0 ? 'animate-pulse text-blue-500' : 'text-muted-foreground'}`} />
                <div className={step === 0 ? 'font-medium' : 'text-muted-foreground'}>Searching the web</div>
                {step === 1 && (<div className="text-muted-foreground text-xs font-mono ml-1">{resultCount && resultCount > 0 ? <>{resultCount} results</> : `${sources?.length || 0} sources`}</div>)}
            </div>
            {step === 1 && sources && sources.length > 0 && (
                <div className="flex flex-row items-center gap-2 cursor-pointer hover:opacity-80 animate-fade-in-up">
                    <div className="size-4 rounded-full bg-blue-500/10 flex items-center justify-center"><div className="size-2 bg-blue-500 rounded-full animate-pulse"></div></div>
                    <div className="font-medium truncate max-w-[200px]">{'web' in sources[0] ? sources[0].web.uri : (sources[0] as any).maps.uri}</div>
                </div>
            )}
        </div>
    );
};

interface ChatMessageProps { 
  message: Message; 
  onRegenerate: (messageId: string) => void; 
  onFork: (messageId: string) => void; 
  isLoading: boolean; 
  aiStatus: AIStatus; 
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

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onRegenerate, onFork, isLoading, aiStatus, executionResults, onStoreExecutionResult, onFixRequest, onStopExecution, isPythonReady, t, onOpenLightbox, isLast, onSendSuggestion }) => {
    const isUser = message.type === MessageType.USER; 
    const isError = message.type === MessageType.ERROR; 
    const [isThinkingOpen, setIsThinkingOpen] = useState(false); 
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => { if (aiStatus === 'thinking' && isLast) setIsThinkingOpen(true); }, [aiStatus, isLast]);

    const { parsedThinkingText, parsedResponseText, hasThinkingTag, suggestions } = useMemo(() => {
        if (isUser) return { parsedThinkingText: null, parsedResponseText: message.content, hasThinkingTag: false, suggestions: [] };
        let text = message.content || ''; 
        let extractedSuggestions: string[] = [];
        const suggestionsMatch = text.match(/<suggestions>(.*?)<\/suggestions>/s); 
        if (suggestionsMatch) { 
          try { extractedSuggestions = JSON.parse(suggestionsMatch[1]); } catch (e) {} 
          text = text.replace(/<suggestions>.*?<\/suggestions>/s, '').trim(); 
        }
        const thinkingMatch = text.match(/<thinking>([\s\S]*?)(?:<\/thinking>|$)/); 
        let thinking = null; 
        let response = text; 
        let hasTag = false;
        if (text.includes('<thinking>')) { 
          hasTag = true; 
          if (thinkingMatch) { 
            thinking = thinkingMatch[1].trim(); 
            if (text.includes('</thinking>')) { 
              response = text.split('</thinking>')[1]?.trim() || ''; 
            } else { response = ''; } 
          } 
        }
        return { parsedThinkingText: thinking, parsedResponseText: response, hasThinkingTag: hasTag, suggestions: extractedSuggestions };
    }, [message.content, isUser]);

    const renderableContent = useMemo(() => {
        const textToRender = parsedResponseText; if (!textToRender) return [];
        const blockRegex = /(```[\w\s\S]*?```)/g; 
        let finalParts: any[] = []; 
        let partIndex = 0;
        textToRender.split(blockRegex).filter(Boolean).forEach(part => {
            if (part.startsWith('```')) { 
              const codeMatch = /```([\w-]+)?(?:[^\n]*)?\n([\s\S]*?)```/.exec(part); 
              if (codeMatch) { 
                const lang = codeMatch[1] || 'plaintext'; 
                const code = codeMatch[2]; 
                finalParts.push({ type: 'code', lang, code, partIndex: partIndex++ }); 
              } 
            } else { finalParts.push({ type: 'text', content: part }); }
        });
        return finalParts;
    }, [parsedResponseText]);

    const handleCopy = () => { navigator.clipboard.writeText(parsedResponseText).then(() => { setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }); };

    if (isUser) {
        return (
            <div className="relative group flex flex-col justify-center w-full pb-4 items-end">
                <div className="message-bubble relative rounded-3xl text-foreground prose dark:prose-invert break-words bg-gray-100 dark:bg-zinc-900 border border-border max-w-[100%] @sm/mainview:max-w-[90%] px-4 py-2 rounded-br-lg shadow-sm">
                  <div className="whitespace-pre-wrap leading-relaxed text-[16px]">{message.content}</div>
                </div>
                {message.files && message.files.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-2 mt-2">
                      {message.files.map((file, i) => (
                        <div key={i} className="relative group rounded-xl overflow-hidden border border-border">
                          {file.type.startsWith('image/') ? <img src={file.dataUrl} alt={file.name} className="h-20 w-auto object-cover" /> : <div className="h-20 w-20 bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-xs text-muted-foreground p-2 text-center break-all">{file.name}</div>}
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
          <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 text-sm">{message.content || "An unknown error occurred."}</div>
        </div>
      ); 
    }

    const isActuallyLastLoading = isLast && isLoading;
    const showSearchUI = (aiStatus === 'searching' && isActuallyLastLoading) || (message.groundingChunks && message.groundingChunks.length > 0 && isActuallyLastLoading && !parsedResponseText);

    return (
        <div className="relative group flex flex-col justify-center w-full pb-4 items-start">
             {hasThinkingTag && parsedThinkingText && (
               <div className="mb-2">
                 <div onClick={() => setIsThinkingOpen(!isThinkingOpen)} className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors w-fit p-1 rounded-lg">
                   <BrainIcon className={`size-4 ${isActuallyLastLoading && aiStatus === 'thinking' ? 'animate-pulse text-blue-500' : ''}`} />
                   <span className="text-sm font-medium">{t('chat.message.thinking')}</span>
                   <ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} />
                 </div>
                 {isThinkingOpen && <div className="mt-2 pl-3 border-l-2 border-border text-muted-foreground text-sm italic whitespace-pre-wrap animate-fade-in-up">{parsedThinkingText}</div>}
               </div>
             )}
            {showSearchUI && <SearchStatus sources={message.groundingChunks} resultCount={message.searchResultCount} />}
            <div className={`message-bubble relative rounded-3xl text-foreground prose dark:prose-invert break-words w-full max-w-none px-4 py-2 ${!parsedResponseText && isActuallyLastLoading ? 'min-h-0 py-0' : 'min-h-7'}`}>
                 {!parsedResponseText && isActuallyLastLoading && !parsedThinkingText && !showSearchUI && (<div className="flex items-center gap-2 text-muted-foreground min-h-[28px]"><GeneratingLoader /></div>)}
                {renderableContent.map((part: any, index: number) => {
                    if (part.type === 'code') { 
                      const resultKey = `${message.id}_${part.partIndex}`; 
                      const result = executionResults[resultKey]; 
                      const isPython = part.lang === 'python'; 
                      return (
                        <div key={index} className="w-full my-4 not-prose">
                          <CodeExecutor code={part.code} lang={part.lang} isExecutable={['python', 'html'].includes(part.lang.toLowerCase())} autorun={isPython && !result} onExecutionComplete={(res) => onStoreExecutionResult(message.id, part.partIndex, res)} onFixRequest={(err) => onFixRequest(part.code, part.lang, err)} persistedResult={result} onStopExecution={onStopExecution} isPythonReady={isPythonReady} isLoading={isLoading} t={t} />
                        </div>
                      ); 
                    }
                    return <div key={index} className="prose dark:prose-invert max-w-none w-full" dangerouslySetInnerHTML={{ __html: textToHtml(part.content) }} />;
                })}
            </div>
            {message.groundingChunks && message.groundingChunks.length > 0 && !isLoading && <div className="mt-2 flex flex-wrap gap-2"><GroundingSources chunks={message.groundingChunks} t={t} /></div>}
            {!isLoading && (
                <div className="flex items-center gap-2 mt-2 w-full justify-start px-2">
                    <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.regenerate')} onClick={() => onRegenerate(message.id)}><MessageRefreshIcon className="size-4" /></button>
                    <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.copy')} onClick={handleCopy}>{isCopied ? <CheckIcon className="size-4 text-green-500" /> : <MessageCopyIcon className="size-4" />}</button>
                    <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.fork')} onClick={() => onFork(message.id)}><GitForkIcon className="size-4" /></button>
                    {message.generationDuration && <span className="ml-2 text-muted-foreground text-xs select-none font-mono">{(message.generationDuration / 1000).toFixed(1)}s</span>}
                </div>
            )}
            {isLast && suggestions.length > 0 && !isLoading && (
              <div className="mt-4 flex flex-col items-start gap-2 animate-fade-in-up w-full">
                {suggestions.map((suggestion, idx) => (
                  <button key={idx} onClick={() => onSendSuggestion(suggestion)} className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-9 rounded-xl px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-gray-100 dark:hover:bg-zinc-800 border border-transparent hover:border-border">
                    <CornerDownRightIcon className="size-3.5 text-muted-foreground" /><span className="truncate max-w-[300px]">{suggestion}</span>
                  </button>
                ))}
              </div>
            )}
        </div>
    );
};

export default ChatMessage;
