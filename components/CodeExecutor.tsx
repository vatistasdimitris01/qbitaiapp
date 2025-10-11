import React, { useState, useEffect, useRef } from 'react';
import { getPyodide } from '../services/pyodideService';
import { DownloadIcon, PlayIcon, ChevronDownIcon } from './icons';

const LoadingSpinner = () => (
    <div className="flex items-center text-sm text-text-secondary">
        <svg className="animate-spin h-4 w-4 mr-2 text-text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

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

interface CodeExecutorProps {
    code: string;
}

type ExecutionStatus = 'idle' | 'loading-env' | 'executing' | 'success' | 'error';
interface GeneratedFile {
    name: string;
    content: Uint8Array;
}

export const CodeExecutor: React.FC<CodeExecutorProps> = ({ code }) => {
    const plotlyRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<ExecutionStatus>('idle');
    const [output, setOutput] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [imageBase64, setImageBase64] = useState<string | null>(null);
    const [plotlySpec, setPlotlySpec] = useState<string | null>(null);
    const [files, setFiles] = useState<GeneratedFile[]>([]);
    const [isCodeVisible, setIsCodeVisible] = useState(true);

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
import plotly.graph_objs.layout.slider as slider

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
            stderr_stream += String(err); // Ensure the error is captured for display
        } finally {
            // Cleanup filesystem and streams
            try {
                const filesInDir = pyodide.FS.readdir(executionDir);
                for (const file of filesInDir) {
                    if (file !== '.' && file !== '..') {
                        pyodide.FS.unlink(`${executionDir}/${file}`);
                    }
                }
                pyodide.FS.rmdir(executionDir);
            } catch(e) { /* ignore cleanup errors */ }
            
            pyodide.setStdout({});
            pyodide.setStderr({});
            pyodide.FS.chdir('/home/pyodide');
        }
        
        // Process output streams after execution and cleanup
        let regularOutput = '';
        for (const line of stdout_stream.split('\n')) {
            if (line.startsWith('__QBIT_PLOT_MATPLOTLIB__:')) setImageBase64(line.substring(25));
            else if (line.startsWith('__QBIT_PLOT_PIL__:')) setImageBase64(line.substring(18));
            else if (line.startsWith('__QBIT_PLOT_PLOTLY__:')) setPlotlySpec(line.substring(21));
            else regularOutput += line + '\n';
        }
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

    const hasOutput = output || error || imageBase64 || plotlySpec || files.length > 0;
    const isRunning = status === 'loading-env' || status === 'executing';

    return (
        <div className="bg-bg-secondary border border-border-primary rounded-lg text-sm">
            <div className="flex items-center justify-between p-2 bg-bg-tertiary rounded-t-lg border-b border-border-primary">
                <span className="text-xs font-semibold uppercase text-text-tertiary px-2">Python</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsCodeVisible(!isCodeVisible)}
                        className="p-1.5 text-text-secondary hover:text-text-primary action-btn rounded"
                        aria-label={isCodeVisible ? 'Collapse code' : 'Expand code'}
                    >
                        <ChevronDownIcon className={`size-4 transition-transform ${isCodeVisible ? '' : '-rotate-90'}`} />
                    </button>
                    <button
                        onClick={handleRunCode}
                        disabled={isRunning}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-inset text-text-secondary action-btn disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isRunning ? <LoadingSpinner /> : <PlayIcon className="size-4" />}
                        <span className="text-xs font-medium">{isRunning ? 'Running...' : 'Run'}</span>
                    </button>
                </div>
            </div>

            <div className={`code-container ${!isCodeVisible ? 'collapsed' : ''}`}>
                <div>
                     <pre className="p-4 text-sm bg-bg-inset overflow-x-auto"><code className="language-python">{code}</code></pre>
                </div>
            </div>

            {status !== 'idle' && (
                <div className="p-4 border-t border-border-primary bg-bg-primary rounded-b-lg">
                    {isRunning && (
                         <div className="flex items-center text-sm text-text-secondary p-4">
                            <LoadingSpinner />
                            <span>{status === 'loading-env' ? 'Loading environment...' : 'Executing...'}</span>
                        </div>
                    )}
                    {status !== 'executing' && !hasOutput && <p className="text-text-tertiary text-xs italic">Execution finished with no output.</p>}
                    <div className="space-y-4">
                        {imageBase64 && (
                            <div className="p-2 bg-white rounded-md border border-border-primary flex justify-center max-h-[500px] overflow-auto">
                                <img src={`data:image/png;base64,${imageBase64}`} alt="Generated plot or image" className="max-w-full h-auto" />
                            </div>
                        )}
                        {plotlySpec && <div ref={plotlyRef} className="p-2 bg-white rounded-md border border-border-primary"></div>}
                        {output && <pre className="text-sm text-text-primary whitespace-pre-wrap font-mono bg-bg-inset p-3 rounded-md">{output}</pre>}
                        {error && <pre className="text-sm error-text whitespace-pre-wrap font-mono bg-red-500/10 p-3 rounded-md">{error}</pre>}
                        {files.length > 0 && (
                            <div className="pt-2">
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
                </div>
            )}
        </div>
    );
};