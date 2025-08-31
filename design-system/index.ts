/**
 * Recoder.xyz Design System - Main Export
 * Central export for all design system tokens and components
 */

// Import all design tokens first
import {
  colors,
  lightTheme,
  darkTheme,
  type ColorTheme,
} from './colors';

import {
  fontFamilies,
  fontSizes,
  fontWeights,
  typographyScale,
  typographyCSSVars,
} from './typography';

import {
  spacing,
  componentSpacing,
  borderRadius,
  shadows,
  zIndex,
  containers,
  breakpoints,
  grid,
  timing,
  easing,
} from './spacing';

import {
  buttonVariants,
  buttonSizes,
  inputVariants,
  cardVariants,
  alertVariants,
  badgeVariants,
  animations,
  transitions,
  utilities,
} from './components';

// Re-export everything
export * from './colors';
export * from './typography';
export * from './spacing';
export * from './components';

export {
  fontFamilies,
  fontSizes,
  fontWeights,
  typographyScale,
  typographyCSSVars,
} from './typography';

export {
  spacing,
  componentSpacing,
  borderRadius,
  shadows,
  zIndex,
  containers,
  breakpoints,
  grid,
  timing,
  easing,
} from './spacing';

export {
  buttonVariants,
  buttonSizes,
  inputVariants,
  cardVariants,
  alertVariants,
  badgeVariants,
  animations,
  transitions,
  utilities,
} from './components';

// Design system metadata
export const designSystem = {
  name: 'Recoder Design System',
  version: '1.0.0',
  description: 'Professional design system for Recoder.xyz ecosystem',
  platforms: ['recoder-main', 'recoder-chat', 'recoder-web'],
  baseUnit: 4, // 4px base spacing unit
  colorMode: 'light', // default color mode
  
  // Design principles
  principles: [
    'Consistency across all platforms',
    'Accessibility first approach',
    'Mobile-responsive design',
    'Performance optimized',
    'Developer experience focused',
  ],
  
  // Supported themes
  themes: ['light', 'dark', 'high-contrast'],
  
  // Breakpoint names for media queries
  breakpointNames: ['xs', 'sm', 'md', 'lg', 'xl', '2xl'],
  
  // Component categories
  componentCategories: [
    'buttons',
    'inputs',
    'cards',
    'navigation',
    'feedback',
    'overlays',
    'data-display',
    'layout',
  ],
};

// CSS custom properties generator
export const generateCSSVariables = (theme: 'light' | 'dark' = 'light') => {
  const themeColors = theme === 'light' ? lightTheme : darkTheme;
  
  return {
    // Colors
    '--color-background': themeColors.background,
    '--color-surface': themeColors.surface,
    '--color-surface-hover': themeColors.surfaceHover,
    '--color-border': themeColors.border,
    '--color-text-primary': themeColors.text.primary,
    '--color-text-secondary': themeColors.text.secondary,
    '--color-text-tertiary': themeColors.text.tertiary,
    '--color-text-inverse': themeColors.text.inverse,
    '--color-button-primary': themeColors.button.primary,
    '--color-button-primary-hover': themeColors.button.primaryHover,
    '--color-button-secondary': themeColors.button.secondary,
    '--color-button-secondary-hover': themeColors.button.secondaryHover,
    
    // Brand colors
    '--color-primary-50': colors.primary[50],
    '--color-primary-100': colors.primary[100],
    '--color-primary-200': colors.primary[200],
    '--color-primary-300': colors.primary[300],
    '--color-primary-400': colors.primary[400],
    '--color-primary-500': colors.primary[500],
    '--color-primary-600': colors.primary[600],
    '--color-primary-700': colors.primary[700],
    '--color-primary-800': colors.primary[800],
    '--color-primary-900': colors.primary[900],
    '--color-primary-950': colors.primary[950],
    
    // Semantic colors
    '--color-success': colors.success[500],
    '--color-warning': colors.warning[500],
    '--color-error': colors.error[500],
    
    // Gradients
    '--gradient-primary': colors.gradient.primary,
    '--gradient-success': colors.gradient.success,
    '--gradient-warning': colors.gradient.warning,
    '--gradient-purple': colors.gradient.purple,
    '--gradient-sunset': colors.gradient.sunset,
    '--gradient-ocean': colors.gradient.ocean,
    
    // Typography
    '--font-sans': fontFamilies.sans.join(', '),
    '--font-mono': fontFamilies.mono.join(', '),
    '--font-heading': fontFamilies.heading.join(', '),
    
    // Spacing
    '--spacing-xs': spacing[4],
    '--spacing-sm': spacing[8],
    '--spacing-md': spacing[16],
    '--spacing-lg': spacing[24],
    '--spacing-xl': spacing[32],
    '--spacing-2xl': spacing[48],
    '--spacing-3xl': spacing[64],
    
    // Border radius
    '--radius-sm': borderRadius.sm,
    '--radius-md': borderRadius.md,
    '--radius-lg': borderRadius.lg,
    '--radius-xl': borderRadius.xl,
    '--radius-2xl': borderRadius['2xl'],
    '--radius-3xl': borderRadius['3xl'],
    '--radius-full': borderRadius.full,
    
    // Shadows
    '--shadow-sm': shadows.sm,
    '--shadow-md': shadows.md,
    '--shadow-lg': shadows.lg,
    '--shadow-xl': shadows.xl,
    '--shadow-2xl': shadows['2xl'],
    '--shadow-primary': shadows.primary,
    '--shadow-glass': shadows.glass,
    
    // Z-index
    '--z-dropdown': zIndex.dropdown,
    '--z-sticky': zIndex.sticky,
    '--z-fixed': zIndex.fixed,
    '--z-modal': zIndex.modal,
    '--z-popover': zIndex.popover,
    '--z-tooltip': zIndex.tooltip,
    '--z-toast': zIndex.toast,
    
    // Timing
    '--timing-fast': timing.fast,
    '--timing-normal': timing.normal,
    '--timing-slow': timing.slow,
    '--timing-slower': timing.slower,
    
    // Transitions
    '--transition-default': transitions.default,
    '--transition-fast': transitions.fast,
    '--transition-colors': transitions.colors,
    '--transition-transform': transitions.transform,
  };
};

