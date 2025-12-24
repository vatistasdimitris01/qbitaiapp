
import React, { useState } from 'react';
import { XIcon, MapPinIcon, LayoutGridIcon, ChevronRightIcon, SearchIcon, PaperclipIcon, MicIcon, ArrowUpIcon } from './icons';
import { LocationInfo } from '../types';

interface WelcomeModalProps {
  onComplete: () => void;
  onLocationUpdate: (loc: LocationInfo, lang?: string) => void;
  t: (key: string) => string;
}

const countryToLang: Record<string, string> = {
  GR: 'el', ES: 'es', MX: 'es', AR: 'es', CO: 'es', FR: 'fr', CA: 'fr', DE: 'de', AT: 'de',
};

// Simulated UI Mockup Components
const SidebarMockup = () => (
  <div className="w-16 md:w-24 h-full border-r border-border bg-sidebar p-2 flex flex-col gap-2 shrink-0">
    <div className="size-6 bg-surface-l2 rounded-md mx-auto" />
    <div className="w-full h-3 md:h-4 bg-surface-l2 rounded" />
    <div className="w-full h-3 md:h-4 bg-surface-l2 rounded opacity-50" />
    <div className="w-full h-3 md:h-4 bg-surface-l2 rounded opacity-30" />
    <div className="mt-auto size-6 bg-surface-l2 rounded-md mx-auto" />
  </div>
);

const ChatInputMockup = () => (
  <div className="w-full max-w-xs mx-auto p-2 bg-surface-l1 rounded-full border border-border flex items-center gap-2 shadow-sm">
    <PaperclipIcon className="size-4 text-muted-foreground" />
    <div className="flex-1 h-2 bg-surface-l2 rounded-full" />
    <div className="size-6 bg-foreground rounded-full flex items-center justify-center">
        <ArrowUpIcon className="size-3 text-background" />
    </div>
  </div>
);

