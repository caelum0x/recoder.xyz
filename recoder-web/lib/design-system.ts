/**
 * RECODER.XYZ DESIGN SYSTEM
 * Comprehensive design tokens and utilities for consistent UI
 */

// ========================================
// COLOR SYSTEM
// ========================================

export const colors = {
  // Primary Brand Colors
  primary: {
    50: 'hsl(221, 83%, 97%)',
    100: 'hsl(221, 83%, 92%)',
    200: 'hsl(221, 83%, 85%)',
    300: 'hsl(221, 83%, 75%)',
    400: 'hsl(221, 83%, 65%)',
    500: 'hsl(221, 83%, 53%)',
    600: 'hsl(221, 83%, 45%)',
    700: 'hsl(221, 83%, 38%)',
    800: 'hsl(221, 83%, 30%)',
    900: 'hsl(221, 83%, 22%)',
    950: 'hsl(221, 83%, 15%)',
  },

  // Secondary Brand Colors
  secondary: {
    50: 'hsl(267, 84%, 97%)',
    100: 'hsl(267, 84%, 92%)',
    200: 'hsl(267, 84%, 85%)',
    300: 'hsl(267, 84%, 75%)',
    400: 'hsl(267, 84%, 65%)',
    500: 'hsl(267, 84%, 54%)',
    600: 'hsl(267, 84%, 45%)',
    700: 'hsl(267, 84%, 38%)',
    800: 'hsl(267, 84%, 30%)',
    900: 'hsl(267, 84%, 22%)',
    950: 'hsl(267, 84%, 15%)',
  },

  // Accent Colors
  accent: {
    50: 'hsl(338, 84%, 97%)',
    100: 'hsl(338, 84%, 92%)',
    200: 'hsl(338, 84%, 85%)',
    300: 'hsl(338, 84%, 75%)',
    400: 'hsl(338, 84%, 68%)',
    500: 'hsl(338, 84%, 59%)',
    600: 'hsl(338, 84%, 50%)',
    700: 'hsl(338, 84%, 42%)',
    800: 'hsl(338, 84%, 34%)',
    900: 'hsl(338, 84%, 26%)',
    950: 'hsl(338, 84%, 18%)',
  },

  // Success Colors
  success: {
    50: 'hsl(142, 71%, 97%)',
    100: 'hsl(142, 71%, 92%)',
    200: 'hsl(142, 71%, 85%)',
    300: 'hsl(142, 71%, 75%)',
    400: 'hsl(142, 71%, 62%)',
    500: 'hsl(142, 71%, 45%)',
    600: 'hsl(142, 71%, 38%)',
    700: 'hsl(142, 71%, 30%)',
    800: 'hsl(142, 71%, 25%)',
    900: 'hsl(142, 71%, 20%)',
    950: 'hsl(142, 71%, 15%)',
  },

  // Warning Colors
  warning: {
    50: 'hsl(38, 92%, 97%)',
    100: 'hsl(38, 92%, 90%)',
    200: 'hsl(38, 92%, 80%)',
    300: 'hsl(38, 92%, 70%)',
    400: 'hsl(38, 92%, 60%)',
    500: 'hsl(38, 92%, 50%)',
    600: 'hsl(38, 92%, 42%)',
    700: 'hsl(38, 92%, 35%)',
    800: 'hsl(38, 92%, 28%)',
    900: 'hsl(38, 92%, 22%)',
    950: 'hsl(38, 92%, 15%)',
  },

  // Error Colors
  error: {
    50: 'hsl(0, 84%, 97%)',
    100: 'hsl(0, 84%, 92%)',
    200: 'hsl(0, 84%, 85%)',
    300: 'hsl(0, 84%, 75%)',
    400: 'hsl(0, 84%, 68%)',
    500: 'hsl(0, 84%, 60%)',
    600: 'hsl(0, 84%, 52%)',
    700: 'hsl(0, 84%, 44%)',
    800: 'hsl(0, 84%, 36%)',
    900: 'hsl(0, 84%, 28%)',
    950: 'hsl(0, 84%, 20%)',
  },

  // Neutral Colors
  neutral: {
    0: 'hsl(0, 0%, 100%)',
    50: 'hsl(210, 20%, 98%)',
    100: 'hsl(210, 20%, 95%)',
    200: 'hsl(210, 16%, 90%)',
    300: 'hsl(210, 14%, 83%)',
    400: 'hsl(210, 14%, 64%)',
    500: 'hsl(210, 11%, 47%)',
    600: 'hsl(210, 14%, 38%)',
    700: 'hsl(210, 18%, 29%)',
    800: 'hsl(210, 20%, 23%)',
    900: 'hsl(210, 22%, 15%)',
    950: 'hsl(210, 24%, 9%)',
    1000: 'hsl(210, 26%, 6%)',
  },
} as const;

// ========================================
// TYPOGRAPHY SYSTEM
// ========================================

