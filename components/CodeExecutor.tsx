import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { getPyodide } from '../services/pyodideService';

declare global {
    interface Window {
        Babel: any;
    }
}

const LoadingSpinner = () => (
    <svg className="animate-spin h-5 w-5 mr-3 text-foreground" xmlns="http://www.w.org/2000/svg" fill="none" viewBox="0 0 24 24">
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

interface CodeExecutorProps {
    code: string;
    lang: string;
    title?: string;
}

type ExecutionStatus = 'idle' | 'loading-env' | 'executing' | 'success' | 'error';
type OutputContent = string | React.ReactNode;

// File extensions for different languages for the download functionality
const langExtensions: { [key: string]: string } = {
    python: 'py', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
    html: 'html', react: 'jsx', jsx: 'jsx'
};

export const CodeExecutor: React.FC<CodeExecutorProps> = ({ code, lang, title }) => {
    const plotlyRef = useRef<HTMLDivElement>(null);
    const reactMountRef = useRef<HTMLDivElement>(null);
    const reactRootRef = useRef<any>(null);
    
    const [status, setStatus] = useState<ExecutionStatus>('idle');
    const [output, setOutput] = useState<OutputContent>('');
    const [error, setError] = useState<string>('');
    const [highlightedCode, setHighlightedCode] = useState('');
    const [isCopied, setIsCopied] = useState(false);

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
    }, [output, lang]);

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

    const handleRunCode = async () => {
        setOutput('');
        setError('');

        switch (lang.toLowerCase()) {
            case 'python':
                await runPython();
                break;
            case 'javascript':
            case 'js':
            case 'typescript':
            case 'ts':
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
    
    const runPython = async () => {
        setStatus('loading-env');
        try {
            const pyodide = await getPyodide();
            setStatus('executing');

            const preamble = `
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
`;
            const fullCode = preamble + '\n' + code;
            let stdout_stream = '';
            pyodide.setStdout({ batched: (str: string) => stdout_stream += str + '\n' });
            pyodide.setStderr({ batched: (str: string) => setError(prev => prev + str + '\n') });
            
            await pyodide.runPythonAsync(fullCode);

            const lines = stdout_stream.split('\n');
            let regularOutput = '', imageBase64 = '', plotlySpec = '';

            for (const line of lines) {
                if (line.startsWith('__QBIT_PLOT_MATPLOTLIB__:') || line.startsWith('__QBIT_PLOT_PIL__:')) {
                    imageBase64 = line.split(':')[1];
                } else if (line.startsWith('__QBIT_PLOT_PLOTLY__:')) {
                    plotlySpec = line.substring(line.indexOf(':') + 1);
                } else if (line.startsWith('__QBIT_DOWNLOAD_FILE__:')) {
                    const [_, filename, mimetype, base64_data] = line.split(':');
                    downloadFile(filename, mimetype, base64_data);
                    regularOutput += `Downloading ${filename}...\n`;
                } else {
                    regularOutput += line + '\n';
                }
            }
            if (imageBase64) setOutput(<img src={`data:image/png;base64,${imageBase64}`} alt="Generated plot" className="max-w-full h-auto bg-card p-2 rounded-lg" />);
            else if (plotlySpec) setOutput(plotlySpec); // Will be caught by useEffect
            else setOutput(regularOutput.trim());

            setStatus('success');
        } catch (err: any) {
            setError(`Execution failed: ${err.message || String(err)}`);
            setStatus('error');
        }
    };

    const runJavaScript = () => {
        setStatus('executing');
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
            setOutput(finalOutput.trim());
            setStatus('success');
        } catch (err: any) {
            setError(err.toString());
            setStatus('error');
        } finally {
            console.log = oldConsoleLog;
        }
    };

    const runHtml = () => {
        setStatus('executing');
        try {
            const newWindow = window.open('', '_blank');
            if (newWindow) {
                const fullHtml = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>HTML Preview</title>
                        <style>
                            body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #f0f2f5; }
                            .container { width: 100%; height: 100vh; display: flex; flex-direction: column; }
                            header { background-color: #ffffff; padding: 12px 20px; border-bottom: 1px solid #dee2e6; font-size: 14px; color: #212529; font-weight: 500; }
                            iframe { flex-grow: 1; border: none; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <header>Qbit AI - HTML Preview</header>
                            <iframe srcdoc="${code.replace(/"/g, '&quot;')}"></iframe>
                        </div>
                    </body>
                    </html>
                `;
                newWindow.document.write(fullHtml);
                newWindow.document.close();
                setOutput('HTML preview opened in a new tab.');
                setStatus('success');
            } else {
                setError('Could not open a new tab. Please disable your popup blocker for this site.');
                setStatus('error');
            }
        } catch (err: any) {
            setError(`Execution failed: ${err.message || String(err)}`);
            setStatus('error');
        }
    };

    const runReact = () => {
        setStatus('executing');
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
    };

    const hasOutput = output || error;

    return (
        <div className="not-prose my-4 w-full max-w-3xl bg-card p-4 sm:p-6 rounded-3xl border border-default shadow-sm font-sans">
            <header className="flex items-center justify-between pb-4">
                <div className="flex items-baseline space-x-2">
                    <h3 className="font-semibold text-foreground text-base">{title || 'Code Executor'}</h3>
                    <span className="text-sm text-muted-foreground">· {lang}</span>
                </div>
                <div className="flex items-center space-x-4 sm:space-x-6 text-sm font-medium">
                    <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition-colors">{isCopied ? 'Copied!' : 'Copy'}</button>
                    <button onClick={handleDownload} className="text-muted-foreground hover:text-foreground transition-colors">Download</button>
                    <button onClick={handleRunCode} disabled={status === 'executing' || status === 'loading-env'} className="bg-black text-white px-4 py-2 rounded-full disabled:opacity-50">
                        Run code
                    </button>
                </div>
            </header>

            <div className="font-mono text-sm leading-relaxed pt-2 bg-background dark:bg-black/50 p-4 rounded-lg overflow-x-auto code-block-area">
                <pre><code className={`language-${lang} hljs`} dangerouslySetInnerHTML={{ __html: highlightedCode }} /></pre>
            </div>
            
            {(status === 'executing' || status === 'loading-env') && (
                 <div className="flex items-center text-sm text-muted-foreground p-4">
                    <LoadingSpinner />
                    <span>{status === 'loading-env' ? 'Loading environment...' : 'Executing...'}</span>
                </div>
            )}

            {hasOutput && (
                <div className="mt-4 pt-4 border-t border-default">
                    <h4 className="text-sm font-semibold text-muted-foreground mb-2">Output</h4>
                    {error && <pre className="text-sm text-red-500 dark:text-red-400 whitespace-pre-wrap bg-red-500/10 p-3 rounded-md">{error}</pre>}
                    {output && !error && (
                        lang === 'python' && typeof output === 'string' && output.startsWith('{') ? (
                             <div ref={plotlyRef} className="p-2 bg-card rounded-xl border border-default"></div>
                        ) : lang === 'react' || lang === 'jsx' ? (
                            <div ref={reactMountRef}>{output}</div>
                        ) : typeof output === 'string' ? (
                            <pre className="text-sm text-foreground whitespace-pre-wrap p-3 rounded-md">{output}</pre>
                        ) : (
                            <div>{output}</div>
                        )
                    )}
                </div>
            )}
        </div>
    );
};
