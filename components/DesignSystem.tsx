
import React from 'react';

export const AppShell: React.FC<{ isSidebarOpen: boolean; children: React.ReactNode }> = ({ isSidebarOpen, children }) => {
  return (
    <div className="flex h-screen w-full bg-background overflow-hidden relative">
      {children}
    </div>
  );
};

export const ContentArea: React.FC<{ isPushed: boolean; children: React.ReactNode }> = ({ isPushed, children }) => {
  return (
    <main
      className={`
        flex-1 flex flex-col h-full relative transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)]
        ${isPushed ? 'lg:translate-x-[320px] lg:w-[calc(100%-320px)]' : 'translate-x-0 w-full'}
      `}
    >
      {children}
    </main>
  );
};

export const ModalBase: React.FC<{ children: React.ReactNode, onClose: () => void }> = ({ children, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-background rounded-xl shadow-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            {children}
        </div>
    </div>
);

export const Button: React.FC<{ 
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; 
    size?: 'sm' | 'md' | 'icon'; 
    onClick?: () => void; 
    children: React.ReactNode; 
    className?: string 
}> = ({ variant = 'primary', size = 'md', onClick, children, className = '' }) => {
    let baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
    
    let variantStyles = "";
    switch(variant) {
        case 'primary': variantStyles = "bg-foreground text-background hover:bg-foreground/90"; break;
        case 'secondary': variantStyles = "bg-surface-l2 text-foreground hover:bg-surface-l3"; break;
        case 'danger': variantStyles = "bg-red-500 text-white hover:bg-red-600"; break;
        case 'ghost': variantStyles = "hover:bg-surface-l2 text-foreground"; break;
    }

    let sizeStyles = "";
    switch(size) {
        case 'sm': sizeStyles = "h-8 px-3 text-xs"; break;
        case 'md': sizeStyles = "h-10 px-4 py-2"; break;
        case 'icon': sizeStyles = "h-10 w-10"; break;
    }

    return (
        <button className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`} onClick={onClick}>
            {children}
        </button>
    );
};

export const Text: React.FC<{ variant?: 'h1' | 'h2' | 'body' | 'small'; children: React.ReactNode; className?: string }> = ({ variant = 'body', children, className = '' }) => {
    let styles = "";
    switch(variant) {
        case 'h1': styles = "text-2xl font-bold tracking-tight"; break;
        case 'h2': styles = "text-xl font-semibold tracking-tight"; break;
        case 'body': styles = "text-base"; break;
        case 'small': styles = "text-sm font-medium leading-none"; break;
    }
    return <div className={`${styles} ${className}`}>{children}</div>
};

export const Surface: React.FC<{ level?: 'base' | 'l1' | 'l2' | 'l3'; interactive?: boolean; onClick?: () => void; children: React.ReactNode; className?: string }> = ({ level = 'base', interactive, onClick, children, className = '' }) => {
    let bg = "";
    switch(level) {
        case 'base': bg = "bg-surface-base"; break;
        case 'l1': bg = "bg-surface-l1"; break;
        case 'l2': bg = "bg-surface-l2"; break;
        case 'l3': bg = "bg-surface-l3"; break;
    }
    return (
        <div className={`${bg} ${interactive ? 'cursor-pointer hover:opacity-80' : ''} rounded-lg border border-border ${className}`} onClick={onClick}>
            {children}
        </div>
    );
}
