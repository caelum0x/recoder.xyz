/**
 * Recoder.xyz Design System - Component Library
 * Reusable UI components for all platforms
 */

import { colors, lightTheme, darkTheme } from './colors';
import { typographyScale, fontFamilies } from './typography';
import { spacing, borderRadius, shadows, timing, easing } from './spacing';

// Button variants
export const buttonVariants = {
  primary: {
    background: colors.primary[500],
    color: colors.neutral[0],
    border: 'none',
    hover: {
      background: colors.primary[600],
      transform: 'translateY(-1px)',
      boxShadow: shadows.md,
    },
    active: {
      background: colors.primary[700],
      transform: 'translateY(0)',
    },
    focus: {
      outline: 'none',
      boxShadow: `0 0 0 3px ${colors.primary[500]}40`,
    },
  },
  
  secondary: {
    background: colors.neutral[100],
    color: colors.neutral[900],
    border: `1px solid ${colors.neutral[200]}`,
    hover: {
      background: colors.neutral[200],
      borderColor: colors.neutral[300],
    },
    active: {
      background: colors.neutral[300],
    },
    focus: {
      outline: 'none',
      boxShadow: `0 0 0 3px ${colors.primary[500]}40`,
    },
  },
  
  ghost: {
    background: 'transparent',
    color: colors.neutral[700],
    border: 'none',
    hover: {
      background: colors.neutral[100],
      color: colors.neutral[900],
    },
    active: {
      background: colors.neutral[200],
    },
  },
  
  destructive: {
    background: colors.error[500],
    color: colors.neutral[0],
    border: 'none',
    hover: {
      background: colors.error[600],
    },
    active: {
      background: colors.error[700],
    },
  },
  
  outline: {
    background: 'transparent',
    color: colors.primary[600],
    border: `1px solid ${colors.primary[500]}`,
    hover: {
      background: colors.primary[500],
      color: colors.neutral[0],
    },
    active: {
      background: colors.primary[600],
    },
  },
  
  gradient: {
    background: colors.gradient.primary,
    color: colors.neutral[0],
    border: 'none',
    hover: {
      transform: 'translateY(-1px)',
      boxShadow: shadows.lg,
    },
    active: {
      transform: 'translateY(0)',
    },
  },
  
  glass: {
    background: colors.glass.medium,
    backdropFilter: 'blur(10px)',
    color: colors.neutral[900],
    border: `1px solid ${colors.glass.light}`,
    hover: {
      background: colors.glass.light,
      transform: 'translateY(-1px)',
    },
  },
};

// Button sizes
export const buttonSizes = {
  sm: {
    padding: `${spacing[6]} ${spacing[12]}`,
    fontSize: typographyScale.ui.buttonSm.fontSize,
    fontWeight: typographyScale.ui.buttonSm.fontWeight,
    borderRadius: borderRadius.md,
    minHeight: spacing[32],
  },
  md: {
    padding: `${spacing[8]} ${spacing[16]}`,
    fontSize: typographyScale.ui.buttonMd.fontSize,
    fontWeight: typographyScale.ui.buttonMd.fontWeight,
    borderRadius: borderRadius.lg,
    minHeight: spacing[40],
  },
  lg: {
    padding: `${spacing[12]} ${spacing[20]}`,
    fontSize: typographyScale.ui.buttonLg.fontSize,
    fontWeight: typographyScale.ui.buttonLg.fontWeight,
    borderRadius: borderRadius.lg,
    minHeight: spacing[48],
  },
  xl: {
    padding: `${spacing[16]} ${spacing[24]}`,
    fontSize: typographyScale.body.lg.fontSize,
    fontWeight: typographyScale.ui.buttonLg.fontWeight,
    borderRadius: borderRadius.xl,
    minHeight: spacing[56],
  },
};

