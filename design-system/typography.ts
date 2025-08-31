/**
 * Recoder.xyz Design System - Typography
 * Professional typography system for all platforms
 */

// Font families
export const fontFamilies = {
  sans: [
    'Inter',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'Oxygen',
    'Ubuntu',
    'Cantarell',
    'Fira Sans',
    'Droid Sans',
    'Helvetica Neue',
    'sans-serif',
  ],
  mono: [
    'JetBrains Mono',
    'SF Mono',
    'Monaco',
    'Inconsolata',
    'Roboto Mono',
    'Source Code Pro',
    'Menlo',
    'Consolas',
    'DejaVu Sans Mono',
    'monospace',
  ],
  heading: [
    'Cal Sans',
    'Inter',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'sans-serif',
  ],
};

// Font weights
export const fontWeights = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
};

// Font sizes (using rem for scalability)
export const fontSizes = {
  xs: '0.75rem',    // 12px
  sm: '0.875rem',   // 14px
  base: '1rem',     // 16px
  lg: '1.125rem',   // 18px
  xl: '1.25rem',    // 20px
  '2xl': '1.5rem',  // 24px
  '3xl': '1.875rem', // 30px
  '4xl': '2.25rem', // 36px
  '5xl': '3rem',    // 48px
  '6xl': '3.75rem', // 60px
  '7xl': '4.5rem',  // 72px
  '8xl': '6rem',    // 96px
  '9xl': '8rem',    // 128px
};

// Line heights
export const lineHeights = {
  none: 1,
  tight: 1.25,
  snug: 1.375,
  normal: 1.5,
  relaxed: 1.625,
  loose: 2,
};

// Letter spacing
export const letterSpacing = {
  tighter: '-0.05em',
  tight: '-0.025em',
  normal: '0em',
  wide: '0.025em',
  wider: '0.05em',
  widest: '0.1em',
};

