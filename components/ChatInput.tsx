import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PaperclipIcon, ArrowUpIcon, XIcon, ReplyIcon } from './icons';
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
const MAX_FILE_SIZE_MB = 3; // Reduced from 4 to stay under Gemini's 4MB base64 limit (3MB * 4/3 ≈ 4MB)
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_TOTAL_SIZE_MB = 4; // Reduced from 10 to stay under Vercel's 4.5MB serverless function payload limit
const MAX_TOTAL_SIZE = MAX_TOTAL_SIZE_MB * 1024 * 1024;

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(({ text, onTextChange, onSendMessage, isLoading, t, onAbortGeneration, replyContextText, onClearReplyContext }, ref) => {
    const [attachmentPreviews, setAttachmentPreviews] = useState<AttachmentPreview[]>([]);
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const adjustTextareaHeight = useCallback(() => {
        if (internalTextareaRef.current) {
            internalTextareaRef.current.style.height = 'auto';
            const newHeight = Math.min(internalTextareaRef.current.scrollHeight, 200); // Max height 200px
            internalTextareaRef.current.style.height = `${newHeight}px`;
        }
    }, []);

    useEffect(() => {
        adjustTextareaHeight();
    }, [text, adjustTextareaHeight]);
    
    // Cleanup object URLs to prevent memory leaks
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
            if (attachmentPreviews.length + allowedNewFiles.length >= MAX_FILES) {
                window.alert(t('chat.input.tooManyFiles', { count: MAX_FILES.toString() }));
                break;
            }
            if (file.size > MAX_FILE_SIZE) {
                window.alert(t('chat.input.fileTooLarge', { filename: file.name, size: `${MAX_FILE_SIZE_MB}MB` }));
                continue;
            }
            if (currentSize + newFilesSize + file.size > MAX_TOTAL_SIZE) {
                window.alert(t('chat.input.totalSizeTooLarge', { size: `${MAX_TOTAL_SIZE_MB}MB` }));
                break;
            }
            
            allowedNewFiles.push(file);
            newFilesSize += file.size;
        }

        if (allowedNewFiles.length > 0) {
            const newPreviews: AttachmentPreview[] = allowedNewFiles.map(file => ({
                file,
                previewUrl: URL.createObjectURL(file)
            }));
            setAttachmentPreviews(prev => [...prev, ...newPreviews]);
        }
    }, [attachmentPreviews, t]);

    useImperativeHandle(ref, () => ({
        focus: () => {
            internalTextareaRef.current?.focus();
        },
        handleFiles: (files: FileList) => {
            addFiles(files);
        }
    }), [addFiles]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            addFiles(e.target.files);
        }
        if (e.target) {
            e.target.value = '';
        }
    };
    
    const handleRemoveFile = (index: number) => {
        const attachmentToRemove = attachmentPreviews[index];
        if (attachmentToRemove) {
            URL.revokeObjectURL(attachmentToRemove.previewUrl);
        }
        setAttachmentPreviews(prev => prev.filter((_, i) => i !== index));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onTextChange(e.target.value);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if ((text.trim() || attachmentPreviews.length > 0 || replyContextText) && !isLoading) {
            const messageToSend = text.trim();
            const filesToSend = attachmentPreviews.map(p => p.file);
            onSendMessage(messageToSend, filesToSend);
            onTextChange('');
            setAttachmentPreviews([]);
            if (internalTextareaRef.current) {
                internalTextareaRef.current.style.height = '44px';
            }
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e as unknown as React.FormEvent);
        }
    };
    
    const handleAttachClick = () => {
        fileInputRef.current?.click();
    };

    const placeholder = attachmentPreviews.length > 0 
        ? t('chat.input.placeholderWithFiles', { count: attachmentPreviews.length.toString() })
        : t('chat.input.placeholder');

    return (
        <div className="flex flex-col gap-0 justify-center w-full relative items-center">
            <form onSubmit={handleSubmit} className="relative w-full max-w-4xl">
                <input 
                    ref={fileInputRef} 
                    className="hidden" 
                    multiple 
                    type="file" 
                    name="files" 
                    onChange={handleFileChange}
                />
                <div className="relative w-full bg-card border border-default rounded-[28px] shadow-xl px-3 sm:px-4 pt-4 pb-16 sm:pb-14">
                    {replyContextText && (
                        <div className="mx-1 mb-2 border-b border-default pb-2">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5 text-muted-foreground shrink min-w-0">
                                    <ReplyIcon className="size-4 flex-shrink-0 mt-0.5" />
                                    <p className="text-sm text-foreground/80 line-clamp-2" title={replyContextText}>
                                        {replyContextText}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={onClearReplyContext}
                                    className="p-1 rounded-full text-muted-foreground hover:bg-token-surface-secondary"
                                    aria-label={t('chat.input.clearReply')}
                                >
                                    <XIcon className="size-4" />
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {attachmentPreviews.length > 0 && (
                        <div className="w-full flex flex-row gap-3 mb-2 px-1 pt-2 whitespace-nowrap overflow-x-auto">
                            {attachmentPreviews.map((attachment, index) => (
                                <div key={index} className="relative group/chip flex-shrink-0 mt-2">
                                    <div className="flex flex-row items-center text-sm gap-2 relative h-12 p-0.5 rounded-xl border border-default bg-gray-50 dark:bg-gray-800">
                                        <figure className="relative flex-shrink-0 aspect-square overflow-hidden w-11 h-11 rounded-lg">
                                            <img alt={attachment.file.name} className="h-full w-full object-cover" src={attachment.previewUrl} />
                                        </figure>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveFile(index)}
                                        className="inline-flex items-center justify-center h-6 w-6 absolute -top-2 -right-2 transition-all scale-75 opacity-0 group-hover/chip:opacity-100 group-hover/chip:scale-100 rounded-full bg-gray-800 text-white border-2 border-white dark:border-gray-700"
                                        aria-label={t('chat.input.removeFile', { filename: attachment.file.name })}
                                    >
                                        <XIcon className="size-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="relative z-10">
                        <textarea
                            ref={internalTextareaRef}
                            dir="auto"
                            aria-label={placeholder}
                            className="w-full px-2 sm:px-3 pt-2 mb-6 bg-transparent focus:outline-none text-foreground placeholder-muted"
                            style={{ resize: 'none', minHeight: '44px' }}
                            placeholder={placeholder}
                            rows={1}
                            value={text}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                        ></textarea>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex items-center gap-3 px-3 sm:px-4 py-3">
                        <button type="button" aria-label={t('chat.input.attach')} onClick={handleAttachClick} className="inline-flex items-center justify-center h-11 w-11 sm:h-10 sm:w-10 rounded-full bg-token-surface-secondary border border-default text-muted disabled:opacity-60">
                            <PaperclipIcon className="text-muted" />
                        </button>
                        <div className="ml-auto relative">
                            {isLoading ? (
                                <button
                                    type="button"
                                    onClick={onAbortGeneration}
                                    aria-label={t('chat.input.stop')}
                                    className="inline-flex items-center justify-center rounded-xl h-12 w-12 sm:h-11 sm:w-11 bg-white dark:bg-card border border-default shadow-md"
                                    style={{ transform: 'translateY(-2px)' }}
                                >
                                    <div className="flex items-center justify-center h-7 w-7 bg-gray-200 dark:bg-token-surface-secondary rounded-full">
                                        <div className="h-3 w-3 bg-black dark:bg-white rounded-sm"></div>
                                    </div>
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    aria-label={t('chat.input.submit')}
                                    className={`inline-flex items-center justify-center rounded-full h-12 w-12 sm:h-11 sm:w-11 bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-opacity`}
                                    style={{ transform: 'translateY(-2px)' }}
                                    disabled={(!text.trim() && attachmentPreviews.length === 0 && !replyContextText)}
                                >
                                    <ArrowUpIcon />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </form>
             <p className="text-xs text-center text-muted mt-2">
                {t('chat.input.disclaimer')}
            </p>
        </div>
    );
});

export default ChatInput;