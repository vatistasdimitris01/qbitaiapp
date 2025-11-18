
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
        <div className="w-full mx-auto max-w-3xl">
            <div className="relative bg-card dark:bg-[#1e1e1e] border border-default/50 rounded-3xl shadow-lg dark:shadow-none transition-all duration-300 hover:border-default/80">
                 {(replyContextText || attachmentPreviews.length > 0) && (
                    <div className="px-4 pt-3 pb-1">
                        {replyContextText && (
                            <div className="relative mb-2 pl-3 border-l-2 border-blue-500 bg-muted/20 rounded-r-md p-2 pr-8">
                                <div className="flex items-center gap-2 text-xs font-medium text-blue-500 mb-0.5">
                                    <ReplyIcon className="size-3" />
                                    <span>Replying to context</span>
                                </div>
                                <p className="text-sm text-foreground/90 line-clamp-1" title={replyContextText}>{replyContextText}</p>
                                <button type="button" onClick={onClearReplyContext} className="absolute top-1 right-1 p-1 rounded-full hover:bg-background/50 text-muted-foreground" aria-label={t('chat.input.clearReply')}>
                                    <XIcon className="size-3" />
                                </button>
                            </div>
                        )}
                        
                        {attachmentPreviews.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-2">
                                {attachmentPreviews.map((attachment, index) => (
                                    <div key={index} className="relative group/chip animate-show">
                                        <div className="relative h-14 w-14 rounded-xl overflow-hidden border border-default/50 shadow-sm">
                                            <img alt={attachment.file.name} className="h-full w-full object-cover" src={attachment.previewUrl} />
                                            <div className="absolute inset-0 bg-black/0 group-hover/chip:bg-black/20 transition-colors" />
                                        </div>
                                        <button type="button" onClick={() => handleRemoveFile(index)} className="absolute -top-2 -right-2 bg-card text-foreground rounded-full p-0.5 shadow border border-default opacity-0 group-hover/chip:opacity-100 transition-opacity scale-90" aria-label={t('chat.input.removeFile', { filename: attachment.file.name })}>
                                            <XIcon className="size-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="flex items-end gap-2 p-2 pl-3">
                    <input ref={fileInputRef} className="hidden" multiple type="file" name="files" onChange={handleFileChange} accept="image/*,video/*,audio/*,text/*,.pdf,.md,.csv,.json" />
                    
                    <button
                        type="button"
                        aria-label={t('chat.input.attach')}
                        onClick={handleAttachClick}
                        className="flex-shrink-0 p-2 rounded-full text-muted-foreground hover:bg-token-surface-secondary hover:text-foreground transition-colors mb-1"
                        disabled={isLoading}
                    >
                        <PlusIcon className="size-5" />
                    </button>
                    
                    <textarea 
                        ref={internalTextareaRef} 
                        dir="auto" 
                        aria-label={placeholder} 
                        className="flex-1 bg-transparent focus:outline-none text-foreground placeholder-muted-foreground/70 py-3 text-[16px] leading-relaxed max-h-[200px]" 
                        style={{ resize: 'none' }} 
                        placeholder={placeholder} 
                        rows={1} 
                        value={text} 
                        onChange={handleInputChange} 
                        onKeyDown={handleKeyDown} 
                    />
                    
                    <div className="flex-shrink-0 mb-1">
                        {isLoading ? (
                            <button type="button" onClick={onAbortGeneration} aria-label={t('chat.input.stop')} className="flex items-center justify-center rounded-full size-9 bg-foreground text-background transition-transform active:scale-95">
                                <StopCircleIcon className="size-4 fill-current" />
                            </button>
                        ) : hasContent ? (
                            <button type="submit" aria-label={t('chat.input.submit')} className="flex items-center justify-center rounded-full size-9 bg-foreground text-background transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed" disabled={!hasContent}>
                                <ArrowUpIcon className="size-5" />
                            </button>
                        ) : (
                             <button type="button" onClick={handleMicClick} aria-label={isRecording ? t('chat.input.stopRecord') : t('chat.input.record')} className={`flex items-center justify-center rounded-full size-9 transition-all active:scale-95 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-transparent text-foreground hover:bg-token-surface-secondary'}`}>
                                {isRecording ? <div className="size-3 bg-white rounded-sm" /> : <MicIcon className="size-5" />}
                            </button>
                        )}
                    </div>
                </form>
            </div>
            <p className="text-xs text-center text-muted-foreground/60 mt-3 hidden sm:block font-medium tracking-wide">{t('chat.input.disclaimer')}</p>
        </div>
    );
});

export default ChatInput;
