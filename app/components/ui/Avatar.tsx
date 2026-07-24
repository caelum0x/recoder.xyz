'use client';

import { useState } from 'react';

export function Avatar({
  src,
  alt,
  size = 'md',
  fallback
}: {
  src?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  fallback?: string;
}) {
  const [imageError, setImageError] = useState(false);
  const sizes = { sm: 'w-8 h-8', md: 'w-12 h-12', lg: 'w-16 h-16' };
  const textSizes = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };

  return (
    <div className={`${sizes[size]} rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center overflow-hidden`}>
      {src && !imageError ? (
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span className={`text-white font-semibold ${textSizes[size]}`}>
          {fallback || alt?.charAt(0).toUpperCase() || '?'}
        </span>
      )}
    </div>
  );
}
