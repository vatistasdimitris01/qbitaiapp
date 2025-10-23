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

    return (
        <div className="not-prose my-4 bg-card border border-default rounded-xl overflow-hidden max-w-lg w-full animate-fade-in-up">
            <div className="p-4 border-b border-default">
                <div className="flex items-center gap-3">
                    <MapPinIcon className="size-5 text-muted-foreground" />
                    <h4 className="font-semibold text-foreground">{t('mapsCard.title')}</h4>
                </div>
            </div>
            <div className="divide-y divide-default">
                {chunks.map((chunk, index) => (
                    <div key={chunk.maps.uri || index} className="p-4">
                        <div className="flex flex-col items-start">
                            <p className="font-semibold text-foreground">{chunk.maps.title}</p>
                            
                            {chunk.maps.placeAnswerSources?.[0]?.reviewSnippets?.[0]?.quote && (
                                <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                                    {chunk.maps.placeAnswerSources[0].reviewSnippets[0].quote}
                                </p>
                            )}
                            
                            <a 
                                href={chunk.maps.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline mt-3"
                            >
                                <span>{t('mapsCard.directions')}</span>
                                <ArrowRightIcon className="size-3.5" />
                            </a>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PlacesListCard;
