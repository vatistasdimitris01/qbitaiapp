
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CheckIcon, CopyIcon, DownloadIcon, PlayIcon, RefreshCwIcon, ChevronsUpDownIcon, ChevronsDownUpIcon, EyeIcon, Wand2Icon, XIcon, FileTextIcon } from './icons';
import { runPythonCode, stopPythonExecution, PythonExecutorUpdate } from '../services/pythonExecutorService';


declare global {
    interface Window {
        Plotly: any;
    }
}

const LoadingSpinner = () => (
    <svg className="animate-spin h-4 w-4 mr-2 text-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const downloadFile = (filename: string, mimetype: string, base64: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimetype });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

type DownloadableFile = { filename: string; mimetype: string; data: string };

type ExecutionResult = {
  output: string | null;
  error: string;
  type: 'string' | 'image-base64' | 'plotly-json' | 'error';
  downloadableFile?: DownloadableFile;
};

interface CodeExecutorProps {
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
}

type ExecutionStatus = 'idle' | 'executing' | 'success' | 'error';
type OutputContent = string | React.ReactNode;

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

const normalizeLanguage = (lang: string) => {
    if (!lang) return 'plaintext';
    const lower = lang.toLowerCase().trim();
    // Map common aliases to languages highlight.js likely supports in the standard pack
    if (['react', 'jsx', 'js', 'node', 'nodejs'].includes(lower)) return 'javascript';
    if (['ts', 'tsx', 'typescript'].includes(lower)) return 'typescript';
    if (['py', 'python3'].includes(lower)) return 'python';
    if (['sh', 'bash', 'zsh', 'shell'].includes(lower)) return 'bash';
    if (['vue', 'html', 'xml', 'svg'].includes(lower)) return 'xml';
    if (['c++', 'cpp', 'cplusplus'].includes(lower)) return 'cpp';
    return lower;
};

const ActionButton: React.FC<{ onClick: () => void; title: string; children: React.ReactNode; disabled?: boolean; }> = ({ onClick, title, children, disabled = false }) => (
    <button
        onClick={onClick}
        title={title}
        aria-label={title}
        disabled={disabled}
        className="p-1.5 rounded-md text-muted-foreground hover:bg-token-surface-secondary hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
        {children}
    </button>
);


export const CodeExecutor: React.FC<CodeExecutorProps> = ({ code, lang, title, isExecutable, autorun, initialCollapsed = false, persistedResult, onExecutionComplete, onFixRequest, onStopExecution, isPythonReady, isLoading = false, t }) => {
    const plotlyRef = useRef<HTMLDivElement>(null);
    
    const [status, setStatus] = useState<ExecutionStatus>('idle');
    const [output, setOutput] = useState<OutputContent>('');
    const [error, setError] = useState<string>('');
    const [downloadableFile, setDownloadableFile] = useState<DownloadableFile | null>(null);
    const [htmlBlobUrl, setHtmlBlobUrl] = useState<string | null>(null);
    const [highlightedCode, setHighlightedCode] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    
    const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
    const [hasRunOnce, setHasRunOnce] = useState(!!persistedResult);
    const prevIsLoading = usePrevious(isLoading);

    const runPython = useCallback(async () => {
        setStatus('executing');
        setHasRunOnce(true);
    
        let stdoutBuffer = '';
        let stderrBuffer = '';
        let finalResult: ExecutionResult | null = null;
        let currentRunDownloadableFile: DownloadableFile | null = null;
    
        runPythonCode(code, (update: PythonExecutorUpdate) => {
            switch (update.type) {
                case 'stdout':
                    stdoutBuffer += update.data + '\n';
                    setOutput(prev => (typeof prev === 'string' ? prev : '') + update.data + '\n');
                    break;
                case 'stderr':
                    stderrBuffer += update.error + '\n';
                    setError(stderrBuffer.trim());
                    break;
                case 'plot':
                    if (update.plotType === 'plotly') {
                        setOutput(update.data);
                        finalResult = { output: update.data, error: '', type: 'plotly-json' };
                    } else { // matplotlib or pil
                        setOutput(<img src={`data:image/png;base64,${update.data}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />);
                        finalResult = { output: update.data, error: '', type: 'image-base64' };
                    }
                    break;
                case 'download':
                    const fileInfo = { filename: update.filename!, mimetype: update.mimetype!, data: update.data! };
                    // Do not auto download. Let user click.
                    setDownloadableFile(fileInfo);
                    currentRunDownloadableFile = fileInfo;
                    setIsCollapsed(true); // Auto-collapse code on file generation
                    break;
                case 'success':
                    setStatus('success');
                    let resultToPersist: ExecutionResult;
                    if (finalResult) {
                        resultToPersist = { ...finalResult, error: stderrBuffer.trim() }; // Pass along any warnings
                    } else if (stdoutBuffer.trim()) {
                        resultToPersist = { output: stdoutBuffer.trim(), error: stderrBuffer.trim(), type: 'string' };
                    } else if (currentRunDownloadableFile) {
                        const msg = t('code.fileSuccess', {filename: currentRunDownloadableFile.filename});
                        setOutput(msg);
                        resultToPersist = { output: msg, error: stderrBuffer.trim(), type: 'string' };
                    } else {
                        resultToPersist = { output: null, error: stderrBuffer.trim(), type: 'string' };
                    }
                    
                    if (currentRunDownloadableFile) {
                        resultToPersist.downloadableFile = currentRunDownloadableFile;
                    }
                    onExecutionComplete(resultToPersist);
                    break;
                case 'error':
                    const errorMsg = update.error || stderrBuffer.trim();
                    setError(errorMsg);
                    setStatus('error');
                    const errorResult: ExecutionResult = { output: null, error: errorMsg, type: 'error' };
                    if (currentRunDownloadableFile) {
                        errorResult.downloadableFile = currentRunDownloadableFile;
                    }
                    onExecutionComplete(errorResult);
                    break;
            }
        });
    }, [code, onExecutionComplete, t]);

    const runHtml = useCallback(() => {
        setStatus('executing');
        setHasRunOnce(true);
        try {
            const blob = new Blob([code], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            setHtmlBlobUrl(url);

            const newWindow = window.open(url, '_blank');
            const message = newWindow
                ? t('code.previewNewTab')
                : t('code.previewBlocked');

            setOutput(message);
            setStatus('success');
            onExecutionComplete({ output: message, error: '', type: 'string' });
            
        } catch (err: any) {
            const errorMsg = 'Execution failed: ' + (err.message || String(err));
            setError(errorMsg);
            setStatus('error');
            onExecutionComplete({ output: null, error: errorMsg, type: 'error' });
        }
    }, [code, onExecutionComplete, t]);

    const handleRunCode = useCallback(async () => {
        setOutput('');
        setError('');
        setDownloadableFile(null);
        setHtmlBlobUrl(oldUrl => {
            if (oldUrl) URL.revokeObjectURL(oldUrl);
            return null;
        });
        
        switch (lang.toLowerCase()) {
            case 'python': await runPython(); break;
            case 'html': runHtml(); break;
            default:
                const errorMsg = t('code.langNotSupported', { lang });
                setError(errorMsg);
                setStatus('error');
                onExecutionComplete({ output: null, error: errorMsg, type: 'error' });
        }
    }, [lang, runPython, runHtml, onExecutionComplete, t]);

    const handleClear = useCallback(() => {
        setOutput('');
        setError('');
        setStatus('idle');
        setDownloadableFile(null);
        setHasRunOnce(false);
        if (htmlBlobUrl) {
            URL.revokeObjectURL(htmlBlobUrl);
            setHtmlBlobUrl(null);
        }
        onExecutionComplete({ output: null, error: '', type: 'string' });
    }, [htmlBlobUrl, onExecutionComplete]);
    
    useEffect(() => {
        if (persistedResult) {
            const { output: savedOutput, error: savedError, type, downloadableFile: savedFile } = persistedResult;
            
            if (type === 'error') {
                setError(savedError);
                setStatus('error');
            } else {
                if (savedError) { // This is now treated as warnings
                    setError(savedError);
                }
                if (savedOutput !== null) {
                    if (type === 'image-base64') {
                        setOutput(<img src={`data:image/png;base64,${savedOutput}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />);
                    } else if (type === 'plotly-json') {
                        setOutput(savedOutput);
                    } else {
                        setOutput(savedOutput);
                    }
                }
                setStatus('success');
            }
            if (savedFile) {
                setDownloadableFile(savedFile);
                setIsCollapsed(true); // Collapse on mount if result is a file
            }
            if (savedError || savedOutput !== null || savedFile) {
                setHasRunOnce(true);
            }
        }
    }, [persistedResult, lang]);

    useEffect(() => {
        // Auto-expand on first run, but NOT if it resulted in a downloadable file (which auto-collapses)
        if (autorun && hasRunOnce && !downloadableFile) {
            setIsCollapsed(false);
        }
    }, [autorun, hasRunOnce, downloadableFile]);

    useEffect(() => {
        if (autorun && isPythonReady && prevIsLoading && !isLoading && !persistedResult) {
            handleRunCode();
        }
    }, [isLoading, prevIsLoading, autorun, isPythonReady, persistedResult, handleRunCode]);


    useEffect(() => {
        const normalizedLang = normalizeLanguage(lang);
        if ((window as any).hljs) {
            try {
                const highlighted = (window as any).hljs.highlight(code, { language: normalizedLang, ignoreIllegals: true }).value;
                setHighlightedCode(highlighted);
            } catch (e) {
                setHighlightedCode(code); 
            }
        } else {
            setHighlightedCode(code);
        }
    }, [code, lang]);

    useEffect(() => {
        if (isExecutable && hasRunOnce && lang === 'python' && plotlyRef.current && typeof output === 'string' && output.startsWith('{')) {
            try {
                const spec = JSON.parse(output);
                if (window.Plotly) {
                    window.Plotly.newPlot(plotlyRef.current, spec.data, spec.layout || {}, { responsive: true });
                }
            } catch (e) {
                console.error("Failed to render Plotly chart:", e);
                setError(t('code.chartError'));
            }
        }
    }, [output, lang, isExecutable, hasRunOnce, t]);
    
    useEffect(() => {
        return () => {
            if (htmlBlobUrl) URL.revokeObjectURL(htmlBlobUrl);
        };
    }, [htmlBlobUrl]);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };
    
    const handleStopCode = () => {
        if (lang.toLowerCase() === 'python') {
            stopPythonExecution();
            onStopExecution(); 
            setStatus('idle');
            setError(t('code.stopped'));
            setOutput('');
        }
    };
    
    const OutputDisplay = () => {
        const isFatalError = status === 'error';
        const hasVisibleOutput = (output && typeof output !== 'string') || 
                                 (typeof output === 'string' && output.trim() !== '') ||
                                 (lang === 'python' && typeof output === 'string' && output.startsWith('{'));

        if (!error && !hasVisibleOutput && !downloadableFile && !htmlBlobUrl) {
            return null;
        }
        
        // Special minimalist download link
        if (!isFatalError && downloadableFile) {
             return (
                 <div className="flex items-center gap-2">
                     <button 
                        onClick={() => downloadFile(downloadableFile.filename, downloadableFile.mimetype, downloadableFile.data)}
                        className="flex items-center gap-2 text-foreground/90 hover:text-foreground group"
                     >
                        <DownloadIcon className="size-4" />
                        <span className="font-medium border-b-2 border-dotted border-foreground/30 group-hover:border-foreground/80 transition-colors pb-0.5">
                            Download {downloadableFile.filename}
                        </span>
                     </button>
                 </div>
             )
        }

        return (
            <div className="flex flex-col gap-2">
                {error && (
                    <div className={`output-block ${isFatalError ? 'error' : 'success'}`}>
                        <div className="flex justify-between items-start gap-4">
                            <pre className={`text-sm whitespace-pre-wrap flex-1 ${isFatalError ? 'error-text' : ''}`}>{error}</pre>
                            {isFatalError && onFixRequest && (
                                <button onClick={() => onFixRequest(error)} title={t('code.fixCode')} className="p-1 text-muted-foreground hover:bg-background rounded-md hover:text-foreground transition-colors"><Wand2Icon className="size-4" /></button>
                            )}
                        </div>
                    </div>
                )}
                
                {!isFatalError && hasVisibleOutput && (
                    <>
                        {output && typeof output !== 'string' && <div>{output}</div>}
                        {output && lang === 'python' && typeof output === 'string' && output.startsWith('{') && (
                            <div ref={plotlyRef} className="w-full min-h-[450px] rounded-xl bg-white p-2 border border-default"></div>
                        )}
                        {hasVisibleOutput && typeof output === 'string' && !output.startsWith('{') && (
                             <div className="text-sm output-block success">
                                <pre>{output.trim()}</pre>
                            </div>
                        )}
                    </>
                )}

                {!isFatalError && htmlBlobUrl && (
                     <div className="text-sm output-block success flex flex-col gap-2 p-0 border-none bg-transparent">
                            {htmlBlobUrl && (
                                <div className="mt-1">
                                    <button onClick={() => window.open(htmlBlobUrl, '_blank')} className="flex items-center text-xs font-medium px-3 py-2 rounded-md bg-background border border-default hover:bg-token-surface-secondary text-foreground"><EyeIcon className="size-3.5 mr-2" />{t('code.openInNewTab')}</button>
                                </div>
                            )}
                    </div>
                )}
            </div>
        );
    };
    
    const isPython = lang.toLowerCase() === 'python';
    const isRunButtonDisabled = (isPython && !isPythonReady) || status === 'executing';

    // Logic to hide the code block entirely if a file was successfully generated
    const showCodeBlock = !downloadableFile || status === 'error';
    
    // Lines hidden count
    const lineCount = code.trim().split('\n').length;

    return (
        <div className="not-prose my-4 font-sans max-w-full">
            {showCodeBlock && (
                <div className="bg-code-bg border border-default rounded-lg overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-background/30">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground font-medium uppercase tracking-wider">{title || lang}</span>
                            {isCollapsed && lineCount > 1 && (
                                <span className="text-[10px] text-muted-foreground ml-2 lowercase">
                                    {lineCount} lines hidden
                                </span>
                            )}
                            {isPython && !isPythonReady && status !== 'executing' && (
                                <span className="text-[10px] text-yellow-600 dark:text-yellow-500 opacity-80">{t('code.loading')}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                            <ActionButton onClick={() => setIsCollapsed(!isCollapsed)} title={isCollapsed ? t('code.expand') : t('code.collapse')}>
                                {isCollapsed ? <ChevronsUpDownIcon className="size-3.5" /> : <ChevronsDownUpIcon className="size-3.5" />}
                            </ActionButton>
                            
                            {isExecutable ? (
                                status === 'executing' ? (
                                    <ActionButton onClick={handleStopCode} title={t('code.stop')}>
                                        <div className="w-2.5 h-2.5 bg-foreground rounded-sm animate-pulse"></div>
                                    </ActionButton>
                                ) : (
                                    <>
                                        <ActionButton onClick={handleRunCode} title={hasRunOnce ? t('code.runAgain') : t('code.run')} disabled={isRunButtonDisabled}>
                                            {hasRunOnce ? <RefreshCwIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
                                        </ActionButton>
                                        {hasRunOnce && (
                                            <ActionButton onClick={handleClear} title={t('code.clear')}>
                                                <XIcon className="size-3.5" />
                                            </ActionButton>
                                        )}
                                    </>
                                )
                            ) : null}
                            
                            <ActionButton onClick={handleCopy} title={isCopied ? t('code.copied') : t('code.copy')}>
                                {isCopied ? <CheckIcon className="size-3.5 text-green-500" /> : <CopyIcon className="size-3.5" />}
                            </ActionButton>
                        </div>
                    </div>

                    <div className={`transition-all duration-300 ${isCollapsed ? 'max-h-0' : 'max-h-[500px]'} overflow-y-auto`}>
                        <div className="p-0 bg-code-bg">
                            <pre className="!m-0 !p-3 overflow-x-auto code-block-area rounded-none bg-transparent">
                                <code className={`language-${lang} hljs !text-[13px] !leading-relaxed`} dangerouslySetInnerHTML={{ __html: highlightedCode }} />
                            </pre>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="mt-2 space-y-2">
                {isExecutable && status === 'executing' && (
                     <div className="flex items-center text-xs text-muted-foreground px-2 py-1">
                        <LoadingSpinner />
                        <span>{t('code.executing')}</span>
                    </div>
                )}

                {isExecutable && hasRunOnce && (status === 'success' || status === 'error') && (
                    <OutputDisplay />
                )}
            </div>
        </div>
    );
};
