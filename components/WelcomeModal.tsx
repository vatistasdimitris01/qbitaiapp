
import React, { useState } from 'react';
import { XIcon, MapPinIcon, LayoutGridIcon, ChevronRightIcon } from './icons';
import { LocationInfo } from '../types';

interface WelcomeModalProps {
  onComplete: () => void;
  onLocationUpdate: (loc: LocationInfo, lang?: string) => void;
  t: (key: string) => string;
}

const countryToLang: Record<string, string> = {
  GR: 'el', ES: 'es', MX: 'es', AR: 'es', CO: 'es', FR: 'fr', CA: 'fr', DE: 'de', AT: 'de',
};

const WelcomeModal: React.FC<WelcomeModalProps> = ({ onComplete, onLocationUpdate, t }) => {
  const [step, setStep] = useState(0);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');

  const handleLocationRequest = () => {
    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          const address = data?.address;
          if (address) {
            const city = address.city || address.town || address.village || address.suburb || 'Unknown City';
            const country = address.country || 'Unknown Country';
            const countryCode = address.country_code?.toUpperCase();
            onLocationUpdate({ city, country, latitude, longitude }, countryCode ? countryToLang[countryCode] : undefined);
          }
          setLocationStatus('granted');
        } catch (e) {
          onLocationUpdate({ city: 'Unknown City', country: 'Unknown Country', latitude, longitude });
          setLocationStatus('granted');
        }
      },
      () => setLocationStatus('denied')
    );
  };

  const steps = [
    {
      title: t('welcome.steps.intro.title'),
      content: (
        <div className="space-y-6">
          <div className="relative w-32 h-32 mx-auto">
            <img src="https://i.ibb.co/21xXp9Tn/it-removebg-preview.png" alt="Qbit" className="w-full h-full object-contain hidden dark:block" />
            <img src="https://i.ibb.co/m1hPNDs/it-1-removebg-preview.png" alt="Qbit" className="w-full h-full object-contain dark:hidden" />
          </div>
          <p className="text-foreground leading-relaxed text-center text-lg px-4 italic">
            {t('welcome.steps.intro.story')}
          </p>
        </div>
      )
    },
    {
      title: t('welcome.steps.features.title'),
      content: (
        <div className="space-y-8 py-4">
          <div className="grid grid-cols-1 gap-6 px-4">
            <div className="flex items-start gap-4">
              <div className="size-10 rounded-full bg-accent-blue/10 flex items-center justify-center shrink-0">
                <LayoutGridIcon className="size-5 text-accent-blue" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Interactive Interface</h4>
                <p className="text-sm text-muted-foreground">{t('welcome.steps.features.description')}</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="size-10 rounded-full bg-accent-blue/10 flex items-center justify-center shrink-0 text-accent-blue">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Local Code Runtime</h4>
                <p className="text-sm text-muted-foreground">Run Python and HTML directly in your browser with high performance.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      title: t('welcome.steps.location.title'),
      content: (
        <div className="space-y-6 px-4 text-center">
          <div className="size-16 rounded-full bg-accent-blue/10 flex items-center justify-center mx-auto mb-4">
            <MapPinIcon className="size-8 text-accent-blue" />
          </div>
          <p className="text-foreground leading-relaxed">
            {t('welcome.steps.location.description')}
          </p>
          <div className="pt-4">
            {locationStatus === 'granted' ? (
              <div className="flex items-center justify-center gap-2 text-green-500 font-medium animate-fade-in-up">
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                Location Access Granted
              </div>
            ) : locationStatus === 'denied' ? (
              <p className="text-sm text-red-500">{t('welcome.steps.location.denied')}</p>
            ) : (
              <button
                onClick={handleLocationRequest}
                disabled={locationStatus === 'requesting'}
                className="w-full py-4 bg-accent-blue text-white rounded-xl font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                {locationStatus === 'requesting' ? 'Requesting...' : t('welcome.steps.location.allow')}
              </button>
            )}
          </div>
        </div>
      )
    }
  ];

  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-card w-full max-w-2xl overflow-hidden rounded-[2.5rem] border border-default shadow-2xl animate-fade-in-up flex flex-col min-h-[500px]">
        <header className="p-8 pb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-foreground">{steps[step].title}</h2>
          <button onClick={onComplete} className="text-sm text-muted-foreground hover:text-foreground font-medium underline">
            {t('welcome.skip')}
          </button>
        </header>

        <main className="flex-1 p-8 pt-2 overflow-y-auto">
          {steps[step].content}
        </main>

        <footer className="p-8 border-t border-default/50 flex items-center justify-between">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div key={i} className={`h-1.5 rounded-full transition-all ${step === i ? 'w-8 bg-accent-blue' : 'w-1.5 bg-default'}`} />
            ))}
          </div>
          <div className="flex gap-4">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-6 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('welcome.back')}
              </button>
            )}
            <button
              onClick={() => isLast ? onComplete() : setStep(step + 1)}
              className="px-8 py-2.5 bg-foreground text-background rounded-full font-bold hover:opacity-90 transition-all flex items-center gap-2"
            >
              {isLast ? t('welcome.getStarted') : t('welcome.next')}
              {!isLast && <ChevronRightIcon className="size-4" />}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default WelcomeModal;
