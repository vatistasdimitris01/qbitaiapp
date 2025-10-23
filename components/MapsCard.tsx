
import React from 'react';
import type { MapsGroundingChunk } from '../types';
import { ArrowRightIcon, MapPinIcon } from './icons';

interface MapsCardProps {
    chunks: MapsGroundingChunk[];
    t: (key: string, params?: Record<string, string>) => string;
}

const MapsCard: React.FC<MapsCardProps> = ({ chunks, t }) => {
    if (!chunks || chunks.length === 0) {
        return null;
    }

    return (
        <div className="not-prose my-4 bg-card border border-default rounded-xl overflow-hidden max-w-sm animate-fade-in-up">
            <div className="p-3 border-b border-default bg-token-surface-secondary/50 flex items-center gap-2">
                <MapPinIcon className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{t('mapsCard.title')}</span>
            </div>
            <div className="p-4 divide-y divide-default">
                {chunks.slice(0, 3).map((place, index) => (
                    <div key={index} className="flex flex-col items-start py-4 first:pt-0 last:pb-0">
                         <h4 className="font-semibold text-md text-foreground">{place.maps.title}</h4>
                        {place.maps.placeAnswerSources?.[0]?.reviewSnippets?.[0] && (
                             <blockquote className="mt-1 text-sm text-muted-foreground border-l-2 border-default pl-3 italic">
                                "{place.maps.placeAnswerSources[0].reviewSnippets[0].quote}"
                             </blockquote>
                        )}
                        <a href={place.maps.uri} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500 text-white rounded-lg font-semibold text-xs hover:bg-orange-600 transition-colors">
                            {t('mapsCard.directions')}
                            <ArrowRightIcon className="size-3" />
                        </a>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default MapsCard;
