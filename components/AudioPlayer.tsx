import React, { useState, useRef, useEffect } from 'react';
import { PlayIcon, PauseIcon } from './icons';

interface AudioPlayerProps {
    src: string;
    t: (key: string) => string;
}

const WaveformIcon: React.FC<{className?: string}> = ({className}) => (
    <svg width="150" height="28" viewBox="0 0 150 28" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
        <rect y="10" width="2" height="8" rx="1" fill="currentColor"/>
        <rect x="4" y="6" width="2" height="16" rx="1" fill="currentColor"/>
        <rect x="8" y="2" width="2" height="24" rx="1" fill="currentColor"/>
        <rect x="12" y="8" width="2" height="12" rx="1" fill="currentColor"/>
        <rect x="16" y="11" width="2" height="6" rx="1" fill="currentColor"/>
        <rect x="20" y="4" width="2" height="20" rx="1" fill="currentColor"/>
        <rect x="24" y="9" width="2" height="10" rx="1" fill="currentColor"/>
        <rect x="28" y="0" width="2" height="28" rx="1" fill="currentColor"/>
        <rect x="32" y="5" width="2" height="18" rx="1" fill="currentColor"/>
        <rect x="36" y="10" width="2" height="8" rx="1" fill="currentColor"/>
        <rect x="40" y="7" width="2" height="14" rx="1" fill="currentColor"/>
        <rect x="44" y="2" width="2" height="24" rx="1" fill="currentColor"/>
        <rect x="48" y="8" width="2" height="12" rx="1" fill="currentColor"/>
        <rect x="52" y="5" width="2" height="18" rx="1" fill="currentColor"/>
        <rect x="56" y="1" width="2" height="26" rx="1" fill="currentColor"/>
        <rect x="60" y="9" width="2" height="10" rx="1" fill="currentColor"/>
        <rect x="64" y="4" width="2" height="20" rx="1" fill="currentColor"/>
        <rect x="68" y="11" width="2" height="6" rx="1" fill="currentColor"/>
        <rect x="72" y="8" width="2" height="12" rx="1" fill="currentColor"/>
        <rect x="76" y="2" width="2" height="24" rx="1" fill="currentColor"/>
        <rect x="80" y="6" width="2" height="16" rx="1" fill="currentColor"/>
        <rect x="84" y="10" width="2" height="8" rx="1" fill="currentColor"/>
        <rect x="88" y="5" width="2" height="18" rx="1" fill="currentColor"/>
        <rect x="92" y="0" width="2" height="28" rx="1" fill="currentColor"/>
        <rect x="96" y="9" width="2" height="10" rx="1" fill="currentColor"/>
        <rect x="100" y="4" width="2" height="20" rx="1" fill="currentColor"/>
        <rect x="104" y="11" width="2" height="6" rx="1" fill="currentColor"/>
        <rect x="108" y="8" width="2" height="12" rx="1" fill="currentColor"/>
        <rect x="112" y="2" width="2" height="24" rx="1" fill="currentColor"/>
        <rect x="116" y="7" width="2" height="14" rx="1" fill="currentColor"/>
        <rect x="120" y="10" width="2" height="8" rx="1" fill="currentColor"/>
        <rect x="124" y="5" width="2" height="18" rx="1" fill="currentColor"/>
        <rect x="128" y="1" width="2" height="26" rx="1" fill="currentColor"/>
        <rect x="132" y="9" width="2" height="10" rx="1" fill="currentColor"/>
        <rect x="136" y="4" width="2" height="20" rx="1" fill="currentColor"/>
        <rect x="140" y="11" width="2" height="6" rx="1" fill="currentColor"/>
        <rect x="144" y="8" width="2" height="12" rx="1" fill="currentColor"/>
        <rect x="148" y="10" width="2" height="8" rx="1" fill="currentColor"/>
    </svg>
);

const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, t }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const togglePlayPause = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
        }
    };

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onEnded = () => setIsPlaying(false);

        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('ended', onEnded);

        return () => {
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('ended', onEnded);
        };
    }, []);

    return (
        <div className="flex items-center gap-3 px-4 py-3 bg-user-message rounded-full">
            <audio ref={audioRef} src={src} preload="metadata"></audio>
            <button
                onClick={togglePlayPause}
                aria-label={isPlaying ? t('chat.audio.pause') : t('chat.audio.play')}
                className="flex items-center justify-center size-8 rounded-full bg-foreground text-background flex-shrink-0"
            >
                {isPlaying ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
            </button>
            <WaveformIcon className="text-foreground/70" />
        </div>
    );
};

export default AudioPlayer;