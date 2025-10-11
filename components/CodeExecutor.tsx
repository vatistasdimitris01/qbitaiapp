
import React, { useState, useEffect, useRef } from 'react';
import { getPyodide } from '../services/pyodideService';

const LoadingSpinner = () => (
    <svg className="animate-spin h-5 w-5 mr-3 text-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

// Helper to trigger download
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
}

type ExecutionStatus = 'loading-env' | 'executing' | 'success' | 'error';

export const CodeExecutor: React.FC<CodeExecutorProps> = ({ code }) => {
    const plotlyRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<ExecutionStatus>('loading-env');
    const [output, setOutput] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [imageBase64, setImageBase64] = useState<string | null>(null);
    const [plotlySpec, setPlotlySpec] = useState<string | null>(null);

    useEffect(() => {
        let isCancelled = false;
        const runCode = async () => {
            try {
                const pyodide = await getPyodide();
                if (isCancelled) return;

                setStatus('executing');

                const preamble = `
import io, base64, json, matplotlib
import matplotlib.pyplot as plt
from PIL import Image
import plotly.graph_objects as go
import numpy as np
import plotly.graph_objs.layout.slider as slider

# Custom JSON encoder to handle numpy types that Plotly's validator dislikes
class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
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
if hasattr(go, 'FigureWidget'):
    go.FigureWidget.show = custom_plotly_show
`;

                const fullCode = preamble + '\n' + code;

                let stdout_stream = '';
                let stderr_stream = '';
                pyodide.setStdout({ batched: (str: string) => stdout_stream += str + '\n' });
                pyodide.setStderr({ batched: (str: string) => stderr_stream += str + '\n' });

                const result = await pyodide.runPythonAsync(fullCode);
                if (isCancelled) return;

                if (result !== undefined) {
                    stdout_stream += pyodide.repr(result);
                }

                pyodide.setStdout({});
                pyodide.setStderr({});

                const lines = stdout_stream.split('\n');
                let regularOutput = '';

                for (const line of lines) {
                    if (line.startsWith('__QBIT_PLOT_MATPLOTLIB__:')) {
                        setImageBase64(line.replace('__QBIT_PLOT_MATPLOTLIB__:', ''));
                    } else if (line.startsWith('__QBIT_PLOT_PIL__:')) {
                        setImageBase64(line.replace('__QBIT_PLOT_PIL__:', ''));
                    } else if (line.startsWith('__QBIT_PLOT_PLOTLY__:')) {
                        setPlotlySpec(line.replace('__QBIT_PLOT_PLOTLY__:', ''));
                    } else if (line.startsWith('__QBIT_DOWNLOAD_FILE__:')) {
                        const [_, filename, mimetype, base64_data] = line.split(':');
                        if (filename && mimetype && base64_data) {
                            downloadFile(filename, mimetype, base64_data);
                            regularOutput += `Downloading ${filename}...\n`;
                        }
                    } else {
                        regularOutput += line + '\n';
                    }
                }
                setOutput(regularOutput.trim());
                if (stderr_stream) setError(stderr_stream.trim());
                setStatus('success');
            } catch (err: any) {
                if (isCancelled) return;
                console.error("Pyodide execution failed:", err);
                setError(`Execution failed: ${err.message || "An unknown error occurred."}`);
                setStatus('error');
            }
        };
        runCode();
        return () => { isCancelled = true; };
    }, [code]);

    useEffect(() => {
        if (plotlySpec && plotlyRef.current) {
            try {
                const spec = JSON.parse(plotlySpec);
                if ((window as any).Plotly) {
                    (window as any).Plotly.newPlot(plotlyRef.current, spec.data, spec.layout || {}, { responsive: true });
                }
            } catch (e) {
                console.error("Failed to render Plotly chart:", e);
                setError("Failed to render interactive chart.");
            }
        }
    }, [plotlySpec]);

    if (status === 'loading-env' || status === 'executing') {
        return (
            <div className="flex items-center text-sm text-muted-foreground bg-token-surface-secondary/50 p-3 rounded-lg">
                <LoadingSpinner />
                <span>Executing...</span>
            </div>
        );
    }
    
    return (
        <div className="space-y-2">
            {imageBase64 && (
                <div className="p-4 bg-white rounded-xl border border-default flex justify-center max-h-[500px] overflow-auto">
                    <img src={`data:image/png;base64,${imageBase64}`} alt="Generated plot or image" className="max-w-full h-auto" />
                </div>
            )}
            {plotlySpec && (
                <div ref={plotlyRef} className="p-2 bg-white rounded-xl border border-default"></div>
            )}
            {output && <pre className="text-sm text-foreground whitespace-pre-wrap bg-token-surface-secondary p-3 rounded-md">{output}</pre>}
            {error && <pre className="text-sm text-red-500 dark:text-red-400 whitespace-pre-wrap bg-red-500/10 p-3 rounded-md">{error}</pre>}
        </div>
    );
};
