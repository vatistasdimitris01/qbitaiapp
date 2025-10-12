import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getPyodide } from '../services/pyodideService';
import { PlayIcon, CopyIcon, DownloadIcon, CheckIcon, RefreshCwIcon } from './icons';
import AITextLoading from './AITextLoading';

// This type should ideally be in types.ts, but is defined locally in ChatMessage and App
// I'm defining it here to match and extending it with 'html' support.
type ExecutionResult = {
  output: string | null;
  error: string;
  type: 'string' | 'image-base64' | 'plotly-json' | 'error' | 'html';
};

interface CodeExecutorProps {
    code: string;
    lang: string;
    title?: string;
    autorun?: boolean;
    persistedResult?: ExecutionResult;
    onExecutionComplete: (result: ExecutionResult) => void;
    onFixRequest: (error: string) => void;
}

const langExtensions: { [key: string]: string } = {
    python: 'py', javascript: 'js', js: 'js', html: 'html', react: 'jsx', jsx: 'jsx'
};

const ResultDisplay: React.FC<{ result: ExecutionResult }> = ({ result }) => {
    const plotlyContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (result.type === 'plotly-json' && result.output && plotlyContainerRef.current) {
            try {
                if (window.Plotly) {
                    const plotData = JSON.parse(result.output);
                    window.Plotly.newPlot(plotlyContainerRef.current, plotData.data, plotData.layout, { responsive: true });
                } else {
                    console.error("Plotly library not found.");
                }
            } catch (e) {
                console.error("Failed to render Plotly chart:", e);
            }
        }
    }, [result]);
    
    if (!result) return null;

    switch (result.type) {
        case 'string':
            return <pre className="whitespace-pre-wrap text-sm">{result.output}</pre>;
        case 'image-base64':
            return <img src={`data:image/png;base64,${result.output}`} alt="Execution result" className="max-w-full h-auto rounded-md" />;
        case 'plotly-json':
            return <div ref={plotlyContainerRef} className="w-full h-96"></div>;
        case 'html':
            return <iframe srcDoc={result.output || ''} className="w-full h-96 border border-default rounded-md" title="HTML Output" sandbox="allow-scripts" />;
        case 'error':
            return <pre className="whitespace-pre-wrap text-sm text-red-500">{result.error}</pre>;
        default:
            return null;
    }
};

