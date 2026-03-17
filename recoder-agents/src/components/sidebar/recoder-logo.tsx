'use client';

import { cn } from '@/lib/utils';

interface RecoderLogoProps {
  size?: number;
  variant?: 'symbol' | 'logomark';
  className?: string;
}

export function RecoderLogo({ size = 24, variant = 'symbol', className }: RecoderLogoProps) {
  if (variant === 'logomark') {
    return (
      <span className={cn('inline-flex items-center flex-shrink-0', className)}>
        <img
          src="/logo.png"
          alt="Recoder"
          style={{ height: `${size}px`, width: `${size}px` }}
          className="object-contain"
          suppressHydrationWarning
        />
      </span>
    );
  }

  return (
    <img
      src="/logo.png"
      alt="Recoder"
      className={cn('object-contain flex-shrink-0', className)}
      style={{ width: `${size}px`, height: `${size}px` }}
      suppressHydrationWarning
    />
  );
}
