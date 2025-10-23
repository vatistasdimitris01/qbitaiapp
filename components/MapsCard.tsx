import React from 'react';
import type { MapsGroundingChunk } from '../types';
import { Maximize2Icon, MapPinIcon } from './icons';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';

interface MapCardProps {
    chunks: MapsGroundingChunk[];
    onShowMap: () => void;
    t: (key: string, params?: Record<string, string>) => string;
}

const MapsCard: React.FC<MapCardProps> = ({ chunks, onShowMap, t }) => {
    if (!chunks || chunks.length === 0) {
        return null;
    }

    const firstChunk = chunks[0];
    const center = {
        lat: firstChunk.maps.latitude || 40.7128, // Default to NYC if no lat
        lng: firstChunk.maps.longitude || -74.0060, // Default to NYC if no lon
    };
    const locationCount = chunks.length;

    return (
        <div className="not-prose my-4 bg-card border border-default rounded-xl overflow-hidden max-w-sm animate-fade-in-up relative aspect-video">
            <div className="absolute inset-0">
                <APIProvider apiKey={process.env.API_KEY!}>
                    <Map
                        mapId="qbit-maps-card-preview"
                        defaultCenter={center}
                        defaultZoom={12}
                        gestureHandling={'none'}
                        disableDefaultUI={true}
                        mapTypeId={'satellite'}
                    >
                       {chunks.map(chunk => (
                           (chunk.maps.latitude && chunk.maps.longitude) &&
                           <AdvancedMarker key={chunk.maps.uri} position={{lat: chunk.maps.latitude, lng: chunk.maps.longitude}} />
                       ))}
                    </Map>
                </APIProvider>
            </div>

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
