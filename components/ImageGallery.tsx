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
      className={`relative rounded-lg overflow-hidden cursor-pointer group bg-token-surface-secondary border border-default ${className}`}
      onClick={onClick}
    >
      {status === 'loading' && <SkeletonLoader className="absolute inset-0" />}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground p-2 text-center text-xs">
          <svg xmlns="http://www.w3.org/2000/svg" className="size-6 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
      )}
      <img
        src={image.url}
        alt={image.alt}
        className={`w-full h-full object-cover transition-all duration-500 group-hover:scale-105 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        loading="lazy"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
      {status === 'loaded' && (
        <>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
          {overlayText && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xl font-medium backdrop-blur-[2px]">
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
  
  const len = images.length;

  // Layout for a single image
  if (len === 1) {
    return (
      <div className="not-prose my-2">
        <GalleryImage image={images[0]} className="aspect-video max-w-sm" onClick={() => onImageClick(0)} />
      </div>
    );
  }

  // Layout for 2 images
  if (len === 2) {
    return (
      <div className="not-prose my-2 grid grid-cols-2 gap-1.5 max-w-lg">
        <GalleryImage image={images[0]} className="aspect-square" onClick={() => onImageClick(0)} />
        <GalleryImage image={images[1]} className="aspect-square" onClick={() => onImageClick(1)} />
      </div>
    );
  }

  // Row layout for 3 images
  if (len === 3) {
    return (
      <div className="not-prose my-2 grid grid-cols-3 gap-1.5 max-w-xl">
        <GalleryImage image={images[0]} className="aspect-square" onClick={() => onImageClick(0)} />
        <GalleryImage image={images[1]} className="aspect-square" onClick={() => onImageClick(1)} />
        <GalleryImage image={images[2]} className="aspect-square" onClick={() => onImageClick(2)} />
      </div>
    );
  }

  // Specific layout for 5 images (2 on top, 3 on bottom)
  if (len === 5) {
    return (
      <div className="not-prose my-2 grid grid-cols-6 gap-1.5 max-w-xl">
        <GalleryImage image={images[0]} className="col-span-3 aspect-video" onClick={() => onImageClick(0)} />
        <GalleryImage image={images[1]} className="col-span-3 aspect-video" onClick={() => onImageClick(1)} />
        <GalleryImage image={images[2]} className="col-span-2 aspect-square" onClick={() => onImageClick(2)} />
        <GalleryImage image={images[3]} className="col-span-2 aspect-square" onClick={() => onImageClick(3)} />
        <GalleryImage image={images[4]} className="col-span-2 aspect-square" onClick={() => onImageClick(4)} />
      </div>
    );
  }
  
  // Default gallery for 4+ images (responsive 2x2 grid with overlay)
  if (len >= 4) {
    const visibleImages = images.slice(0, 4);
    const hiddenCount = images.length - 4;
    return (
      <div className="not-prose my-2 grid grid-cols-2 gap-1.5 max-w-md">
        {visibleImages.map((image, index) => {
          const overlay = index === 3 && hiddenCount > 0 ? `+${hiddenCount}` : null;
          return <GalleryImage key={index} image={image} overlayText={overlay} onClick={() => onImageClick(index)} className="aspect-[4/3]" />;
        })}
      </div>
    );
  }

  return null;
};

export default ImageGallery;