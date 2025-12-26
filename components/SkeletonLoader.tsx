import React from 'react';

/**
 * Fix: Added and exported SkeletonLoader component to resolve "not a module" error in ImageGallery.
 * This provides a visual placeholder for content that is still loading.
 */
const SkeletonLoader: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`bg-token-surface-secondary animate-skeleton-pulse rounded-md ${className}`} />
);

export default SkeletonLoader;