import React from 'react';
import type { Citation } from '../types';

interface InlineCitationProps {
  citation: Citation;
}

const InlineCitation: React.FC<InlineCitationProps> = ({ citation }) => {
  const sources = citation.sources;

  // Don't render if there are no sources.
  if (!sources || sources.length === 0) {
    return null;
  }

  // Per the request for a simpler "pill", this component links to the first available source.
  const firstSource = sources[0];

  return (
    <a 
      href={firstSource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center w-4 h-4 text-[10px] font-bold text-sidebar-active-fg bg-sidebar-active border border-sidebar rounded-full no-underline transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-background align-baseline mx-0.5 translate-y-[-1.5px]"
      title={firstSource.title}
    >
      {citation.number}
    </a>
  );
};

export default InlineCitation;