/**
 * Typed accessor for the Electron node-pty bridge exposed by preload.js on
 * window.recoderDesktop. When the cockpit runs inside the Electron shell this is
 * present and we can drive a REAL local terminal (spawnTerminal / terminalWrite /
 * terminalResize / terminalKill / onTerminalData / onTerminalExit). When the
 * cockpit is opened standalone in a browser it is undefined, and callers fall
 * back to the truthful HTTP /sessions output surface instead.
 *
 * This file invents nothing: it only re-describes the IPC surface preload.js
 * actually exposes, so the renderer can use it type-safely.
 */

export interface SpawnTerminalOptions {
  /** Shell/command to run. Defaults to the user's login shell in the main process. */
  shell?: string;
  /** Command to run in the pty (e.g. the resolved tmux binary). */
  command?: string;
  /** Arguments for the command (e.g. ['attach', '-t', '<session>']). */
  args?: string[];
  /** Working directory for the spawned pty. */
  cwd?: string;
  /** Initial column count. */
  cols?: number;
  /** Initial row count. */
  rows?: number;
  /** Extra environment variables merged into the pty environment (allowlisted in main). */
  env?: Record<string, string>;
}

/**
 * Result of spawning a pty. `ptyUnavailable` is true when the main process has
 * no real TTY (node-pty failed to load/spawn) — callers must NOT show an
 * embedded terminal then; fall back to the HTTP /sessions surface truthfully.
 */
export interface SpawnTerminalResult {
  id: string;
  success: boolean;
  ptyUnavailable?: boolean;
}

export interface TerminalDataMessage {
  id: string;
  data: string;
}

export interface TerminalExitMessage {
  id: string;
  exitCode?: number;
  signal?: number;
}

/** Result of the native open-file dialog (preload `openFile`); null when cancelled. */
export interface OpenFileResult {
  path: string;
  content: string;
}

export interface RecoderDesktopBridge {
  platform: string;
  isDesktop: boolean;
  version: string;
  /** Native folder picker. Resolves to the chosen absolute path, or null if cancelled. */
  openFolder: () => Promise<string | null>;
  /** Native file picker. Resolves to { path, content }, or null if cancelled. */
  openFile: () => Promise<OpenFileResult | null>;
  spawnTerminal: (
    options?: SpawnTerminalOptions,
  ) => Promise<SpawnTerminalResult | { id: string } | string>;
  terminalWrite: (id: string, data: string) => Promise<unknown>;
  terminalResize: (id: string, cols: number, rows: number) => Promise<unknown>;
  terminalKill: (id: string) => Promise<unknown>;
  onTerminalData: (cb: (msg: TerminalDataMessage) => void) => () => void;
  onTerminalExit: (cb: (msg: TerminalExitMessage) => void) => () => void;
  /** Open a macOS System Settings privacy pane. macOS only. */
  openSystemSettings?: (pane: string) => Promise<{ ok: boolean; reason?: string }>;
}

/**
 * The focused, session-oriented terminal bridge (window.recoderTerminal). A
 * minimal surface over the same terminal:* IPC channels, shaped around a single
 * embedded terminal: open() spawns and tracks the pty; write/resize/close act on
 * it. Mirrors what preload.js exposes — invents nothing.
 */
export interface RecoderTerminalBridge {
  open: (options: SpawnTerminalOptions) => Promise<SpawnTerminalResult>;
  write: (data: string, id?: string) => Promise<unknown>;
  resize: (cols: number, rows: number, id?: string) => Promise<unknown>;
  close: (id?: string) => Promise<unknown>;
  onData: (cb: (msg: TerminalDataMessage) => void) => () => void;
  onExit: (cb: (msg: TerminalExitMessage) => void) => () => void;
}

declare global {
  interface Window {
    recoderDesktop?: RecoderDesktopBridge;
    recoderTerminal?: RecoderTerminalBridge;
  }
}

/** The desktop bridge if we are running inside Electron with a terminal pty, else null. */
export function getDesktopBridge(): RecoderDesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.recoderDesktop;
  if (!bridge || typeof bridge.spawnTerminal !== 'function') return null;
  return bridge;
}

/** True when a real local node-pty terminal is available via the Electron shell. */
export function hasLocalTerminal(): boolean {
  return getDesktopBridge() !== null;
}

/** The desktop platform ('darwin' | 'win32' | 'linux'), or '' outside Electron. */
export function desktopPlatform(): string {
  if (typeof window === 'undefined') return '';
  return window.recoderDesktop?.platform ?? '';
}

/** Open a macOS System Settings privacy pane; resolves false when unavailable. */
export async function openSystemSettings(pane: string): Promise<boolean> {
  const bridge = typeof window !== 'undefined' ? window.recoderDesktop : undefined;
  if (!bridge?.openSystemSettings) return false;
  try {
    const result = await bridge.openSystemSettings(pane);
    return Boolean(result?.ok);
  } catch {
    return false;
  }
}

/** Normalize the spawn result — preload may return a bare id string or { id }. */
export function spawnedTerminalId(result: { id: string } | string): string {
  return typeof result === 'string' ? result : result.id;
}

/** True when the Electron shell exposes the native folder picker. */
export function hasFolderPicker(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof window.recoderDesktop?.openFolder === 'function';
}

/**
 * Pure: extract a usable absolute path from whatever the folder picker resolved.
 *
 * The preload `openFolder` resolves to a string path or null (cancelled). Some
 * shells may instead return an `{ path }`/`{ filePath }` object. Anything else
 * (cancel, empty, malformed) yields null — never a fabricated path.
 */
export function pickedFolderPath(result: unknown): string | null {
  if (typeof result === 'string') {
    const trimmed = result.trim();
    return trimmed ? trimmed : null;
  }
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    const candidate = obj.path ?? obj.filePath;
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return null;
}

/**
 * Open the native folder picker and resolve to the chosen absolute path.
 * Returns null when the bridge is absent (plain browser) or the dialog is
 * cancelled — the caller then falls back to the manual text input truthfully.
 */
export async function chooseFolder(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const open = window.recoderDesktop?.openFolder;
  if (typeof open !== 'function') return null;
  const result = await open();
  return pickedFolderPath(result);
}
