
import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PaperclipIcon, ArrowUpIcon, XIcon, MicIcon, StopCircleIcon, RocketIcon, ChevronDownIcon } from './icons';

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
    const internalTextareaRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);

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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => onTextChange(e.target.value);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const hasContent = text.trim() || attachmentPreviews.length > 0 || replyContextText;
        if (hasContent && !isLoading) {
            onSendMessage(text.trim(), attachmentPreviews.map(p => p.file));
            onTextChange('');
            setAttachmentPreviews([]);
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
            recognition.lang = language; // Use current app language

            // Append space if text exists and doesn't end with whitespace
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
                // Update input directly
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
        <div className="flex flex-col justify-center w-full relative items-center gap-4">
             {(replyContextText || attachmentPreviews.length > 0) && (
                <div className="w-full max-w-[720px] animate-fade-in-up px-4">
                    {replyContextText && (
                        <div className="flex items-center justify-between gap-2 bg-[#181818] border border-white/10 p-3 rounded-2xl mb-2 shadow-sm">
                            <div className="text-xs text-gray-400 line-clamp-1 border-l-2 border-white pl-2">{replyContextText}</div>
                            <button onClick={onClearReplyContext} className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"><XIcon className="size-3" /></button>
                        </div>
                    )}
                    
                    {attachmentPreviews.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-1">
                            {attachmentPreviews.map((attachment, index) => (
                                <div key={index} className="relative group shrink-0 size-12 rounded-lg overflow-hidden border border-white/10 bg-black">
                                    <img alt={attachment.file.name} className="h-full w-full object-cover" src={attachment.previewUrl} />
                                    <button onClick={() => handleRemoveFile(index)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <XIcon className="size-3 text-white" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            
            <div className="w-full max-w-[720px] relative px-4">
                <input ref={fileInputRef} className="hidden" multiple type="file" onChange={handleFileChange} />
                
                <form onSubmit={handleSubmit} className="relative flex items-center w-full bg-[#181818] border border-white/5 hover:border-white/10 rounded-[32px] pl-2 pr-2 py-1 shadow-sm transition-all h-[56px]">
                    {/* Attachment Icon */}
                    <button
                        type="button"
                        onClick={handleAttachClick}
                        className="flex items-center justify-center p-2 rounded-full hover:bg-white/5 text-gray-400 hover:text-white transition-colors shrink-0"
                        disabled={isLoading}
                    >
                        <PaperclipIcon className="size-5 transform rotate-45" />
                    </button>
                    
                    {/* Main Input */}
                    <input 
                        ref={internalTextareaRef} 
                        type="text"
                        className="flex-1 bg-transparent border-none outline-none text-gray-200 placeholder-gray-500 ml-2 h-full text-[15px] font-normal"
                        placeholder={placeholder} 
                        value={text} 
                        onChange={handleInputChange} 
                        readOnly={isRecording}
                    />
                    
                    {/* Right Controls */}
                    <div className="flex items-center gap-3 pl-2">
                         {/* Auto/Model Selector Placeholder */}
                        <button type="button" className="hidden sm:flex items-center gap-1.5 text-gray-400 text-xs font-medium hover:bg-white/5 px-2.5 py-1.5 rounded-lg transition-colors border border-transparent hover:border-white/5">
                            <RocketIcon className="size-3.5" />
                            <span>Auto</span>
                            <ChevronDownIcon className="size-2.5 ml-0.5 opacity-70" />
                        </button>

                        {isLoading ? (
                            <button type="button" onClick={onAbortGeneration} className="flex items-center justify-center w-8 h-8 rounded-full bg-white text-black hover:opacity-90 transition-opacity">
                                <StopCircleIcon className="size-4" />
                            </button>
                        ) : hasContent ? (
                            <button type="submit" className="flex items-center justify-center w-8 h-8 rounded-full bg-white text-black hover:opacity-90 transition-opacity" disabled={!hasContent}>
                                <ArrowUpIcon className="size-4"/>
                            </button>
                        ) : (
                            <button type="button" onClick={handleMicClick} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-white text-black hover:bg-gray-200'}`}>
                                <MicIcon className="size-4" />
                            </button>
                        )}
                    </div>
                </form>
            </div>
             <p className="text-[10px] text-center text-gray-600 font-medium tracking-wide">Qbit can make mistakes.</p>
        </div>
    );
});

export default ChatInput;
