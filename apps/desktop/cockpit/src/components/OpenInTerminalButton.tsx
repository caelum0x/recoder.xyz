/**
 * OpenInTerminalButton — the single "Open in terminal" affordance that replaced
 * the retired in-cockpit terminal surfaces (wave-desktop fusion §5).
 *
 * The cockpit no longer embeds xterm/node-pty terminals; the wave host owns
 * them. This button asks the wave host — via the lib/wave-bridge seam
 * (`window.__RECODER_COCKPIT__.openWorkspaceTerminal`, injected by the webview
 * preload) — to open the workspace's live tmux session as a real terminal block.
 *
 * Truthful states, never fake:
 *  - no bridge (plain browser / old shell) → disabled with the "open the
 *    desktop app" hint;
 *  - no tmux session on the workspace yet → disabled with "no session yet";
 *  - the bridge refuses/throws → a truthful inline note next to the button.
 */
import { useState } from 'preact/hooks';
import { hasWaveTerminalBridge, openWorkspaceTerminal } from '../lib/wave-bridge';
import type { Workspace } from '../types';

/** Shown on the disabled affordance when the cockpit runs outside the desktop app. */
export const NO_TERMINAL_BRIDGE_HINT =
  'Open the Recoder desktop app to use the terminal — this browser has no terminal bridge.';

interface OpenInTerminalButtonProps {
  workspace: Workspace;
}

export function OpenInTerminalButton({ workspace }: OpenInTerminalButtonProps) {
  const [failure, setFailure] = useState<string | null>(null);
  const bridged = hasWaveTerminalBridge();
  const sessionName = workspace.sessionName;
  const disabled = !bridged || !sessionName;
  const title = !bridged
    ? NO_TERMINAL_BRIDGE_HINT
    : !sessionName
      ? 'No agent session attached to this workspace yet.'
      : `Open ${sessionName} as a terminal block in this window`;

  function open() {
    if (!sessionName) return;
    const handed = openWorkspaceTerminal({
      sessionName,
      cwd: workspace.worktreePath || undefined,
    });
    // The bridge is fire-and-forget; `false` means it truthfully refused
    // (missing bridge, unusable payload, or the IPC call threw).
    setFailure(handed ? null : "Couldn't hand this session to the terminal host.");
  }

  return (
    <span class="open-in-terminal">
      <button
        type="button"
        class="btn btn-sm open-in-terminal-btn"
        disabled={disabled}
        title={title}
        onClick={open}
      >
        Open in terminal
      </button>
      {failure && (
        <span class="open-in-terminal-error" title={failure}>
          {failure}
        </span>
      )}
    </span>
  );
}
