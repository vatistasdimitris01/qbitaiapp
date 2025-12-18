
import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { PaperclipIcon, ArrowUpIcon, StopCircleIcon, XIcon, ReplyIcon } from './icons';

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
      <div className="bg-[#1f1f1f] rounded-[28px] border border-[#333333] flex items-end gap-2 p-2 shadow-2xl relative">
        
        {/* Attach Button */}
        <label className="flex items-center justify-center w-10 h-10 rounded-full cursor-pointer hover:bg-white/10 transition-colors flex-shrink-0 mb-0.5">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={onFileChange} 
            className="hidden" 
            multiple 
          />
          <PaperclipIcon className="size-5 text-white" />
        </label>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.input.placeholder')}
          rows={1}
          className="flex-1 bg-transparent outline-none text-[#e0e0e0] placeholder-[#888888] text-base py-2.5 px-1 resize-none min-h-[40px] max-h-[200px] overflow-y-auto scrollbar-none"
        />

        {/* Dynamic Right Button */}
        <div className="flex items-center justify-center w-10 h-10 flex-shrink-0 mb-0.5">
          {isLoading ? (
            <button
              onClick={onAbortGeneration}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-black hover:bg-white/90 transition-all duration-200"
              title={t('chat.input.stop')}
            >
              <StopCircleIcon className="size-5" />
            </button>
          ) : hasText || attachedFiles.length > 0 ? (
            <button
              onClick={handleSend}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white text-black hover:bg-white/90 transition-all duration-200"
              title={t('chat.input.submit')}
            >
              <ArrowUpIcon className="size-5" />
            </button>
          ) : (
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center gap-0.5 cursor-pointer hover:bg-white/90 transition-all">
                <div className="w-0.5 bg-black rounded-full" style={{ height: '0.4rem' }}></div>
                <div className="w-0.5 bg-black rounded-full animate-pulse" style={{ height: '0.8rem' }}></div>
                <div className="w-0.5 bg-black rounded-full animate-pulse" style={{ height: '1.2rem', animationDelay: '0.1s' }}></div>
                <div className="w-0.5 bg-black rounded-full animate-pulse" style={{ height: '0.7rem', animationDelay: '0.2s' }}></div>
                <div className="w-0.5 bg-black rounded-full animate-pulse" style={{ height: '1rem', animationDelay: '0.3s' }}></div>
                <div className="w-0.5 bg-black rounded-full" style={{ height: '0.4rem' }}></div>
            </div>
          )}
        </div>
      </div>
      
      {/* Disclaimer */}
      <p className="text-[10px] text-[#888888] text-center mt-1 px-4">
        {t('chat.input.disclaimer')}
      </p>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;
