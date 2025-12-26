
import React, { useState, useEffect } from 'react';

export const Button: React.FC<{ variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; size?: 'sm' | 'md' | 'icon'; onClick?: (e: any) => void; children: React.ReactNode; className?: string; disabled?: boolean; type?: "button" | "submit" | "reset"; }> = ({ variant = 'primary', size = 'md', onClick, children, className = '', disabled, type = "button" }) => {
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
  return (<button type={type} className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>);
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
  return (<div className={`${bg} ${interactive ? 'cursor-pointer hover:opacity-80' : ''} rounded-lg border border-border ${className}`} onClick={onClick}>{children}</div>);
};

export const SkeletonLoader: React.FC<{ className?: string }> = ({ className }) => (<div className={`bg-surface-l2 animate-pulse rounded-md ${className}`} />);

export const GeneratingLoader: React.FC = () => (
  <div className="flex items-center justify-center">
    <div className="w-6 h-6 text-foreground">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%">
        <g transform="translate(12,12)">
          <circle r="1.6" className="loader-circle" opacity="0.2" />
          <circle r="1.6" transform="translate(6.4,0)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out' }} />
          <circle r="1.6" transform="translate(6.4,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.1s' }} />
          <circle r="1.6" transform="translate(0,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.2s' }} />
          <circle r="1.6" transform="translate(-6.4,6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.3s' }} />
          <circle r="1.6" transform="translate(-6.4,0)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.4s' }} />
          <circle r="1.6" transform="translate(-6.4,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.5s' }} />
          <circle r="1.6" transform="translate(0,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.6s' }} />
          <circle r="1.6" transform="translate(6.4,-6.4)" className="loader-circle" style={{ animation: 'pulse 2s infinite ease-in-out 0.7s' }} />
        </g>
      </svg>
    </div>
    <style>{`@keyframes pulse { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } } .loader-circle { fill: currentColor; }`}</style>
  </div>
);

export const AITextLoading: React.FC<{ texts?: string[] }> = ({ texts = ["Thinking...", "Processing...", "Analyzing...", "Computing...", "Almost there..."] }) => {
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  useEffect(() => {
    if (texts.length === 0) return;
    const timer = setInterval(() => { 
      setCurrentTextIndex((prev) => (prev + 1) % texts.length); 
      setAnimationKey(prev => prev + 1); 
    }, 1500);
    return () => clearInterval(timer);
  }, [texts]);
  if (texts.length === 0) return null;
  return (<div className="flex items-center justify-start py-2"><div className="relative w-full"><div key={animationKey} className="ai-text-loading text-base font-medium animate-fade-in-up">{texts[currentTextIndex]}</div></div></div>);
};
