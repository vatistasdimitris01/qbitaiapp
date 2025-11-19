import React, { useState, useEffect } from 'react';

interface AITextLoadingProps {
    texts?: string[];
}

const AITextLoading: React.FC<AITextLoadingProps> = ({
    texts = [
        "Thinking...",
        "Processing...",
        "Analyzing...",
        "Computing...",
        "Almost there...",
    ]
}) => {
    const [currentTextIndex, setCurrentTextIndex] = useState(0);
    const [animationKey, setAnimationKey] = useState(0);

    useEffect(() => {
        if (texts.length === 0) return;
        
        const interval = 1500;
        const timer = setInterval(() => {
            setCurrentTextIndex((prevIndex) => (prevIndex + 1) % texts.length);
            setAnimationKey(prev => prev + 1);
        }, interval);

        return () => clearInterval(timer);
    }, [texts]);

    if (texts.length === 0) return null;

    return (
        <div className="flex items-center justify-start py-2">
            <div className="relative w-full">
                <div key={animationKey} className="ai-text-loading text-base font-medium animate-fade-in-up">
                    {texts[currentTextIndex]}
                </div>
            </div>
        </div>
    );
};

export default AITextLoading;
