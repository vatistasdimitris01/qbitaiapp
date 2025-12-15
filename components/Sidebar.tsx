import React, { useState } from 'react';
import {
  SquarePenIcon,
  SearchIcon,
  Trash2Icon,
  SettingsIcon,
  ChevronLeftIcon,
  LayoutGridIcon,
  VoiceWaveIcon,
  ImageIcon,
  FolderIcon, // Reusing for Projects
  ClockIcon // Reusing for History
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
  toggleSidebar,
  conversations,
  activeConversationId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onOpenSettings,
  t
 }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm(t('sidebar.confirmDelete'))) {
      onDeleteConversation(id);
    }
  };

  const filteredConversations = conversations.filter(convo => 
    convo.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* Mobile overlay */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={toggleSidebar}
      />
      
      <div className={`
        flex flex-col h-full bg-sidebar z-50 fixed inset-y-0 left-0
        transform transition-all duration-300 ease-in-out
        border-r border-sidebar
        ${isOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full lg:translate-x-0 lg:w-[64px]'}
      `}>
        {/* Header (Logo + Toggle) */}
        <div className={`flex items-center px-2 py-4 shrink-0 h-[60px] ${isOpen ? 'justify-between' : 'justify-center'}`}>
            <button 
                onClick={onNewChat} 
                className={`p-1.5 hover:bg-surface-l1 rounded-xl text-foreground transition-colors group flex items-center gap-2 ${!isOpen && 'justify-center'}`}
                aria-label={t('sidebar.newChat')}
                title={t('sidebar.newChat')}
            >
               <svg width="28" height="26" viewBox="0 0 35 33" fill="none" className="text-foreground shrink-0">
                  <path d="M13.2371 21.0407L24.3186 12.8506C24.8619 12.4491 25.6384 12.6057 25.8973 13.2294C27.2597 16.5185 26.651 20.4712 23.9403 23.1851C21.2297 25.8989 17.4581 26.4941 14.0108 25.1386L10.2449 26.8843C15.6463 30.5806 22.2053 29.6665 26.304 25.5601C29.5551 22.3051 30.562 17.8683 29.6205 13.8673L29.629 13.8758C28.2637 7.99809 29.9647 5.64871 33.449 0.844576C33.5314 0.730667 33.6139 0.616757 33.6964 0.5L29.1113 5.09055V5.07631L13.2343 21.0436" fill="currentColor"></path>
                  <path d="M10.9503 23.0313C7.07343 19.3235 7.74185 13.5853 11.0498 10.2763C13.4959 7.82722 17.5036 6.82767 21.0021 8.2971L24.7595 6.55998C24.0826 6.07017 23.215 5.54334 22.2195 5.17313C17.7198 3.31926 12.3326 4.24192 8.67479 7.90126C5.15635 11.4239 4.0499 16.8403 5.94992 21.4622C7.36924 24.9165 5.04257 27.3598 2.69884 29.826C1.86829 30.7002 1.0349 31.5745 0.36364 32.5L10.9474 23.0341" fill="currentColor"></path>
               </svg>
            </button>
        </div>

        {/* Primary Navigation */}
        <div className="px-2 flex flex-col gap-1">
             {/* Search */}
             <button className={`w-full flex items-center gap-3 px-2 py-2 text-foreground hover:bg-surface-l1 rounded-lg transition-colors group ${!isOpen && 'justify-center'}`} title="Search">
                 <SearchIcon className="size-5 text-muted-foreground group-hover:text-foreground shrink-0" />
                 {isOpen && <span className="font-medium text-sm">Search</span>}
             </button>

             {/* Chat (Home) */}
             <button onClick={onNewChat} className={`w-full flex items-center gap-3 px-2 py-2 text-foreground hover:bg-surface-l1 rounded-lg transition-colors group ${!isOpen && 'justify-center'}`} title="Chat">
                 <SquarePenIcon className="size-5 text-muted-foreground group-hover:text-foreground shrink-0" />
                 {isOpen && <span className="font-medium text-sm">Chat</span>}
             </button>

             {/* Voice */}
             <button className={`w-full flex items-center gap-3 px-2 py-2 text-foreground hover:bg-surface-l1 rounded-lg transition-colors group ${!isOpen && 'justify-center'}`} title="Voice">
                 <VoiceWaveIcon className="size-5 text-muted-foreground group-hover:text-foreground shrink-0" />
                 {isOpen && <span className="font-medium text-sm">Voice</span>}
             </button>

             {/* Imagine */}
             <button className={`w-full flex items-center gap-3 px-2 py-2 text-foreground hover:bg-surface-l1 rounded-lg transition-colors group ${!isOpen && 'justify-center'}`} title="Imagine">
                 <ImageIcon className="size-5 text-muted-foreground group-hover:text-foreground shrink-0" />
                 {isOpen && <span className="font-medium text-sm">Imagine</span>}
             </button>

             {/* Projects */}
             <button className={`w-full flex items-center gap-3 px-2 py-2 text-foreground hover:bg-surface-l1 rounded-lg transition-colors group ${!isOpen && 'justify-center'}`} title="Projects">
                 <FolderIcon className="size-5 text-muted-foreground group-hover:text-foreground shrink-0" />
                 {isOpen && <span className="font-medium text-sm">Projects</span>}
             </button>
             
             {/* History Trigger (if collapsed) or History List (if expanded) logic placeholder */}
             {!isOpen && (
                 <button className="w-full flex items-center gap-3 px-2 py-2 text-foreground hover:bg-surface-l1 rounded-lg transition-colors group justify-center" onClick={toggleSidebar} title="History">
                     <ClockIcon className="size-5 text-muted-foreground group-hover:text-foreground shrink-0" />
                 </button>
             )}
        </div>

        {/* Divider (only visible when expanded) */}
        {isOpen && <div className="h-px bg-border mx-4 my-2" />}

        {/* Conversations List (Only visible when expanded) */}
        {isOpen && (
            <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-none">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                    History
                </div>
                
                <div className="space-y-0.5">
                    {filteredConversations.map(convo => (
                        <div key={convo.id} className="relative group">
                            <button 
                                onClick={() => onSelectConversation(convo.id)} 
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors
                                    ${activeConversationId === convo.id 
                                        ? 'bg-surface-l1 text-foreground' 
                                        : 'text-muted-foreground hover:bg-surface-l1/50 hover:text-foreground'
                                    }
                                `}
                            >
                                <span className="text-sm truncate">{convo.title}</span>
                            </button>
                            
                            <button 
                                onClick={(e) => handleDelete(e, convo.id)} 
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-surface-l2 opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <Trash2Icon className="size-3.5" />
                            </button>
                        </div>
                    ))}
                    
                    {filteredConversations.length === 0 && (
                        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                            No conversations found
                        </div>
                    )}
                </div>
            </div>
        )}
        
        {/* Spacer for collapsed mode to push footer down */}
        {!isOpen && <div className="flex-1" />}

        {/* Footer */}
        <div className={`mt-auto relative shrink-0 ${isOpen ? 'p-4' : 'p-2 flex flex-col items-center gap-4 py-4'}`}>
            <button 
                onClick={onOpenSettings} 
                className={`flex items-center gap-3 text-foreground hover:bg-surface-l1 rounded-full transition-colors ${isOpen ? 'w-full px-2 py-2' : 'size-10 justify-center'}`}
                title="Settings"
            >
                <div className="size-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    U
                </div>
                {isOpen && (
                    <>
                        <div className="flex flex-col items-start text-sm overflow-hidden">
                            <span className="font-medium truncate">User</span>
                        </div>
                        <SettingsIcon className="size-4 text-muted-foreground ml-auto" />
                    </>
                )}
            </button>
            
            {/* Toggle Button */}
            <div className={`flex ${isOpen ? 'justify-end mt-2' : ''}`}>
                <button 
                    onClick={toggleSidebar}
                    className={`text-muted-foreground hover:text-foreground p-2 hover:bg-surface-l1 rounded-lg transition-colors ${!isOpen && 'rotate-180'}`}
                    aria-label={isOpen ? t('sidebar.close') : t('sidebar.open')}
                >
                    <ChevronLeftIcon className="size-5" />
                </button>
            </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;