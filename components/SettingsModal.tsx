
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
  isOpen, onClose, theme, setTheme, personas, conversations, setConversations, activeConversationId
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('Appearance');
  const activeConversation = conversations.find(c => c.id === activeConversationId);

  // Functionality states
  const [autoScroll, setAutoScroll] = useState(true);
  const [sidebarEditor, setSidebarEditor] = useState(true);
  const [notifyThink, setNotifyThink] = useState(true);
  const [wrapCode, setWrapCode] = useState(true);
  const [richText, setRichText] = useState(true);
  const [showPreviews, setShowPreviews] = useState(true);
  const [starryBg, setStarryBg] = useState(true);

  if (!isOpen) return null;

  const Switch = ({ checked, onChange, id }: { checked: boolean, onChange: (v: boolean) => void, id: string }) => (
    <button 
      type="button" 
      role="switch" 
      aria-checked={checked} 
      onClick={() => onChange(!checked)}
      className={`peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-[1px] border-transparent transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ring-1 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-black dark:bg-white' : 'bg-gray-200 dark:bg-[#333333]'}`}
      id={id}
    >
      <span className={`pointer-events-none block h-4 w-4 rounded-full shadow-lg ring-0 transition-transform ${checked ? 'translate-x-5 bg-white dark:bg-black' : 'translate-x-0.5 bg-white'}`}></span>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/40 dark:bg-black/80 z-[150] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#141414] w-full max-w-4xl h-[75vh] flex flex-col md:flex-row overflow-hidden rounded-[2.5rem] border border-gray-200 dark:border-[#27272a] shadow-2xl animate-fade-in-up" 
        onClick={e => e.stopPropagation()}
      >
        {/* Left Sidebar Menu */}
        <aside className="w-full md:w-56 p-4 flex-shrink-0 border-b md:border-b-0 md:border-r border-gray-100 dark:border-[#27272a] flex flex-col gap-1">
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

        {/* Right Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10 bg-white dark:bg-[#141414] focus:outline-none scrollbar-none" style={{ cursor: 'default' }}>
          
          {activeTab === 'Appearance' && (
            <div className="flex flex-col w-full h-full gap-8 animate-fade-in-up">
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
                  <div className="text-sm font-medium text-black dark:text-white">Wrap Long Lines For Code Blocks</div>
                  <Switch checked={wrapCode} onChange={setWrapCode} id="wrap_code" />
                </div>
                <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                  <div className="text-sm font-medium text-black dark:text-white">Show Conversation Previews in History</div>
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
            <div className="flex flex-col gap-8 animate-fade-in-up">
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="max-w-sm min-w-0">
                  <div className="text-sm font-bold dark:text-white">Delete All Conversations</div>
                  <div className="text-xs text-gray-500 dark:text-[#a1a1aa]">Delete all of your conversation data.</div>
                </div>
                <button 
                  onClick={() => { if(confirm('Delete all chats?')) setConversations([]); }}
                  className="inline-flex items-center justify-center text-sm font-bold border border-gray-200 dark:border-[#27272a] text-black dark:text-white hover:bg-gray-50 dark:hover:bg-[#292929] h-10 rounded-xl px-6 transition-colors"
                >
                  Delete
                </button>
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="max-w-sm min-w-0">
                  <div className="text-sm font-bold dark:text-white">Clear Cache</div>
                  <div className="text-xs text-gray-500 dark:text-[#a1a1aa]">Clear the local cache and application state on your device.</div>
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
             <div className="flex flex-col gap-6 animate-fade-in-up">
                <p className="pl-4 pb-1 text-sm font-bold text-black dark:text-white">Customize Grok's Response</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-1">
                   {personas.slice(0, 4).map(p => (
                      <button 
                        key={p.id}
                        onClick={() => {
                           if(activeConversationId) {
                             setConversations(conversations.map(c => c.id === activeConversationId ? { ...c, personaId: p.id } : c));
                           }
                        }}
                        className={`text-sm font-medium transition-all select-none border rounded-2xl flex px-4 py-4 hover:bg-gray-50 dark:hover:bg-[#212121] text-left relative ${activeConversation?.personaId === p.id ? 'bg-gray-50 dark:bg-[#292929] border-black/10 dark:border-white/20' : 'border-gray-100 dark:border-[#27272a]'}`}
                      >
                        <div className="w-full flex flex-col gap-1">
                           <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-black dark:text-white">{p.name}</p>
                              {activeConversation?.personaId === p.id && <CheckIcon className="size-4 text-blue-500" />}
                           </div>
                           <p className="text-xs text-gray-500 dark:text-[#a1a1aa] line-clamp-2 leading-relaxed">{p.instruction}</p>
                        </div>
                      </button>
                   ))}
                </div>
                <div className="flex-row gap-3 px-6 items-center text-sm text-gray-400 dark:text-[#a1a1aa] flex mt-4 italic">
                  <InfoIcon className="size-4 shrink-0" />
                  Select an instruction set from above to customize Grok's responses.
                </div>
             </div>
          )}

          {activeTab === 'Behavior' && (
            <div className="flex flex-col w-full gap-8 animate-fade-in-up">
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="text-sm font-medium text-black dark:text-white">Enable Auto Scroll</div>
                <Switch checked={autoScroll} onChange={setAutoScroll} id="autoscroll" />
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="text-sm font-medium text-black dark:text-white">Enable Sidebar Editor For Code And Documents</div>
                <Switch checked={sidebarEditor} onChange={setSidebarEditor} id="editor" />
              </div>
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="text-sm font-medium text-black dark:text-white">Notify When Grok Finishes Thinking</div>
                <Switch checked={notifyThink} onChange={setNotifyThink} id="notify" />
              </div>
              <div className="h-px mx-3 bg-gray-100 dark:bg-[#27272a]"></div>
              <div className="flex flex-row items-center justify-between w-full gap-4 px-3">
                <div className="max-w-sm min-w-0">
                  <div className="text-sm font-medium text-black dark:text-white">Enable Rich Text Editor</div>
                  <div className="text-xs text-gray-500 dark:text-[#a1a1aa]">Enable code blocks and lists in the query bar</div>
                </div>
                <Switch checked={richText} onChange={setRichText} id="richtext" />
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
};

export default SettingsModal;
