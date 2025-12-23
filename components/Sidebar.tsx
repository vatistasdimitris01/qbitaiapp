
import React, { useState } from 'react';
import { Conversation } from '../types';
import {
  SearchIcon,
  ChevronLeftIcon,
  SettingsIcon,
  ChevronsRightIcon,
  Trash2Icon,
  SquarePenIcon
} from './icons';

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

const LogoIcon = () => (
  <div className="flex items-center justify-center size-10">
    <img 
      src="https://i.ibb.co/xSFyPCxH/Untitled-design-1-removebg-preview.png" 
      alt="Qbit Logo" 
      className="w-full h-full object-contain dark:hidden pointer-events-none"
    />
    <img 
      src="https://i.ibb.co/3yWj2f1Q/Untitled-design-removebg-preview.png" 
      alt="Qbit Logo" 
      className="w-full h-full object-contain hidden dark:block pointer-events-none"
    />
  </div>
);

const ChatIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="stroke-[2]" stroke="currentColor" strokeLinecap="square">
    <path d="M10 4V4C8.13623 4 7.20435 4 6.46927 4.30448C5.48915 4.71046 4.71046 5.48915 4.30448 6.46927C4 7.20435 4 8.13623 4 10V13.6C4 15.8402 4 16.9603 4.43597 17.816C4.81947 18.5686 5.43139 19.1805 6.18404 19.564C7.03968 20 8.15979 20 10.4 20H14C15.8638 20 16.7956 20 17.5307 19.6955C18.5108 19.2895 19.2895 18.5108 19.6955 17.5307C20 16.7956 20 15.8638 20 14V14" />
    <path d="M12.4393 14.5607L19.5 7.5C20.3284 6.67157 20.3284 5.32843 19.5 4.5C18.6716 3.67157 17.3284 3.67157 16.5 4.5L9.43934 11.5607C9.15804 11.842 9 12.2235 9 12.2235V15H11.3787C11.7765 15 12.158 14.842 12.4393 14.5607Z" />
  </svg>
);

const HistoryIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="stroke-[2]">
    <path d="M4.4999 3L4.4999 8H9.49988M4.4999 7.99645C5.93133 5.3205 8.75302 3.5 11.9999 3.5C16.6943 3.5 20.4999 7.30558 20.4999 12C20.4999 16.6944 16.6943 20.5 11.9999 20.5C7.6438 20.5 4.05303 17.2232 3.55811 13" />
    <path d="M15 9L12 12V16" />
  </svg>
);

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
  const [isSearchActive, setIsSearchActive] = useState(false);

  const filteredConversations = conversations.filter(convo => 
    convo.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const SidebarItem = ({ icon: Icon, label, onClick, isActive }: any) => (
    <button 
        onClick={onClick}
        className={`group flex items-center gap-3 w-full p-3 rounded-2xl transition-all text-left outline-none ${isActive ? 'bg-surface-l2 text-foreground font-bold shadow-sm' : 'text-muted-foreground hover:bg-surface-l1 hover:text-foreground'}`}
    >
        <div className="size-6 flex items-center justify-center shrink-0">
            <Icon />
        </div>
        {isOpen && (
            <span className="flex-1 text-sm truncate">{label}</span>
        )}
    </button>
  );

  return (
    <div className={`
      flex flex-col h-full bg-sidebar z-[80] fixed inset-y-0 left-0
      transform transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]
      border-r border-border
      ${isOpen ? 'translate-x-0 w-full lg:w-[260px]' : 'max-lg:-translate-x-full lg:translate-x-0 lg:w-[60px]'}
    `}>
      {/* Header Area - Glassy Toggle and Actions */}
      <div className="h-[6rem] flex flex-col justify-center px-4 shrink-0">
          <div className="flex items-center justify-between w-full">
              <button onClick={onNewChat} className="p-1 rounded-xl hover:bg-surface-l2 transition-colors focus:outline-none" aria-label="Home">
                  <LogoIcon />
              </button>
              
              {/* Mobile Close Button - Replaced with Glassy Double Arrow (>>) */}
              <button 
                  onClick={toggleSidebar}
                  className="lg:hidden size-12 rounded-full bg-white/5 dark:bg-white/10 backdrop-blur-2xl border border-white/10 flex items-center justify-center shadow-xl active:scale-95 transition-all text-foreground"
              >
                  <ChevronsRightIcon className="size-6" />
              </button>
          </div>
      </div>

      {/* Main Action Group - Glassy Design Reference */}
      {isOpen && (
          <div className="px-5 mb-4 space-y-4">
              <div className="flex items-center gap-2">
                   {/* Glassy Pill Search Bar */}
                   <div className="flex-1 relative flex items-center h-12 px-4 rounded-full bg-white/5 dark:bg-white/5 backdrop-blur-xl border border-white/10 text-muted-foreground focus-within:text-foreground focus-within:border-white/20 transition-all">
                        <SearchIcon className="size-4 mr-2" />
                        <input 
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search..."
                            className="bg-transparent border-none outline-none text-sm w-full h-full placeholder:text-muted-foreground/60"
                        />
                   </div>

                   {/* Circular Glassy Settings Button */}
                   <button 
                        onClick={onOpenSettings}
                        className="size-12 rounded-full bg-white/5 dark:bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all shadow-lg"
                        title="Settings"
                   >
                        <SettingsIcon className="size-5" />
                   </button>

                   {/* Circular Glassy New Chat Button */}
                   <button 
                        onClick={onNewChat}
                        className="size-12 rounded-full bg-white/5 dark:bg-white/5 backdrop-blur-xl border border-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all shadow-lg"
                        title="New Chat"
                   >
                        <SquarePenIcon className="size-5" />
                   </button>
              </div>
          </div>
      )}

      {/* Content Area - No Dividers */}
      <div className="flex min-h-0 flex-col overflow-auto grow relative overflow-x-hidden scrollbar-none px-4 space-y-1">
          <div className="py-2 shrink-0">
              <SidebarItem icon={ChatIcon} label="Chat" onClick={onNewChat} isActive={!activeConversationId} />
          </div>

          <div className="py-2 shrink-0 flex flex-col gap-1">
              <SidebarItem icon={HistoryIcon} label="History" onClick={() => {}} />

              {isOpen && (
                  <div className="flex flex-col gap-1 mt-3">
                      {filteredConversations.length > 0 && (
                          <div className="py-2 pl-3 text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] opacity-40">Recent History</div>
                      )}
                      
                      {filteredConversations.map(convo => (
                          <button
                              key={convo.id}
                              onClick={() => onSelectConversation(convo.id)}
                              className={`flex items-center gap-3 rounded-2xl text-left w-full h-[52px] transition-all px-4 text-sm ${activeConversationId === convo.id ? 'bg-surface-l1 text-foreground font-bold shadow-sm' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
                          >
                              <span className="flex-1 truncate select-none">{convo.title}</span>
                              <div 
                                  className="size-8 flex items-center justify-center hover:bg-red-500/10 hover:text-red-500 rounded-xl transition-colors opacity-0 group-hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                                  onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(t('sidebar.confirmDelete'))) onDeleteConversation(convo.id);
                                  }}
                              >
                                  <Trash2Icon className="size-4" />
                              </div>
                          </button>
                      ))}
                  </div>
              )}
          </div>
      </div>

      {/* Footer Area - No Dividers */}
      <div className={`mt-auto p-6 ${isOpen ? 'h-auto' : 'h-[80px]'}`}>
          <div className={`flex items-center ${isOpen ? 'justify-between' : 'justify-center flex-col gap-4'}`}>
              {!isOpen && (
                  <button 
                      onClick={onOpenSettings}
                      className="size-10 rounded-full hover:bg-surface-l2 transition-colors text-muted-foreground hover:text-foreground flex items-center justify-center"
                  >
                      <SettingsIcon className="size-5" />
                  </button>
              )}
              
              {/* Desktop Toggle Button */}
              <button 
                  onClick={toggleSidebar}
                  className={`hidden lg:flex items-center justify-center size-10 rounded-full hover:bg-surface-l2 transition-colors text-muted-foreground hover:text-foreground`}
              >
                  <ChevronLeftIcon className={`size-5 transition-transform ${!isOpen && 'rotate-180'}`} />
              </button>
          </div>
      </div>
    </div>
  );
};

export default Sidebar;
