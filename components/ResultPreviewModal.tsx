
import React, { useEffect, useRef } from 'react';
import { XIcon } from './icons';

interface ResultPreviewModalProps {
  imageBase64: string | null;
  plotlySpec: any | null;
  onClose: () => void;
}

const ResultPreviewModal: React.FC<ResultPreviewModalProps> = ({ imageBase64, plotlySpec, onClose }) => {
  const plotlyContainerRef = useRef<HTMLDivElement>(null);

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
    if (plotlySpec && plotlyContainerRef.current) {
      (window as any).Plotly.newPlot(
        plotlyContainerRef.current,
        plotlySpec.data,
        plotlySpec.layout,
        { responsive: true }
      );
    }
  }, [plotlySpec]);

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
          {imageBase64 && (
            <img src={`data:image/png;base64,${imageBase64}`} alt="Generated plot preview" className="max-w-full max-h-full object-contain" />
          )}
          {plotlySpec && (
            <div ref={plotlyContainerRef} className="w-full h-full"></div>
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