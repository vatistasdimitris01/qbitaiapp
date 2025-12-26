
import React, { useState, useEffect, useCallback } from 'react';
import { Button, Surface, Text, SkeletonLoader } from './UI';
import { 
  XIcon, ChevronLeftIcon, ChevronRightIcon, SunIcon, 
  SettingsIcon, TerminalIcon, MapPinIcon, CheckIcon, SearchIcon 
} from './Icons';
import { LocationInfo, Conversation } from '../types';

// ==========================================
// 8. MEDIUM COMPONENTS
// ==========================================

export interface ImageInfo { url: string; alt: string; source?: string; }

export const Lightbox: React.FC<{ images: ImageInfo[]; startIndex: number; onClose: () => void; }> = ({ images, startIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [imageLoaded, setImageLoaded] = useState(false);
  const goToPrevious = useCallback(() => { setImageLoaded(false); setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1)); }, [images.length]);
  const goToNext = useCallback(() => { setImageLoaded(false); setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1)); }, [images.length]);
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') goToPrevious(); if (e.key === 'ArrowRight') goToNext(); if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevious, goToNext, onClose]);
  const currentImage = images[currentIndex];
  if (!currentImage) return null;
  return (
    <div className="fixed inset-0 bg-black/80 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-fade-in-up" role="dialog" aria-modal="true" onClick={onClose}>
      <header className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 text-white z-10"><div className="font-mono text-sm bg-black/20 px-2 py-1 rounded-md">{currentIndex + 1} / {images.length}</div><button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-black/20 hover:bg-white/20"><XIcon className="size-6" /></button></header>
      <main className="relative flex items-center justify-center w-full h-full" onClick={(e) => e.stopPropagation()}>
        {images.length > 1 && (<button onClick={goToPrevious} className="absolute left-4 p-2 rounded-full bg-black/20 hover:bg-white/20 text-white z-10"><ChevronLeftIcon className="size-8" /></button>)}
        <div className="flex flex-col items-center justify-center max-w-full max-h-full">
          {!imageLoaded && <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/50"></div>}
          <img key={currentIndex} src={currentImage.url} alt={currentImage.alt} className={`max-w-full max-h-[80vh] object-contain rounded-lg transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setImageLoaded(true)} />
          <footer className={`mt-4 text-center text-white/80 text-sm transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}><p>{currentImage.alt}</p></footer>
        </div>
        {images.length > 1 && (<button onClick={goToNext} className="absolute right-4 p-2 rounded-full bg-black/20 hover:bg-white/20 text-white z-10"><ChevronRightIcon className="size-8" /></button>)}
      </main>
    </div>
  );
};

// ==========================================
// 9. LARGE COMPONENTS
// ==========================================