export const typography = {
  fontFamilies: {
    sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
    serif: ['Crimson Text', 'Georgia', 'Times New Roman', 'serif'],
    mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', 'monospace'],
    display: ['Lexend', 'Inter', 'sans-serif'],
  },

  fontWeights: {
    thin: 100,
    extralight: 200,
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },

  fontSizes: {
    xs: 'clamp(0.75rem, 0.7rem + 0.2vw, 0.8rem)',     // 12-13px
    sm: 'clamp(0.875rem, 0.8rem + 0.3vw, 0.95rem)',   // 14-15px
    base: 'clamp(1rem, 0.95rem + 0.25vw, 1.125rem)',  // 16-18px
    lg: 'clamp(1.125rem, 1rem + 0.5vw, 1.25rem)',     // 18-20px
    xl: 'clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem)',     // 20-24px
    '2xl': 'clamp(1.5rem, 1.3rem + 0.8vw, 1.875rem)', // 24-30px
    '3xl': 'clamp(1.875rem, 1.6rem + 1vw, 2.25rem)',  // 30-36px
    '4xl': 'clamp(2.25rem, 1.9rem + 1.4vw, 3rem)',    // 36-48px
    '5xl': 'clamp(3rem, 2.5rem + 2vw, 3.75rem)',      // 48-60px
    '6xl': 'clamp(3.75rem, 3rem + 3vw, 4.5rem)',      // 60-72px
  },

  lineHeights: {
    none: 1,
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },

  letterSpacing: {
    tighter: '-0.05em',
    tight: '-0.025em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em',
  },
} as const;

// ========================================
// SPACING SYSTEM
// ========================================

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  2.5: '0.625rem',  // 10px
  3: '0.75rem',     // 12px
  3.5: '0.875rem',  // 14px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  7: '1.75rem',     // 28px
  8: '2rem',        // 32px
  9: '2.25rem',     // 36px
  10: '2.5rem',     // 40px
  11: '2.75rem',    // 44px
  12: '3rem',       // 48px
  14: '3.5rem',     // 56px
  16: '4rem',       // 64px
  20: '5rem',       // 80px
  24: '6rem',       // 96px
  28: '7rem',       // 112px
  32: '8rem',       // 128px
  36: '9rem',       // 144px
  40: '10rem',      // 160px
  44: '11rem',      // 176px
  48: '12rem',      // 192px
  52: '13rem',      // 208px
  56: '14rem',      // 224px
  60: '15rem',      // 240px
  64: '16rem',      // 256px
  72: '18rem',      // 288px
  80: '20rem',      // 320px
  96: '24rem',      // 384px
} as const;

// ========================================
// BORDER RADIUS SYSTEM
// ========================================

export const borderRadius = {
  none: '0',
  sm: '0.125rem',   // 2px
  base: '0.25rem',  // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  '3xl': '1.5rem',  // 24px
  full: '9999px',
} as const;

// ========================================
// SHADOW SYSTEM
// ========================================

export const shadows = {
  xs: '0 1px 2px 0 hsla(210, 22%, 15%, 0.1)',
  sm: '0 1px 3px 0 hsla(210, 22%, 15%, 0.1), 0 1px 2px -1px hsla(210, 22%, 15%, 0.1)',
  base: '0 4px 6px -1px hsla(210, 22%, 15%, 0.1), 0 2px 4px -2px hsla(210, 22%, 15%, 0.1)',
  md: '0 10px 15px -3px hsla(210, 22%, 15%, 0.1), 0 4px 6px -4px hsla(210, 22%, 15%, 0.1)',
  lg: '0 20px 25px -5px hsla(210, 22%, 15%, 0.15), 0 8px 10px -6px hsla(210, 22%, 15%, 0.1)',
  xl: '0 25px 50px -12px hsla(210, 22%, 15%, 0.25)',
  '2xl': '0 50px 100px -20px hsla(210, 22%, 15%, 0.25)',
  inner: 'inset 0 2px 4px 0 hsla(210, 22%, 15%, 0.1)',
  
  // Colored shadows
  primary: '0 10px 15px -3px hsla(221, 83%, 53%, 0.25), 0 4px 6px -4px hsla(221, 83%, 53%, 0.25)',
  success: '0 10px 15px -3px hsla(142, 71%, 45%, 0.25), 0 4px 6px -4px hsla(142, 71%, 45%, 0.25)',
  warning: '0 10px 15px -3px hsla(38, 92%, 50%, 0.25), 0 4px 6px -4px hsla(38, 92%, 50%, 0.25)',
  error: '0 10px 15px -3px hsla(0, 84%, 60%, 0.25), 0 4px 6px -4px hsla(0, 84%, 60%, 0.25)',
} as const;

// ========================================
// ANIMATION SYSTEM
// ========================================

