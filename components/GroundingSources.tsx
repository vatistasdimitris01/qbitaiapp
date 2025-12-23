
import React, { useState } from 'react';
import { GroundingChunk, MapsPlaceReviewSnippet } from '../types';
import { MapPinIcon, XIcon, SearchIcon } from './icons';

const getDomain = (url: string): string => {
    if (!url) return 'source';
    try {
        const hostname = new URL(url).hostname;
        return hostname.replace(/^www\./, '');
    } catch (e) {
        return 'source';
    }
};

const getHostname = (url: string): string => {
    if (!url) return 'google.com';
    try {
        return new URL(url).hostname;
    } catch (e) {
        return 'google.com';
    }
};

const getOrigin = (url: string): string => {
    if (!url) return '';
    try {
        return new URL(url).origin;
    } catch (e) {
        return '';
    }
};

interface GroundingSourcesProps {
    chunks: GroundingChunk[];
    t: (key: string) => string;
}

const GroundingSources: React.FC<GroundingSourcesProps> = ({ chunks, t }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (!chunks || chunks.length === 0) return null;

    const visibleChunks = chunks.slice(0, 3);

    const SourceList = () => (
        <div className="flex flex-col gap-1">
            {chunks.map((chunk, index) => {
                if ('web' in chunk && chunk.web.uri) {
                    const origin = getOrigin(chunk.web.uri);
                    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${getHostname(chunk.web.uri)}`;

                    return (
                        <a
                            key={index}
                            href={chunk.web.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-l1 dark:hover:bg-[#292929] transition-all border border-transparent hover:border-border group"
                        >
                            <div className="size-10 rounded-xl bg-surface-l2 dark:bg-[#1f1f1f] flex items-center justify-center shrink-0 border border-border transition-colors group-hover:bg-background">
                                <img src={faviconUrl} alt="" className="size-5 rounded-sm" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-foreground truncate">{chunk.web.title}</p>
                                <p className="text-[11px] text-muted-foreground truncate uppercase tracking-wider font-semibold">{getDomain(chunk.web.uri)}</p>
                            </div>
                        </a>
                    );
                }
                if ('maps' in chunk && chunk.maps.uri) {
                    return (
                        <a
                            key={index}
                            href={chunk.maps.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-l1 dark:hover:bg-[#292929] transition-all border border-transparent hover:border-border group"
                        >
                            <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                                <MapPinIcon className="size-5 text-blue-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-foreground truncate">{chunk.maps.title}</p>
                                <p className="text-[11px] text-muted-foreground truncate uppercase tracking-wider font-semibold">Google Maps</p>
                            </div>
                        </a>
                    );
                }
                return null;
            })}
        </div>
    );

    return (
        <>
            <button
                type="button"
                className="flex items-center gap-2 group px-3 py-1.5 rounded-full hover:bg-surface-l1 dark:hover:bg-[#292929] border border-border transition-all shadow-sm"
                onClick={() => setIsModalOpen(true)}
                aria-label={t('chat.message.grounding')}
            >
                <div className="flex items-center -space-x-2 cursor-pointer">
                    {visibleChunks.map((chunk, index) => {
                         const icon = 'web' in chunk 
                            ? `https://www.google.com/s2/favicons?sz=32&domain_url=${getHostname(chunk.web.uri)}`
                            : null;

                         return (
                            <div key={index} className="size-5 rounded-full bg-background border-2 border-background ring-1 ring-border overflow-hidden flex items-center justify-center">
                                {icon ? <img src={icon} alt="" className="size-3" /> : <MapPinIcon className="size-2.5 text-blue-500" />}
                            </div>
                         );
                    })}
                </div>
                <div className="text-[11px] font-bold text-muted-foreground group-hover:text-foreground transition-colors uppercase tracking-widest">
                    {chunks.length} sources
                </div>
            </button>

            {isModalOpen && (
                <div 
                    className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in-up" 
                    onClick={() => setIsModalOpen(false)}
                    role="dialog"
                    aria-modal="true"
                >
                    <div 
                        className="bg-background rounded-[2.5rem] shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden border border-border" 
                        onClick={e => e.stopPropagation()}
                    >
                        <header className="flex items-center justify-between p-6 pb-2">
                            <div className="flex flex-col">
                                <h3 className="text-xl font-extrabold text-foreground tracking-tight">Sources</h3>
                                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-1">Verified Information</p>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)} 
                                className="p-2.5 rounded-full bg-surface-l1 dark:bg-[#1f1f1f] hover:opacity-80 transition-opacity border border-border"
                            >
                                <XIcon className="size-5 text-foreground" />
                            </button>
                        </header>
                        <div className="flex-1 overflow-y-auto p-4 scrollbar-none">
                            <SourceList />
                        </div>
                        <div className="p-6 pt-2 text-center">
                           <p className="text-[10px] text-muted-foreground font-medium">Information verified using Google Search engine.</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default GroundingSources;
