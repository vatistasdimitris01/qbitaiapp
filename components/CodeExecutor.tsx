

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getPyodide } from '../services/pyodideService';
import { PlayIcon, CopyIcon, DownloadIcon, CheckIcon, RefreshCwIcon, FileTextIcon } from './icons';
import AITextLoading from './AITextLoading';
import type { ExecutionResult, FileExecutionOutput } from '../types';

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

function uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

const ResultDisplay: React.FC<{ result: ExecutionResult }> = ({ result }) => {
    const plotlyContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (result.type === 'plotly-json' && result.output && plotlyContainerRef.current) {
            try {
                if (window.Plotly) {
                    const plotData = JSON.parse(result.output as string);
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
            // FIX: Cast result.output to string to prevent trying to render an object.
            return <pre className="whitespace-pre-wrap text-sm">{result.output as string}</pre>;
        case 'image-base64':
            // FIX: Cast result.output to string to prevent trying to render an object.
            return <img src={`data:image/png;base64,${result.output as string}`} alt="Execution result" className="max-w-full h-auto rounded-md" />;
        case 'plotly-json':
            return <div ref={plotlyContainerRef} className="w-full h-96"></div>;
        case 'html':
            return <iframe srcDoc={result.output as string || ''} className="w-full h-96 border border-default rounded-md" title="HTML Output" sandbox="allow-scripts" />;
        case 'error':
            return <pre className="whitespace-pre-wrap text-sm text-red-500">{result.error}</pre>;
        case 'file': {
            const fileOutput = result.output as FileExecutionOutput;
            if (!fileOutput) return null;

            const handleDownloadClick = () => {
                const byteString = atob(fileOutput.data);
                const bytes = new Uint8Array(byteString.length);
                for (let i = 0; i < byteString.length; i++) {
                    bytes[i] = byteString.charCodeAt(i);
                }
                const blob = new Blob([bytes], { type: fileOutput.mimeType });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileOutput.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            };

            return (
                <div className="flex items-center gap-4 p-2 rounded-lg bg-token-surface-secondary border border-default w-full">
                    <FileTextIcon className="size-6 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate" title={fileOutput.filename}>{fileOutput.filename}</p>
                        <p className="text-xs text-muted-foreground">{fileOutput.mimeType}</p>
                    </div>
                    <button
                        onClick={handleDownloadClick}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md bg-background hover:bg-token-surface-secondary border border-default text-foreground"
                    >
                        <DownloadIcon className="size-4" />
                        Download
                    </button>
                </div>
            );
        }
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
        let namespace: any;
        try {
            const pyodide = await getPyodide();
            namespace = pyodide.globals.get("dict")();
            
            let stdout = '';
            let stderr = '';
            pyodide.setStdout({ batched: (msg: string) => stdout += msg + '\n' });
            pyodide.setStderr({ batched: (msg: string) => stderr += msg + '\n' });

            const preamble = `
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io, base64

def get_figure_as_base64():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    plt.close()
    return base64.b64encode(buf.getvalue()).decode('utf-8')
`;
            await pyodide.runPythonAsync(preamble, { globals: namespace });

            const executionResult = await pyodide.runPythonAsync(pythonCode, { globals: namespace });

            if (stderr) {
                return { type: 'error', error: stderr, output: null };
            }

            const fileOutputPy = namespace.get('__qbit_file_output__');
            if (fileOutputPy) {
                const fileOutput = fileOutputPy.toJs({ dict_converter: Object.fromEntries });
                fileOutputPy.destroy();

                if (fileOutput && fileOutput.data instanceof Uint8Array && fileOutput.mime_type && fileOutput.filename) {
                    const base64Data = uint8ArrayToBase64(fileOutput.data);
                    return {
                        type: 'file',
                        output: {
                            data: base64Data,
                            mimeType: fileOutput.mime_type,
                            filename: fileOutput.filename
                        },
                        error: ''
                    };
                }
            }

            const isFig = await pyodide.runPythonAsync('len(plt.get_fignums()) > 0', { globals: namespace });
            if (isFig) {
                const imageB64 = await pyodide.runPythonAsync('get_figure_as_base64()', { globals: namespace });
                return { type: 'image-base64', output: imageB64, error: '' };
            }

            if (executionResult && typeof executionResult.to_json === 'function') {
                const plotlyJson = executionResult.to_json();
                executionResult.destroy();
                return { type: 'plotly-json', output: plotlyJson, error: '' };
            }

            let output = stdout;
            if (executionResult !== undefined && executionResult !== null) {
                output += executionResult;
            }
            
            return { type: 'string', output: output.trim(), error: '' };

        } catch (e: any) {
            return { type: 'error', error: e.message, output: null };
        } finally {
             if (namespace) namespace.destroy();
             const pyodide = await getPyodide();
             pyodide.setStdout({});
             pyodide.setStderr({});
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
