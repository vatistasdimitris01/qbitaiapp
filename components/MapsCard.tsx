
import React from 'react';
import type { MapsGroundingChunk } from '../types';
import { Maximize2Icon, MapPinIcon } from './icons';

interface MapCardProps {
    chunks: MapsGroundingChunk[];
    onShowMap: () => void;
    t: (key: string, params?: Record<string, string>) => string;
}

const MapsCard: React.FC<MapCardProps> = ({ chunks, onShowMap, t }) => {
    if (!chunks || chunks.length === 0) {
        return null;
    }

    const locationCount = chunks.length;

    return (
        <div className="not-prose my-4 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden max-w-sm w-full animate-fade-in-up p-4 text-white">
            <div className="relative w-full h-40 mb-4">
                {/* Map placeholder */}
                <div className="absolute inset-0 bg-neutral-800 rounded-lg"></div>

                {/* "Map preview" text */}
                <div className="absolute top-3 left-3 flex items-center gap-2 text-neutral-400">
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-500">
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                        <circle cx="9" cy="9" r="2"/>
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                    </svg>
                    <span className="text-sm font-medium">{t('mapsCard.mapPreview', 'Map preview')}</span>
                </div>
                
                {/* Expand Button */}
                <button onClick={onShowMap} className="absolute top-2 right-2 p-2 bg-neutral-300/90 backdrop-blur-sm rounded-full text-neutral-900 hover:bg-neutral-200 shadow-lg transition-transform hover:scale-105" aria-label={t('mapView.header')}>
                    <Maximize2Icon className="size-5" />
                </button>
            </div>

            {/* Bottom Info */}
            <div className="grid grid-cols-[auto,1fr] items-start gap-x-2">
                <MapPinIcon className="size-5 text-white mt-1" />
                <div>
                    <h4 className="font-semibold text-lg text-white">{t('mapsCard.title')}</h4>
                    <p className="text-sm text-neutral-400">{t('mapsCard.placesFound', { count: locationCount.toString() })}</p>
                </div>
            </div>
        </div>
    );
};

export default MapsCard;
