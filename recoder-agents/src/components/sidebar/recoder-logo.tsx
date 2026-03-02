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
      <img
        src="/Logomark.svg"
        alt="Recoder"
        className={cn('flex-shrink-0', className)}
        style={{ height: `${size}px`, width: 'auto' }}
        suppressHydrationWarning
      />
    );
  }

  return (
    <img
      src="/recoder-symbol.svg"
      alt="Recoder"
      className={cn('object-contain flex-shrink-0', className)}
      style={{ width: `${size}px`, height: `${size}px` }}
      suppressHydrationWarning
    />
  );
}
