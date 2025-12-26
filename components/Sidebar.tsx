
import React, { useState } from 'react';
import { Conversation } from '../types';
import { 
  SearchIcon, SettingsIcon, SquarePenIcon, Trash2Icon, 
  ChevronsRightIcon 
} from './Icons';

export const Sidebar: React.FC<{ isOpen: boolean; toggleSidebar: () => void; conversations: Conversation[]; activeConversationId: string | null; onNewChat: () => void; onSelectConversation: (id: string) => void; onDeleteConversation: (id: string) => void; onOpenSettings: () => void; t: (key: string) => string; }> = ({ isOpen, toggleSidebar, conversations, activeConversationId, onNewChat, onSelectConversation, onDeleteConversation, onOpenSettings, t }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const filteredConversations = conversations.filter(convo => convo.title.toLowerCase().includes(searchTerm.toLowerCase()));
  return (
    <div className={`flex flex-col h-full bg-sidebar z-[100] fixed inset-y-0 left-0 transform transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] border-r border-border w-full lg:w-[320px] ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}>
      <div className="h-[6rem] flex items-center justify-between px-6">
        <button onClick={onNewChat} className="p-1 rounded-xl hover:bg-surface-l2 transition-colors">
          <img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP" className="size-10" />
        </button>
        <button onClick={toggleSidebar} className="size-10 rounded-full bg-surface-l2 flex items-center justify-center hover:bg-surface-l3"><ChevronsRightIcon className="size-6" /></button>
      </div>
      <div className="px-6 mb-6">
        <div className="relative flex items-center bg-surface-l1 border border-border rounded-full px-4 h-12">
          <SearchIcon className="size-5 text-muted-foreground mr-3" />
          <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder={t('sidebar.search')} className="bg-transparent outline-none w-full text-sm" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 space-y-1">
        {filteredConversations.map(convo => (
          <div key={convo.id} className={`flex items-center gap-2 group rounded-xl px-4 h-12 transition-all cursor-pointer ${activeConversationId === convo.id ? 'bg-surface-l1 font-bold' : 'text-muted-foreground hover:bg-surface-l2'}`} onClick={() => onSelectConversation(convo.id)}>
            <span className="flex-1 truncate">{convo.title}</span>
            <button className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all" onClick={(e) => { e.stopPropagation(); if (confirm(t('sidebar.confirmDelete'))) onDeleteConversation(convo.id); }}><Trash2Icon className="size-4" /></button>
          </div>
        ))}
      </div>
      <div className="p-6 border-t border-border flex gap-4">
        <button onClick={onOpenSettings} className="flex-1 h-12 rounded-xl bg-surface-l1 border border-border flex items-center justify-center hover:bg-surface-l2"><SettingsIcon className="size-5" /></button>
        <button onClick={onNewChat} className="flex-1 h-12 rounded-xl bg-foreground text-background flex items-center justify-center hover:opacity-90"><SquarePenIcon className="size-5" /></button>
      </div>
    </div>
  );
};
