import React, { useState } from 'react';
import {
  SquarePenIcon,
  SearchIcon,
  Trash2Icon,
  SettingsIcon,
  MessageCopyIcon,
  ChevronLeftIcon
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
        w-[280px] transform transition-transform duration-300 ease-in-out
        border-r border-sidebar
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:inset-auto lg:w-[280px]
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 shrink-0">
            <button 
                onClick={onNewChat} 
                className="p-2 hover:bg-surface-l2 rounded-lg text-foreground transition-colors group"
                aria-label={t('sidebar.newChat')}
            >
                <div className="flex items-center gap-2">
                    <div className="size-8 bg-foreground text-background rounded-lg flex items-center justify-center font-bold text-lg">Q</div>
                </div>
            </button>
            <button 
                onClick={toggleSidebar}
                className="lg:hidden p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-surface-l2"
            >
                <ChevronLeftIcon className="size-5" />
            </button>
        </div>

        {/* Primary Actions */}
        <div className="px-3 pb-2 space-y-1">
             <button 
                onClick={onNewChat} 
                className="w-full flex items-center gap-3 px-3 py-2 text-foreground hover:bg-surface-l2 rounded-lg transition-colors group"
            >
                <SquarePenIcon className="size-5 text-muted-foreground group-hover:text-foreground" />
                <span className="font-medium text-sm">{t('sidebar.newChat')}</span>
             </button>
             
             {/* Mock Items for Grok style */}
             <button className="w-full flex items-center gap-3 px-3 py-2 text-foreground hover:bg-surface-l2 rounded-lg transition-colors group opacity-50 cursor-not-allowed">
                 <SearchIcon className="size-5 text-muted-foreground group-hover:text-foreground" />
                 <span className="font-medium text-sm">Search</span>
             </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-border mx-4 my-2" />

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-none">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                {t('sidebar.recent')}
            </div>
            
            <div className="space-y-0.5">
                {filteredConversations.map(convo => (
                    <div key={convo.id} className="relative group">
                        <button 
                            onClick={() => onSelectConversation(convo.id)} 
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors
                                ${activeConversationId === convo.id 
                                    ? 'bg-surface-l2 text-foreground' 
                                    : 'text-muted-foreground hover:bg-surface-l2/50 hover:text-foreground'
                                }
                            `}
                        >
                            <span className="text-sm truncate">{convo.title}</span>
                        </button>
                        
                        <button 
                            onClick={(e) => handleDelete(e, convo.id)} 
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-surface-l1 opacity-0 group-hover:opacity-100 transition-all"
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
        
        {/* Footer */}
        <div className="p-4 border-t border-border mt-auto">
            <button 
                onClick={onOpenSettings} 
                className="w-full flex items-center gap-3 px-3 py-2.5 text-foreground hover:bg-surface-l2 rounded-lg transition-colors"
            >
                <div className="size-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                    U
                </div>
                <div className="flex flex-col items-start text-sm">
                    <span className="font-medium">User</span>
                    <span className="text-xs text-muted-foreground">Free Plan</span>
                </div>
                <SettingsIcon className="size-4 text-muted-foreground ml-auto" />
            </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;