import React, { useEffect, useRef } from 'react';
import { XIcon } from './icons';
import { PreviewContent } from '../types';

interface ResultPreviewModalProps {
  content: PreviewContent;
  onClose: () => void;
}

const ResultPreviewModal: React.FC<ResultPreviewModalProps> = ({ content, onClose }) => {
  const plotlyContainerRef = useRef<HTMLDivElement>(null);
  const isImage = content.type === 'image';
  const isPlotly = content.type === 'plotly';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (isPlotly && plotlyContainerRef.current) {
      try {
        const spec = JSON.parse(content.data);
        if ((window as any).Plotly) {
            (window as any).Plotly.newPlot(
              plotlyContainerRef.current,
              spec.data,
              spec.layout || {},
              { responsive: true }
            );
        }
      } catch (e) {
        console.error("Failed to render Plotly chart in modal:", e);
      }
    }
  }, [isPlotly, content.data]);

  return (
    <div 
        className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
        onClick={onClose}
        aria-modal="true"
        role="dialog"
    >
      <div 
        className="bg-token-surface rounded-lg shadow-2xl w-full max-w-4xl h-full max-h-[90vh] flex flex-col overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex-1 p-6 flex items-center justify-center overflow-auto">
          {isImage && (
            <img src={`data:image/png;base64,${content.data}`} alt="Generated plot preview" className="max-w-full max-h-full object-contain" />
          )}
          {isPlotly && (
            <div ref={plotlyContainerRef} className="w-full h-full bg-white rounded-md"></div>
          )}
        </div>
        <button 
            onClick={onClose} 
            className="absolute top-2 right-2 p-2 rounded-full bg-token-surface-secondary/50 hover:bg-token-surface-secondary text-token-secondary"
            aria-label="Close preview"
        >
            <XIcon className="size-5" />
        </button>
      </div>
    </div>
  );
};

export default ResultPreviewModal;
