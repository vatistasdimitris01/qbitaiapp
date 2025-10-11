import React, { useState, useEffect } from 'react';
import { XIcon } from './icons';
import { LocationInfo } from '../types';

interface LocationBannerProps {
  onLocationUpdate: (locationInfo: LocationInfo, lang?: string) => void;
  t: (key: string) => string;
}

const countryToLang: Record<string, string> = {
  GR: 'el', // Greece
  ES: 'es', // Spain
  MX: 'es', // Mexico
  AR: 'es', // Argentina
  CO: 'es', // Colombia
  FR: 'fr', // France
  CA: 'fr', // Canada
  DE: 'de', // Germany
  AT: 'de', // Austria
};

const LocationBanner: React.FC<LocationBannerProps> = ({ onLocationUpdate, t }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('locationBannerDismissed') !== 'true') {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'prompt') {
          setIsVisible(true);
        } else if (result.state === 'granted') {
           navigator.geolocation.getCurrentPosition(position => {
               const { latitude, longitude } = position.coords;
               // Fetch city/country even if already granted
               fetchLocationDetails(latitude, longitude);
           });
        }
      });
    }
  }, []);

  const fetchLocationDetails = async (latitude: number, longitude: number) => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await response.json();
        const address = data?.address;
        if (address) {
            const city = address.city || address.town || address.village || address.suburb || address.county || address.state_district || address.state || 'Unknown City';
            const country = address.country || 'Unknown Country';
            const countryCode = data?.address?.country_code?.toUpperCase();
            const detectedLang = countryCode ? countryToLang[countryCode] : undefined;
            onLocationUpdate({ city, country }, detectedLang);
        } else {
            onLocationUpdate({ city: 'Unknown City', country: 'Unknown Country' });
        }
      } catch (error) {
        console.error("Error fetching location data:", error);
        onLocationUpdate({ city: 'Unknown City', country: 'Unknown Country' }); // Provide fallback
      }
  };

  const handleAllow = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        fetchLocationDetails(latitude, longitude);
        handleDismiss();
      },
      (error) => {
        console.error("Geolocation error:", error);
        handleDismiss();
      }
    );
  };

  const handleDismiss = () => {
    localStorage.setItem('locationBannerDismissed', 'true');
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="bg-token-surface-secondary text-token-text-secondary text-sm text-center p-2 flex items-center justify-center gap-4 relative">
      <p>{t('locationMessage')}</p>
      <div className="flex items-center gap-2">
        <button onClick={handleAllow} className="bg-background text-foreground font-semibold px-3 py-1 rounded-md hover:opacity-90 border border-default">
          {t('allow')}
        </button>
        <button onClick={handleDismiss} className="hover:bg-foreground/10 p-1 rounded-full">
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
};

export default LocationBanner;