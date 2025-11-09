
import React, { useState } from 'react';
import SkeletonLoader from './SkeletonLoader';

interface ImageInfo {
  url: string;
  alt: string;
  source?: string;
}

interface ImageGalleryProps {
  images: ImageInfo[];
  onImageClick: (index: number) => void;
}

const GalleryImage: React.FC<{
  image: ImageInfo;
  className?: string;
  overlayText?: string | null;
  onClick: () => void;
}> = ({ image, className, overlayText, onClick }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  return (
    <div
      className={`relative rounded-lg overflow-hidden cursor-pointer group bg-token-surface-secondary ${className}`}
      onClick={onClick}
    >
      {status === 'loading' && <SkeletonLoader className="absolute inset-0" />}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground p-2 text-center text-xs">
          <svg xmlns="http://www.w3.org/2000/svg" className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
      )}
      <img
        src={image.url}
        alt={image.alt}
        className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
      {status === 'loaded' && (
        <>
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          {overlayText && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-2xl font-bold">
              {overlayText}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const ImageGallery: React.FC<ImageGalleryProps> = ({ images, onImageClick }) => {
  if (!images || images.length === 0) return null;

  // Profile layout for exactly 3 images
  if (images.length === 3) {
    return (
      <div className="not-prose my-4 grid grid-cols-2 grid-rows-2 gap-2 h-64 md:h-80">
        <GalleryImage image={images[0]} className="row-span-2" onClick={() => onImageClick(0)} />
        <GalleryImage image={images[1]} className="col-start-2" onClick={() => onImageClick(1)} />
        <GalleryImage image={images[2]} className="col-start-2" onClick={() => onImageClick(2)} />
      </div>
    );
  }
  
  // Gallery for 1 or 2 images
  if (images.length === 1 || images.length === 2) {
    const gridCols = images.length === 1 ? 'grid-cols-1' : 'grid-cols-2';
    const aspectRatio = images.length === 1 ? 'aspect-[16/9]' : 'aspect-square';
    return (
      <div className={`not-prose my-4 grid ${gridCols} gap-2`}>
        {images.map((image, index) => (
          <GalleryImage key={index} image={image} className={aspectRatio} onClick={() => onImageClick(index)} />
        ))}
      </div>
    );
  }
  
  // Gallery for 4+ images (2x2 grid)
  if (images.length >= 4) {
    const visibleImages = images.slice(0, 4);
    const hiddenCount = images.length - 4;
    return (
      <div className="not-prose my-4 grid grid-cols-2 grid-rows-2 gap-2 h-64 md:h-80">
        {visibleImages.map((image, index) => {
          const overlay = index === 3 && hiddenCount > 0 ? `+${hiddenCount}` : null;
          return <GalleryImage key={index} image={image} overlayText={overlay} onClick={() => onImageClick(index)} />;
        })}
      </div>
    );
  }

  return null; // Should not be reached
};

export default ImageGallery;