import React, { useState } from 'react';
import { GroundingChunk, WebGroundingChunk } from '../types';

const getDomain = (url: string): string => {
    try {
        const hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '');
    } catch (e) {
        return 'source';
    }
};

interface GroundingSourcesProps {
    chunks: GroundingChunk[];
    t: (key: string) => string;
}

const GroundingSources: React.FC<GroundingSourcesProps> = ({ chunks, t }) => {
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const webChunks = chunks.filter((c): c is WebGroundingChunk => 'web' in c && !!c.web.uri);

    if (webChunks.length === 0) {
        return null;
    }

    const visibleChunks = webChunks.slice(0, 3);
    const hiddenCount = webChunks.length - visibleChunks.length;

    return (
        <div
            className="relative flex items-center"
            onMouseEnter={() => setIsPopoverOpen(true)}
            onMouseLeave={() => setIsPopoverOpen(false)}
        >
            <div className="flex items-center -space-x-2 cursor-pointer">
                {visibleChunks.map((chunk, index) => (
                    <img
                        key={index}
                        src={`https://www.google.com/s2/favicons?sz=24&domain_url=${chunk.web.uri}`}
                        alt={getDomain(chunk.web.uri)}
                        title={chunk.web.title}
                        className="size-5 rounded-full bg-token-surface-secondary ring-2 ring-background"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://www.google.com/s2/favicons?sz=24&domain_url=google.com';
                        }}
                    />
                ))}
            </div>
            {hiddenCount > 0 && (
                <div className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-token-surface-secondary text-xs font-medium text-muted-foreground ring-2 ring-background cursor-pointer">
                    +{hiddenCount}
                </div>
            )}

            {isPopoverOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-72 max-h-80 overflow-y-auto bg-card border border-default rounded-lg shadow-2xl z-10 p-1 animate-fade-in-up">
                    <h4 className="text-xs font-semibold text-muted-foreground px-2 pt-2 pb-1.5 border-b border-default">{t('chat.message.grounding')}</h4>
                    <ul className="divide-y divide-default">
                        {webChunks.map((chunk, index) => (
                            <li key={index}>
                                <a
                                    href={chunk.web.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-3 p-2 rounded-md hover:bg-token-surface-secondary"
                                >
                                    <img
                                        src={`https://www.google.com/s2/favicons?sz=16&domain_url=${chunk.web.uri}`}
                                        alt=""
                                        className="size-4 rounded mt-0.5"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = 'https://www.google.com/s2/favicons?sz=16&domain_url=google.com';
                                        }}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{chunk.web.title}</p>
                                        <p className="text-xs text-muted-foreground truncate">{getDomain(chunk.web.uri)}</p>
                                    </div>
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default GroundingSources;
