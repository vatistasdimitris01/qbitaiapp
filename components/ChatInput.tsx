import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PaperclipIcon, ArrowUpIcon, XIcon, StopCircleIcon } from './icons';

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
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);

    const adjustTextareaHeight = useCallback(() => {
        const textarea = internalTextareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto'; 
            const newHeight = Math.min(textarea.scrollHeight, 200); 
            textarea.style.height = `${Math.max(56, newHeight)}px`;
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
                    className="relative flex flex-col w-full bg-[#18181b] rounded-[26px] shadow-sm ring-1 ring-white/10 focus-within:ring-white/20 transition-all duration-300 overflow-hidden group"
                >
                    <textarea 
                        ref={internalTextareaRef} 
                        dir="auto" 
                        className="w-full bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground px-4 pt-4 pb-14 max-h-[200px] min-h-[56px] text-[16px] leading-relaxed resize-none scrollbar-none"
                        placeholder={placeholder} 
                        rows={1} 
                        value={text} 
                        onChange={handleInputChange} 
                        onKeyDown={handleKeyDown} 
                        onPaste={handlePaste}
                    />
                    
                    {/* Bottom Toolbar - Absolute positioned as requested */}
                    <div className="flex gap-1.5 absolute inset-x-0 bottom-0 p-2 max-w-full items-end" style={{ cursor: 'crosshair' }}>
                        {/* Attach Button */}
                        <button 
                            type="button"
                            onClick={handleAttachClick}
                            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors duration-100 select-none text-muted-foreground hover:bg-surface-l2 hover:text-foreground h-10 w-10 rounded-full"
                            aria-label={t('chat.input.attach')}
                        >
                            <PaperclipIcon className="size-5" />
                        </button>

                        {/* Spacer / Hidden Middle */}
                        <div className="grow" />

                        {/* Right Actions */}
                        <div className="flex flex-row items-end gap-1">
                            {/* Model Select (Visual Only) */}
                            <button 
                                type="button" 
                                className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-100 select-none hover:bg-surface-l2 h-10 py-1.5 text-sm rounded-full text-foreground px-3.5"
                            >
                                <div className="flex flex-row items-center gap-2">
                                    <div className="flex items-center justify-center size-[18px] overflow-hidden shrink-0">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-[2]">
                                            <path d="M5 14.25L14 4L13 9.75H19L10 20L11 14.25H5Z" stroke="currentColor" strokeWidth="2"></path>
                                        </svg>
                                    </div>
                                    <span className="font-semibold text-sm shrink-0">Fast</span>
                                </div>
                            </button>

                            {/* Voice Button */}
                            <button 
                                type="button"
                                onClick={handleMicClick}
                                className="group flex flex-col justify-center rounded-full focus:outline-none" 
                                aria-label="Enter voice mode"
                            >
                                <div className={`h-10 relative aspect-square flex items-center justify-center gap-0.5 rounded-full ring-1 ring-inset duration-100 ${isRecording ? 'bg-red-500/20 ring-red-500' : 'bg-surface-l2 text-foreground ring-transparent'}`}>
                                    {isRecording ? (
                                        <div className="flex gap-0.5 items-center justify-center h-4">
                                            {[1,2,3,4,5].map(i => (
                                                <div key={i} className="w-0.5 bg-red-500 rounded-full animate-[pulse_0.5s_ease-in-out_infinite]" style={{ height: `${Math.random() * 10 + 4}px` }} />
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center gap-0.5">
                                            <div className="w-0.5 relative z-10 rounded-full bg-current h-1.5"></div>
                                            <div className="w-0.5 relative z-10 rounded-full bg-current h-3"></div>
                                            <div className="w-0.5 relative z-10 rounded-full bg-current h-5"></div>
                                            <div className="w-0.5 relative z-10 rounded-full bg-current h-3"></div>
                                            <div className="w-0.5 relative z-10 rounded-full bg-current h-4"></div>
                                            <div className="w-0.5 relative z-10 rounded-full bg-current h-1.5"></div>
                                        </div>
                                    )}
                                </div>
                            </button>

                            {/* Submit / Stop Button */}
                            <button 
                                type={isLoading ? "button" : "submit"}
                                onClick={isLoading ? onAbortGeneration : undefined}
                                disabled={!hasContent && !isLoading}
                                className={`group flex flex-col justify-center rounded-full focus:outline-none transition-opacity ${!hasContent && !isLoading ? 'opacity-50 cursor-not-allowed' : 'opacity-100'}`} 
                                aria-label="Submit"
                            >
                                <div className={`h-10 relative aspect-square flex flex-col items-center justify-center rounded-full ring-inset transition-colors duration-100 ${hasContent || isLoading ? 'bg-foreground text-background' : 'bg-surface-l2 text-muted-foreground'}`}>
                                    {isLoading ? (
                                        <StopCircleIcon className="size-5" />
                                    ) : (
                                        <ArrowUpIcon className="size-5" />
                                    )}
                                </div>
                            </button>
                        </div>
                    </div>
                </form>
                <div className="text-center mt-2 text-xs text-muted-foreground/60">
                    {t('chat.input.disclaimer')}
                </div>
            </div>
        </div>
    );
});

export default ChatInput;