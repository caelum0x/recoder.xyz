/**
 * Unified Theme System for recoder.xyz
 * Consistent colors, spacing, typography across all pages
 */

export const theme = {
  // Brand Colors
  colors: {
    // Primary gradient (orange to purple)
    primary: {
      orange: '#f97316', // orange-500
      purple: '#9333ea', // purple-600
      gradient: 'linear-gradient(to right, #f97316, #9333ea)',
    },

    // Neutrals
    black: '#000000',
    gray: {
      50: '#f9fafb',
      100: '#f3f4f6',
      200: '#e5e7eb',
      300: '#d1d5db',
      400: '#9ca3af',
      500: '#6b7280',
      600: '#4b5563',
      700: '#374151',
      800: '#1f2937',
      900: '#111827',
      950: '#030712',
    },
    white: '#ffffff',

    // Semantic Colors
    success: '#10b981', // green-500
    warning: '#f59e0b', // amber-500
    error: '#ef4444', // red-500
    info: '#3b82f6', // blue-500
  },

  // Typography
  typography: {
    fontFamily: {
      sans: 'Inter, system-ui, -apple-system, sans-serif',
      mono: 'JetBrains Mono, Consolas, monospace',
    },
    fontSize: {
      xs: '0.75rem',    // 12px
      sm: '0.875rem',   // 14px
      base: '1rem',     // 16px
      lg: '1.125rem',   // 18px
      xl: '1.25rem',    // 20px
      '2xl': '1.5rem',  // 24px
      '3xl': '1.875rem', // 30px
      '4xl': '2.25rem',  // 36px
      '5xl': '3rem',     // 48px
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
  },

  // Spacing
  spacing: {
    0: '0',
    1: '0.25rem',   // 4px
    2: '0.5rem',    // 8px
    3: '0.75rem',   // 12px
    4: '1rem',      // 16px
    5: '1.25rem',   // 20px
    6: '1.5rem',    // 24px
    8: '2rem',      // 32px
    10: '2.5rem',   // 40px
    12: '3rem',     // 48px
    16: '4rem',     // 64px
    20: '5rem',     // 80px
  },

  // Border Radius
  borderRadius: {
    none: '0',
    sm: '0.125rem',   // 2px
    DEFAULT: '0.375rem', // 6px
    md: '0.5rem',     // 8px
    lg: '0.75rem',    // 12px
    xl: '1rem',       // 16px
    '2xl': '1.5rem',  // 24px
    full: '9999px',
  },

  // Shadows
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
    glow: '0 0 20px rgba(249, 115, 22, 0.5)', // Orange glow
  },

  // Animations
  animations: {
    transition: {
      fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
      base: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
      slow: '500ms cubic-bezier(0.4, 0, 0.2, 1)',
    },
  },

  // Breakpoints
  breakpoints: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },
};

// CSS Classes (for consistent usage)
export const themeClasses = {
  // Gradients
  gradient: {
    primary: 'bg-gradient-to-r from-orange-500 to-purple-600',
    primaryHover: 'hover:from-orange-600 hover:to-purple-700',
    background: 'bg-gradient-to-br from-gray-900 via-black to-gray-900',
  },

  // Buttons
  button: {
    primary: 'bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all',
    secondary: 'bg-gray-800 hover:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-all',
    ghost: 'bg-transparent hover:bg-gray-800 text-gray-300 hover:text-white font-semibold py-3 px-6 rounded-lg transition-all',
    danger: 'bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg transition-all',
  },

  // Cards
  card: {
    base: 'bg-gray-800 rounded-xl p-6 border border-gray-700',
    hover: 'bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-orange-500 transition-all cursor-pointer',
    gradient: 'bg-gradient-to-r from-orange-500/20 to-purple-600/20 rounded-xl p-6 border border-orange-500/50',
  },

  // Inputs
  input: {
    base: 'bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500',
    error: 'bg-gray-900 border border-red-500 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-red-500',
  },

  // Text
  text: {
    heading: 'text-white font-bold',
    body: 'text-gray-300',
    muted: 'text-gray-500',
    link: 'text-orange-500 hover:text-orange-400 transition-colors',
  },
};

export type Theme = typeof theme;
export type ThemeClasses = typeof themeClasses;
