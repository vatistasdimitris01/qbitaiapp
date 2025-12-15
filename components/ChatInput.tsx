import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PaperclipIcon, ArrowUpIcon, XIcon, VoiceWaveIcon } from './icons';

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
            // Stop logic
            if (recognitionRef.current) {
                // Use abort() to cut immediately as per request.
                recognitionRef.current.abort();
            }
            setIsRecording(false);
        } else {
            // Start logic
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognition) {
                alert("Speech recognition is not supported in this browser.");
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = language;

            // Capture the text at the start of recording
            let initialText = text;
            // Add space if there is text and no trailing space
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
                // Update parent text. Note: This overrides concurrent manual edits.
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
            {/* Context & Preview Container */}
             <div className="w-full max-w-[48rem] px-4 animate-fade-in-up">
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
            
            <div className="w-full max-w-[48rem] px-2 md:px-0 relative">
                <input ref={fileInputRef} className="hidden" multiple type="file" onChange={handleFileChange} />
                <form 
                    onSubmit={handleSubmit} 
                    className="relative flex flex-col w-full bg-surface-l1 rounded-[26px] shadow-sm border border-border transition-colors duration-300 overflow-hidden"
                >
                    <textarea 
                        ref={internalTextareaRef} 
                        dir="auto" 
                        className="w-full bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground px-4 pt-4 pb-12 max-h-[200px] min-h-[56px] text-[16px] leading-relaxed resize-none scrollbar-none"
                        placeholder={placeholder} 
                        rows={1} 
                        value={text} 
                        onChange={handleInputChange} 
                        onKeyDown={handleKeyDown} 
                        onPaste={handlePaste}
                    />
                    
                    {/* Bottom Toolbar */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                         <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={handleAttachClick}
                                className="flex items-center justify-center size-9 rounded-full hover:bg-surface-l2 text-muted-foreground hover:text-foreground transition-colors"
                                disabled={isLoading}
                                aria-label={t('chat.input.attach')}
                            >
                                <PaperclipIcon className="size-5 transform rotate-90" />
                            </button>
                         </div>

                         <div className="flex items-center gap-2">
                             {/* Mic Button - Toggle with Send if content exists */}
                             {!hasContent && (
                                <button 
                                    type="button"
                                    onClick={handleMicClick}
                                    className={`flex items-center justify-center size-9 rounded-full transition-all duration-200 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-surface-l2'}`}
                                >
                                    {isRecording ? <XIcon className="size-5" /> : <VoiceWaveIcon className="size-5" />}
                                </button>
                             )}

                            <button 
                                type={isLoading ? "button" : "submit"}
                                onClick={isLoading ? onAbortGeneration : undefined}
                                className={`flex items-center justify-center size-9 rounded-full transition-all duration-200 ${hasContent || isLoading ? 'bg-foreground text-background' : 'bg-surface-l2 text-muted-foreground cursor-not-allowed'}`}
                                disabled={!hasContent && !isLoading}
                            >
                                {isLoading ? (
                                    <div className="size-2.5 bg-background rounded-[1px]" />
                                ) : (
                                    <ArrowUpIcon className="size-5 font-bold" />
                                )}
                            </button>
                         </div>
                    </div>
                </form>
                <div className="text-center mt-2 text-xs text-muted-foreground">
                    {t('chat.input.disclaimer')}
                </div>
            </div>
        </div>
    );
});

export default ChatInput;