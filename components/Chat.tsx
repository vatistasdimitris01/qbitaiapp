


import React, { useRef, useState, useEffect, useMemo, forwardRef, useImperativeHandle, useCallback } from 'react';
import { marked } from 'marked';
import { 
  MessageType, Message, GroundingChunk, AIStatus, ExecutionResult, MessageContent, DownloadableFile 
} from '../types';
import { 
  XIcon, PaperclipIcon, ReplyIcon, SearchIcon, BrainIcon, 
  ChevronDownIcon, MessageRefreshIcon, MessageCopyIcon, GitForkIcon, 
  MapPinIcon, CheckIcon, CornerDownRightIcon, RefreshCwIcon,
  PlayIcon, DownloadIcon, Wand2Icon, ChevronsUpDownIcon, ChevronsDownUpIcon,
  Maximize2Icon, ChevronLeftIcon, ChevronRightIcon, CopyIcon 
} from './Icons';
import { GeneratingLoader, SkeletonLoader } from './UI';
import { GenerativeUI } from './GenerativeUI';
import { runPythonCode, stopPythonExecution, PythonExecutorUpdate } from '../services/pythonExecutorService';
import { usePrevious } from '../hooks/usePrevious';

// ==========================================
// 8. MEDIUM COMPONENTS (from Section 8)
// ==========================================

export interface ImageInfo { url: string; alt: string; source?: string; }

