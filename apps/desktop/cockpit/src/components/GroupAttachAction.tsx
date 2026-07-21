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
import { api, ApiError } from '../lib/api';
import { deliveryGateReason } from '../lib/conductor-health-state';
import type { GroupAttachHint } from '../types';

interface GroupAttachActionProps {
  /** The parallel-run group key (context only; the attach is by session name). */
  taskGroup: string;
  /** READ-ONLY attach hint enriched onto the compare view; absent ⇒ hidden. */
  grid?: GroupAttachHint | null;
  /** Notify the parent that control-plane state may have changed. */
  onChanged: () => void;
}

/**
 * Outcome of the GOVERNED "arrange side-by-side" write. Every non-idle state is a
 * truthful reflection of what the backend actually did — a governance deny, a
 * degraded no-grid, or a bridge refusal — never a faked success.
 */
type ArrangeState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'degraded' }
  | { kind: 'error'; message: string };

function describeArrangeError(err: unknown): string {
  if (err instanceof ApiError) return `${err.message} (${err.status})`;
  return err instanceof Error ? err.message : String(err);
}

export function GroupAttachAction({ taskGroup, grid, onChanged }: GroupAttachActionProps) {
  const [failure, setFailure] = useState<string | null>(null);
  const [arrange, setArrange] = useState<ArrangeState>({ kind: 'idle' });
  const sessions = grid?.visibleSessions ?? [];
  // Degrade-safe: no honest hint (console absent / <2 worktrees / tmux fault) ⇒
  // no affordance at all, never a broken or fabricated button.
  if (!grid || sessions.length === 0) {
    return null;
  }

  const bridged = hasWaveTerminalBridge();
  const busy = arrange.kind === 'busy';
  const openTitle = bridged
    ? `Open all ${sessions.length} session${sessions.length === 1 ? '' : 's'} in this group as terminal blocks`
    : NO_TERMINAL_BRIDGE_HINT;
  const arrangeTitle = bridged
    ? 'Arrange every worktree in this group side-by-side in one terminal window'
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

  async function arrangeSideBySide(): Promise<void> {
    setArrange({ kind: 'busy' });
    try {
      const { grid: arrangement } = await api.arrangeCompareGrid(taskGroup);
      if (!arrangement) {
        // Degrade-truthful: the backend could not build an honest arrangement
        // (console absent / <2 real worktrees) — say so, attach nothing.
        setArrange({ kind: 'degraded' });
        return;
      }
      // The arrangement is a single real operator session laying out one pane per
      // sibling worktree — open it with the SAME bridge seam as everything else.
      const opened = openWorkspaceTerminal({ sessionName: arrangement.sessionName });
      setArrange(
        opened
          ? { kind: 'idle' }
          : { kind: 'error', message: "Couldn't hand the arranged session to the terminal host." },
      );
      onChanged();
    } catch (err) {
      // The grid write has NO awaiting_approval / 409 path: a governance deny is a
      // hard 403 (AUTHZ_PROJECT_ACCESS_DENIED). Branch on it directly — NOT via
      // deliveryGateFromError, which only recognizes the 409 PR/merge gate and
      // would silently drop this into the generic-error path.
      if (err instanceof ApiError && err.status === 403) {
        setArrange({ kind: 'blocked', reason: deliveryGateReason(err) });
        return;
      }
      setArrange({ kind: 'error', message: describeArrangeError(err) });
    }
  }

  return (
    <span class="group-attach">
      <button
        type="button"
        class="btn btn-sm group-attach-btn"
        disabled={!bridged}
        title={openTitle}
        onClick={openAll}
      >
        Open all in terminal
      </button>
      <button
        type="button"
        class="btn btn-sm group-attach-arrange"
        disabled={!bridged || busy}
        title={arrangeTitle}
        onClick={() => void arrangeSideBySide()}
      >
        {busy ? 'Arranging…' : 'Arrange side-by-side'}
      </button>
      {failure && (
        <span class="group-attach-error" title={failure}>
          {failure}
        </span>
      )}
      {arrange.kind === 'blocked' && (
        <span class="group-attach-blocked" title={arrange.reason}>
          Blocked by governance — {arrange.reason}
        </span>
      )}
      {arrange.kind === 'degraded' && (
        <span class="group-attach-note">
          Couldn’t arrange side-by-side — no grouped worktrees to lay out right now.
        </span>
      )}
      {arrange.kind === 'error' && (
        <span class="group-attach-error" title={arrange.message}>
          {arrange.message}
        </span>
      )}
    </span>
  );
}
