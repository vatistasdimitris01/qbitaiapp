
import React, { useState } from 'react';
import {
  LayoutGridIcon,
  SquarePenIcon,
  SearchIcon,
  Trash2Icon,
  SettingsIcon
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
    <div className={`
      flex flex-col h-full bg-sidebar z-50 fixed inset-y-0 left-0
      w-[260px] lg:w-[280px] transform transition-transform duration-300 ease-in-out
      border-r border-sidebar
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      lg:static lg:inset-auto
      ${!isOpen && 'lg:hidden'}
    `}>
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
             {/* Logo */}
             <div className="flex items-center justify-center text-foreground font-bold text-xl tracking-tighter">
                Qbit
             </div>
        </div>
        <button onClick={toggleSidebar} className="p-2 hover:bg-sidebar-active rounded-lg text-sidebar-muted-fg hover:text-foreground transition-colors">
          <LayoutGridIcon className="rotate-180 size-5" />
        </button>
      </div>
      
      <div className="px-4 mb-4">
          <button onClick={onNewChat} className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-sidebar-active hover:bg-card-hover text-foreground rounded-full transition-colors border border-sidebar-border shadow-sm group">
            <SquarePenIcon className="size-5" />
            <span className="font-medium text-sm">{t('sidebar.newChat')}</span>
          </button>
      </div>

      <div className="px-4 mb-4">
          <div className="relative group">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sidebar-muted-fg group-focus-within:text-foreground transition-colors" />
            <input 
              placeholder={t('sidebar.search')} 
              className="w-full pl-10 pr-4 py-2 bg-sidebar-active text-sm text-sidebar-fg placeholder-sidebar-muted-fg outline-none rounded-full focus:ring-1 focus:ring-white/10 transition-all" 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
      </div>
      
      <div className="flex-1 overflow-y-auto px-2 pb-2 scrollbar-none">
        {filteredConversations.length > 0 && <h3 className="px-4 py-2 text-xs font-semibold text-sidebar-muted-fg uppercase tracking-wider">{t('sidebar.recent')}</h3>}
        <div className="space-y-1">
            {filteredConversations.map(convo => (
              <div key={convo.id} className="relative group px-2">
                <button onClick={() => onSelectConversation(convo.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all duration-200 ${activeConversationId === convo.id ? 'bg-sidebar-active text-foreground' : 'text-sidebar-fg hover:bg-sidebar-active/50 hover:text-foreground'}`}>
                  <span className="text-sm truncate font-medium">{convo.title}</span>
                </button>
                <button onClick={(e) => handleDelete(e, convo.id)} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 hover:bg-card rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2Icon className="size-4 text-sidebar-muted-fg hover:text-red-400" />
                </button>
              </div>
            ))}
        </div>
      </div>
      
      <div className="p-4 border-t border-sidebar">
        <button onClick={onOpenSettings} className="w-full flex items-center gap-3 px-4 py-3 text-sidebar-fg hover:bg-sidebar-active hover:text-foreground rounded-xl transition-colors">
          <SettingsIcon className="size-5" />
          <span className="text-sm font-medium">{t('sidebar.settings')}</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
