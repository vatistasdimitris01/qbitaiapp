
import React, { useState, useEffect } from 'react';
import { XIcon, CopyIcon } from './icons';

interface CodeAnalysisModalProps {
    code: string;
    lang: string;
    onClose: () => void;
}

const CodeAnalysisModal: React.FC<CodeAnalysisModalProps> = ({ code, lang, onClose }) => {
    const [isCopied, setIsCopied] = useState(false);
    const [highlightedCode, setHighlightedCode] = useState('');

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    useEffect(() => {
        if ((window as any).hljs) {
            try {
                const highlighted = (window as any).hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
                setHighlightedCode(highlighted);
            } catch (e) {
                setHighlightedCode(code); // Fallback to plain text
            }
        } else {
            setHighlightedCode(code);
        }
    }, [code, lang]);

    const handleCopy = () => {
        navigator.clipboard.writeText(code).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        });
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div
                className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-default"
                onClick={e => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-default flex-shrink-0">
                    <h2 className="text-lg font-semibold text-foreground">Analysis</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full hover:bg-token-surface-secondary text-muted-foreground"
                        aria-label="Close analysis"
                    >
                        <XIcon className="size-5" />
                    </button>
                </header>

                <div className="flex items-center justify-between px-4 py-2 bg-token-surface-secondary/50 border-b border-default text-sm flex-shrink-0">
                    <span className="font-mono bg-background text-muted-foreground px-2 py-0.5 rounded text-xs border border-default">{lang}</span>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
                            <input type="checkbox" className="toggle-switch" defaultChecked />
                            <span className="text-xs">Always show details</span>
                        </label>
                        <button onClick={handleCopy} className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
                            <CopyIcon className="size-4" />
                            <span className="text-xs">{isCopied ? 'Copied!' : 'Copy code'}</span>
                        </button>
                    </div>
                </div>

                <div className="flex-1 p-2 overflow-auto bg-background">
                    <pre className="text-sm">
                        <code className={`language-${lang} hljs`} dangerouslySetInnerHTML={{ __html: highlightedCode }} />
                    </pre>
                </div>
            </div>
        </div>
    );
};

export default CodeAnalysisModal;
