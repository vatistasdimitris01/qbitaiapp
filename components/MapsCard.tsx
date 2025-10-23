
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
        <div className="not-prose my-4 bg-card border border-default rounded-xl overflow-hidden max-w-sm animate-fade-in-up relative">
            <img src="https://storage.googleapis.com/aistudio-hosting/generative-ai-studio/assets/map-preview.png" alt="Map preview" className="w-full h-48 object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            
            <div className="absolute top-2 right-2">
                <button onClick={onShowMap} className="p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-800 hover:bg-white shadow-lg transition-transform hover:scale-105" aria-label={t('mapView.header')}>
                    <Maximize2Icon className="size-5" />
                </button>
            </div>

            <div className="absolute bottom-0 left-0 p-4 text-white">
                <div className="flex items-center gap-2">
                    <MapPinIcon className="size-5" />
                    <h4 className="font-semibold text-lg">{t('mapsCard.title')}</h4>
                </div>
                <p className="text-sm mt-1">{t('mapsCard.placesFound', { count: locationCount.toString() })}</p>
            </div>
        </div>
    );
};

export default MapsCard;
