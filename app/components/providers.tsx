'use client';

import { ReactNode } from 'react';
import { ThemeProvider } from './ThemeProvider';
import { CommandPalette } from './CommandPalette';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider>
      {children}
      <CommandPalette />
    </ThemeProvider>
  );
}