// Media query helpers
export const mediaQueries = {
  xs: `@media (min-width: ${breakpoints.xs})`,
  sm: `@media (min-width: ${breakpoints.sm})`,
  md: `@media (min-width: ${breakpoints.md})`,
  lg: `@media (min-width: ${breakpoints.lg})`,
  xl: `@media (min-width: ${breakpoints.xl})`,
  '2xl': `@media (min-width: ${breakpoints['2xl']})`,
  
  // Max width queries
  maxXs: `@media (max-width: ${breakpoints.xs})`,
  maxSm: `@media (max-width: ${breakpoints.sm})`,
  maxMd: `@media (max-width: ${breakpoints.md})`,
  maxLg: `@media (max-width: ${breakpoints.lg})`,
  maxXl: `@media (max-width: ${breakpoints.xl})`,
  max2xl: `@media (max-width: ${breakpoints['2xl']})`,
  
  // Preference queries
  reducedMotion: '@media (prefers-reduced-motion: reduce)',
  darkMode: '@media (prefers-color-scheme: dark)',
  lightMode: '@media (prefers-color-scheme: light)',
  highContrast: '@media (prefers-contrast: high)',
  
  // Device queries
  mobile: '@media (max-width: 768px)',
  tablet: '@media (min-width: 769px) and (max-width: 1024px)',
  desktop: '@media (min-width: 1025px)',
  
  // Orientation queries
  landscape: '@media (orientation: landscape)',
  portrait: '@media (orientation: portrait)',
  
  // Print query
  print: '@media print',
};

// Component composition helpers
export const createComponent = (
  baseStyles: Record<string, any>,
  variants: Record<string, Record<string, any>> = {},
  sizes: Record<string, Record<string, any>> = {}
) => {
  return {
    base: baseStyles,
    variants,
    sizes,
    compose: (variant?: string, size?: string) => ({
      ...baseStyles,
      ...(variant && variants[variant] ? variants[variant] : {}),
      ...(size && sizes[size] ? sizes[size] : {}),
    }),
  };
};

// Default export for entire design system
export default {
  colors,
  typography: {
    families: fontFamilies,
    sizes: fontSizes,
    weights: fontWeights,
    scale: typographyScale,
  },
  spacing,
  layout: {
    borderRadius,
    shadows,
    zIndex,
    containers,
    breakpoints,
    grid,
  },
  motion: {
    timing,
    easing,
    animations,
    transitions,
  },
  components: {
    button: { variants: buttonVariants, sizes: buttonSizes },
    input: { variants: inputVariants },
    card: { variants: cardVariants },
    alert: { variants: alertVariants },
    badge: { variants: badgeVariants },
  },
  utilities,
  themes: { light: lightTheme, dark: darkTheme },
  meta: designSystem,
  helpers: {
    generateCSSVariables,
    mediaQueries,
    createComponent,
  },
};
