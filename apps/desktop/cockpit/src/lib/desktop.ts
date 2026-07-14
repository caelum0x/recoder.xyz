/**
 * Typed accessor for the Electron desktop bridge exposed by preload.js on
 * window.recoderDesktop (native pickers, platform info, System Settings).
 *
 * The node-pty terminal surface (spawnTerminal / terminalWrite / terminalResize
 * / terminalKill / onTerminalData / onTerminalExit) was RETIRED with the
 * cockpit's embedded terminals (wave-desktop fusion §5): the wave host owns
 * real terminals now, reached via lib/open-in-terminal.ts.
 *
 * This file invents nothing: it only re-describes the IPC surface preload.js
 * actually exposes (the parts the cockpit still consumes), so the renderer can
 * use it type-safely.
 */

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
  /** Open a macOS System Settings privacy pane. macOS only. */
  openSystemSettings?: (pane: string) => Promise<{ ok: boolean; reason?: string }>;
}

declare global {
  interface Window {
    recoderDesktop?: RecoderDesktopBridge;
  }
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