// Input variants
export const inputVariants = {
  default: {
    background: colors.neutral[0],
    border: `1px solid ${colors.neutral[200]}`,
    color: colors.neutral[900],
    placeholder: colors.neutral[500],
    focus: {
      borderColor: colors.primary[500],
      boxShadow: `0 0 0 3px ${colors.primary[500]}20`,
      outline: 'none',
    },
    error: {
      borderColor: colors.error[500],
      boxShadow: `0 0 0 3px ${colors.error[500]}20`,
    },
  },
  
  filled: {
    background: colors.neutral[50],
    border: `1px solid transparent`,
    color: colors.neutral[900],
    placeholder: colors.neutral[500],
    focus: {
      background: colors.neutral[0],
      borderColor: colors.primary[500],
      boxShadow: `0 0 0 3px ${colors.primary[500]}20`,
    },
  },
  
  ghost: {
    background: 'transparent',
    border: '1px solid transparent',
    borderBottom: `2px solid ${colors.neutral[200]}`,
    borderRadius: '0',
    color: colors.neutral[900],
    focus: {
      borderBottomColor: colors.primary[500],
      outline: 'none',
    },
  },
};

// Card variants
export const cardVariants = {
  default: {
    background: colors.neutral[0],
    border: `1px solid ${colors.neutral[200]}`,
    borderRadius: borderRadius.lg,
    boxShadow: shadows.sm,
    padding: spacing[24],
  },
  
  elevated: {
    background: colors.neutral[0],
    border: 'none',
    borderRadius: borderRadius.xl,
    boxShadow: shadows.lg,
    padding: spacing[32],
    hover: {
      boxShadow: shadows.xl,
      transform: 'translateY(-2px)',
    },
  },
  
  glass: {
    background: colors.glass.medium,
    backdropFilter: 'blur(20px)',
    border: `1px solid ${colors.glass.light}`,
    borderRadius: borderRadius['2xl'],
    boxShadow: shadows.glass,
    padding: spacing[32],
  },
  
  gradient: {
    background: colors.gradient.primary,
    border: 'none',
    borderRadius: borderRadius.xl,
    color: colors.neutral[0],
    padding: spacing[32],
    boxShadow: shadows.primary,
  },
  
  outline: {
    background: 'transparent',
    border: `1px solid ${colors.neutral[200]}`,
    borderRadius: borderRadius.lg,
    padding: spacing[24],
    hover: {
      background: colors.neutral[50],
      borderColor: colors.primary[300],
    },
  },
};

// Toast/Alert variants
export const alertVariants = {
  default: {
    background: colors.neutral[50],
    border: `1px solid ${colors.neutral[200]}`,
    color: colors.neutral[900],
    icon: colors.neutral[600],
  },
  
  success: {
    background: colors.success[50],
    border: `1px solid ${colors.success[200]}`,
    color: colors.success[800],
    icon: colors.success[600],
  },
  
  warning: {
    background: colors.warning[50],
    border: `1px solid ${colors.warning[200]}`,
    color: colors.warning[800],
    icon: colors.warning[600],
  },
  
  error: {
    background: colors.error[50],
    border: `1px solid ${colors.error[200]}`,
    color: colors.error[800],
    icon: colors.error[600],
  },
  
  info: {
    background: colors.primary[50],
    border: `1px solid ${colors.primary[200]}`,
    color: colors.primary[800],
    icon: colors.primary[600],
  },
};

// Badge variants
export const badgeVariants = {
  default: {
    background: colors.neutral[100],
    color: colors.neutral[800],
    fontSize: typographyScale.ui.caption.fontSize,
    fontWeight: typographyScale.ui.label.fontWeight,
    padding: `${spacing[2]} ${spacing[8]}`,
    borderRadius: borderRadius.full,
  },
  
  primary: {
    background: colors.primary[100],
    color: colors.primary[800],
    fontSize: typographyScale.ui.caption.fontSize,
    fontWeight: typographyScale.ui.label.fontWeight,
    padding: `${spacing[2]} ${spacing[8]}`,
    borderRadius: borderRadius.full,
  },
  
  success: {
    background: colors.success[100],
    color: colors.success[800],
    fontSize: typographyScale.ui.caption.fontSize,
    fontWeight: typographyScale.ui.label.fontWeight,
    padding: `${spacing[2]} ${spacing[8]}`,
    borderRadius: borderRadius.full,
  },
  
  warning: {
    background: colors.warning[100],
    color: colors.warning[800],
    fontSize: typographyScale.ui.caption.fontSize,
    fontWeight: typographyScale.ui.label.fontWeight,
    padding: `${spacing[2]} ${spacing[8]}`,
    borderRadius: borderRadius.full,
  },
  
  error: {
    background: colors.error[100],
    color: colors.error[800],
    fontSize: typographyScale.ui.caption.fontSize,
    fontWeight: typographyScale.ui.label.fontWeight,
    padding: `${spacing[2]} ${spacing[8]}`,
    borderRadius: borderRadius.full,
  },
  
  outline: {
    background: 'transparent',
    color: colors.neutral[700],
    border: `1px solid ${colors.neutral[300]}`,
    fontSize: typographyScale.ui.caption.fontSize,
    fontWeight: typographyScale.ui.label.fontWeight,
    padding: `${spacing[2]} ${spacing[8]}`,
    borderRadius: borderRadius.full,
  },
};

