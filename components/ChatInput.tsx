import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PaperclipIcon, ArrowUpIcon, XIcon } from './icons';
import { FileAttachment } from '../types';

interface ChatInputProps {
    onSendMessage: (message: string, attachments: FileAttachment[]) => void;
    isLoading: boolean;
    t: (key: string, params?: Record<string, string>) => string;
    onAbortGeneration: () => void;
}

// Small files are read as data URLs for inline preview
const SMALL_FILE_THRESHOLD = 4 * 1024 * 1024; // 4 MB

// Limits for the entire attachment batch
const MAX_FILES = 5;
const MAX_TOTAL_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_SINGLE_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
};

// Mocks a file upload to a signed URL, with progress.
// In a real app, this would get a URL from the backend and then fetch/XHR to it.
const uploadLargeFile = (
    attachment: FileAttachment,
    onProgress: (progress: number) => void,
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const { file, abortController } = attachment;
        if (!file || !abortController) {
            return reject(new Error('File or AbortController missing.'));
        }

        const signal = abortController.signal;
        let progress = 0;

        // Simulate upload progress
        const interval = setInterval(() => {
            if (signal.aborted) {
                clearInterval(interval);
                return reject(new DOMException('Upload aborted by user.', 'AbortError'));
            }
            progress += Math.random() * 20;
            if (progress >= 100) {
                clearInterval(interval);
                onProgress(100);
                // In a real app, this would be the file's GCS URI or S3 key.
                const fileIdentifier = `gs://mock-bucket/${Date.now()}-${file.name}`;
                resolve(fileIdentifier);
            } else {
                onProgress(progress);
            }
        }, 300); // Simulate network speed

        signal.addEventListener('abort', () => {
            clearInterval(interval);
            reject(new DOMException('Upload aborted by user.', 'AbortError'));
        });
    });
};


