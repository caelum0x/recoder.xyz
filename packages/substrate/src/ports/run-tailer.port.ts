/**
 * RunTailerPort — the engine→run-tailer attach seam (design §4.7 / §7).
 *
 * After a workspace reaches `running` the engine attaches the run-tailer so the
 * agent's terminal output streams into the RunEvent log. Reconcile re-attaches
 * it for a surviving live workspace after a backend restart (idempotent per
 * workspace). The engine reaches the tailer through this port so it stays free
 * of the concrete polling/registry machinery (which lives in observe/ and is
 * wired by the backend with the registered substrate + repository sink).
 *
 * The backend injects the `run-tailer.startRunTail` adapter; tests inject a
 * recording fake. Interface only.
 */
import type { WorkspaceSubstrate } from '@recoder/agent-os';

export interface RunTailAttachInput {
  workspaceId: string;
  taskId: string;
  runId: string;
  /** Execution substrate hosting the agent (selects capture/alive impl). */
  substrate: WorkspaceSubstrate;
  /** Session/handle ref hosting the agent (e.g. tmux session name). */
  sessionName: string;
  worktreePath?: string;
}

export interface RunTailerPort {
  /** Begin (or, idempotently, resume) tailing a run's terminal output. */
  start(input: RunTailAttachInput): void;
}
