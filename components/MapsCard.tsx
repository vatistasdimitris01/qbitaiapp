import React from 'react';
import type { MapsGroundingChunk } from '../types';
import { Maximize2Icon, MapPinIcon } from './icons';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface MapCardProps {
    chunks: MapsGroundingChunk[];
    onShowMap: () => void;
    t: (key: string, params?: Record<string, string>) => string;
}

const customIcon = L.icon({
  iconUrl: '/pin.svg',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

const MapsCard: React.FC<MapCardProps> = ({ chunks, onShowMap, t }) => {
    if (!chunks || chunks.length === 0) {
        return null;
    }

    const firstChunk = chunks[0];
    const center: [number, number] = [
        firstChunk.maps.latitude || 40.7128, // Default to NYC if no lat
        firstChunk.maps.longitude || -74.0060, // Default to NYC if no lon
    ];
    const locationCount = chunks.length;

    return (
        <div className="not-prose my-4 bg-card border border-default rounded-xl overflow-hidden max-w-sm animate-fade-in-up relative aspect-video">
            <MapContainer
                center={center}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                scrollWheelZoom={false}
                dragging={false}
                doubleClickZoom={false}
                touchZoom={false}
                attributionControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution="© OpenStreetMap, © CartoDB"
                />
                {chunks.map(chunk => (
                    (chunk.maps.latitude && chunk.maps.longitude) &&
                    <Marker
                        key={chunk.maps.uri}
                        position={[chunk.maps.latitude, chunk.maps.longitude]}
                        icon={customIcon}
                    />
                ))}
            </MapContainer>

            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            
            <div className="absolute top-2 right-2 z-10">
                <button onClick={onShowMap} className="p-2 bg-white/80 backdrop-blur-sm rounded-full text-gray-800 hover:bg-white shadow-lg transition-transform hover:scale-105" aria-label={t('mapView.header')}>
                    <Maximize2Icon className="size-5" />
                </button>
            </div>

            <div className="absolute bottom-0 left-0 p-4 text-white pointer-events-none">
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