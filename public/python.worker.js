// This script is run in a separate thread by a Web Worker.
// It's responsible for setting up the Pyodide environment and executing Python code.

importScripts("https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js");
let pyodide = null;

// Asynchronously loads Pyodide and the required Python packages.
async function loadPyodideAndPackages() {
    // @ts-ignore
    pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/" });
    
    // Load standard scientific and data analysis packages.
    await pyodide.loadPackage(['numpy', 'matplotlib', 'pandas', 'scikit-learn', 'sympy', 'pillow', 'beautifulsoup4', 'scipy', 'opencv-python', 'requests']);
    
    // Load micropip to install packages from PyPI.
    await pyodide.loadPackage('micropip');
    const micropip = pyodide.pyimport('micropip');
    
    // Install additional packages for plotting, file generation, etc.
    await micropip.install(['plotly', 'fpdf2', 'seaborn', 'openpyxl', 'python-docx']);
    
    // Signal that the environment is ready to execute code.
    self.postMessage({ type: 'ready' });
}

// Start loading the Pyodide environment as soon as the worker is created.
const pyodideReadyPromise = loadPyodideAndPackages();

// Listen for messages from the main thread.
self.onmessage = async (event) => {
    // Wait for the Pyodide environment to be fully loaded.
    await pyodideReadyPromise;
    const { code } = event.data;

    try {
        // Set up handlers to capture stdout and stderr from the Python code.
        pyodide.setStdout({ batched: (str) => {
            const lines = str.split('\n');
            for (const line of lines) {
                if (line.trim() === '') continue;
                // Custom protocols to send structured data (plots, files) back to the main thread.
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

        // Python preamble to patch libraries for seamless integration (e.g., capturing plots and file saves).
        const preamble = `
import io, base64, json, matplotlib, warnings
import matplotlib.pyplot as plt
from PIL import Image
import plotly.graph_objects as go
import plotly.express as px
import numpy as np
warnings.filterwarnings('ignore', category=DeprecationWarning)
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
        # If a filename is provided, intercept it for download
        if name: 
            pdf_output_bytes = original_fpdf_output(self, dest='S')
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
`;
        
        // Run the preamble and the user's code.
        await pyodide.runPythonAsync(preamble + '\n' + code);
        self.postMessage({ type: 'success' });
    } catch (error) {
        // If an error occurs during execution, send it back to the main thread.
        self.postMessage({ type: 'error', error: error.message });
    }
};