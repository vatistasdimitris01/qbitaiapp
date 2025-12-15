import React, { useState } from 'react';
import { Conversation } from '../types';
import {
  MoreHorizontalIcon,
  SearchIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SettingsIcon
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

// --- Icons from Design ---

const LogoIcon = () => (
  <svg width="35" height="33" viewBox="0 0 35 33" fill="none" className="fill-foreground w-7 h-7">
    <path d="M13.2371 21.0407L24.3186 12.8506C24.8619 12.4491 25.6384 12.6057 25.8973 13.2294C27.2597 16.5185 26.651 20.4712 23.9403 23.1851C21.2297 25.8989 17.4581 26.4941 14.0108 25.1386L10.2449 26.8843C15.6463 30.5806 22.2053 29.6665 26.304 25.5601C29.5551 22.3051 30.562 17.8683 29.6205 13.8673L29.629 13.8758C28.2637 7.99809 29.9647 5.64871 33.449 0.844576C33.5314 0.730667 33.6139 0.616757 33.6964 0.5L29.1113 5.09055V5.07631L13.2343 21.0436" fill="currentColor" />
    <path d="M10.9503 23.0313C7.07343 19.3235 7.74185 13.5853 11.0498 10.2763C13.4959 7.82722 17.5036 6.82767 21.0021 8.2971L24.7595 6.55998C24.0826 6.07017 23.215 5.54334 22.2195 5.17313C17.7198 3.31926 12.3326 4.24192 8.67479 7.90126C5.15635 11.4239 4.0499 16.8403 5.94992 21.4622C7.36924 24.9165 5.04257 27.3598 2.69884 29.826C1.86829 30.7002 1.0349 31.5745 0.36364 32.5L10.9474 23.0341" fill="currentColor" />
  </svg>
);

const ChatIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="stroke-[2]" stroke="currentColor" strokeLinecap="square">
    <path d="M10 4V4C8.13623 4 7.20435 4 6.46927 4.30448C5.48915 4.71046 4.71046 5.48915 4.30448 6.46927C4 7.20435 4 8.13623 4 10V13.6C4 15.8402 4 16.9603 4.43597 17.816C4.81947 18.5686 5.43139 19.1805 6.18404 19.564C7.03968 20 8.15979 20 10.4 20H14C15.8638 20 16.7956 20 17.5307 19.6955C18.5108 19.2895 19.2895 18.5108 19.6955 17.5307C20 16.7956 20 15.8638 20 14V14" />
    <path d="M12.4393 14.5607L19.5 7.5C20.3284 6.67157 20.3284 5.32843 19.5 4.5C18.6716 3.67157 17.3284 3.67157 16.5 4.5L9.43934 11.5607C9.15804 11.842 9 12.2235 9 12.6213V15H11.3787C11.7765 15 12.158 14.842 12.4393 14.5607Z" />
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

  const handleSearchClick = () => {
      if (isOpen) {
          setIsSearchActive(true);
      } else {
          toggleSidebar();
          setTimeout(() => setIsSearchActive(true), 200);
      }
  };

  const SidebarItem = ({ icon: Icon, label, onClick, isActive, shortcut }: any) => (
    <button 
        onClick={onClick}
        className={`group flex items-center gap-2 w-full p-1.5 rounded-xl transition-colors text-left outline-none ${isActive ? 'bg-surface-l2 text-foreground' : 'text-muted-foreground hover:bg-surface-l2 hover:text-foreground'}`}
        title={label}
    >
        <div className={`size-6 flex items-center justify-center shrink-0 transition-transform ${!isOpen && 'group-hover:scale-110'}`}>
            <Icon />
        </div>
        {isOpen && (
            <span className="flex-1 text-sm font-medium truncate">{label}</span>
        )}
        {isOpen && shortcut && (
            <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">{shortcut}</span>
        )}
    </button>
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
        transform transition-all duration-200 ease-linear
        border-r border-border
        ${isOpen ? 'translate-x-0 w-[260px]' : '-translate-x-full lg:translate-x-0 lg:w-[60px]'}
      `}>
        {/* Header (Logo) */}
        <div className="h-[3.5rem] flex flex-row items-center shrink-0 px-2">
            <button onClick={onNewChat} className="block w-fit p-1 mx-0.5 shrink-0 hover:bg-surface-l2 rounded-xl transition-colors" aria-label="Home">
                <LogoIcon />
            </button>
        </div>

        {/* Content */}
        <div className="flex min-h-0 flex-col overflow-auto grow relative overflow-x-hidden scrollbar-none">
            {/* Search */}
            <div className={`relative w-full min-w-0 flex-col px-1.5 shrink-0 transition-all duration-200 py-1 ${isOpen ? 'h-[3rem]' : 'h-auto flex justify-center'}`}>
                {isOpen ? (
                    isSearchActive ? (
                        <div className="flex items-center px-[7px] rounded-full border border-border bg-surface-l1 h-[2.5rem] mx-[.125rem]">
                            <SearchIcon className="size-4 text-muted-foreground ml-2 mr-2" />
                            <input 
                                autoFocus
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onBlur={() => !searchTerm && setIsSearchActive(false)}
                                placeholder={t('sidebar.search')}
                                className="bg-transparent border-none outline-none text-sm text-foreground w-full h-full placeholder:text-muted-foreground"
                            />
                        </div>
                    ) : (
                        <button 
                            onClick={handleSearchClick}
                            className="flex items-center gap-2 text-left w-full hover:bg-surface-l2 text-sm hover:text-foreground flex-1 px-[7px] rounded-full border border-border bg-surface-l1 justify-start text-muted-foreground h-[2.5rem] mx-[.125rem] transition-colors"
                        >
                            <div className="flex items-center justify-center size-6 shrink-0">
                                <SearchIcon className="size-4" />
                            </div>
                            <span className="align-baseline truncate flex-1">
                                <span>Search</span>
                            </span>
                            <span className="text-xs text-muted-foreground mr-1">Ctrl+K</span>
                        </button>
                    )
                ) : (
                    <button onClick={handleSearchClick} className="flex items-center justify-center size-10 rounded-xl hover:bg-surface-l2 text-muted-foreground hover:text-foreground transition-colors">
                        <SearchIcon className="size-4" />
                    </button>
                )}
            </div>

            {/* Navigation Groups */}
            <div className="flex w-full min-w-0 flex-col px-1.5 py-[2px] shrink-0 gap-0.5">
                <SidebarItem icon={ChatIcon} label="Chat" onClick={onNewChat} isActive={!activeConversationId} />
            </div>

            {/* History Section */}
            <div className="flex w-full min-w-0 flex-col px-1.5 py-[2px] shrink-0 mt-2 gap-0.5">
                {/* Standardized History Item as Trigger */}
                <SidebarItem icon={HistoryIcon} label="History" onClick={() => {}} />

                {/* History List - Only visible when open */}
                {isOpen && (
                    <div className="flex flex-row gap-px mx-1 mt-1 pl-1.5">
                        {/* Tree Line */}
                        <div className="cursor-pointer ms-[8px] me-[2px] py-1">
                            <div className="border-l border-border h-full ms-[10px] me-[4px]"></div>
                        </div>
                        
                        {/* Items */}
                        <div className="flex flex-col gap-px w-full min-w-0">
                            {filteredConversations.length > 0 && (
                                <div className="py-1 pl-3 text-xs text-muted-foreground sticky top-0 z-20 text-nowrap font-semibold">Recent</div>
                            )}
                            
                            {filteredConversations.length === 0 && searchTerm && (
                                <div className="py-2 pl-3 text-sm text-muted-foreground">No results</div>
                            )}

                            {filteredConversations.map(convo => (
                                <div key={convo.id} className="relative group/sidebar-menu-item">
                                    <button
                                        onClick={() => onSelectConversation(convo.id)}
                                        className={`flex items-center gap-2 rounded-xl text-left w-full h-[36px] transition-colors pl-3 pr-1.5 text-sm ${activeConversationId === convo.id ? 'bg-surface-l2 text-foreground' : 'text-muted-foreground hover:bg-surface-l2 hover:text-foreground'}`}
                                    >
                                        <span className="flex-1 select-none text-nowrap max-w-full overflow-hidden inline-block truncate">
                                            {convo.title}
                                        </span>
                                        
                                        {/* Hover Options */}
                                        <div 
                                            className="items-center justify-center h-6 w-6 hidden group-hover/sidebar-menu-item:flex hover:bg-surface-l1 rounded-lg text-muted-foreground hover:text-foreground transition-colors z-10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm(t('sidebar.confirmDelete'))) onDeleteConversation(convo.id);
                                            }}
                                        >
                                            <MoreHorizontalIcon className="size-3.5" />
                                        </div>
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Footer */}
        <div className={`mt-auto relative shrink-0 ${isOpen ? 'h-[56px]' : 'h-[96px]'}`}>
            <div className={`absolute start-[.5rem] transition-transform duration-300 ${isOpen ? 'bottom-3 translate-y-0' : 'bottom-3 -translate-y-[44px]'}`}>
                <div className={`flex items-center gap-2 ${!isOpen && 'flex-col-reverse'}`}>
                    <button 
                        onClick={onOpenSettings}
                        className="flex items-center justify-center p-2 rounded-lg border border-transparent hover:bg-surface-l2 transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <SettingsIcon className="size-5" />
                    </button>
                </div>
            </div>
            
            <div className="flex items-center justify-between px-4 py-2">
                <div className={`cursor-${isOpen ? 'w' : 'e'}-resize grow`}>
                    <button 
                        onClick={toggleSidebar}
                        className={`inline-flex items-center justify-center h-10 w-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-surface-l2 transition-colors absolute ${isOpen ? 'end-2 bottom-3' : 'start-1.5 bottom-3'}`}
                    >
                        {isOpen ? <ChevronLeftIcon className="size-5" /> : <ChevronRightIcon className="size-5" />}
                        <span className="sr-only">Toggle Sidebar</span>
                    </button>
                </div>
            </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;