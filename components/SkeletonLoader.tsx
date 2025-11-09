import React from 'react';

interface SkeletonLoaderProps {
  className?: string;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({ className }) => {
  return (
    <div className={`bg-token-surface-secondary animate-skeleton-pulse rounded-md ${className}`} />
  );
};

export default SkeletonLoader;
