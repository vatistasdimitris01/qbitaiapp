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
      w-[280px] transform transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      border-r border-sidebar
    `}>
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
             <div className="size-6 bg-foreground rounded-lg flex items-center justify-center">
                <div className="size-2 bg-background rounded-full"></div>
             </div>
            <h2 className="text-sm font-semibold text-sidebar-active-fg tracking-tight">Qbit</h2>
        </div>
        <button onClick={toggleSidebar} className="p-2 hover:bg-sidebar-active rounded-lg text-sidebar-muted-fg hover:text-sidebar-fg transition-colors">
          <LayoutGridIcon className="rotate-180 size-4" />
        </button>
      </div>
      
      <div className="px-4 mb-2">
          <button onClick={onNewChat} className="w-full flex items-center justify-start gap-3 px-3 py-2.5 bg-sidebar-active hover:bg-sidebar-active/80 text-sidebar-active-fg rounded-xl transition-colors border border-sidebar-border">
            <SquarePenIcon className="size-4" />
            <span className="font-medium text-sm">{t('sidebar.newChat')}</span>
          </button>
      </div>

      <div className="px-4 mb-2">
          <div className="relative group">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sidebar-muted-fg" />
            <input 
              placeholder={t('sidebar.search')} 
              className="w-full pl-9 pr-3 py-2 bg-transparent text-sm text-sidebar-fg placeholder-sidebar-muted-fg outline-none rounded-lg focus:bg-sidebar-active transition-colors" 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
      </div>
      
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {filteredConversations.length > 0 && <h3 className="px-4 py-2 text-[10px] font-medium text-sidebar-muted-fg uppercase tracking-wider opacity-70">{t('sidebar.recent')}</h3>}
        <div className="space-y-0.5">
            {filteredConversations.map(convo => (
              <div key={convo.id} className="relative group px-2">
                <button onClick={() => onSelectConversation(convo.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-200 ${activeConversationId === convo.id ? 'bg-sidebar-active text-sidebar-active-fg shadow-sm' : 'text-sidebar-fg hover:bg-sidebar-active/40'}`}>
                  <span className="text-sm truncate leading-relaxed opacity-90">{convo.title}</span>
                </button>
                <button onClick={(e) => handleDelete(e, convo.id)} className="absolute right-4 top-1/2 -translate-y-1/2 p-1.5 hover:bg-sidebar-active rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                  <Trash2Icon className="size-3 text-sidebar-muted-fg hover:text-red-500" />
                </button>
              </div>
            ))}
        </div>
      </div>
      
      <div className="p-4 border-t border-sidebar">
        <button onClick={onOpenSettings} className="w-full flex items-center gap-3 px-3 py-2 text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-active-fg rounded-lg transition-colors">
          <SettingsIcon className="size-4" />
          <span className="text-sm font-medium">{t('sidebar.settings')}</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;