const WelcomeModal: React.FC<WelcomeModalProps> = ({ onComplete, onLocationUpdate, t }) => {
  const [step, setStep] = useState(0);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [activeExample, setActiveExample] = useState<string | null>(null);

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
            const city = address.city || address.town || address.municipality || address.village || address.suburb || 'Unknown City';
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
      story: t('welcome.steps.intro.story'),
      visual: (
        <div className="relative flex items-center justify-center h-full w-full group">
           <div className="absolute inset-0 bg-gradient-to-tr from-accent-blue/5 to-transparent rounded-3xl" />
           <div className="relative animate-pulse flex flex-col items-center">
                <img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP" className="w-32 h-32 md:w-64 md:h-64 object-contain hidden dark:block" />
                <img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP" className="w-32 h-32 md:w-64 md:h-64 object-contain dark:hidden" />
           </div>
           <div className="absolute bottom-4 md:bottom-10 text-[10px] md:text-xs font-mono text-muted-foreground tracking-widest uppercase opacity-50">
                {t('welcome.steps.intro.sub')}
           </div>
        </div>
      )
    },
    {
      title: t('welcome.steps.workspace.title'),
      story: t('welcome.steps.workspace.description'),
      visual: (
        <div className="flex flex-col h-full w-full bg-background rounded-2xl md:rounded-3xl border border-border overflow-hidden shadow-inner relative max-h-[400px] md:max-h-full">
           <div className="flex h-full">
                <SidebarMockup />
                <div className="flex-1 flex flex-col p-4 gap-4">
                    <div className="w-3/4 h-8 bg-surface-l1 border border-border rounded-xl self-end animate-fade-in-up" />
                    <div className="w-full h-24 bg-surface-l2 rounded-2xl animate-fade-in-up delay-100" />
                    <div className="mt-auto">
                        <ChatInputMockup />
                    </div>
                </div>
           </div>
           {/* Callouts */}
           <div className="absolute top-10 left-24 md:left-32 bg-card border border-border p-2 rounded-lg shadow-xl text-[10px] animate-fade-in-up z-20">
                <span className="font-bold block">{t('welcome.steps.workspace.sidebar')}</span>
                <span className="text-muted-foreground hidden md:inline">{t('welcome.steps.workspace.sidebar_desc')}</span>
           </div>
           <div className="absolute bottom-16 md:bottom-20 left-6 md:left-10 bg-card border border-border p-2 rounded-lg shadow-xl text-[10px] animate-fade-in-up z-20">
                <span className="font-bold block">{t('welcome.steps.workspace.input')}</span>
                <span className="text-muted-foreground hidden md:inline">{t('welcome.steps.workspace.input_desc')}</span>
           </div>
        </div>
      )
    },
    {
      title: t('welcome.steps.features.title'),
      story: t('welcome.steps.features.description'),
      visual: (
        <div className="flex flex-col h-full w-full bg-surface-base rounded-2xl md:rounded-3xl border border-border p-4 md:p-6 gap-4 overflow-hidden shadow-inner max-h-[400px] md:max-h-full">
           <div className="flex flex-wrap gap-2 justify-center md:justify-start">
              <button 
                onClick={() => setActiveExample('stock')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeExample === 'stock' ? 'bg-foreground text-background border-foreground' : 'bg-card border-default text-muted-foreground hover:border-foreground/50'}`}
              >
                {t('welcome.steps.features.examples.stock')}
              </button>
              <button 
                onClick={() => setActiveExample('python')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeExample === 'python' ? 'bg-foreground text-background border-foreground' : 'bg-card border-default text-muted-foreground hover:border-foreground/50'}`}
              >
                {t('welcome.steps.features.examples.python')}
              </button>
              <button 
                onClick={() => setActiveExample('web')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeExample === 'web' ? 'bg-foreground text-background border-foreground' : 'bg-card border-default text-muted-foreground hover:border-foreground/50'}`}
              >
                {t('welcome.steps.features.examples.web')}
              </button>
           </div>
           
           <div className="flex-1 rounded-2xl border border-border bg-card shadow-lg p-4 overflow-hidden relative flex flex-col justify-center">
                {!activeExample ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2">
                        <SearchIcon className="size-8 opacity-20" />
                        <span className="text-center px-4">Click an example above</span>
                    </div>
                ) : (
                    <div className="animate-fade-in-up space-y-4 w-full">
                        {activeExample === 'stock' && (
                            <div className="space-y-3">
                                <div className="h-4 w-32 bg-surface-l2 rounded" />
                                <div className="h-24 w-full bg-[#121212] rounded-xl p-3 border border-white/10 flex flex-col justify-between">
                                    <div className="flex justify-between items-start">
                                        <div className="text-xs text-white/50">AAPL</div>
                                        <div className="text-green-500 text-xs">+1.24%</div>
                                    </div>
                                    <div className="h-10 w-full flex items-end gap-1">
                                        {[20, 30, 25, 40, 50, 45, 60, 55].map((h, i) => (
                                            <div key={i} className="flex-1 bg-green-500/20 rounded-t" style={{ height: `${h}%` }} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeExample === 'python' && (
                            <div className="space-y-3 font-mono text-xs">
                                <div className="p-2 bg-surface-l2 rounded text-muted-foreground">import pandas as pd...</div>
                                <div className="p-2 bg-foreground text-background rounded">Execution Output: 42.0</div>
                            </div>
                        )}
                        {activeExample === 'web' && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <SearchIcon className="size-3 text-accent-blue animate-pulse" />
                                    <span className="text-xs text-muted-foreground font-medium">Searching...</span>
                                </div>
                                <div className="p-2 border-l-2 border-border italic text-xs text-muted-foreground leading-relaxed">
                                    Grounding response using sources...
                                </div>
                            </div>
                        )}
                    </div>
                )}
           </div>
        </div>
      )
    },
    {
      title: t('welcome.steps.location.title'),
      story: t('welcome.steps.location.description'),
      visual: (
        <div className="flex flex-col h-full w-full items-center justify-center p-6 gap-6 text-center">
          <div className="size-20 md:size-32 rounded-full bg-accent-blue/10 flex items-center justify-center animate-bounce shadow-[0_0_30px_rgba(29,155,240,0.1)]">
            <MapPinIcon className="size-8 md:size-12 text-accent-blue" />
          </div>
          <div className="space-y-4 w-full max-w-xs">
            {locationStatus === 'granted' ? (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center gap-3 text-green-600 font-bold animate-fade-in-up">
                <CheckIcon className="size-5" />
                Granted
              </div>
            ) : locationStatus === 'denied' ? (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-sm animate-fade-in-up">
                {t('welcome.steps.location.denied')}
              </div>
            ) : (
              <button
                onClick={handleLocationRequest}
                disabled={locationStatus === 'requesting'}
                className="w-full py-3 md:py-4 bg-accent-blue text-white rounded-2xl font-bold hover:opacity-90 transition-all shadow-lg flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95"
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
    <div className="fixed inset-0 z-[300] bg-background flex flex-col md:flex-row overflow-hidden">
        
        {/* Mobile: Visual Top (45%) | Desktop: Visual Right (58%) */}
        <div className="relative w-full h-[45%] md:h-full md:w-7/12 bg-surface-base order-1 md:order-2 flex items-center justify-center p-6 md:p-12 overflow-hidden border-b md:border-b-0 md:border-l border-border">
            <div className="w-full h-full max-w-lg md:max-w-3xl relative flex flex-col justify-center">
                {steps[step].visual}
            </div>
        </div>

        {/* Mobile: Text Bottom (55%) | Desktop: Text Left (42%) */}
        <div className="w-full h-[55%] md:h-full md:w-5/12 bg-background order-2 md:order-1 flex flex-col justify-between p-6 md:p-12 lg:p-16 relative z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] md:shadow-none">
            
            <div className="absolute top-6 right-6 md:top-8 md:left-8 md:right-auto">
                <button onClick={onComplete} className="text-xs text-muted-foreground hover:text-foreground font-semibold uppercase tracking-wider transition-colors px-2 py-1">
                    {t('welcome.skip')}
                </button>
            </div>

            <div className="flex-1 flex flex-col justify-center mt-8 md:mt-0">
                <div className="space-y-3 md:space-y-6">
                    <h2 className="text-2xl md:text-4xl lg:text-5xl font-extrabold text-foreground tracking-tight leading-tight">
                        {steps[step].title}
                    </h2>
                    <p className="text-sm md:text-lg text-muted-foreground leading-relaxed font-medium">
                        {steps[step].story}
                    </p>
                </div>
            </div>

            <div className="flex items-center justify-between pt-6">
                {/* Progress Dots */}
                <div className="flex gap-2">
                    {steps.map((_, i) => (
                        <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${step === i ? 'w-6 md:w-8 bg-accent-blue' : 'w-1.5 bg-border'}`} />
                    ))}
                </div>

                {/* Navigation */}
                <div className="flex gap-3 md:gap-4">
                    {step > 0 && (
                        <button
                            onClick={() => setStep(step - 1)}
                            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {t('welcome.back')}
                        </button>
                    )}
                    <button
                        onClick={() => isLast ? onComplete() : setStep(step + 1)}
                        className="px-6 py-2.5 md:px-8 md:py-3 bg-foreground text-background rounded-xl md:rounded-2xl font-bold hover:opacity-90 transition-all flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95"
                    >
                        {isLast ? t('welcome.getStarted') : t('welcome.next')}
                        {!isLast && <ChevronRightIcon className="size-4 md:size-5" />}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default WelcomeModal;

const CheckIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
