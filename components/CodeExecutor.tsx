import React, { useState, useEffect, useRef } from 'react';
import { getPyodide } from '../services/pyodideService';
import { DownloadIcon, PlayIcon } from './icons';

interface CodeExecutorProps {
    code: string;
    title: string;
    lang: string;
}

type ExecutionStatus = 'idle' | 'loading-env' | 'executing' | 'success' | 'error';
interface GeneratedFile {
    name: string;
    content: Uint8Array;
}

const escapeHtml = (text: string) => {
    const p = document.createElement('p');
    p.textContent = text;
    return p.innerHTML;
};

const getMimeType = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: { [key: string]: string } = {
        'csv': 'text/csv', 'json': 'application/json', 'txt': 'text/plain', 'html': 'text/html',
        'pdf': 'application/pdf', 'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
        'gif': 'image/gif', 'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'zip': 'application/zip', 'md': 'text/markdown', 'odt': 'application/vnd.oasis.opendocument.text',
        'ods': 'application/vnd.oasis.opendocument.spreadsheet', 'odp': 'application/vnd.oasis.opendocument.presentation',
    };
    return mimeTypes[extension] || 'application/octet-stream';
};

const handleDownload = (name: string, content: Uint8Array) => {
    const mimeType = getMimeType(name);
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
};


