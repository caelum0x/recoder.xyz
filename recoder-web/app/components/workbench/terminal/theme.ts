import type { ITheme } from '@xterm/xterm';

const style = getComputedStyle(document.documentElement);
const cssVar = (token: string) => style.getPropertyValue(token) || undefined;

export function getTerminalTheme(overrides?: ITheme): ITheme {
  return {
    cursor: cssVar('--recoder-elements-terminal-cursorColor'),
    cursorAccent: cssVar('--recoder-elements-terminal-cursorColorAccent'),
    foreground: cssVar('--recoder-elements-terminal-textColor'),
    background: cssVar('--recoder-elements-terminal-backgroundColor'),
    selectionBackground: cssVar('--recoder-elements-terminal-selection-backgroundColor'),
    selectionForeground: cssVar('--recoder-elements-terminal-selection-textColor'),
    selectionInactiveBackground: cssVar('--recoder-elements-terminal-selection-backgroundColorInactive'),

    // ansi escape code colors
    black: cssVar('--recoder-elements-terminal-color-black'),
    red: cssVar('--recoder-elements-terminal-color-red'),
    green: cssVar('--recoder-elements-terminal-color-green'),
    yellow: cssVar('--recoder-elements-terminal-color-yellow'),
    blue: cssVar('--recoder-elements-terminal-color-blue'),
    magenta: cssVar('--recoder-elements-terminal-color-magenta'),
    cyan: cssVar('--recoder-elements-terminal-color-cyan'),
    white: cssVar('--recoder-elements-terminal-color-white'),
    brightBlack: cssVar('--recoder-elements-terminal-color-brightBlack'),
    brightRed: cssVar('--recoder-elements-terminal-color-brightRed'),
    brightGreen: cssVar('--recoder-elements-terminal-color-brightGreen'),
    brightYellow: cssVar('--recoder-elements-terminal-color-brightYellow'),
    brightBlue: cssVar('--recoder-elements-terminal-color-brightBlue'),
    brightMagenta: cssVar('--recoder-elements-terminal-color-brightMagenta'),
    brightCyan: cssVar('--recoder-elements-terminal-color-brightCyan'),
    brightWhite: cssVar('--recoder-elements-terminal-color-brightWhite'),

    ...overrides,
  };
}