const ChatInput: React.FC<ChatInputProps> = ({ onSendMessage, isLoading, t, onAbortGeneration }) => {
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
        if (!e.target.files) return;

        const currentSize = attachments.reduce((acc, file) => acc + file.size, 0);
        let newFilesSize = 0;
        // FIX: Explicitly type `filesToProcess` as `File[]` to ensure correct type inference for `file` in the loop.
        const filesToProcess: File[] = Array.from(e.target.files);

        for (const file of filesToProcess) {
            // --- Validation ---
            if (attachments.length + 1 > MAX_FILES) {
                window.alert(t('chat.input.tooManyFiles', { count: String(MAX_FILES) }));
                break;
            }
            if (file.size > MAX_SINGLE_FILE_SIZE) {
                window.alert(t('chat.input.fileTooLarge', { filename: file.name, size: `${MAX_SINGLE_FILE_SIZE / (1024 ** 2)}MB` }));
                continue;
            }
            if (currentSize + newFilesSize + file.size > MAX_TOTAL_SIZE) {
                window.alert(t('chat.input.totalSizeTooLarge', { size: `${MAX_TOTAL_SIZE / (1024 ** 2)}MB` }));
                break;
            }
            newFilesSize += file.size;

            // --- File processing ---
            const abortController = new AbortController();
            const attachment: FileAttachment = {
                name: file.name,
                type: file.type,
                size: file.size,
                file, // Keep the file object for upload
                abortController,
            };

            setAttachments(prev => [...prev, attachment]);

            if (file.size < SMALL_FILE_THRESHOLD) {
                // Handle small file: read as data URL for preview
                try {
                    const dataUrl = await fileToDataURL(file);
                    setAttachments(prev => prev.map(a => a === attachment ? { ...a, dataUrl, uploadStatus: 'completed', file: undefined } : a));
                } catch (error) {
                    console.error("Error reading small file:", error);
                    setAttachments(prev => prev.map(a => a === attachment ? { ...a, uploadStatus: 'error', file: undefined } : a));
                }
            } else {
                // Handle large file: "upload" it
                setAttachments(prev => prev.map(a => a === attachment ? { ...a, uploadStatus: 'uploading', progress: 0 } : a));
                
                try {
                    const fileIdentifier = await uploadLargeFile(attachment, (progress) => {
                        setAttachments(prev => prev.map(a => a === attachment ? { ...a, progress } : a));
                    });
                    setAttachments(prev => prev.map(a => a === attachment ? { ...a, uploadStatus: 'completed', fileIdentifier, file: undefined, progress: 100 } : a));
                } catch (error) {
                    if ((error as Error).name !== 'AbortError') {
                        console.error("Error uploading large file:", error);
                        setAttachments(prev => prev.map(a => a === attachment ? { ...a, uploadStatus: 'error', file: undefined } : a));
                    }
                }
            }
        }

        if (e.target) e.target.value = '';
    };
    
    const handleRemoveFile = (indexToRemove: number) => {
        const attachmentToRemove = attachments[indexToRemove];
        if (attachmentToRemove?.uploadStatus === 'uploading') {
            attachmentToRemove.abortController?.abort();
        }
        setAttachments(prev => prev.filter((_, i) => i !== indexToRemove));
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setText(e.target.value);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const isUploading = attachments.some(a => a.uploadStatus === 'uploading');
        if (isLoading || isUploading) return;
        
        const completedAttachments = attachments.filter(a => a.uploadStatus === 'completed');
        if (text.trim() || completedAttachments.length > 0) {
            let messageToSend = text.trim();
            if (!messageToSend && completedAttachments.length > 0) {
                messageToSend = t('chat.input.placeholderWithFiles', { count: completedAttachments.length.toString() });
            }
            onSendMessage(messageToSend, completedAttachments);
            setText('');
            setAttachments([]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };
    
    const isUploading = attachments.some(a => a.uploadStatus === 'uploading');

    return (
        <form onSubmit={handleSubmit} className="relative">
            {attachments.length > 0 && (
                <div className="p-3 bg-card border border-default border-b-0 rounded-t-xl mb-[-1px]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                        {attachments.map((file, index) => (
                            <div key={index} className="relative group aspect-square">
                                <div className="w-full h-full bg-token-surface-secondary rounded-lg flex items-center justify-center overflow-hidden">
                                    {file.dataUrl && file.type.startsWith('image/') ? (
                                        <img src={file.dataUrl} alt={file.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="text-center p-2 flex flex-col items-center justify-center">
                                            <p className="text-xs text-token-secondary break-all">{file.name}</p>
                                        </div>
                                    )}
                                </div>
                                 {file.uploadStatus === 'uploading' && (
                                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white p-2">
                                        <div className="w-full bg-white/30 rounded-full h-1.5">
                                            <div className="bg-white h-1.5 rounded-full" style={{ width: `${file.progress || 0}%` }}></div>
                                        </div>
                                        <span className="text-xs font-medium mt-2">{Math.round(file.progress || 0)}%</span>
                                    </div>
                                )}
                                {file.uploadStatus === 'error' && (
                                    <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center text-white text-xs font-bold p-2">
                                        Upload Failed
                                    </div>
                                )}
                                <button
                                    type="button"
                                    onClick={() => handleRemoveFile(index)}
                                    className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                    aria-label={t('chat.input.removeFile', { filename: file.name })}
                                >
                                    <XIcon className="size-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div className="flex items-end p-2 bg-card/80 backdrop-blur-md border border-default rounded-xl shadow-sm">
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg flex-shrink-0"
                    aria-label={t('chat.input.attach')}
                >
                    <PaperclipIcon className="size-5" />
                </button>
                <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    className="hidden"
                />
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={t('chat.input.placeholder')}
                    className="flex-1 bg-transparent resize-none p-2 text-foreground placeholder-muted outline-none"
                    rows={1}
                    style={{ maxHeight: '200px' }}
                />
                 {isLoading ? (
                     <button
                        type="button"
                        onClick={onAbortGeneration}
                        className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg flex-shrink-0"
                        aria-label={t('chat.input.stop')}
                    >
                        <div className="w-4 h-4 bg-foreground rounded-sm"></div>
                    </button>
                 ) : (
                    <button
                        type="submit"
                        disabled={!text.trim() && attachments.length === 0 || isUploading}
                        className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={t('chat.input.submit')}
                    >
                        <ArrowUpIcon className="size-5" />
                    </button>
                 )}
            </div>
            <p className="text-center text-xs text-muted mt-2 px-4">{t('chat.input.disclaimer')}</p>
        </form>
    );
};

export default ChatInput;