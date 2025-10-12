import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { CheckIcon, CopyIcon, DownloadIcon, PlayIcon, RefreshCwIcon, EyeIcon } from './icons';

declare global {
    interface Window {
        Babel: any;
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

warnings.filterwarnings("ignore", category=DeprecationWarning)

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
        if name: # If a filename is provided, intercept it for download
            pdf_output_bytes = original_fpdf_output(self, dest='S').encode('latin1')
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
    autorun?: boolean;
    persistedResult?: ExecutionResult;
    onExecutionComplete: (result: ExecutionResult) => void;
    onFixRequest?: (error: string) => void;
}

type ExecutionStatus = 'idle' | 'loading-env' | 'executing' | 'success' | 'error';
type OutputContent = string | React.ReactNode;

// File extensions for different languages for the download functionality
const langExtensions: { [key: string]: string } = {
    python: 'py', javascript: 'js', js: 'js', html: 'html'
};

export const CodeExecutor: React.FC<CodeExecutorProps> = ({ code, lang, title, autorun, persistedResult, onExecutionComplete, onFixRequest }) => {
    const plotlyRef = useRef<HTMLDivElement>(null);
    const reactMountRef = useRef<HTMLDivElement>(null);
    const reactRootRef = useRef<any>(null);
    const workerRef = useRef<Worker | null>(null);
    const currentRunFileRef = useRef<DownloadableFile | null>(null);
    const initialRunRef = useRef(true);
    
    const [status, setStatus] = useState<ExecutionStatus>('idle');
    const [output, setOutput] = useState<OutputContent>('');
    const [error, setError] = useState<string>('');
    const [downloadableFile, setDownloadableFile] = useState<DownloadableFile | null>(null);
    const [highlightedCode, setHighlightedCode] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    const [htmlPreviewUrl, setHtmlPreviewUrl] = useState<string | null>(null);
    const [view, setView] = useState<'code' | 'output'>(persistedResult && (persistedResult.output || persistedResult.error || persistedResult.downloadableFile) ? 'output' : 'code');
    const [hasRunOnce, setHasRunOnce] = useState(!!persistedResult);

    useEffect(() => {
        // Cleanup worker and URL on component unmount
        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
            if (htmlPreviewUrl) {
                URL.revokeObjectURL(htmlPreviewUrl);
            }
        };
    }, [htmlPreviewUrl]);

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
        if (lang === 'python' && plotlyRef.current && typeof output === 'string' && output.startsWith('{')) {
            try {
                const spec = JSON.parse(output);
                if ((window as any).Plotly) {
                    (window as any).Plotly.newPlot(plotlyRef.current, spec.data, spec.layout || {}, { responsive: true });
                }
            } catch (e) {
                console.error("Failed to render Plotly chart:", e);
                setError("Failed to render interactive chart.");
            }
        }
    }, [output, lang, view]);
    
    // Effect for initial run (autorun or restoring from persisted state)
    useEffect(() => {
        if (initialRunRef.current) {
            initialRunRef.current = false; // Prevent re-running on subsequent renders
            if (persistedResult) {
                const { output: savedOutput, error: savedError, type, downloadableFile: savedFile } = persistedResult;
                if (savedError) {
                    setError(savedError);
                    setStatus('error');
                } else if (savedOutput !== null) {
                    if (type === 'image-base64') {
                        setOutput(<img src={`data:image/png;base64,${savedOutput}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />);
                    } else if (type === 'plotly-json') {
                        setOutput(savedOutput);
                    } else { // 'string'
                        setOutput(savedOutput);
                    }
                    setStatus('success');
                }
                if (savedFile) {
                    setDownloadableFile(savedFile);
                }
                 if (savedError || savedOutput !== null || savedFile) {
                    setView('output');
                    setHasRunOnce(true);
                }
            } else if (autorun) {
                handleRunCode();
            }
        }
    }, [persistedResult, autorun, code, lang]);


    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };
    
    const handleDownload = () => {
        const extension = langExtensions[lang.toLowerCase()] || 'txt';
        const filename = `${title?.replace(/\s+/g, '_') || 'code'}.${extension}`;
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const runPython = async () => {
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
        let plotResult: { output: string; type: 'image-base64' | 'plotly-json' } | null = null;
        currentRunFileRef.current = null; // Reset ref for this run
    
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
                        plotResult = { output: data, type: 'plotly-json' };
                    } else { // matplotlib or pil
                        setOutput(<img src={`data:image/png;base64,${data}`} alt="Generated plot" className="max-w-full h-auto bg-white rounded-lg" />);
                        plotResult = { output: data, type: 'image-base64' };
                    }
                    break;
                case 'download':
                    const fileInfo = { filename, mimetype, data };
                    downloadFile(filename, mimetype, data);
                    setDownloadableFile(fileInfo);
                    currentRunFileRef.current = fileInfo;
                    break;
                case 'success':
                    setStatus('success');
                    setView('output');
                    
                    const currentRunDownloadableFile = currentRunFileRef.current;
                    let finalOutputText = stdoutBuffer.trim();
                    let finalResultType: ExecutionResult['type'] = 'string';
                    let finalResultData: string | null = null;

                    if (plotResult) {
                        finalResultType = plotResult.type;
                        finalResultData = plotResult.output;
                    } else if (finalOutputText) {
                        finalResultData = finalOutputText;
                    } else if (currentRunDownloadableFile && !finalOutputText) {
                        // If a file was the ONLY output, create a confirmation message.
                        const confirmationMessage = `File '${currentRunDownloadableFile.filename}' created successfully. Your download should start automatically.`;
                        setOutput(confirmationMessage);
                        finalResultData = confirmationMessage;
                    }

                    onExecutionComplete({
                        output: finalResultData,
                        error: '',
                        type: finalResultType,
                        downloadableFile: currentRunDownloadableFile,
                    });
                    cleanup();
                    break;
                case 'error':
                    const errorMsg = msgError || stderrBuffer.trim();
                    setError(errorMsg);
                    setStatus('error');
                    setView('output');
                    onExecutionComplete({
                        output: null,
                        error: errorMsg,
                        type: 'error',
                        downloadableFile: currentRunFileRef.current
                    });
                    cleanup();
                    break;
            }
        };
    
        worker.onerror = (err) => {
            const errorMsg = `Worker error: ${err.message}`;
            setError(errorMsg);
            setStatus('error');
            setView('output');
            onExecutionComplete({ output: null, error: errorMsg, type: 'error' });
            cleanup();
        };
    };

    const runJavaScript = () => {
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
            setView('output');
            onExecutionComplete({ output: trimmedOutput, error: '', type: 'string' });
        } catch (err: any) {
            const errorMsg = err.toString();
            setError(errorMsg);
            setStatus('error');
            setView('output');
            onExecutionComplete({ output: null, error: errorMsg, type: 'error' });
        } finally {
            console.log = oldConsoleLog;
        }
    };

    const runHtml = () => {
        setStatus('executing');
        setHasRunOnce(true);
        try {
            const blob = new Blob([code], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            setHtmlPreviewUrl(url);

            const newWindow = window.open(url, '_blank');
            if (newWindow) {
                setOutput('Preview opened in a new tab.');
                setStatus('success');
            } else {
                setError('Could not open a new tab. Please disable your popup blocker for this site.');
                setStatus('error');
                URL.revokeObjectURL(url);
                setHtmlPreviewUrl(null);
            }
        } catch (err: any) {
            setError(`Execution failed: ${err.message || String(err)}`);
            setStatus('error');
        }
        setView('output');
    };

    const runReact = () => {
        setStatus('executing');
        setHasRunOnce(true);
        if (reactMountRef.current) {
            try {
                if (reactRootRef.current) {
                    reactRootRef.current.unmount();
                }
                reactRootRef.current = ReactDOM.createRoot(reactMountRef.current);
                
                const wrappedCode = `
                    let Component;
                    ${code}
                    return Component;
                `;
                const transpiledCode = window.Babel.transform(wrappedCode, { presets: ['react'] }).code;
                const getComponent = new Function('React', transpiledCode);
                const ComponentToRender = getComponent(React);

                if (typeof ComponentToRender === 'function') {
                    reactRootRef.current.render(<ComponentToRender />);
                    setOutput(<div ref={reactMountRef}></div>);
                    setStatus('success');
                } else {
                    throw new Error("No 'Component' variable was exported from the code.");
                }
            } catch (err: any) {
                setError(err.toString());
                setStatus('error');
            }
        }
        setView('output');
    };

    const handleRunCode = async () => {
        setOutput('');
        setError('');
        setDownloadableFile(null);
        if (lang.toLowerCase() !== 'html' && htmlPreviewUrl) {
            URL.revokeObjectURL(htmlPreviewUrl);
            setHtmlPreviewUrl(null);
        }

        switch (lang.toLowerCase()) {
            case 'python':
                await runPython();
                break;
            case 'javascript':
            case 'js':
                runJavaScript();
                break;
            case 'html':
                runHtml();
                break;
            case 'react':
            case 'jsx':
                runReact();
                break;
            default:
                setError(`Language "${lang}" is not executable.`);
                setStatus('error');
        }
    };

    const handleStopCode = () => {
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
        setStatus('idle');
        setError('');
        setOutput('');
        setView('code');
    };
    
    const OutputDisplay = () => (
        <div className="pt-4">
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Output</h4>
            {error && (
                <div className="space-y-2">
                    <pre className="text-sm text-red-500 dark:text-red-400 whitespace-pre-wrap bg-red-500/10 p-3 rounded-md">{error}</pre>
                    {onFixRequest && (
                        <button 
                            onClick={() => onFixRequest(error)}
                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                        >
                            Fix it
                        </button>
                    )}
                </div>
            )}
            {output && !error && (
                (lang === 'python' && typeof output === 'string' && output.startsWith('{')) ? (
                     <div ref={plotlyRef} className="rounded-xl bg-white p-2"></div>
                ) : (lang === 'react' || lang === 'jsx') ? (
                    <div className="p-3 border border-default rounded-md bg-background" ref={reactMountRef}>{output}</div>
                ) : typeof output === 'string' ? (
                    <div className="text-sm text-foreground whitespace-pre-wrap">{output.trim()}</div>
                ) : (
                    <div>{output}</div>
                )
            )}
             {downloadableFile && !error && (
                <div className="mt-4 p-3 bg-background dark:bg-black/50 rounded-lg flex items-center justify-between gap-4">
                    <p className="text-sm text-foreground flex-1 min-w-0">
                        File created: <span className="font-semibold truncate">{downloadableFile.filename}</span>
                    </p>
                    <button 
                        onClick={() => downloadFile(downloadableFile.filename, downloadableFile.mimetype, downloadableFile.data)}
                        className="flex items-center gap-1.5 bg-token-surface-secondary text-token-primary rounded-md text-sm font-medium hover:bg-border px-3 py-1.5 border border-default whitespace-nowrap"
                    >
                        <DownloadIcon className="size-4" />
                        <span>Re-download</span>
                    </button>
                </div>
            )}
        </div>
    );
    
    const CodeDisplay = () => (
        <>
            <div className="font-mono text-xs sm:text-sm leading-relaxed pt-2 bg-background dark:bg-black/50 p-3 sm:p-4 rounded-lg overflow-x-auto code-block-area">
                <pre><code className={`language-${lang} hljs`} dangerouslySetInnerHTML={{ __html: highlightedCode }} /></pre>
            </div>
            {(status === 'executing' || status === 'loading-env') && (
                 <div className="flex items-center text-sm text-muted-foreground mt-4">
                    <LoadingSpinner />
                    <span>{status === 'loading-env' ? 'Loading environment...' : 'Executing...'}</span>
                </div>
            )}
        </>
    );
    
    const renderButtons = () => {
        const isRunnable = ['python', 'javascript', 'js', 'react', 'jsx', 'html'].includes(lang.toLowerCase());
        if (!isRunnable) return null;

        if (status === 'executing' || status === 'loading-env') {
            return (
                <button onClick={handleStopCode} className="bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center transition-colors text-sm font-medium h-10 w-10 sm:w-auto sm:px-4 sm:py-2" aria-label="Stop execution">
                    <div className="w-2.5 h-2.5 bg-white rounded-sm sm:mr-2"></div>
                    <span className="hidden sm:inline">Stop</span>
                </button>
            );
        }
        if (!hasRunOnce) {
            return (
                 <button onClick={handleRunCode} className="bg-black text-white rounded-full text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 flex items-center justify-center h-10 w-10 sm:w-auto sm:px-4 sm:py-2" aria-label="Run code">
                    <PlayIcon className="size-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Run code</span>
                </button>
            );
        }
        // hasRunOnce is true from here
        return (
            <div className="flex items-center gap-2 sm:gap-2">
                <button onClick={() => setView(v => v === 'code' ? 'output' : 'code')} className="bg-token-surface-secondary text-token-primary rounded-full text-sm font-medium hover:bg-border flex items-center justify-center h-10 w-10 sm:w-auto sm:px-4 sm:py-2" aria-label={view === 'code' ? 'Show Output' : 'Show Code'}>
                    <EyeIcon className="size-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">{view === 'code' ? 'Output' : 'Code'}</span>
                </button>
                <button onClick={handleRunCode} className="bg-black text-white rounded-full text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200 flex items-center justify-center h-10 w-10 sm:w-auto sm:px-4 sm:py-2" aria-label="Run Again">
                    <RefreshCwIcon className="size-4 sm:mr-1.5" />
                    <span className="hidden sm:inline">Run Again</span>
                </button>
            </div>
        );
    }

    return (
        <div className="not-prose my-4 w-full max-w-3xl bg-card p-3 sm:p-6 rounded-3xl border border-default shadow-sm font-sans">
            <header className="flex flex-wrap items-center justify-between gap-y-2 gap-x-4">
                <div className="flex items-center space-x-2 min-w-0">
                    <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{lang}</p>
                </div>
                <div className="flex items-center justify-end flex-grow gap-2 sm:gap-4">
                    <button onClick={handleCopy} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium" aria-label={isCopied ? 'Copied' : 'Copy code'}>
                        {isCopied ? <CheckIcon className="size-4 text-green-500" /> : <CopyIcon className="size-4" />}
                        <span className={`hidden sm:inline ${isCopied ? 'text-green-500' : ''}`}>{isCopied ? 'Copied!' : 'Copy'}</span>
                    </button>
                    <button onClick={handleDownload} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium" aria-label="Download code">
                        <DownloadIcon className="size-4" />
                        <span className="hidden sm:inline">Download</span>
                    </button>
                    {renderButtons()}
                </div>
            </header>
            
            {view === 'code' ? <CodeDisplay /> : <OutputDisplay />}
        </div>
    );
};