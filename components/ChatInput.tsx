
import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { XIcon } from './icons';

interface ChatInputProps {
    text: string;
    onTextChange: (text: string) => void;
    onSendMessage: (message: string, attachments: File[]) => void;
    isLoading: boolean;
    t: (key: string, params?: Record<string, string>) => string;
    onAbortGeneration: () => void;
    replyContextText: string | null;
    onClearReplyContext: () => void;
    language: string;
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

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(({ text, onTextChange, onSendMessage, isLoading, t, onAbortGeneration, replyContextText, onClearReplyContext, language }, ref) => {
    const [attachmentPreviews, setAttachmentPreviews] = useState<AttachmentPreview[]>([]);
    const [isMultiline, setIsMultiline] = useState(false);
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const adjustTextareaHeight = useCallback(() => {
        const textarea = internalTextareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto'; 
            const newHeight = Math.min(textarea.scrollHeight, 200); 
            const isMulti = newHeight > 40; 
            
            textarea.style.height = `${Math.max(40, newHeight)}px`;
            setIsMultiline(isMulti);
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

    const handleSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const hasContent = text.trim() || attachmentPreviews.length > 0 || replyContextText;
        if (hasContent && !isLoading) {
            onSendMessage(text.trim(), attachmentPreviews.map(p => p.file));
            onTextChange('');
            setAttachmentPreviews([]);
            if (internalTextareaRef.current) internalTextareaRef.current.style.height = 'auto';
            setIsMultiline(false);
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };
    
    const handleAttachClick = () => fileInputRef.current?.click();

    const placeholder = t('chat.input.placeholder') || "Ask anything...";
    const hasContent = text.trim().length > 0 || attachmentPreviews.length > 0;

    return (
        <div className="flex flex-col justify-end w-full relative items-center gap-2">
             <div className="w-full max-w-4xl px-4 animate-fade-in-up">
                {(replyContextText || attachmentPreviews.length > 0) && (
                    <div className="w-full mb-2">
                        {replyContextText && (
                            <div className="flex items-center justify-between gap-2 bg-[#1f1f1f] border border-[#333333] p-3 rounded-2xl mb-2 shadow-sm max-w-2xl">
                                <div className="text-sm text-[#e0e0e0] line-clamp-1 border-l-2 border-accent-blue pl-3">{replyContextText}</div>
                                <button onClick={onClearReplyContext} className="p-1 rounded-full hover:bg-white/10 text-muted-foreground"><XIcon className="size-4" /></button>
                            </div>
                        )}
                        
                        {attachmentPreviews.length > 0 && (
                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                                {attachmentPreviews.map((attachment, index) => (
                                    <div key={index} className="relative group shrink-0 size-14 rounded-xl overflow-hidden border border-[#333333] bg-[#1f1f1f]">
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
            </div>
            
            <div className="w-full max-w-4xl px-2 md:px-0 relative">
                <input ref={fileInputRef} className="hidden" multiple type="file" onChange={handleFileChange} />
                
                {/* Grok-like Fully Rounded Input Bar */}
                <form 
                    onSubmit={handleSubmit}
                    className="bg-[#1f1f1f] rounded-full border border-[#333333] flex items-center gap-3 p-3 shadow-2xl transition-all duration-200"
                >
                    {/* Attach Button */}
                    <button 
                        type="button"
                        onClick={handleAttachClick}
                        className="flex items-center justify-center w-10 h-10 rounded-full cursor-pointer transition-colors flex-shrink-0 hover:bg-white/10"
                        aria-label={t('chat.input.attach')}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-[2] text-white">
                            <path d="M10 9V15C10 16.1046 10.8954 17 12 17V17C13.1046 17 14 16.1046 14 15V7C14 4.79086 12.2091 3 10 3V3C7.79086 3 6 4.79086 6 7V15C6 18.3137 8.68629 21 12 21V21C15.3137 21 18 18.3137 18 15V8" stroke="currentColor"></path>
                        </svg>
                    </button>

                    {/* Text Input */}
                    <textarea 
                        ref={internalTextareaRef}
                        id="messageInput"
                        placeholder={placeholder}
                        value={text}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        rows={1}
                        className="flex-1 bg-transparent outline-none text-[#e0e0e0] placeholder-[#888888] text-base py-2 px-1 resize-none overflow-y-hidden"
                        style={{ minHeight: '40px', maxHeight: '200px' }}
                    />

                    {/* Send / Stop Button */}
                    <button 
                        type={isLoading ? "button" : "submit"}
                        onClick={isLoading ? onAbortGeneration : undefined}
                        className={`flex items-center justify-center w-10 h-10 rounded-full cursor-pointer transition-all duration-200 flex-shrink-0 ${
                            isLoading || hasContent 
                                ? 'bg-white' 
                                : 'bg-[#333333]'
                        }`}
                        aria-label={isLoading ? "Stop" : "Submit"}
                    >
                        {isLoading ? (
                            <div className="w-3.5 h-3.5 bg-black rounded-[1px]" />
                        ) : (
                            <svg 
                                width="20" 
                                height="20" 
                                viewBox="0 0 24 24" 
                                fill="none" 
                                xmlns="http://www.w3.org/2000/svg" 
                                className={`stroke-[2.5] ${hasContent ? 'text-black' : 'text-[#888888]'}`}
                            >
                                <path d="m5 12 7-7 7 7"></path>
                                <path d="M12 19V5"></path>
                            </svg>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
});

export default ChatInput;
