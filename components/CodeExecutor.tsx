import React, { useState, useEffect, useRef } from 'react';
import type { PreviewContent } from '../types';

declare global {
    interface Window { 
        loadPyodide: (config: { indexURL: string }) => Promise<any>;
        Plotly: any;
    }
}

const ExpandIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
      <path fillRule="evenodd" d="M5.828 10.172a.5.5 0 0 0-.707 0l-4.096 4.096V11.5a.5.5 0 0 0-1 0v3.975a.5.5 0 0 0 .5.5H4.5a.5.5 0 0 0 0-1H1.732l4.096-4.096a.5.5 0 0 0 0-.707zm4.344-4.344a.5.5 0 0 0 0 .707l4.096 4.096H11.5a.5.5 0 0 0 0 1h3.975a.5.5 0 0 0 .5-.5V11.5a.5.5 0 0 0-1 0v2.768l-4.096-4.096a.5.5 0 0 0-.707 0z"/>
    </svg>
);


const LoadingSpinner = () => (
    <svg className="animate-spin h-4 w-4 text-[var(--text-primary)]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);


interface CodeExecutorProps {
  code: string;
  onPreview: (content: PreviewContent) => void;
}

type ExecutionStatus = 'loading' | 'executing' | 'success' | 'error';

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

export const CodeExecutor: React.FC<CodeExecutorProps> = ({ code, onPreview }) => {
  const pyodideRef = useRef<any>(null);
  const plotlyRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<ExecutionStatus>('loading');
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [plotlySpec, setPlotlySpec] = useState<string | null>(null);
  const [isCodeVisible, setIsCodeVisible] = useState(false);

  useEffect(() => {
    const runCode = async () => {
      if (!code || (pyodideRef.current && status !== 'loading')) return;

      let pyodide = pyodideRef.current;
      
      try {
        if (!pyodide) {
            pyodide = await window.loadPyodide({
              indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/"
            });
            await pyodide.loadPackage(['numpy', 'matplotlib', 'pandas', 'scikit-learn', 'sympy', 'pillow', 'beautifulsoup4', 'scipy', 'opencv-python']);
            await pyodide.loadPackage('micropip');
            const micropip = pyodide.pyimport('micropip');
            await micropip.install(['plotly', 'fpdf2']);
            pyodideRef.current = pyodide;
        }

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

# Monkey-patch for Plotly slider step issue where model uses 'args2' instead of 'args'
try:
    original_step_init = slider.Step.__init__
    def patched_step_init(self, arg=None, **kwargs):
        if arg and isinstance(arg, dict) and 'args2' in arg:
            arg['args'] = arg.pop('args2')
        if 'args2' in kwargs:
            kwargs['args'] = kwargs.pop('args2')
        original_step_init(self, arg, **kwargs)
    slider.Step.__init__ = patched_step_init
except Exception as e:
    print(f"Qbit patch error: Failed to patch Plotly Step: {e}")


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
        
        if (result !== undefined) {
          stdout_stream += pyodide.repr(result);
        }

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
                const [_, filename, mimetype, base64_data] = line.split(':', 4);
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
        console.error("Pyodide execution failed:", err);
        setError(`Execution failed: ${err.message || "An unknown error occurred."}`);
        setStatus('error');
      } finally {
        if (pyodideRef.current) {
            pyodideRef.current.setStdout({});
            pyodideRef.current.setStderr({});
        }
      }
    };
    runCode();
  }, [code]);

  useEffect(() => {
    if (plotlySpec && plotlyRef.current) {
        try {
            const spec = JSON.parse(plotlySpec);
            if (window.Plotly) {
                window.Plotly.newPlot(plotlyRef.current, spec.data, spec.layout || {});
            }
        } catch (e) {
            console.error("Failed to render Plotly chart:", e);
            setError("Failed to render interactive chart.");
        }
    }
  }, [plotlySpec]);

  
  const getStatusText = () => {
      switch(status) {
          case 'loading': return 'Loading Environment...';
          case 'executing': return 'Executing...';
          case 'success': return 'Done';
          case 'error': return 'Error';
      }
  }

  const hasVisualResult = !!imageBase64 || !!plotlySpec;

  return (
    <div className="bg-[var(--bg-secondary)] my-2 rounded-lg overflow-hidden border border-[var(--border-primary)] shadow-lg">
      <div className="flex justify-between items-center px-4 py-2 bg-[var(--bg-tertiary)] text-xs text-[var(--text-tertiary)]">
        <span className="font-semibold text-[var(--text-secondary)]">Python</span>
        <div className="flex items-center gap-4">
            <span className="text-sm italic flex items-center gap-2">
                {(status === 'loading' || status === 'executing') && <LoadingSpinner />}
                {getStatusText()}
            </span>
             {hasVisualResult && status === 'success' && (
                <button 
                    onClick={() => {
                        if (imageBase64) onPreview({ type: 'image', data: imageBase64 });
                        else if (plotlySpec) onPreview({ type: 'plotly', data: plotlySpec });
                    }}
                    className="action-btn flex items-center gap-2 text-sm text-[var(--text-tertiary)] px-2 py-1 rounded-md"
                    aria-label="Expand result preview"
                >
                    <ExpandIcon />
                    <span className="hidden sm:inline">&lt;|&gt;</span>
                </button>
            )}
            <button 
                onClick={() => setIsCodeVisible(!isCodeVisible)}
                className="action-btn flex items-center gap-2 text-sm text-[var(--text-tertiary)] px-2 py-1 rounded-md"
                aria-label={isCodeVisible ? "Hide code" : "Show code"}
            >
                &lt;/&gt;
            </button>
        </div>
      </div>
      <div className={`code-container ${!isCodeVisible ? 'collapsed' : ''}`}>
        <div>
            <pre className="p-4 overflow-x-auto text-sm bg-[var(--bg-inset)]">
              <code className="bg-transparent p-0">{code}</code>
            </pre>
        </div>
      </div>
      {(output || error || imageBase64 || plotlySpec) && (
          <div className="px-4 py-2 border-t border-[var(--border-primary)]">
            <h4 className="text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Result</h4>
            {imageBase64 && (
                <div className="p-2 bg-[var(--bg-primary)] rounded-md flex justify-center my-2 max-h-96 overflow-auto">
                    <img src={`data:image/png;base64,${imageBase64}`} alt="Generated plot or image" />
                </div>
            )}
            {plotlySpec && (
                <div ref={plotlyRef} className="p-2 bg-white rounded-md my-2"></div>
            )}
            {output && <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{output}</pre>}
            {error && <pre className="text-sm error-text whitespace-pre-wrap">{error}</pre>}
          </div>
      )}
    </div>
  );
};
