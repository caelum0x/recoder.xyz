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
      <span className={cn('inline-flex items-center gap-2 flex-shrink-0', className)}>
        <img
          src="/logo.png"
          alt="Recoder"
          style={{ height: `${size}px`, width: `${size}px` }}
          className="object-contain"
          suppressHydrationWarning
        />
        <span style={{ fontSize: `${size * 0.85}px`, fontWeight: 700, letterSpacing: '-0.02em' }}>
          recoder
        </span>
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
