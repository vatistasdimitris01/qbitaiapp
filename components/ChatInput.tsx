

import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { ArrowUpIcon, XIcon, MicIcon, StopCircleIcon, GlobeIcon, ImageIcon, ChevronDownIcon } from './icons';

interface ChatInputProps {
    text: string;
    onTextChange: (text: string) => void;
    onSendMessage: (message: string, attachments: File[]) => void;
    isLoading: boolean;
    t: (key: string, params?: Record<string, string>) => string;
    onAbortGeneration: () => void;
    replyContextText: string | null;
    onClearReplyContext: () => void;
}

export interface ChatInputHandle {
    focus: () => void;
    handleFiles: (files: FileList) => void;
}

interface AttachmentPreview {
    file: File;
    previewUrl: string;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(({ text, onTextChange, onSendMessage, isLoading, t, onAbortGeneration, replyContextText, onClearReplyContext }, ref) => {
    const [attachmentPreviews, setAttachmentPreviews] = useState<AttachmentPreview[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const adjustTextareaHeight = useCallback(() => {
        const textarea = internalTextareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto'; // Reset height
            const newHeight = Math.min(textarea.scrollHeight, 140);
            textarea.style.height = `${Math.max(44, newHeight)}px`;
        }
    }, []);

    useEffect(() => {
        adjustTextareaHeight();
    }, [text, adjustTextareaHeight]);
    
    useEffect(() => {
        return () => {
            attachmentPreviews.forEach(attachment => URL.revokeObjectURL(attachment.previewUrl));
        };
    }, [attachmentPreviews]);

    const addFiles = useCallback(async (files: FileList) => {
        const allowedNewFiles: File[] = [];
        for (const file of files) {
            if (attachmentPreviews.length + allowedNewFiles.length >= MAX_FILES) break;
            if (file.size > MAX_FILE_SIZE) continue; 
            allowedNewFiles.push(file);
        }
        if (allowedNewFiles.length > 0) {
            const newPreviews: AttachmentPreview[] = allowedNewFiles.map(file => ({ file, previewUrl: URL.createObjectURL(file) }));
            setAttachmentPreviews(prev => [...prev, ...newPreviews]);
        }
    }, [attachmentPreviews]);

    useImperativeHandle(ref, () => ({
        focus: () => internalTextareaRef.current?.focus(),
        handleFiles: (files: FileList) => addFiles(files),
    }), [addFiles]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) addFiles(e.target.files);
        if (e.target) e.target.value = '';
    };
    
    const handleRemoveFile = (index: number) => {
        const attachmentToRemove = attachmentPreviews[index];
        if (attachmentToRemove) URL.revokeObjectURL(attachmentToRemove.previewUrl);
        setAttachmentPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => onTextChange(e.target.value);

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (e.clipboardData && e.clipboardData.files.length > 0) {
            e.preventDefault();
            addFiles(e.clipboardData.files);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const hasContent = text.trim() || attachmentPreviews.length > 0 || replyContextText;
        if (hasContent && !isLoading) {
            onSendMessage(text.trim(), attachmentPreviews.map(p => p.file));
            onTextChange('');
            setAttachmentPreviews([]);
            if (internalTextareaRef.current) {
                internalTextareaRef.current.style.height = 'auto';
            }
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e as unknown as React.FormEvent);
        }
    };
    
    const handleAttachClick = () => fileInputRef.current?.click();

    const handleMicClick = async () => {
        if (isRecording) {
            mediaRecorderRef.current?.stop();
            setIsRecording(false);
        } else {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorderRef.current = new MediaRecorder(stream);
                audioChunksRef.current = [];
                mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
                mediaRecorderRef.current.onstop = () => {
                    const mimeType = 'audio/webm;codecs=opus';
                    const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
                    const audioFile = new File([audioBlob], `recording-${Date.now()}.webm`, { type: mimeType });
                    onSendMessage(t('chat.input.audioMessage'), [audioFile]);
                    stream.getTracks().forEach(track => track.stop());
                };
                mediaRecorderRef.current.start();
                setIsRecording(true);
            } catch (err) {
                console.error("Microphone access failed:", err);
            }
        }
    };

    const hasContent = text.trim().length > 0 || attachmentPreviews.length > 0;