export const GalleryImage: React.FC<{ image: ImageInfo; className?: string; overlayText?: string | null; onClick: () => void; }> = ({ image, className, overlayText, onClick }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  return (
    <div className={`relative rounded-lg overflow-hidden cursor-pointer group bg-token-surface-secondary border border-default ${className}`} onClick={onClick}>
      {status === 'loading' && <SkeletonLoader className="absolute inset-0" />}
      {status === 'error' && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground p-2 text-center text-xs">Error</div>}
      <img src={image.url} alt={image.alt} className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`} loading="lazy" onLoad={() => setStatus('loaded')} onError={() => setStatus('error')} />
      {status === 'loaded' && (<><div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />{overlayText && (<div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xl font-medium backdrop-blur-[2px]">{overlayText}</div>)}</>)}
    </div>
  );
};

export const ImageGallery: React.FC<{ images: ImageInfo[]; onImageClick: (index: number) => void; }> = ({ images, onImageClick }) => {
  if (!images || images.length === 0) return null;
  const len = images.length;
  if (len === 1) return (<div className="not-prose my-2"><GalleryImage image={images[0]} className="aspect-video max-w-sm" onClick={() => onImageClick(0)} /></div>);
  if (len === 2) return (<div className="not-prose my-2 grid grid-cols-2 gap-1.5 max-w-lg"><GalleryImage image={images[0]} className="aspect-square" onClick={() => onImageClick(0)} /><GalleryImage image={images[1]} className="aspect-square" onClick={() => onImageClick(1)} /></div>);
  if (len >= 4) { const visibleImages = images.slice(0, 4); const hiddenCount = images.length - 4; return (<div className="not-prose my-2 grid grid-cols-2 gap-1.5 max-w-md">{visibleImages.map((image, index) => { const overlay = index === 3 && hiddenCount > 0 ? `+${hiddenCount}` : null; return <GalleryImage key={index} image={image} overlayText={overlay} onClick={() => onImageClick(index)} className="aspect-[4/3]" />; })}</div>); }
  return (<div className="not-prose my-2 grid grid-cols-3 gap-1.5 max-w-xl">{images.map((img, i) => <GalleryImage key={i} image={img} className="aspect-square" onClick={() => onImageClick(i)} />)}</div>);
};

export const GroundingSources: React.FC<{ chunks: GroundingChunk[]; t: (key: string) => string; }> = ({ chunks, t }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    if (!chunks || chunks.length === 0) return null;
    const getHostname = (url: string) => { try { return new URL(url).hostname; } catch (e) { return 'google.com'; } };
    const getDomainLabel = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'source'; } };
    const visiblePills = chunks.slice(0, 3);
    return (
        <>
            <button type="button" className="flex items-center gap-2 group px-3 py-1.5 rounded-full bg-white dark:bg-[#141414] hover:bg-gray-50 dark:hover:bg-[#292929] border border-gray-200 dark:border-[#27272a] transition-all shadow-sm" onClick={() => setIsModalOpen(true)}>
                <div className="flex items-center -space-x-2">{visiblePills.map((chunk, index) => { const icon = 'web' in chunk ? `https://www.google.com/s2/favicons?sz=64&domain_url=${getHostname(chunk.web.uri)}` : null; return (<div key={index} className="size-5 rounded-full bg-white dark:bg-[#141414] border-2 border-white dark:border-[#141414] ring-1 ring-gray-200 dark:ring-[#27272a] overflow-hidden flex items-center justify-center">{icon ? <img src={icon} alt="" className="size-3" /> : <MapPinIcon className="size-5 text-blue-500" />}</div>); })}</div>
                <div className="text-[11px] font-bold text-gray-500 dark:text-[#a1a1aa] group-hover:text-black dark:group-hover:text-white transition-colors uppercase tracking-widest">{chunks.length} sources</div>
            </button>
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in-up" onClick={() => setIsModalOpen(false)}>
                    <div className="bg-white dark:bg-[#141414] rounded-[2.5rem] shadow-2xl w-full max-w-md max-h-[75vh] flex flex-col overflow-hidden border border-gray-200 dark:border-[#27272a]" onClick={e => e.stopPropagation()}>
                        <header className="flex items-center justify-between p-7 pb-2"><div className="flex flex-col"><h3 className="text-xl font-extrabold text-black dark:text-white tracking-tight">Sources</h3><p className="text-[10px] text-gray-400 dark:text-[#a1a1aa] font-bold uppercase tracking-widest mt-1">Verified Information</p></div><button onClick={() => setIsModalOpen(false)} className="p-2.5 rounded-full bg-gray-50 dark:bg-[#1f1f1f] hover:bg-gray-100 dark:hover:bg-[#292929] transition-colors border border-gray-100 dark:border-[#27272a]"><XIcon className="size-5 text-black dark:text-white" /></button></header>
                        <div className="flex-1 overflow-y-auto p-4 scrollbar-none flex flex-col gap-1">{chunks.map((chunk, i) => { const isWeb = 'web' in chunk; const url = isWeb ? chunk.web.uri : (chunk as any).maps.uri; const title = isWeb ? chunk.web.title : (chunk as any).maps.title; const fav = isWeb ? `https://www.google.com/s2/favicons?sz=64&domain_url=${getHostname(url)}` : null; return (<a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-[#292929] transition-all border border-transparent hover:border-gray-100 dark:hover:border-white/5 group"><div className="size-10 rounded-xl bg-gray-50 dark:bg-[#1f1f1f] flex items-center justify-center shrink-0 border border-gray-100 dark:border-[#27272a] transition-colors group-hover:bg-white dark:group-hover:bg-[#141414]">{fav ? <img src={fav} alt="" className="size-5 rounded-sm" /> : <MapPinIcon className="size-5 text-blue-500" />}</div><div className="flex-1 min-w-0"><p className="text-sm font-bold text-black dark:text-white truncate">{title}</p><p className="text-[10px] text-gray-400 dark:text-[#a1a1aa] truncate uppercase tracking-widest font-bold mt-0.5">{getDomainLabel(url)}</p></div></a>); })}</div>
                    </div>
                </div>
            )}
        </>
    );
};

// ==========================================
// 9. LARGE COMPONENTS (from Section 9)
// ==========================================

const downloadFile = (filename: string, mimetype: string, base64: string) => { const byteCharacters = atob(base64); const byteNumbers = new Array(byteCharacters.length); for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); } const byteArray = new Uint8Array(byteNumbers); const blob = new Blob([byteArray], { type: mimetype }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); };
const ActionButton: React.FC<{ onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean; }> = ({ onClick, title, children, disabled = false }) => (<button onClick={onClick} title={title} disabled={disabled} className="p-1.5 rounded-md text-muted-foreground hover:bg-token-surface-secondary hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent">{children}</button>);

export const CodeExecutor: React.FC<{ code: string; lang: string; title?: string; isExecutable: boolean; autorun?: boolean; initialCollapsed?: boolean; persistedResult?: ExecutionResult; onExecutionComplete: (result: ExecutionResult) => void; onFixRequest?: (error: string) => void; onStopExecution: () => void; isPythonReady: boolean; isLoading?: boolean; t: (key: string, params?: Record<string, string>) => string; }> = ({ code, lang, title, isExecutable, autorun, initialCollapsed = false, persistedResult, onExecutionComplete, onFixRequest, onStopExecution, isPythonReady, isLoading = false, t }) => {
    const plotlyRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
    const [output, setOutput] = useState<any>('');
    const [error, setError] = useState<string>('');
    const [downloadableFileState, setDownloadableFile] = useState<DownloadableFile | null>(null);
    const [highlightedCode, setHighlightedCode] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
    const [hasRunOnce, setHasRunOnce] = useState(!!persistedResult);
    const prevIsLoading = usePrevious(isLoading);

    const runPython = useCallback(async () => {
        setStatus('executing'); setHasRunOnce(true);
        let stdoutBuffer = ''; let stderrBuffer = ''; let finalResult: ExecutionResult | null = null; let currentRunDownloadableFile: DownloadableFile | null = null;
        runPythonCode(code, (update: PythonExecutorUpdate) => {
            switch (update.type) {
                case 'stdout': stdoutBuffer += update.data + '\n'; setOutput((prev:any) => (typeof prev === 'string' ? prev : '') + update.data + '\n'); break;
                case 'stderr': stderrBuffer += update.error + '\n'; setError(stderrBuffer.trim()); break;
                case 'plot': if (update.plotType === 'plotly') { setOutput(update.data); finalResult = { output: update.data, error: '', type: 'plotly-json' }; } else { setOutput(<img src={`data:image/png;base64,${update.data}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />); finalResult = { output: update.data, error: '', type: 'image-base64' }; } break;
                case 'download': const fileInfo = { filename: update.filename!, mimetype: update.mimetype!, data: update.data! }; setDownloadableFile(fileInfo); currentRunDownloadableFile = fileInfo; setIsCollapsed(true); break;
                case 'success': setStatus('success'); let resultToPersist: ExecutionResult; if (finalResult) { resultToPersist = { ...finalResult, error: stderrBuffer.trim() }; } else if (stdoutBuffer.trim()) { resultToPersist = { output: stdoutBuffer.trim(), error: stderrBuffer.trim(), type: 'string' }; } else if (currentRunDownloadableFile) { const msg = t('chat.fileSuccess', {filename: currentRunDownloadableFile.filename}); setOutput(msg); resultToPersist = { output: msg, error: stderrBuffer.trim(), type: 'string' }; } else { resultToPersist = { output: null, error: stderrBuffer.trim(), type: 'string' }; } if (currentRunDownloadableFile) { resultToPersist.downloadableFile = currentRunDownloadableFile; } onExecutionComplete(resultToPersist); break;
                case 'error': const errorMsg = update.error || stderrBuffer.trim(); setError(errorMsg); setStatus('error'); const errorResult: ExecutionResult = { output: null, error: errorMsg, type: 'error' }; if (currentRunDownloadableFile) { errorResult.downloadableFile = currentRunDownloadableFile; } onExecutionComplete(errorResult); break;
            }
        });
    }, [code, onExecutionComplete, t]);

    const handleRunCode = useCallback(async () => {
        setOutput(''); setError(''); setDownloadableFile(null);
        if (lang.toLowerCase() === 'python') await runPython(); 
        else { const errorMsg = "Language not supported for execution"; setError(errorMsg); setStatus('error'); onExecutionComplete({ output: null, error: errorMsg, type: 'error' }); }
    }, [lang, runPython, onExecutionComplete]);

    useEffect(() => {
        if (persistedResult) {
            const { output: savedOutput, error: savedError, type, downloadableFile: savedFile } = persistedResult;
            if (type === 'error') { setError(savedError); setStatus('error'); } else { if (savedError) setError(savedError); if (savedOutput !== null) { if (type === 'image-base64') setOutput(<img src={`data:image/png;base64,${savedOutput}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />); else if (type === 'plotly-json') setOutput(savedOutput); else setOutput(savedOutput); } setStatus('success'); }
            if (savedFile) { setDownloadableFile(savedFile); setIsCollapsed(true); }
            setHasRunOnce(true);
        }
    }, [persistedResult, lang]);

    useEffect(() => { if (autorun && hasRunOnce && !downloadableFileState) setIsCollapsed(false); }, [autorun, hasRunOnce, downloadableFileState]);
    useEffect(() => { if (autorun && isPythonReady && prevIsLoading && !isLoading && !persistedResult) handleRunCode(); }, [isLoading, prevIsLoading, autorun, isPythonReady, persistedResult, handleRunCode]);
    useEffect(() => { setHighlightedCode(code); }, [code]);
    useEffect(() => { if (isExecutable && hasRunOnce && lang === 'python' && plotlyRef.current && typeof output === 'string' && output.startsWith('{')) { try { const spec = JSON.parse(output); if (window.Plotly) window.Plotly.newPlot(plotlyRef.current, spec.data, spec.layout || {}, { responsive: true }); } catch (e) { console.error(e); setError("Chart error"); } } }, [output, lang, isExecutable, hasRunOnce]);

    const isPython = lang.toLowerCase() === 'python';
    const showCodeBlock = !downloadableFileState || status === 'error';
    const lineCount = code.trim().split('\n').length;

    return (
        <div className="not-prose my-4 font-sans max-w-full">
            {showCodeBlock && (
                <div className="bg-code-bg border border-default rounded-lg overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-background/30">
                        <div className="flex items-center gap-2"><span className="font-mono text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{title || lang}</span>{isCollapsed && lineCount > 1 && (<span className="text-[10px] text-muted-foreground ml-2 lowercase">{lineCount} lines hidden</span>)}{isPython && !isPythonReady && status !== 'executing' && (<span className="text-[10px] text-yellow-600 dark:text-yellow-500 opacity-80">Loading env...</span>)}</div>
                        <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                            <ActionButton onClick={() => setIsCollapsed(!isCollapsed)} title={isCollapsed ? 'Expand' : 'Collapse'}>{isCollapsed ? <ChevronsUpDownIcon className="size-3.5" /> : <ChevronsDownUpIcon className="size-3.5" />}</ActionButton>
                            {isExecutable ? (status === 'executing' ? (<ActionButton onClick={() => { stopPythonExecution(); onStopExecution(); setStatus('idle'); setError("Stopped"); }} title="Stop"><div className="w-2.5 h-2.5 bg-foreground rounded-sm animate-pulse"></div></ActionButton>) : (<ActionButton onClick={handleRunCode} title={hasRunOnce ? 'Run Again' : 'Run'} disabled={isPython && !isPythonReady}>{hasRunOnce ? <RefreshCwIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}</ActionButton>)) : null}
                            <ActionButton onClick={() => { navigator.clipboard.writeText(code); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }} title="Copy">{isCopied ? <CheckIcon className="size-3.5 text-green-500" /> : <CopyIcon className="size-3.5" />}</ActionButton>
                        </div>
                    </div>
                    <div className={`transition-all duration-300 ${isCollapsed ? 'max-h-0' : 'max-h-[500px]'} overflow-y-auto`}><div className="p-0 bg-code-bg"><pre className="!m-0 !p-3 overflow-x-auto code-block-area rounded-none bg-transparent"><code className={`language-${lang} !text-[13px] !leading-relaxed`}>{highlightedCode}</code></pre></div></div>
                </div>
            )}
            <div className="mt-2 space-y-2">
                {isExecutable && status === 'executing' && (<div className="flex items-center text-xs text-muted-foreground px-2 py-1"><span className="animate-spin mr-2">⟳</span><span>Executing...</span></div>)}
                {isExecutable && hasRunOnce && (status === 'success' || status === 'error') && (
                    <div className="flex flex-col gap-2">
                        {error && (<div className={`output-block ${status === 'error' ? 'error' : 'success'}`}><pre className={`text-sm whitespace-pre-wrap ${status === 'error' ? 'text-red-500' : ''}`}>{error}</pre>{status === 'error' && onFixRequest && <button onClick={() => onFixRequest(error)} className="p-1 text-muted-foreground hover:bg-background rounded-md"><Wand2Icon className="size-4" /></button>}</div>)}
                        {status !== 'error' && output && (typeof output !== 'string' ? <div>{output}</div> : (lang === 'python' && output.startsWith('{') ? <div ref={plotlyRef} className="w-full min-h-[450px] rounded-xl bg-white p-2 border border-default"></div> : <div className="text-sm output-block success"><pre>{output.trim()}</pre></div>))}
                        {downloadableFileState && <button onClick={() => downloadFile(downloadableFileState.filename, downloadableFileState.mimetype, downloadableFileState.data)} className="flex items-center gap-2 text-foreground/90 hover:text-foreground group"><DownloadIcon className="size-4" /><span className="font-medium border-b-2 border-dotted border-foreground/30 group-hover:border-foreground/80 transition-colors pb-0.5">Download {downloadableFileState.filename}</span></button>}
                    </div>
                )}
            </div>
        </div>
    );
};

export interface ChatInputHandle { focus: () => void; handleFiles: (files: FileList) => void; }
export const ChatInput = forwardRef<ChatInputHandle, { text: string; onTextChange: (text: string) => void; onSendMessage: (text: string, files: File[]) => void; isLoading: boolean; t: (key: string, params?: Record<string, string>) => string; onAbortGeneration: () => void; replyContextText: string | null; onClearReplyContext: () => void; language: string; }>(({ text, onTextChange, onSendMessage, isLoading, t, onAbortGeneration, replyContextText, onClearReplyContext }, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null); const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]); const [previews, setPreviews] = useState<string[]>([]);
  const handleFiles = (files: FileList) => { const newFiles = Array.from(files); setAttachedFiles(prev => [...prev, ...newFiles]); newFiles.forEach(file => { if (file.type.startsWith('image/')) { const reader = new FileReader(); reader.onload = (e) => setPreviews(prev => [...prev, e.target?.result as string]); reader.readAsDataURL(file); } else { setPreviews(prev => [...prev, 'file']); } }); };
  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus(), handleFiles: (files: FileList) => handleFiles(files) }));
  useEffect(() => { if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`; } }, [text]);
  const handleSend = () => { if ((text.trim() || attachedFiles.length > 0) && !isLoading) { onSendMessage(text, attachedFiles); onTextChange(''); setAttachedFiles([]); setPreviews([]); if (textareaRef.current) textareaRef.current.style.height = 'auto'; if (fileInputRef.current) fileInputRef.current.value = ''; } };
  const hasContent = text.trim().length > 0 || attachedFiles.length > 0;
  return (
    <div className="w-full flex flex-col gap-2">
      {(replyContextText || previews.length > 0) && (<div className="flex flex-col gap-2 px-2 mb-1">{replyContextText && (<div className="flex items-center gap-2 bg-surface-l1 dark:bg-[#111] border border-border p-2 rounded-xl text-xs text-muted-foreground animate-fade-in-up shadow-sm"><ReplyIcon className="size-3 shrink-0" /><span className="truncate flex-1">{replyContextText}</span><button onClick={onClearReplyContext} className="p-1 hover:bg-surface-l2 rounded-full"><XIcon className="size-3" /></button></div>)}{previews.length > 0 && (<div className="flex flex-wrap gap-2 animate-fade-in-up">{previews.map((src, i) => (<div key={i} className="relative group size-16 rounded-xl border border-border overflow-hidden bg-surface-l1 shadow-sm">{src === 'file' ? (<div className="w-full h-full flex items-center justify-center text-[10px] p-1 text-center truncate bg-surface-l2 text-foreground font-medium">{attachedFiles[i]?.name}</div>) : (<img src={src} className="w-full h-full object-cover" alt="" />)}<button onClick={() => { setAttachedFiles(prev => prev.filter((_, idx) => idx !== i)); setPreviews(prev => prev.filter((_, idx) => idx !== i)); }} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 shadow-md transition-transform active:scale-90"><XIcon className="size-3" /></button></div>))}</div>)}</div>)}
      <div className="bg-white dark:bg-[#1f1f1f] rounded-[1.75rem] border border-gray-200 dark:border-[#27272a] flex items-end gap-2 p-2 relative shadow-lg">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center size-10 rounded-full cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0 mb-0.5"><input type="file" ref={fileInputRef} onChange={(e) => e.target.files && handleFiles(e.target.files)} className="hidden" multiple /><PaperclipIcon className="size-5 text-muted-foreground" /></button>
        <textarea ref={textareaRef} value={text} onChange={(e) => onTextChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder="Ask KIPP anything..." className="flex-1 bg-transparent outline-none text-foreground placeholder-muted-foreground text-[16px] py-2.5 px-1 resize-none max-h-[200px]" rows={1} />
        <div className="flex items-center justify-center size-10 flex-shrink-0 mb-0.5">{isLoading ? (<button onClick={onAbortGeneration} className="size-8 flex items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"><div className="size-3 bg-current rounded-sm"></div></button>) : (<button onClick={handleSend} disabled={!hasContent} className={`flex items-center justify-center size-8 rounded-full transition-all ${hasContent ? 'bg-foreground text-background scale-110' : 'bg-transparent text-muted-foreground opacity-30 cursor-default'}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-[2.5]"><path d="m5 12 7-7 7 7" stroke="currentColor"></path><path d="M12 19V5" stroke="currentColor"></path></svg></button>)}</div>
      </div>
    </div>
  );
});
ChatInput.displayName = 'ChatInput';