// Typography scales for different use cases
export const typographyScale = {
  // Display headings (marketing pages)
  display: {
    '2xl': {
      fontSize: fontSizes['7xl'],
      lineHeight: lineHeights.none,
      fontWeight: fontWeights.bold,
      letterSpacing: letterSpacing.tighter,
    },
    xl: {
      fontSize: fontSizes['6xl'],
      lineHeight: lineHeights.none,
      fontWeight: fontWeights.bold,
      letterSpacing: letterSpacing.tighter,
    },
    lg: {
      fontSize: fontSizes['5xl'],
      lineHeight: lineHeights.none,
      fontWeight: fontWeights.bold,
      letterSpacing: letterSpacing.tight,
    },
    md: {
      fontSize: fontSizes['4xl'],
      lineHeight: lineHeights.tight,
      fontWeight: fontWeights.bold,
      letterSpacing: letterSpacing.tight,
    },
    sm: {
      fontSize: fontSizes['3xl'],
      lineHeight: lineHeights.tight,
      fontWeight: fontWeights.semibold,
      letterSpacing: letterSpacing.normal,
    },
  },

  // Standard headings
  heading: {
    h1: {
      fontSize: fontSizes['4xl'],
      lineHeight: lineHeights.tight,
      fontWeight: fontWeights.bold,
      letterSpacing: letterSpacing.tight,
    },
    h2: {
      fontSize: fontSizes['3xl'],
      lineHeight: lineHeights.tight,
      fontWeight: fontWeights.bold,
      letterSpacing: letterSpacing.tight,
    },
    h3: {
      fontSize: fontSizes['2xl'],
      lineHeight: lineHeights.snug,
      fontWeight: fontWeights.semibold,
      letterSpacing: letterSpacing.normal,
    },
    h4: {
      fontSize: fontSizes.xl,
      lineHeight: lineHeights.snug,
      fontWeight: fontWeights.semibold,
      letterSpacing: letterSpacing.normal,
    },
    h5: {
      fontSize: fontSizes.lg,
      lineHeight: lineHeights.normal,
      fontWeight: fontWeights.medium,
      letterSpacing: letterSpacing.normal,
    },
    h6: {
      fontSize: fontSizes.base,
      lineHeight: lineHeights.normal,
      fontWeight: fontWeights.medium,
      letterSpacing: letterSpacing.normal,
    },
  },

  // Body text
  body: {
    xl: {
      fontSize: fontSizes.xl,
      lineHeight: lineHeights.relaxed,
      fontWeight: fontWeights.normal,
      letterSpacing: letterSpacing.normal,
    },
    lg: {
      fontSize: fontSizes.lg,
      lineHeight: lineHeights.relaxed,
      fontWeight: fontWeights.normal,
      letterSpacing: letterSpacing.normal,
    },
    md: {
      fontSize: fontSizes.base,
      lineHeight: lineHeights.normal,
      fontWeight: fontWeights.normal,
      letterSpacing: letterSpacing.normal,
    },
    sm: {
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.normal,
      fontWeight: fontWeights.normal,
      letterSpacing: letterSpacing.normal,
    },
    xs: {
      fontSize: fontSizes.xs,
      lineHeight: lineHeights.normal,
      fontWeight: fontWeights.normal,
      letterSpacing: letterSpacing.wide,
    },
  },

  // UI elements
  ui: {
    buttonLg: {
      fontSize: fontSizes.base,
      lineHeight: lineHeights.tight,
      fontWeight: fontWeights.medium,
      letterSpacing: letterSpacing.normal,
    },
    buttonMd: {
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.tight,
      fontWeight: fontWeights.medium,
      letterSpacing: letterSpacing.normal,
    },
    buttonSm: {
      fontSize: fontSizes.xs,
      lineHeight: lineHeights.tight,
      fontWeight: fontWeights.medium,
      letterSpacing: letterSpacing.wide,
    },
    label: {
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.normal,
      fontWeight: fontWeights.medium,
      letterSpacing: letterSpacing.normal,
    },
    caption: {
      fontSize: fontSizes.xs,
      lineHeight: lineHeights.normal,
      fontWeight: fontWeights.normal,
      letterSpacing: letterSpacing.wide,
    },
    overline: {
      fontSize: fontSizes.xs,
      lineHeight: lineHeights.normal,
      fontWeight: fontWeights.bold,
      letterSpacing: letterSpacing.widest,
      textTransform: 'uppercase' as const,
    },
  },

  // Code and monospace
  code: {
    xl: {
      fontSize: fontSizes.lg,
      lineHeight: lineHeights.relaxed,
      fontWeight: fontWeights.normal,
      fontFamily: fontFamilies.mono.join(', '),
    },
    lg: {
      fontSize: fontSizes.base,
      lineHeight: lineHeights.normal,
      fontWeight: fontWeights.normal,
      fontFamily: fontFamilies.mono.join(', '),
    },
    md: {
      fontSize: fontSizes.sm,
      lineHeight: lineHeights.normal,
      fontWeight: fontWeights.normal,
      fontFamily: fontFamilies.mono.join(', '),
    },
    sm: {
      fontSize: fontSizes.xs,
      lineHeight: lineHeights.normal,
      fontWeight: fontWeights.normal,
      fontFamily: fontFamilies.mono.join(', '),
    },
  },
};

// CSS Custom Properties for typography
export const typographyCSSVars = {
  '--font-sans': fontFamilies.sans.join(', '),
  '--font-mono': fontFamilies.mono.join(', '),
  '--font-heading': fontFamilies.heading.join(', '),
  
  // Font sizes
  '--text-xs': fontSizes.xs,
  '--text-sm': fontSizes.sm,
  '--text-base': fontSizes.base,
  '--text-lg': fontSizes.lg,
  '--text-xl': fontSizes.xl,
  '--text-2xl': fontSizes['2xl'],
  '--text-3xl': fontSizes['3xl'],
  '--text-4xl': fontSizes['4xl'],
  '--text-5xl': fontSizes['5xl'],
  '--text-6xl': fontSizes['6xl'],
  '--text-7xl': fontSizes['7xl'],
  '--text-8xl': fontSizes['8xl'],
  '--text-9xl': fontSizes['9xl'],
  
  // Line heights
  '--leading-none': lineHeights.none,
  '--leading-tight': lineHeights.tight,
  '--leading-snug': lineHeights.snug,
  '--leading-normal': lineHeights.normal,
  '--leading-relaxed': lineHeights.relaxed,
  '--leading-loose': lineHeights.loose,
  
  // Font weights
  '--font-thin': fontWeights.thin,
  '--font-extralight': fontWeights.extralight,
  '--font-light': fontWeights.light,
  '--font-normal': fontWeights.normal,
  '--font-medium': fontWeights.medium,
  '--font-semibold': fontWeights.semibold,
  '--font-bold': fontWeights.bold,
  '--font-extrabold': fontWeights.extrabold,
  '--font-black': fontWeights.black,
};
