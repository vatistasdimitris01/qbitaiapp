
import React, { useState } from 'react';
import { Conversation, Persona } from '../types';
import { 
  XIcon, 
  Trash2Icon, 
  SunIcon, 
  SettingsIcon, 
  TerminalIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronLeftIcon
} from './icons';

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
  // On mobile, start with null so menu list shows. On desktop, default to Appearance.
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(window.innerWidth >= 1024 ? 'Appearance' : null);

  // Behavior states (Simulated logic for UI toggles)
  const [autoScroll, setAutoScroll] = useState(true);
  const [sidebarEditor, setSidebarEditor] = useState(true);
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [wrapCode, setWrapCode] = useState(true);
  const [showPreviews, setShowPreviews] = useState(true);
  const [starryBg, setStarryBg] = useState(true);

  if (!isOpen) return null;

  const Switch = ({ checked, onChange, id }: { checked: boolean, onChange: (v: boolean) => void, id: string }) => (
    <button 
      type="button" 
      role="switch" 
      aria-checked={checked} 
      onClick={() => onChange(!checked)}
      className={`peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-[1px] border-transparent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-black dark:bg-white' : 'bg-gray-200 dark:bg-[#333333]'}`}
      id={id}
    >
      <span className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform ${checked ? 'translate-x-5 bg-white dark:bg-black' : 'translate-x-0.5 bg-white'}`}></span>
    </button>
  );

  const ListItem = ({ label, icon, onClick }: { label: string, icon: React.ReactNode, onClick: () => void }) => (
    <button 
      onClick={onClick}
      className="flex items-center justify-between w-full p-4 bg-white dark:bg-[#1f1f1f] rounded-2xl border border-gray-100 dark:border-[#27272a] shadow-sm mb-2 active:scale-[0.98] transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-gray-50 dark:bg-[#292929] flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
        <div className="text-sm font-bold text-black dark:text-white text-left">{label}</div>
      </div>
      <ChevronRightIcon className="size-4 text-muted-foreground opacity-50" />
    </button>
  );

  const OptionRow = ({ label, checked, onChange, id }: { label: string, checked: boolean, onChange: (v: boolean) => void, id: string }) => (
    <div className="flex flex-row items-center justify-between w-full gap-4 px-3 py-3 border-b border-gray-100 dark:border-white/5 last:border-none">
      <div className="text-sm font-medium text-black dark:text-white">{label}</div>
      <Switch checked={checked} onChange={onChange} id={id} />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/80 z-[150] flex items-center justify-center backdrop-blur-sm p-4" onClick={onClose}>
      <div 
        className={`
          bg-background w-full transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]
          lg:max-w-4xl lg:h-[70vh] lg:min-h-[550px] lg:flex lg:flex-row lg:rounded-[2.5rem] lg:border lg:border-gray-200 lg:dark:border-[#27272a] lg:shadow-2xl
          fixed inset-0 lg:relative h-full lg:h-auto overflow-hidden
        `}
        onClick={e => e.stopPropagation()}
      >
        {/* Header - Fixed on mobile, Sidebar top on Desktop */}
        <div className="lg:hidden flex items-center justify-between p-6 pt-12 shrink-0 bg-background/50 backdrop-blur-md z-10 border-b border-gray-100 dark:border-white/5">
            {activeTab ? (
                 <button onClick={() => setActiveTab(null)} className="flex items-center gap-2 font-extrabold text-black dark:text-white">
                    <ChevronLeftIcon className="size-6" />
                    <span>{t(`settings.${activeTab.toLowerCase()}`)}</span>
                </button>
            ) : (
                <h2 className="text-2xl font-extrabold text-black dark:text-white">{t('settings.header')}</h2>
            )}
            <button 
              onClick={onClose} 
              className="size-10 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-lg border border-gray-200 dark:border-white/10 active:scale-90 transition-transform"
            >
              <XIcon className="size-5 text-black dark:text-white" />
            </button>
        </div>

        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:flex w-64 p-6 flex-shrink-0 border-r border-gray-100 dark:border-[#27272a] flex-col gap-1.5 h-full bg-gray-50/30 dark:bg-white/[0.02]">
          <div className="px-4 py-3 mb-6">
            <h1 className="font-extrabold text-2xl dark:text-white tracking-tight">{t('settings.header')}</h1>
            <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mt-1 opacity-50">Intelligence Refined</p>
          </div>
          {[
            { id: 'Appearance', label: t('settings.appearance'), icon: <SunIcon className="size-4" /> },
            { id: 'Behavior', label: t('settings.behavior'), icon: <SettingsIcon className="size-4" /> },
            { id: 'Data Controls', label: t('settings.data'), icon: <TerminalIcon className="size-4" /> }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`inline-flex items-center whitespace-nowrap text-sm font-bold transition-all duration-200 rounded-2xl py-3.5 gap-3 px-5 justify-start border-none ${
                activeTab === tab.id 
                  ? 'bg-white dark:bg-[#292929] text-black dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/5' 
                  : 'text-gray-500 dark:text-[#a1a1aa] hover:bg-gray-100 dark:hover:bg-white/5 hover:text-black dark:hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto h-full relative scrollbar-none flex flex-col">
          {/* Mobile Main List: Only visible if no tab is active */}
          {!activeTab && (
              <div className="lg:hidden p-6 space-y-4 animate-fade-in-up">
                  <div className="space-y-2">
                     <ListItem label={t('settings.appearance')} icon={<SunIcon className="size-4" />} onClick={() => setActiveTab('Appearance')} />
                     <ListItem label={t('settings.behavior')} icon={<SettingsIcon className="size-4" />} onClick={() => setActiveTab('Behavior')} />
                     <ListItem label={t('settings.data')} icon={<TerminalIcon className="size-4" />} onClick={() => setActiveTab('Data Controls')} />
                  </div>
              </div>
          )}

          {/* Sub-Pages: Always show on desktop, or show on mobile if activeTab is set */}
          {(activeTab || window.innerWidth >= 1024) && (
              <div className={`flex-1 flex flex-col p-6 lg:p-10 ${!activeTab ? 'hidden lg:flex' : 'animate-fade-in-up'}`}>
                  {activeTab === 'Appearance' && (
                    <div className="flex flex-col gap-10">
                      <div className="space-y-4">
                        <p className="pl-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('settings.appearance')}</p>
                        <div className="grid grid-cols-3 w-full gap-3">
                          {(['light', 'dark', 'system'] as const).map(th => (
                            <button 
                              key={th}
                              onClick={() => setTheme(th)}
                              className={`inline-flex items-center justify-center gap-2 text-sm font-bold w-full rounded-[1.5rem] flex-col p-5 border-2 transition-all active:scale-95 ${theme === th ? 'bg-white dark:bg-[#292929] border-black dark:border-white text-black dark:text-white' : 'border-gray-100 dark:border-[#27272a] text-gray-500 dark:text-[#a1a1aa] hover:border-gray-300 dark:hover:border-white/20'}`}
                            >
                              {th === 'light' && <SunIcon className="size-6 text-yellow-500" />}
                              {th === 'dark' && <SunIcon className="size-6 opacity-40" />}
                              {th === 'system' && <SettingsIcon className="size-6 text-blue-500" />}
                              <p className="capitalize mt-1">{t(`settings.themes.${th}`)}</p>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-4">
                         <p className="pl-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('settings.langTitle')}</p>
                         <div className="flex gap-3">
                            <button 
                              onClick={() => setLanguage('en')} 
                              className={`flex-1 py-4 rounded-2xl border-2 font-bold text-sm transition-all active:scale-95 ${language === 'en' ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-xl' : 'bg-transparent text-black dark:text-white border-gray-100 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'}`}
                            >
                              English
                            </button>
                            <button 
                              onClick={() => setLanguage('el')} 
                              className={`flex-1 py-4 rounded-2xl border-2 font-bold text-sm transition-all active:scale-95 ${language === 'el' ? 'bg-black dark:bg-white text-white dark:text-black border-black dark:border-white shadow-xl' : 'bg-transparent text-black dark:text-white border-gray-100 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/20'}`}
                            >
                              Ελληνικά
                            </button>
                         </div>
                      </div>

                      <div className="mt-auto">
                         <OptionRow label={t('settings.switches.starry')} checked={starryBg} onChange={setStarryBg} id="starry" />
                      </div>
                    </div>
                  )}

                  {activeTab === 'Behavior' && (
                    <div className="flex flex-col gap-2">
                      <p className="pl-1 mb-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('settings.behavior')}</p>
                      <div className="bg-gray-50 dark:bg-white/[0.03] rounded-[2rem] p-2 border border-gray-100 dark:border-white/5">
                        <OptionRow label={t('settings.switches.autoScroll')} checked={autoScroll} onChange={setAutoScroll} id="autoscroll" />
                        <OptionRow label={t('settings.switches.docMode')} checked={sidebarEditor} onChange={setSidebarEditor} id="docmode" />
                        <OptionRow label={t('settings.switches.haptics')} checked={hapticFeedback} onChange={setHapticFeedback} id="haptics" />
                        <OptionRow label={t('settings.switches.wrapCode')} checked={wrapCode} onChange={setWrapCode} id="wrapcode" />
                        <OptionRow label={t('settings.switches.previews')} checked={showPreviews} onChange={setShowPreviews} id="previews" />
                      </div>
                    </div>
                  )}

                  {activeTab === 'Data Controls' && (
                    <div className="flex flex-col gap-8">
                      <p className="pl-1 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{t('settings.data')}</p>
                      
                      <div className="space-y-4">
                        <div className="flex flex-col gap-3 p-6 bg-red-500/[0.04] rounded-[2rem] border border-red-500/10">
                          <div className="flex flex-row items-center justify-between w-full">
                            <div className="text-sm font-bold text-red-600 dark:text-red-400">{t('settings.buttons.delete')}</div>
                            <button 
                              onClick={() => { if(confirm(t('sidebar.confirmDelete'))) setConversations([]); }}
                              className="inline-flex items-center justify-center text-xs font-bold bg-red-600 text-white h-10 rounded-xl px-6 hover:bg-red-700 transition-colors shadow-lg shadow-red-600/20 active:scale-95"
                            >
                              {t('settings.buttons.deleteAction')}
                            </button>
                          </div>
                          <p className="text-[10px] text-red-600/60 dark:text-red-400/50 font-medium">This action is permanent and cannot be undone.</p>
                        </div>

                        <div className="flex flex-row items-center justify-between w-full gap-4 px-6 py-5 bg-gray-50 dark:bg-white/[0.03] rounded-[2rem] border border-gray-100 dark:border-white/5">
                          <div className="text-sm font-bold text-black dark:text-white">{t('settings.buttons.clear')}</div>
                          <button 
                             onClick={() => { localStorage.clear(); window.location.reload(); }}
                             className="inline-flex items-center justify-center text-xs font-bold border-2 border-gray-200 dark:border-white/10 text-black dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 h-10 rounded-xl px-6 transition-all active:scale-95"
                          >
                            {t('settings.buttons.clearAction')}
                          </button>
                        </div>
                      </div>
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
