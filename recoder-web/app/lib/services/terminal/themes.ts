/**
 * Terminal Themes
 * Predefined themes for the terminal
 */

import type { ITheme } from '@xterm/xterm';
import type { TerminalThemeConfig } from './types';

// Helper to get CSS variables
const getCssVar = (token: string): string | undefined => {
  if (typeof window === 'undefined') return undefined;
  const style = getComputedStyle(document.documentElement);
  return style.getPropertyValue(token).trim() || undefined;
};

// Default theme using CSS variables (matches app theme)
export const defaultTheme: ITheme = {
  cursor: getCssVar('--recoder-elements-terminal-cursorColor') || '#f8f8f2',
  cursorAccent: getCssVar('--recoder-elements-terminal-cursorColorAccent') || '#000000',
  foreground: getCssVar('--recoder-elements-terminal-textColor') || '#f8f8f2',
  background: getCssVar('--recoder-elements-terminal-backgroundColor') || '#1e1e2e',
  selectionBackground: getCssVar('--recoder-elements-terminal-selection-backgroundColor') || '#44475a',
  selectionForeground: getCssVar('--recoder-elements-terminal-selection-textColor') || '#f8f8f2',
  selectionInactiveBackground: getCssVar('--recoder-elements-terminal-selection-backgroundColorInactive') || '#3d3d5c',

  // ANSI colors
  black: getCssVar('--recoder-elements-terminal-color-black') || '#21222c',
  red: getCssVar('--recoder-elements-terminal-color-red') || '#ff5555',
  green: getCssVar('--recoder-elements-terminal-color-green') || '#50fa7b',
  yellow: getCssVar('--recoder-elements-terminal-color-yellow') || '#f1fa8c',
  blue: getCssVar('--recoder-elements-terminal-color-blue') || '#bd93f9',
  magenta: getCssVar('--recoder-elements-terminal-color-magenta') || '#ff79c6',
  cyan: getCssVar('--recoder-elements-terminal-color-cyan') || '#8be9fd',
  white: getCssVar('--recoder-elements-terminal-color-white') || '#f8f8f2',
  brightBlack: getCssVar('--recoder-elements-terminal-color-brightBlack') || '#6272a4',
  brightRed: getCssVar('--recoder-elements-terminal-color-brightRed') || '#ff6e6e',
  brightGreen: getCssVar('--recoder-elements-terminal-color-brightGreen') || '#69ff94',
  brightYellow: getCssVar('--recoder-elements-terminal-color-brightYellow') || '#ffffa5',
  brightBlue: getCssVar('--recoder-elements-terminal-color-brightBlue') || '#d6acff',
  brightMagenta: getCssVar('--recoder-elements-terminal-color-brightMagenta') || '#ff92df',
  brightCyan: getCssVar('--recoder-elements-terminal-color-brightCyan') || '#a4ffff',
  brightWhite: getCssVar('--recoder-elements-terminal-color-brightWhite') || '#ffffff',
};

// Dracula theme
export const draculaTheme: ITheme = {
  cursor: '#f8f8f2',
  cursorAccent: '#282a36',
  foreground: '#f8f8f2',
  background: '#282a36',
  selectionBackground: '#44475a',
  selectionForeground: '#f8f8f2',
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff',
};

// Monokai theme
export const monokaiTheme: ITheme = {
  cursor: '#f8f8f2',
  cursorAccent: '#272822',
  foreground: '#f8f8f2',
  background: '#272822',
  selectionBackground: '#49483e',
  selectionForeground: '#f8f8f2',
  black: '#272822',
  red: '#f92672',
  green: '#a6e22e',
  yellow: '#f4bf75',
  blue: '#66d9ef',
  magenta: '#ae81ff',
  cyan: '#a1efe4',
  white: '#f8f8f2',
  brightBlack: '#75715e',
  brightRed: '#f92672',
  brightGreen: '#a6e22e',
  brightYellow: '#f4bf75',
  brightBlue: '#66d9ef',
  brightMagenta: '#ae81ff',
  brightCyan: '#a1efe4',
  brightWhite: '#f9f8f5',
};

