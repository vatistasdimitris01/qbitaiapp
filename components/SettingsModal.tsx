
import React, { useState } from 'react';
import { Conversation, Persona } from '../types';
import { 
  XIcon, 
  Trash2Icon, 
  SunIcon, 
  SettingsIcon, 
  UserIcon, 
  TerminalIcon,
  CheckIcon,
  InfoIcon,
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

type SettingsTab = 'Appearance' | 'Data Controls' | 'Customize' | 'Behavior';

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen, onClose, theme, setTheme, personas, conversations, setConversations, activeConversationId, t
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab | null>(null);
  const activeConversation = conversations.find(c => c.id === activeConversationId);

  // Behavior states
  const [autoScroll, setAutoScroll] = useState(true);
  const [sidebarEditor, setSidebarEditor] = useState(true);
  const [notifyThink, setNotifyThink] = useState(true);
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

  const ListItem = ({ label, icon, onClick, subtext }: { label: string, icon: React.ReactNode, onClick: () => void, subtext?: string }) => (
    <button 
      onClick={onClick}
      className="flex items-center justify-between w-full p-4 bg-white dark:bg-[#1f1f1f] rounded-2xl border border-gray-100 dark:border-[#27272a] shadow-sm mb-2 active:scale-[0.98] transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="size-8 rounded-full bg-gray-50 dark:bg-[#292929] flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
        <div className="text-left">
           <div className="text-sm font-bold text-black dark:text-white">{label}</div>
           {subtext && <div className="text-[10px] text-muted-foreground">{subtext}</div>}
        </div>
      </div>
      <div className="flex items-center gap-2">
         {subtext && <span className="text-xs text-muted-foreground">{subtext}</span>}
         <ChevronRightIcon className="size-4 text-muted-foreground opacity-50" />
      </div>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/80 z-[150] flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      {/* Container - Modal on Desktop, Full Drawer on Mobile */}
      <div 
        className={`
          bg-background w-full transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]
          lg:max-w-4xl lg:h-[75vh] lg:flex lg:flex-row lg:rounded-[2.5rem] lg:border lg:border-gray-200 lg:dark:border-[#27272a] lg:shadow-2xl
          fixed inset-0 lg:relative h-full lg:h-auto overflow-hidden
        `}
        onClick={e => e.stopPropagation()}
      >
        {/* Header (Mobile Only) */}
        <div className="lg:hidden flex items-center justify-between p-6 pt-12">
            {activeTab ? (
              <button onClick={() => setActiveTab(null)} className="flex items-center gap-2 text-black dark:text-white font-bold">
                <ChevronLeftIcon className="size-6" />
                <span>Settings</span>
              </button>
            ) : (
              <h2 className="text-2xl font-extrabold text-black dark:text-white">Settings</h2>
            )}
            <button 
              onClick={onClose} 
              className="size-10 rounded-full bg-white dark:bg-white/10 flex items-center justify-center shadow-lg border border-gray-200 dark:border-white/10"
            >
              <XIcon className="size-5 text-black dark:text-white" />
            </button>
        </div>

        {/* Desktop Sidebar Menu */}
        <aside className="hidden lg:flex w-56 p-4 flex-shrink-0 border-r border-gray-100 dark:border-[#27272a] flex-col gap-1">
          <div className="px-4 py-3 mb-2 font-bold text-lg dark:text-white">Settings</div>
          {[
            { id: 'Appearance', label: 'Appearance', icon: <SunIcon className="size-4" /> },
            { id: 'Data Controls', label: 'Data Controls', icon: <TerminalIcon className="size-4" /> },
            { id: 'Customize', label: 'Customize', icon: <UserIcon className="size-4" /> },
            { id: 'Behavior', label: 'Behavior', icon: <SettingsIcon className="size-4" /> }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`inline-flex items-center whitespace-nowrap text-sm font-medium transition-all duration-100 rounded-xl py-2 gap-3 px-4 justify-start h-10 min-w-40 border-none ${
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

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-10 relative">
          
          {/* Main List (Mobile Only) */}
          {!activeTab && (
            <div className="lg:hidden animate-fade-in-up space-y-2">
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-4">General</div>
              <ListItem label="Appearance" icon={<SunIcon className="size-4" />} onClick={() => setActiveTab('Appearance')} />
              <ListItem label="Customize Qbit" icon={<UserIcon className="size-4" />} onClick={() => setActiveTab('Customize')} />
              <ListItem label="Behavior" icon={<SettingsIcon className="size-4" />} onClick={() => setActiveTab('Behavior')} />
              <ListItem label="Data Controls" icon={<TerminalIcon className="size-4" />} onClick={() => setActiveTab('Data Controls')} />
            </div>
          )}

          {/* Sub Pages */}
          {(activeTab || window.innerWidth >= 1024) && (
            <div className="animate-fade-in-up h-full">
              {activeTab === 'Appearance' && (
                <div className="flex flex-col gap-8">
                  <div className="flex items-stretch w-full gap-2 justify-stretch">
                    {(['light', 'dark', 'system'] as const).map(th => (
                      <button 
                        key={th}
                        onClick={() => setTheme(th)}
                        className={`inline-flex items-center justify-center gap-2 text-sm font-medium w-full rounded-2xl flex-col p-4 border transition-all ${theme === th ? 'bg-gray-50 dark:bg-[#292929] border-black/10 dark:border-white/20 text-black dark:text-white' : 'border-gray-100 dark:border-[#27272a] text-gray-500 dark:text-[#a1a1aa] hover:bg-gray-50 dark:hover:bg-[#212121]'}`}
                      >
                        {th === 'light' && <SunIcon className="size-6 text-yellow-500" />}
                        {th === 'dark' && <SunIcon className="size-6 opacity-40" />}
                        {th === 'system' && <SettingsIcon className="size-6 text-blue-500" />}
                        <p className="capitalize font-semibold">{th}</p>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col gap-6">
                    <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                      <div className="text-sm font-medium text-black dark:text-white">Wrap Long Lines For Code</div>
                      <Switch checked={wrapCode} onChange={setWrapCode} id="wrap_code" />
                    </div>
                    <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                      <div className="text-sm font-medium text-black dark:text-white">Show Chat Previews</div>
                      <Switch checked={showPreviews} onChange={setShowPreviews} id="previews" />
                    </div>
                    <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                      <div className="text-sm font-medium text-black dark:text-white">Enable Starry Background</div>
                      <Switch checked={starryBg} onChange={setStarryBg} id="starry" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'Data Controls' && (
                <div className="flex flex-col gap-8">
                  <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                    <div className="max-w-sm">
                      <div className="text-sm font-bold dark:text-white">Delete All Conversations</div>
                      <div className="text-xs text-muted-foreground mt-1">Permanently remove all chats.</div>
                    </div>
                    <button 
                      onClick={() => { if(confirm('Delete all chats?')) setConversations([]); }}
                      className="inline-flex items-center justify-center text-sm font-bold border border-gray-200 dark:border-[#27272a] text-black dark:text-white hover:bg-gray-50 dark:hover:bg-[#292929] h-10 rounded-xl px-6 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                    <div className="max-w-sm">
                      <div className="text-sm font-bold dark:text-white">Clear App Cache</div>
                      <div className="text-xs text-muted-foreground mt-1">Reset application state on this device.</div>
                    </div>
                    <button 
                       onClick={() => { localStorage.clear(); window.location.reload(); }}
                       className="inline-flex items-center justify-center text-sm font-bold border border-gray-200 dark:border-[#27272a] text-black dark:text-white hover:bg-gray-50 dark:hover:bg-[#292929] h-10 rounded-xl px-6 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'Customize' && (
                <div className="flex flex-col gap-6">
                  <p className="pl-4 pb-1 text-sm font-bold text-black dark:text-white uppercase tracking-widest text-[10px]">Persona Profiles</p>
                  <div className="grid grid-cols-1 gap-3 px-1">
                    {/* Default Option */}
                    <button 
                        onClick={() => {
                           if(activeConversationId) {
                             setConversations(conversations.map(c => c.id === activeConversationId ? { ...c, personaId: undefined } : c));
                           }
                        }}
                        className={`text-sm font-medium transition-all border rounded-2xl flex px-4 py-4 hover:bg-gray-50 dark:hover:bg-[#212121] text-left relative ${!activeConversation?.personaId ? 'bg-gray-50 dark:bg-[#292929] border-black/10 dark:border-white/20' : 'border-gray-100 dark:border-[#27272a]'}`}
                      >
                        <div className="w-full flex flex-col gap-1">
                           <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-black dark:text-white">Default</p>
                              {!activeConversation?.personaId && <CheckIcon className="size-4 text-blue-500" />}
                           </div>
                           <p className="text-xs text-muted-foreground leading-relaxed">Standard balanced AI assistant behavior.</p>
                        </div>
                    </button>

                    {personas.map(p => (
                      <button 
                        key={p.id}
                        onClick={() => {
                           if(activeConversationId) {
                             setConversations(conversations.map(c => c.id === activeConversationId ? { ...c, personaId: p.id } : c));
                           }
                        }}
                        className={`text-sm font-medium transition-all border rounded-2xl flex px-4 py-4 hover:bg-gray-50 dark:hover:bg-[#212121] text-left relative ${activeConversation?.personaId === p.id ? 'bg-gray-50 dark:bg-[#292929] border-black/10 dark:border-white/20' : 'border-gray-100 dark:border-[#27272a]'}`}
                      >
                        <div className="w-full flex flex-col gap-1">
                           <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-black dark:text-white">{p.name}</p>
                              {activeConversation?.personaId === p.id && <CheckIcon className="size-4 text-blue-500" />}
                           </div>
                           <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{p.instruction}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'Behavior' && (
                <div className="flex flex-col w-full gap-8">
                  <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                    <div className="text-sm font-medium text-black dark:text-white">Enable Auto Scroll</div>
                    <Switch checked={autoScroll} onChange={setAutoScroll} id="autoscroll" />
                  </div>
                  <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                    <div className="text-sm font-medium text-black dark:text-white">Enable Document Mode</div>
                    <Switch checked={sidebarEditor} onChange={setSidebarEditor} id="editor" />
                  </div>
                  <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                    <div className="text-sm font-medium text-black dark:text-white">Haptic Feedback</div>
                    <Switch checked={notifyThink} onChange={setNotifyThink} id="notify" />
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
