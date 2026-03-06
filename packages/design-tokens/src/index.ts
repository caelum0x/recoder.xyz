/**
 * Recoder Design Tokens
 *
 * Canonical brand colors, typography, and spacing used across all Recoder apps.
 * Import these tokens instead of hard-coding values to ensure consistency.
 */

// -- Brand Colors (HSL values for CSS custom properties) --
export const colorHSL = {
  orange: {
    50: "25 100% 95%",
    100: "25 100% 90%",
    200: "25 100% 80%",
    300: "25 95% 65%",
    400: "25 95% 58%",
    500: "25 95% 53%",
    600: "25 95% 45%",
    700: "25 90% 38%",
  },
  purple: {
    50: "270 100% 95%",
    100: "270 100% 90%",
    200: "270 91% 80%",
    300: "270 91% 72%",
    400: "270 91% 65%",
    500: "270 85% 58%",
    600: "270 80% 50%",
    700: "270 75% 42%",
  },
  gray: {
    50: "0 0% 98%",
    100: "0 0% 95%",
    200: "0 0% 90%",
    300: "0 0% 80%",
    400: "0 0% 64%",
    500: "0 0% 45%",
    600: "0 0% 32%",
    700: "0 0% 20%",
    800: "0 0% 12%",
    900: "0 0% 8%",
    950: "0 0% 5%",
  },
} as const;

// -- Hex colors for non-CSS contexts --
export const colors = {
  orange: {
    500: "#F79009",
    600: "#DC6803",
  },
  purple: {
    400: "#A855F7",
    600: "#9333EA",
  },
  black: "#000000",
  white: "#FFFFFF",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
} as const;

// -- Gradients --
export const gradients = {
  primary: `linear-gradient(to right, ${colors.orange[500]}, ${colors.purple[400]})`,
  primaryTailwind: "bg-gradient-to-r from-[#F79009] to-[#A855F7]",
} as const;

// -- Typography --
export const fonts = {
  sans: "Roobert, system-ui, -apple-system, sans-serif",
  mono: "Roobert Mono, Consolas, monospace",
} as const;

// -- Spacing (Tailwind default scale) --
export const spacing = {
  0: "0", 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", 4: "1rem",
  5: "1.25rem", 6: "1.5rem", 8: "2rem", 10: "2.5rem", 12: "3rem",
  16: "4rem", 20: "5rem",
} as const;

// -- Border Radius --
export const radii = {
  sm: "0.125rem", md: "0.375rem", lg: "0.75rem",
  xl: "1rem", "2xl": "1.5rem", full: "9999px",
} as const;

// -- Breakpoints --
export const breakpoints = {
  sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px",
} as const;
