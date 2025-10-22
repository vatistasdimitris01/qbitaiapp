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
      className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-sidebar-active-fg bg-sidebar-active border border-sidebar rounded-full no-underline transition-transform duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-background relative align-super mx-0.5"
      title={firstSource.title}
      style={{ lineHeight: 1 }}
    >
      {citation.number}
    </a>
  );
};

export default InlineCitation;
