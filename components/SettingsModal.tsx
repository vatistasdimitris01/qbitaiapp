
import React, { useState } from 'react';
import { Conversation, Persona } from '../types';
import { 
  XIcon, 
  Trash2Icon, 
  SunIcon, 
  SettingsIcon, 
  UserIcon, 
  MapPinIcon, 
  TerminalIcon,
  ChevronDownIcon,
  InfoIcon,
  CheckIcon
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
  const [activeTab, setActiveTab] = useState<SettingsTab>('Appearance');
  const activeConversation = conversations.find(c => c.id === activeConversationId);

  const [autoScroll, setAutoScroll] = useState(true);
  const [sidebarEditor, setSidebarEditor] = useState(true);
  const [notifyThink, setNotifyThink] = useState(true);
  const [wrapCode, setWrapCode] = useState(true);
  const [richText, setRichText] = useState(true);

  if (!isOpen) return null;

  const TabButton = ({ tab, label, icon }: { tab: SettingsTab, label: string, icon: React.ReactNode }) => (
    <button 
      onClick={() => setActiveTab(tab)}
      className={`inline-flex items-center whitespace-nowrap text-sm font-medium leading-[normal] transition-colors duration-100 select-none rounded-xl py-2 gap-3 px-4 justify-start h-10 min-w-40 border-none ${
        activeTab === tab 
          ? 'bg-[#f3f2f1] dark:bg-[#292929] text-foreground font-semibold' 
          : 'text-muted-foreground hover:bg-[#f3f2f1] dark:hover:bg-[#212121] hover:text-foreground'
      }`}
      style={{ cursor: 'pointer' }}
    >
      {icon}
      {label}
    </button>
  );

  const Switch = ({ checked, onChange }: { checked: boolean, onChange: (v: boolean) => void }) => (
    <button 
      type="button" 
      onClick={() => onChange(!checked)}
      className={`peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-[1px] border-transparent transition-colors focus:outline-none ring-1 ${checked ? 'bg-foreground' : 'bg-gray-200 dark:bg-[#333333]'}`}
    >
      <span className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg transition-transform ${checked ? 'translate-x-5 bg-background' : 'translate-x-0.5 bg-background'}`}></span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 z-[150] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-background w-full max-w-4xl h-[75vh] flex flex-col md:flex-row overflow-hidden rounded-[2.5rem] border border-border shadow-2xl animate-fade-in-up" 
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar */}
        <aside className="w-full md:w-60 p-4 flex-shrink-0 border-b md:border-b-0 md:border-r border-border bg-background space-y-1">
           <div className="px-4 py-3 mb-2 font-bold text-lg text-foreground">Settings</div>
           <TabButton tab="Appearance" label="Appearance" icon={<SunIcon className="size-4" />} />
           <TabButton tab="Data Controls" label="Data Controls" icon={<TerminalIcon className="size-4" />} />
           <TabButton tab="Customize" label="Customize" icon={<UserIcon className="size-4" />} />
           <TabButton tab="Behavior" label="Behavior" icon={<SettingsIcon className="size-4" />} />
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10 bg-background focus:outline-none scrollbar-none" style={{ cursor: 'default' }}>
          
          {activeTab === 'Appearance' && (
            <div className="flex flex-col w-full gap-8 animate-fade-in-up">
              <div className="grid grid-cols-3 gap-3">
                  {(['light', 'dark', 'system'] as const).map(th => (
                    <button 
                      key={th}
                      onClick={() => setTheme(th)}
                      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium w-full rounded-2xl flex-col p-5 group border transition-all ${theme === th ? 'bg-surface-l2 dark:bg-[#292929] border-foreground/20' : 'border-border hover:bg-surface-l1 dark:hover:bg-[#212121]'}`}
                    >
                      {th === 'light' && <SunIcon className="size-6 mb-1 text-yellow-500" />}
                      {th === 'dark' && <SunIcon className="size-6 mb-1 opacity-50" />}
                      {th === 'system' && <SettingsIcon className="size-6 mb-1 text-blue-500" />}
                      <p className="capitalize font-semibold">{th}</p>
                    </button>
                  ))}
              </div>
              
              <div className="space-y-6 pt-4">
                <div className="flex flex-row items-center justify-between w-full gap-4">
                  <div className="text-sm font-medium text-foreground">Wrap Long Lines For Code Blocks</div>
                  <Switch checked={wrapCode} onChange={setWrapCode} />
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-4">
                  <div className="text-sm font-medium text-foreground">Show Conversation Previews in History</div>
                  <Switch checked={true} onChange={() => {}} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Data Controls' && (
            <div className="flex flex-col gap-10 animate-fade-in-up">
              <div className="flex flex-row items-center justify-between w-full gap-6 px-1">
                <div className="max-w-sm min-w-0">
                  <div className="text-sm font-bold text-foreground mb-1">Delete All Conversations</div>
                  <div className="text-xs text-muted-foreground">This will permanently remove your entire chat history from local storage.</div>
                </div>
                <button 
                  onClick={() => { if(confirm('Delete all chats?')) setConversations([]); }}
                  className="inline-flex items-center justify-center whitespace-nowrap text-sm font-bold border border-border text-foreground hover:bg-surface-l1 dark:hover:bg-[#292929] h-10 rounded-xl px-6 py-2 transition-colors"
                >
                  Delete
                </button>
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-6 px-1">
                <div className="max-w-sm min-w-0">
                  <div className="text-sm font-bold text-foreground mb-1">Clear App Cache</div>
                  <div className="text-xs text-muted-foreground">Resets the local application state and reloads the interface.</div>
                </div>
                <button 
                   onClick={() => { localStorage.clear(); window.location.reload(); }}
                   className="inline-flex items-center justify-center whitespace-nowrap text-sm font-bold border border-border text-foreground hover:bg-surface-l1 dark:hover:bg-[#292929] h-10 rounded-xl px-6 py-2 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {activeTab === 'Customize' && (
             <div className="flex flex-col gap-6 animate-fade-in-up">
                <p className="pb-4 text-sm font-bold text-foreground">AI Personality</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                   {personas.slice(0, 4).map(p => (
                      <button 
                        key={p.id}
                        onClick={() => {
                           if(activeConversationId) {
                             setConversations(conversations.map(c => c.id === activeConversationId ? { ...c, personaId: p.id } : c));
                           }
                        }}
                        className={`whitespace-nowrap text-sm font-medium transition-all select-none border rounded-2xl flex-row px-5 py-4 group hover:bg-surface-l1 dark:hover:bg-[#212121] text-left relative ${activeConversation?.personaId === p.id ? 'bg-surface-l2 dark:bg-[#292929] border-foreground/20' : 'border-border'}`}
                      >
                        <div className="w-full h-full flex flex-col gap-1 justify-start">
                           <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-foreground">{p.name}</p>
                              {activeConversation?.personaId === p.id && <CheckIcon className="size-4 text-accent-blue" />}
                           </div>
                           <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{p.instruction}</p>
                        </div>
                      </button>
                   ))}
                </div>
                <div className="flex-row gap-3 px-2 items-center text-sm text-muted-foreground flex mt-8">
                  <InfoIcon className="size-5 shrink-0" />
                  <span>Choose a persona to adjust Grok's behavior for this chat.</span>
                </div>
             </div>
          )}

          {activeTab === 'Behavior' && (
            <div className="flex flex-col w-full gap-8 animate-fade-in-up">
              <div className="flex flex-row items-center justify-between w-full gap-4">
                <div className="text-sm font-medium text-foreground">Enable Auto Scroll</div>
                <Switch checked={autoScroll} onChange={setAutoScroll} />
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-4">
                <div className="text-sm font-medium text-foreground">Enable Sidebar Editor</div>
                <Switch checked={sidebarEditor} onChange={setSidebarEditor} />
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-4">
                <div className="text-sm font-medium text-foreground">Notify When Thinking Finishes</div>
                <Switch checked={notifyThink} onChange={setNotifyThink} />
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-4">
                <div className="max-w-sm min-w-0">
                  <div className="text-sm font-medium text-foreground">Enable Rich Text Editor</div>
                  <div className="text-xs text-muted-foreground">Format text/code natively in query bar.</div>
                </div>
                <Switch checked={richText} onChange={setRichText} />
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

export default SettingsModal;
