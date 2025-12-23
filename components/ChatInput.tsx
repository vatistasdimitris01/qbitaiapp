
import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { PaperclipIcon, ArrowUpIcon, XIcon, ReplyIcon } from './icons';

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
  const [attachedFiles, setAttachedFiles] = React.useState<File[]>([]);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    handleFiles: (files: FileList) => {
        const newFiles = Array.from(files);
        setAttachedFiles(prev => [...prev, ...newFiles]);
    }
  }));

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [text]);

  const handleSend = () => {
    if ((text.trim() || attachedFiles.length > 0) && !isLoading) {
      onSendMessage(text, attachedFiles);
      onTextChange('');
      setAttachedFiles([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files);
      setAttachedFiles(prev => [...prev, ...newFiles]);
      e.target.value = '';
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const hasText = text.trim().length > 0;

  return (
    <div className="w-full flex flex-col gap-2">
      {/* Previews for replies and files */}
      {(replyContextText || attachedFiles.length > 0) && (
        <div className="flex flex-col gap-2 px-4 mb-2">
          {replyContextText && (
            <div className="flex items-center gap-2 bg-surface-l1 border border-border p-2 rounded-xl text-xs text-muted-foreground animate-fade-in-up">
              <ReplyIcon className="size-3 shrink-0" />
              <span className="truncate flex-1">{replyContextText}</span>
              <button onClick={onClearReplyContext} className="p-1 hover:bg-surface-l2 rounded-full">
                <XIcon className="size-3" />
              </button>
            </div>
          )}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachedFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-2 bg-surface-l1 border border-border pl-2 pr-1 py-1 rounded-lg text-xs animate-fade-in-up">
                  <span className="truncate max-w-[120px]">{file.name}</span>
                  <button onClick={() => removeFile(i)} className="p-1 hover:bg-surface-l2 rounded-full">
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
        className="bg-white dark:bg-[#1f1f1f] rounded-full border border-gray-200 dark:border-[#333333] flex items-center gap-3 p-3 relative transition-all duration-200 dark:[box-shadow:0_-8px_20px_rgba(0,0,0,0.4)]"
        style={{ 
          boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.08)',
        }}
      >
        
        {/* Attach Button */}
        <label className="flex items-center justify-center w-10 h-10 rounded-full cursor-pointer hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex-shrink-0">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={onFileChange} 
            className="hidden" 
            multiple 
          />
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-[2] text-black dark:text-white">
            <path d="M10 9V15C10 16.1046 10.8954 17 12 17V17C13.1046 17 14 16.1046 14 15V7C14 4.79086 12.2091 3 10 3V3C7.79086 3 6 4.79086 6 7V15C6 18.3137 8.68629 21 12 21V21C15.3137 21 18 18.3137 18 15V8" stroke="currentColor"></path>
          </svg>
        </label>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Grok anything..."
          rows={1}
          className="flex-1 bg-transparent outline-none text-black dark:text-[#e0e0e0] placeholder-gray-500 dark:placeholder-[#888888] text-base py-2 px-1 resize-none min-h-[40px] max-h-[200px] overflow-y-hidden"
        />

        {/* Dynamic Right Button Area */}
        <div className="flex items-center justify-center w-10 h-10 flex-shrink-0">
          {isLoading ? (
            <button
              onClick={onAbortGeneration}
              className="h-10 aspect-square flex flex-col items-center justify-center rounded-full ring-1 ring-inset bg-black text-white transition-opacity hover:opacity-90"
              style={{ cursor: 'crosshair' }}
              title={t('chat.input.stop')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-[2]">
                <path d="M4 9.2v5.6c0 1.116 0 1.673.11 2.134a4 4 0 0 0 2.956 2.956c.46.11 1.018.11 2.134.11h5.6c1.116 0 1.673 0 2.134-.11a4 4 0 0 0 2.956-2.956c.11-.46.11-1.018.11-2.134V9.2c0-1.116 0-1.673-.11-2.134a4 4 0 0 0-2.956-2.955C16.474 4 15.916 4 14.8 4H9.2c-1.116 0-1.673 0-2.134.11a4 4 0 0 0-2.955 2.956C4 7.526 4 8.084 4 9.2Z" fill="currentColor"></path>
              </svg>
            </button>
          ) : hasText || attachedFiles.length > 0 ? (
            <button
              onClick={handleSend}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-all duration-200"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="stroke-[2.5] stroke-white dark:stroke-black">
                <path d="m5 12 7-7 7 7"></path>
                <path d="M12 19V5"></path>
              </svg>
            </button>
          ) : (
            <div className="w-10 h-10 bg-black dark:bg-white rounded-full flex items-center justify-center gap-0.5 cursor-pointer hover:opacity-90 transition-all">
                <div className="w-0.5 bg-white dark:bg-black rounded-full" style={{ height: '0.4rem' }}></div>
                <div className="w-0.5 bg-white dark:bg-black rounded-full animate-pulse" style={{ height: '0.8rem' }}></div>
                <div className="w-0.5 bg-white dark:bg-black rounded-full animate-pulse" style={{ height: '1.2rem', animationDelay: '0.1s' }}></div>
                <div className="w-0.5 bg-white dark:bg-black rounded-full animate-pulse" style={{ height: '0.7rem', animationDelay: '0.2s' }}></div>
                <div className="w-0.5 bg-white dark:bg-black rounded-full animate-pulse" style={{ height: '1rem', animationDelay: '0.3s' }}></div>
                <div className="w-0.5 bg-white dark:bg-black rounded-full" style={{ height: '0.4rem' }}></div>
            </div>
          )}
        </div>
      </div>
      
      {/* Disclaimer */}
      <p className="text-[10px] text-gray-500 dark:text-[#888888] text-center mt-1 px-4">
        {t('chat.input.disclaimer')}
      </p>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;
