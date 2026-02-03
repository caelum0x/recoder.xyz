/**
 * Terminal Types
 * Type definitions for the enhanced terminal system
 */

import type { ITheme } from '@xterm/xterm';

// Terminal instance state
export interface TerminalInstance {
  id: string;
  name: string;
  projectId: string;
  isConnected: boolean;
  isCommandRunning: boolean;
  createdAt: number;
  lastActive: number;
}

// Terminal theme configuration
export interface TerminalThemeConfig {
  id: string;
  name: string;
  theme: ITheme;
  isDark: boolean;
}

// Terminal settings
export interface TerminalSettings {
  fontSize: number;
  fontFamily: string;
  cursorBlink: boolean;
  cursorStyle: 'block' | 'underline' | 'bar';
  scrollback: number;
  bellSound: boolean;
  wordSeparator: string;
  theme: string; // Theme ID
  quickCommands: QuickCommand[];
}

// Quick command definition
export interface QuickCommand {
  id: string;
  label: string;
  command: string;
  icon?: string;
  color?: string;
  description?: string;
  category?: string;
  keyboard?: string; // Keyboard shortcut
}

// Command history entry
export interface CommandHistoryEntry {
  command: string;
  timestamp: number;
  projectId: string;
  exitCode?: number;
  duration?: number;
}

// Terminal search options
export interface TerminalSearchOptions {
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
}

// Terminal search result
export interface TerminalSearchResult {
  line: number;
  startColumn: number;
  endColumn: number;
  text: string;
}

// Terminal resize event
export interface TerminalResizeEvent {
  cols: number;
  rows: number;
}

// Terminal output event
export interface TerminalOutputEvent {
  terminalId: string;
  data: string;
  timestamp: number;
}

// Terminal connection status
export type TerminalConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

// Terminal split direction
export type TerminalSplitDirection = 'horizontal' | 'vertical' | 'none';

// Terminal panel state
export interface TerminalPanelState {
  terminals: TerminalInstance[];
  activeTerminalId: string | null;
  splitDirection: TerminalSplitDirection;
  splitRatio: number;
  panelHeight: number;
  isMaximized: boolean;
  isMinimized: boolean;
}

// Terminal manager actions
export type TerminalManagerAction =
  | { type: 'ADD_TERMINAL'; payload: TerminalInstance }
  | { type: 'REMOVE_TERMINAL'; payload: string }
  | { type: 'SET_ACTIVE'; payload: string }
  | { type: 'UPDATE_TERMINAL'; payload: Partial<TerminalInstance> & { id: string } }
  | { type: 'SET_SPLIT'; payload: { direction: TerminalSplitDirection; ratio?: number } }
  | { type: 'SET_PANEL_HEIGHT'; payload: number }
  | { type: 'TOGGLE_MAXIMIZE' }
  | { type: 'TOGGLE_MINIMIZE' }
  | { type: 'RESET' };

// Default terminal settings
export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  fontSize: 13,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 10000,
  bellSound: false,
  wordSeparator: ' ()[]{}\',"`',
  theme: 'default',
  quickCommands: [],
};

// Minimum/maximum constraints
export const TERMINAL_CONSTRAINTS = {
  minFontSize: 8,
  maxFontSize: 24,
  minScrollback: 100,
  maxScrollback: 100000,
  minPanelHeight: 100,
  maxPanelHeight: 800,
  maxTerminals: 5,
};
