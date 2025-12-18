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
    const [isRecording, setIsRecording] = useState(false);
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);

    const adjustTextareaHeight = useCallback(() => {
        const textarea = internalTextareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto'; 
            const newHeight = Math.min(textarea.scrollHeight, 200); 
            textarea.style.height = `${Math.max(40, newHeight)}px`;
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
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
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

    const hasText = text.trim().length > 0;
    const hasAttachments = attachmentPreviews.length > 0;
    const isSendActive = hasText || hasAttachments;

    const VoiceWaveButton = () => (
        <button 
            type="button"
            onClick={handleMicClick}
            className={`w-10 h-10 relative flex items-center justify-center gap-0.5 rounded-full duration-100 transition-all ${isRecording ? 'bg-red-500 scale-105' : 'bg-[#2a2a2a] hover:bg-[#3a3a3a]'}`}
            aria-label="Voice input"
        >
            <div className={`w-0.5 relative z-10 rounded-full transition-all ${isRecording ? 'bg-white animate-[pulse_0.4s_infinite]' : 'bg-[#e0e0e0]'}`} style={{ height: '0.4rem' }}></div>
            <div className={`w-0.5 relative z-10 rounded-full transition-all ${isRecording ? 'bg-white animate-[pulse_0.6s_infinite]' : 'bg-[#e0e0e0]'}`} style={{ height: '0.8rem' }}></div>
            <div className={`w-0.5 relative z-10 rounded-full transition-all ${isRecording ? 'bg-white animate-[pulse_0.5s_infinite]' : 'bg-[#e0e0e0]'}`} style={{ height: '1.2rem' }}></div>
            <div className={`w-0.5 relative z-10 rounded-full transition-all ${isRecording ? 'bg-white animate-[pulse_0.7s_infinite]' : 'bg-[#e0e0e0]'}`} style={{ height: '0.7rem' }}></div>
            <div className={`w-0.5 relative z-10 rounded-full transition-all ${isRecording ? 'bg-white animate-[pulse_0.3s_infinite]' : 'bg-[#e0e0e0]'}`} style={{ height: '1rem' }}></div>
            <div className={`w-0.5 relative z-10 rounded-full transition-all ${isRecording ? 'bg-white animate-[pulse_0.45s_infinite]' : 'bg-[#e0e0e0]'}`} style={{ height: '0.4rem' }}></div>
        </button>
    );

    return (
        <div className="flex flex-col justify-end w-full relative items-center gap-2">
             <div className="w-full max-w-[44rem] px-4 animate-fade-in-up">
                {(replyContextText || attachmentPreviews.length > 0) && (
                    <div className="w-full mb-1">
                        {replyContextText && (
                            <div className="flex items-center justify-between gap-2 bg-[#1f1f1f] border border-[#333333] p-3 rounded-2xl mb-2 shadow-sm max-w-2xl">
                                <div className="text-sm text-[#e0e0e0] line-clamp-1 border-l-2 border-[#1d9bf0] pl-3">{replyContextText}</div>
                                <button onClick={onClearReplyContext} className="p-1 rounded-full hover:bg-white/10 text-[#888888]"><XIcon className="size-4" /></button>
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
            
            <div className="w-full max-w-[44rem] px-2 md:px-0 relative">
                <input ref={fileInputRef} className="hidden" multiple type="file" onChange={handleFileChange} />
                <form 
                    onSubmit={handleSubmit} 
                    className="w-full bg-[#1f1f1f] rounded-full border border-[#333333] flex items-center gap-3 p-3 shadow-2xl relative"
                >
                    {/* Attach Button */}
                    <button 
                        type="button"
                        onClick={handleAttachClick}
                        className="flex items-center justify-center w-10 h-10 rounded-full bg-[#2a2a2a] hover:bg-[#3a3a3a] cursor-pointer transition-colors flex-shrink-0"
                        aria-label={t('chat.input.attach')}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-[2] text-[#888888]">
                            <path d="M10 9V15C10 16.1046 10.8954 17 12 17V17C13.1046 17 14 16.1046 14 15V7C14 4.79086 12.2091 3 10 3V3C7.79086 3 6 4.79086 6 7V15C6 18.3137 8.68629 21 12 21V21C15.3137 21 18 18.3137 18 15V8" stroke="currentColor"></path>
                        </svg>
                    </button>

                    {/* Text Input Area */}
                    <div className="flex-1 flex items-center relative h-full">
                         <textarea 
                            ref={internalTextareaRef} 
                            dir="auto" 
                            className="w-full bg-transparent outline-none text-[#e0e0e0] placeholder-[#888888] text-base py-2 px-1 resize-none scrollbar-none"
                            placeholder={t('chat.input.placeholder')} 
                            rows={1} 
                            value={text} 
                            onChange={handleInputChange} 
                            onKeyDown={handleKeyDown} 
                            onPaste={handlePaste}
                        />
                    </div>
                    
                    {/* Action Group: Mic and Send/Stop */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Mic Button - Visible when not generating */}
                        {!isLoading && <VoiceWaveButton />}

                        {/* Send/Stop Button */}
                        {isLoading ? (
                            <button 
                                type="button"
                                onClick={onAbortGeneration}
                                className="flex items-center justify-center w-10 h-10 rounded-full bg-white transition-all duration-200 flex-shrink-0"
                                aria-label="Stop generation"
                            >
                                <div className="w-3 h-3 bg-black rounded-[3px]"></div>
                            </button>
                        ) : (
                            <button 
                                type="submit"
                                disabled={!isSendActive}
                                className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 flex-shrink-0 ${isSendActive ? 'bg-white cursor-pointer' : 'bg-[#333333] cursor-default opacity-80'}`}
                                aria-label="Submit"
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`stroke-[2.5] ${isSendActive ? 'text-black' : 'text-[#888888]'}`}>
                                    <path d="m5 12 7-7 7 7"></path>
                                    <path d="M12 19V5"></path>
                                </svg>
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
});

export default ChatInput;