export const CodeExecutor: React.FC<CodeExecutorProps> = ({ code, title, lang }) => {
    const plotlyRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<ExecutionStatus>('idle');
    const [output, setOutput] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [imageBase64, setImageBase64] = useState<string | null>(null);
    const [plotlySpec, setPlotlySpec] = useState<string | null>(null);
    const [files, setFiles] = useState<GeneratedFile[]>([]);
    const [highlightedCode, setHighlightedCode] = useState('');

    useEffect(() => {
        if ((window as any).hljs) {
            try {
                const highlighted = (window as any).hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
                setHighlightedCode(highlighted);
            } catch (e) {
                setHighlightedCode(escapeHtml(code));
            }
        } else {
            setHighlightedCode(escapeHtml(code));
        }
    }, [code, lang]);

    const handleRunCode = async () => {
        setStatus('loading-env');
        setOutput(''); setError(''); setImageBase64(null); setPlotlySpec(null); setFiles([]);

        let pyodide: any;
        try {
            pyodide = await getPyodide();
        } catch (err: any) {
            console.error("Pyodide failed to load:", err);
            setError(`Pyodide environment failed to load: ${err.message}`);
            setStatus('error');
            return;
        }

        setStatus('executing');
        const executionDir = `/home/pyodide/run_${Date.now()}`;
        pyodide.FS.mkdirTree(executionDir);

        let stdout_stream = '';
        let stderr_stream = '';

        try {
            const preamble = `
import io, base64, json, matplotlib, os
import matplotlib.pyplot as plt
from PIL import Image
import plotly.graph_objects as go
import numpy as np

os.chdir("${executionDir}")

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating): return float(obj)
        if isinstance(obj, np.ndarray): return obj.tolist()
        return super(NumpyEncoder, self).default(obj)

matplotlib.use('agg')
def custom_plt_show():
    buf = io.BytesIO(); plt.savefig(buf, format='png', bbox_inches='tight'); buf.seek(0)
    print(f"__QBIT_PLOT_MATPLOTLIB__:{base64.b64encode(buf.read()).decode('utf-8')}"); plt.clf()
plt.show = custom_plt_show
def custom_pil_show(self):
    buf = io.BytesIO(); self.save(buf, format='PNG'); buf.seek(0)
    print(f"__QBIT_PLOT_PIL__:{base64.b64encode(buf.read()).decode('utf-8')}")
Image.Image.show = custom_pil_show
def custom_plotly_show(self, *args, **kwargs):
    print(f"__QBIT_PLOT_PLOTLY__:{json.dumps(self.to_dict(), cls=NumpyEncoder)}")
go.Figure.show = custom_plotly_show
if hasattr(go, 'FigureWidget'): go.FigureWidget.show = custom_plotly_show
`;
            const fullCode = preamble + '\n' + code;
            
            pyodide.setStdout({ batched: (str: string) => stdout_stream += str + '\n' });
            pyodide.setStderr({ batched: (str: string) => stderr_stream += str + '\n' });

            const result = await pyodide.runPythonAsync(fullCode);
            
            const newFileNames = pyodide.FS.readdir(executionDir).filter((f: string) => f !== '.' && f !== '..');
            if (newFileNames.length > 0) {
                setFiles(newFileNames.map((name: string) => ({ name, content: pyodide.FS.readFile(`${executionDir}/${name}`) })));
            }

            if (result !== undefined) stdout_stream += pyodide.repr(result);
            setStatus('success');

        } catch (err: any) {
            console.error("Pyodide execution failed:", err);
            setError(`Execution failed: ${err.message || String(err)}`);
            setStatus('error');
            stderr_stream += String(err);
        } finally {
            try {
                pyodide.FS.readdir(executionDir).forEach((file: string) => file !== '.' && file !== '..' && pyodide.FS.unlink(`${executionDir}/${file}`));
                pyodide.FS.rmdir(executionDir);
            } catch(e) { /* ignore cleanup errors */ }
            pyodide.setStdout({});
            pyodide.setStderr({});
            pyodide.FS.chdir('/home/pyodide');
        }
        
        let regularOutput = '';
        stdout_stream.split('\n').forEach(line => {
            if (line.startsWith('__QBIT_PLOT_MATPLOTLIB__:')) setImageBase64(line.substring(25));
            else if (line.startsWith('__QBIT_PLOT_PIL__:')) setImageBase64(line.substring(18));
            else if (line.startsWith('__QBIT_PLOT_PLOTLY__:')) setPlotlySpec(line.substring(21));
            else regularOutput += line + '\n';
        });
        setOutput(regularOutput.trim());
        if (stderr_stream.trim()) {
            setError(prev => (prev ? prev + '\n' : '') + stderr_stream.trim());
        }
    };

    useEffect(() => {
        if (plotlySpec && plotlyRef.current && (window as any).Plotly) {
            try {
                const spec = JSON.parse(plotlySpec);
                (window as any).Plotly.newPlot(plotlyRef.current, spec.data, spec.layout || {}, { responsive: true });
            } catch (e) {
                console.error("Failed to render Plotly chart:", e);
                setError(prev => prev + "\nFailed to render interactive chart.");
            }
        }
    }, [plotlySpec]);

    const isRunning = status === 'loading-env' || status === 'executing';
    const hasOutput = output || error || imageBase64 || plotlySpec || files.length > 0;

    return (
        <div className="border rounded-xl border-default overflow-hidden bg-card">
            <div className="flex items-center justify-between px-4 py-2 bg-token-surface-secondary/50 border-b border-default">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-sm text-foreground truncate">{title}</span>
                    <span className="text-muted-foreground text-sm">· {lang}</span>
                </div>
                <button
                    onClick={handleRunCode}
                    disabled={isRunning}
                    className="flex items-center justify-center text-sm font-medium px-4 h-9 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 shadow-sm transition-colors"
                >
                    {isRunning ? 'Running...' : 'Run code'}
                </button>
            </div>
            
            <div className="p-4 bg-background overflow-x-auto text-sm">
                <pre><code className={`language-${lang} hljs`} dangerouslySetInnerHTML={{ __html: highlightedCode }} /></pre>
            </div>

            {status !== 'idle' && hasOutput && (
                <div className="p-4 border-t border-default bg-token-surface space-y-4">
                    {imageBase64 && (
                        <div className="p-2 bg-white rounded-md border border-border-primary flex justify-center max-h-[500px] overflow-auto">
                            <img src={`data:image/png;base64,${imageBase64}`} alt="Generated plot or image" className="max-w-full h-auto" />
                        </div>
                    )}
                    {plotlySpec && <div ref={plotlyRef} className="p-2 bg-white rounded-md border border-border-primary"></div>}
                    {output && <pre className="text-sm text-text-primary whitespace-pre-wrap font-mono bg-bg-inset p-3 rounded-md">{output}</pre>}
                    {error && <pre className="text-sm error-text whitespace-pre-wrap font-mono bg-red-500/10 p-3 rounded-md">{error}</pre>}
                    {files.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold mb-2 text-text-secondary uppercase">Downloads</h4>
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                                {files.map(file => (
                                    <button
                                        key={file.name} onClick={() => handleDownload(file.name, file.content)}
                                        className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                                        title={`Download ${file.name}`}
                                    >
                                        <DownloadIcon className="size-4 flex-shrink-0" />
                                        <span className="truncate">{file.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
