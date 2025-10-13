

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

                // FIX: The loadPyodide function in v0.26.1 and later does not accept an indexURL argument.
                // The URL is determined automatically from where pyodide.js is loaded.
                const pyodide = await window.loadPyodide();
                await pyodide.loadPackage(['numpy', 'matplotlib', 'pandas', 'scikit-learn', 'sympy', 'pillow', 'beautifulsoup4', 'scipy', 'opencv-python', 'requests']);
                await pyodide.loadPackage('micropip');
                const micropip = pyodide.pyimport('micropip');
                await micropip.install(['plotly', 'fpdf2', 'seaborn', 'openpyxl', 'python-docx']);
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