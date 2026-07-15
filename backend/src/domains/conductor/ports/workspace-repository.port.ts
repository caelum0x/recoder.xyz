/**
 * WorkspaceRepositoryPort — the conductor's control-plane persistence seam.
 *
 * The base contract (Workspace / TaskRun / RunEvent / TaskSpec upserts + reads)
 * is REUSED verbatim from `@recoder/substrate` — canonical state lives in
 * `@recoder/agent-os` and is reached ONLY through this port; the engine never
 * owns canonical state and the persist-record-BEFORE-launch ordering is enforced
 * by the engine calling `upsertWorkspace` first.
 *
 * This domain EXTENDS that base with the two NEW tables it owns
 * (`conductor_run_tails`, `conductor_reconcile_findings`, migrations 0002/0003):
 * a persisted tail cursor so tailing resumes after a restart without re-emitting
 * seen output, and the truthful reconcile-findings audit trail. The impl lives in
 * `domains/persistence` behind the `QueryExecutor` (parameterized `:param` SQL);
 * tests inject an in-memory fake. Interface only.
 */
import type { WorkspaceRepositoryPort as SubstrateWorkspaceRepositoryPort } from '@recoder/substrate';
import type { ReconcileFindingKind, ReconcileFindingView } from '../types.js';

/** A persisted tail cursor row (mirror of `conductor_run_tails`). */
export interface RunTailCursor {
  readonly workspaceId: string;
  readonly runId: string;
  /** Byte/line offset the tailer last read (resume point after restart). */
  readonly lastOffset: number;
  /** Hash of the last capture, to dedupe an identical re-capture. */
  readonly lastCaptureHash?: string;
  /** Terminal exit code once finished; `undefined` = unknown (NEVER fabricated 0). */
  readonly exitCode?: number | null;
  readonly finished: boolean;
  readonly updatedAt: string;
}

/** Input to upsert a tail cursor (partial columns; server stamps `updatedAt`). */
export interface PersistRunTailInput {
  readonly workspaceId: string;
  readonly runId: string;
  readonly lastOffset: number;
  readonly lastCaptureHash?: string;
  readonly exitCode?: number | null;
  readonly finished?: boolean;
}

/** A reconcile finding row to persist (mirror of `conductor_reconcile_findings`). */
export interface PersistReconcileFindingInput {
  readonly findingId: string;
  readonly workspaceId?: string;
  readonly kind: ReconcileFindingKind;
  readonly sessionName?: string;
  readonly worktreePath?: string;
  readonly detail?: Record<string, unknown>;
}

/**
 * The full repository port the conductor domain depends on: the substrate base
 * (canonical Workspace/Run/Event/Task) PLUS conductor-owned tail-cursor and
 * reconcile-finding persistence.
 */
export interface WorkspaceRepositoryPort extends SubstrateWorkspaceRepositoryPort {
  // --- conductor_run_tails (restart-survivable tailing) ---
  /** Insert-or-update the tail cursor for a workspace; returns the stored row. */
  persistTailCursor(input: PersistRunTailInput): Promise<RunTailCursor>;
  /** Read the tail cursor for a workspace, or `null` if tailing never persisted. */
  getTailCursor(workspaceId: string): Promise<RunTailCursor | null>;

  // --- conductor_reconcile_findings (truthful orphan audit) ---
  /** Append a reconcile finding observed at boot (never auto-resolves live work). */
  recordReconcileFinding(input: PersistReconcileFindingInput): Promise<void>;
  /** List findings, optionally scoped to one workspace, for operator/policy review. */
  listReconcileFindings(workspaceId?: string): Promise<readonly ReconcileFindingView[]>;
}