// One Dark theme
export const oneDarkTheme: ITheme = {
  cursor: '#528bff',
  cursorAccent: '#282c34',
  foreground: '#abb2bf',
  background: '#282c34',
  selectionBackground: '#3e4451',
  selectionForeground: '#abb2bf',
  black: '#282c34',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#abb2bf',
  brightBlack: '#5c6370',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#ffffff',
};

// Nord theme
export const nordTheme: ITheme = {
  cursor: '#d8dee9',
  cursorAccent: '#2e3440',
  foreground: '#d8dee9',
  background: '#2e3440',
  selectionBackground: '#434c5e',
  selectionForeground: '#d8dee9',
  black: '#3b4252',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#ebcb8b',
  blue: '#81a1c1',
  magenta: '#b48ead',
  cyan: '#88c0d0',
  white: '#e5e9f0',
  brightBlack: '#4c566a',
  brightRed: '#bf616a',
  brightGreen: '#a3be8c',
  brightYellow: '#ebcb8b',
  brightBlue: '#81a1c1',
  brightMagenta: '#b48ead',
  brightCyan: '#8fbcbb',
  brightWhite: '#eceff4',
};

// Solarized Dark theme
export const solarizedDarkTheme: ITheme = {
  cursor: '#839496',
  cursorAccent: '#002b36',
  foreground: '#839496',
  background: '#002b36',
  selectionBackground: '#073642',
  selectionForeground: '#93a1a1',
  black: '#073642',
  red: '#dc322f',
  green: '#859900',
  yellow: '#b58900',
  blue: '#268bd2',
  magenta: '#d33682',
  cyan: '#2aa198',
  white: '#eee8d5',
  brightBlack: '#586e75',
  brightRed: '#cb4b16',
  brightGreen: '#586e75',
  brightYellow: '#657b83',
  brightBlue: '#839496',
  brightMagenta: '#6c71c4',
  brightCyan: '#93a1a1',
  brightWhite: '#fdf6e3',
};

// Solarized Light theme
export const solarizedLightTheme: ITheme = {
  cursor: '#657b83',
  cursorAccent: '#fdf6e3',
  foreground: '#657b83',
  background: '#fdf6e3',
  selectionBackground: '#eee8d5',
  selectionForeground: '#586e75',
  black: '#073642',
  red: '#dc322f',
  green: '#859900',
  yellow: '#b58900',
  blue: '#268bd2',
  magenta: '#d33682',
  cyan: '#2aa198',
  white: '#eee8d5',
  brightBlack: '#002b36',
  brightRed: '#cb4b16',
  brightGreen: '#586e75',
  brightYellow: '#657b83',
  brightBlue: '#839496',
  brightMagenta: '#6c71c4',
  brightCyan: '#93a1a1',
  brightWhite: '#fdf6e3',
};

// GitHub Dark theme
export const githubDarkTheme: ITheme = {
  cursor: '#c9d1d9',
  cursorAccent: '#0d1117',
  foreground: '#c9d1d9',
  background: '#0d1117',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
  black: '#484f58',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
};

// Tokyo Night theme
export const tokyoNightTheme: ITheme = {
  cursor: '#c0caf5',
  cursorAccent: '#1a1b26',
  foreground: '#c0caf5',
  background: '#1a1b26',
  selectionBackground: '#33467c',
  selectionForeground: '#c0caf5',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5',
};

// Catppuccin Mocha theme
export const catppuccinMochaTheme: ITheme = {
  cursor: '#f5e0dc',
  cursorAccent: '#1e1e2e',
  foreground: '#cdd6f4',
  background: '#1e1e2e',
  selectionBackground: '#45475a',
  selectionForeground: '#cdd6f4',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#f5c2e7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#f5c2e7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8',
};

