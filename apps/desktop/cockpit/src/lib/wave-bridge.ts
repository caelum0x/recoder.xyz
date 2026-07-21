/**
 * wave-bridge — cockpit → wave-host seam for "open workspace as terminal block".
 *
 * When the cockpit runs inside a wave <webview>, the webview preload
 * (apps/desktop/app/emain/preload-webview.ts) exposes
 * `window.__RECODER_COCKPIT__.openWorkspaceTerminal(payload)`, which forwards
 * the request to the host via `ipcRenderer.sendToHost`. The wave host then
 * validates the guest origin + payload and creates a real term block running
 * the conductor-pinned `tmux attach-session -t <sessionName>`.
 *
 * In a plain browser (or an older shell) the bridge function is absent and
 * every call is a truthful no-op returning false — callers can use
 * hasWaveTerminalBridge() to decide whether to render the action at all.
 */

/**
 * Shown on a disabled terminal-attach affordance when the cockpit runs outside
 * the desktop app (plain browser / old shell) and the wave bridge is absent.
 * Canonical home is here — next to hasWaveTerminalBridge/openWorkspaceTerminal —
 * so both the per-workspace button and the group-attach action share one string
 * without either reaching across to a sibling component.
 */
export const NO_TERMINAL_BRIDGE_HINT =
  'Open the Recoder desktop app to use the terminal — this browser has no terminal bridge.';

export interface OpenWorkspaceTerminalRequest {
  /** Conductor tmux session name (workspace.sessionName). */
  sessionName: string;
  /** Worktree path used as the terminal block's cwd. */
  cwd?: string;
}

// Typed structurally (not via the CockpitConfig global declaration) so this
// module stays decoupled from the shell-config typing owned by lib/config.ts.
interface WaveTerminalBridge {
  openWorkspaceTerminal?: (payload: OpenWorkspaceTerminalRequest) => void;
}

function getBridge(): WaveTerminalBridge | undefined {
  return (globalThis as { __RECODER_COCKPIT__?: WaveTerminalBridge })
    .__RECODER_COCKPIT__;
}

/** True only when the wave shell exposed the open-terminal function. */
export function hasWaveTerminalBridge(): boolean {
  return typeof getBridge()?.openWorkspaceTerminal === 'function';
}

/**
 * Ask the wave host to open the workspace's tmux session as a terminal block.
 * Returns true when the request was handed to the bridge, false when the
 * bridge is unavailable, the payload is unusable, or the bridge call threw.
 */
export function openWorkspaceTerminal(
  request: OpenWorkspaceTerminalRequest
): boolean {
  const sessionName = (request?.sessionName ?? '').trim();
  if (sessionName === '') {
    return false;
  }
  const bridgeFn = getBridge()?.openWorkspaceTerminal;
  if (typeof bridgeFn !== 'function') {
    return false;
  }
  const cwd =
    typeof request.cwd === 'string' && request.cwd.trim() !== ''
      ? request.cwd
      : undefined;
  try {
    bridgeFn(cwd === undefined ? { sessionName } : { sessionName, cwd });
    return true;
  } catch {
    return false;
  }
}
