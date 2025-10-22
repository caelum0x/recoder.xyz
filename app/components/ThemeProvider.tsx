/**
 * ThemeProvider Component
 * Provides theme context to the entire application
 */

'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useTheme, Theme, ResolvedTheme } from '@/hooks/useTheme';

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  mounted: boolean;
  themes: readonly ['light', 'dark', 'system'];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeState = useTheme();

  return (
    <ThemeContext.Provider value={themeState}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useThemeContext must be used within a ThemeProvider');
  }
  return context;
}
