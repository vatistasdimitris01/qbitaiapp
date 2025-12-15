import React, { useState } from 'react';
import {
  SquarePenIcon,
  Trash2Icon,
  SettingsIcon,
  ChevronLeftIcon,
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
        {/* Header (New Chat) */}
        <div className={`flex items-center px-2 py-4 shrink-0 h-[60px] ${isOpen ? 'justify-between' : 'justify-center'}`}>
            <button 
                onClick={onNewChat} 
                className={`p-2 hover:bg-surface-l1 rounded-lg text-foreground transition-colors group flex items-center gap-2 ${!isOpen && 'justify-center'}`}
                aria-label={t('sidebar.newChat')}
                title={t('sidebar.newChat')}
            >
               <SquarePenIcon className="size-6 text-foreground shrink-0" />
               {isOpen && <span className="font-medium">New Chat</span>}
            </button>
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