import { useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import React, { useEffect } from 'react';

export type Marker3DProps = React.PropsWithChildren<{
    position: google.maps.LatLngAltitudeLiteral;
    onClick?: (e: Event) => void;
    color?: string;
    glyph?: string | URL;
    scale?: number;
}>;

export const Marker3D: React.FC<Marker3DProps> = ({ position, onClick, color, glyph, scale }) => {
    const map = useMap() as unknown as google.maps.maps3d.Map3DElement;
    const maps3d = useMapsLibrary('maps3d');

    useEffect(() => {
        if (!maps3d || !map) return;

        const marker = new maps3d.Marker3DInteractiveElement({
            position,
            color: color || '#4285F4',
            glyph,
            scale,
        });

        map.appendChild(marker);

        if (onClick) {
            marker.addEventListener('click', onClick);
        }

        return () => {
            if (marker.parentNode) {
                marker.parentNode.removeChild(marker);
            }
            if (onClick) {
                marker.removeEventListener('click', onClick);
            }
        };
    }, [maps3d, map, position, onClick, color, glyph, scale]);

    return null;
};
