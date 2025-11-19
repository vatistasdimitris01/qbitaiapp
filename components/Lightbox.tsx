import React, { useState, useEffect, useCallback } from 'react';
import { XIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

interface ImageInfo {
  url: string;
  alt: string;
  source?: string;
}

interface LightboxProps {
  images: ImageInfo[];
  startIndex: number;
  onClose: () => void;
}

const Lightbox: React.FC<LightboxProps> = ({ images, startIndex, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(startIndex);
  const [imageLoaded, setImageLoaded] = useState(false);

  const goToPrevious = useCallback(() => {
    setImageLoaded(false);
    setCurrentIndex((prevIndex) => (prevIndex === 0 ? images.length - 1 : prevIndex - 1));
  }, [images.length]);

  const goToNext = useCallback(() => {
    setImageLoaded(false);
    setCurrentIndex((prevIndex) => (prevIndex === images.length - 1 ? 0 : prevIndex + 1));
  }, [images.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goToPrevious();
      if (e.key === 'ArrowRight') goToNext();
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToPrevious, goToNext, onClose]);
  
  // Preload next and previous images
  useEffect(() => {
    if (images.length > 1) {
        const nextIndex = (currentIndex + 1) % images.length;
        const prevIndex = (currentIndex - 1 + images.length) % images.length;
        const nextImage = new Image();
        const prevImage = new Image();
        nextImage.src = images[nextIndex].url;
        prevImage.src = images[prevIndex].url;
    }
  }, [currentIndex, images]);


  const currentImage = images[currentIndex];
  if (!currentImage) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 z-[200] flex flex-col items-center justify-center p-4 backdrop-blur-sm animate-fade-in-up"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <header className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 text-white z-10">
        <div className="font-mono text-sm bg-black/20 px-2 py-1 rounded-md">
          {currentIndex + 1} / {images.length}
        </div>
        <button onClick={onClose} aria-label="Close" className="p-2 rounded-full bg-black/20 hover:bg-white/20">
          <XIcon className="size-6" />
        </button>
      </header>

      <main className="relative flex items-center justify-center w-full h-full" onClick={(e) => e.stopPropagation()}>
        {images.length > 1 && (
          <button onClick={goToPrevious} aria-label="Previous image" className="absolute left-4 p-2 rounded-full bg-black/20 hover:bg-white/20 text-white z-10">
            <ChevronLeftIcon className="size-8" />
          </button>
        )}
        <div className="flex flex-col items-center justify-center max-w-full max-h-full">
          {!imageLoaded && <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white/50"></div>}
          <img
            key={currentIndex}
            src={currentImage.url}
            alt={currentImage.alt}
            className={`max-w-full max-h-[80vh] object-contain rounded-lg transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            onLoad={() => setImageLoaded(true)}
          />
          <footer className={`mt-4 text-center text-white/80 text-sm transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}>
            <p>{currentImage.alt}</p>
            {currentImage.source && <p className="text-xs mt-1">Source: {currentImage.source}</p>}
          </footer>
        </div>
        {images.length > 1 && (
          <button onClick={goToNext} aria-label="Next image" className="absolute right-4 p-2 rounded-full bg-black/20 hover:bg-white/20 text-white z-10">
            <ChevronRightIcon className="size-8" />
          </button>
        )}
      </main>
    </div>
  );
};

export default Lightbox;
