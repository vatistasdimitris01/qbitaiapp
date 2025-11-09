import React, { useState } from 'react';
import SkeletonLoader from './SkeletonLoader';
import { Maximize2Icon } from './icons';

interface InlineImageProps {
  src: string;
  alt: string;
  onExpand: () => void;
}

const InlineImage: React.FC<InlineImageProps> = ({ src, alt, onExpand }) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  return (
    <div className="relative inline-block align-middle my-1 mx-2 w-48 h-32 rounded-lg overflow-hidden group border border-default bg-token-surface-secondary">
      {status === 'loading' && <SkeletonLoader className="absolute inset-0" />}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground p-2 text-center text-xs">
          Image failed to load
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        loading="lazy"
      />
      {status === 'loaded' && (
        <div 
          className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          onClick={onExpand}
        >
          <Maximize2Icon className="size-8 text-white" />
        </div>
      )}
    </div>
  );
};

export default InlineImage;
