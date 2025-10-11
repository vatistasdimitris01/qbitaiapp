import React, { useState, useEffect, useRef } from 'react';
import { PlayIcon, ChevronDownIcon, CopyIcon, Maximize2Icon } from './icons';
import ResultPreviewModal from './ResultPreviewModal';

interface CodeExecutorProps {
  code: string;
}

type ExecutionStatus = 'idle' | 'loading' | 'executing' | 'success' | 'error';

// This preamble is injected into the Python environment to intercept visual outputs.
const pythonPreamble = `
import io, base64, json
import matplotlib.pyplot as plt
from PIL import Image
import plotly
import numpy as np

class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return json.JSONEncoder.default(self, obj)

# Patch matplotlib.pyplot.show to capture plots
_original_plt_show = plt.show
def custom_plt_show(*args, **kwargs):
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    buf.seek(0)
    b64_str = base64.b64encode(buf.read()).decode('utf-8')
    print(f"__QBIT_PLOT_MATPLOTLIB__:{b64_str}")
    plt.clf() # Clear the figure to prevent subsequent plots from overlapping
_original_plt_show._is_patched = True
plt.show = custom_plt_show

# Patch PIL.Image.Image.show to capture images
_original_pil_show = Image.Image.show
def custom_pil_show(self, *args, **kwargs):
    buf = io.BytesIO()
    self.save(buf, format='PNG')
    buf.seek(0)
    b64_str = base64.b64encode(buf.read()).decode('utf-8')
    print(f"__QBIT_PLOT_PIL__:{b64_str}")
_original_pil_show._is_patched = True
Image.Image.show = custom_pil_show

# Patch plotly.graph_objects.Figure.show to capture interactive charts
_original_plotly_show = plotly.basedatatypes.BaseFigure.show
def custom_plotly_show(self, *args, **kwargs):
    fig_dict = self.to_dict()
    json_str = json.dumps(fig_dict, cls=NumpyEncoder)
    print(f"__QBIT_PLOT_PLOTLY__:{json_str}")
_original_plotly_show._is_patched = True
plotly.basedatatypes.BaseFigure.show = custom_plotly_show

print("Python environment ready.")
`;

const pyodideRef = { current: null as any };

