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
      w-72 transform transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'}
      border-r border-sidebar
    `}>
      <div className="flex items-center justify-between px-4 py-3 h-[60px]">
        <div className="flex items-center gap-2">
            <img src="https://raw.githubusercontent.com/vatistasdimitris01/QbitAI/main/public/logo.png" alt="Qbit Logo" className="w-6 h-6" />
            <h2 className="text-base font-semibold text-sidebar-active-fg tracking-tight">{t('sidebar.header')}</h2>
        </div>
        <button onClick={toggleSidebar} className="p-1.5 hover:bg-sidebar-active rounded-md text-sidebar-muted-fg hover:text-sidebar-fg transition-colors" title={t('sidebar.close')}>
          <LayoutGridIcon className="transition-transform duration-500 ease-in-out rotate-180 size-5" />
        </button>
      </div>
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2">
          <button onClick={onNewChat} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-foreground text-background hover:opacity-90 rounded-full transition-opacity shadow-sm">
            <SquarePenIcon className="size-4" />
            <span className="font-medium text-sm">{t('sidebar.newChat')}</span>
          </button>
        </div>
        <div className="px-4 pb-2 pt-1">
          <div className="relative group">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sidebar-muted-fg group-focus-within:text-sidebar-fg transition-colors" />
            <input 
              placeholder={t('sidebar.search')} 
              className="w-full pl-9 pr-3 py-1.5 bg-transparent border border-sidebar rounded-lg text-sm text-sidebar-fg placeholder-sidebar-muted-fg outline-none focus:bg-sidebar-active transition-colors" 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filteredConversations.length > 0 && <h3 className="px-3 text-xs font-medium text-sidebar-muted-fg mb-2 uppercase tracking-wider">{t('sidebar.recent')}</h3>}
          <div className="space-y-0.5">
            {filteredConversations.map(convo => (
              <div key={convo.id} className="relative group">
                <button onClick={() => onSelectConversation(convo.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-all duration-200 truncate ${activeConversationId === convo.id ? 'bg-sidebar-active text-sidebar-active-fg font-medium' : 'text-sidebar-fg hover:bg-sidebar-active/50'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate leading-snug">{convo.title}</div>
                  </div>
                </button>
                <button onClick={(e) => handleDelete(e, convo.id)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-sidebar-active rounded-md opacity-0 group-hover:opacity-100 transition-opacity" title={t('sidebar.remove')}>
                  <Trash2Icon className="size-3.5 text-sidebar-muted-fg hover:text-red-500" />
                </button>
              </div>
            ))}
          </div>
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