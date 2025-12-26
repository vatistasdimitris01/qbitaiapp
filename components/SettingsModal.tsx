
import React, { useState, useEffect } from 'react';
import { Conversation } from '../types';
import { Button, Text, Surface } from './DesignSystem';
import { SunIcon, SettingsIcon, TerminalIcon, XIcon, ChevronRightIcon, ChevronLeftIcon } from './icons';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: string;
  setTheme: (theme: string) => void;
  language: string;
  setLanguage: (language: any) => void;
  conversations: Conversation[];
  setConversations: (conversations: Conversation[]) => void;
  t: (key: string) => string;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, theme, setTheme, language, setLanguage, setConversations, t }) => {
  const [activeTab, setActiveTab] = useState<'Appearance' | 'Behavior' | 'Data Controls' | null>(window.innerWidth >= 1024 ? 'Appearance' : null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => { 
    if (isOpen) { setIsVisible(true); } 
    else { const timer = setTimeout(() => setIsVisible(false), 300); return () => clearTimeout(timer); } 
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  const ListItem = ({ label, icon, onClick }: { label: string, icon: React.ReactNode, onClick: () => void }) => (
    <Surface level="l1" interactive onClick={onClick} className="flex items-center justify-between p-4 mb-2">
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-gray-100 dark:bg-zinc-800 flex items-center justify-center text-muted-foreground">{icon}</div>
        <Text variant="body" className="font-bold">{label}</Text>
      </div>
      <ChevronRightIcon className="size-4 text-muted-foreground opacity-50" />
    </Surface>
  );

  return (
    <div className={`fixed inset-0 z-[200] flex items-end lg:items-center justify-center transition-all duration-300 ${isOpen ? 'bg-black/60 backdrop-blur-sm' : 'bg-transparent pointer-events-none'}`} onClick={onClose}>
      <div className={`bg-background w-full fixed bottom-0 left-0 right-0 h-[85vh] rounded-t-[2rem] border-t border-border shadow-2xl lg:static lg:w-[90vw] lg:h-[85vh] lg:max-w-6xl lg:rounded-[2.5rem] lg:border lg:border-border flex flex-col overflow-hidden relative transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-full lg:translate-y-0 lg:scale-95 lg:opacity-0'}`} onClick={e => e.stopPropagation()}>
        <div className="lg:hidden flex items-center justify-between p-6 pt-8 shrink-0 bg-background/80 backdrop-blur-md z-10 border-b border-border rounded-t-[2rem]">
          {activeTab ? (
            <button onClick={() => setActiveTab(null)} className="flex items-center gap-2 font-extrabold text-foreground">
              <ChevronLeftIcon className="size-6" />
              <span>{t(`settings.${activeTab.toLowerCase().replace(' ', '')}`)}</span>
            </button>
          ) : (<Text variant="h2">{t('settings.header')}</Text>)}
          <Button variant="secondary" size="icon" onClick={onClose} className="rounded-full"><XIcon className="size-5" /></Button>
        </div>
        
        <button onClick={onClose} className="hidden lg:flex absolute top-6 right-6 z-50 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"><XIcon className="size-5" /></button>
        
        <div className="flex flex-1 h-full overflow-hidden">
            <aside className="hidden lg:flex w-72 p-8 flex-shrink-0 border-r border-border flex-col gap-2 h-full bg-gray-50/50 dark:bg-zinc-950/50">
              <div className="py-2 mb-6"><Text variant="h1" className="text-3xl">{t('settings.header')}</Text></div>
              {[{ id: 'Appearance', label: t('settings.appearance'), icon: <SunIcon className="size-5" /> }, 
                { id: 'Behavior', label: t('settings.behavior'), icon: <SettingsIcon className="size-5" /> }, 
                { id: 'Data Controls', label: t('settings.data'), icon: <TerminalIcon className="size-5" /> }
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`inline-flex items-center whitespace-nowrap text-base font-bold transition-all duration-200 rounded-2xl py-4 gap-4 px-5 justify-start ${activeTab === tab.id ? 'bg-foreground text-background shadow-lg scale-[1.02]' : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-foreground'}`}>
                  {tab.icon}{tab.label}
                </button>
              ))}
            </aside>
            <main className="flex-1 overflow-y-auto h-full relative scrollbar-none flex flex-col bg-background">
              {!activeTab && (<div className="lg:hidden p-4 space-y-2 animate-fade-in-up">
                <ListItem label={t('settings.appearance')} icon={<SunIcon className="size-4" />} onClick={() => setActiveTab('Appearance')} />
                <ListItem label={t('settings.behavior')} icon={<SettingsIcon className="size-4" />} onClick={() => setActiveTab('Behavior')} />
                <ListItem label={t('settings.data')} icon={<TerminalIcon className="size-4" />} onClick={() => setActiveTab('Data Controls')} />
              </div>)}
              {(activeTab || window.innerWidth >= 1024) && (
                  <div className={`flex-1 flex flex-col p-6 lg:p-12 max-w-4xl ${!activeTab ? 'hidden lg:flex' : 'animate-fade-in-up h-full'}`}>
                      {activeTab === 'Appearance' && (
                        <div className="flex flex-col gap-12">
                          <div className="space-y-6">
                            <Text variant="h2" className="lg:hidden">{t('settings.appearance')}</Text>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              {(['light', 'dark', 'system'] as const).map(th => (
                                <button key={th} onClick={() => setTheme(th)} className={`relative overflow-hidden inline-flex items-center justify-center gap-2 text-sm font-bold rounded-[1.5rem] flex-col p-6 border-2 transition-all duration-200 ${theme === th ? 'bg-white dark:bg-zinc-900 border-foreground text-foreground shadow-xl scale-[1.02]' : 'bg-gray-50 dark:bg-zinc-950 border-transparent text-muted-foreground hover:bg-gray-100 dark:hover:bg-zinc-900'}`}>
                                  <div className={`size-12 rounded-full mb-3 flex items-center justify-center ${theme === th ? 'bg-foreground text-background' : 'bg-gray-200 dark:bg-zinc-800'}`}><SunIcon className="size-6" /></div>
                                  <p className="capitalize">{t(`settings.themes.${th}`)}</p>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-6">
                            <Text variant="small" className="uppercase tracking-widest opacity-60">{t('settings.langTitle')}</Text>
                            <div className="flex gap-4">
                              <Button variant={language === 'en' ? 'primary' : 'secondary'} className="flex-1 h-12 rounded-xl text-base" onClick={() => setLanguage('en')}>English</Button>
                              <Button variant={language === 'el' ? 'primary' : 'secondary'} className="flex-1 h-12 rounded-xl text-base" onClick={() => setLanguage('el')}>Ελληνικά</Button>
                            </div>
                          </div>
                        </div>
                      )}
                      {activeTab === 'Data Controls' && (
                        <div className="flex flex-col gap-8">
                          <Surface className="bg-red-500/5 border-red-500/10 p-8 rounded-3xl">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <Text variant="body" className="font-bold text-red-600 dark:text-red-400">{t('settings.buttons.delete')}</Text>
                                <p className="text-xs text-red-600/60 dark:text-red-400/60">This action cannot be undone.</p>
                              </div>
                              <Button variant="danger" size="md" onClick={() => { if(confirm(t('sidebar.confirmDelete'))) setConversations([]); }}>{t('settings.buttons.deleteAction')}</Button>
                            </div>
                          </Surface>
                        </div>
                      )}
                  </div>
              )}
            </main>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
