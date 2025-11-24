import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PlusIcon, ArrowUpIcon, XIcon, ReplyIcon, MicIcon, StopCircleIcon } from './icons';
import { FileAttachment } from '../types';

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
const MAX_FILE_SIZE_MB = 3; 
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_TOTAL_SIZE_MB = 3; 
const MAX_TOTAL_SIZE = MAX_TOTAL_SIZE_MB * 1024 * 1024;

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
        const currentSize = attachmentPreviews.reduce((acc, attachment) => acc + attachment.file.size, 0);
        let allowedNewFiles: File[] = [];
        let newFilesSize = 0;

        for (const file of files) {
            const isFileTypeSupported = (file: File): boolean => {
                const supportedMimeTypes = ['image/', 'video/', 'audio/', 'text/', 'application/pdf', 'application/json'];
                const supportedExtensions = ['.md', '.csv'];
                const fileMime = file.type;
                const fileName = file.name.toLowerCase();
                if (supportedMimeTypes.some(mime => mime.endsWith('/') ? fileMime.startsWith(mime) : fileMime === mime)) return true;
                if (supportedExtensions.some(ext => fileName.endsWith(ext))) return true;
                return false;
            };

            if (!isFileTypeSupported(file)) { window.alert(t('chat.input.unsupportedFileType', { filename: file.name })); continue; }
            if (attachmentPreviews.length + allowedNewFiles.length >= MAX_FILES) { window.alert(t('chat.input.tooManyFiles', { count: MAX_FILES.toString() })); break; }
            if (file.size > MAX_FILE_SIZE) { window.alert(t('chat.input.fileTooLarge', { filename: file.name, size: `${MAX_FILE_SIZE_MB}MB` })); continue; }
            if (currentSize + newFilesSize + file.size > MAX_TOTAL_SIZE) { window.alert(t('chat.input.totalSizeTooLarge', { size: `${MAX_TOTAL_SIZE_MB}MB` })); break; }
            allowedNewFiles.push(file);
            newFilesSize += file.size;
        }

        if (allowedNewFiles.length > 0) {
            const newPreviews: AttachmentPreview[] = allowedNewFiles.map(file => ({ file, previewUrl: URL.createObjectURL(file) }));
            setAttachmentPreviews(prev => [...prev, ...newPreviews]);
        }
    }, [attachmentPreviews, t]);

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
                alert("Microphone access is required to record audio.");
            }
        }
    };

    const placeholder = attachmentPreviews.length > 0 ? t('chat.input.placeholderWithFiles', { count: attachmentPreviews.length.toString() }) : t('chat.input.placeholder');
    const hasContent = text.trim().length > 0 || attachmentPreviews.length > 0;

    return (
        <div className="flex flex-col gap-2 justify-center w-full relative items-center">
             {(replyContextText || attachmentPreviews.length > 0) && (
                <div className="w-full max-w-3xl px-4 pb-2 animate-fade-in-up">
                    {replyContextText && (
                        <div className="mx-1 mb-2 pl-3 border-l-2 border-primary/50 py-1">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5 text-muted-foreground shrink min-w-0">
                                    <p className="text-sm font-medium text-foreground/80 line-clamp-2" title={replyContextText}>{replyContextText}</p>
                                </div>
                                <button type="button" onClick={onClearReplyContext} className="p-1 rounded-full text-muted-foreground hover:bg-token-surface-secondary" aria-label={t('chat.input.clearReply')}><XIcon className="size-3.5" /></button>
                            </div>
                        </div>
                    )}
                    
                    {attachmentPreviews.length > 0 && (
                        <div className="w-full flex flex-row gap-2 mb-2 whitespace-nowrap overflow-x-auto py-1">
                            {attachmentPreviews.map((attachment, index) => (
                                <div key={index} className="relative group/chip flex-shrink-0 animate-fade-in-up">
                                    <div className="flex flex-row items-center text-sm gap-2 relative h-12 w-12 p-0.5 rounded-xl border border-default bg-background shadow-sm overflow-hidden">
                                        <img alt={attachment.file.name} className="h-full w-full object-cover rounded-lg" src={attachment.previewUrl} />
                                    </div>
                                    <button type="button" onClick={() => handleRemoveFile(index)} className="inline-flex items-center justify-center h-5 w-5 absolute -top-1.5 -right-1.5 transition-all scale-75 opacity-0 group-hover/chip:opacity-100 group-hover/chip:scale-100 rounded-full bg-foreground text-background border border-background shadow-sm" aria-label={t('chat.input.removeFile', { filename: attachment.file.name })}><XIcon className="size-3" /></button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <div className="flex w-full max-w-3xl items-end gap-2">
                <input ref={fileInputRef} className="hidden" multiple type="file" name="files" onChange={handleFileChange} accept="image/*,video/*,audio/*,text/*,.pdf,.md,.csv,.json" />
                
                {/* Mobile-only '+' button */}
                <button
                    type="button"
                    aria-label={t('chat.input.attach')}
                    onClick={handleAttachClick}
                    className="inline-flex sm:hidden items-center justify-center h-10 w-10 rounded-full bg-user-message text-foreground flex-shrink-0 transition-transform active:scale-95 disabled:opacity-50"
                    disabled={isLoading}
                >
                    <PlusIcon className="w-5 h-5" />
                </button>

                <form onSubmit={handleSubmit} className="relative w-full">
                    <div className="relative flex items-end w-full bg-card border border-default shadow-lg rounded-3xl p-2 transition-shadow duration-200 focus-within:shadow-xl focus-within:border-foreground/20">
                        
                        {/* Desktop-only '+' button */}
                        <button
                            type="button"
                            aria-label={t('chat.input.attach')}
                            onClick={handleAttachClick}
                            className="hidden sm:inline-flex items-center justify-center h-10 w-10 rounded-full hover:bg-token-surface-secondary text-muted-foreground transition-colors mr-1 self-end mb-0.5"
                            disabled={isLoading}
                        >
                            <PlusIcon className="w-5 h-5" />
                        </button>
                        
                        <textarea 
                            ref={internalTextareaRef} 
                            dir="auto" 
                            aria-label={placeholder} 
                            className="flex-1 bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground/50 py-3 px-2 max-h-[200px]" 
                            style={{ resize: 'none' }} 
                            placeholder={placeholder} 
                            rows={1} 
                            value={text} 
                            onChange={handleInputChange} 
                            onKeyDown={handleKeyDown} 
                        />
                        
                        <div className="flex items-center gap-1 self-end mb-0.5 ml-1">
                            {isLoading ? (
                                <button type="button" onClick={onAbortGeneration} aria-label={t('chat.input.stop')} className="inline-flex items-center justify-center rounded-full h-10 w-10 bg-foreground text-background transition-transform active:scale-95">
                                    <StopCircleIcon className="w-5 h-5" />
                                </button>
                            ) : hasContent ? (
                                <button type="submit" aria-label={t('chat.input.submit')} className="inline-flex items-center justify-center rounded-full h-10 w-10 bg-foreground text-background disabled:opacity-50 disabled:cursor-not-allowed transition-transform active:scale-95" disabled={!hasContent}>
                                    <ArrowUpIcon className="w-5 h-5"/>
                                </button>
                            ) : (
                                <button type="button" onClick={handleMicClick} aria-label={isRecording ? t('chat.input.stopRecord') : t('chat.input.record')} className="inline-flex items-center justify-center h-10 w-10 rounded-full hover:bg-token-surface-secondary text-muted-foreground disabled:opacity-60 transition-colors">
                                    {isRecording ? <StopCircleIcon className="text-red-500 animate-pulse size-5" /> : <MicIcon className="size-5" />}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
             <p className="text-[10px] text-center text-muted-foreground/60 mt-2 hidden sm:block font-medium tracking-wide">{t('chat.input.disclaimer')}</p>
        </div>
    );
});

export default ChatInput;