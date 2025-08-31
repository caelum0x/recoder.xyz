/**
 * Recoder.xyz Design System - Spacing & Layout
 * Consistent spacing system for all platforms
 */

// Base spacing unit (4px)
const baseUnit = 4;

// Spacing scale (in px, but exported as rem)
export const spacing = {
  0: '0',
  px: '1px',
  0.5: `${baseUnit * 0.125}px`, // 0.5px
  1: `${baseUnit * 0.25}px`,    // 1px
  1.5: `${baseUnit * 0.375}px`, // 1.5px
  2: `${baseUnit * 0.5}px`,     // 2px
  2.5: `${baseUnit * 0.625}px`, // 2.5px
  3: `${baseUnit * 0.75}px`,    // 3px
  3.5: `${baseUnit * 0.875}px`, // 3.5px
  4: `${baseUnit * 1}px`,       // 4px
  5: `${baseUnit * 1.25}px`,    // 5px
  6: `${baseUnit * 1.5}px`,     // 6px
  7: `${baseUnit * 1.75}px`,    // 7px
  8: `${baseUnit * 2}px`,       // 8px
  9: `${baseUnit * 2.25}px`,    // 9px
  10: `${baseUnit * 2.5}px`,    // 10px
  11: `${baseUnit * 2.75}px`,   // 11px
  12: `${baseUnit * 3}px`,      // 12px
  14: `${baseUnit * 3.5}px`,    // 14px
  16: `${baseUnit * 4}px`,      // 16px
  20: `${baseUnit * 5}px`,      // 20px
  24: `${baseUnit * 6}px`,      // 24px
  28: `${baseUnit * 7}px`,      // 28px
  32: `${baseUnit * 8}px`,      // 32px
  36: `${baseUnit * 9}px`,      // 36px
  40: `${baseUnit * 10}px`,     // 40px
  44: `${baseUnit * 11}px`,     // 44px
  48: `${baseUnit * 12}px`,     // 48px
  52: `${baseUnit * 13}px`,     // 52px
  56: `${baseUnit * 14}px`,     // 56px
  60: `${baseUnit * 15}px`,     // 60px
  64: `${baseUnit * 16}px`,     // 64px
  72: `${baseUnit * 18}px`,     // 72px
  80: `${baseUnit * 20}px`,     // 80px
  96: `${baseUnit * 24}px`,     // 96px
  112: `${baseUnit * 28}px`,    // 112px
  128: `${baseUnit * 32}px`,    // 128px
  144: `${baseUnit * 36}px`,    // 144px
  160: `${baseUnit * 40}px`,    // 160px
  176: `${baseUnit * 44}px`,    // 176px
  192: `${baseUnit * 48}px`,    // 192px
  208: `${baseUnit * 52}px`,    // 208px
  224: `${baseUnit * 56}px`,    // 224px
  240: `${baseUnit * 60}px`,    // 240px
  256: `${baseUnit * 64}px`,    // 256px
  288: `${baseUnit * 72}px`,    // 288px
  320: `${baseUnit * 80}px`,    // 320px
  384: `${baseUnit * 96}px`,    // 384px
};

// Component-specific spacing
export const componentSpacing = {
  // Button spacing
  button: {
    padding: {
      sm: { x: spacing[12], y: spacing[6] },
      md: { x: spacing[16], y: spacing[8] },
      lg: { x: spacing[20], y: spacing[12] },
      xl: { x: spacing[24], y: spacing[16] },
    },
    gap: {
      sm: spacing[6],
      md: spacing[8],
      lg: spacing[10],
    },
  },

  // Input spacing
  input: {
    padding: {
      sm: { x: spacing[8], y: spacing[6] },
      md: { x: spacing[12], y: spacing[8] },
      lg: { x: spacing[16], y: spacing[12] },
    },
  },

  // Card spacing
  card: {
    padding: {
      sm: spacing[16],
      md: spacing[20],
      lg: spacing[24],
      xl: spacing[32],
    },
    gap: spacing[16],
  },

  // Modal spacing
  modal: {
    padding: spacing[24],
    gap: spacing[20],
  },

  // Layout spacing
  layout: {
    section: {
      sm: spacing[32],
      md: spacing[48],
      lg: spacing[64],
      xl: spacing[96],
    },
    container: {
      sm: spacing[16],
      md: spacing[24],
      lg: spacing[32],
    },
  },

  // Navigation spacing
  nav: {
    padding: { x: spacing[20], y: spacing[12] },
    gap: spacing[24],
    itemPadding: { x: spacing[12], y: spacing[8] },
  },

  // Chat UI spacing
  chat: {
    messageGap: spacing[12],
    bubblePadding: { x: spacing[12], y: spacing[8] },
    sidebarPadding: spacing[16],
  },

  // Code editor spacing
  codeEditor: {
    padding: spacing[16],
    lineHeight: '1.5',
    tabSize: spacing[16],
  },
};

// Border radius system
export const borderRadius = {
  none: '0',
  sm: '2px',
  md: '4px',
  lg: '6px',
  xl: '8px',
  '2xl': '12px',
  '3xl': '16px',
  '4xl': '24px',
  full: '9999px',
};

// Shadow system
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  outline: '0 0 0 3px rgb(59 130 246 / 0.5)',
  
  // Colored shadows
  primary: '0 4px 14px 0 rgb(14 165 233 / 0.25)',
  success: '0 4px 14px 0 rgb(34 197 94 / 0.25)',
  warning: '0 4px 14px 0 rgb(245 158 11 / 0.25)',
  error: '0 4px 14px 0 rgb(239 68 68 / 0.25)',
  
  // Glass morphism shadows
  glass: '0 8px 32px 0 rgb(31 38 135 / 0.37)',
  glassInset: 'inset 0 1px 0 0 rgb(255 255 255 / 0.1)',
};

// Z-index scale
export const zIndex = {
  auto: 'auto',
  base: 0,
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modal: 1040,
  popover: 1050,
  tooltip: 1060,
  toast: 1070,
  overlay: 1080,
  max: 2147483647,
};

// Container sizes
export const containers = {
  xs: '20rem',     // 320px
  sm: '24rem',     // 384px
  md: '28rem',     // 448px
  lg: '32rem',     // 512px
  xl: '36rem',     // 576px
  '2xl': '42rem',  // 672px
  '3xl': '48rem',  // 768px
  '4xl': '56rem',  // 896px
  '5xl': '64rem',  // 1024px
  '6xl': '72rem',  // 1152px
  '7xl': '80rem',  // 1280px
  full: '100%',
};

// Breakpoints for responsive design
export const breakpoints = {
  xs: '475px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

// Grid system
export const grid = {
  columns: 12,
  gap: {
    xs: spacing[12],
    sm: spacing[16],
    md: spacing[20],
    lg: spacing[24],
    xl: spacing[32],
  },
  container: {
    padding: {
      xs: spacing[16],
      sm: spacing[20],
      md: spacing[24],
      lg: spacing[32],
      xl: spacing[40],
    },
    maxWidth: containers['7xl'],
  },
};

// Animation timing
export const timing = {
  fast: '150ms',
  normal: '200ms',
  slow: '300ms',
  slower: '500ms',
};

// Easing functions
export const easing = {
  linear: 'linear',
  easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
  easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
  easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
};
