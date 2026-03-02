import { globSync } from 'fast-glob';
import fs from 'node:fs/promises';
import { basename } from 'node:path';
import { defineConfig, presetIcons, presetUno, transformerDirectives } from 'unocss';
import type { InlineCollection } from '@iconify/utils';
import { icons as phIcons } from '@iconify-json/ph';

const iconPaths = globSync('./icons/*.svg');

const collectionName = 'recoder';

const customIconCollection = iconPaths.reduce(
  (acc, iconPath) => {
    const [iconName] = basename(iconPath).split('.');

    acc[collectionName] ??= {};
    acc[collectionName][iconName] = async () => fs.readFile(iconPath, 'utf8');

    return acc;
  },
  {} as Record<string, Record<string, () => Promise<string>>>,
);

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
  green: {
    50: '#F0FDF4',
    100: '#DCFCE7',
    200: '#BBF7D0',
    300: '#86EFAC',
    400: '#4ADE80',
    500: '#22C55E',
    600: '#16A34A',
    700: '#15803D',
    800: '#166534',
    900: '#14532D',
    950: '#052E16',
  },
  orange: {
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

const COLOR_PRIMITIVES = {
  ...BASE_COLORS,
  alpha: {
    white: generateAlphaPalette(BASE_COLORS.white),
    gray: generateAlphaPalette(BASE_COLORS.gray[900]),
    red: generateAlphaPalette(BASE_COLORS.red[500]),
    accent: generateAlphaPalette(BASE_COLORS.accent[500]),
    purple: generateAlphaPalette(BASE_COLORS.purple[500]),
  },
};

export default defineConfig({
  shortcuts: {
    'recoder-ease-cubic-bezier': 'ease-[cubic-bezier(0.4,0,0.2,1)]',
    'transition-theme': 'transition-[background-color,border-color,color] duration-150 recoder-ease-cubic-bezier',
    kdb: 'bg-recoder-elements-code-background text-recoder-elements-code-text py-1 px-1.5 rounded-md',
    'max-w-chat': 'max-w-[var(--chat-max-width)]',
  },
  rules: [
    /**
     * This shorthand doesn't exist in Tailwind and we overwrite it to avoid
     * any conflicts with minified CSS classes.
     */
    ['b', {}],
  ],
  theme: {
    colors: {
      ...COLOR_PRIMITIVES,
      recoder: {
        elements: {
          borderColor: 'var(--recoder-elements-borderColor)',
          borderColorActive: 'var(--recoder-elements-borderColorActive)',
          background: {
            depth: {
              1: 'var(--recoder-elements-bg-depth-1)',
              2: 'var(--recoder-elements-bg-depth-2)',
              3: 'var(--recoder-elements-bg-depth-3)',
              4: 'var(--recoder-elements-bg-depth-4)',
            },
          },
          textPrimary: 'var(--recoder-elements-textPrimary)',
          textSecondary: 'var(--recoder-elements-textSecondary)',
          textTertiary: 'var(--recoder-elements-textTertiary)',
          code: {
            background: 'var(--recoder-elements-code-background)',
            text: 'var(--recoder-elements-code-text)',
          },
          button: {
            primary: {
              background: 'var(--recoder-elements-button-primary-background)',
              backgroundHover: 'var(--recoder-elements-button-primary-backgroundHover)',
              text: 'var(--recoder-elements-button-primary-text)',
            },
            secondary: {
              background: 'var(--recoder-elements-button-secondary-background)',
              backgroundHover: 'var(--recoder-elements-button-secondary-backgroundHover)',
              text: 'var(--recoder-elements-button-secondary-text)',
            },
            danger: {
              background: 'var(--recoder-elements-button-danger-background)',
              backgroundHover: 'var(--recoder-elements-button-danger-backgroundHover)',
              text: 'var(--recoder-elements-button-danger-text)',
            },
          },
          item: {
            contentDefault: 'var(--recoder-elements-item-contentDefault)',
            contentActive: 'var(--recoder-elements-item-contentActive)',
            contentAccent: 'var(--recoder-elements-item-contentAccent)',
            contentDanger: 'var(--recoder-elements-item-contentDanger)',
            backgroundDefault: 'var(--recoder-elements-item-backgroundDefault)',
            backgroundActive: 'var(--recoder-elements-item-backgroundActive)',
            backgroundAccent: 'var(--recoder-elements-item-backgroundAccent)',
            backgroundDanger: 'var(--recoder-elements-item-backgroundDanger)',
          },
          actions: {
            background: 'var(--recoder-elements-actions-background)',
            code: {
              background: 'var(--recoder-elements-actions-code-background)',
            },
          },
          artifacts: {
            background: 'var(--recoder-elements-artifacts-background)',
            backgroundHover: 'var(--recoder-elements-artifacts-backgroundHover)',
            borderColor: 'var(--recoder-elements-artifacts-borderColor)',
            inlineCode: {
              background: 'var(--recoder-elements-artifacts-inlineCode-background)',
              text: 'var(--recoder-elements-artifacts-inlineCode-text)',
            },
          },
          messages: {
            background: 'var(--recoder-elements-messages-background)',
            linkColor: 'var(--recoder-elements-messages-linkColor)',
            code: {
              background: 'var(--recoder-elements-messages-code-background)',
            },
            inlineCode: {
              background: 'var(--recoder-elements-messages-inlineCode-background)',
              text: 'var(--recoder-elements-messages-inlineCode-text)',
            },
          },
          icon: {
            success: 'var(--recoder-elements-icon-success)',
            error: 'var(--recoder-elements-icon-error)',
            primary: 'var(--recoder-elements-icon-primary)',
            secondary: 'var(--recoder-elements-icon-secondary)',
            tertiary: 'var(--recoder-elements-icon-tertiary)',
          },
          preview: {
            addressBar: {
              background: 'var(--recoder-elements-preview-addressBar-background)',
              backgroundHover: 'var(--recoder-elements-preview-addressBar-backgroundHover)',
              backgroundActive: 'var(--recoder-elements-preview-addressBar-backgroundActive)',
              text: 'var(--recoder-elements-preview-addressBar-text)',
              textActive: 'var(--recoder-elements-preview-addressBar-textActive)',
            },
          },
          terminals: {
            background: 'var(--recoder-elements-terminals-background)',
            buttonBackground: 'var(--recoder-elements-terminals-buttonBackground)',
          },
          dividerColor: 'var(--recoder-elements-dividerColor)',
          loader: {
            background: 'var(--recoder-elements-loader-background)',
            progress: 'var(--recoder-elements-loader-progress)',
          },
          prompt: {
            background: 'var(--recoder-elements-prompt-background)',
          },
          sidebar: {
            dropdownShadow: 'var(--recoder-elements-sidebar-dropdownShadow)',
            buttonBackgroundDefault: 'var(--recoder-elements-sidebar-buttonBackgroundDefault)',
            buttonBackgroundHover: 'var(--recoder-elements-sidebar-buttonBackgroundHover)',
            buttonText: 'var(--recoder-elements-sidebar-buttonText)',
          },
          cta: {
            background: 'var(--recoder-elements-cta-background)',
            text: 'var(--recoder-elements-cta-text)',
          },
        },
      },
    },
  },
  transformers: [transformerDirectives()],
  presets: [
    presetUno({
      dark: {
        light: '[data-theme="light"]',
        dark: '[data-theme="dark"]',
      },
    }),
    presetIcons({
      warn: true,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
      collections: {
        ph: phIcons as unknown as InlineCollection,
        ...customIconCollection,
      },
    }),
  ],
});

/**
 * Generates an alpha palette for a given hex color.
 *
 * @param hex - The hex color code (without alpha) to generate the palette from.
 * @returns An object where keys are opacity percentages and values are hex colors with alpha.
 *
 * Example:
 *
 * ```
 * {
 *   '1': '#FFFFFF03',
 *   '2': '#FFFFFF05',
 *   '3': '#FFFFFF08',
 * }
 * ```
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
