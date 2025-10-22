import React, { useState, createContext, useContext } from 'react';
import { CitationSource } from '../types';
import { ChevronDownIcon } from './icons';

// --- Context for Hover Card ---
interface HoverCardContextType {
  isVisible: boolean;
  show: () => void;
  hide: () => void;
}
const HoverCardContext = createContext<HoverCardContextType>({
  isVisible: false,
  show: () => {},
  hide: () => {},
});

// --- Context for Carousel ---
interface CarouselContextType {
    currentIndex: number;
    total: number;
    canScrollPrev: boolean;
    canScrollNext: boolean;
    scrollPrev: () => void;
    scrollNext: () => void;
}
const CarouselContext = createContext<CarouselContextType>({
    currentIndex: 0,
    total: 0,
    canScrollPrev: false,
    canScrollNext: false,
    scrollPrev: () => {},
    scrollNext: () => {},
});


// --- Base Components ---

export const InlineCitation = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-block relative align-super mx-0.5" style={{ lineHeight: 1 }}>
        {children}
    </span>
);

export const InlineCitationText = ({ children, ...props }: React.ComponentProps<'span'>) => (
    <span {...props}>{children}</span>
);

export const InlineCitationCard = ({ children, ...props }: React.ComponentProps<'span'>) => {
    const [isVisible, setIsVisible] = useState(false);
    const show = () => setIsVisible(true);
    const hide = () => setIsVisible(false);
    
    return (
        <HoverCardContext.Provider value={{ isVisible, show, hide }}>
            <span onMouseEnter={show} onMouseLeave={hide} {...props}>
                {children}
            </span>
        </HoverCardContext.Provider>
    );
};

export const InlineCitationCardTrigger = ({ sources, children, ...props }: React.ComponentProps<'button'> & { sources: string[] }) => (
    <button
        type="button"
        className="relative inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-sidebar-active-fg bg-sidebar-active border border-sidebar rounded-full transition-transform duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-background"
        {...props}
    >
        {children}
        {sources.length > 1 && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full bg-blue-500 text-[8px] font-bold text-white">
                {sources.length}
            </span>
        )}
    </button>
);

export const InlineCitationCardBody = ({ children, ...props }: React.ComponentProps<'div'>) => {
    const { isVisible } = useContext(HoverCardContext);
    if (!isVisible) return null;
    return (
        <div
            role="tooltip"
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-card border border-default rounded-lg shadow-xl z-10 text-left animate-fade-in-up overflow-hidden"
            style={{ animationDuration: '200ms' }}
            {...props}
        >
            {children}
        </div>
    );
};

// --- Carousel Components ---

export const InlineCitationCarousel = ({ children, sources, ...props }: React.ComponentProps<'div'> & {sources: CitationSource[]}) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const total = sources.length;

    const scrollPrev = () => setCurrentIndex(i => (i - 1 + total) % total);
    const scrollNext = () => setCurrentIndex(i => (i + 1) % total);

    const value = {
        currentIndex,
        total,
        canScrollPrev: total > 1,
        canScrollNext: total > 1,
        scrollPrev,
        scrollNext,
    };

    return (
        <CarouselContext.Provider value={value}>
            <div {...props}>{children}</div>
        </CarouselContext.Provider>
    );
};

export const InlineCitationCarouselContent = ({ children, ...props }: React.ComponentProps<'div'>) => {
     const { currentIndex } = useContext(CarouselContext);
     const childrenArray = React.Children.toArray(children);
    return (
        <div {...props}>
            {childrenArray[currentIndex]}
        </div>
    );
};

export const InlineCitationCarouselItem = ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div {...props}>{children}</div>
);

export const InlineCitationCarouselHeader = ({ children, ...props }: React.ComponentProps<'div'>) => (
    <div className="flex items-center justify-between px-3 py-2 border-b border-default" {...props}>
        {children}
    </div>
);

export const InlineCitationCarouselIndex = ({ children, ...props }: React.ComponentProps<'div'>) => {
    const { currentIndex, total } = useContext(CarouselContext);
    return (
        <div className="text-xs font-mono text-muted-foreground" {...props}>
            {children || `${currentIndex + 1} / ${total}`}
        </div>
    );
};

export const InlineCitationCarouselPrev = (props: React.ComponentProps<'button'>) => {
    const { scrollPrev, canScrollPrev } = useContext(CarouselContext);
    return (
        <button onClick={scrollPrev} disabled={!canScrollPrev} className="p-1 rounded-full text-muted-foreground hover:bg-token-surface-secondary hover:text-foreground disabled:opacity-50" aria-label="Previous source" {...props}>
            <ChevronDownIcon className="size-4 rotate-90" />
        </button>
    );
};

export const InlineCitationCarouselNext = (props: React.ComponentProps<'button'>) => {
    const { scrollNext, canScrollNext } = useContext(CarouselContext);
    return (
        <button onClick={scrollNext} disabled={!canScrollNext} className="p-1 rounded-full text-muted-foreground hover:bg-token-surface-secondary hover:text-foreground disabled:opacity-50" aria-label="Next source" {...props}>
            <ChevronDownIcon className="size-4 -rotate-90" />
        </button>
    );
};

// --- Content Components ---

export const InlineCitationSource = ({ title, url, description, ...props }: React.ComponentProps<'div'> & { title?: string, url?: string, description?: string }) => {
    let hostname = 'source';
    try {
      if(url) hostname = new URL(url).hostname.replace(/^www\./, '');
    } catch (e) { /* invalid URL */ }

    return (
        <div className="p-3" {...props}>
            <div className="flex flex-col gap-1.5">
                {url && title && (
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors break-words leading-snug"
                    >
                        {title}
                    </a>
                )}
                <p className="text-xs text-muted-foreground break-words truncate">
                    {hostname}
                </p>
                {description && (
                    <p className="text-xs text-muted-foreground mt-1">{description}</p>
                )}
            </div>
        </div>
    );
};

export const InlineCitationQuote = ({ children, ...props }: React.ComponentProps<'blockquote'>) => (
    <blockquote className="text-xs italic border-l-2 border-default text-muted-foreground !my-0 !p-0 !pl-3 !border-l-2 mx-3 mb-3" {...props}>
        {children}
    </blockquote>
);
