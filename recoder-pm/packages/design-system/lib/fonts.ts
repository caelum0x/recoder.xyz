/**
 * Font CSS variable names used across the design system.
 *
 * The actual font files (Roobert) are loaded via next/font/local in each
 * app's root layout.tsx, which injects these CSS variables into the DOM.
 * The design-system and Tailwind reference them through globals.css
 * (--font-sans / --font-mono).
 */
export const fontVariables = {
  sans: '--font-geist-sans',
  mono: '--font-geist-mono',
} as const;

/**
 * @deprecated Use inline font loading in each app layout instead.
 * Kept for backward-compatibility with portal layout during migration.
 */
export const fonts = 'touch-manipulation font-sans antialiased';