    return (
        <div className="flex flex-col w-full relative gap-3 pb-2 max-w-3xl mx-auto">
            {/* Top Action Bar - Horizontal Scroll */}
            <div className="flex items-center gap-2 overflow-x-auto px-1 no-scrollbar w-full pb-1">
                 <button className="flex items-center gap-2 bg-[#2563EB] text-white px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shadow-sm hover:bg-blue-700 transition-colors shrink-0">
                    <span className="tracking-wide">Qbit Pro</span>
                </button>
                
                <button onClick={handleMicClick} className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shadow-sm transition-colors border border-default shrink-0 ${isRecording ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-token-surface-secondary text-foreground hover:bg-token-surface'}`}>
                     {isRecording ? <StopCircleIcon className="size-3.5 animate-pulse" /> : <MicIcon className="size-3.5" />}
                     <span>{isRecording ? t('chat.input.stopRecord') : "Voice Mode"}</span>
                </button>

                 <button onClick={handleAttachClick} className="flex items-center justify-center size-9 rounded-full bg-token-surface-secondary text-foreground border border-default hover:bg-token-surface transition-colors shrink-0 shadow-sm">
                     <ImageIcon className="size-4" />
                </button>
            </div>

            {/* Context / Reply / File Previews area */}
             {(replyContextText || attachmentPreviews.length > 0) && (
                <div className="w-full px-1 animate-fade-in-up">
                    {replyContextText && (
                        <div className="flex items-center justify-between gap-2 bg-token-surface border border-default p-2 rounded-xl mb-2 shadow-sm">
                            <div className="text-xs text-muted-foreground line-clamp-1 border-l-2 border-foreground pl-2">{replyContextText}</div>
                            <button onClick={onClearReplyContext} className="p-1 rounded-full hover:bg-token-surface-secondary"><XIcon className="size-3" /></button>
                        </div>
                    )}
                    
                    {attachmentPreviews.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-1">
                            {attachmentPreviews.map((attachment, index) => (
                                <div key={index} className="relative group shrink-0 size-12 rounded-lg overflow-hidden border border-default bg-background">
                                    <img alt={attachment.file.name} className="h-full w-full object-cover" src={attachment.previewUrl} />
                                    <button onClick={() => handleRemoveFile(index)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <XIcon className="size-3 text-white" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            
            <div className="w-full relative px-1">
                <input ref={fileInputRef} className="hidden" multiple type="file" onChange={handleFileChange} />
                <form onSubmit={handleSubmit} className="relative flex items-end w-full bg-token-surface border border-default rounded-[26px] p-1.5 shadow-sm transition-all hover:border-foreground/20 focus-within:border-foreground/40 focus-within:ring-1 focus-within:ring-foreground/10">
                    
                    {/* Left Icon: Globe/Auto */}
                    <div className="flex items-center justify-center h-[44px] pl-2 shrink-0 mb-0.5">
                        <div className="flex items-center gap-1.5 bg-transparent px-2 py-1 rounded-full cursor-pointer hover:bg-token-surface-secondary transition-colors group">
                           <GlobeIcon className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" /> 
                           <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground leading-none mt-0.5 transition-colors">Auto</span>
                           <ChevronDownIcon className="size-3 text-muted-foreground/50 group-hover:text-foreground/70 transition-colors" />
                        </div>
                    </div>
                    
                    <textarea 
                        ref={internalTextareaRef} 
                        dir="auto" 
                        className="flex-1 bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground/50 py-3 px-3 max-h-[140px] min-h-[44px] text-[16px] leading-relaxed" 
                        style={{ resize: 'none' }} 
                        placeholder={t('chat.input.placeholder')}
                        rows={1} 
                        value={text} 
                        onChange={handleInputChange} 
                        onKeyDown={handleKeyDown} 
                        onPaste={handlePaste}
                    />
                    
                    <div className="flex items-center justify-center h-[44px] w-10 mb-0.5 mr-0.5 shrink-0">
                        {isLoading ? (
                            <button type="button" onClick={onAbortGeneration} className="flex items-center justify-center size-9 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity shadow-sm">
                                <StopCircleIcon className="size-4" />
                            </button>
                        ) : (
                            <button type="submit" className={`flex items-center justify-center size-9 rounded-full transition-all duration-200 shadow-sm ${hasContent ? 'bg-foreground text-background hover:opacity-90' : 'bg-token-surface-secondary text-muted-foreground hover:bg-token-surface-secondary/80'}`} disabled={!hasContent}>
                                <ArrowUpIcon className="size-5"/>
                            </button>
                        )}
                    </div>
                </form>
            </div>
             <p className="text-[10px] text-center text-muted-foreground/30 font-medium tracking-wide mt-1">{t('chat.input.disclaimer')}</p>
        </div>
    );
});

export default ChatInput;
