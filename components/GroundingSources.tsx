import React, { useState } from 'react';
import { GroundingChunk, MapsPlaceReviewSnippet } from '../types';
import { MapPinIcon, XIcon } from './icons';

const getDomain = (url: string): string => {
    if (!url) return 'source';
    try {
        const hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '');
    } catch (e) {
        return 'source';
    }
};

const getHostname = (url: string): string => {
    if (!url) return 'google.com';
    try {
        return new URL(url).hostname;
    } catch (e) {
        return 'google.com';
    }
};

interface GroundingSourcesProps {
    chunks: GroundingChunk[];
    t: (key: string) => string;
}

const GroundingSources: React.FC<GroundingSourcesProps> = ({ chunks, t }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (!chunks || chunks.length === 0) {
        return null;
    }

    const visibleChunks = chunks.slice(0, 3);
    const hiddenCount = chunks.length - visibleChunks.length;

    const SourceList = () => (
        <ul className="divide-y divide-default">
            {chunks.map((chunk, index) => {
                if ('web' in chunk && chunk.web.uri) {
                    const isRedirect = chunk.web.uri.includes('vertexaisearch.cloud.google.com');
                    const hostname = isRedirect ? 'google.com' : getHostname(chunk.web.uri);
                    const faviconUrl = `https://www.google.com/s2/favicons?sz=16&domain_url=${hostname}`;

                    return (
                        <li key={index}>
                            <a
                                href={chunk.web.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block p-3 rounded-md hover:bg-token-surface-secondary"
                            >
                                <div className="flex items-start gap-3">
                                    <img
                                        src={faviconUrl}
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
                                </div>
                            </a>
                        </li>
                    );
                }
                if ('maps' in chunk && chunk.maps.uri) {
                    const reviews = chunk.maps.placeAnswerSources?.[0]?.reviewSnippets || [];
                    return (
                        <li key={index}>
                            <div className="p-3 rounded-md hover:bg-token-surface-secondary">
                                <a
                                    href={chunk.maps.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-3"
                                >
                                    <div className="flex items-center justify-center size-4 rounded bg-blue-100 dark:bg-blue-900/50 mt-0.5 flex-shrink-0">
                                        <MapPinIcon className="size-3 text-blue-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{chunk.maps.title}</p>
                                        <p className="text-xs text-muted-foreground truncate">Google Maps</p>
                                    </div>
                                </a>
                                {reviews.length > 0 && (
                                    <div className="mt-2 pl-7 space-y-2">
                                        {reviews.map((review: MapsPlaceReviewSnippet, rIndex: number) => (
                                            <blockquote key={rIndex} className="text-xs border-l-2 border-default pl-2 italic text-muted-foreground">
                                                <a href={review.uri} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                                    "{review.quote}" – {review.author}
                                                </a>
                                            </blockquote>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </li>
                    );
                }
                return null;
            })}
        </ul>
    );

    return (
        <>
            <button
                type="button"
                className="relative flex items-center"
                onClick={() => setIsModalOpen(true)}
                aria-label={t('chat.message.grounding')}
            >
                <div className="flex items-center -space-x-2 cursor-pointer">
                    {visibleChunks.map((chunk, index) => {
                         if ('web' in chunk && chunk.web.uri) {
                            const isRedirect = chunk.web.uri.includes('vertexaisearch.cloud.google.com');
                            const hostname = isRedirect ? 'google.com' : getHostname(chunk.web.uri);
                            const faviconUrl = `https://www.google.com/s2/favicons?sz=24&domain_url=${hostname}`;

                            return (
                               <img
                                   key={index}
                                   src={faviconUrl}
                                   alt={getDomain(chunk.web.uri)}
                                   title={chunk.web.title}
                                   className="size-5 rounded-full bg-token-surface-secondary ring-2 ring-background"
                                   onError={(e) => {
                                       (e.target as HTMLImageElement).src = 'https://www.google.com/s2/favicons?sz=24&domain_url=google.com';
                                   }}
                               />
                           );
                       }
                       if ('maps' in chunk && chunk.maps.uri) {
                           return (
                               <div key={index} title={chunk.maps.title} className="size-5 rounded-full bg-blue-100 dark:bg-blue-900/50 ring-2 ring-background flex items-center justify-center">
                                   <MapPinIcon className="size-3 text-blue-500" />
                               </div>
                           );
                       }
                       return null;
                    })}
                </div>
                {hiddenCount > 0 && (
                    <div className="ml-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-token-surface-secondary text-xs font-medium text-muted-foreground ring-2 ring-background cursor-pointer">
                        +{hiddenCount}
                    </div>
                )}
            </button>

            {isModalOpen && (
                <div 
                    className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in-up" 
                    onClick={() => setIsModalOpen(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="sources-modal-title"
                >
                    <div 
                        className="bg-card rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden border border-default" 
                        onClick={e => e.stopPropagation()}
                    >
                        <header className="flex items-center justify-between py-2.5 pl-4 pr-2 border-b border-default flex-shrink-0">
                            <h3 id="sources-modal-title" className="text-base font-semibold text-foreground">{t('chat.message.grounding')}</h3>
                            <button 
                                onClick={() => setIsModalOpen(false)} 
                                className="p-2 rounded-full hover:bg-token-surface-secondary"
                                aria-label="Close sources"
                            >
                                <XIcon className="size-5 text-muted-foreground" />
                            </button>
                        </header>
                        <div className="flex-1 overflow-y-auto p-2">
                            <SourceList />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default GroundingSources;