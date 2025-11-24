import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PlusIcon, ArrowUpIcon, XIcon, MicIcon, StopCircleIcon } from './icons';

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
            textarea.style.height = 'auto';
            const newHeight = Math.min(textarea.scrollHeight, 200);
            textarea.style.height = `${newHeight}px`;
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

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const hasContent = text.trim() || attachmentPreviews.length > 0 || replyContextText;
        if (hasContent && !isLoading) {
            onSendMessage(text.trim(), attachmentPreviews.map(p => p.file));
            onTextChange('');
            setAttachmentPreviews([]);
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

    const placeholder = attachmentPreviews.length > 0 ? t('chat.input.placeholderWithFiles', { count: attachmentPreviews.length.toString() }) : t('chat.input.placeholder');
    const hasContent = text.trim().length > 0 || attachmentPreviews.length > 0;

    return (
        <div className="flex flex-col justify-center w-full relative items-center gap-4">
             {(replyContextText || attachmentPreviews.length > 0) && (
                <div className="w-full max-w-3xl animate-fade-in-up">
                    {replyContextText && (
                        <div className="flex items-center justify-between gap-2 bg-background/80 backdrop-blur-md rounded-xl border border-default p-3 mb-2 shadow-sm">
                            <div className="text-sm text-muted-foreground line-clamp-1 border-l-2 border-foreground pl-2">{replyContextText}</div>
                            <button onClick={onClearReplyContext} className="p-1 rounded-full hover:bg-token-surface-secondary"><XIcon className="size-3" /></button>
                        </div>
                    )}
                    
                    {attachmentPreviews.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                            {attachmentPreviews.map((attachment, index) => (
                                <div key={index} className="relative group shrink-0 size-12 rounded-lg overflow-hidden border border-default bg-background">
                                    <img alt={attachment.file.name} className="h-full w-full object-cover" src={attachment.previewUrl} />
                                    <button onClick={() => handleRemoveFile(index)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <XIcon className="size-4 text-white" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            
            <div className="w-full max-w-3xl relative">
                <input ref={fileInputRef} className="hidden" multiple type="file" onChange={handleFileChange} />
                <form onSubmit={handleSubmit} className="relative flex items-end w-full bg-card/80 backdrop-blur-xl border border-default shadow-lg rounded-[2rem] p-2 transition-all focus-within:shadow-xl focus-within:border-foreground/10 ring-0">
                    <button
                        type="button"
                        onClick={handleAttachClick}
                        className="flex items-center justify-center size-10 rounded-full hover:bg-token-surface-secondary text-muted-foreground transition-colors shrink-0 ml-1 mb-0.5"
                        disabled={isLoading}
                    >
                        <PlusIcon className="size-5" />
                    </button>
                    
                    <textarea 
                        ref={internalTextareaRef} 
                        dir="auto" 
                        className="flex-1 bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground/40 py-3 px-3 max-h-[200px] min-h-[44px] text-[15px]" 
                        style={{ resize: 'none' }} 
                        placeholder={placeholder} 
                        rows={1} 
                        value={text} 
                        onChange={handleInputChange} 
                        onKeyDown={handleKeyDown} 
                    />
                    
                    <div className="flex items-center gap-1 shrink-0 mr-1 mb-0.5">
                        {isLoading ? (
                            <button type="button" onClick={onAbortGeneration} className="flex items-center justify-center size-10 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity">
                                <StopCircleIcon className="size-4" />
                            </button>
                        ) : hasContent ? (
                            <button type="submit" className="flex items-center justify-center size-10 rounded-full bg-foreground text-background hover:opacity-90 transition-opacity" disabled={!hasContent}>
                                <ArrowUpIcon className="size-5"/>
                            </button>
                        ) : (
                            <button type="button" onClick={handleMicClick} className="flex items-center justify-center size-10 rounded-full hover:bg-token-surface-secondary text-muted-foreground transition-colors">
                                {isRecording ? <StopCircleIcon className="text-red-500 animate-pulse size-5" /> : <MicIcon className="size-5" />}
                            </button>
                        )}
                    </div>
                </form>
            </div>
             <p className="text-[10px] text-center text-muted-foreground/40 font-medium tracking-wide">{t('chat.input.disclaimer')}</p>
        </div>
    );
});

export default ChatInput;