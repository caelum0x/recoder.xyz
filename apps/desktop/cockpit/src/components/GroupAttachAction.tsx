/**
 * GroupAttachAction — a single terminal-plain "open all in terminal" affordance
 * for a parallel-run group. Given the READ-ONLY attach hint enriched onto the
 * compare view, it opens each of the group's live worktree sessions as a real
 * terminal block via the SAME lib/wave-bridge seam OpenInTerminalButton uses
 * per-workspace — one attach for the whole parallel run.
 *
 * Terminal-plain + degrade-safe by contract:
 *  - no hint / no visible sessions ⇒ renders NOTHING (no button, no placeholder);
 *  - no wave bridge (plain browser / old shell) ⇒ disabled with the desktop-app
 *    hint, and the click is a no-op;
 *  - a bridge refusal is a truthful inline note, never faked success.
 *
 * It never names the engine that produced the hint: this is a workspaces/attach
 * action ("open all in terminal"), framed around the group's own sessions.
 */
import { useState } from 'preact/hooks';
import {
  hasWaveTerminalBridge,
  openWorkspaceTerminal,
  NO_TERMINAL_BRIDGE_HINT,
} from '../lib/wave-bridge';
import type { GroupAttachHint } from '../types';

interface GroupAttachActionProps {
  /** The parallel-run group key (context only; the attach is by session name). */
  taskGroup: string;
  /** READ-ONLY attach hint enriched onto the compare view; absent ⇒ hidden. */
  grid?: GroupAttachHint | null;
  /** Notify the parent that control-plane state may have changed. */
  onChanged: () => void;
}

export function GroupAttachAction({ grid }: GroupAttachActionProps) {
  const [failure, setFailure] = useState<string | null>(null);
  const sessions = grid?.visibleSessions ?? [];
  // Degrade-safe: no honest hint (console absent / <2 worktrees / tmux fault) ⇒
  // no affordance at all, never a broken or fabricated button.
  if (!grid || sessions.length === 0) {
    return null;
  }

  const bridged = hasWaveTerminalBridge();
  const title = bridged
    ? `Open all ${sessions.length} session${sessions.length === 1 ? '' : 's'} in this group as terminal blocks`
    : NO_TERMINAL_BRIDGE_HINT;

  function openAll() {
    let handedAny = false;
    for (const sessionName of sessions) {
      if (openWorkspaceTerminal({ sessionName })) {
        handedAny = true;
      }
    }
    // The bridge is fire-and-forget; if it handed off none of the sessions it
    // truthfully refused (missing bridge or every IPC call threw).
    setFailure(handedAny ? null : "Couldn't hand this group's sessions to the terminal host.");
  }

  return (
    <span class="group-attach">
      <button
        type="button"
        class="btn btn-sm group-attach-btn"
        disabled={!bridged}
        title={title}
        onClick={openAll}
      >
        Open all in terminal
      </button>
      {failure && (
        <span class="group-attach-error" title={failure}>
          {failure}
        </span>
      )}
    </span>
  );
}
