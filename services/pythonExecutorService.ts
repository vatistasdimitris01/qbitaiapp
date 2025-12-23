
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
 * This is called automatically on service load and after termination.
 */
const initialize = () => {
    // Hidden environments log as requested
    console.groupCollapsed("%c qbit environments ", "color: gray; font-style: italic; font-weight: bold; border: 1px solid gray; border-radius: 4px;");
    console.log("Initializing Pyodide Worker...");
    
    worker = new Worker('/python.worker.js');
    readyPromise = new Promise((resolve, reject) => {
        const readyListener = (event: MessageEvent) => {
            if (event.data.type === 'ready') {
                worker?.removeEventListener('message', readyListener);
                
                // Add the persistent listener for all subsequent execution messages
                worker?.addEventListener('message', (event: MessageEvent) => {
                    if (executionCallback) {
                        executionCallback(event.data as PythonExecutorUpdate);
                    }
                });
                
                console.log("Environment Ready.");
                console.groupEnd();
                resolve();
            }
        };
        worker.addEventListener('message', readyListener);
        worker.onerror = (e) => {
            console.error("Pyodide Environment Error:", e);
            console.groupEnd();
            reject(e);
        };
    });
};

// Initialize the worker as soon as the module is loaded in the browser.
if (typeof window !== 'undefined' && !worker) {
    initialize();
}

/**
 * Returns a promise that resolves when the Python environment is ready.
 */
export const pythonExecutorReady = () => readyPromise!;

/**
 * Sends Python code to the worker for execution.
 * @param code The Python code string to execute.
 * @param callback A function to handle real-time updates from the execution.
 */
export const runPythonCode = async (code: string, callback: UpdateCallback): Promise<void> => {
    if (!worker || !readyPromise) {
        // This should not happen in normal operation but acts as a safeguard.
        initialize();
    }

    try {
        // Wait for the environment to be ready. This is important if it's re-initializing.
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
        // Clean up when the execution is finished.
        if (update.type === 'success' || update.type === 'error') {
            isExecuting = false;
            executionCallback = null;
        }
    };
    worker!.postMessage({ code });
};

/**
 * Stops the current Python execution by terminating the worker.
 * A new worker is initialized automatically for future use.
 */
export const stopPythonExecution = () => {
    if (!worker) return;

    worker.terminate();
    
    if (executionCallback) {
        // Manually send a stop message since the worker is gone.
        executionCallback({ type: 'error', error: 'Execution stopped by user.' });
    }

    // Reset state and re-initialize.
    isExecuting = false;
    executionCallback = null;
    worker = null;
    readyPromise = null;
    
    initialize();
};