export const GallerySearchLoader: React.FC<{ query: string, onOpenLightbox: (images: any[], index: number) => void }> = ({ query, onOpenLightbox }) => {
    const [images, setImages] = useState<any[]>([]); const [loading, setLoading] = useState(true);
    useEffect(() => { const fetchImages = async () => { try { setLoading(true); const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imageSearchQuery: query }) }); const data = await res.json(); if (data.images && Array.isArray(data.images)) { setImages(data.images.map((url: string) => ({ url, alt: query }))); } } catch (e) {} finally { setLoading(false); } }; if (query) fetchImages(); }, [query]);
    if (loading) return (<div className="grid grid-cols-3 gap-1.5 my-2 max-w-xl">{[1,2,3].map(i => <div key={i} className="aspect-square bg-surface-l2 animate-pulse rounded-lg" />)}</div>);
    if (images.length === 0) return null;
    return <ImageGallery images={images} onImageClick={(i) => onOpenLightbox(images, i)} />;
}

export const SearchStatus: React.FC<{ sources?: GroundingChunk[], resultCount?: number }> = ({ sources, resultCount }) => {
    const [step, setStep] = useState(0); useEffect(() => { if (sources && sources.length > 0) setStep(1); }, [sources]);
    return (<div className="flex flex-col gap-1 cursor-crosshair text-sm mb-4 animate-fade-in-up"><div className="flex flex-row items-center gap-2 cursor-pointer hover:opacity-80"><div className="flex flex-row items-center gap-2 text-foreground"><SearchIcon className={`size-4 ${step === 0 ? 'animate-pulse text-accent-blue' : 'text-muted-foreground'}`} /><div className={step === 0 ? 'font-medium' : 'text-muted-foreground'}>Searching the web</div></div>{step === 1 && (<div className="text-muted-foreground text-xs font-mono ml-1">{resultCount && resultCount > 0 ? <>{resultCount} results</> : `${sources?.length || 0} sources`}</div>)}</div>{step === 1 && sources && sources.length > 0 && (<div className="flex flex-row items-center gap-2 cursor-pointer hover:opacity-80 animate-fade-in-up"><div className="flex flex-row items-center gap-2 text-foreground"><div className="size-4 rounded-full bg-accent-blue/10 flex items-center justify-center"><div className="size-2 bg-accent-blue rounded-full animate-pulse"></div></div><div className="font-medium">Browsing</div></div><div className="text-muted-foreground text-xs truncate max-w-[200px]">{'web' in sources[0] ? sources[0].web.uri : (sources[0] as any).maps.uri}</div></div>)}</div>);
};