export const WelcomeModal: React.FC<{ onComplete: () => void; onLocationUpdate: (loc: LocationInfo, lang?: string) => void; t: (key: string) => string; }> = ({ onComplete, onLocationUpdate, t }) => {
  const [step, setStep] = useState(0);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [activeExample, setActiveExample] = useState<string | null>(null);

  const handleLocationRequest = () => {
    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          const city = data?.address?.city || 'Unknown City';
          const country = data?.address?.country || 'Unknown Country';
          const countryCode = data?.address?.country_code?.toUpperCase();
          const countryToLang: any = { GR: 'el', ES: 'es', FR: 'fr', DE: 'de' };
          onLocationUpdate({ city, country, latitude, longitude }, countryCode ? countryToLang[countryCode] : undefined);
          setLocationStatus('granted');
        } catch { setLocationStatus('granted'); }
      }, () => setLocationStatus('denied'));
  };

  const steps = [
    { title: t('welcome.steps.intro.title'), story: t('welcome.steps.intro.story'), visual: (<div className="relative flex items-center justify-center h-full w-full group"><div className="absolute inset-0 bg-gradient-to-tr from-accent-blue/5 to-transparent rounded-3xl" /><div className="relative animate-pulse flex flex-col items-center"><img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP" className="w-32 h-32 md:w-64 md:h-64 object-contain hidden dark:block" /><img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP" className="w-32 h-32 md:w-64 md:h-64 object-contain dark:hidden" /></div></div>) },
    { title: t('welcome.steps.workspace.title'), story: t('welcome.steps.workspace.description'), visual: (<div className="flex flex-col h-full w-full bg-background rounded-2xl md:rounded-3xl border border-border overflow-hidden shadow-inner relative max-h-[400px] md:max-h-full"><div className="flex h-full"><div className="w-16 md:w-24 h-full border-r border-border bg-sidebar p-2 flex flex-col gap-2 shrink-0"><div className="size-6 bg-surface-l2 rounded-md mx-auto" /><div className="w-full h-3 md:h-4 bg-surface-l2 rounded" /></div><div className="flex-1 flex flex-col p-4 gap-4"><div className="w-3/4 h-8 bg-surface-l1 border border-border rounded-xl self-end animate-fade-in-up" /><div className="w-full h-24 bg-surface-l2 rounded-2xl animate-fade-in-up delay-100" /></div></div></div>) },
    { title: t('welcome.steps.features.title'), story: t('welcome.steps.features.description'), visual: (<div className="flex flex-col h-full w-full bg-surface-base rounded-2xl md:rounded-3xl border border-border p-4 md:p-6 gap-4 overflow-hidden shadow-inner max-h-[400px] md:max-h-full"><div className="flex flex-wrap gap-2 justify-center md:justify-start"><button onClick={() => setActiveExample('stock')} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeExample === 'stock' ? 'bg-foreground text-background border-foreground' : 'bg-card border-default text-muted-foreground'}`}>{t('welcome.steps.features.examples.stock')}</button><button onClick={() => setActiveExample('python')} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${activeExample === 'python' ? 'bg-foreground text-background border-foreground' : 'bg-card border-default text-muted-foreground'}`}>{t('welcome.steps.features.examples.python')}</button></div><div className="flex-1 rounded-2xl border border-border bg-card shadow-lg p-4 overflow-hidden relative flex flex-col justify-center">{!activeExample ? (<div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm gap-2"><SearchIcon className="size-8 opacity-20" /><span className="text-center px-4">Click an example</span></div>) : (<div className="animate-fade-in-up space-y-4 w-full">{activeExample === 'stock' && (<div className="h-24 w-full bg-[#121212] rounded-xl p-3 border border-white/10"><div className="text-xs text-white/50">AAPL</div><div className="text-green-500 text-xs">+1.24%</div></div>)}{activeExample === 'python' && (<div className="p-2 bg-foreground text-background rounded text-xs font-mono">Execution Output: 42.0</div>)}</div>)}</div></div>) },
    { title: t('welcome.steps.location.title'), story: t('welcome.steps.location.description'), visual: (<div className="flex flex-col h-full w-full items-center justify-center p-6 gap-6 text-center"><div className="size-20 md:size-32 rounded-full bg-accent-blue/10 flex items-center justify-center animate-bounce shadow-[0_0_30px_rgba(29,155,240,0.1)]"><MapPinIcon className="size-8 md:size-12 text-accent-blue" /></div><div className="space-y-4 w-full max-w-xs">{locationStatus === 'granted' ? (<div className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center gap-3 text-green-600 font-bold"><CheckIcon className="size-5" /> Granted</div>) : (<button onClick={handleLocationRequest} disabled={locationStatus === 'requesting'} className="w-full py-3 md:py-4 bg-accent-blue text-white rounded-2xl font-bold hover:opacity-90 transition-all">{locationStatus === 'requesting' ? 'Requesting...' : t('welcome.steps.location.allow')}</button>)}</div></div>) }
  ];

  const isLast = step === steps.length - 1;
  return (
    <div className="fixed inset-0 z-[300] bg-background flex flex-col md:flex-row overflow-hidden">
        <div className="relative w-full h-[45%] md:h-full md:w-7/12 bg-surface-base order-1 md:order-2 flex items-center justify-center p-6 md:p-12 overflow-hidden border-b md:border-b-0 md:border-l border-border"><div className="w-full h-full max-w-lg md:max-w-3xl relative flex flex-col justify-center">{steps[step].visual}</div></div>
        <div className="w-full h-[55%] md:h-full md:w-5/12 bg-background order-2 md:order-1 flex flex-col justify-between p-6 md:p-12 lg:p-16 relative z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] md:shadow-none">
            <div className="absolute top-6 right-6 md:top-8 md:left-8 md:right-auto"><button onClick={onComplete} className="text-xs text-muted-foreground hover:text-foreground font-semibold uppercase tracking-wider transition-colors px-2 py-1">{t('welcome.skip')}</button></div>
            <div className="flex-1 flex flex-col justify-center mt-8 md:mt-0"><div className="space-y-3 md:space-y-6"><h2 className="text-2xl md:text-4xl lg:text-5xl font-extrabold text-foreground tracking-tight leading-tight">{steps[step].title}</h2><p className="text-sm md:text-lg text-muted-foreground leading-relaxed font-medium">{steps[step].story}</p></div></div>
            <div className="flex items-center justify-between pt-6"><div className="flex gap-2">{steps.map((_, i) => (<div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${step === i ? 'w-6 md:w-8 bg-accent-blue' : 'w-1.5 bg-border'}`} />))}</div><div className="flex gap-3 md:gap-4">{step > 0 && (<button onClick={() => setStep(step - 1)} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">{t('welcome.back')}</button>)}<button onClick={() => isLast ? onComplete() : setStep(step + 1)} className="px-6 py-2.5 md:px-8 md:py-3 bg-foreground text-background rounded-xl md:rounded-2xl font-bold hover:opacity-90 transition-all flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95">{isLast ? t('welcome.getStarted') : t('welcome.next')}{!isLast && <ChevronRightIcon className="size-4 md:size-5" />}</button></div></div>
        </div>
    </div>
  );
};

export const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void; theme: string; setTheme: (theme: string) => void; language: string; setLanguage: (language: any) => void; conversations: Conversation[]; setConversations: (conversations: Conversation[]) => void; t: (key: string) => string; }> = ({ isOpen, onClose, theme, setTheme, language, setLanguage, setConversations, t }) => {
  const [activeTab, setActiveTab] = useState<'Appearance' | 'Behavior' | 'Data Controls' | null>(window.innerWidth >= 1024 ? 'Appearance' : null);
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => { if (isOpen) { setIsVisible(true); } else { const timer = setTimeout(() => setIsVisible(false), 300); return () => clearTimeout(timer); } }, [isOpen]);
  if (!isVisible && !isOpen) return null;
  const ListItem = ({ label, icon, onClick }: { label: string, icon: React.ReactNode, onClick: () => void }) => (<Surface level="l1" interactive onClick={onClick} className="flex items-center justify-between p-4 mb-2"><div className="flex items-center gap-3"><div className="size-8 rounded-full bg-surface-l2 flex items-center justify-center text-muted-foreground">{icon}</div><Text variant="body" className="font-bold">{label}</Text></div><ChevronRightIcon className="size-4 text-muted-foreground opacity-50" /></Surface>);
  return (
    <div className={`fixed inset-0 z-[200] flex items-end lg:items-center justify-center transition-all duration-300 ${isOpen ? 'bg-black/60 backdrop-blur-sm' : 'bg-transparent pointer-events-none'}`} onClick={onClose}>
      <div className={`bg-background w-full fixed bottom-0 left-0 right-0 h-[85vh] rounded-t-[2rem] border-t border-border shadow-2xl lg:static lg:w-[90vw] lg:h-[85vh] lg:max-w-6xl lg:rounded-[2.5rem] lg:border lg:border-border flex flex-col overflow-hidden relative transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-full lg:translate-y-0 lg:scale-95 lg:opacity-0'}`} onClick={e => e.stopPropagation()}>
        <div className="lg:hidden flex items-center justify-between p-6 pt-8 shrink-0 bg-background/80 backdrop-blur-md z-10 border-b border-border rounded-t-[2rem]">{activeTab ? (<button onClick={() => setActiveTab(null)} className="flex items-center gap-2 font-extrabold text-foreground"><ChevronLeftIcon className="size-6" /><span>{t(`settings.${activeTab.toLowerCase().replace(' ', '')}`)}</span></button>) : (<Text variant="h2">{t('settings.header')}</Text>)}<Button variant="secondary" size="icon" onClick={onClose} className="rounded-full"><XIcon className="size-5" /></Button></div>
        <button onClick={onClose} className="hidden lg:flex absolute top-6 right-6 z-50 p-2 rounded-full bg-surface-l2 hover:bg-surface-l3 transition-colors"><XIcon className="size-5" /></button>
        <div className="flex flex-1 h-full overflow-hidden">
            <aside className="hidden lg:flex w-72 p-8 flex-shrink-0 border-r border-border flex-col gap-2 h-full bg-surface-base/50">
              <div className="py-2 mb-6"><Text variant="h1" className="text-3xl">{t('settings.header')}</Text></div>
              {[{ id: 'Appearance', label: t('settings.appearance'), icon: <SunIcon className="size-5" /> }, { id: 'Behavior', label: t('settings.behavior'), icon: <SettingsIcon className="size-5" /> }, { id: 'Data Controls', label: t('settings.data'), icon: <TerminalIcon className="size-5" /> }].map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`inline-flex items-center whitespace-nowrap text-base font-bold transition-all duration-200 rounded-2xl py-4 gap-4 px-5 justify-start ${activeTab === tab.id ? 'bg-foreground text-background shadow-lg scale-[1.02]' : 'text-muted-foreground hover:bg-surface-l2 hover:text-foreground'}`}>{tab.icon}{tab.label}</button>))}
            </aside>
            <main className="flex-1 overflow-y-auto h-full relative scrollbar-none flex flex-col bg-background">
              {!activeTab && (<div className="lg:hidden p-4 space-y-2 animate-fade-in-up"><ListItem label={t('settings.appearance')} icon={<SunIcon className="size-4" />} onClick={() => setActiveTab('Appearance')} /><ListItem label={t('settings.behavior')} icon={<SettingsIcon className="size-4" />} onClick={() => setActiveTab('Behavior')} /><ListItem label={t('settings.data')} icon={<TerminalIcon className="size-4" />} onClick={() => setActiveTab('Data Controls')} /></div>)}
              {(activeTab || window.innerWidth >= 1024) && (
                  <div className={`flex-1 flex flex-col p-6 lg:p-12 max-w-4xl ${!activeTab ? 'hidden lg:flex' : 'animate-fade-in-up h-full'}`}>
                      {activeTab === 'Appearance' && (<div className="flex flex-col gap-12"><div className="space-y-6"><Text variant="h2" className="lg:hidden">{t('settings.appearance')}</Text><div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{(['light', 'dark', 'system'] as const).map(th => (<button key={th} onClick={() => setTheme(th)} className={`relative overflow-hidden inline-flex items-center justify-center gap-2 text-sm font-bold rounded-[1.5rem] flex-col p-6 border-2 transition-all duration-200 ${theme === th ? 'bg-surface-l1 border-foreground text-foreground shadow-xl scale-[1.02]' : 'bg-surface-base border-transparent text-muted-foreground hover:bg-surface-l2'}`}><div className={`size-12 rounded-full mb-3 flex items-center justify-center ${theme === th ? 'bg-foreground text-background' : 'bg-surface-l3'}`}><SunIcon className="size-6" /></div><p className="capitalize">{t(`settings.themes.${th}`)}</p></button>))}</div></div><div className="space-y-6"><Text variant="small" className="uppercase tracking-widest opacity-60">{t('settings.langTitle')}</Text><div className="flex gap-4"><Button variant={language === 'en' ? 'primary' : 'secondary'} className="flex-1 h-12 rounded-xl text-base" onClick={() => setLanguage('en')}>English</Button><Button variant={language === 'el' ? 'primary' : 'secondary'} className="flex-1 h-12 rounded-xl text-base" onClick={() => setLanguage('el')}>Ελληνικά</Button></div></div></div>)}
                      {activeTab === 'Data Controls' && (<div className="flex flex-col gap-8"><Surface className="bg-red-500/5 border-red-500/10 p-8 rounded-3xl"><div className="flex items-center justify-between"><div className="space-y-1"><Text variant="body" className="font-bold text-red-600 dark:text-red-400">{t('settings.buttons.delete')}</Text><p className="text-xs text-red-600/60 dark:text-red-400/60">This action cannot be undone.</p></div><Button variant="danger" size="md" onClick={() => { if(confirm(t('sidebar.confirmDelete'))) setConversations([]); }}>{t('settings.buttons.deleteAction')}</Button></div></Surface></div>)}
                  </div>
              )}
            </main>
        </div>
      </div>
    </div>
  );
};
