'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { CommandPalette } from './CommandPalette';
import { SessionProvider } from '@/lib/session-provider';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ThemeProvider>
        {children}
        <CommandPalette />
      </ThemeProvider>
    </SessionProvider>
  );
}