export const ChatMessage: React.FC<{ message: Message; onRegenerate: (messageId: string) => void; onFork: (messageId: string) => void; isLoading: boolean; aiStatus: AIStatus; executionResults: Record<string, ExecutionResult>; onStoreExecutionResult: (messageId: string, partIndex: number, result: ExecutionResult) => void; onFixRequest: (code: string, lang: string, error: string) => void; onStopExecution: () => void; isPythonReady: boolean; t: (key: string) => string; onOpenLightbox: (images: any[], startIndex: number) => void; isLast: boolean; onSendSuggestion: (text: string) => void; }> = ({ message, onRegenerate, onFork, isLoading, aiStatus, executionResults, onStoreExecutionResult, onFixRequest, onStopExecution, isPythonReady, t, onOpenLightbox, isLast, onSendSuggestion }) => {
    const isUser = message.type === MessageType.USER; const isError = message.type === MessageType.ERROR; const [isThinkingOpen, setIsThinkingOpen] = useState(false); const [isCopied, setIsCopied] = useState(false);
    useEffect(() => { if (aiStatus === 'thinking' && isLast) setIsThinkingOpen(true); }, [aiStatus, isLast]);
    const messageText = useMemo(() => typeof message.content === 'string' ? message.content : '', [message.content]);
    const { parsedThinkingText, parsedResponseText, hasThinkingTag, suggestions } = useMemo(() => {
        if (isUser) return { parsedThinkingText: null, parsedResponseText: messageText, hasThinkingTag: false, suggestions: [] };
        let text = messageText || ''; let extractedSuggestions: string[] = [];
        const suggestionsMatch = text.match(/<suggestions>(.*?)<\/suggestions>/s); if (suggestionsMatch) { try { extractedSuggestions = JSON.parse(suggestionsMatch[1]); } catch (e) {} text = text.replace(/<suggestions>.*?<\/suggestions>/s, '').trim(); }
        const thinkingMatch = text.match(/<thinking>([\s\S]*?)(?:<\/thinking>|$)/); let thinking = null; let response = text; let hasTag = false;
        if (text.includes('<thinking>')) { hasTag = true; if (thinkingMatch) { thinking = thinkingMatch[1].trim(); if (text.includes('</thinking>')) { response = text.split('</thinking>')[1]?.trim() || ''; } else { response = ''; } } }
        return { parsedThinkingText: thinking, parsedResponseText: response, hasThinkingTag: hasTag, suggestions: extractedSuggestions };
    }, [messageText, isUser]);

    const textToHtml = (text: string): string => {
        if (!text) return '';
        const placeholders: { [key:string]: string } = {}; let placeholderId = 0; const mathRegex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\(.+?\\\)|(\$[^\$\n\r]+?\$))/g;
        const textWithPlaceholders = text.replace(mathRegex, (match) => { const id = `__KIPP_PLACEHOLDER_${placeholderId++}__`; placeholders[id] = match; return id; });
        let html = marked.parse(textWithPlaceholders, { breaks: true, gfm: true }) as string;
        for (const id in placeholders) { html = html.replace(id, placeholders[id]); }
        return html;
    };

    const renderableContent = useMemo(() => {
        const textToRender = parsedResponseText; if (!textToRender) return [];
        const blockRegex = /(```[\w\s\S]*?```|!gallery\[".*?"\])/g; let finalParts: any[] = []; let partIndex = 0;
        textToRender.split(blockRegex).filter(Boolean).forEach(part => {
            if (part.startsWith('```')) { const codeMatch = /```([\w-]+)?(?:[^\n]*)?\n([\s\S]*?)```/.exec(part); if (codeMatch) { const lang = codeMatch[1] || 'plaintext'; const code = codeMatch[2]; if (lang === 'json-gallery') { try { const galleryData = JSON.parse(code); if (galleryData.type === 'image_gallery' && Array.isArray(galleryData.images)) { finalParts.push({ type: 'gallery', images: galleryData.images }); } } catch (e) {} } else { finalParts.push({ type: 'code', lang, code, info: part.split('\n')[0].substring(3).trim(), partIndex: partIndex++ }); } } } 
            else if (part.startsWith('!gallery')) { const match = /!gallery\["(.*?)"\]/.exec(part); if (match && match[1]) finalParts.push({ type: 'gallery-search', query: match[1] }); } 
            else { finalParts.push({ type: 'text', content: part }); }
        });
        return finalParts;
    }, [parsedResponseText]);

    const handleCopy = () => { navigator.clipboard.writeText(parsedResponseText).then(() => { setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }); };
    if (isUser) {
        return (
            <div className="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-4 items-end">
                <div className="message-bubble relative rounded-3xl text-foreground min-h-7 prose dark:prose-invert break-words bg-surface-l1 border border-border max-w-[100%] @sm/mainview:max-w-[90%] px-4 py-2 rounded-br-lg shadow-sm"><div className="whitespace-pre-wrap leading-relaxed text-[16px]">{messageText}</div></div>
                {message.files && message.files.length > 0 && (<div className="flex flex-wrap justify-end gap-2 mt-2">{message.files.map((file, i) => (<div key={i} className="relative group rounded-xl overflow-hidden border border-border">{file.type.startsWith('image/') ? <img src={file.dataUrl} alt={file.name} className="h-20 w-auto object-cover" /> : <div className="h-20 w-20 bg-surface-l2 flex items-center justify-center text-xs text-muted-foreground p-2 text-center break-all">{file.name}</div>}</div>))}</div>)}
                <div className="flex items-center gap-2 mt-1 px-1"><button className="p-1 hover:bg-surface-l2 rounded-full text-muted-foreground hover:text-foreground transition-colors" title={t('chat.message.copy')} onClick={handleCopy}>{isCopied ? <CheckIcon className="size-3.5 text-green-500" /> : <MessageCopyIcon className="size-3.5" />}</button></div>
            </div>
        );
    }
    if (isError) { return (<div className="flex flex-col w-full mb-8 max-w-full"><div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-500 text-sm">{messageText || "An unknown error occurred."}</div><div className="flex items-center space-x-0 mt-2 text-muted-foreground"><button className="p-1 hover:bg-surface-l2 rounded-full" onClick={() => onRegenerate(message.id)} title={t('chat.message.regenerate')}><MessageRefreshIcon className="size-4" /></button></div></div>); }
    const uiToolCalls = (message.toolCalls || []).filter(tc => tc.name !== 'google_search'); const hasToolCalls = uiToolCalls.length > 0; const hasText = !!parsedResponseText; const hasContent = hasText || hasToolCalls; const isActuallyLastLoading = isLast && isLoading; const showSearchUI = (aiStatus === 'searching' && isActuallyLastLoading) || (message.groundingChunks && message.groundingChunks.length > 0 && isActuallyLastLoading && !hasContent);

    return (
        <div className="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-4 items-start">
             {hasThinkingTag && parsedThinkingText && (<div className="mb-2"><div onClick={() => setIsThinkingOpen(!isThinkingOpen)} className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-foreground transition-colors w-fit p-1 rounded-lg"><BrainIcon className={`size-4 ${isActuallyLastLoading && aiStatus === 'thinking' ? 'animate-pulse text-accent-blue' : ''}`} /><span className="text-sm font-medium">{t('chat.message.thinking')}</span><ChevronDownIcon className={`size-4 transition-transform ${isThinkingOpen ? 'rotate-180' : ''}`} /></div>{isThinkingOpen && <div className="mt-2 pl-3 border-l-2 border-border text-muted-foreground text-sm italic whitespace-pre-wrap animate-fade-in-up">{parsedThinkingText}</div>}</div>)}
            {showSearchUI && <SearchStatus sources={message.groundingChunks} resultCount={message.searchResultCount} />}
            <div className={`message-bubble relative rounded-3xl text-foreground prose dark:prose-invert break-words w-full max-w-none px-4 py-2 ${!hasContent ? 'min-h-0 py-0' : 'min-h-7'}`}>
                 {!hasContent && isActuallyLastLoading && !parsedThinkingText && !showSearchUI && (<div className="flex items-center gap-2 text-muted-foreground min-h-[28px]"><GeneratingLoader /></div>)}
                {hasToolCalls && <div className="w-full mb-4 space-y-4">{uiToolCalls.map((toolCall, idx) => <GenerativeUI key={idx} toolName={toolCall.name} args={toolCall.args} />)}</div>}
                {renderableContent.map((part: any, index: number) => {
                    if (part.type === 'code') { const resultKey = `${message.id}_${part.partIndex}`; const result = executionResults[resultKey]; const isPython = part.lang === 'python'; return <div key={index} className="w-full my-4 not-prose"><CodeExecutor code={part.code} lang={part.lang} title={part.lang.toUpperCase()} isExecutable={['python', 'html'].includes(part.lang.toLowerCase())} autorun={isPython && !result} onExecutionComplete={(res) => onStoreExecutionResult(message.id, part.partIndex, res)} onFixRequest={(err) => onFixRequest(part.code, part.lang, err)} persistedResult={result} onStopExecution={onStopExecution} isPythonReady={isPythonReady} isLoading={isLoading} t={t} /></div>; }
                    if (part.type === 'gallery-search') return <GallerySearchLoader key={index} query={part.query} onOpenLightbox={onOpenLightbox} />;
                    if (part.type === 'gallery') return <div key={index} className="my-4"><ImageGallery images={part.images.map((img: string) => ({ url: img, alt: 'Generated Image' }))} onImageClick={(i) => onOpenLightbox(part.images.map((img: string) => ({ url: img, alt: 'Generated Image' })), i)} /></div>;
                    return <div key={index} className="prose dark:prose-invert max-w-none w-full" dangerouslySetInnerHTML={{ __html: textToHtml(part.content) }} />;
                })}
            </div>
            {message.groundingChunks && message.groundingChunks.length > 0 && !isLoading && <div className="mt-2 flex flex-wrap gap-2"><GroundingSources chunks={message.groundingChunks} t={t} /></div>}
            {!isLoading && (
                <div className="flex items-center gap-2 mt-2 w-full justify-start px-2">
                    <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.regenerate')} onClick={() => onRegenerate(message.id)}><MessageRefreshIcon className="size-4" /></button>
                    <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.copy')} onClick={handleCopy}>{isCopied ? <CheckIcon className="size-4 text-green-500" /> : <MessageCopyIcon className="size-4" />}</button>
                    <button className="p-1.5 hover:bg-surface-l2 rounded-full text-muted-foreground hover:text-foreground" title={t('chat.message.fork')} onClick={() => onFork(message.id)}><GitForkIcon className="size-4" /></button>
                    {message.generationDuration && <span className="ml-2 text-muted-foreground text-xs select-none font-mono">{(message.generationDuration / 1000).toFixed(1)}s</span>}
                </div>
            )}
            {isLast && suggestions.length > 0 && !isLoading && (<div className="mt-4 flex flex-col items-start gap-2 animate-fade-in-up w-full">{suggestions.map((suggestion, idx) => (<button key={idx} onClick={() => onSendSuggestion(suggestion)} className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 h-9 rounded-xl px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-l2 border border-transparent hover:border-border"><CornerDownRightIcon className="size-3.5 text-muted-foreground" /><span className="truncate max-w-[300px]">{suggestion}</span></button>))}</div>)}
        </div>
    );
};
