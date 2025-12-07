
import React from 'react';
import {
  SquarePenIcon,
  SearchIcon,
  SettingsIcon,
  GrokLogoIcon,
  HistoryIcon,
  ImageIcon,
  FileTextIcon
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

  // Wave Icon SVG component for the sidebar
  const WaveIcon = ({ className }: { className?: string }) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M12 3v18M8 8v8M16 7v10M4 11v2M20 10v4"/>
      </svg>
  );

  return (
    <div className="flex h-full z-50">
      {/* Thin Rail - 68px width as requested */}
      <aside className="w-[68px] flex flex-col items-center py-5 bg-sidebar h-full shrink-0 z-50">
         <div className="flex flex-col items-center gap-8 w-full">
            {/* Logo */}
            <div className="w-10 h-10 flex items-center justify-center text-white mb-4 cursor-pointer hover:opacity-80 transition-opacity" onClick={onNewChat}>
                <GrokLogoIcon className="size-8" />
            </div>

            {/* Nav Icons - Centered */}
            <nav className="flex flex-col gap-6 items-center w-full">
                <button 
                    onClick={() => setShowHistory(!showHistory)} 
                    className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors duration-200 ${showHistory ? 'text-white bg-white/10' : 'text-gray-400 hover:text-white hover:bg-white/5'}`} 
                    title={t('sidebar.recent')}
                >
                    <SearchIcon className="size-5" />
                </button>

                <button 
                    onClick={onNewChat} 
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors duration-200" 
                    title={t('sidebar.newChat')}
                >
                    <SquarePenIcon className="size-5" />
                </button>
                
                 <button className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors duration-200">
                    <WaveIcon className="size-5" />
                </button>

                 <button className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors duration-200">
                    <ImageIcon className="size-5" />
                </button>

                <button className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors duration-200">
                    <FileTextIcon className="size-5" />
                </button>

                 <button onClick={() => setShowHistory(!showHistory)} className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors duration-200">
                    <HistoryIcon className="size-5" />
                </button>
            </nav>
         </div>

         {/* Bottom User Section */}
         <div className="mt-auto flex flex-col items-center gap-5 mb-2">
            <button onClick={onOpenSettings} className="w-8 h-8 rounded-full bg-black border border-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-300 hover:border-gray-500 transition-colors">
                JD
            </button>
         </div>
      </aside>

      {/* History Drawer */}
      <div className={`flex flex-col h-full bg-[#090909] border-r border-[#1f1f1f] w-64 transform transition-all duration-300 ease-in-out ${showHistory ? 'translate-x-0 w-64 opacity-100' : '-translate-x-full w-0 opacity-0 overflow-hidden'}`}>
         <div className="p-4 border-b border-[#1f1f1f]">
             <h2 className="text-white font-medium">{t('sidebar.recent')}</h2>
         </div>
         <div className="flex-1 overflow-y-auto p-2">
            {conversations.map(convo => (
                <button 
                    key={convo.id} 
                    onClick={() => { onSelectConversation(convo.id); if(window.innerWidth < 768) setShowHistory(false); }}
                    className={`w-full text-left px-3 py-3 rounded-lg text-sm mb-1 transition-colors ${activeConversationId === convo.id ? 'bg-[#1f1f1f] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
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