// All available themes
export const TERMINAL_THEMES: TerminalThemeConfig[] = [
  { id: 'default', name: 'Default', theme: defaultTheme, isDark: true },
  { id: 'dracula', name: 'Dracula', theme: draculaTheme, isDark: true },
  { id: 'monokai', name: 'Monokai', theme: monokaiTheme, isDark: true },
  { id: 'one-dark', name: 'One Dark', theme: oneDarkTheme, isDark: true },
  { id: 'nord', name: 'Nord', theme: nordTheme, isDark: true },
  { id: 'solarized-dark', name: 'Solarized Dark', theme: solarizedDarkTheme, isDark: true },
  { id: 'solarized-light', name: 'Solarized Light', theme: solarizedLightTheme, isDark: false },
  { id: 'github-dark', name: 'GitHub Dark', theme: githubDarkTheme, isDark: true },
  { id: 'tokyo-night', name: 'Tokyo Night', theme: tokyoNightTheme, isDark: true },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', theme: catppuccinMochaTheme, isDark: true },
];

/**
 * Get theme by ID
 */
export function getThemeById(themeId: string): TerminalThemeConfig | undefined {
  return TERMINAL_THEMES.find((t) => t.id === themeId);
}

/**
 * Get theme ITheme object by ID
 */
export function getTheme(themeId: string): ITheme {
  const themeConfig = getThemeById(themeId);
  return themeConfig?.theme || defaultTheme;
}

/**
 * Get all dark themes
 */
export function getDarkThemes(): TerminalThemeConfig[] {
  return TERMINAL_THEMES.filter((t) => t.isDark);
}

/**
 * Get all light themes
 */
export function getLightThemes(): TerminalThemeConfig[] {
  return TERMINAL_THEMES.filter((t) => !t.isDark);
}

/**
 * Create custom theme by extending base theme
 */
export function createCustomTheme(
  baseThemeId: string,
  overrides: Partial<ITheme>
): ITheme {
  const baseTheme = getTheme(baseThemeId);
  return { ...baseTheme, ...overrides };
}

/**
 * Refresh default theme from CSS variables
 * Call this when app theme changes
 */
export function refreshDefaultTheme(): ITheme {
  return {
    cursor: getCssVar('--recoder-elements-terminal-cursorColor') || '#f8f8f2',
    cursorAccent: getCssVar('--recoder-elements-terminal-cursorColorAccent') || '#000000',
    foreground: getCssVar('--recoder-elements-terminal-textColor') || '#f8f8f2',
    background: getCssVar('--recoder-elements-terminal-backgroundColor') || '#1e1e2e',
    selectionBackground: getCssVar('--recoder-elements-terminal-selection-backgroundColor') || '#44475a',
    selectionForeground: getCssVar('--recoder-elements-terminal-selection-textColor') || '#f8f8f2',
    selectionInactiveBackground: getCssVar('--recoder-elements-terminal-selection-backgroundColorInactive') || '#3d3d5c',
    black: getCssVar('--recoder-elements-terminal-color-black') || '#21222c',
    red: getCssVar('--recoder-elements-terminal-color-red') || '#ff5555',
    green: getCssVar('--recoder-elements-terminal-color-green') || '#50fa7b',
    yellow: getCssVar('--recoder-elements-terminal-color-yellow') || '#f1fa8c',
    blue: getCssVar('--recoder-elements-terminal-color-blue') || '#bd93f9',
    magenta: getCssVar('--recoder-elements-terminal-color-magenta') || '#ff79c6',
    cyan: getCssVar('--recoder-elements-terminal-color-cyan') || '#8be9fd',
    white: getCssVar('--recoder-elements-terminal-color-white') || '#f8f8f2',
    brightBlack: getCssVar('--recoder-elements-terminal-color-brightBlack') || '#6272a4',
    brightRed: getCssVar('--recoder-elements-terminal-color-brightRed') || '#ff6e6e',
    brightGreen: getCssVar('--recoder-elements-terminal-color-brightGreen') || '#69ff94',
    brightYellow: getCssVar('--recoder-elements-terminal-color-brightYellow') || '#ffffa5',
    brightBlue: getCssVar('--recoder-elements-terminal-color-brightBlue') || '#d6acff',
    brightMagenta: getCssVar('--recoder-elements-terminal-color-brightMagenta') || '#ff92df',
    brightCyan: getCssVar('--recoder-elements-terminal-color-brightCyan') || '#a4ffff',
    brightWhite: getCssVar('--recoder-elements-terminal-color-brightWhite') || '#ffffff',
  };
}
