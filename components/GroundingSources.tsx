import React, { useState } from 'react';
import { GroundingChunk, MapsPlaceReviewSnippet } from '../types';
import { MapPinIcon } from './icons';

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

    if (!chunks || chunks.length === 0) {
        return null;
    }

    const visibleChunks = chunks.slice(0, 3);
    const hiddenCount = chunks.length - visibleChunks.length;

    return (
        <div
            className="relative flex items-center"
            onMouseEnter={() => setIsPopoverOpen(true)}
            onMouseLeave={() => setIsPopoverOpen(false)}
        >
            <div className="flex items-center -space-x-2 cursor-pointer">
                {visibleChunks.map((chunk, index) => {
                     if ('web' in chunk && chunk.web.uri) {
                        return (
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

            {isPopoverOpen && (
                <div className="absolute bottom-full right-0 mb-2 w-72 max-h-80 overflow-y-auto bg-card border border-default rounded-lg shadow-2xl z-10 p-1 animate-fade-in-up">
                    <h4 className="text-xs font-semibold text-muted-foreground px-2 pt-2 pb-1.5 border-b border-default">{t('chat.message.grounding')}</h4>
                    <ul className="divide-y divide-default">
                        {chunks.map((chunk, index) => {
                            if ('web' in chunk && chunk.web.uri) {
                                return (
                                    <li key={index}>
                                        <a
                                            href={chunk.web.uri}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block p-2 rounded-md hover:bg-token-surface-secondary"
                                        >
                                            <div className="flex items-start gap-3">
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
                                            </div>
                                        </a>
                                    </li>
                                );
                            }
                            if ('maps' in chunk && chunk.maps.uri) {
                                const reviews = chunk.maps.placeAnswerSources?.[0]?.reviewSnippets || [];
                                return (
                                    <li key={index}>
                                        <div className="p-2 rounded-md hover:bg-token-surface-secondary">
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
                </div>
            )}
        </div>
    );
};

export default GroundingSources;
