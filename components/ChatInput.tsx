
import React, { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { PaperclipIcon, XIcon, ReplyIcon } from './icons';

interface ChatInputProps {
  text: string;
  onTextChange: (text: string) => void;
  onSendMessage: (text: string, files: File[]) => void;
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

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(({
  text,
  onTextChange,
  onSendMessage,
  isLoading,
  t,
  onAbortGeneration,
  replyContextText,
  onClearReplyContext
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    handleFiles: (files: FileList) => {
        const newFiles = Array.from(files);
        setAttachedFiles(prev => [...prev, ...newFiles]);
        newFiles.forEach(file => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => setPreviews(prev => [...prev, e.target?.result as string]);
                reader.readAsDataURL(file);
            } else {
                setPreviews(prev => [...prev, 'file']);
            }
        });
    }
  }));

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [text]);

  const handleSend = () => {
    if ((text.trim() || attachedFiles.length > 0) && !isLoading) {
      onSendMessage(text, attachedFiles);
      onTextChange('');
      setAttachedFiles([]);
      setPreviews([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const hasContent = text.trim().length > 0 || attachedFiles.length > 0;

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Reply and File Previews Container */}
      {(replyContextText || previews.length > 0) && (
        <div className="flex flex-col gap-2 px-2 mb-1">
          {replyContextText && (
            <div className="flex items-center gap-2 bg-surface-l1 dark:bg-[#111] border border-border p-2 rounded-xl text-xs text-muted-foreground animate-fade-in-up shadow-sm">
              <ReplyIcon className="size-3 shrink-0" />
              <span className="truncate flex-1">{replyContextText}</span>
              <button onClick={onClearReplyContext} className="p-1 hover:bg-surface-l2 rounded-full">
                <XIcon className="size-3" />
              </button>
            </div>
          )}
          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2 animate-fade-in-up">
              {previews.map((src, i) => (
                <div key={i} className="relative group size-16 rounded-xl border border-border overflow-hidden bg-surface-l1 shadow-sm">
                  {src === 'file' ? (
                    <div className="w-full h-full flex items-center justify-center text-[10px] p-1 text-center truncate">
                        {attachedFiles[i]?.name}
                    </div>
                  ) : (
                    <img src={src} className="w-full h-full object-cover" alt="" />
                  )}
                  <button 
                    onClick={() => removeFile(i)}
                    className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Input Bar */}
      <div 
        className="bg-white dark:bg-[#1f1f1f] lg:dark:bg-[#1f1f1f] dark:bg-surface-l1 rounded-[1.75rem] border border-gray-200 dark:border-[#27272a] flex items-end gap-2 p-2 relative shadow-lg"
      >
        <label className="flex items-center justify-center size-10 rounded-full cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors flex-shrink-0 mb-0.5">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => e.target.files && (ref as any).current?.handleFiles(e.target.files)} 
            className="hidden" 
            multiple 
          />
          <PaperclipIcon className="size-5 text-muted-foreground" />
        </label>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder="Ask Grok anything..."
          className="flex-1 bg-transparent outline-none text-foreground placeholder-muted-foreground text-[16px] py-2.5 px-1 resize-none max-h-[200px]"
          rows={1}
        />

        <div className="flex items-center justify-center size-10 flex-shrink-0 mb-0.5">
          {isLoading ? (
            <button
              onClick={onAbortGeneration}
              className="size-8 flex items-center justify-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90"
            >
              <div className="size-3 bg-current rounded-sm"></div>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!hasContent}
              className={`flex items-center justify-center size-8 rounded-full transition-all ${hasContent ? 'bg-foreground text-background scale-110' : 'bg-transparent text-muted-foreground opacity-30 cursor-default'}`}
            >
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-[2.5]">
                <path d="m5 12 7-7 7 7" stroke="currentColor"></path>
                <path d="M12 19V5" stroke="currentColor"></path>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';
export default ChatInput;
