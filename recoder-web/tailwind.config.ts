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
      },
    },
  },
  plugins: [],
}

export default config
