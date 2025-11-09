
import React from 'react';

interface ImageInfo {
  url: string;
  alt: string;
  source?: string;
}

interface ImageGalleryProps {
  images: ImageInfo[];
  onImageClick: (index: number) => void;
}

const ImageGallery: React.FC<ImageGalleryProps> = ({ images, onImageClick }) => {
  if (!images || images.length === 0) return null;

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    e.currentTarget.style.display = 'none';
    const parent = e.currentTarget.parentElement;
    if (parent) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'absolute inset-0 bg-token-surface-secondary flex items-center justify-center text-muted-foreground rounded-lg';
      errorDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
      parent.appendChild(errorDiv);
    }
  };

  const gridCols = images.length === 1 ? 'grid-cols-1' : images.length === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className={`not-prose my-4 grid ${gridCols} gap-2`}>
      {images.slice(0, 3).map((image, index) => (
        <div
          key={index}
          className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer group ${images.length === 1 ? 'aspect-[16/9]' : ''}`}
          onClick={() => onImageClick(index)}
        >
          <img
            src={image.url}
            alt={image.alt}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
            onError={handleImageError}
          />
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
          {index === 2 && images.length > 3 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-2xl font-bold">
              +{images.length - 3}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ImageGallery;
