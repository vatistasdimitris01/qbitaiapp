
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PaperclipIcon, ArrowUpIcon, XIcon } from './icons';
import { FileAttachment } from '../types';

interface ChatInputProps {
    onSendMessage: (message: string, attachments: FileAttachment[]) => void;
    isLoading: boolean;
    t: (key: string) => string;
}

const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading, t }) => {
    const [text, setText] = useState('');
    const [attachments, setAttachments] = useState<FileAttachment[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const adjustTextareaHeight = useCallback(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            const newHeight = Math.min(textareaRef.current.scrollHeight, 200); // Max height 200px
            textareaRef.current.style.height = `${newHeight}px`;
        }
    }, []);

    useEffect(() => {
        adjustTextareaHeight();
    }, [text, adjustTextareaHeight]);
    
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const filePromises = Array.from(e.target.files).map(async (file: File) => {
                const dataUrl = await fileToDataURL(file);
                return {
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    dataUrl
                };
            });
            const newAttachments = await Promise.all(filePromises);
            setAttachments(prev => [...prev, ...newAttachments]);
        }
    };
    
    const handleRemoveFile = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if ((text.trim() || attachments.length > 0) && !isLoading) {
            onSendMessage(text.trim(), attachments);
            setText('');
            setAttachments([]);
            if (textareaRef.current) {
                textareaRef.current.style.height = '44px';
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

    const placeholder = attachments.length > 0 
        ? t('describeFiles').replace('{count}', attachments.length.toString())
        : t('askAnything');

    return (
        <div className="flex flex-col gap-0 justify-center w-full relative items-center">
            <form onSubmit={handleSubmit} className="relative w-full max-w-4xl">
                <input 
                    ref={fileInputRef} 
                    className="hidden" 
                    multiple 
                    type="file" 
                    accept="image/*" 
                    name="files" 
                    onChange={handleFileChange}
                />
                <div className="relative w-full bg-card border border-default rounded-[28px] shadow-xl px-3 sm:px-4 pt-4 pb-16 sm:pb-14">
                    {attachments.length > 0 && (
                        <div className="w-full flex flex-row gap-3 mb-2 px-1 pt-2 whitespace-nowrap overflow-x-auto">
                            {attachments.map((file, index) => (
                                <div key={index} className="relative group/chip flex-shrink-0 mt-2">
                                    <div className="flex flex-row items-center text-sm gap-2 relative h-12 p-0.5 rounded-xl border border-default bg-gray-50 dark:bg-gray-800">
                                        <figure className="relative flex-shrink-0 aspect-square overflow-hidden w-11 h-11 rounded-lg">
                                            <img alt={file.name} className="h-full w-full object-cover" src={file.dataUrl} />
                                        </figure>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveFile(index)}
                                        className="inline-flex items-center justify-center h-6 w-6 absolute -top-2 -right-2 transition-all scale-75 opacity-0 group-hover/chip:opacity-100 group-hover/chip:scale-100 rounded-full bg-gray-800 text-white border-2 border-white dark:border-gray-700"
                                        aria-label={`Remove ${file.name}`}
                                    >
                                        <XIcon className="size-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="relative z-10">
                        <textarea
                            ref={textareaRef}
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
                        <button type="button" aria-label="Attach" onClick={handleAttachClick} className="inline-flex items-center justify-center h-11 w-11 sm:h-10 sm:w-10 rounded-full bg-token-surface-secondary border border-default text-muted disabled:opacity-60">
                            <PaperclipIcon className="text-muted" />
                        </button>
                        <div className="ml-auto relative">
                            <button
                                type="submit"
                                aria-label="Submit"
                                className={`inline-flex items-center justify-center rounded-full h-12 w-12 sm:h-11 sm:w-11 bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-opacity`}
                                style={{ transform: 'translateY(-2px)' }}
                                disabled={(!text.trim() && attachments.length === 0) || isLoading}
                            >
                                <ArrowUpIcon />
                            </button>
                        </div>
                    </div>
                </div>
            </form>
             <p className="text-xs text-center text-muted mt-2">
                {t('disclaimer')}
            </p>
        </div>
    );
};

export default ChatInput;
