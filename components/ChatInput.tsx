
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
            // Min height for one line + padding
            // Max height handled by max-h CSS
            const newHeight = Math.min(textarea.scrollHeight, 400); 
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
            if (recognitionRef.current) {
                recognitionRef.current.stop();
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
            };

            recognitionRef.current = recognition;
            recognition.start();
        }
    };

    const placeholder = attachmentPreviews.length > 0 ? t('chat.input.placeholderWithFiles', { count: attachmentPreviews.length.toString() }) : t('chat.input.placeholder');
    const hasContent = text.trim().length > 0 || attachmentPreviews.length > 0;

    return (
        <div className="flex flex-col justify-end w-full relative items-center gap-2 pb-6">
            {/* Context & Preview Container - matches input width */}
             <div className="w-full xl:w-4/5 max-w-[1200px] animate-fade-in-up px-2">
                {(replyContextText || attachmentPreviews.length > 0) && (
                    <div className="w-full mb-2 pl-8">
                        {replyContextText && (
                            <div className="flex items-center justify-between gap-2 bg-card border border-default p-3 rounded-2xl mb-2 shadow-sm max-w-2xl">
                                <div className="text-sm text-muted-foreground line-clamp-1 border-l-2 border-[#1d9bf0] pl-3">{replyContextText}</div>
                                <button onClick={onClearReplyContext} className="p-1 rounded-full hover:bg-token-surface-secondary"><XIcon className="size-4" /></button>
                            </div>
                        )}
                        
                        {attachmentPreviews.length > 0 && (
                            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                                {attachmentPreviews.map((attachment, index) => (
                                    <div key={index} className="relative group shrink-0 size-16 rounded-xl overflow-hidden border border-default bg-background">
                                        <img alt={attachment.file.name} className="h-full w-full object-cover" src={attachment.previewUrl} />
                                        <button onClick={() => handleRemoveFile(index)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <XIcon className="size-5 text-white" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            <div className="w-full xl:w-4/5 max-w-[1200px] relative px-2">
                <input ref={fileInputRef} className="hidden" multiple type="file" onChange={handleFileChange} />
                <form 
                    onSubmit={handleSubmit} 
                    className="relative flex items-end w-full bg-[#212121]/90 backdrop-blur-md rounded-[2.5rem] transition-colors duration-300 min-h-[52px]"
                >
                    {/* Left Side: Attach - Absolute positioned */}
                    <div className="absolute left-3 bottom-2.5 z-10">
                        <button
                            type="button"
                            onClick={handleAttachClick}
                            className="flex items-center justify-center size-8 rounded-full hover:bg-[#333333] text-gray-400 hover:text-white transition-colors"
                            disabled={isLoading}
                            aria-label={t('chat.input.attach')}
                        >
                            <PaperclipIcon className="size-4 transform rotate-90" />
                        </button>
                    </div>
                    
                    {/* Middle: Input with heavy left padding */}
                    <textarea 
                        ref={internalTextareaRef} 
                        dir="auto" 
                        className="flex-1 bg-transparent focus:outline-none text-[#e4e4e7] placeholder:text-gray-500 py-3.5 pl-[52px] pr-[60px] max-h-[400px] min-h-[24px] text-[15px] leading-relaxed resize-none scrollbar-none rounded-[2.5rem]"
                        placeholder={placeholder} 
                        rows={1} 
                        value={text} 
                        onChange={handleInputChange} 
                        onKeyDown={handleKeyDown} 
                        onPaste={handlePaste}
                        readOnly={isRecording}
                    />
                    
                    {/* Right Side: Absolute Buttons */}
                    <div className="absolute right-2 bottom-2 flex items-center gap-2 z-10">
                         {/* Show Send button only when typing, otherwise Voice */}
                        {hasContent ? (
                             <button 
                                type={isLoading ? "button" : "submit"}
                                onClick={isLoading ? onAbortGeneration : undefined}
                                className={`flex items-center justify-center size-9 rounded-full transition-all shadow-sm hover:shadow-md active:scale-95 duration-200 bg-white text-black`}
                                disabled={false}
                            >
                                {isLoading ? (
                                    <div className="size-2.5 bg-black rounded-[1px]" />
                                ) : (
                                    <ArrowUpIcon className="size-4 font-bold" />
                                )}
                            </button>
                        ) : (
                             <button 
                                type="button"
                                onClick={handleMicClick}
                                className={`flex items-center justify-center size-9 rounded-full transition-all shadow-sm hover:shadow-md active:scale-95 duration-200 ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-black'}`}
                            >
                                {isRecording ? <XIcon className="size-4" /> : <VoiceWaveIcon className="size-4" />}
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
});

export default ChatInput;
