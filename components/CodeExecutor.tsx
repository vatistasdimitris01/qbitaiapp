
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { CheckIcon, CopyIcon, DownloadIcon, PlayIcon, RefreshCwIcon, ChevronsUpDownIcon, ChevronsDownUpIcon } from './icons';

declare global {
    interface Window {
        Babel: any;
        Plotly: any;
    }
}

const pythonWorkerSource = `
    importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");
    let pyodide = null;
    
    async function loadPyodideAndPackages() {
        // @ts-ignore
        pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/" });
        await pyodide.loadPackage(['numpy', 'matplotlib', 'pandas', 'scikit-learn', 'sympy', 'pillow', 'beautifulsoup4', 'scipy', 'opencv-python', 'requests']);
        await pyodide.loadPackage('micropip');
        const micropip = pyodide.pyimport('micropip');
        await micropip.install(['plotly', 'fpdf2', 'seaborn', 'openpyxl', 'python-docx']);
        self.postMessage({ type: 'status', status: 'ready' });
    }
    const pyodideReadyPromise = loadPyodideAndPackages();

    self.onmessage = async (event) => {
        await pyodideReadyPromise;
        const { code } = event.data;

        try {
            pyodide.setStdout({ batched: (str) => {
                const lines = str.split('\\n');
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.startsWith('__QBIT_PLOT_MATPLOTLIB__:') || line.startsWith('__QBIT_PLOT_PIL__:')) {
                        self.postMessage({ type: 'plot', plotType: 'image', data: line.split(':')[1] });
                    } else if (line.startsWith('__QBIT_PLOT_PLOTLY__:')) {
                        self.postMessage({ type: 'plot', plotType: 'plotly', data: line.substring(line.indexOf(':') + 1) });
                    } else if (line.startsWith('__QBIT_DOWNLOAD_FILE__:')) {
                        const separator = ':';
                        const parts = line.split(separator);
                        if (parts.length >= 4) {
                            parts.shift(); // remove command
                            const filename = parts.shift() || 'download';
                            const mimetype = parts.shift() || 'application/octet-stream';
                            const data = parts.join(separator); // Rejoin the rest
                            self.postMessage({ type: 'download', filename, mimetype, data });
                        }
                    } else {
                        self.postMessage({ type: 'stdout', data: line });
                    }
                }
            }});
            pyodide.setStderr({ batched: (str) => self.postMessage({ type: 'stderr', error: str }) });

            const preamble = \`
import io, base64, json, matplotlib, warnings
import matplotlib.pyplot as plt
from PIL import Image
import plotly.graph_objects as go
import plotly.express as px
import numpy as np
warnings.filterwarnings('ignore', category=DeprecationWarning)
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating): return float(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        return super(NumpyEncoder, self).default(obj)
matplotlib.use('agg')
def custom_plt_show():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    buf.seek(0)
    b64_str = base64.b64encode(buf.read()).decode('utf-8')
    print(f"__QBIT_PLOT_MATPLOTLIB__:{b64_str}")
    plt.clf()
plt.show = custom_plt_show
def custom_pil_show(self):
    buf = io.BytesIO()
    self.save(buf, format='PNG')
    buf.seek(0)
    b64_str = base64.b64encode(buf.read()).decode('utf-8')
    print(f"__QBIT_PLOT_PIL__:{b64_str}")
Image.Image.show = custom_pil_show
def custom_plotly_show(self, *args, **kwargs):
    fig_dict = self.to_dict()
    json_str = json.dumps(fig_dict, cls=NumpyEncoder)
    print(f"__QBIT_PLOT_PLOTLY__:{json_str}")
go.Figure.show = custom_plotly_show
if hasattr(go, 'FigureWidget'): go.FigureWidget.show = custom_plotly_show

# --- Monkey-patch file generation libraries to trigger downloads ---
try:
    from openpyxl.workbook.workbook import Workbook
    original_workbook_save = Workbook.save
    def patched_workbook_save(self, filename):
        if isinstance(filename, str):
            buffer = io.BytesIO()
            original_workbook_save(self, buffer)
            buffer.seek(0)
            excel_bytes = buffer.read()
            b64_data = base64.b64encode(excel_bytes).decode('utf-8')
            mimetype = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            print(f"__QBIT_DOWNLOAD_FILE__:{filename}:{mimetype}:{b64_data}")
        else:
            original_workbook_save(self, filename)
    Workbook.save = patched_workbook_save
except ImportError:
    pass

try:
    from fpdf import FPDF
    original_fpdf_output = FPDF.output
    def patched_fpdf_output(self, name='', dest='S'):
        # If a filename is provided, intercept it for download
        if name: 
            pdf_output_bytes = original_fpdf_output(self, dest='S')
            b64_data = base64.b64encode(pdf_output_bytes).decode('utf-8')
            mimetype = "application/pdf"
            print(f"__QBIT_DOWNLOAD_FILE__:{name}:{mimetype}:{b64_data}")
        else:
            # If no filename, behave as original (e.g., return bytes for dest='S')
            return original_fpdf_output(self, name=name, dest=dest)
    FPDF.output = patched_fpdf_output
except ImportError:
    pass

try:
    from docx.document import Document
    original_document_save = Document.save
    def patched_document_save(self, path_or_stream):
        if isinstance(path_or_stream, str):
            buffer = io.BytesIO()
            original_document_save(self, buffer)
            buffer.seek(0)
            word_bytes = buffer.read()
            b64_data = base64.b64encode(word_bytes).decode('utf-8')
            mimetype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            print(f"__QBIT_DOWNLOAD_FILE__:{path_or_stream}:{mimetype}:{b64_data}")
        else:
            original_document_save(self, path_or_stream)
    Document.save = patched_document_save
except ImportError:
    pass
\`;
            
            await pyodide.runPythonAsync(preamble + '\\n' + code);
            self.postMessage({ type: 'success' });
        } catch (error) {
            self.postMessage({ type: 'error', error: error.message });
        }
    };
`;

