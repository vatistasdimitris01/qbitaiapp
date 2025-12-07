

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
    <>
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} 
        onClick={toggleSidebar} 
        aria-hidden="true" 
      />
      <div className={`
        flex flex-col h-full bg-sidebar/95 backdrop-blur-xl z-50 fixed inset-y-0 left-0
        w-[280px] sm:w-[300px] transform transition-transform duration-500 cubic-bezier(0.19, 1, 0.22, 1) will-change-transform
        ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
        border-r border-sidebar
      `}>
        <div className="flex items-center justify-between px-5 py-5 border-b border-sidebar/50">
          <div className="flex items-center gap-3">
               <div className="size-8 bg-foreground rounded-xl flex items-center justify-center shadow-sm">
                  <div className="size-3 bg-background rounded-full"></div>
               </div>
              <div className="flex flex-col">
                <h2 className="text-sm font-bold text-sidebar-active-fg tracking-tight">Qbit</h2>
                <span className="text-[10px] text-sidebar-muted-fg font-medium">Pro Plan</span>
              </div>
          </div>
          <button onClick={toggleSidebar} className="p-2 hover:bg-sidebar-active rounded-lg text-sidebar-muted-fg hover:text-sidebar-fg transition-colors">
            <LayoutGridIcon className="rotate-180 size-5" />
          </button>
        </div>
        
        <div className="px-4 mt-4 mb-2">
            <button onClick={onNewChat} className="w-full flex items-center justify-start gap-3 px-4 py-3 bg-foreground text-background hover:opacity-90 rounded-xl transition-all shadow-sm">
              <SquarePenIcon className="size-4" />
              <span className="font-semibold text-sm">{t('sidebar.newChat')}</span>
            </button>
        </div>
  
        <div className="px-4 mb-2 mt-2">
            <div className="relative group">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-sidebar-muted-fg group-focus-within:text-sidebar-fg transition-colors" />
              <input 
                placeholder={t('sidebar.search')} 
                className="w-full pl-9 pr-3 py-2.5 bg-sidebar-active/50 text-sm text-sidebar-fg placeholder-sidebar-muted-fg outline-none rounded-xl focus:bg-sidebar-active focus:ring-1 focus:ring-sidebar-border transition-all" 
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-3 pb-2 mt-2">
          {filteredConversations.length > 0 && <h3 className="px-4 py-2 text-[10px] font-bold text-sidebar-muted-fg uppercase tracking-wider opacity-60">{t('sidebar.recent')}</h3>}
          <div className="space-y-1">
              {filteredConversations.map(convo => (
                <div key={convo.id} className="relative group px-1">
                  <button onClick={() => onSelectConversation(convo.id)} className={`w-full flex flex-col gap-0.5 px-4 py-3 rounded-xl text-left transition-all duration-200 ${activeConversationId === convo.id ? 'bg-sidebar-active text-sidebar-active-fg shadow-sm scale-[1.02]' : 'text-sidebar-fg hover:bg-sidebar-active/40 hover:scale-[1.01]'}`}>
                    <span className="text-sm font-medium truncate leading-tight">{convo.title}</span>
                    <span className="text-[10px] text-sidebar-muted-fg truncate opacity-70">{new Date(convo.createdAt).toLocaleDateString()}</span>
                  </button>
                  <button onClick={(e) => handleDelete(e, convo.id)} className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-background/50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2Icon className="size-3.5 text-sidebar-muted-fg hover:text-red-500" />
                  </button>
                </div>
              ))}
          </div>
        </div>
        
        <div className="p-4 border-t border-sidebar bg-sidebar/50 backdrop-blur-sm">
          <button onClick={onOpenSettings} className="w-full flex items-center gap-3 px-4 py-3 text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-active-fg rounded-xl transition-all duration-200 group">
            <div className="p-1 rounded-md bg-sidebar-active group-hover:bg-background transition-colors">
                 <SettingsIcon className="size-4" />
            </div>
            <span className="text-sm font-semibold">{t('sidebar.settings')}</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
