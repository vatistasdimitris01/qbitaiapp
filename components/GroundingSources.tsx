import React, { useState } from 'react';
import { GroundingChunk, MapsPlaceReviewSnippet } from '../types';
import { MapPinIcon, XIcon, SearchIcon } from './icons';

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

const getOrigin = (url: string): string => {
    if (!url) return '';
    try {
        return new URL(url).origin;
    } catch (e) {
        return '';
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
        <ul className="divide-y divide-default/50">
            {chunks.map((chunk, index) => {
                if ('web' in chunk && chunk.web.uri) {
                    const origin = getOrigin(chunk.web.uri);
                    const faviconUrl = origin ? `${origin}/favicon.ico` : '';

                    return (
                        <li key={index}>
                            <a
                                href={chunk.web.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block p-3 rounded-lg hover:bg-token-surface-secondary transition-colors"
                            >
                                <div className="flex items-start gap-3">
                                    <img
                                        src={faviconUrl}
                                        alt=""
                                        className="size-4 rounded-sm mt-0.5 opacity-80"
                                        onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            if (target.src.endsWith('/favicon.ico')) {
                                                const hostname = getHostname(chunk.web.uri);
                                                target.src = `https://www.google.com/s2/favicons?sz=16&domain_url=${hostname}`;
                                            } else {
                                                target.src = 'https://www.google.com/s2/favicons?sz=16&domain_url=google.com';
                                                target.onerror = null;
                                            }
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
                            <div className="p-3 rounded-lg hover:bg-token-surface-secondary transition-colors">
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
                className="flex items-center gap-2 group px-2 py-1 rounded-full bg-token-surface-secondary border border-transparent hover:border-default transition-all"
                onClick={() => setIsModalOpen(true)}
                aria-label={t('chat.message.grounding')}
            >
                <div className="flex items-center -space-x-1.5 cursor-pointer">
                    {visibleChunks.map((chunk, index) => {
                         if ('web' in chunk && chunk.web.uri) {
                            const origin = getOrigin(chunk.web.uri);
                            const faviconUrl = origin ? `${origin}/favicon.ico` : '';

                            return (
                               <img
                                   key={index}
                                   src={faviconUrl}
                                   alt={getDomain(chunk.web.uri)}
                                   title={chunk.web.title}
                                   className="size-4 rounded-full bg-token-surface ring-2 ring-background grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition-all"
                                   onError={(e) => {
                                        const target = e.target as HTMLImageElement;
                                        if (target.src.endsWith('/favicon.ico')) {
                                            const hostname = getHostname(chunk.web.uri);
                                            target.src = `https://www.google.com/s2/favicons?sz=24&domain_url=${hostname}`;
                                        } else {
                                            target.src = 'https://www.google.com/s2/favicons?sz=24&domain_url=google.com';
                                            target.onerror = null;
                                        }
                                   }}
                               />
                           );
                       }
                       if ('maps' in chunk && chunk.maps.uri) {
                           return (
                               <div key={index} title={chunk.maps.title} className="size-4 rounded-full bg-blue-100 dark:bg-blue-900/50 ring-2 ring-background flex items-center justify-center">
                                   <MapPinIcon className="size-2.5 text-blue-500" />
                               </div>
                           );
                       }
                       return null;
                    })}
                </div>
                <div className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors flex items-center gap-1">
                    <span>{chunks.length} Sources</span>
                    <SearchIcon className="size-2.5 opacity-50" />
                </div>
            </button>

            {isModalOpen && (
                <div 
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in-up" 
                    onClick={() => setIsModalOpen(false)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="sources-modal-title"
                >
                    <div 
                        className="bg-card rounded-2xl shadow-xl w-full max-w-sm max-h-[70vh] flex flex-col overflow-hidden border border-default/50" 
                        onClick={e => e.stopPropagation()}
                    >
                        <header className="flex items-center justify-between py-3 pl-4 pr-3 border-b border-default/50 flex-shrink-0">
                            <h3 id="sources-modal-title" className="text-sm font-semibold text-foreground">{t('chat.message.grounding')}</h3>
                            <button 
                                onClick={() => setIsModalOpen(false)} 
                                className="p-1.5 rounded-full hover:bg-token-surface-secondary text-muted-foreground hover:text-foreground transition-colors"
                                aria-label="Close sources"
                            >
                                <XIcon className="size-4" />
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