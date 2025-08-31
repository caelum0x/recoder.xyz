/**
 * Recoder.xyz Design System - Color Palette
 * Professional color system for all platforms
 */

export const colors = {
  // Primary Brand Colors
  primary: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9', // Main brand blue
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
    950: '#082f49',
  },

  // Secondary Accent Colors
  secondary: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },

  // Success Colors
  success: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e',
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
    950: '#052e16',
  },

  // Warning Colors
  warning: {
    50: '#fffbeb',
    100: '#fef3c7',
    200: '#fde68a',
    300: '#fcd34d',
    400: '#fbbf24',
    500: '#f59e0b',
    600: '#d97706',
    700: '#b45309',
    800: '#92400e',
    900: '#78350f',
    950: '#451a03',
  },

  // Error Colors
  error: {
    50: '#fef2f2',
    100: '#fee2e2',
    200: '#fecaca',
    300: '#fca5a5',
    400: '#f87171',
    500: '#ef4444',
    600: '#dc2626',
    700: '#b91c1c',
    800: '#991b1b',
    900: '#7f1d1d',
    950: '#450a0a',
  },

  // Neutral Grays
  neutral: {
    0: '#ffffff',
    50: '#fafafa',
    100: '#f5f5f5',
    200: '#e5e5e5',
    300: '#d4d4d4',
    400: '#a3a3a3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0a0a0a',
  },

  // Code Editor Colors
  code: {
    background: '#0d1117',
    surface: '#161b22',
    border: '#30363d',
    comment: '#6e7681',
    keyword: '#ff7b72',
    string: '#a5d6ff',
    number: '#79c0ff',
    function: '#d2a8ff',
    variable: '#ffa657',
    type: '#7ee787',
  },

  // Chat UI Colors
  chat: {
    userBubble: '#0ea5e9',
    assistantBubble: '#f1f5f9',
    timestamp: '#64748b',
    online: '#22c55e',
    away: '#f59e0b',
    offline: '#94a3b8',
  },

  // Special Effect Colors
  gradient: {
    primary: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
    success: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
    warning: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    purple: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
    sunset: 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ef4444 100%)',
    ocean: 'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 50%, #3b82f6 100%)',
  },

  // Glass Morphism
  glass: {
    light: 'rgba(255, 255, 255, 0.1)',
    medium: 'rgba(255, 255, 255, 0.2)',
    dark: 'rgba(0, 0, 0, 0.1)',
    backdrop: 'rgba(255, 255, 255, 0.05)',
  },
};

// Theme-specific color assignments
export const lightTheme = {
  background: colors.neutral[0],
  surface: colors.neutral[50],
  surfaceHover: colors.neutral[100],
  border: colors.neutral[200],
  text: {
    primary: colors.neutral[900],
    secondary: colors.neutral[600],
    tertiary: colors.neutral[500],
    inverse: colors.neutral[0],
  },
  button: {
    primary: colors.primary[500],
    primaryHover: colors.primary[600],
    secondary: colors.neutral[100],
    secondaryHover: colors.neutral[200],
  },
};

export const darkTheme = {
  background: colors.neutral[950],
  surface: colors.neutral[900],
  surfaceHover: colors.neutral[800],
  border: colors.neutral[800],
  text: {
    primary: colors.neutral[50],
    secondary: colors.neutral[400],
    tertiary: colors.neutral[500],
    inverse: colors.neutral[900],
  },
  button: {
    primary: colors.primary[500],
    primaryHover: colors.primary[400],
    secondary: colors.neutral[800],
    secondaryHover: colors.neutral[700],
  },
};

export type ColorTheme = typeof lightTheme;
