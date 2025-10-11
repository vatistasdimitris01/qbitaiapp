import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';

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
        await pyodide.loadPackage(['numpy', 'matplotlib', 'pandas', 'scikit-learn', 'sympy', 'pillow', 'beautifulsoup4', 'scipy', 'opencv-python']);
        await pyodide.loadPackage('micropip');
        const micropip = pyodide.pyimport('micropip');
        await micropip.install(['plotly', 'fpdf2']);
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
                        const [_, filename, mimetype, data] = line.split(':');
                        self.postMessage({ type: 'download', filename, mimetype, data });
                    } else {
                        self.postMessage({ type: 'stdout', data: line });
                    }
                }
            }});
            pyodide.setStderr({ batched: (str) => self.postMessage({ type: 'stderr', error: str }) });

            const preamble = \`
import io, base64, json, matplotlib
import matplotlib.pyplot as plt
from PIL import Image
import plotly.graph_objects as go
import numpy as np
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

type ExecutionResult = {
  output: string | null;
  error: string;
  type: 'string' | 'image-base64' | 'plotly-json' | 'error';
};

interface CodeExecutorProps {
    code: string;
    lang: string;
    title?: string;
    autorun?: boolean;
    persistedResult?: ExecutionResult;
    onExecutionComplete: (result: ExecutionResult) => void;
}

type ExecutionStatus = 'idle' | 'loading-env' | 'executing' | 'success' | 'error';
type OutputContent = string | React.ReactNode;

// File extensions for different languages for the download functionality
const langExtensions: { [key: string]: string } = {
    python: 'py', javascript: 'js', js: 'js', html: 'html'
};

export const CodeExecutor: React.FC<CodeExecutorProps> = ({ code, lang, title, autorun, persistedResult, onExecutionComplete }) => {
    const plotlyRef = useRef<HTMLDivElement>(null);
    const reactMountRef = useRef<HTMLDivElement>(null);
    const reactRootRef = useRef<any>(null);
    const workerRef = useRef<Worker | null>(null);
    const initialRunRef = useRef(true);
    
    const [status, setStatus] = useState<ExecutionStatus>('idle');
    const [output, setOutput] = useState<OutputContent>('');
    const [error, setError] = useState<string>('');
    const [highlightedCode, setHighlightedCode] = useState('');
    const [isCopied, setIsCopied] = useState(false);
    const [htmlPreviewUrl, setHtmlPreviewUrl] = useState<string | null>(null);
    const [view, setView] = useState<'code' | 'output'>('code');
    const [hasRunOnce, setHasRunOnce] = useState(false);

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
                const { output: savedOutput, error: savedError, type } = persistedResult;
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
                setView('output');
                setHasRunOnce(true);
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
        let finalResult: ExecutionResult | null = null;
    
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
                    setOutput(stdoutBuffer.trim());
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
                    if (mimetype.startsWith('image/')) {
                        setOutput(<img src={`data:${mimetype};base64,${data}`} alt={filename} className="max-w-full h-auto bg-white rounded-lg" />);
                    } else {
                        downloadFile(filename, mimetype, data);
                        stdoutBuffer += `Downloading ${filename}...\n`;
                        setOutput(stdoutBuffer.trim());
                    }
                    break;
                case 'success':
                    setStatus('success');
                    setView('output');
                    if (finalResult) {
                        onExecutionComplete(finalResult);
                    } else if (stdoutBuffer.trim()) {
                        onExecutionComplete({ output: stdoutBuffer.trim(), error: '', type: 'string' });
                    }
                    cleanup();
                    break;
                case 'error':
                    setError(msgError);
                    setStatus('error');
                    setView('output');
                    onExecutionComplete({ output: null, error: msgError, type: 'error' });
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
            {error && <pre className="text-sm text-red-500 dark:text-red-400 whitespace-pre-wrap bg-red-500/10 p-3 rounded-md">{error}</pre>}
            {output && !error && (
                (lang === 'python' && typeof output === 'string' && output.startsWith('{')) ? (
                     <div ref={plotlyRef} className="rounded-xl bg-white p-2"></div>
                ) : (lang === 'react' || lang === 'jsx') ? (
                    <div className="p-3 border border-default rounded-md bg-background" ref={reactMountRef}>{output}</div>
                ) : typeof output === 'string' ? (
                    <div className="text-sm text-foreground whitespace-pre-wrap">{output}</div>
                ) : (
                    <div>{output}</div>
                )
            )}
        </div>
    );
    
    const CodeDisplay = () => (
        <>
            <div className="font-mono text-sm leading-relaxed pt-2 bg-background dark:bg-black/50 p-4 rounded-lg overflow-x-auto code-block-area">
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
                <button onClick={handleStopCode} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-full flex items-center transition-colors text-sm font-medium">
                    <div className="w-2.5 h-2.5 bg-white rounded-sm mr-2"></div> Stop
                </button>
            );
        }
        if (!hasRunOnce) {
            return (
                 <button onClick={handleRunCode} className="bg-black text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200">
                    Run code
                </button>
            );
        }
        // hasRunOnce is true from here
        return (
            <div className="flex items-center space-x-2 sm:space-x-4">
                <button onClick={() => setView(v => v === 'code' ? 'output' : 'code')} className="bg-token-surface-secondary text-token-primary px-4 py-2 rounded-full text-sm font-medium hover:bg-border">
                    {view === 'code' ? 'Show Output' : 'Show Code'}
                </button>
                <button onClick={handleRunCode} className="bg-black text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200">
                    Run Again
                </button>
            </div>
        );
    }

    return (
        <div className="not-prose my-4 w-full max-w-3xl bg-card p-4 sm:p-6 rounded-3xl border border-default shadow-sm font-sans">
            <header className="flex items-center justify-between">
                <div className="flex items-baseline space-x-2">
                    <h3 className="font-semibold text-foreground text-base">{title || 'Code Executor'}</h3>
                    <span className="text-sm text-muted-foreground">· {lang}</span>
                </div>
                <div className="flex items-center space-x-2 sm:space-x-4">
                    <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">{isCopied ? 'Copied!' : 'Copy'}</button>
                    <button onClick={handleDownload} className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">Download</button>
                    {renderButtons()}
                </div>
            </header>
            
            {view === 'code' ? <CodeDisplay /> : <OutputDisplay />}
        </div>
    );
};
