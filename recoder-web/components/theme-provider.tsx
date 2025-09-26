/**
 * Dark Mode Theme Provider
 * PRODUCTION FEATURE: Enterprise-grade dark mode support across all platforms
 * Competitive advantage over Cursor/Copilot with comprehensive theming
 */

'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      {children}
    </NextThemesProvider>
  )
}

// Theme constants for consistent theming across the application
export const themes = {
  light: {
    name: 'light',
    displayName: 'Light',
    colors: {
      background: '#ffffff',
      foreground: '#0a0a0a',
      card: '#ffffff',
      cardForeground: '#0a0a0a',
      popover: '#ffffff',
      popoverForeground: '#0a0a0a',
      primary: '#326DF5',
      primaryForeground: '#ffffff',
      secondary: '#f4f4f5',
      secondaryForeground: '#0a0a0a',
      muted: '#f4f4f5',
      mutedForeground: '#71717a',
      accent: '#f4f4f5',
      accentForeground: '#0a0a0a',
      destructive: '#ef4444',
      destructiveForeground: '#ffffff',
      border: '#e4e4e7',
      input: '#e4e4e7',
      ring: '#326DF5',
    }
  },
  dark: {
    name: 'dark',
    displayName: 'Dark',
    colors: {
      background: '#0a0a0a',
      foreground: '#fafafa',
      card: '#0a0a0a',
      cardForeground: '#fafafa',
      popover: '#0a0a0a',
      popoverForeground: '#fafafa',
      primary: '#4785FF',
      primaryForeground: '#0a0a0a',
      secondary: '#27272a',
      secondaryForeground: '#fafafa',
      muted: '#27272a',
      mutedForeground: '#a1a1aa',
      accent: '#27272a',
      accentForeground: '#fafafa',
      destructive: '#ef4444',
      destructiveForeground: '#fafafa',
      border: '#27272a',
      input: '#27272a',
      ring: '#4785FF',
    }
  },
  system: {
    name: 'system',
    displayName: 'System',
    description: 'Follows your system preference'
  }
} as const

export type Theme = keyof typeof themes

// Hook for accessing theme functionality
export function useTheme() {
  const [mounted, setMounted] = React.useState(false)
  const { theme, setTheme, resolvedTheme } = require('next-themes').useTheme()

  React.useEffect(() => {
    setMounted(true)
  }, [])

  return {
    theme: theme as Theme,
    setTheme: (theme: Theme) => setTheme(theme),
    resolvedTheme: resolvedTheme as 'light' | 'dark',
    themes: Object.keys(themes) as Theme[],
    themeConfig: themes,
    mounted
  }
}

// Theme colors hook for dynamic styling
export function useThemeColors() {
  const { resolvedTheme } = useTheme()
  
  if (resolvedTheme === 'dark') {
    return themes.dark.colors
  }
  
  return themes.light.colors
}

// CSS variables updater
export function updateCSSVariables(theme: 'light' | 'dark') {
  const root = document.documentElement
  const colors = themes[theme].colors
  
  Object.entries(colors).forEach(([key, value]) => {
    const cssVar = key.replace(/([A-Z])/g, '-$1').toLowerCase()
    root.style.setProperty(`--${cssVar}`, value)
  })
}