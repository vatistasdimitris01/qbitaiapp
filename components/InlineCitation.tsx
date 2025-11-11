import React, { useState, createContext, useContext, useRef, useEffect, useCallback } from 'react';
// FIX: Correctly import the 'CitationSource' type, which is now defined in types.ts.
import type { CitationSource } from '../types';
// FIX: Correctly import 'ChevronLeftIcon' and 'ChevronRightIcon', which are now defined in icons.tsx.
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { getDisplayDomain } from '../utils/url';

// --- Hover Card Context & Hook ---
interface HoverCardContextType {
  isOpen: boolean;
  openCard: () => void;
  closeCard: () => void;
}
const HoverCardContext = createContext<HoverCardContextType | null>(null);
const useHoverCard = () => {
  const context = useContext(HoverCardContext);
  if (!context) throw new Error('useHoverCard must be used within a HoverCardProvider');
  return context;
};

// --- Carousel Context & Hook ---
interface CarouselContextType {
  activeIndex: number;
  totalSlides: number;
  goToPrev: () => void;
  goToNext: () => void;
}
const CarouselContext = createContext<CarouselContextType | null>(null);
const useCarousel = () => {
  const context = useContext(CarouselContext);
  if (!context) throw new Error('useCarousel must be used within a CarouselProvider');
  return context;
};

// --- Components ---

export const InlineCitation: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-block relative align-baseline mx-0.5">{children}</span>
);

export const InlineCitationCard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const openCard = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsOpen(true);
  };
  const closeCard = () => {
    timerRef.current = window.setTimeout(() => setIsOpen(false), 150);
  };

  return (
    <HoverCardContext.Provider value={{ isOpen, openCard, closeCard }}>
      <div onMouseEnter={openCard} onMouseLeave={closeCard} onFocus={openCard} onBlur={closeCard}>
        {children}
      </div>
    </HoverCardContext.Provider>
  );
};

export const InlineCitationCardTrigger: React.FC<{ number: string; sources: CitationSource[] }> = ({ number, sources }) => {
  const { openCard } = useHoverCard();
  const domain = sources.length > 0 ? getDisplayDomain(sources[0].url) : 'source';

  return (
    <button
      type="button"
      onFocus={openCard}
      className="inline-flex h-5 items-center overflow-hidden rounded-md px-2 text-[11px] font-medium transition-colors duration-150 ease-in-out text-token-secondary bg-token-surface-secondary hover:bg-border no-underline relative -top-0.5"
    >
      <span className="font-semibold">{number}</span>
      {sources.length > 1 && <span className="mx-1 text-gray-300 dark:text-gray-600">|</span>}
      <span className="max-w-[20ch] truncate">{sources.length > 1 ? `${sources.length} sources` : domain}</span>
    </button>
  );
};

export const InlineCitationCardBody: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isOpen } = useHoverCard();
  return (
    <div
      className={`absolute bottom-full left-1/2 mb-2 -translate-x-1/2 w-80 z-20 transition-all duration-200 ease-in-out ${isOpen ? 'opacity-100 visible translate-y-0' : 'opacity-0 invisible -translate-y-1'}`}
      role="dialog"
    >
      <div className="bg-card border border-default rounded-lg shadow-2xl overflow-hidden">
        {children}
      </div>
    </div>
  );
};

export const InlineCitationCarousel: React.FC<{ children: React.ReactNode, sources: CitationSource[] }> = ({ children, sources }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const totalSlides = sources.length;

  const goToPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  const goToNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % totalSlides);
  }, [totalSlides]);

  return (
    <CarouselContext.Provider value={{ activeIndex, totalSlides, goToPrev, goToNext }}>
        <div className="relative">{children}</div>
    </CarouselContext.Provider>
  );
};

export const InlineCitationCarouselHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex items-center justify-between p-2 border-b border-default bg-token-surface-secondary/50">
        {children}
    </div>
);

export const InlineCitationCarouselPrev: React.FC = () => {
    const { goToPrev, totalSlides } = useCarousel();
    if (totalSlides <= 1) return null;
    return <button onClick={goToPrev} className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-background"><ChevronLeftIcon className="size-4" /></button>;
};

export const InlineCitationCarouselNext: React.FC = () => {
    const { goToNext, totalSlides } = useCarousel();
    if (totalSlides <= 1) return null;
    return <button onClick={goToNext} className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-background"><ChevronRightIcon className="size-4" /></button>;
};

export const InlineCitationCarouselIndex: React.FC = () => {
    const { activeIndex, totalSlides } = useCarousel();
    if (totalSlides <= 1) return null;
    return <div className="text-xs text-muted-foreground font-mono">{activeIndex + 1}/{totalSlides}</div>;
};

export const InlineCitationCarouselContent: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { activeIndex } = useCarousel();
    return (
        <div className="overflow-hidden">
            <div className="flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${activeIndex * 100}%)` }}>
                {children}
            </div>
        </div>
    );
};

export const InlineCitationCarouselItem: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="flex-shrink-0 w-full p-3">{children}</div>
);

export const InlineCitationSource: React.FC<CitationSource> = ({ title, url, description }) => (
    <div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-foreground hover:underline no-underline block truncate">
            {title}
        </a>
        <p className="text-xs text-blue-500 dark:text-blue-400 mt-0.5 truncate">{getDisplayDomain(url)}</p>
        {description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{description}</p>}
    </div>
);

export const InlineCitationQuote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <blockquote className="mt-3 text-xs border-l-2 border-default pl-2 italic text-muted-foreground">
        {children}
    </blockquote>
);