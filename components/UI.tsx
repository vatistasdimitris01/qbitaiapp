
import React, { useState, useEffect } from 'react';
import { 
  PauseIcon, PlayIcon, Maximize2Icon, ArrowRightIcon, FileTextIcon, CodeXmlIcon, ImageIcon 
} from './Icons';

// ==========================================
// 6. DESIGN SYSTEM
// ==========================================

export const AppShell: React.FC<{ isSidebarOpen: boolean; children: React.ReactNode }> = ({ children }) => (<div className="flex h-screen w-full bg-background overflow-hidden relative">{children}</div>);
export const ContentArea: React.FC<{ isPushed: boolean; children: React.ReactNode }> = ({ isPushed, children }) => (<main className={`flex-1 flex flex-col h-full relative transition-all duration-500 ease-[cubic-bezier(0.2,0,0,1)] ${isPushed ? 'lg:translate-x-[320px] lg:w-[calc(100%-320px)]' : 'translate-x-0 w-full'}`}>{children}</main>);
export const Button: React.FC<{ variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' | 'icon'; onClick?: (e:any) => void; children: React.ReactNode; className?: string }> = ({ variant = 'primary', size = 'md', onClick, children, className = '' }) => {
    let baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
    let variantStyles = "";
    switch(variant) { case 'primary': variantStyles = "bg-foreground text-background hover:bg-foreground/90"; break; case 'secondary': variantStyles = "bg-surface-l2 text-foreground hover:bg-surface-l3"; break; case 'danger': variantStyles = "bg-red-500 text-white hover:bg-red-600"; break; case 'ghost': variantStyles = "hover:bg-surface-l2 text-foreground"; break; }
    let sizeStyles = "";
    switch(size) { case 'sm': sizeStyles = "h-8 px-3 text-xs"; break; case 'md': sizeStyles = "h-10 px-4 py-2"; break; case 'icon': sizeStyles = "h-10 w-10"; break; }
    return (<button className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`} onClick={onClick}>{children}</button>);
};
export const Text: React.FC<{ variant?: 'h1' | 'h2' | 'body' | 'small'; children: React.ReactNode; className?: string }> = ({ variant = 'body', children, className = '' }) => {
    let styles = "";
    switch(variant) { case 'h1': styles = "text-2xl font-bold tracking-tight"; break; case 'h2': styles = "text-xl font-semibold tracking-tight"; break; case 'body': styles = "text-base"; break; case 'small': styles = "text-sm font-medium leading-none"; break; }
    return <div className={`${styles} ${className}`}>{children}</div>
};
export const Surface: React.FC<{ level?: 'base' | 'l1' | 'l2' | 'l3'; interactive?: boolean; onClick?: () => void; children: React.ReactNode; className?: string }> = ({ level = 'base', interactive, onClick, children, className = '' }) => {
    let bg = "";
    switch(level) { case 'base': bg = "bg-surface-base"; break; case 'l1': bg = "bg-surface-l1"; break; case 'l2': bg = "bg-surface-l2"; break; case 'l3': bg = "bg-surface-l3"; break; }
    return (<div className={`${bg} ${interactive ? 'cursor-pointer hover:opacity-80' : ''} rounded-lg border border-border ${className}`} onClick={onClick}>{children}</div>);
}

// ==========================================
// 7. SMALL COMPONENTS
// ==========================================

export const SkeletonLoader: React.FC<{ className?: string }> = ({ className }) => (<div className={`bg-token-surface-secondary animate-skeleton-pulse rounded-md ${className}`} />);
export const GeneratingLoader: React.FC = () => (<div className="flex items-center justify-center"><div className="w-6 h-6 text-foreground"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%"><g transform="translate(12,12)"><circle r="1.6" className="loader-circle" opacity="0.2" /><circle r="1.6" transform="translate(6.4,0)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out' }} /><circle r="1.6" transform="translate(6.4,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.1s' }} /><circle r="1.6" transform="translate(0,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.2s' }} /><circle r="1.6" transform="translate(-6.4,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.3s' }} /><circle r="1.6" transform="translate(-6.4,0)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.4s' }} /><circle r="1.6" transform="translate(-6.4,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.5s' }} /><circle r="1.6" transform="translate(0,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.6s' }} /><circle r="1.6" transform="translate(6.4,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.7s' }} /></g></svg></div><style>{`@keyframes pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } } .loader-circle { fill: currentColor; }`}</style></div>);

export const AITextLoading: React.FC<{ texts?: string[] }> = ({ texts = ["Thinking...", "Processing...", "Analyzing...", "Computing...", "Almost there..."] }) => {
    const [currentTextIndex, setCurrentTextIndex] = useState(0);
    const [animationKey, setAnimationKey] = useState(0);
    useEffect(() => {
        if (texts.length === 0) return;
        const timer = setInterval(() => { setCurrentTextIndex((prev) => (prev + 1) % texts.length); setAnimationKey(prev => prev + 1); }, 1500);
        return () => clearInterval(timer);
    }, [texts]);
    if (texts.length === 0) return null;
    return (<div className="flex items-center justify-start py-2"><div className="relative w-full"><div key={animationKey} className="ai-text-loading text-base font-medium animate-fade-in-up">{texts[currentTextIndex]}</div></div></div>);
};

export const AudioPlayer: React.FC<{ src: string; t: (key: string) => string; }> = ({ src, t }) => {
    const audioRef = React.useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        const onPlay = () => setIsPlaying(true); const onPause = () => setIsPlaying(false); const onEnded = () => setIsPlaying(false);
        audio.addEventListener('play', onPlay); audio.addEventListener('pause', onPause); audio.addEventListener('ended', onEnded);
        return () => { audio.removeEventListener('play', onPlay); audio.removeEventListener('pause', onPause); audio.removeEventListener('ended', onEnded); };
    }, []);
    return (<div className="flex items-center gap-3 px-4 py-3 bg-user-message rounded-full"><audio ref={audioRef} src={src} preload="metadata"></audio><button onClick={() => audioRef.current && (isPlaying ? audioRef.current.pause() : audioRef.current.play())} aria-label={isPlaying ? t('chat.audio.pause') : t('chat.audio.play')} className="flex items-center justify-center size-8 rounded-full bg-foreground text-background flex-shrink-0">{isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}</button></div>);
};

export const InlineImage: React.FC<{ src: string; alt: string; onExpand: () => void; }> = ({ src, alt, onExpand }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  return (
    <div className="relative inline-block align-middle my-1 mx-2 w-48 h-32 rounded-lg overflow-hidden group border border-default bg-token-surface-secondary">
      {status === 'loading' && <SkeletonLoader className="absolute inset-0" />}
      {status === 'error' && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground p-2 text-center text-xs">Image failed to load</div>}
      <img src={src} alt={alt} className={`w-full h-full object-cover transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`} onLoad={() => setStatus('loaded')} onError={() => setStatus('error')} loading="lazy" />
      {status === 'loaded' && <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" onClick={onExpand}><Maximize2Icon className="size-8 text-white" /></div>}
    </div>
  );
};

export const SelectionPopup: React.FC<{ x: number; y: number; text: string; onAsk: (text: string) => void; t: (key: string) => string; }> = ({ x, y, text, onAsk, t }) => (
    <div className="fixed z-[100] selection-popup-container" style={{ left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -115%)' }} onMouseDown={(e) => e.preventDefault()}>
      <div className="animate-fade-in-up">
        <button onClick={(e) => { e.stopPropagation(); onAsk(text); }} className="flex items-center gap-2 px-3 py-1.5 bg-card text-foreground rounded-lg shadow-2xl border border-default text-sm font-medium hover:bg-token-surface-secondary transition-colors"><ArrowRightIcon className="size-4" /><span>{t('selectionPopup.ask')}</span></button>
      </div>
    </div>
);

export const DragDropOverlay: React.FC<{ t: (key: string) => string; }> = ({ t }) => (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[200] flex flex-col items-center justify-center pointer-events-none animate-fade-in-up">
        <div className="relative mb-6"><FileTextIcon className="absolute top-1/2 left-1/2 -translate-x-[90%] -translate-y-[60%] size-16 text-blue-300/50 dark:text-blue-500/30 transform -rotate-12" /><CodeXmlIcon className="absolute top-1/2 left-1/2 -translate-x-[10%] -translate-y-[40%] size-16 text-blue-300/50 dark:text-blue-500/30 transform rotate-12" /><ImageIcon className="relative size-20 text-blue-500" /></div>
        <h2 className="text-2xl font-bold text-foreground">{t('dragDrop.title')}</h2><p className="text-muted-foreground mt-1">{t('dragDrop.subtitle')}</p>
    </div>
);

export const GreetingMessage: React.FC = () => (
    <div className="animate-fade-in-up flex flex-col items-center justify-center space-y-4">
      <div className="relative w-48 h-48 md:w-64 md:h-64">
        <img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP Logo" className="w-full h-full object-contain dark:hidden pointer-events-none drop-shadow-sm" />
        <img src="https://i.ibb.co/F4dP9PBf/Untitled-design-removebg-preview.png" alt="KIPP Logo" className="w-full h-full object-contain hidden dark:block pointer-events-none drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
      </div>
    </div>
);