const downloadFile = (filename: string, mimetype: string, base64Data: string) => {
    const byteCharacters = atob(base64Data);
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


const CodeExecutor: React.FC<CodeExecutorProps> = ({ code }) => {
  const [isCodeVisible, setIsCodeVisible] = useState(false);
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [output, setOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [plotlySpec, setPlotlySpec] = useState<any | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const plotlyContainerRef = useRef<HTMLDivElement>(null);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
    });
  };

  const executeCode = async () => {
    setOutput([]);
    setError(null);
    setImageBase64(null);
    setPlotlySpec(null);
    
    try {
        if (!pyodideRef.current) {
            setStatus('loading');
            (window as any).loadPyodide({
                indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.1/full/"
            }).then(async (pyodide: any) => {
                pyodideRef.current = pyodide;
                await pyodide.loadPackage(['numpy', 'pandas', 'matplotlib', 'scikit-learn', 'pillow']);
                await pyodide.runPythonAsync(pythonPreamble);
                executeCode(); // Re-run execution after loading
            }).catch((e: Error) => {
                setError(`Failed to load Python environment: ${e.message}`);
                setStatus('error');
                setIsCodeVisible(true);
            });
            return;
        }

        setStatus('executing');
        const pyodide = pyodideRef.current;
        
        // Capture stdout
        let capturedOutput: string[] = [];
        pyodide.setStdout({
            batched: (msg: string) => {
                capturedOutput.push(msg);
            }
        });
        // Capture stderr
        let capturedError = '';
        pyodide.setStderr({
            batched: (msg: string) => {
                capturedError += msg + '\n';
            }
        });

        await pyodide.runPythonAsync(code);
        
        if (capturedError) {
            setError(capturedError);
            setStatus('error');
            setIsCodeVisible(true);
        } else {
            const finalOutput: string[] = [];
            capturedOutput.forEach(line => {
                if (line.startsWith('__QBIT_PLOT_MATPLOTLIB__:')) {
                    setImageBase64(line.substring('__QBIT_PLOT_MATPLOTLIB__:'.length));
                } else if (line.startsWith('__QBIT_PLOT_PIL__:')) {
                    setImageBase64(line.substring('__QBIT_PLOT_PIL__:'.length));
                } else if (line.startsWith('__QBIT_PLOT_PLOTLY__:')) {
                    const jsonSpec = line.substring('__QBIT_PLOT_PLOTLY__:'.length);
                    try {
                        setPlotlySpec(JSON.parse(jsonSpec));
                    } catch (e) {
                         setError('Failed to parse Plotly JSON specification.');
                    }
                } else if (line.startsWith('__QBIT_DOWNLOAD_FILE__:')) {
                    const parts = line.split(':');
                    if (parts.length >= 4) {
                        const [, filename, mimetype, b64_data] = parts;
                        downloadFile(filename, mimetype, b64_data);
                        finalOutput.push(`Downloaded file: ${filename}`);
                    }
                }
                else {
                    finalOutput.push(line);
                }
            });
            setOutput(finalOutput.filter(line => line.trim() !== '' && line !== 'Python environment ready.'));
            setStatus('success');
        }

    } catch (e: any) {
        setError(e.message);
        setStatus('error');
        setIsCodeVisible(true);
    }
  };
  
  useEffect(() => {
    executeCode();
  }, [code]);

  useEffect(() => {
    if (plotlySpec && plotlyContainerRef.current) {
      (window as any).Plotly.newPlot(plotlyContainerRef.current, plotlySpec.data, plotlySpec.layout);
    }
  }, [plotlySpec]);

  const hasResult = output.length > 0 || error || imageBase64 || plotlySpec;
  const hasVisualResult = imageBase64 || plotlySpec;

  const statusMap = {
      idle: { text: "Run code", color: "text-gray-500", bg: "bg-gray-100 dark:bg-gray-800" },
      loading: { text: "Loading environment...", color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900/30" },
      executing: { text: "Executing...", color: "text-amber-500", bg: "bg-amber-100 dark:bg-amber-900/30" },
      success: { text: "Execution complete", color: "text-green-500", bg: "bg-green-100 dark:bg-green-900/30" },
      error: { text: "Execution failed", color: "text-red-500", bg: "bg-red-100 dark:bg-red-900/30" },
  };

  return (
    <div className="w-full my-4 border border-default rounded-lg bg-token-surface-secondary/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-2 pl-4 border-b border-default">
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Python Code</span>
                {status !== 'idle' && (
                  <span className={`text-xs font-mono px-2 py-0.5 rounded-md ${statusMap[status].bg} ${statusMap[status].color}`}>
                      {statusMap[status].text}
                  </span>
                )}
            </div>
            <div className="flex items-center gap-1">
                <button onClick={handleCopy} className="p-2 text-muted-foreground hover:bg-background rounded-md transition-colors" title="Copy code">
                    {isCopied ? <span className="text-xs px-1">Copied!</span> : <CopyIcon className="size-4" />}
                </button>
                <button onClick={() => setIsCodeVisible(!isCodeVisible)} className="p-2 text-muted-foreground hover:bg-background rounded-md transition-colors" title={isCodeVisible ? "Hide code" : "Show code"}>
                    <ChevronDownIcon className={`size-4 transition-transform ${isCodeVisible ? 'rotate-180' : ''}`} />
                </button>
                <button onClick={executeCode} disabled={status === 'loading' || status === 'executing'} className="flex items-center gap-1.5 p-2 pr-3 bg-background border border-default rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-wait">
                    <PlayIcon className="size-4" />
                    <span>Run</span>
                </button>
            </div>
        </div>

        {/* Code View (Collapsible) */}
        {isCodeVisible && (
            <div className="p-2 bg-background border-b border-default">
                <pre><code className="language-python text-sm">{code}</code></pre>
            </div>
        )}

        {/* Results View */}
        {hasResult && (
            <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold">Result</h4>
                    {hasVisualResult && (
                        <button onClick={() => setIsPreviewOpen(true)} className="p-1.5 text-muted-foreground hover:bg-background rounded-md transition-colors" title="Expand result">
                            <Maximize2Icon className="size-4" />
                        </button>
                    )}
                </div>
                {imageBase64 && <img src={`data:image/png;base64,${imageBase64}`} alt="Generated plot" className="max-w-full h-auto rounded-md border border-default" />}
                {plotlySpec && <div ref={plotlyContainerRef} className="w-full h-96"></div>}
                {output.length > 0 && <pre className="text-sm whitespace-pre-wrap font-mono bg-background p-2 rounded-md">{output.join('\n')}</pre>}
                {error && <pre className="text-sm whitespace-pre-wrap font-mono bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-2 rounded-md">{error}</pre>}
            </div>
        )}

        {isPreviewOpen && hasVisualResult && (
            <ResultPreviewModal
                imageBase64={imageBase64}
                plotlySpec={plotlySpec}
                onClose={() => setIsPreviewOpen(false)}
            />
        )}
    </div>
  );
};

export default CodeExecutor;