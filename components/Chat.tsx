
import React, { useRef, useState, useEffect, useMemo, forwardRef, useImperativeHandle, useCallback } from 'react';
import { marked } from 'marked';
import { 
  MessageType, Message, GroundingChunk, FileAttachment, 
  AIStatus, ExecutionResult 
} from '../types';
import { 
  XIcon, PaperclipIcon, ReplyIcon, SearchIcon, BrainIcon, 
  ChevronDownIcon, MessageRefreshIcon, MessageCopyIcon, GitForkIcon, 
  MapPinIcon, CheckIcon, CornerDownRightIcon, RefreshCwIcon,
  PlayIcon, DownloadIcon, Wand2Icon, ChevronsUpDownIcon, ChevronsDownUpIcon,
  Maximize2Icon
} from './Icons';
import { GeneratingLoader, SkeletonLoader } from './UI';
import { GenerativeUI } from './GenerativeUI';
import { runPythonCode, stopPythonExecution, PythonExecutorUpdate } from '../services/pythonExecutorService';

const textToHtml = (text: string): string => {
  if (!text) return '';
  const placeholders: { [key:string]: string } = {}; 
  let placeholderId = 0; 
  const mathRegex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\(.+?\\\)|(\$[^\$\n\r]+?\$))/g;
  const textWithPlaceholders = text.replace(mathRegex, (match) => { 
    const id = `__KIPP_PLACEHOLDER_${placeholderId++}__`; 
    placeholders[id] = match; 
    return id; 
  });
  let html = marked.parse(textWithPlaceholders, { breaks: true, gfm: true }) as string;
  for (const id in placeholders) { 
    html = html.replace(id, placeholders[id]); 
  }
  return html;
};

const getHostname = (url: string) => { try { return new URL(url).hostname; } catch (e) { return 'google.com'; } };
const getDomainLabel = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'source'; } };