// Animation presets
export const animations = {
  fadeIn: {
    keyframes: {
      '0%': { opacity: 0 },
      '100%': { opacity: 1 },
    },
    duration: timing.normal,
    easing: easing.easeOut,
  },
  
  fadeInUp: {
    keyframes: {
      '0%': { opacity: 0, transform: 'translateY(10px)' },
      '100%': { opacity: 1, transform: 'translateY(0)' },
    },
    duration: timing.normal,
    easing: easing.easeOut,
  },
  
  slideIn: {
    keyframes: {
      '0%': { transform: 'translateX(-100%)' },
      '100%': { transform: 'translateX(0)' },
    },
    duration: timing.slow,
    easing: easing.spring,
  },
  
  scaleIn: {
    keyframes: {
      '0%': { transform: 'scale(0.9)', opacity: 0 },
      '100%': { transform: 'scale(1)', opacity: 1 },
    },
    duration: timing.normal,
    easing: easing.bounce,
  },
  
  spin: {
    keyframes: {
      '0%': { transform: 'rotate(0deg)' },
      '100%': { transform: 'rotate(360deg)' },
    },
    duration: '1s',
    easing: easing.linear,
    iterationCount: 'infinite',
  },
  
  pulse: {
    keyframes: {
      '0%, 100%': { opacity: 1 },
      '50%': { opacity: 0.5 },
    },
    duration: '2s',
    easing: easing.easeInOut,
    iterationCount: 'infinite',
  },
  
  bounce: {
    keyframes: {
      '0%, 20%, 53%, 80%, 100%': { transform: 'translate3d(0,0,0)' },
      '40%, 43%': { transform: 'translate3d(0,-30px,0)' },
      '70%': { transform: 'translate3d(0,-15px,0)' },
      '90%': { transform: 'translate3d(0,-4px,0)' },
    },
    duration: '1s',
    easing: easing.easeOut,
  },
};

// Common CSS transitions
export const transitions = {
  default: `all ${timing.normal} ${easing.easeInOut}`,
  fast: `all ${timing.fast} ${easing.easeOut}`,
  slow: `all ${timing.slow} ${easing.easeInOut}`,
  colors: `color ${timing.normal} ${easing.easeInOut}, background-color ${timing.normal} ${easing.easeInOut}, border-color ${timing.normal} ${easing.easeInOut}`,
  transform: `transform ${timing.normal} ${easing.easeOut}`,
  opacity: `opacity ${timing.normal} ${easing.easeInOut}`,
};

// Common utility classes
export const utilities = {
  // Flexbox utilities
  flex: {
    center: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerY: {
      display: 'flex',
      alignItems: 'center',
    },
    centerX: {
      display: 'flex',
      justifyContent: 'center',
    },
    between: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    column: {
      display: 'flex',
      flexDirection: 'column',
    },
    columnCenter: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    },
  },
  
  // Text utilities
  text: {
    center: { textAlign: 'center' },
    left: { textAlign: 'left' },
    right: { textAlign: 'right' },
    ellipsis: {
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    gradient: {
      background: colors.gradient.primary,
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
    },
  },
  
  // Layout utilities
  layout: {
    fullWidth: { width: '100%' },
    fullHeight: { height: '100%' },
    fullViewport: { height: '100vh' },
    sticky: { position: 'sticky' },
    fixed: { position: 'fixed' },
    absolute: { position: 'absolute' },
    relative: { position: 'relative' },
  },
  
  // Visibility utilities
  visibility: {
    hidden: { visibility: 'hidden' },
    invisible: { opacity: 0 },
    srOnly: {
      position: 'absolute',
      width: '1px',
      height: '1px',
      padding: 0,
      margin: '-1px',
      overflow: 'hidden',
      clip: 'rect(0, 0, 0, 0)',
      whiteSpace: 'nowrap',
      border: 0,
    },
  },
};