export const CodeExecutor: React.FC<CodeExecutorProps> = ({ code, lang, title, autorun, persistedResult, onExecutionComplete, onFixRequest }) => {
    const [isExecuting, setIsExecuting] = useState(false);
    const [result, setResult] = useState<ExecutionResult | null>(persistedResult || null);
    const [isCopied, setIsCopied] = useState(false);
    const [highlightedCode, setHighlightedCode] = useState('');

    useEffect(() => {
        if ((window as any).hljs) {
            const safeLang = lang === 'react' || lang === 'jsx' ? 'javascript' : lang;
            try {
                const highlighted = (window as any).hljs.highlight(code, { language: safeLang, ignoreIllegals: true }).value;
                setHighlightedCode(highlighted);
            } catch (e) {
                setHighlightedCode(code); // Fallback to plain text
            }
        } else {
            setHighlightedCode(code);
        }
    }, [code, lang]);

    const runPythonCode = async (pythonCode: string): Promise<ExecutionResult> => {
        try {
            const pyodide = await getPyodide();
            // Unique namespace for each execution
            const namespace = pyodide.globals.get("dict")();
            
            // Capture output
            let stdout = '';
            let stderr = '';
            pyodide.setStdout({ batched: (msg: string) => stdout += msg + '\n' });
            pyodide.setStderr({ batched: (msg: string) => stderr += msg + '\n' });

            // Special preamble for matplotlib to output figures as base64
            const preamble = `
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io, base64

def get_figure_as_base64():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    plt.close() # Close the plot to free memory
    return base64.b64encode(buf.getvalue()).decode('utf-8')
`;
            await pyodide.runPythonAsync(preamble, { globals: namespace });

            const result = await pyodide.runPythonAsync(pythonCode, { globals: namespace });

            if (stderr) {
                return { type: 'error', error: stderr, output: null };
            }

            // Check if a matplotlib figure was created
            const isFig = await pyodide.runPythonAsync('len(plt.get_fignums()) > 0', { globals: namespace });
            if (isFig) {
                const imageB64 = await pyodide.runPythonAsync('get_figure_as_base64()', { globals: namespace });
                return { type: 'image-base64', output: imageB64, error: '' };
            }

            // Check if result is a plotly figure
            if (result && typeof result.to_json === 'function') {
                const plotlyJson = result.to_json();
                result.destroy();
                return { type: 'plotly-json', output: plotlyJson, error: '' };
            }

            let output = stdout;
            if (result !== undefined && result !== null) {
                output += result;
            }
            
            namespace.destroy();
            return { type: 'string', output: output.trim(), error: '' };

        } catch (e: any) {
            return { type: 'error', error: e.message, output: null };
        } finally {
             const pyodide = await getPyodide();
             pyodide.setStdout({}); // Reset stdout
             pyodide.setStderr({}); // Reset stderr
        }
    };
    
    const runJsCode = async (jsCode: string): Promise<ExecutionResult> => {
        let output = '';
        const oldLog = console.log;
        console.log = (...args) => {
            output += args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ') + '\n';
            oldLog(...args);
        };
        try {
            // Using an async function allows 'await' in user code
            const result = await (async () => eval(jsCode))();
            if (result !== undefined) {
                 output += String(result);
            }
            return { type: 'string', output, error: '' };
        } catch (e: any) {
            return { type: 'error', error: e.toString(), output: null };
        } finally {
            console.log = oldLog;
        }
    };

    const handleExecute = useCallback(async () => {
        setIsExecuting(true);
        setResult(null);
        let executionResult: ExecutionResult;

        const executableLang = lang.toLowerCase();
        if (executableLang === 'python') {
            executionResult = await runPythonCode(code);
        } else if (['javascript', 'js', 'react', 'jsx'].includes(executableLang)) {
            executionResult = await runJsCode(code);
        } else if (executableLang === 'html') {
            executionResult = { type: 'html', output: code, error: '' };
        } else {
            executionResult = { type: 'error', error: `Execution for language "${lang}" is not supported.`, output: null };
        }

        setResult(executionResult);
        onExecutionComplete(executionResult);
        setIsExecuting(false);
    }, [code, lang, onExecutionComplete]);

    useEffect(() => {
        if (autorun && !persistedResult) {
            handleExecute();
        }
    }, [autorun, persistedResult, handleExecute]);
    
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

    return (
        <div className="not-prose my-4 w-full max-w-3xl bg-card p-3 sm:p-6 rounded-3xl border border-default shadow-sm font-sans">
             <header className="flex flex-wrap items-center justify-between gap-2 pb-4">
                <div className="flex items-baseline space-x-2 min-w-0">
                    <h3 className="font-semibold text-foreground text-base truncate">{title || 'Code Executor'}</h3>
                    <span className="text-sm text-muted-foreground flex-shrink-0">· {lang}</span>
                </div>
                <div className="flex items-center space-x-4 text-sm font-medium">
                     <button onClick={handleCopy} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors" aria-label={isCopied ? "Copied" : "Copy"}>
                        {isCopied ? <CheckIcon className="size-4 text-green-500" /> : <CopyIcon className="size-4" />}
                        <span className={`hidden sm:inline ${isCopied ? 'text-green-500' : ''}`}>{isCopied ? 'Copied!' : 'Copy'}</span>
                    </button>
                    <button onClick={handleDownload} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors" aria-label="Download">
                        <DownloadIcon className="size-4" />
                        <span className="hidden sm:inline">Download</span>
                    </button>
                    <button onClick={handleExecute} disabled={isExecuting} className="flex items-center gap-1.5 text-green-600 hover:text-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors" aria-label="Run code">
                        <PlayIcon className="size-4" />
                        <span className="hidden sm:inline font-semibold">{isExecuting ? 'Running...' : 'Run'}</span>
                    </button>
                </div>
            </header>

            <div className="font-mono text-xs sm:text-sm leading-relaxed pt-2 bg-background dark:bg-black/50 p-3 sm:p-4 rounded-lg overflow-x-auto code-block-area">
                <pre><code className={`language-${lang} hljs`} dangerouslySetInnerHTML={{ __html: highlightedCode }} /></pre>
            </div>
            
            {(isExecuting || result) && (
                 <div className="mt-4 pt-4 border-t border-default">
                    <h4 className="font-semibold text-foreground text-sm mb-2">{ result?.type === 'error' ? 'Error' : 'Output'}</h4>
                    <div className="p-3 sm:p-4 rounded-lg bg-background dark:bg-black/50 min-h-[4rem] flex items-start justify-start">
                         {isExecuting && !result && <AITextLoading texts={['Executing...', 'Running code...']} />}
                         {result && <ResultDisplay result={result} />}
                    </div>
                     {result?.type === 'error' && (
                        <div className="flex items-center gap-4 mt-3 text-sm">
                            <p className="text-muted-foreground text-xs">An error occurred during execution.</p>
                            <button onClick={() => onFixRequest(result.error)} className="flex items-center gap-1.5 text-blue-600 hover:underline">
                               <RefreshCwIcon className="size-3.5" />
                               Ask AI to fix
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
