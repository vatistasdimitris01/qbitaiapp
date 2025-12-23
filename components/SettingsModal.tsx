
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
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);

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
        <div className="text-sm font-bold text-black dark:text-white">{label}</div>
      </div>
      <ChevronRightIcon className="size-4 text-muted-foreground opacity-50" />
    </button>
  );

  const OptionRow = ({ label, checked, onChange, id }: { label: string, checked: boolean, onChange: (v: boolean) => void, id: string }) => (
    <div className="flex flex-row items-center justify-between w-full gap-4 px-3 py-1">
      <div className="text-sm font-medium text-black dark:text-white">{label}</div>
      <Switch checked={checked} onChange={onChange} id={id} />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/80 z-[150] flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div 
        className={`
          bg-background w-full transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]
          lg:max-w-4xl lg:h-[70vh] lg:min-h-[500px] lg:flex lg:flex-row lg:rounded-[2.5rem] lg:border lg:border-gray-200 lg:dark:border-[#27272a] lg:shadow-2xl
          fixed inset-0 lg:relative h-full lg:h-auto overflow-hidden
        `}
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-6 pt-12">
            {activeTab ? (
              <button onClick={() => setActiveTab(null)} className="flex items-center gap-2 text-black dark:text-white font-bold">
                <ChevronLeftIcon className="size-6" />
                <span>{t('settings.header')}</span>
              </button>
            ) : (
              <h2 className="text-2xl font-extrabold text-black dark:text-white">{t('settings.header')}</h2>
            )}
            <button 
              onClick={onClose} 
              className="size-10 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-lg border border-gray-200 dark:border-white/10"
            >
              <XIcon className="size-5 text-black dark:text-white" />
            </button>
        </div>

        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:flex w-56 p-4 flex-shrink-0 border-r border-gray-100 dark:border-[#27272a] flex-col gap-1 h-full">
          <div className="px-4 py-3 mb-4 font-bold text-xl dark:text-white">{t('settings.header')}</div>
          {[
            { id: 'Appearance', label: t('settings.appearance'), icon: <SunIcon className="size-4" /> },
            { id: 'Behavior', label: t('settings.behavior'), icon: <SettingsIcon className="size-4" /> },
            { id: 'Data Controls', label: t('settings.data'), icon: <TerminalIcon className="size-4" /> }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`inline-flex items-center whitespace-nowrap text-sm font-medium transition-all duration-100 rounded-xl py-2 gap-3 px-4 justify-start h-10 border-none ${
                activeTab === tab.id 
                  ? 'bg-gray-100 dark:bg-[#292929] text-black dark:text-white font-semibold' 
                  : 'text-gray-500 dark:text-[#a1a1aa] hover:bg-gray-50 dark:hover:bg-[#212121] hover:text-black dark:hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </aside>

        {/* Desktop Main Content Area with Fixed Height Container to prevent "jumping" */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-10 h-full">
          {!activeTab && (
            <div className="lg:hidden animate-fade-in-up space-y-2">
              <ListItem label={t('settings.appearance')} icon={<SunIcon className="size-4" />} onClick={() => setActiveTab('Appearance')} />
              <ListItem label={t('settings.behavior')} icon={<SettingsIcon className="size-4" />} onClick={() => setActiveTab('Behavior')} />
              <ListItem label={t('settings.data')} icon={<TerminalIcon className="size-4" />} onClick={() => setActiveTab('Data Controls')} />
            </div>
          )}

          {(activeTab || window.innerWidth >= 1024) && (
            <div className="animate-fade-in-up h-full flex flex-col gap-8">
              {activeTab === 'Appearance' && (
                <div className="flex flex-col gap-8 h-full">
                  <div className="grid grid-cols-3 w-full gap-2">
                    {(['light', 'dark', 'system'] as const).map(th => (
                      <button 
                        key={th}
                        onClick={() => setTheme(th)}
                        className={`inline-flex items-center justify-center gap-2 text-sm font-medium w-full rounded-2xl flex-col p-4 border transition-all ${theme === th ? 'bg-gray-50 dark:bg-[#292929] border-black/10 dark:border-white/20 text-black dark:text-white' : 'border-gray-100 dark:border-[#27272a] text-gray-500 dark:text-[#a1a1aa] hover:bg-gray-50 dark:hover:bg-[#212121]'}`}
                      >
                        {th === 'light' && <SunIcon className="size-6 text-yellow-500" />}
                        {th === 'dark' && <SunIcon className="size-6 opacity-40" />}
                        {th === 'system' && <SettingsIcon className="size-6 text-blue-500" />}
                        <p className="capitalize font-semibold">{t(`settings.themes.${th}`)}</p>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col gap-4">
                     <p className="pl-4 pb-1 text-sm font-bold text-black dark:text-white uppercase tracking-widest text-[10px]">{t('settings.langTitle')}</p>
                     <div className="flex gap-2">
                        <button 
                          onClick={() => setLanguage('en')} 
                          className={`flex-1 py-3 rounded-xl border font-bold text-sm transition-all ${language === 'en' ? 'bg-black dark:bg-white text-white dark:text-black border-transparent shadow-lg' : 'bg-white dark:bg-white/5 text-black dark:text-white border-gray-200 dark:border-white/10'}`}
                        >
                          English
                        </button>
                        <button 
                          onClick={() => setLanguage('el')} 
                          className={`flex-1 py-3 rounded-xl border font-bold text-sm transition-all ${language === 'el' ? 'bg-black dark:bg-white text-white dark:text-black border-transparent shadow-lg' : 'bg-white dark:bg-white/5 text-black dark:text-white border-gray-200 dark:border-white/10'}`}
                        >
                          Ελληνικά
                        </button>
                     </div>
                  </div>

                  <div className="mt-auto pb-4">
                     <OptionRow label={t('settings.switches.starry')} checked={starryBg} onChange={setStarryBg} id="starry" />
                  </div>
                </div>
              )}

              {activeTab === 'Behavior' && (
                <div className="flex flex-col gap-4 h-full">
                  <OptionRow label={t('settings.switches.autoScroll')} checked={autoScroll} onChange={setAutoScroll} id="autoscroll" />
                  <OptionRow label={t('settings.switches.docMode')} checked={sidebarEditor} onChange={setSidebarEditor} id="docmode" />
                  <OptionRow label={t('settings.switches.haptics')} checked={hapticFeedback} onChange={setHapticFeedback} id="haptics" />
                  <OptionRow label={t('settings.switches.wrapCode')} checked={wrapCode} onChange={setWrapCode} id="wrapcode" />
                  <OptionRow label={t('settings.switches.previews')} checked={showPreviews} onChange={setShowPreviews} id="previews" />
                </div>
              )}

              {activeTab === 'Data Controls' && (
                <div className="flex flex-col gap-8 h-full">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-row items-center justify-between w-full gap-4 px-3 py-2 bg-red-50 dark:bg-red-500/5 rounded-2xl border border-red-500/10">
                      <div className="text-sm font-bold text-red-600 dark:text-red-400">{t('settings.buttons.delete')}</div>
                      <button 
                        onClick={() => { if(confirm('Delete all chats?')) setConversations([]); }}
                        className="inline-flex items-center justify-center text-xs font-bold bg-red-600 text-white h-8 rounded-lg px-4 hover:bg-red-700 transition-colors"
                      >
                        {t('settings.buttons.deleteAction')}
                      </button>
                    </div>

                    <div className="flex flex-row items-center justify-between w-full gap-4 px-3 py-4">
                      <div className="text-sm font-bold text-black dark:text-white">{t('settings.buttons.clear')}</div>
                      <button 
                         onClick={() => { localStorage.clear(); window.location.reload(); }}
                         className="inline-flex items-center justify-center text-xs font-bold border border-gray-200 dark:border-white/10 text-black dark:text-white hover:bg-gray-50 dark:hover:bg-white/5 h-8 rounded-lg px-4 transition-colors"
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
