import type { Config } from "tailwindcss"

/**
 * Generates an alpha palette for a given hex color.
 */
function generateAlphaPalette(hex: string) {
  return [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].reduce(
    (acc, opacity) => {
      const alpha = Math.round((opacity / 100) * 255)
        .toString(16)
        .padStart(2, '0');

      acc[opacity] = `${hex}${alpha}`;

      return acc;
    },
    {} as Record<number, string>,
  );
}

const BASE_COLORS = {
  white: '#FFFFFF',
  gray: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#0A0A0A',
  },
  accent: {
    50: '#FFFAEB',
    100: '#FEEFC7',
    200: '#FEDF89',
    300: '#FEC84B',
    400: '#FDB022',
    500: '#F79009',
    600: '#DC6803',
    700: '#B54708',
    800: '#93370D',
    900: '#792E0D',
    950: '#451a03',
  },
  purple: {
    50: '#FAF5FF',
    100: '#F3E8FF',
    200: '#E9D5FF',
    300: '#D8B4FE',
    400: '#C084FC',
    500: '#B941F5',
    600: '#A030E6',
    700: '#8820C7',
    800: '#6B1AA8',
    900: '#581C87',
    950: '#3B0764',
  },
  red: {
    50: '#FEF2F2',
    100: '#FEE2E2',
    200: '#FECACA',
    300: '#FCA5A5',
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
    700: '#B91C1C',
    800: '#991B1B',
    900: '#7F1D1D',
    950: '#450A0A',
  },
};

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx,scss}",
  ],
  // Enable dark mode with data-theme attribute
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ...BASE_COLORS,
        alpha: {
          white: generateAlphaPalette(BASE_COLORS.white),
          gray: generateAlphaPalette(BASE_COLORS.gray[900]),
          accent: generateAlphaPalette(BASE_COLORS.accent[500]),
          purple: generateAlphaPalette(BASE_COLORS.purple[500]),
          red: generateAlphaPalette(BASE_COLORS.red[500]),
        },
        'recoder-elements-background': {
          'depth-1': 'var(--recoder-elements-background-depth-1)',
          'depth-2': 'var(--recoder-elements-background-depth-2)',
          'depth-3': 'var(--recoder-elements-background-depth-3)',
          'depth-4': 'var(--recoder-elements-background-depth-4)',
        },
        'recoder-elements-textPrimary': 'var(--recoder-elements-textPrimary)',
        'recoder-elements-textSecondary': 'var(--recoder-elements-textSecondary)',
        'recoder-elements-textTertiary': 'var(--recoder-elements-textTertiary)',
        'recoder-elements-borderColor': 'var(--recoder-elements-borderColor)',
      },
      animation: {
        'fadeIn': 'fadeIn 0.2s ease-in-out',
        'fadeOut': 'fadeOut 0.2s ease-in-out',
        'slideIn': 'slideIn 0.2s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'bounce-subtle': 'bounceSubtle 0.3s ease-out',
        'ping-slow': 'pingSlow 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'grid-scroll': 'gridScroll 20s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeOut: {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-4px)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.9)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        bounceSubtle: {
          '0%': { transform: 'scale(0.95)' },
          '50%': { transform: 'scale(1.02)' },
          '100%': { transform: 'scale(1)' },
        },
        pingSlow: {
          '0%': { transform: 'scale(1)', opacity: '0.5' },
          '75%, 100%': { transform: 'scale(1.5)', opacity: '0' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        gridScroll: {
          '0%': { transform: 'translate(0, 0)' },
          '100%': { transform: 'translate(20px, 20px)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