export const GroundingSources: React.FC<{ chunks: GroundingChunk[]; t: (key: string) => string; }> = ({ chunks, t }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  if (!chunks || chunks.length === 0) return null;
  const visiblePills = chunks.slice(0, 3);
  return (
    <>
      <button type="button" className="flex items-center gap-2 group px-3 py-1.5 rounded-full bg-white dark:bg-[#141414] hover:bg-gray-50 dark:hover:bg-[#292929] border border-gray-200 dark:border-[#27272a] transition-all shadow-sm" onClick={() => setIsModalOpen(true)}>
        <div className="flex items-center -space-x-2">
          {visiblePills.map((chunk, index) => { 
            const icon = 'web' in chunk ? `https://www.google.com/s2/favicons?sz=64&domain_url=${getHostname(chunk.web.uri)}` : null; 
            return (<div key={index} className="size-5 rounded-full bg-white dark:bg-[#141414] border-2 border-white dark:border-[#141414] ring-1 ring-gray-200 dark:ring-[#27272a] overflow-hidden flex items-center justify-center">{icon ? <img src={icon} alt="" className="size-3" /> : <MapPinIcon className="size-5 text-blue-500" />}</div>); 
          })}
        </div>
        <div className="text-[11px] font-bold text-gray-500 dark:text-[#a1a1aa] group-hover:text-black dark:group-hover:text-white transition-colors uppercase tracking-widest">{chunks.length} sources</div>
      </button>
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in-up" onClick={() => setIsModalOpen(false)}>
          <div className="bg-white dark:bg-[#141414] rounded-[2.5rem] shadow-2xl w-full max-w-md max-h-[75vh] flex flex-col overflow-hidden border border-gray-200 dark:border-[#27272a]" onClick={e => e.stopPropagation()}>
            <header className="flex items-center justify-between p-7 pb-2"><div className="flex flex-col"><h3 className="text-xl font-extrabold text-black dark:text-white tracking-tight">Sources</h3><p className="text-[10px] text-gray-400 dark:text-[#a1a1aa] font-bold uppercase tracking-widest mt-1">Verified Information</p></div><button onClick={() => setIsModalOpen(false)} className="p-2.5 rounded-full bg-gray-50 dark:bg-[#1f1f1f] hover:bg-gray-100 dark:hover:bg-[#292929] transition-colors border border-gray-100 dark:border-[#27272a]"><XIcon className="size-5 text-black dark:text-white" /></button></header>
            <div className="flex-1 overflow-y-auto p-4 scrollbar-none flex flex-col gap-1">
              {chunks.map((chunk, i) => { 
                const isWeb = 'web' in chunk; 
                const url = isWeb ? chunk.web.uri : (chunk as any).maps.uri; 
                const title = isWeb ? chunk.web.title : (chunk as any).maps.title; 
                const fav = isWeb ? `https://www.google.com/s2/favicons?sz=64&domain_url=${getHostname(url)}` : null; 
                return (<a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-[#292929] transition-all border border-transparent hover:border-gray-100 dark:hover:border-white/5 group"><div className="size-10 rounded-xl bg-gray-50 dark:bg-[#1f1f1f] flex items-center justify-center shrink-0 border border-gray-100 dark:border-[#27272a] transition-colors group-hover:bg-white dark:group-hover:bg-[#141414]">{fav ? <img src={fav} alt="" className="size-5 rounded-sm" /> : <MapPinIcon className="size-5 text-blue-500" />}</div><div className="flex-1 min-w-0"><p className="text-sm font-bold text-black dark:text-white truncate">{title}</p><p className="text-[10px] text-gray-400 dark:text-[#a1a1aa] truncate uppercase tracking-widest font-bold mt-0.5">{getDomainLabel(url)}</p></div></a>); 
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export interface ChatInputHandle { focus: () => void; handleFiles: (files: FileList) => void; }
export const ChatInput = forwardRef<ChatInputHandle, { text: string; onTextChange: (text: string) => void; onSendMessage: (text: string, files: File[]) => void; isLoading: boolean; t: (key: string, params?: Record<string, string>) => string; onAbortGeneration: () => void; replyContextText: string | null; onClearReplyContext: () => void; language: string; }>(({ text, onTextChange, onSendMessage, isLoading, t, onAbortGeneration, replyContextText, onClearReplyContext }, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null); 
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]); 
  const [previews, setPreviews] = useState<string[]>([]);
  
  const handleFiles = (files: FileList) => { 
    const newFiles = Array.from(files); 
    setAttachedFiles(prev => [...prev, ...newFiles]); 
    newFiles.forEach(file => { 
      if (file.type.startsWith('image/')) { 
        const reader = new FileReader(); 
        reader.onload = (e) => setPreviews(prev => [...prev, e.target?.result as string]); 
        reader.readAsDataURL(file); 
      } else { 
        setPreviews(prev => [...prev, 'file']); 
      } 
    }); 
  };
  
  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus(), handleFiles: (files: FileList) => handleFiles(files) }));
  
  useEffect(() => { 
    if (textareaRef.current) { 
      textareaRef.current.style.height = 'auto'; 
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`; 
    } 
  }, [text]);
  
  const handleSend = () => { 
    if ((text.trim() || attachedFiles.length > 0) && !isLoading) { 
      onSendMessage(text, attachedFiles); 
      onTextChange(''); 
      setAttachedFiles([]); 
      setPreviews([]); 
      if (textareaRef.current) textareaRef.current.style.height = 'auto'; 
      if (fileInputRef.current) fileInputRef.current.value = ''; 
    } 
  };
  
  const hasContent = text.trim().length > 0 || attachedFiles.length > 0;
  
  return (
    <div className="w-full flex flex-col gap-2">
      {(replyContextText || previews.length > 0) && (
        <div className="flex flex-col gap-2 px-2 mb-1">
          {replyContextText && (
            <div className="flex items-center gap-2 bg-surface-l1 dark:bg-[#111] border border-border p-2 rounded-xl text-xs text-muted-foreground animate-fade-in-up shadow-sm">
              <ReplyIcon className="size-3 shrink-0" />
              <span className="truncate flex-1">{replyContextText}</span>
              <button onClick={onClearReplyContext} className="p-1 hover:bg-surface-l2 rounded-full"><XIcon className="size-3" /></button>
            </div>
          )}
          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2 animate-fade-in-up">
              {previews.map((src, i) => (
                <div key={i} className="relative group size-16 rounded-xl border border-border overflow-hidden bg-surface-l1 shadow-sm">
                  {src === 'file' ? (
                    <div className="w-full h-full flex items-center justify-center text-[10px] p-1 text-center truncate bg-surface-l2 text-foreground font-medium">{attachedFiles[i]?.name}</div>
                  ) : (
                    <img src={src} className="w-full h-full object-cover" alt="" />
                  )}
                  <button onClick={() => { setAttachedFiles(prev => prev.filter((_, idx) => idx !== i)); setPreviews(prev => prev.filter((_, idx) => idx !== i)); }} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 shadow-md transition-transform active:scale-90"><XIcon className="size-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="bg-white dark:bg-[#1f1f1f] rounded-[1.75rem] border border-gray-200 dark:border-[#27272a] flex items-end gap-2 p-2 relative shadow-lg">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center size-10 rounded-full cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0 mb-0.5">
          <input type="file" ref={fileInputRef} onChange={(e) => e.target.files && handleFiles(e.target.files)} className="hidden" multiple />
          <PaperclipIcon className="size-5 text-muted-foreground" />
        </button>
        <textarea ref={textareaRef} value={text} onChange={(e) => onTextChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder="Ask KIPP anything..." className="flex-1 bg-transparent outline-none text-foreground placeholder-muted-foreground text-[16px] py-2.5 px-1 resize-none max-h-[200px]" rows={1} />
        <div className="flex items-center justify-center size-10 flex-shrink-0 mb-0.5">
          {isLoading ? (
            <button onClick={onAbortGeneration} className="size-8 flex items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"><div className="size-3 bg-current rounded-sm"></div></button>
          ) : (
            <button onClick={handleSend} disabled={!hasContent} className={`flex items-center justify-center size-8 rounded-full transition-all ${hasContent ? 'bg-foreground text-background scale-110' : 'bg-transparent text-muted-foreground opacity-30 cursor-default'}`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-[2.5]"><path d="m5 12 7-7 7 7" stroke="currentColor"></path><path d="M12 19V5" stroke="currentColor"></path></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

export const GallerySearchLoader: React.FC<{ query: string, onOpenLightbox: (images: any[], index: number) => void }> = ({ query, onOpenLightbox }) => {
  const [images, setImages] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true);
  useEffect(() => { 
    const fetchImages = async () => { 
      try { 
        setLoading(true); 
        const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageSearchQuery: query }) }); 
        const data = await res.json(); 
        if (data.images && Array.isArray(data.images)) { 
          setImages(data.images.map((url: string) => ({ url, alt: query }))); 
        } 
      } catch (e) {} finally { setLoading(false); } 
    }; 
    if (query) fetchImages(); 
  }, [query]);
  
  if (loading) return (<div className="grid grid-cols-3 gap-1.5 my-2 max-w-xl">{[1,2,3].map(i => <div key={i} className="aspect-square bg-surface-l2 animate-pulse rounded-lg" />)}</div>);
  if (images.length === 0) return null;
  return (
    <div className="not-prose my-2 grid grid-cols-3 gap-1.5 max-w-xl">
      {images.map((img, i) => (
        <div key={i} className="relative rounded-lg overflow-hidden cursor-pointer group bg-surface-l2 border border-border aspect-square" onClick={() => onOpenLightbox(images, i)}>
          <img src={img.url} alt={img.alt} className="w-full h-full object-cover transition-all duration-500 group-hover:scale-105" loading="lazy" />
        </div>
      ))}
    </div>
  );
}

export const SearchStatus: React.FC<{ sources?: GroundingChunk[], resultCount?: number }> = ({ sources, resultCount }) => {
  const [step, setStep] = useState(0); 
  useEffect(() => { if (sources && sources.length > 0) setStep(1); }, [sources]);
  return (
    <div className="flex flex-col gap-1 cursor-crosshair text-sm mb-4 animate-fade-in-up">
      <div className="flex flex-row items-center gap-2 cursor-pointer hover:opacity-80">
        <div className="flex flex-row items-center gap-2 text-foreground">
          <SearchIcon className={`size-4 ${step === 0 ? 'animate-pulse text-accent-blue' : 'text-muted-foreground'}`} />
          <div className={step === 0 ? 'font-medium' : 'text-muted-foreground'}>Searching the web</div>
        </div>
        {step === 1 && (<div className="text-muted-foreground text-xs font-mono ml-1">{resultCount && resultCount > 0 ? <>{resultCount} results</> : `${sources?.length || 0} sources`}</div>)}
      </div>
      {step === 1 && sources && sources.length > 0 && (
        <div className="flex flex-row items-center gap-2 cursor-pointer hover:opacity-80 animate-fade-in-up">
          <div className="flex flex-row items-center gap-2 text-foreground">
            <div className="size-4 rounded-full bg-accent-blue/10 flex items-center justify-center">
              <div className="size-2 bg-accent-blue rounded-full animate-pulse"></div>
            </div>
            <div className="font-medium">Browsing</div>
          </div>
          <div className="text-muted-foreground text-xs truncate max-w-[200px]">{'web' in sources[0] ? sources[0].web.uri : (sources[0] as any).maps.uri}</div>
        </div>
      )}
    </div>
  );
};

export const CodeExecutor: React.FC<{ code: string; lang: string; title?: string; isExecutable: boolean; autorun?: boolean; initialCollapsed?: boolean; persistedResult?: ExecutionResult; onExecutionComplete: (result: ExecutionResult) => void; onFixRequest?: (error: string) => void; onStopExecution: () => void; isPythonReady: boolean; isLoading?: boolean; t: (key: string, params?: Record<string, string>) => string; }> = ({ code, lang, title, isExecutable, autorun, initialCollapsed = false, persistedResult, onExecutionComplete, onFixRequest, onStopExecution, isPythonReady, isLoading = false, t }) => {
  const plotlyRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
  const [output, setOutput] = useState<any>('');
  const [error, setError] = useState<string>('');
  const [downloadableFile, setDownloadableFile] = useState<any>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [hasRunOnce, setHasRunOnce] = useState(!!persistedResult);

  const runPython = useCallback(async () => {
    setStatus('executing'); setHasRunOnce(true);
    let stdoutBuffer = ''; let stderrBuffer = ''; let finalResult: ExecutionResult | null = null;
    runPythonCode(code, (update: PythonExecutorUpdate) => {
      switch (update.type) {
        case 'stdout': stdoutBuffer += update.data + '\n'; setOutput((prev:any) => (typeof prev === 'string' ? prev : '') + update.data + '\n'); break;
        case 'stderr': stderrBuffer += update.error + '\n'; setError(stderrBuffer.trim()); break;
        case 'plot': 
          if (update.plotType === 'plotly') { 
            setOutput(update.data); finalResult = { output: update.data, error: '', type: 'plotly-json' }; 
          } else { 
            setOutput(<img src={`data:image/png;base64,${update.data}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />); 
            finalResult = { output: update.data, error: '', type: 'image-base64' }; 
          } 
          break;
        case 'download': 
          const fileInfo = { filename: update.filename!, mimetype: update.mimetype!, data: update.data! }; 
          setDownloadableFile(fileInfo); 
          setIsCollapsed(true); 
          break;
        case 'success': 
          setStatus('success'); 
          let res: ExecutionResult; 
          if (finalResult) res = { ...finalResult, error: stderrBuffer.trim() };
          else res = { output: stdoutBuffer.trim() || null, error: stderrBuffer.trim(), type: 'string' };
          onExecutionComplete(res); 
          break;
        case 'error': 
          setError(update.error || ''); setStatus('error'); 
          onExecutionComplete({ output: null, error: update.error || '', type: 'error' }); 
          break;
      }
    });
  }, [code, onExecutionComplete, t]);

  const handleRunCode = useCallback(async () => {
    setOutput(''); setError(''); setDownloadableFile(null);
    if (lang.toLowerCase() === 'python') await runPython(); 
  }, [lang, runPython]);

  useEffect(() => {
    if (persistedResult) {
      const { output: savedOutput, error: savedError, type, downloadableFile: savedFile } = persistedResult;
      if (type === 'error') { setError(savedError); setStatus('error'); } 
      else { 
        if (savedError) setError(savedError); 
        if (savedOutput !== null) { 
          if (type === 'image-base64') setOutput(<img src={`data:image/png;base64,${savedOutput}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />); 
          else if (type === 'plotly-json') setOutput(savedOutput); 
          else setOutput(savedOutput); 
        } 
        setStatus('success'); 
      }
      if (savedFile) { setDownloadableFile(savedFile); setIsCollapsed(true); }
      setHasRunOnce(true);
    }
  }, [persistedResult]);

  const ActionButton = ({ onClick, title, children, disabled = false }: any) => (
    <button onClick={onClick} title={title} disabled={disabled} className="p-1.5 rounded-md text-muted-foreground hover:bg-surface-l2 hover:text-foreground transition-colors disabled:opacity-50">
      {children}
    </button>
  );

  return (
    <div className="not-prose my-4 font-sans max-w-full">
      <div className="bg-code-bg border border-border rounded-lg overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-3 py-1.5 bg-background/30">
          <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{title || lang}</span></div>
          <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
            <ActionButton onClick={() => setIsCollapsed(!isCollapsed)} title={isCollapsed ? 'Expand' : 'Collapse'}>{isCollapsed ? <ChevronsUpDownIcon className="size-3.5" /> : <ChevronsDownUpIcon className="size-3.5" />}</ActionButton>
            {isExecutable && (status === 'executing' ? (<ActionButton onClick={() => { stopPythonExecution(); onStopExecution(); setStatus('idle'); }} title="Stop"><div className="w-2.5 h-2.5 bg-foreground rounded-sm animate-pulse"></div></ActionButton>) : (<ActionButton onClick={handleRunCode} title={hasRunOnce ? 'Run Again' : 'Run'} disabled={lang === 'python' && !isPythonReady}>{hasRunOnce ? <RefreshCwIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}</ActionButton>))}
            <ActionButton onClick={() => { navigator.clipboard.writeText(code); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }} title="Copy">{isCopied ? <CheckIcon className="size-3.5 text-green-500" /> : <MessageCopyIcon className="size-3.5" />}</ActionButton>
          </div>
        </div>
        {!isCollapsed && (
          <div className="p-3 bg-code-bg overflow-x-auto">
            <pre className="!m-0 !p-0 bg-transparent text-[13px] leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        )}
      </div>
      <div className="mt-2">
        {status === 'executing' && <div className="text-xs text-muted-foreground">Executing...</div>}
        {hasRunOnce && (status === 'success' || status === 'error') && (
           <div className="p-3 bg-surface-l1 border border-border rounded-lg">
             {error && <pre className="text-red-500 text-xs">{error}</pre>}
             {output && (typeof output === 'string' ? <pre className="text-xs">{output}</pre> : <div>{output}</div>)}
           </div>
        )}
      </div>
    </div>
  );
};

export const ChatMessage: React.FC<{ message: Message; onRegenerate: (messageId: string) => void; onFork: (messageId: string) => void; isLoading: boolean; aiStatus: AIStatus; executionResults: Record<string, ExecutionResult>; onStoreExecutionResult: (messageId: string, partIndex: number, result: ExecutionResult) => void; onFixRequest: (code: string, lang: string, error: string) => void; onStopExecution: () => void; isPythonReady: boolean; t: (key: string) => string; onOpenLightbox: (images: any[], startIndex: number) => void; isLast: boolean; onSendSuggestion: (text: string) => void; }> = ({ message, onRegenerate, onFork, isLoading, aiStatus, executionResults, onStoreExecutionResult, onFixRequest, onStopExecution, isPythonReady, t, onOpenLightbox, isLast, onSendSuggestion }) => {
  const isUser = message.type === MessageType.USER; 
  const isError = message.type === MessageType.ERROR; 
  const [isThinkingOpen, setIsThinkingOpen] = useState(false); 
  const [isCopied, setIsCopied] = useState(false);
  
  const messageText = useMemo(() => typeof message.content === 'string' ? message.content : '', [message.content]);
  
  const { parsedThinkingText, parsedResponseText, hasThinkingTag, suggestions } = useMemo(() => {
    if (isUser) return { parsedThinkingText: null, parsedResponseText: messageText, hasThinkingTag: false, suggestions: [] };
    let text = messageText || ''; 
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
          finalParts.push({ type: 'code', lang, code, partIndex: partIndex++ }); 
        } 
      } 
      else if (part.startsWith('!gallery')) { 
        const match = /!gallery\["(.*?)"\]/.exec(part); 
        if (match && match[1]) finalParts.push({ type: 'gallery-search', query: match[1] }); 
      } 
      else { 
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
      <div className="relative group flex flex-col justify-center w-full pb-4 items-end">
        <div className="message-bubble relative rounded-3xl text-foreground prose dark:prose-invert break-words bg-surface-l1 border border-border max-w-[90%] px-4 py-2 rounded-br-lg shadow-sm">
          <div className="whitespace-pre-wrap leading-relaxed text-[16px]">{messageText}</div>
        </div>
        {message.files && message.files.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 mt-2">
            {message.files.map((file, i) => (
              <div key={i} className="relative group rounded-xl overflow-hidden border border-border">
                {file.type.startsWith('image/') ? <img src={file.dataUrl} alt={file.name} className="h-20 w-auto object-cover" /> : <div className="h-20 w-20 bg-surface-l2 flex items-center justify-center text-xs text-muted-foreground p-2 text-center break-all">{file.name}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const isActuallyLastLoading = isLast && isLoading;

  return (
    <div className="relative group flex flex-col justify-center w-full pb-4 items-start">
      {hasThinkingTag && parsedThinkingText && (
        <div className="mb-2">
          <div onClick={() => setIsThinkingOpen(!isThinkingOpen)} className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors w-fit p-1 rounded-lg">
            <BrainIcon className={`size-4 ${isActuallyLastLoading && aiStatus === 'thinking' ? 'animate-pulse text-accent-blue' : ''}`} />
            <span className="text-sm font-medium">{t('chat.message.thinking')}</span>
            <ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} />
          </div>
          {isThinkingOpen && <div className="mt-2 pl-3 border-l-2 border-border text-muted-foreground text-sm italic whitespace-pre-wrap animate-fade-in-up">{parsedThinkingText}</div>}
        </div>
      )}
      <div className={`message-bubble relative rounded-3xl text-foreground prose dark:prose-invert break-words w-full max-w-none px-4 py-2 ${!parsedResponseText && isActuallyLastLoading ? 'min-h-[28px]' : 'min-h-7'}`}>
        {!parsedResponseText && isActuallyLastLoading && !parsedThinkingText && (<GeneratingLoader />)}
        {renderableContent.map((part: any, index: number) => {
          if (part.type === 'code') { 
            const resultKey = `${message.id}_${part.partIndex}`; 
            const result = executionResults[resultKey]; 
            const isPython = part.lang === 'python'; 
            return <CodeExecutor key={index} code={part.code} lang={part.lang} title={part.lang.toUpperCase()} isExecutable={['python', 'html'].includes(part.lang.toLowerCase())} autorun={isPython && !result} onExecutionComplete={(res) => onStoreExecutionResult(message.id, part.partIndex, res)} onFixRequest={(err) => onFixRequest(part.code, part.lang, err)} persistedResult={result} onStopExecution={onStopExecution} isPythonReady={isPythonReady} isLoading={isLoading} t={t} />;
          }
          if (part.type === 'gallery-search') return <GallerySearchLoader key={index} query={part.query} onOpenLightbox={onOpenLightbox} />;
          return <div key={index} dangerouslySetInnerHTML={{ __html: textToHtml(part.content) }} />;
        })}
      </div>
      {message.groundingChunks && message.groundingChunks.length > 0 && !isLoading && <div className="mt-2 flex flex-wrap gap-2"><GroundingSources chunks={message.groundingChunks} t={t} /></div>}
      {!isLoading && (
        <div className="flex items-center gap-2 mt-2 w-full justify-start px-2">
          <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground" title={t('chat.message.regenerate')} onClick={() => onRegenerate(message.id)}><MessageRefreshIcon className="size-4" /></button>
          <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground" title={t('chat.message.copy')} onClick={handleCopy}>{isCopied ? <CheckIcon className="size-4 text-green-500" /> : <MessageCopyIcon className="size-4" />}</button>
          <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground" title={t('chat.message.fork')} onClick={() => onFork(message.id)}><GitForkIcon className="size-4" /></button>
        </div>
      )}
      {isLast && suggestions.length > 0 && !isLoading && (
        <div className="mt-4 flex flex-col items-start gap-2 animate-fade-in-up w-full">
          {suggestions.map((suggestion, idx) => (
            <button key={idx} onClick={() => onSendSuggestion(suggestion)} className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors h-9 rounded-xl px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-l2 border border-transparent hover:border-border">
              <CornerDownRightIcon className="size-3.5 text-muted-foreground" />
              <span className="truncate max-w-[300px]">{suggestion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
