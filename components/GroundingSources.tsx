
import React, { useState } from 'react';
import { GroundingChunk } from '../types';
import { MapPinIcon, XIcon } from './icons';

const getHostname = (url: string): string => {
    if (!url) return 'google.com';
    try {
        return new URL(url).hostname;
    } catch (e) {
        return 'google.com';
    }
};

const getDomainLabel = (url: string): string => {
    try {
        const h = new URL(url).hostname;
        return h.replace(/^www\./, '');
    } catch (e) { return 'source'; }
};

interface GroundingSourcesProps {
    chunks: GroundingChunk[];
    t: (key: string) => string;
}

const GroundingSources: React.FC<GroundingSourcesProps> = ({ chunks, t }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (!chunks || chunks.length === 0) return null;

    const visiblePills = chunks.slice(0, 3);

    return (
        <>
            <button
                type="button"
                className="flex items-center gap-2 group px-3 py-1.5 rounded-full bg-white dark:bg-[#141414] hover:bg-gray-50 dark:hover:bg-[#292929] border border-gray-200 dark:border-[#27272a] transition-all shadow-sm"
                onClick={() => setIsModalOpen(true)}
            >
                <div className="flex items-center -space-x-2">
                    {visiblePills.map((chunk, index) => {
                         const icon = 'web' in chunk 
                            ? `https://www.google.com/s2/favicons?sz=64&domain_url=${getHostname(chunk.web.uri)}`
                            : null;
                         return (
                            <div key={index} className="size-5 rounded-full bg-white dark:bg-[#141414] border-2 border-white dark:border-[#141414] ring-1 ring-gray-200 dark:ring-[#27272a] overflow-hidden flex items-center justify-center">
                                {icon ? <img src={icon} alt="" className="size-3" /> : <MapPinIcon className="size-2.5 text-blue-500" />}
                            </div>
                         );
                    })}
                </div>
                <div className="text-[11px] font-bold text-gray-500 dark:text-[#a1a1aa] group-hover:text-black dark:group-hover:text-white transition-colors uppercase tracking-widest">
                    {chunks.length} sources
                </div>
            </button>

            {isModalOpen && (
                <div 
                    className="fixed inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in-up" 
                    onClick={() => setIsModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-[#141414] rounded-[2.5rem] shadow-2xl w-full max-w-md max-h-[75vh] flex flex-col overflow-hidden border border-gray-200 dark:border-[#27272a]" 
                        onClick={e => e.stopPropagation()}
                    >
                        <header className="flex items-center justify-between p-7 pb-2">
                            <div className="flex flex-col">
                                <h3 className="text-xl font-extrabold text-black dark:text-white tracking-tight">Sources</h3>
                                <p className="text-[10px] text-gray-400 dark:text-[#a1a1aa] font-bold uppercase tracking-widest mt-1">Verified Information</p>
                            </div>
                            <button 
                                onClick={() => setIsModalOpen(false)} 
                                className="p-2.5 rounded-full bg-gray-50 dark:bg-[#1f1f1f] hover:bg-gray-100 dark:hover:bg-[#292929] transition-colors border border-gray-100 dark:border-[#27272a]"
                            >
                                <XIcon className="size-5 text-black dark:text-white" />
                            </button>
                        </header>
                        <div className="flex-1 overflow-y-auto p-4 scrollbar-none flex flex-col gap-1">
                            {chunks.map((chunk, i) => {
                                const isWeb = 'web' in chunk;
                                const url = isWeb ? chunk.web.uri : (chunk as any).maps.uri;
                                const title = isWeb ? chunk.web.title : (chunk as any).maps.title;
                                const fav = isWeb ? `https://www.google.com/s2/favicons?sz=64&domain_url=${getHostname(url)}` : null;

                                return (
                                    <a
                                        key={i}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 dark:hover:bg-[#292929] transition-all border border-transparent hover:border-gray-100 dark:hover:border-white/5 group"
                                    >
                                        <div className="size-10 rounded-xl bg-gray-50 dark:bg-[#1f1f1f] flex items-center justify-center shrink-0 border border-gray-100 dark:border-[#27272a] transition-colors group-hover:bg-white dark:group-hover:bg-[#141414]">
                                            {fav ? <img src={fav} alt="" className="size-5 rounded-sm" /> : <MapPinIcon className="size-5 text-blue-500" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-black dark:text-white truncate">{title}</p>
                                            <p className="text-[10px] text-gray-400 dark:text-[#a1a1aa] truncate uppercase tracking-widest font-bold mt-0.5">{getDomainLabel(url)}</p>
                                        </div>
                                    </a>
                                );
                            })}
                        </div>
                        <div className="p-6 pt-2 text-center">
                           <p className="text-[9px] text-gray-400 dark:text-[#a1a1aa] font-bold uppercase tracking-widest opacity-60">Verified via Google Search</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default GroundingSources;
