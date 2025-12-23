
// This service manages the singleton Web Worker for Python code execution.

export type PythonExecutorUpdate = {
    type: 'stdout' | 'stderr' | 'plot' | 'download' | 'success' | 'error';
    data?: any;
    plotType?: string;
    error?: string;
    filename?: string;
    mimetype?: string;
};

type UpdateCallback = (update: PythonExecutorUpdate) => void;

let worker: Worker | null = null;
let readyPromise: Promise<void> | null = null;
let executionCallback: UpdateCallback | null = null;
let isExecuting = false;

/**
 * Initializes the singleton worker and its ready promise.
 */
const initialize = () => {
    // Hidden environments log in gray
    console.groupCollapsed("%c qbit environments ", "color: gray; font-style: italic; font-weight: bold;");
    console.log("Spinning up execution worker...");
    
    worker = new Worker('/python.worker.js');
    readyPromise = new Promise((resolve, reject) => {
        const readyListener = (event: MessageEvent) => {
            if (event.data.type === 'ready') {
                worker?.removeEventListener('message', readyListener);
                
                worker?.addEventListener('message', (event: MessageEvent) => {
                    if (executionCallback) {
                        executionCallback(event.data as PythonExecutorUpdate);
                    }
                });
                
                console.log("Qbit Python Environment: READY");
                console.groupEnd();
                resolve();
            }
        };
        worker.addEventListener('message', readyListener);
        worker.onerror = (e) => {
            // Log env errors in red
            console.groupCollapsed("%c Qbit Error ", "background: #ef4444; color: white; font-weight: bold; border-radius: 4px;");
            console.error("Pyodide Environment Failed:", e);
            console.groupEnd();
            
            console.groupEnd(); // Close the gray group if it's still open
            reject(e);
        };
    });
};

if (typeof window !== 'undefined' && !worker) {
    initialize();
}

export const pythonExecutorReady = () => readyPromise!;

export const runPythonCode = async (code: string, callback: UpdateCallback): Promise<void> => {
    if (!worker || !readyPromise) {
        initialize();
    }

    try {
        await readyPromise;
    } catch (e) {
        callback({ type: 'error', error: 'Python environment failed to load.' });
        return;
    }

    if (isExecuting) {
        callback({ type: 'error', error: 'Another execution is already in progress.' });
        return;
    }

    isExecuting = true;
    executionCallback = (update) => {
        callback(update);
        if (update.type === 'success' || update.type === 'error') {
            isExecuting = false;
            executionCallback = null;
        }
    };
    worker!.postMessage({ code });
};

export const stopPythonExecution = () => {
    if (!worker) return;
    worker.terminate();
    if (executionCallback) {
        executionCallback({ type: 'error', error: 'Execution stopped by user.' });
    }
    isExecuting = false;
    executionCallback = null;
    worker = null;
    readyPromise = null;
    initialize();
};
