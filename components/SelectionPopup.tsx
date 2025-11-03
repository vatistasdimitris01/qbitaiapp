import React from 'react';
import { ArrowRightIcon } from './icons';

interface SelectionPopupProps {
  x: number;
  y: number;
  text: string;
  onAsk: (text: string) => void;
  t: (key: string) => string;
}

const SelectionPopup: React.FC<SelectionPopupProps> = ({ x, y, text, onAsk, t }) => {
  const handleAsk = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAsk(text);
  };

  return (
    <div
      className="fixed z-[100] selection-popup-container"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -115%)',
      }}
      // Prevent mousedown on the popup from clearing the selection before the button can be clicked
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="animate-fade-in-up">
        <button
          onClick={handleAsk}
          className="flex items-center gap-2 px-3 py-1.5 bg-card text-foreground rounded-lg shadow-2xl border border-default text-sm font-medium hover:bg-token-surface-secondary transition-colors"
        >
          <ArrowRightIcon className="size-4" />
          <span>{t('selectionPopup.ask')}</span>
        </button>
      </div>
    </div>
  );
};

export default SelectionPopup;
