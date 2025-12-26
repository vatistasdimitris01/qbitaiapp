
import React from 'react';
import { FileTextIcon, CodeXmlIcon, ImageIcon } from './icons';

const DragDropOverlay: React.FC<{ t: (key: string) => string; }> = ({ t }) => (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[200] flex flex-col items-center justify-center pointer-events-none animate-fade-in-up">
        <div className="relative mb-6">
            <FileTextIcon className="absolute top-1/2 left-1/2 -translate-x-[90%] -translate-y-[60%] size-16 text-blue-300/50 dark:text-blue-500/30 transform -rotate-12" />
            <CodeXmlIcon className="absolute top-1/2 left-1/2 -translate-x-[10%] -translate-y-[40%] size-16 text-blue-300/50 dark:text-blue-500/30 transform rotate-12" />
            <ImageIcon className="relative size-20 text-blue-500" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">{t('dragDrop.title')}</h2>
        <p className="text-muted-foreground mt-1">{t('dragDrop.subtitle')}</p>
    </div>
);

export default DragDropOverlay;
