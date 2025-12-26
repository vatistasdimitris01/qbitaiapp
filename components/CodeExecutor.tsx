
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExecutionResult } from '../types';
import { PythonExecutorUpdate, runPythonCode, stopPythonExecution } from '../services/pythonExecutorService';
import { 
    ChevronsUpDownIcon, 
    ChevronsDownUpIcon, 
    RefreshCwIcon, 
    PlayIcon, 
    CheckIcon, 
    CopyIcon, 
    DownloadIcon, 
    Wand2Icon
} from './icons';

/**
 * Custom hook to track previous value of a state or prop.
 */
const usePrevious = <T,>(value: T): T | undefined => {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => { ref.current = value; });
  return ref.current;
};

/**
 * Helper to trigger browser download for base64 encoded file data.
 */
const downloadFile = (filename: string, mimetype: string, base64: string) => { 
    const byteCharacters = atob(base64); 
    const byteNumbers = new Array(byteCharacters.length); 
    for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); } 
    const byteArray = new Uint8Array(byteNumbers); 
    const blob = new Blob([byteArray], { type: mimetype }); 
    const url = URL.createObjectURL(blob); 
    const a = document.createElement('a'); a.href = url; a.download = filename; 
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); 
};

/**
 * Shared action button for code block toolbar.
 */
const ActionButton: React.FC<{ onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean; }> = ({ onClick, title, children, disabled = false }) => (
    <button onClick={onClick} title={title} disabled={disabled} className="p-1.5 rounded-md text-muted-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent">
        {children}
    </button>
);

/**
 * CodeExecutor component: Manages the execution of code blocks (primarily Python) 
 * within the chat interface, handling output visualization and file downloads.
 */
