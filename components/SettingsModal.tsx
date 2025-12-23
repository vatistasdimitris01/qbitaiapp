
import React, { useState } from 'react';
import { Conversation, Persona } from '../types';
import { 
  XIcon, 
  SunIcon, 
  SettingsIcon, 
  TerminalIcon,
  ChevronRightIcon,
  ChevronLeftIcon
} from './icons';
import { ModalBase, Button, Text, Surface } from './DesignSystem';

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

  // Behavior states (Simulated local for UI demo)
  const [autoScroll, setAutoScroll] = useState(true);
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [wrapCode, setWrapCode] = useState(true);

  if (!isOpen) return null;

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
    <div className="fixed inset-0 bg-black/80 z-[150] flex items-center justify-center backdrop-blur-sm p-4" onClick={onClose}>
      <div 
        className="bg-background w-full transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] lg:max-w-4xl lg:h-[70vh] lg:min-h-[550px] lg:flex lg:flex-row lg:rounded-[2.5rem] lg:border lg:border-border lg:shadow-2xl fixed inset-0 lg:relative h-full lg:h-auto overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-6 pt-12 shrink-0 bg-background/50 backdrop-blur-md z-10 border-b border-border">
            {activeTab ? (
                 <button onClick={() => setActiveTab(null)} className="flex items-center gap-2 font-extrabold text-foreground">
                    <ChevronLeftIcon className="size-6" />
                    <span>{t(`settings.${activeTab.toLowerCase().replace(' ', '')}`)}</span>
                </button>
            ) : (
                <Text variant="h2">{t('settings.header')}</Text>
            )}
            <Button variant="secondary" size="icon" onClick={onClose}>
              <XIcon className="size-5" />
            </Button>
        </div>

        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex w-64 p-6 flex-shrink-0 border-r border-border flex-col gap-1.5 h-full bg-surface-base">
          <div className="px-4 py-3 mb-6">
            <Text variant="h1">{t('settings.header')}</Text>
            <Text variant="small" className="mt-1 opacity-50">Intelligence Refined</Text>
          </div>
          {[
            { id: 'Appearance', label: t('settings.appearance'), icon: <SunIcon className="size-4" /> },
            { id: 'Behavior', label: t('settings.behavior'), icon: <SettingsIcon className="size-4" /> },
            { id: 'Data Controls', label: t('settings.data'), icon: <TerminalIcon className="size-4" /> }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`inline-flex items-center whitespace-nowrap text-sm font-bold transition-all duration-200 rounded-2xl py-3.5 gap-3 px-5 justify-start ${
                activeTab === tab.id 
                  ? 'bg-surface-l1 text-foreground shadow-sm ring-1 ring-border' 
                  : 'text-muted-foreground hover:bg-surface-l2 hover:text-foreground'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto h-full relative scrollbar-none flex flex-col">
          {!activeTab && (
              <div className="lg:hidden p-6 space-y-2 animate-fade-in-up">
                 <ListItem label={t('settings.appearance')} icon={<SunIcon className="size-4" />} onClick={() => setActiveTab('Appearance')} />
                 <ListItem label={t('settings.behavior')} icon={<SettingsIcon className="size-4" />} onClick={() => setActiveTab('Behavior')} />
                 <ListItem label={t('settings.data')} icon={<TerminalIcon className="size-4" />} onClick={() => setActiveTab('Data Controls')} />
              </div>
          )}

          {(activeTab || window.innerWidth >= 1024) && (
              <div className={`flex-1 flex flex-col p-6 lg:p-10 ${!activeTab ? 'hidden lg:flex' : 'animate-fade-in-up h-full'}`}>
                  {activeTab === 'Appearance' && (
                    <div className="flex flex-col gap-10">
                      <div className="space-y-4">
                        <Text variant="small">{t('settings.appearance')}</Text>
                        <div className="grid grid-cols-3 gap-3">
                          {(['light', 'dark', 'system'] as const).map(th => (
                            <button 
                              key={th}
                              onClick={() => setTheme(th)}
                              className={`inline-flex items-center justify-center gap-2 text-sm font-bold rounded-[1.5rem] flex-col p-5 border-2 transition-all ${theme === th ? 'bg-surface-l1 border-foreground text-foreground shadow-xl' : 'border-border text-muted-foreground hover:border-border/80'}`}
                            >
                              <p className="capitalize">{t(`settings.themes.${th}`)}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                         <Text variant="small">{t('settings.langTitle')}</Text>
                         <div className="flex gap-3">
                            <Button variant={language === 'en' ? 'primary' : 'secondary'} className="flex-1" onClick={() => setLanguage('en')}>English</Button>
                            <Button variant={language === 'el' ? 'primary' : 'secondary'} className="flex-1" onClick={() => setLanguage('el')}>Ελληνικά</Button>
                         </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'Behavior' && (
                    <div className="flex flex-col gap-2">
                      <Text variant="small" className="mb-4">{t('settings.behavior')}</Text>
                      <Surface level="l2" className="p-2">
                        <OptionRow label={t('settings.switches.autoScroll')} checked={autoScroll} onChange={setAutoScroll} />
                        <OptionRow label={t('settings.switches.haptics')} checked={hapticFeedback} onChange={setHapticFeedback} />
                        <OptionRow label={t('settings.switches.wrapCode')} checked={wrapCode} onChange={setWrapCode} />
                      </Surface>
                    </div>
                  )}

                  {activeTab === 'Data Controls' && (
                    <div className="flex flex-col gap-8">
                      <Text variant="small">{t('settings.data')}</Text>
                      <Surface className="bg-red-500/5 border-red-500/10 p-6">
                        <div className="flex items-center justify-between">
                          <Text variant="body" className="font-bold text-red-500">{t('settings.buttons.delete')}</Text>
                          <Button variant="danger" size="sm" onClick={() => { if(confirm(t('sidebar.confirmDelete'))) setConversations([]); }}>
                            {t('settings.buttons.deleteAction')}
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
  );
};

export default SettingsModal;
