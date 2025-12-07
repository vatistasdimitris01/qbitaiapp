
import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PaperclipIcon, XIcon, VoiceLinesIcon, ArrowUpLineIcon, StopCircleIcon, VisualizerIcon } from './icons';

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

    const hasContent = text.trim().length > 0 || attachmentPreviews.length > 0 || replyContextText;
    const placeholder = attachmentPreviews.length > 0 ? t('chat.input.placeholderWithFiles', { count: attachmentPreviews.length.toString() }) : "How can I help?";

    // Decide which icon to show on the main action button
    const ActionIcon = (() => {
        if (isLoading) return <StopCircleIcon className="size-6 text-black" />;
        if (isRecording) return <VisualizerIcon className="text-red-500 scale-125" />;
        if (hasContent) return <ArrowUpLineIcon className="text-black" />;
        return <VoiceLinesIcon className="text-black" />;
    })();

    const handleActionClick = () => {
        if (isLoading) {
            onAbortGeneration();
        } else if (hasContent) {
            // Send
             const hasData = text.trim() || attachmentPreviews.length > 0 || replyContextText;
             if (hasData) {
                 onSendMessage(text.trim(), attachmentPreviews.map(p => p.file));
                 onTextChange('');
                 setAttachmentPreviews([]);
             }
        } else {
            // Trigger Mic
            handleMicClick();
        }
    };

    return (
        <div className="flex flex-col justify-center w-full relative items-center gap-4">
             {/* Context/Files Area (Floating above) */}
             {(replyContextText || attachmentPreviews.length > 0) && (
                <div className="w-full max-w-[820px] px-8 mb-2 animate-fade-in-up">
                    {replyContextText && (
                        <div className="flex items-center justify-between gap-2 bg-[#181818] border border-white/10 p-3 rounded-2xl mb-2 shadow-sm">
                            <div className="text-xs text-gray-400 line-clamp-1 border-l-2 border-white pl-2">{replyContextText}</div>
                            <button onClick={onClearReplyContext} type="button" className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white"><XIcon className="size-3" /></button>
                        </div>
                    )}
                    {attachmentPreviews.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-1">
                            {attachmentPreviews.map((attachment, index) => (
                                <div key={index} className="relative group shrink-0 size-12 rounded-lg overflow-hidden border border-white/10 bg-black">
                                    <img alt={attachment.file.name} className="h-full w-full object-cover" src={attachment.previewUrl} />
                                    <button onClick={() => handleRemoveFile(index)} type="button" className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <XIcon className="size-3 text-white" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="w-full max-w-[820px] px-2">
                 <form onSubmit={handleSubmit} className="bg-[#1a1a1a] border border-white/5 rounded-full flex items-center justify-between px-6 h-[72px] shadow-xl hover:shadow-2xl hover:scale-[1.01] transition-all duration-300">
                    <input ref={fileInputRef} className="hidden" multiple type="file" onChange={handleFileChange} />

                    {/* Left Side */}
                    <div className="flex items-center gap-4 flex-1 h-full">
                        {/* Rotated Paperclip */}
                        <button 
                            type="button" 
                            onClick={handleAttachClick}
                            className="text-gray-300 opacity-80 hover:opacity-100 transition-all focus:outline-none"
                            aria-label="Attach file"
                        >
                            <PaperclipIcon className="size-[22px] transform rotate-90" />
                        </button>

                        {/* Input */}
                        <input
                            ref={internalTextareaRef}
                            type="text"
                            placeholder={placeholder}
                            value={text}
                            onChange={handleInputChange}
                            readOnly={isRecording}
                            className="flex-1 bg-transparent text-white text-[19px] placeholder-gray-400 outline-none focus:outline-none transition-all h-full"
                        />
                    </div>

                    {/* Right Side Button (Dynamic Voice / Send) */}
                    <button 
                        id="actionButton"
                        type="button"
                        onClick={handleActionClick}
                        className="bg-white w-[52px] h-[52px] rounded-full flex items-center justify-center hover:bg-gray-100 transition-all shadow-md active:scale-95 ml-3 shrink-0"
                    >
                        {ActionIcon}
                    </button>
                 </form>
            </div>
        </div>
    );
});

export default ChatInput;
