
export type PythonExecutorUpdate = {
    type: 'stdout' | 'stderr' | 'plot' | 'download' | 'success' | 'error';
    data?: any;
    plotType?: string;
    error?: string;
    filename?: string;
    mimetype?: string;
};

type UpdateCallback = (update: PythonExecutorUpdate) => void;

let pythonWorker: Worker | null = null;
let pythonReadyPromise: Promise<void> | null = null;
let pythonExecutionCallback: UpdateCallback | null = null;
let isPythonExecuting = false;

const initializePythonWorker = () => {
    pythonWorker = new Worker('/python.worker.js');
    pythonReadyPromise = new Promise((resolve, reject) => {
        const readyListener = (event: MessageEvent) => {
            if (event.data.type === 'ready') {
                pythonWorker?.removeEventListener('message', readyListener);
                pythonWorker?.addEventListener('message', (event: MessageEvent) => {
                    if (pythonExecutionCallback) {
                        pythonExecutionCallback(event.data as PythonExecutorUpdate);
                    }
                });
                resolve();
            }
        };
        pythonWorker.addEventListener('message', readyListener);
        pythonWorker.onerror = (e) => reject(e);
    });
};

if (typeof window !== 'undefined' && !pythonWorker) { initializePythonWorker(); }

export const runPythonCode = async (code: string, callback: UpdateCallback): Promise<void> => {
    if (!pythonWorker || !pythonReadyPromise) { initializePythonWorker(); }
    try { await pythonReadyPromise; } catch (e) { callback({ type: 'error', error: 'Python environment failed to load.' }); return; }
    if (isPythonExecuting) { callback({ type: 'error', error: 'Another execution is already in progress.' }); return; }
    isPythonExecuting = true;
    pythonExecutionCallback = (update) => {
        callback(update);
        if (update.type === 'success' || update.type === 'error') {
            isPythonExecuting = false;
            pythonExecutionCallback = null;
        }
    };
    pythonWorker!.postMessage({ code });
};

export const stopPythonExecution = () => {
    if (!pythonWorker) return;
    pythonWorker.terminate();
    if (pythonExecutionCallback) { pythonExecutionCallback({ type: 'error', error: 'Execution stopped by user.' }); }
    isPythonExecuting = false;
    pythonExecutionCallback = null;
    pythonWorker = null;
    pythonReadyPromise = null;
    initializePythonWorker();
};
