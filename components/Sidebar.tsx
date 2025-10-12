
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
    if (window.confirm(t('confirmDeleteChat'))) {
      onDeleteConversation(id);
    }
  };

  const filteredConversations = conversations.filter(convo => 
    convo.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={`
      flex flex-col h-full bg-sidebar shadow-lg z-50 fixed inset-y-0 left-0
      w-72 transform transition-transform duration-300 ease-in-out
      ${isOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      <div className="flex items-center justify-between px-3 py-2 h-[57px] border-b border-sidebar">
        <div className="flex items-center gap-2">
            <img src="https://raw.githubusercontent.com/vatistasdimitris01/QbitAI/main/public/logo.png" alt="Qbit Logo" className="w-7 h-7" />
            <h2 className="text-lg font-semibold text-sidebar-active-fg tracking-tight">Qbit</h2>
        </div>
        <button onClick={toggleSidebar} className="p-2 hover:bg-sidebar-active rounded-lg text-sidebar-muted-fg hover:text-sidebar-fg" title={t('closeSidebar')}>
          <LayoutGridIcon className="transition-transform duration-500 ease-in-out rotate-180" />
        </button>
      </div>
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-3">
          <button onClick={onNewChat} className="w-full flex items-center gap-3 px-3 py-2 bg-sidebar-active text-sidebar-active-fg hover:opacity-90 rounded-lg transition-opacity shadow-sm">
            <SquarePenIcon className="size-4" />
            <span className="font-medium text-sm truncate">{t('newChat')}</span>
          </button>
        </div>
        <div className="px-3 pb-3">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sidebar-muted-fg" />
            <input 
              placeholder={t('searchConversations')} 
              className="w-full pl-9 pr-3 py-2 bg-transparent border border-sidebar rounded-lg text-sm text-sidebar-fg placeholder-sidebar-muted-fg outline-none focus:bg-sidebar-active focus:border-sidebar-active transition-colors" 
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2">
          <h3 className="px-2 text-xs font-semibold text-sidebar-muted-fg mb-2">{t('recentChats')}</h3>
          <div className="space-y-1">
            {filteredConversations.map(convo => (
              <div key={convo.id} className="relative group">
                <button onClick={() => onSelectConversation(convo.id)} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors truncate ${activeConversationId === convo.id ? 'bg-sidebar-active text-sidebar-active-fg' : 'text-sidebar-fg hover:bg-sidebar-active'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{convo.title}</div>
                  </div>
                </button>
                <button onClick={(e) => handleDelete(e, convo.id)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-sidebar-active/50 rounded opacity-0 group-hover:opacity-100 transition-opacity" title={t('removeChat')}>
                  <Trash2Icon className="size-3.5 text-sidebar-muted-fg hover:text-sidebar-fg" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="p-3 border-t border-sidebar">
        <button onClick={onOpenSettings} className="w-full flex items-center gap-3 px-3 py-2 text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-active-fg rounded-lg transition-colors">
          <SettingsIcon className="size-4" />
          <span className="text-sm">{t('settings')}</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
