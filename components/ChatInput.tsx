import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PaperclipIcon, ArrowUpIcon, XIcon, StopCircleIcon, MicIcon } from './icons';

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
    const [isRecording, setIsRecording] = useState(false);
    const [isMultiline, setIsMultiline] = useState(false);
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);

    const adjustTextareaHeight = useCallback(() => {
        const textarea = internalTextareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto'; 
            const newHeight = Math.min(textarea.scrollHeight, 200); 
            textarea.style.height = `${Math.max(44, newHeight)}px`; // Reduced min-height for pill shape
            
            // Check if multiline (approximate based on height > single line height)
            setIsMultiline(newHeight > 50);
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
            if (internalTextareaRef.current) internalTextareaRef.current.style.height = 'auto';
            setIsMultiline(false);
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e as unknown as React.FormEvent);
        }
    };
    
    const handleAttachClick = () => fileInputRef.current?.click();

    const handleMicClick = () => {
        if (isRecording) {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
            setIsRecording(false);
        } else {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognition) {
                alert("Speech recognition is not supported in this browser.");
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = language;

            let initialText = text;
            if (initialText.length > 0 && !/\s$/.test(initialText)) {
                initialText += ' ';
            }

            recognition.onstart = () => {
                setIsRecording(true);
            };

            recognition.onresult = (event: any) => {
                let transcript = '';
                for (let i = 0; i < event.results.length; ++i) {
                   transcript += event.results[i][0].transcript;
                }
                onTextChange(initialText + transcript);
            };

            recognition.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                setIsRecording(false);
            };

            recognition.onend = () => {
                setIsRecording(false);
                recognitionRef.current = null;
            };

            recognitionRef.current = recognition;
            recognition.start();
        }
    };

    const placeholder = attachmentPreviews.length > 0 ? t('chat.input.placeholderWithFiles', { count: attachmentPreviews.length.toString() }) : t('chat.input.placeholder');
    const hasContent = text.trim().length > 0 || attachmentPreviews.length > 0;

    return (
        <div className="flex flex-col justify-end w-full relative items-center gap-3">
             <div className="w-full max-w-[44rem] px-4 animate-fade-in-up">
                {(replyContextText || attachmentPreviews.length > 0) && (
                    <div className="w-full mb-2">
                        {replyContextText && (
                            <div className="flex items-center justify-between gap-2 bg-surface-l2 border border-border p-3 rounded-2xl mb-2 shadow-sm max-w-2xl">
                                <div className="text-sm text-foreground line-clamp-1 border-l-2 border-accent-blue pl-3">{replyContextText}</div>
                                <button onClick={onClearReplyContext} className="p-1 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground"><XIcon className="size-4" /></button>
                            </div>
                        )}
                        
                        {attachmentPreviews.length > 0 && (
                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                                {attachmentPreviews.map((attachment, index) => (
                                    <div key={index} className="relative group shrink-0 size-16 rounded-xl overflow-hidden border border-border bg-surface-l2">
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
            
            <div className="w-full max-w-[44rem] px-2 md:px-0 relative">
                <input ref={fileInputRef} className="hidden" multiple type="file" onChange={handleFileChange} />
                <form 
                    onSubmit={handleSubmit} 
                    className={`relative flex flex-col w-full bg-[#18181b] shadow-sm ring-1 ring-white/10 focus-within:ring-white/20 transition-all duration-300 overflow-hidden group ${isMultiline ? 'rounded-[26px]' : 'rounded-full'}`}
                >
                    <textarea 
                        ref={internalTextareaRef} 
                        dir="auto" 
                        className="w-full bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground px-12 py-3 max-h-[200px] min-h-[44px] text-[16px] leading-relaxed resize-none scrollbar-none"
                        placeholder={placeholder} 
                        rows={1} 
                        value={text} 
                        onChange={handleInputChange} 
                        onKeyDown={handleKeyDown} 
                        onPaste={handlePaste}
                    />
                    
                    {/* Attach Button (Left) */}
                    <div className="absolute left-1.5 bottom-1.5 z-10">
                        <button 
                            type="button"
                            onClick={handleAttachClick}
                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-100 select-none text-muted-foreground hover:bg-surface-l2 hover:text-foreground h-8 w-8 rounded-full"
                            aria-label={t('chat.input.attach')}
                        >
                            <PaperclipIcon className="size-5" />
                        </button>
                    </div>

                    {/* Right Action Button (Send or Voice) */}
                    <div className="absolute right-1.5 bottom-1.5 z-10">
                        {isLoading ? (
                            <button 
                                type="button"
                                onClick={onAbortGeneration}
                                className="group flex flex-col justify-center rounded-full focus:outline-none" 
                                aria-label="Stop"
                            >
                                <div className="h-8 w-8 flex items-center justify-center rounded-full bg-foreground text-background">
                                    <StopCircleIcon className="size-5" />
                                </div>
                            </button>
                        ) : hasContent ? (
                            <button 
                                type="submit"
                                className="group flex flex-col justify-center rounded-full focus:outline-none" 
                                aria-label="Submit"
                            >
                                <div className="h-8 w-8 flex items-center justify-center rounded-full bg-foreground text-background">
                                    <ArrowUpIcon className="size-5" />
                                </div>
                            </button>
                        ) : (
                            <button 
                                type="button"
                                onClick={handleMicClick}
                                className="group flex flex-col justify-center rounded-full focus:outline-none" 
                                aria-label="Voice"
                            >
                                <div className={`h-8 w-8 flex items-center justify-center rounded-full transition-colors ${isRecording ? 'bg-red-500 text-white' : 'bg-surface-l2 text-foreground hover:bg-surface-l3'}`}>
                                    {isRecording ? (
                                        <div className="flex gap-0.5 items-center justify-center h-3">
                                            {[1,2,3].map(i => (
                                                <div key={i} className="w-0.5 bg-white rounded-full animate-[pulse_0.5s_ease-in-out_infinite]" style={{ height: `${Math.random() * 8 + 4}px` }} />
                                            ))}
                                        </div>
                                    ) : (
                                        <MicIcon className="size-5" />
                                    )}
                                </div>
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
});

export default ChatInput;