
import React, { useState, useEffect } from 'react';
import { Conversation, Persona } from '../types';
import { 
  XIcon, 
  SunIcon, 
  SettingsIcon, 
  TerminalIcon,
  ChevronRightIcon,
  ChevronLeftIcon
} from './icons';
import { Button, Text, Surface } from './DesignSystem';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: string;
  setTheme: (theme: string) => void;
  language: string;
  setLanguage: (language: any) => void;
  personas: Persona[];
  setPersonas: (personas: Persona[]) => void;
  conversations: Conversation[];
  setConversations: (conversations: Conversation[]) => void;
  activeConversationId: string | null;
  t: (key: string, params?: Record<string, string>) => string;
}

type SettingsTab = 'Appearance' | 'Behavior' | 'Data Controls';

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, theme, setTheme, language, setLanguage, personas, conversations, setConversations, activeConversationId, t
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(window.innerWidth >= 1024 ? 'Appearance' : null);
  const [isVisible, setIsVisible] = useState(false);

  // Behavior states (Simulated local for UI demo)
  const [autoScroll, setAutoScroll] = useState(true);
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [wrapCode, setWrapCode] = useState(true);

  // Handle entry/exit animations
  useEffect(() => {
    if (isOpen) {
        setIsVisible(true);
    } else {
        const timer = setTimeout(() => setIsVisible(false), 300); // Match transition duration
        return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  const handleClearCache = async () => {
    if (confirm("Are you sure you want to clear the app cache? This will refresh the page.")) {
      try {
        localStorage.clear();
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(key => caches.delete(key)));
        }
        window.location.reload();
      } catch (e) {
        console.error("Failed to clear cache:", e);
        window.location.reload();
      }
    }
  };

  const Switch = ({ checked, onChange }: { checked: boolean, onChange: (v: boolean) => void }) => (
    <button 
      type="button" 
      role="switch" 
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-[1px] border-transparent transition-colors focus:outline-none ${checked ? 'bg-foreground' : 'bg-surface-l3'}`}
    >
      <span className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform ${checked ? 'translate-x-6 bg-background' : 'translate-x-1 bg-white'}`}></span>
    </button>
  );

  const ListItem = ({ label, icon, onClick }: { label: string, icon: React.ReactNode, onClick: () => void }) => (
    <Surface level="l1" interactive onClick={onClick} className="flex items-center justify-between p-4 mb-2">
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-surface-l2 flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
        <Text variant="body" className="font-bold">{label}</Text>
      </div>
      <ChevronRightIcon className="size-4 text-muted-foreground opacity-50" />
    </Surface>
  );

  const OptionRow = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (v: boolean) => void }) => (
    <div className="flex flex-row items-center justify-between w-full gap-4 px-3 py-4 border-b border-border/50 last:border-none">
      <Text variant="body" className="font-medium">{label}</Text>
      <Switch checked={checked} onChange={onChange} />
    </div>
  );

  return (
    <div 
      className={`fixed inset-0 z-[200] flex items-end lg:items-center justify-center transition-all duration-300 ${isOpen ? 'bg-black/60 backdrop-blur-sm' : 'bg-transparent pointer-events-none'}`}
      onClick={onClose}
    >
      <div 
        className={`
          bg-background w-full h-full lg:h-[85vh] lg:w-[90vw] lg:max-w-6xl 
          lg:rounded-[2rem] lg:border lg:border-border lg:shadow-2xl 
          flex flex-col overflow-hidden relative
          transition-transform duration-300 ease-out
          ${isOpen ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-full lg:translate-y-10 lg:scale-95 lg:opacity-0'}
        `}
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-6 pt-8 shrink-0 bg-background/80 backdrop-blur-md z-10 border-b border-border">
            {activeTab ? (
                 <button onClick={() => setActiveTab(null)} className="flex items-center gap-2 font-extrabold text-foreground">
                    <ChevronLeftIcon className="size-6" />
                    <span>{t(`settings.${activeTab.toLowerCase().replace(' ', '')}`)}</span>
                </button>
            ) : (
                <Text variant="h2">{t('settings.header')}</Text>
            )}
            <Button variant="secondary" size="icon" onClick={onClose} className="rounded-full">
              <XIcon className="size-5" />
            </Button>
        </div>

        {/* Desktop Close Button (Floating) */}
        <button 
          onClick={onClose}
          className="hidden lg:flex absolute top-6 right-6 z-50 p-2 rounded-full bg-surface-l2 hover:bg-surface-l3 transition-colors"
        >
          <XIcon className="size-5" />
        </button>

        <div className="flex flex-1 h-full overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex w-72 p-8 flex-shrink-0 border-r border-border flex-col gap-2 h-full bg-surface-base/50">
              <div className="py-2 mb-6">
                <Text variant="h1" className="text-3xl">{t('settings.header')}</Text>
                <Text variant="small" className="mt-2 opacity-50 font-mono text-xs uppercase tracking-widest">System Preferences</Text>
              </div>
              {[
                { id: 'Appearance', label: t('settings.appearance'), icon: <SunIcon className="size-5" /> },
                { id: 'Behavior', label: t('settings.behavior'), icon: <SettingsIcon className="size-5" /> },
                { id: 'Data Controls', label: t('settings.data'), icon: <TerminalIcon className="size-5" /> }
              ].map(tab => (
                <button 
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SettingsTab)}
                  className={`inline-flex items-center whitespace-nowrap text-base font-bold transition-all duration-200 rounded-2xl py-4 gap-4 px-5 justify-start ${
                    activeTab === tab.id 
                      ? 'bg-foreground text-background shadow-lg scale-[1.02]' 
                      : 'text-muted-foreground hover:bg-surface-l2 hover:text-foreground'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </aside>

            {/* Content Area */}
            <main className="flex-1 overflow-y-auto h-full relative scrollbar-none flex flex-col bg-background">
              {!activeTab && (
                  <div className="lg:hidden p-4 space-y-2 animate-fade-in-up">
                    <ListItem label={t('settings.appearance')} icon={<SunIcon className="size-4" />} onClick={() => setActiveTab('Appearance')} />
                    <ListItem label={t('settings.behavior')} icon={<SettingsIcon className="size-4" />} onClick={() => setActiveTab('Behavior')} />
                    <ListItem label={t('settings.data')} icon={<TerminalIcon className="size-4" />} onClick={() => setActiveTab('Data Controls')} />
                  </div>
              )}

              {(activeTab || window.innerWidth >= 1024) && (
                  <div className={`flex-1 flex flex-col p-6 lg:p-12 max-w-4xl ${!activeTab ? 'hidden lg:flex' : 'animate-fade-in-up h-full'}`}>
                      {activeTab === 'Appearance' && (
                        <div className="flex flex-col gap-12">
                          <div className="space-y-6">
                            <Text variant="h2" className="lg:hidden">{t('settings.appearance')}</Text>
                            <Text variant="small" className="hidden lg:block uppercase tracking-widest opacity-60">{t('settings.appearance')}</Text>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              {(['light', 'dark', 'system'] as const).map(th => (
                                <button 
                                  key={th}
                                  onClick={() => setTheme(th)}
                                  className={`relative overflow-hidden inline-flex items-center justify-center gap-2 text-sm font-bold rounded-[1.5rem] flex-col p-6 border-2 transition-all duration-200 ${theme === th ? 'bg-surface-l1 border-foreground text-foreground shadow-xl scale-[1.02]' : 'bg-surface-base border-transparent text-muted-foreground hover:bg-surface-l2'}`}
                                >
                                  <div className={`size-12 rounded-full mb-3 flex items-center justify-center ${theme === th ? 'bg-foreground text-background' : 'bg-surface-l3'}`}>
                                     <SunIcon className="size-6" />
                                  </div>
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

                      {activeTab === 'Behavior' && (
                        <div className="flex flex-col gap-6">
                          <Text variant="h2" className="lg:hidden">{t('settings.behavior')}</Text>
                          <Text variant="small" className="hidden lg:block uppercase tracking-widest opacity-60">{t('settings.behavior')}</Text>
                          
                          <Surface level="l1" className="p-2 rounded-2xl overflow-hidden">
                            <OptionRow label={t('settings.switches.autoScroll')} checked={autoScroll} onChange={setAutoScroll} />
                            <OptionRow label={t('settings.switches.haptics')} checked={hapticFeedback} onChange={setHapticFeedback} />
                            <OptionRow label={t('settings.switches.wrapCode')} checked={wrapCode} onChange={setWrapCode} />
                          </Surface>
                        </div>
                      )}

                      {activeTab === 'Data Controls' && (
                        <div className="flex flex-col gap-8">
                          <Text variant="h2" className="lg:hidden">{t('settings.data')}</Text>
                          <Text variant="small" className="hidden lg:block uppercase tracking-widest opacity-60">{t('settings.data')}</Text>

                          <Surface className="bg-red-500/5 border-red-500/10 p-8 rounded-3xl">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                  <Text variant="body" className="font-bold text-red-600 dark:text-red-400">{t('settings.buttons.delete')}</Text>
                                  <p className="text-xs text-red-600/60 dark:text-red-400/60">This action cannot be undone.</p>
                              </div>
                              <Button variant="danger" size="md" onClick={() => { if(confirm(t('sidebar.confirmDelete'))) setConversations([]); }}>
                                {t('settings.buttons.deleteAction')}
                              </Button>
                            </div>
                          </Surface>

                          <Surface className="bg-orange-500/5 border-orange-500/10 p-8 rounded-3xl">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                  <Text variant="body" className="font-bold text-orange-600 dark:text-orange-400">{t('settings.buttons.clear')}</Text>
                                  <p className="text-xs text-orange-600/60 dark:text-orange-400/60">Fixes most loading issues.</p>
                              </div>
                              <Button variant="secondary" size="md" onClick={handleClearCache}>
                                {t('settings.buttons.clearAction')}
                              </Button>
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