const CodeExecutor: React.FC<{ 
    code: string; 
    lang: string; 
    title?: string; 
    isExecutable: boolean; 
    autorun?: boolean; 
    initialCollapsed?: boolean; 
    persistedResult?: ExecutionResult; 
    onExecutionComplete: (result: ExecutionResult) => void; 
    onFixRequest?: (error: string) => void; 
    onStopExecution: () => void; 
    isPythonReady: boolean; 
    isLoading?: boolean; 
    t: (key: string, params?: Record<string, string>) => string; 
}> = ({ code, lang, title, isExecutable, autorun, initialCollapsed = false, persistedResult, onExecutionComplete, onFixRequest, onStopExecution, isPythonReady, isLoading = false, t }) => {
    const plotlyRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<'idle' | 'executing' | 'success' | 'error'>('idle');
    const [output, setOutput] = useState<any>('');
    const [error, setError] = useState<string>('');
    const [downloadableFile, setDownloadableFile] = useState<{ filename: string; mimetype: string; data: string } | null>(null);
    const [highlightedCode, setHighlightedCode] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
    const [hasRunOnce, setHasRunOnce] = useState(!!persistedResult);
    const prevIsLoading = usePrevious(isLoading);

    const runPython = useCallback(async () => {
        setStatus('executing'); setHasRunOnce(true);
        let stdoutBuffer = ''; let stderrBuffer = ''; let finalResult: ExecutionResult | null = null; let currentRunDownloadableFile: any = null;
        runPythonCode(code, (update: PythonExecutorUpdate) => {
            switch (update.type) {
                case 'stdout': 
                    stdoutBuffer += update.data + '\n'; 
                    setOutput((prev: any) => (typeof prev === 'string' ? prev : '') + update.data + '\n'); 
                    break;
                case 'stderr': 
                    stderrBuffer += update.error + '\n'; 
                    setError(stderrBuffer.trim()); 
                    break;
                case 'plot': 
                    if (update.plotType === 'plotly') { 
                        setOutput(update.data); 
                        finalResult = { output: update.data, error: '', type: 'plotly-json' }; 
                    } else { 
                        setOutput(<img src={`data:image/png;base64,${update.data}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg shadow-sm border border-border" />); 
                        finalResult = { output: update.data, error: '', type: 'image-base64' }; 
                    } 
                    break;
                case 'download': 
                    const fileInfo = { filename: update.filename!, mimetype: update.mimetype!, data: update.data! }; 
                    setDownloadableFile(fileInfo); 
                    currentRunDownloadableFile = fileInfo; 
                    setIsCollapsed(true); 
                    break;
                case 'success': 
                    setStatus('success'); 
                    let resultToPersist: ExecutionResult; 
                    if (finalResult) { 
                        resultToPersist = { ...finalResult, error: stderrBuffer.trim() }; 
                    } else if (stdoutBuffer.trim()) { 
                        resultToPersist = { output: stdoutBuffer.trim(), error: stderrBuffer.trim(), type: 'string' }; 
                    } else if (currentRunDownloadableFile) { 
                        const msg = `Successfully generated ${currentRunDownloadableFile.filename}`; 
                        setOutput(msg); 
                        resultToPersist = { output: msg, error: stderrBuffer.trim(), type: 'string' }; 
                    } else { 
                        resultToPersist = { output: null, error: stderrBuffer.trim(), type: 'string' }; 
                    } 
                    if (currentRunDownloadableFile) { resultToPersist.downloadableFile = currentRunDownloadableFile; } 
                    onExecutionComplete(resultToPersist); 
                    break;
                case 'error': 
                    const errorMsg = update.error || stderrBuffer.trim(); 
                    setError(errorMsg); 
                    setStatus('error'); 
                    const errorResult: ExecutionResult = { output: null, error: errorMsg, type: 'error' }; 
                    if (currentRunDownloadableFile) { errorResult.downloadableFile = currentRunDownloadableFile; } 
                    onExecutionComplete(errorResult); 
                    break;
            }
        });
    }, [code, onExecutionComplete]);

    const handleRunCode = useCallback(async () => {
        setOutput(''); setError(''); setDownloadableFile(null);
        if (lang.toLowerCase() === 'python') await runPython(); 
        else { const errorMsg = "Language not supported for execution"; setError(errorMsg); setStatus('error'); onExecutionComplete({ output: null, error: errorMsg, type: 'error' }); }
    }, [lang, runPython, onExecutionComplete]);

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

    useEffect(() => { if (autorun && hasRunOnce && !downloadableFile) setIsCollapsed(false); }, [autorun, hasRunOnce, downloadableFile]);
    useEffect(() => { if (autorun && isPythonReady && prevIsLoading && !isLoading && !persistedResult) handleRunCode(); }, [isLoading, prevIsLoading, autorun, isPythonReady, persistedResult, handleRunCode]);
    useEffect(() => { setHighlightedCode(code); }, [code]);
    
    useEffect(() => { 
        if (isExecutable && hasRunOnce && lang === 'python' && plotlyRef.current && typeof output === 'string' && output.startsWith('{')) { 
            try { 
                const spec = JSON.parse(output); 
                if ((window as any).Plotly) (window as any).Plotly.newPlot(plotlyRef.current, spec.data, spec.layout || {}, { responsive: true }); 
            } catch (e) { 
                console.error(e); 
                setError("Chart error"); 
            } 
        } 
    }, [output, lang, isExecutable, hasRunOnce]);

    const isPython = lang.toLowerCase() === 'python';
    const showCodeBlock = !downloadableFile || status === 'error';
    const lineCount = code.trim().split('\n').length;

    return (
        <div className="not-prose my-4 font-sans max-w-full">
            {showCodeBlock && (
                <div className="bg-gray-100 dark:bg-[#1e1e1e] border border-border rounded-lg overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-background/30">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{title || lang}</span>
                            {isCollapsed && lineCount > 1 && (<span className="text-[10px] text-muted-foreground ml-2 lowercase">{lineCount} lines hidden</span>)}
                            {isPython && !isPythonReady && status !== 'executing' && (<span className="text-[10px] text-yellow-600 dark:text-yellow-500 opacity-80">Loading env...</span>)}
                        </div>
                        <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                            <ActionButton onClick={() => setIsCollapsed(!isCollapsed)} title={isCollapsed ? 'Expand' : 'Collapse'}>
                                {isCollapsed ? <ChevronsUpDownIcon className="size-3.5" /> : <ChevronsDownUpIcon className="size-3.5" />}
                            </ActionButton>
                            {isExecutable ? (
                                status === 'executing' ? (
                                    <ActionButton onClick={() => { stopPythonExecution(); onStopExecution(); setStatus('idle'); setError("Stopped"); }} title="Stop">
                                        <div className="w-2.5 h-2.5 bg-foreground rounded-sm animate-pulse"></div>
                                    </ActionButton>
                                ) : (
                                    <ActionButton onClick={handleRunCode} title={hasRunOnce ? 'Run Again' : 'Run'} disabled={isPython && !isPythonReady}>
                                        {hasRunOnce ? <RefreshCwIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
                                    </ActionButton>
                                )
                            ) : null}
                            <ActionButton onClick={() => { navigator.clipboard.writeText(code); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); }} title="Copy">
                                {isCopied ? <CheckIcon className="size-3.5 text-green-500" /> : <CopyIcon className="size-3.5" />}
                            </ActionButton>
                        </div>
                    </div>
                    <div className={`transition-all duration-300 ${isCollapsed ? 'max-h-0' : 'max-h-[500px]'} overflow-y-auto`}>
                        <div className="p-0 bg-gray-100 dark:bg-[#1e1e1e]">
                            <pre className="!m-0 !p-3 overflow-x-auto rounded-none bg-transparent">
                                <code className={`language-${lang} !text-[13px] !leading-relaxed text-foreground dark:text-white`}>{highlightedCode}</code>
                            </pre>
                        </div>
                    </div>
                </div>
            )}
            <div className="mt-2 space-y-2">
                {isExecutable && status === 'executing' && (<div className="flex items-center text-xs text-muted-foreground px-2 py-1"><span className="animate-spin mr-2">⟳</span><span>Executing...</span></div>)}
                {isExecutable && hasRunOnce && (status === 'success' || status === 'error') && (
                    <div className="flex flex-col gap-2">
                        {error && (
                            <div className={`p-3 rounded-lg border ${status === 'error' ? 'bg-red-500/10 border-red-500/20' : 'bg-gray-100 dark:bg-zinc-800 border-border'}`}>
                                <pre className={`text-sm whitespace-pre-wrap ${status === 'error' ? 'text-red-500' : 'text-foreground'}`}>{error}</pre>
                                {status === 'error' && onFixRequest && <button onClick={() => onFixRequest(error)} className="mt-2 p-1 text-muted-foreground hover:bg-background rounded-md flex items-center gap-1 text-xs"><Wand2Icon className="size-3" /> Fix with AI</button>}
                            </div>
                        )}
                        {status !== 'error' && output && (
                            typeof output !== 'string' ? <div className="animate-fade-in-up">{output}</div> : (
                                lang === 'python' && output.startsWith('{') ? 
                                <div ref={plotlyRef} className="w-full min-h-[450px] rounded-xl bg-white p-2 border border-border shadow-sm"></div> : 
                                <div className="text-sm p-3 rounded-lg bg-gray-100 dark:bg-zinc-800 border border-border"><pre className="whitespace-pre-wrap font-mono">{output.trim()}</pre></div>
                            )
                        )}
                        {downloadableFile && (
                            <button onClick={() => downloadFile(downloadableFile.filename, downloadableFile.mimetype, downloadableFile.data)} className="flex items-center gap-2 text-foreground/90 hover:text-foreground group text-sm w-fit transition-all active:scale-95">
                                <DownloadIcon className="size-4" />
                                <span className="font-medium border-b-2 border-dotted border-foreground/30 group-hover:border-foreground/80 transition-colors pb-0.5">Download {downloadableFile.filename}</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default CodeExecutor;
