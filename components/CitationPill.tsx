import React from 'react';
// FIX: Correctly import the 'CitationSource' type, which is now defined in types.ts.
import type { CitationSource } from '../types';
import { getDisplayDomain } from '../utils/url';

interface CitationPillProps {
  source: CitationSource;
}

const CitationPill: React.FC<CitationPillProps> = ({ source }) => {
  const domain = getDisplayDomain(source.url);

  return (
    <span className="inline-flex max-w-full items-center relative top-[-2px] animate-[show_150ms_ease-in] ml-1 align-baseline">
      <a
        href={source.url}
        target="_blank"
        rel="noopener noreferrer"
        title={source.title}
        className="flex h-5 items-center overflow-hidden rounded-md px-2 text-[10px] font-medium transition-colors duration-150 ease-in-out text-token-secondary bg-token-surface-secondary hover:bg-border no-underline"
      >
        <span className="max-w-[20ch] truncate">{domain}</span>
      </a>
    </span>
  );
};

export default CitationPill;