const LoadingSpinner = () => (
    <svg className="animate-spin h-5 w-5 mr-3 text-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
    persistedResult?: ExecutionResult;
    onExecutionComplete: (result: ExecutionResult) => void;
    onFixRequest?: (error: string) => void;
    isLoading?: boolean;
}

type ExecutionStatus = 'idle' | 'loading-env' | 'executing' | 'success' | 'error';
type OutputContent = string | React.ReactNode;

function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}

const ActionButton: React.FC<{ onClick: () => void; title: string; children: React.ReactNode; }> = ({ onClick, title, children }) => (
    <button
        onClick={onClick}
        title={title}
        aria-label={title}
        className="p-1.5 rounded-md text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
    >
        {children}
    </button>
);


export const CodeExecutor: React.FC<CodeExecutorProps> = ({ code, lang, title, isExecutable, autorun, persistedResult, onExecutionComplete, onFixRequest, isLoading = false }) => {
    const plotlyRef = useRef<HTMLDivElement>(null);
    const reactMountRef = useRef<HTMLDivElement>(null);
    const reactRootRef = useRef<any>(null);
    const workerRef = useRef<Worker | null>(null);
    
    const [status, setStatus] = useState<ExecutionStatus>('idle');
    const [output, setOutput] = useState<OutputContent>('');
    const [error, setError] = useState<string>('');
    const [downloadableFile, setDownloadableFile] = useState<DownloadableFile | null>(null);
    const [highlightedCode, setHighlightedCode] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [hasRunOnce, setHasRunOnce] = useState(!!persistedResult);
    const prevIsLoading = usePrevious(isLoading);
    const [reactExecTrigger, setReactExecTrigger] = useState(0);

    const lineCount = useMemo(() => code.split('\n').length, [code]);

    const runPython = useCallback(async () => {
        setStatus('loading-env');
        setHasRunOnce(true);
    
        if (workerRef.current) {
            workerRef.current.terminate();
        }
    
        const workerBlob = new Blob([pythonWorkerSource], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(workerBlob);
        const worker = new Worker(workerUrl);
        workerRef.current = worker;
    
        let stdoutBuffer = '';
        let stderrBuffer = '';
        let finalResult: ExecutionResult | null = null;
        let currentRunDownloadableFile: DownloadableFile | null = null;
    
        const cleanup = () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
            URL.revokeObjectURL(workerUrl);
        };
    
        worker.onmessage = (event) => {
            const { type, status: msgStatus, data, plotType, error: msgError, filename, mimetype } = event.data;
    
            switch (type) {
                case 'status':
                    if (msgStatus === 'ready') {
                        setStatus('executing');
                        worker.postMessage({ code });
                    }
                    break;
                case 'stdout':
                    stdoutBuffer += data + '\n';
                    setOutput(prev => (typeof prev === 'string' ? prev : '') + data + '\n');
                    break;
                case 'stderr':
                    stderrBuffer += msgError + '\n';
                    setError(stderrBuffer.trim());
                    break;
                case 'plot':
                    if (plotType === 'plotly') {
                        setOutput(data);
                        finalResult = { output: data, error: '', type: 'plotly-json' };
                    } else { // matplotlib or pil
                        setOutput(<img src={`data:image/png;base64,${data}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />);
                        finalResult = { output: data, error: '', type: 'image-base64' };
                    }
                    break;
                case 'download':
                    const fileInfo = { filename, mimetype, data };
                    downloadFile(filename, mimetype, data);
                    setDownloadableFile(fileInfo);
                    currentRunDownloadableFile = fileInfo;
                    break;
                case 'success':
                    setStatus('success');
                    let resultToPersist: ExecutionResult;
                    if (finalResult) {
                        resultToPersist = { ...finalResult, error: '' };
                    } else if (stdoutBuffer.trim()) {
                        resultToPersist = { output: stdoutBuffer.trim(), error: '', type: 'string' };
                    } else if (currentRunDownloadableFile) {
                        const msg = `File '${currentRunDownloadableFile.filename}' created successfully.`;
                        setOutput(msg);
                        resultToPersist = { output: msg, error: '', type: 'string' };
                    } else {
                        resultToPersist = { output: null, error: '', type: 'string' };
                    }
                    
                    if (currentRunDownloadableFile) {
                        resultToPersist.downloadableFile = currentRunDownloadableFile;
                    }
                    onExecutionComplete(resultToPersist);
                    cleanup();
                    break;
                case 'error':
                    const errorMsg = msgError || stderrBuffer.trim();
                    setError(errorMsg);
                    setStatus('error');
                    const errorResult: ExecutionResult = { output: null, error: errorMsg, type: 'error' };
                    if (currentRunDownloadableFile) {
                        errorResult.downloadableFile = currentRunDownloadableFile;
                    }
                    onExecutionComplete(errorResult);
                    cleanup();
                    break;
            }
        };
    
        worker.onerror = (err) => {
            const errorMsg = `Worker error: ${err.message}`;
            setError(errorMsg);
            setStatus('error');
            onExecutionComplete({ output: null, error: errorMsg, type: 'error' });
            cleanup();
        };
    }, [code, onExecutionComplete]);
    
    const runJavaScript = useCallback(() => {
        setStatus('executing');
        setHasRunOnce(true);
        let consoleOutput = '';
        const oldConsoleLog = console.log;
        console.log = (...args) => {
            consoleOutput += args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ') + '\n';
        };
        try {
            const result = (0, eval)(code);
            let finalOutput = consoleOutput;
            if (result !== undefined) {
                finalOutput += `\n// returns\n${JSON.stringify(result, null, 2)}`;
            }
            const trimmedOutput = finalOutput.trim();
            setOutput(trimmedOutput);
            setStatus('success');
            onExecutionComplete({ output: trimmedOutput, error: '', type: 'string' });
        } catch (err: any) {
            const errorMsg = err.toString();
            setError(errorMsg);
            setStatus('error');
            onExecutionComplete({ output: null, error: errorMsg, type: 'error' });
        } finally {
            console.log = oldConsoleLog;
        }
    }, [code, onExecutionComplete]);

    const runHtml = useCallback(() => {
        setStatus('executing');
        setHasRunOnce(true);
        try {
            const blob = new Blob([code], { type: 'text/html' });
            const url = URL.createObjectURL(blob);

            const newWindow = window.open(url, '_blank');
            if (newWindow) {
                setOutput('Preview opened in a new tab.');
                setStatus('success');
                onExecutionComplete({ output: 'Preview opened in a new tab.', error: '', type: 'string' });
            } else {
                const errorMsg = 'Could not open a new tab. Please disable your popup blocker for this site.';
                setError(errorMsg);
                setStatus('error');
                URL.revokeObjectURL(url);
                onExecutionComplete({ output: null, error: errorMsg, type: 'error' });
            }
        } catch (err: any) {
            const errorMsg = 'Execution failed: ' + (err.message || String(err));
            setError(errorMsg);
            setStatus('error');
            onExecutionComplete({ output: null, error: errorMsg, type: 'error' });
        }
    }, [code, onExecutionComplete]);
    
    useEffect(() => {
        if (reactExecTrigger > 0 && reactMountRef.current) {
            try {
                if (!reactRootRef.current) {
                    reactRootRef.current = ReactDOM.createRoot(reactMountRef.current);
                }
                
                const wrappedCode = `let Component; ${code}; return Component;`;
                const transpiledCode = window.Babel.transform(wrappedCode, { presets: ['react'] }).code;
                const getComponent = new Function('React', transpiledCode);
                const ComponentToRender = getComponent(React);

                if (typeof ComponentToRender === 'function') {
                    const Component = ComponentToRender as React.ComponentType;
                    reactRootRef.current.render(React.createElement(Component));
                    setOutput(null);
                    setStatus('success');
                    onExecutionComplete({ output: 'React component rendered.', error: '', type: 'string' });
                } else {
                    throw new Error("No 'Component' variable was exported from the code.");
                }
            } catch (err: any) {
                const errorMsg = err.toString();
                setError(errorMsg);
                setStatus('error');
                onExecutionComplete({ output: null, error: errorMsg, type: 'error' });
            }
        }
    }, [reactExecTrigger, code, onExecutionComplete]);
    
    useEffect(() => {
        return () => {
            if (reactRootRef.current) {
                reactRootRef.current.unmount();
                reactRootRef.current = null;
            }
        }
    }, []);

    const runReact = useCallback(() => {
        setStatus('executing');
        setHasRunOnce(true);
        setReactExecTrigger(c => c + 1);
    }, []);

    const handleRunCode = useCallback(async () => {
        setOutput('');
        setError('');
        setDownloadableFile(null);
        
        switch (lang.toLowerCase()) {
            case 'python': await runPython(); break;
            case 'javascript': case 'js': runJavaScript(); break;
            case 'html': runHtml(); break;
            case 'react': case 'jsx': runReact(); break;
            default:
                const errorMsg = `Language "${lang}" is not executable.`;
                setError(errorMsg);
                setStatus('error');
                onExecutionComplete({ output: null, error: errorMsg, type: 'error' });
        }
    }, [lang, runPython, runJavaScript, runHtml, runReact, onExecutionComplete]);
    
    useEffect(() => {
        if (persistedResult) {
            const { output: savedOutput, error: savedError, type, downloadableFile: savedFile } = persistedResult;
            
            if (savedError) {
                setError(savedError);
                setStatus('error');
            } else {
                if (savedOutput !== null) {
                    if (type === 'image-base64') {
                        setOutput(<img src={`data:image/png;base64,${savedOutput}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />);
                    } else if (type === 'plotly-json') {
                        setOutput(savedOutput);
                    } else {
                        setOutput(savedOutput);
                    }
                }
                setDownloadableFile(savedFile || null);
                setStatus('success');
            }
            if (savedError || savedOutput !== null || savedFile) {
                setHasRunOnce(true);
            }
        }
    }, [persistedResult]);

    useEffect(() => {
        if (autorun && prevIsLoading && !isLoading && !persistedResult) {
            handleRunCode();
        }
    }, [isLoading, prevIsLoading, autorun, persistedResult, handleRunCode]);

    useEffect(() => {
        if ((window as any).hljs) {
            try {
                const highlighted = (window as any).hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
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
                setError("Failed to render interactive chart.");
            }
        }
    }, [output, lang, isExecutable, hasRunOnce]);
    
    useEffect(() => {
        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };
    
    const handleStopCode = () => {
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
        setStatus('idle');
        setError('Execution stopped by user.');
        setOutput('');
    };
    
    const OutputDisplay = () => (
        <div className="flex flex-col gap-2">
            {error ? (
                <div className="space-y-2 output-block border border-red-500/50 bg-red-500/10 dark:bg-red-500/10">
                    <pre className="text-sm error-text whitespace-pre-wrap">{error}</pre>
                    {onFixRequest && (
                        <button 
                            onClick={() => onFixRequest(error)}
                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            Fix it
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {output && (
                        (lang === 'python' && typeof output === 'string' && output.startsWith('{')) ? (
                             <div ref={plotlyRef} className="rounded-xl bg-white p-2"></div>
                        ) : (lang === 'react' || lang === 'jsx') ? (
                            <div className="p-3 border border-default rounded-md bg-background" ref={reactMountRef}></div>
                        ) : typeof output === 'string' ? (
                           <div className="text-sm output-block">
                             <pre>{output.trim()}</pre>
                           </div>
                        ) : (
                            <div>{output}</div>
                        )
                    )}
                     
                    {downloadableFile && !output && (
                        <div className="output-block">
                           <p className="text-sm flex-1 min-w-0">
                                File created: <span className="font-semibold truncate">{downloadableFile.filename}</span>
                            </p>
                        </div>
                    )}
                </>
            )}
        </div>
    );

    return (
        <div className="not-prose my-4">
            <div className="bg-card border border-default rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-1.5 bg-token-surface-secondary border-b border-default">
                    <span className="font-mono text-xs text-muted-foreground">{lang}</span>
                    <div className="flex items-center gap-1">
                        <ActionButton onClick={() => setIsCollapsed(!isCollapsed)} title={isCollapsed ? 'Expand code' : 'Collapse code'}>
                            {isCollapsed ? <ChevronsUpDownIcon className="size-4" /> : <ChevronsDownUpIcon className="size-4" />}
                        </ActionButton>
                        
                        {isExecutable && (
                            status === 'executing' || status === 'loading-env' ? (
                                <ActionButton onClick={handleStopCode} title="Stop execution">
                                    <div className="w-2.5 h-2.5 bg-foreground rounded-sm"></div>
                                </ActionButton>
                            ) : (
                                <ActionButton onClick={handleRunCode} title={hasRunOnce ? 'Run Again' : 'Run code'}>
                                    {hasRunOnce ? <RefreshCwIcon className="size-4" /> : <PlayIcon className="size-4" />}
                                </ActionButton>
                            )
                        )}
                        
                        <ActionButton onClick={handleCopy} title={isCopied ? 'Copied!' : 'Copy code'}>
                            {isCopied ? <CheckIcon className="size-4 text-green-500" /> : <CopyIcon className="size-4" />}
                        </ActionButton>
                    </div>
                </div>

                <div className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${isCollapsed ? 'max-h-0' : 'max-h-[500px]'}`}>
                    <pre className="!m-0 !p-4 overflow-x-auto code-block-area">
                        <code className={`language-${lang} hljs`} dangerouslySetInnerHTML={{ __html: highlightedCode }} />
                    </pre>
                </div>
                 {isCollapsed && lineCount > 0 && (
                    <div className="px-4 py-2 text-xs text-muted-foreground italic bg-token-surface-secondary border-t border-default">
                        {lineCount} hidden lines
                    </div>
                )}
            </div>
            
            <div className="mt-2 space-y-2">
                {isExecutable && (status === 'executing' || status === 'loading-env') && !isCollapsed && (
                     <div className="flex items-center text-sm text-muted-foreground p-3 border border-default rounded-xl bg-token-surface-secondary">
                        <LoadingSpinner />
                        <span>{status === 'loading-env' ? 'Loading environment...' : 'Executing...'}</span>
                    </div>
                )}

                {isExecutable && hasRunOnce && !isCollapsed && (status === 'success' || status === 'error') && (
                    <OutputDisplay />
                )}
            </div>
        </div>
    );
};
