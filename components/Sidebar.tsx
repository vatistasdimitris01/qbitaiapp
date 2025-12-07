
import React from 'react';
import {
  SquarePenIcon,
  SearchIcon,
  SettingsIcon,
  GrokLogoIcon,
  HistoryIcon
} from './icons';
import { Conversation } from '../types';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenSettings: () => void;
  t: (key: string) => string;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  isOpen, 
  conversations,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onOpenSettings,
  t
 }) => {
  const [showHistory, setShowHistory] = React.useState(false);

  return (
    <div className="flex h-full z-50">
      {/* Thin Rail */}
      <aside className="w-[72px] flex flex-col items-center py-5 border-r border-white/5 bg-sidebar h-full shrink-0 z-50">
         <div className="flex flex-col items-center gap-6 w-full">
            {/* Logo */}
            <div className="w-10 h-10 flex items-center justify-center text-white mb-2 cursor-pointer hover:opacity-80 transition-opacity" onClick={onNewChat}>
                <GrokLogoIcon className="w-8 h-8" />
            </div>

            {/* Nav Icons */}
            <div className="flex flex-col gap-4 items-center">
                 <button onClick={() => setShowHistory(!showHistory)} className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 ${showHistory ? 'bg-white text-black' : 'text-gray-400 hover:text-white hover:bg-white/10'}`} title={t('sidebar.recent')}>
                    <SearchIcon className="size-5" />
                </button>

                <button onClick={onNewChat} className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200" title={t('sidebar.newChat')}>
                    <SquarePenIcon className="size-5" />
                </button>
            </div>
         </div>

         <div className="mt-auto flex flex-col items-center gap-6 mb-2">
            <button onClick={onOpenSettings} className="w-10 h-10 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200" title={t('sidebar.settings')}>
                <SettingsIcon className="size-5" />
            </button>
            <div className="w-8 h-8 rounded-full bg-white text-black text-xs font-bold flex items-center justify-center cursor-pointer hover:opacity-90">
                JD
            </div>
         </div>
      </aside>

      {/* History Drawer */}
      <div className={`flex flex-col h-full bg-black border-r border-white/5 w-64 transform transition-all duration-300 ease-in-out ${showHistory ? 'translate-x-0 w-64 opacity-100' : '-translate-x-full w-0 opacity-0 overflow-hidden'}`}>
         <div className="p-4 border-b border-white/5">
             <h2 className="text-white font-medium">{t('sidebar.recent')}</h2>
         </div>
         <div className="flex-1 overflow-y-auto p-2">
            {conversations.map(convo => (
                <button 
                    key={convo.id} 
                    onClick={() => { onSelectConversation(convo.id); if(window.innerWidth < 768) setShowHistory(false); }}
                    className={`w-full text-left px-3 py-3 rounded-lg text-sm mb-1 transition-colors ${activeConversationId === convo.id ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
                >
                    <div className="truncate">{convo.title}</div>
                    <div className="text-[10px] opacity-50 mt-1">{new Date(convo.createdAt).toLocaleDateString()}</div>
                </button>
            ))}
            {conversations.length === 0 && (
                <div className="text-center text-gray-500 text-sm mt-10">No recent chats</div>
            )}
         </div>
      </div>
    </div>
  );
};

export default Sidebar;
