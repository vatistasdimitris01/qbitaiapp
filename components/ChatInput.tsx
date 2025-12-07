
import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { PaperclipIcon, ArrowUpIcon, XIcon, MicIcon, StopCircleIcon, RocketIcon, ChevronDownIcon, VisualizerIcon, UserIcon } from './icons';

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

    const placeholder = attachmentPreviews.length > 0 ? t('chat.input.placeholderWithFiles', { count: attachmentPreviews.length.toString() }) : t('chat.input.placeholder');
    const hasContent = text.trim().length > 0 || attachmentPreviews.length > 0;

    return (
        <div className="flex flex-col justify-center w-full relative items-center gap-4">
            <div className="w-full max-w-[700px] relative px-4">
                 <form onSubmit={handleSubmit} className="bg-[#1e1e1e] rounded-[32px] border border-[#2a2a2a] shadow-2xl p-3 flex flex-col relative focus-within:border-gray-600 transition-colors duration-300 w-full">
                    <input ref={fileInputRef} className="hidden" multiple type="file" onChange={handleFileChange} />

                    {/* Context/Files Area */}
                    {(replyContextText || attachmentPreviews.length > 0) && (
                        <div className="w-full px-2 pt-2 mb-2 animate-fade-in-up">
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
                    
                    {/* Text Area */}
                    <div className="px-2 pt-1 pb-10">
                         <input 
                            ref={internalTextareaRef} 
                            type="text"
                            className="w-full bg-transparent text-gray-200 text-lg placeholder-gray-500 outline-none font-light selection:bg-gray-600"
                            placeholder={placeholder} 
                            value={text} 
                            onChange={handleInputChange} 
                            readOnly={isRecording}
                        />
                    </div>

                    {/* Bottom Tools */}
                    <div className="flex items-center justify-between pl-1 pr-1 pb-1">
                        <div className="flex items-center gap-1">
                             {/* Attachment / Plus Icon */}
                            <button 
                                type="button"
                                onClick={handleAttachClick}
                                className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:bg-[#2c2c2c] hover:text-gray-200 transition-colors"
                            >
                                <PaperclipIcon className="size-5" />
                            </button>

                            {/* Mic Icon / Visualizer */}
                            <button 
                                type="button" 
                                onClick={handleMicClick} 
                                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isRecording ? 'text-white bg-red-500/20' : 'text-gray-400 hover:bg-[#2c2c2c] hover:text-gray-200'}`}
                            >
                                {isRecording ? <VisualizerIcon className="text-red-500" /> : <MicIcon className="size-4" />}
                            </button>

                             {/* Speaker Icon (Placeholder for now) */}
                            <button type="button" className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:bg-[#2c2c2c] hover:text-gray-200 transition-colors">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zm-4 0-.29.27L6 7H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3l3.71 3.73.29.27V3.23z"/></svg>
                            </button>
                        </div>

                        {/* Send / Stop Button */}
                        {isLoading ? (
                            <button type="button" onClick={onAbortGeneration} className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-gray-200 transition-colors shadow-sm text-black">
                                <StopCircleIcon className="size-4" />
                            </button>
                        ) : (
                             <button type="submit" disabled={!hasContent} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors shadow-sm ${hasContent ? 'bg-white hover:bg-gray-200 text-black' : 'bg-[#333] text-gray-500 cursor-not-allowed'}`}>
                                <ArrowUpIcon className="size-4"/>
                            </button>
                        )}
                    </div>
                 </form>
            </div>
        </div>
    );
});

export default ChatInput;