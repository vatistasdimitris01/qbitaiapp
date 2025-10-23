import React from 'react';
import type { MapsGroundingChunk } from '../types';

interface PlacesCardProps {
    chunks: MapsGroundingChunk[];
    t: (key: string, params?: Record<string, string>) => string;
}

const PlaceItem: React.FC<{ chunk: MapsGroundingChunk; t: (key: string) => string }> = ({ chunk, t }) => {
    const { title, uri, placeAnswerSources } = chunk.maps;
    const metadata = placeAnswerSources?.[0]?.reviewSnippets?.[0]?.quote;

    return (
        <div className="flex-shrink-0 w-full sm:w-[280px] bg-card rounded-xl border border-default overflow-hidden snap-start animate-fade-in-up">
            <div className="p-4">
                <div className="flex justify-between items-start">
                    <h3 className="font-semibold text-foreground">{title}</h3>
                    {/* Rating badge would go here if data was available */}
                </div>
                {metadata && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-3 h-[60px]">{metadata}</p>
                )}
            </div>
            <div className="p-4 border-t border-default flex flex-wrap gap-2">
                <a
                    href={uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 text-sm rounded-full bg-[var(--accent-orange)] text-white font-semibold transition-opacity hover:opacity-80"
                >
                    {t('mapsCard.directions')}
                </a>
            </div>
        </div>
    );
};


const PlacesCard: React.FC<PlacesCardProps> = ({ chunks, t }) => {
    if (!chunks || chunks.length === 0) {
        return null;
    }

    // Use carousel for 3 or more items, otherwise a stacked list.
    const useCarousel = chunks.length >= 3;

    if (useCarousel) {
        return (
            <div className="not-prose my-4">
                <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory">
                    {chunks.map((chunk, index) => (
                        <PlaceItem key={chunk.maps.uri || index} chunk={chunk} t={t} />
                    ))}
                </div>
            </div>
        );
    }

    // List view for 1-2 items
    return (
        <div className="not-prose my-4 space-y-4 max-w-lg">
            {chunks.map((chunk, index) => (
                <PlaceItem key={chunk.maps.uri || index} chunk={chunk} t={t} />
            ))}
        </div>
    );
};

export default PlacesCard;
