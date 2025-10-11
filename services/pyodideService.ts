
let pyodidePromise: Promise<any> | null = null;

declare global {
    interface Window { 
        loadPyodide: (config: { indexURL: string }) => Promise<any>;
        Plotly: any;
    }
}

export const getPyodide = () => {
    if (!pyodidePromise) {
        pyodidePromise = new Promise(async (resolve, reject) => {
            try {
                // Wait for the pyodide script to be loaded
                while (!window.loadPyodide) {
                    await new Promise(res => setTimeout(res, 100));
                }

                const pyodide = await window.loadPyodide({
                    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/"
                });
                
                // Core packages that are pre-built for pyodide
                await pyodide.loadPackage([
                    'numpy', 
                    'matplotlib', 
                    'pandas', 
                    'scikit-learn', 
                    'sympy', 
                    'pillow', // PIL
                    'beautifulsoup4', 
                    'scipy', 
                    'opencv-python',
                    'scikit-image', // Added
                    'duckdb' // Added
                ]);
                
                await pyodide.loadPackage('micropip');
                const micropip = pyodide.pyimport('micropip');
                
                // Pure python packages or packages with wheels for pyodide
                await micropip.install([
                    'plotly', 
                    'fpdf2',
                    'seaborn', // Added
                    'openpyxl', // Added for .xlsx
                    'python-docx', // Added for .docx
                    'python-pptx', // Added for .pptx
                    'reportlab', // Added for .pdf
                    'tqdm', // Added for progress bars
                    'pyyaml', // Added for YAML
                    'nltk', // Added for NLP
                    'vaex' // Added
                ]);
                
                resolve(pyodide);
            } catch (error) {
                console.error("Pyodide loading failed:", error);
                pyodidePromise = null; // Reset promise on failure
                reject(error);
            }
        });
    }
    return pyodidePromise;
};