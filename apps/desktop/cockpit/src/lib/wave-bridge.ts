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
