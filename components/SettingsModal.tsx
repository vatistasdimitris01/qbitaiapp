
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
  InfoIcon
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

  // Behavior Toggles (Simulated for UI)
  const [autoScroll, setAutoScroll] = useState(true);
  const [sidebarEditor, setSidebarEditor] = useState(true);
  const [notifyThink, setNotifyThink] = useState(true);
  const [wrapCode, setWrapCode] = useState(true);
  const [richText, setRichText] = useState(true);

  if (!isOpen) return null;

  const TabButton = ({ tab, label, icon }: { tab: SettingsTab, label: string, icon: React.ReactNode }) => (
    <button 
      onClick={() => setActiveTab(tab)}
      className={`inline-flex items-center whitespace-nowrap text-sm font-medium leading-[normal] cursor-pointer transition-colors duration-100 select-none rounded-xl py-2 gap-3 px-4 justify-start h-10 min-w-40 border-none transition-all ${
        activeTab === tab ? 'bg-[#292929] text-white shadow-sm' : 'text-[#a1a1aa] hover:bg-[#212121] hover:text-white'
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
      className={`peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-[1px] border-transparent transition-colors focus:outline-none ring-1 ${checked ? 'bg-white' : 'bg-[#333333]'}`}
    >
      <span className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg transition-transform ${checked ? 'translate-x-5 bg-[#141414]' : 'translate-x-0.5 bg-white'}`}></span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-[150] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-[#141414] w-full max-w-4xl h-[70vh] flex flex-col md:flex-row overflow-hidden rounded-3xl border border-[#27272a] shadow-2xl animate-fade-in-up" 
        onClick={e => e.stopPropagation()}
      >
        {/* Sidebar */}
        <aside className="w-full md:w-56 p-4 flex-shrink-0 border-b md:border-b-0 md:border-r border-[#27272a] bg-[#141414] space-y-1">
          <TabButton tab="Appearance" label="Appearance" icon={<SunIcon className="size-4" />} />
          <TabButton tab="Data Controls" label="Data Controls" icon={<TerminalIcon className="size-4" />} />
          <TabButton tab="Customize" label="Customize" icon={<UserIcon className="size-4" />} />
          <TabButton tab="Behavior" label="Behavior" icon={<SettingsIcon className="size-4" />} />
        </aside>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#141414] focus:outline-none scrollbar-none" style={{ cursor: 'default' }}>
          
          {activeTab === 'Appearance' && (
            <div className="flex flex-col w-full gap-8 animate-fade-in-up">
              <div className="w-full px-1 pb-1">
                <div className="flex items-stretch w-full gap-3 justify-stretch">
                  {(['light', 'dark', 'system'] as const).map(th => (
                    <button 
                      key={th}
                      onClick={() => setTheme(th)}
                      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium w-full rounded-2xl flex-col p-4 group border border-[#27272a] transition-all ${theme === th ? 'bg-[#292929] text-white border-white/20' : 'text-[#a1a1aa] hover:bg-[#212121]'}`}
                    >
                      {th === 'light' && <SunIcon className="size-5 mb-1" />}
                      {th === 'dark' && <SunIcon className="size-5 mb-1 opacity-50" />}
                      {th === 'system' && <SettingsIcon className="size-5 mb-1" />}
                      <p className="capitalize">{th}</p>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="text-sm font-medium text-white">Wrap Long Lines For Code Blocks</div>
                <Switch checked={wrapCode} onChange={setWrapCode} />
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="text-sm font-medium text-white">Show Conversation Previews in History</div>
                <Switch checked={true} onChange={() => {}} />
              </div>
            </div>
          )}

          {activeTab === 'Data Controls' && (
            <div className="flex flex-col gap-8 animate-fade-in-up">
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="max-w-sm min-w-0">
                  <div className="text-sm font-medium text-white">Delete All Conversations</div>
                  <div className="text-xs text-[#a1a1aa]">Delete all of your conversation data permanently.</div>
                </div>
                <button 
                  onClick={() => { if(confirm('Delete all chats?')) setConversations([]); }}
                  className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium border border-[#27272a] text-white hover:bg-[#292929] h-10 rounded-xl px-6 py-2 transition-colors"
                >
                  Delete
                </button>
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="max-w-sm min-w-0">
                  <div className="text-sm font-medium text-white">Clear Cache</div>
                  <div className="text-xs text-[#a1a1aa]">Clear local cache and application state on this device.</div>
                </div>
                <button 
                   onClick={() => { localStorage.clear(); window.location.reload(); }}
                   className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium border border-[#27272a] text-white hover:bg-[#292929] h-10 rounded-xl px-6 py-2 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {activeTab === 'Customize' && (
             <div className="flex flex-col gap-6 animate-fade-in-up">
                <p className="pl-4 pb-1 text-sm font-semibold text-white">Customize Grok's Response</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-1">
                   {personas.slice(0, 4).map(p => (
                      <button 
                        key={p.id}
                        onClick={() => {
                           if(activeConversationId) {
                             setConversations(conversations.map(c => c.id === activeConversationId ? { ...c, personaId: p.id } : c));
                           }
                        }}
                        className={`whitespace-nowrap text-sm font-medium transition-all select-none border border-[#27272a] rounded-2xl flex-row px-4 py-3 group hover:bg-[#212121] text-left relative ${activeConversation?.personaId === p.id ? 'bg-[#292929] border-white/10' : ''}`}
                      >
                        <div className="w-full h-full flex flex-col gap-0.5 justify-start">
                           <p className="text-sm text-white">{p.name}</p>
                           <p className="text-xs text-[#a1a1aa] line-clamp-1">{p.instruction}</p>
                        </div>
                      </button>
                   ))}
                </div>
                <div className="flex-row gap-2 px-6 items-center text-sm text-[#a1a1aa] flex mt-4">
                  <InfoIcon className="size-4 shrink-0" />
                  Select a persona above to tailor the AI's personality.
                </div>
             </div>
          )}

          {activeTab === 'Behavior' && (
            <div className="flex flex-col w-full gap-8 animate-fade-in-up">
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="text-sm font-medium text-white">Enable Auto Scroll</div>
                <Switch checked={autoScroll} onChange={setAutoScroll} />
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="text-sm font-medium text-white">Enable Sidebar Editor</div>
                <Switch checked={sidebarEditor} onChange={setSidebarEditor} />
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="text-sm font-medium text-white">Notify When Thinking Finishes</div>
                <Switch checked={notifyThink} onChange={setNotifyThink} />
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="max-w-sm min-w-0">
                  <div className="text-sm font-medium text-white">Enable Rich Text Editor</div>
                  <div className="text-xs text-[#a1a1aa]">Format text and code natively in the query bar.</div>
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
