import React, { useState } from 'react';
import type { Citation } from '../types';
import { ChevronDownIcon } from './icons';

interface InlineCitationProps {
  citation: Citation;
  t: (key: string) => string;
}

const InlineCitation: React.FC<InlineCitationProps> = ({ citation, t }) => {
  const [isCardVisible, setIsCardVisible] = useState(false);
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);

  const sources = citation.sources;
  if (!sources || sources.length === 0) return null;

  const currentSource = sources[currentSourceIndex];
  let hostname = 'source';
  try {
    hostname = new URL(currentSource.url).hostname;
  } catch (e) { /* invalid URL */ }

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSourceIndex(i => (i - 1 + sources.length) % sources.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSourceIndex(i => (i + 1) % sources.length);
  };


  return (
    <span 
      className="inline-block relative align-super mx-0.5"
      onMouseEnter={() => setIsCardVisible(true)}
      onMouseLeave={() => {
        setIsCardVisible(false);
        // Reset to first source when mouse leaves to ensure it starts fresh next time
        setCurrentSourceIndex(0);
      }}
      style={{ lineHeight: 1 }}
    >
      <button 
        type="button" 
        className="relative inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-sidebar-active-fg bg-sidebar-active border border-sidebar rounded-full transition-transform duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-background"
        aria-describedby={`citation-card-${citation.number}`}
      >
        {citation.number}
      </button>
      {isCardVisible && (
        <div 
          id={`citation-card-${citation.number}`}
          role="tooltip"
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-card border border-default rounded-lg shadow-xl z-10 text-left animate-fade-in-up"
          style={{ animationDuration: '200ms' }}
        >
          {sources.length > 1 && (
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-default">
              <button onClick={handlePrev} className="p-1 rounded-full text-muted-foreground hover:bg-token-surface-secondary hover:text-foreground" aria-label="Previous source">
                <ChevronDownIcon className="size-4 rotate-90" />
              </button>
              <span className="text-xs font-mono text-muted-foreground">
                {currentSourceIndex + 1} / {sources.length}
              </span>
              <button onClick={handleNext} className="p-1 rounded-full text-muted-foreground hover:bg-token-surface-secondary hover:text-foreground" aria-label="Next source">
                <ChevronDownIcon className="size-4 -rotate-90" />
              </button>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <a 
              href={currentSource.url} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-sm font-semibold text-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors break-words leading-snug"
            >
              {currentSource.title}
            </a>
            <p className="text-xs text-muted-foreground break-words truncate">
              {hostname}
            </p>
          </div>
        </div>
      )}
    </span>
  );
};

export default InlineCitation;