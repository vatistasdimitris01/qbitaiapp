
import React, { useState } from 'react';
import { Conversation } from '../types';
import { ChevronsRightIcon, SearchIcon, SettingsIcon, SquarePenIcon, Trash2Icon } from './icons';

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

const Sidebar: React.FC<SidebarProps> = ({ isOpen, toggleSidebar, conversations, activeConversationId, onNewChat, onSelectConversation, onDeleteConversation, onOpenSettings, t }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const filteredConversations = conversations.filter(convo => convo.title.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className={`flex flex-col h-full bg-gray-50 dark:bg-zinc-950 z-[100] fixed inset-y-0 left-0 transform transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] border-r border-border w-full lg:w-[320px] ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
      <div className="h-[6rem] flex flex-col justify-center px-6 shrink-0">
        <div className="flex items-center justify-between w-full">
          <button onClick={onNewChat} className="p-1 rounded-xl hover:bg-gray-100 dark:hover:bg-zinc-900 transition-colors">
            <div className="flex items-center justify-center size-10">
              <img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP Logo" className="w-full h-full object-contain" />
            </div>
          </button>
          <button onClick={toggleSidebar} className="size-12 rounded-full bg-white dark:bg-zinc-900 border border-border flex items-center justify-center shadow-xl active:scale-95 transition-all text-black dark:text-white">
            <ChevronsRightIcon className="size-6" />
          </button>
        </div>
      </div>
      <div className="px-6 mb-6 relative h-12 flex items-center">
        <div className="flex items-center gap-2 w-full relative">
          <div className={`relative flex items-center h-12 px-4 rounded-full bg-white dark:bg-zinc-900 border border-border text-muted-foreground focus-within:text-black dark:focus-within:text-white transition-all duration-500 shadow-sm ${isSearchFocused ? 'w-full z-10' : 'w-[calc(100%-104px)]'}`}>
            <SearchIcon className="size-5 mr-3 shrink-0" />
            <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setIsSearchFocused(false)} placeholder={t('sidebar.search')} className="bg-transparent border-none outline-none text-sm w-full h-full placeholder:text-muted-foreground/60 font-medium text-black dark:text-white" />
          </div>
          <div className={`flex items-center gap-2 transition-all duration-300 absolute right-0 ${isSearchFocused ? 'opacity-0 scale-75 pointer-events-none translate-x-4' : 'opacity-100 scale-100 translate-x-0'}`}>
            <button onClick={onOpenSettings} className="size-12 rounded-full bg-white dark:bg-zinc-900 border border-border flex items-center justify-center text-black dark:text-white hover:opacity-80 transition-all shadow-lg"><SettingsIcon className="size-5" /></button>
            <button onClick={onNewChat} className="size-12 rounded-full bg-white dark:bg-zinc-900 border border-border flex items-center justify-center text-black dark:text-white hover:opacity-80 transition-all shadow-lg"><SquarePenIcon className="size-5" /></button>
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-col overflow-auto grow px-6 space-y-1 scrollbar-none">
        <div className="flex flex-col gap-1 mt-2">
          {filteredConversations.length > 0 && (<div className="py-2 pl-3 text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-40">{t('sidebar.recent')}</div>)}
          {filteredConversations.map(convo => (
            <button key={convo.id} onClick={() => onSelectConversation(convo.id)} className={`flex items-center gap-3 rounded-2xl text-left w-full h-[52px] transition-all px-4 text-sm group ${activeConversationId === convo.id ? 'bg-white dark:bg-zinc-900 text-foreground font-bold shadow-sm' : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-zinc-900 hover:text-foreground'}`}>
              <span className="flex-1 truncate select-none">{convo.title}</span>
              <div className="size-8 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-colors opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); if (confirm(t('sidebar.confirmDelete'))) onDeleteConversation(convo.id); }}>
                <Trash2Icon className="size-4" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
