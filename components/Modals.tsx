
import React, { useState, useEffect } from 'react';
import { Button, Surface, Text } from './UI';
import { 
  XIcon, ChevronLeftIcon, ChevronRightIcon, SunIcon, 
  SettingsIcon, TerminalIcon, MapPinIcon, CheckIcon 
} from './Icons';
import { LocationInfo, Conversation } from '../types';

export const WelcomeModal: React.FC<{ onComplete: () => void; onLocationUpdate: (loc: LocationInfo, lang?: string) => void; t: (key: string) => string; }> = ({ onComplete, onLocationUpdate, t }) => {
  const [step, setStep] = useState(0);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');

  const handleLocationRequest = () => {
    setLocationStatus('requesting');
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        const { latitude, longitude } = position.coords;
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
        const data = await res.json();
        const city = data?.address?.city || 'Unknown City';
        const country = data?.address?.country || 'Unknown Country';
        onLocationUpdate({ city, country, latitude, longitude });
        setLocationStatus('granted');
      } catch { setLocationStatus('granted'); }
    }, () => setLocationStatus('denied'));
  };

  const steps = [
    { title: t('welcome.steps.intro.title'), story: t('welcome.steps.intro.story') },
    { title: t('welcome.steps.workspace.title'), story: t('welcome.steps.workspace.description') },
    { title: t('welcome.steps.features.title'), story: t('welcome.steps.features.description') },
    { title: t('welcome.steps.location.title'), story: t('welcome.steps.location.description') }
  ];

  const isLast = step === steps.length - 1;
  return (
    <div className="fixed inset-0 z-[300] bg-background flex items-center justify-center p-6">
      <div className="bg-surface-l1 border border-border rounded-[2.5rem] w-full max-w-xl p-12 shadow-2xl animate-fade-in-up">
        <h2 className="text-4xl font-extrabold mb-4">{steps[step].title}</h2>
        <p className="text-muted-foreground text-lg mb-8">{steps[step].story}</p>
        {isLast && locationStatus !== 'granted' && (
          <Button onClick={handleLocationRequest} className="w-full h-14 rounded-2xl mb-8">
            {locationStatus === 'requesting' ? 'Requesting...' : t('welcome.steps.location.allow')}
          </Button>
        )}
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            {steps.map((_, i) => (<div key={i} className={`h-1.5 rounded-full ${step === i ? 'w-8 bg-accent-blue' : 'w-1.5 bg-border'}`} />))}
          </div>
          <div className="flex gap-4">
            {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>{t('welcome.back')}</Button>}
            <Button onClick={() => isLast ? onComplete() : setStep(step + 1)} className="rounded-xl px-8">
              {isLast ? t('welcome.getStarted') : t('welcome.next')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void; theme: string; setTheme: (theme: string) => void; language: string; setLanguage: (language: any) => void; conversations: Conversation[]; setConversations: (conversations: Conversation[]) => void; t: (key: string) => string; }> = ({ isOpen, onClose, theme, setTheme, language, setLanguage, setConversations, t }) => {
  const [activeTab, setActiveTab] = useState<'Appearance' | 'Data Controls'>('Appearance');
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-background w-full max-w-4xl h-[70vh] rounded-[2.5rem] border border-border shadow-2xl flex overflow-hidden" onClick={e => e.stopPropagation()}>
        <aside className="w-64 p-8 border-r border-border bg-surface-base flex flex-col gap-2">
          <Text variant="h1" className="mb-6">{t('settings.header')}</Text>
          <Button variant={activeTab === 'Appearance' ? 'primary' : 'ghost'} onClick={() => setActiveTab('Appearance')} className="justify-start gap-3 h-12">
            <SunIcon className="size-5" /> {t('settings.appearance')}
          </Button>
          <Button variant={activeTab === 'Data Controls' ? 'primary' : 'ghost'} onClick={() => setActiveTab('Data Controls')} className="justify-start gap-3 h-12">
            <TerminalIcon className="size-5" /> {t('settings.data')}
          </Button>
        </aside>
        <main className="flex-1 p-12 overflow-y-auto">
          {activeTab === 'Appearance' && (
            <div className="space-y-8 animate-fade-in-up">
              <Text variant="h2">{t('settings.appearance')}</Text>
              <div className="grid grid-cols-3 gap-4">
                {['light', 'dark', 'system'].map(th => (
                  <Button key={th} variant={theme === th ? 'primary' : 'secondary'} onClick={() => setTheme(th)} className="h-24 flex-col gap-2">
                    <SunIcon className="size-6" /> <span className="capitalize">{t(`settings.themes.${th}`)}</span>
                  </Button>
                ))}
              </div>
              <div className="space-y-4">
                <Text variant="small" className="uppercase opacity-60 tracking-widest">{t('settings.langTitle')}</Text>
                <div className="flex gap-4">
                   <Button variant={language === 'en' ? 'primary' : 'secondary'} onClick={() => setLanguage('en')} className="flex-1">English</Button>
                   <Button variant={language === 'el' ? 'primary' : 'secondary'} onClick={() => setLanguage('el')} className="flex-1">Ελληνικά</Button>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'Data Controls' && (
            <div className="space-y-8 animate-fade-in-up">
              <Text variant="h2">{t('settings.data')}</Text>
              <Surface level="l2" className="p-6 border-red-500/20 bg-red-500/5 flex items-center justify-between rounded-2xl">
                <div>
                  <Text className="font-bold text-red-500">{t('settings.buttons.delete')}</Text>
                  <p className="text-xs opacity-60">Irreversible action</p>
                </div>
                <Button variant="danger" onClick={() => { if(confirm(t('sidebar.confirmDelete'))) setConversations([]); }}>{t('settings.buttons.deleteAction')}</Button>
              </Surface>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export const Lightbox: React.FC<{ images: any[]; startIndex: number; onClose: () => void; }> = ({ images, startIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const currentImage = images[currentIndex];
  if (!currentImage) return null;
  return (
    <div className="fixed inset-0 bg-black/90 z-[300] flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} className="absolute top-8 right-8 text-white p-2 bg-white/10 rounded-full hover:bg-white/20"><XIcon className="size-8" /></button>
      <img src={currentImage.url} alt={currentImage.alt} className="max-w-full max-h-full object-contain animate-fade-in-up" onClick={e => e.stopPropagation()} />
      {images.length > 1 && (
        <>
          <button onClick={(e) => { e.stopPropagation(); setCurrentIndex(prev => (prev === 0 ? images.length - 1 : prev - 1)); }} className="absolute left-8 text-white p-2 bg-white/10 rounded-full"><ChevronLeftIcon className="size-8" /></button>
          <button onClick={(e) => { e.stopPropagation(); setCurrentIndex(prev => (prev === images.length - 1 ? 0 : prev + 1)); }} className="absolute right-8 text-white p-2 bg-white/10 rounded-full"><ChevronRightIcon className="size-8" /></button>
        </>
      )}
    </div>
  );
};