export const animations = {
  duration: {
    instant: '0ms',
    fast: '100ms',
    normal: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  easing: {
    linear: 'linear',
    in: 'cubic-bezier(0.4, 0, 1, 1)',
    out: 'cubic-bezier(0, 0, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    back: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },

  presets: {
    fast: '100ms cubic-bezier(0, 0, 0.2, 1)',
    normal: '200ms cubic-bezier(0, 0, 0.2, 1)',
    slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
    bounce: '500ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
} as const;

// ========================================
// COMPONENT TOKENS
// ========================================

export const components = {
  button: {
    height: {
      sm: '2rem',     // 32px
      md: '2.5rem',   // 40px
      lg: '3rem',     // 48px
    },
    padding: {
      sm: '0.5rem 0.75rem',   // 8px 12px
      md: '0.625rem 1rem',    // 10px 16px
      lg: '0.75rem 1.5rem',   // 12px 24px
    },
  },

  input: {
    height: {
      sm: '2rem',     // 32px
      md: '2.5rem',   // 40px
      lg: '3rem',     // 48px
    },
    padding: '0.75rem',     // 12px
    borderWidth: '1px',
    focusRingWidth: '3px',
  },

  card: {
    padding: {
      sm: '1rem',     // 16px
      md: '1.5rem',   // 24px
      lg: '2rem',     // 32px
    },
    gap: '1rem',      // 16px
  },
} as const;

// ========================================
// BREAKPOINTS
// ========================================

export const breakpoints = {
  sm: '40em',    // 640px
  md: '48em',    // 768px
  lg: '64em',    // 1024px
  xl: '80em',    // 1280px
  '2xl': '96em', // 1536px
} as const;

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Create a CSS variable reference
 */
export function cssVar(name: string): string {
  return `var(--${name})`;
}

/**
 * Create responsive font size using clamp()
 */
export function responsiveFont(min: string, preferred: string, max: string): string {
  return `clamp(${min}, ${preferred}, ${max})`;
}

/**
 * Create a color with alpha transparency
 */
export function withAlpha(color: string, alpha: number): string {
  return `hsla(${color.replace('hsl(', '').replace(')', '')}, ${alpha})`;
}

/**
 * Get theme-aware color (automatically handles dark mode)
 */
export function themeColor(colorPath: string): string {
  return cssVar(`color-${colorPath.replace('.', '-')}`);
}

/**
 * Create a gradient background
 */
export function gradient(from: string, to: string, direction = '135deg'): string {
  return `linear-gradient(${direction}, ${from}, ${to})`;
}

/**
 * Create glass morphism effect
 */
export function glassMorphism(opacity = 0.9, blur = '12px'): Record<string, string> {
  return {
    background: `rgba(255, 255, 255, ${opacity})`,
    backdropFilter: `blur(${blur})`,
    border: '1px solid rgba(255, 255, 255, 0.2)',
  };
}

/**
 * Create elevation shadow
 */
export function elevation(level: keyof typeof shadows): string {
  return shadows[level];
}

/**
 * Create hover transform effect
 */
export function hoverLift(scale = 1.05, translateY = '-2px'): Record<string, string> {
  return {
    transform: `translateY(${translateY}) scale(${scale})`,
    transition: animations.presets.normal,
  };
}

// ========================================
// SEMANTIC COLOR HELPERS
// ========================================

export const semanticColors = {
  // Background colors
  bg: {
    primary: cssVar('color-bg-primary'),
    secondary: cssVar('color-bg-secondary'),
    tertiary: cssVar('color-bg-tertiary'),
    elevated: cssVar('color-bg-elevated'),
    overlay: cssVar('color-bg-overlay'),
  },

  // Text colors
  text: {
    primary: cssVar('color-text-primary'),
    secondary: cssVar('color-text-secondary'),
    tertiary: cssVar('color-text-tertiary'),
    accent: cssVar('color-text-accent'),
    inverse: cssVar('color-text-inverse'),
  },

  // Border colors
  border: {
    primary: cssVar('color-border-primary'),
    secondary: cssVar('color-border-secondary'),
    focus: cssVar('color-border-focus'),
    error: cssVar('color-border-error'),
    success: cssVar('color-border-success'),
    warning: cssVar('color-border-warning'),
  },

  // Surface colors
  surface: {
    glass: cssVar('color-surface-glass'),
    tintBlue: cssVar('color-surface-tint-blue'),
    tintPurple: cssVar('color-surface-tint-purple'),
    tintSuccess: cssVar('color-surface-tint-success'),
    tintWarning: cssVar('color-surface-tint-warning'),
    tintError: cssVar('color-surface-tint-error'),
  },
} as const;

// ========================================
// EXPORT ALL
// ========================================

export const designSystem = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  animations,
  components,
  breakpoints,
  semanticColors,
  utils: {
    cssVar,
    responsiveFont,
    withAlpha,
    themeColor,
    gradient,
    glassMorphism,
    elevation,
    hoverLift,
  },
} as const;

export default designSystem;