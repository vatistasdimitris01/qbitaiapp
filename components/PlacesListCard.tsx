import React from 'react';
import type { MapsGroundingChunk } from '../types';
import { MapPinIcon, ArrowRightIcon } from './icons';

interface PlacesListCardProps {
    chunks: MapsGroundingChunk[];
    t: (key: string, params?: Record<string, string>) => string;
}

const PlacesListCard: React.FC<PlacesListCardProps> = ({ chunks, t }) => {
    if (!chunks || chunks.length === 0) {
        return null;
    }
    
    const locationCount = chunks.length;

    return (
        <div className="not-prose my-4 bg-card border border-default rounded-xl overflow-hidden max-w-sm animate-fade-in-up">
            <div className="p-4">
                <div className="flex items-center gap-2 text-foreground">
                    <MapPinIcon className="size-5" />
                    <h4 className="font-semibold">{t('mapsCard.title')}</h4>
                </div>
                <p className="text-sm text-muted-foreground mt-1 mb-4">{t('mapsCard.placesFound', { count: locationCount.toString() })}</p>
                <ul className="space-y-3">
                    {chunks.map((chunk) => (
                        <li key={chunk.maps.uri}>
                            <a 
                                href={chunk.maps.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-between p-3 rounded-lg bg-token-surface-secondary hover:bg-border transition-colors group"
                            >
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm text-token-primary truncate pr-2">{chunk.maps.title}</p>
                                     {chunk.maps.placeAnswerSources?.[0]?.reviewSnippets?.[0] && (
                                     <blockquote className="mt-1.5 text-xs text-muted-foreground border-l-2 border-default pl-2 italic truncate">
                                        "{chunk.maps.placeAnswerSources[0].reviewSnippets[0].quote}"
                                     </blockquote>
                                )}
                                </div>
                                <ArrowRightIcon className="size-4 text-token-secondary group-hover:translate-x-1 transition-transform flex-shrink-0" />
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default PlacesListCard;