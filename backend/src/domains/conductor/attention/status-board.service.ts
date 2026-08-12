/**
 * `StatusBoardService` — the LIVE native STATUS BOARD (LOOM-ROADMAP.md build-now #5):
 * a kanban of ALL the caller's live Loom panes, projected from ONE `session.snapshot`
 * into COLUMNS keyed by {@link AttentionState}. Unlike the taskGroup-scoped cockpit
 * (build-now #1), this is a whole-fleet view — every pane the caller owns, wherever it
 * runs — so a human can see "who needs me / who is working / who is done" at a glance.
 *
 * It is a PULL read (one snapshot per call), NOT the push queue of build-now #4: it opens
 * the SAME shipped Loom socket path the substrate uses (a second CLIENT over the daemon,
 * never a second daemon), reads `session.snapshot` ONCE (which returns every pane's native
 * status together), and folds each pane through the SHIPPED classifier chain
 * (`mapLoomStatus` → `nativeAttention` → `classifyAttention` with a `running` input) — it
 * reimplements NONE of the attention mapping.
 *
 * Attribution is AUTHORITATIVE-RECORD-FIRST + INJECTED ({@link StatusBoardDeps}):
 *  - `loadPanes()` gives each pane's `{ paneId, workspaceId, nativeStatus }` (bind to Loom
 *    `session.snapshot`; Loom stored the Recoder workspace id at `worktree.create`);
 *  - `getWorkspace()` supplies the DURABLE kind / owner / task group from the Recoder
 *    record — never the prompt-injectable pane text.
 * A pane the service cannot attribute to a known Recoder workspace (record missing) — or
 * one not owned by / not in the requested scope — is DROPPED, never guessed into a column.
 *
 * TRUTHFULNESS INVARIANT (adversarially reviewed):
 *  - `'unknown'`-status panes go in the `unknown` COLUMN (shown, truthful) — NEVER folded
 *    into `agent_idle_prompt`/`review_ready`, so they are never miscounted as settled/ready.
 *  - Every column total is the real length of its column; the board fabricates no counts.
 *  - A dead/unavailable snapshot returns `degraded:true` + a `reason` with EMPTY columns +
 *    zero totals — never a fake "all clear" empty board.
 *  - `nativeStatus` carries the RAW Loom `AgentStatus` STRING per pane (idle/working/blocked/
 *    done/unknown), NOT a boolean: the caller distinguishes a native-signalled pane from a
 *    no-signal one by the string, and `'unknown'` means Loom had no native signal.
 */
import type { AgentStatus } from '@recoder/agent-runtimes/loom';
import type { Workspace, WorkspaceState } from '@recoder/agent-os';
import type { LoggerPort } from '@recoder/substrate';
import type { AttentionState } from '../types.js';
import { mapLoomStatus } from './loom-state.js';
import { classifyAttention } from './attention-classifier.js';

/**
 * The board columns, in a stable left→right reading order (most-urgent first, `unknown`
 * last). Every {@link AttentionState} is a column so the board shape is fixed regardless of
 * which states are currently populated — a caller renders empty columns truthfully.
 */
export const STATUS_BOARD_COLUMNS: readonly AttentionState[] = [
  'awaiting_approval',
  'agent_idle_prompt',
  'review_ready',
  'working',
  'error',
  'unknown',
];

// --- injected seams ----------------------------------------------------------

/** One live Loom pane read out of `session.snapshot` — pane + its owning workspace + status. */
export interface StatusBoardPane {
  /** The Loom pane id (uniqueness/logging; not surfaced in the cell). */
  readonly paneId: string;
  /** The Recoder workspace id Loom stored for this pane at `worktree.create`. */
  readonly workspaceId: string;
  /** The RAW Loom `AgentStatus` this pane currently reports (the native signal). */
  readonly nativeStatus: AgentStatus;
}

/**
 * The injected reads the board composes. In production the module binds `loadPanes` to Loom
 * `session.snapshot` (over the EXISTING daemon socket) and `getWorkspace` to the conductor's
 * durable record read; tests bind fakes. NEITHER reimplements the attention mapping.
 */
export interface StatusBoardDeps {
  /** Read ONE Loom `session.snapshot` → every live pane's native status. */
  loadPanes(): Promise<readonly StatusBoardPane[]>;
  /** Fetch the durable Recoder workspace record (kind/owner/taskGroup), or `null`. */
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  /** Structured logger; defaults to a no-op. */
  readonly logger?: LoggerPort;
}

// --- projection view models --------------------------------------------------

/** The scope a board read is narrowed to — owner and/or a shared parallel-run group. */
export interface StatusBoardScope {
  /** Restrict to panes owned by this user id (a non-privileged caller is pinned to its own). */
  readonly owner?: string;
  /** Restrict to panes in this shared parallel-run group. */
  readonly taskGroup?: string | null;
}

/** One pane on the board — attributed to its Recoder workspace, with its RAW native status. */
export interface StatusBoardCell {
  /** The Recoder workspace this pane belongs to. */
  readonly workspaceId: string;
  /** The agent kind / runtime that ran this pane (e.g. `claude`), from the durable record. */
  readonly agentKind: string;
  /** The shared parallel-run group — PRESENT only when the pane belongs to one. */
  readonly taskGroup?: string;
  /**
   * The RAW Loom `AgentStatus` STRING (idle/working/blocked/done/unknown), NOT a boolean.
   * The caller distinguishes a native-signalled pane from a no-signal one by the string;
   * `'unknown'` means Loom reported no native signal for this pane.
   */
  readonly nativeStatus: AgentStatus;
}

/** The one authoritative status-board projection a caller reads — a PURE fold per call. */
export interface StatusBoardSnapshot {
  /** The scope this projection was narrowed to (echoed back). */
  readonly scope: StatusBoardScope;
  /** Every attributed pane, bucketed by its classified {@link AttentionState}. */
  readonly columns: Record<AttentionState, readonly StatusBoardCell[]>;
  /** The pane count PER column — the real length of each column, never fabricated. */
  readonly totals: Record<AttentionState, number>;
  /** Total attributed panes in scope (the sum of every column). */
  readonly total: number;
  /** True when the snapshot source could not be read — columns are EMPTY + a `reason`. */
  readonly degraded: boolean;
  /** Why the board degraded (snapshot source down / fault). Absent when live. */
  readonly reason?: string;
}

// --- internals ---------------------------------------------------------------

const NOOP_LOGGER: LoggerPort = { info() {}, warn() {}, error() {} };

/** A live Loom pane is a `running` workspace as far as the classifier is concerned. */
const RUNNING_STATE = 'running' as WorkspaceState;

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Read the shared parallel-run group off a workspace record, or `null` when ungrouped. */
function readTaskGroup(workspace: Workspace): string | null {
  const meta = workspace.metadata as Record<string, unknown> | undefined;
  const group = meta?.taskGroup;
  return typeof group === 'string' && group.length > 0 ? group : null;
}

/** A fresh column map with every {@link AttentionState} present and empty. */
function emptyColumns(): Record<AttentionState, StatusBoardCell[]> {
  const columns = {} as Record<AttentionState, StatusBoardCell[]>;
  for (const state of STATUS_BOARD_COLUMNS) columns[state] = [];
  return columns;
}

/** Count every column truthfully — the real length of each bucket. */
function countColumns(
  columns: Record<AttentionState, readonly StatusBoardCell[]>
): Record<AttentionState, number> {
  const totals = {} as Record<AttentionState, number>;
  for (const state of STATUS_BOARD_COLUMNS) totals[state] = columns[state].length;
  return totals;
}

/**
 * Produce the LIVE native status board. Construct once (the seams close over the Loom
 * socket + the durable record read); {@link snapshot} pulls ONE `session.snapshot` per call
 * and folds it into truthful columns — the seams are always the source of truth.
 */
export class StatusBoardService {
  private readonly deps: StatusBoardDeps;
  private readonly logger: LoggerPort;

  constructor(deps: StatusBoardDeps) {
    this.deps = deps;
    this.logger = deps.logger ?? NOOP_LOGGER;
  }

  /**
   * Read the truthful board for a scope. Each attributed pane is bucketed by its classified
   * {@link AttentionState}; a pane with no known Recoder record — or outside the requested
   * owner/task-group scope — is DROPPED (never guessed). A snapshot-source fault DEGRADES to
   * empty columns + a `reason`, never a fabricated all-clear board.
   */
  async snapshot(scope: StatusBoardScope = {}): Promise<StatusBoardSnapshot> {
    let panes: readonly StatusBoardPane[];
    try {
      panes = await this.deps.loadPanes();
    } catch (err) {
      // Cannot read the snapshot source — a fully truthful degraded board (never a fake empty).
      return this.degraded(scope, `session.snapshot unavailable: ${message(err)}`);
    }

    const columns = emptyColumns();
    let total = 0;
    for (const pane of panes) {
      const placed = await this.attribute(pane, scope);
      if (placed == null) continue; // unattributable / out-of-scope — dropped, never guessed
      columns[placed.attention].push(placed.cell);
      total += 1;
    }

    return {
      scope,
      columns,
      totals: countColumns(columns),
      total,
      degraded: false,
    };
  }

  /**
   * Attribute ONE pane to a Recoder workspace and classify it, or return `null` to DROP it
   * (record missing / out of scope / lookup fault). The classification runs the SHIPPED
   * chain (`mapLoomStatus` → `nativeAttention` → `classifyAttention`) — never a re-mapping.
   */
  private async attribute(
    pane: StatusBoardPane,
    scope: StatusBoardScope
  ): Promise<{ attention: AttentionState; cell: StatusBoardCell } | null> {
    let workspace: Workspace | null;
    try {
      workspace = await this.deps.getWorkspace(pane.workspaceId);
    } catch (err) {
      // A per-pane record fault drops THIS pane only — it is never guessed into a column.
      this.logger.warn('status board: workspace lookup failed (pane dropped)', {
        paneId: pane.paneId,
        workspaceId: pane.workspaceId,
        err: message(err),
      });
      return null;
    }
    if (workspace == null) return null; // not a known Recoder workspace — dropped, never guessed

    // OWNER SCOPE: a pane the caller does not own is not on the caller's board (never guessed in).
    if (scope.owner != null && workspace.createdBy !== scope.owner) return null;

    const taskGroup = readTaskGroup(workspace);
    if (scope.taskGroup != null && taskGroup !== scope.taskGroup) return null;

    // Map the RAW native status through the shipped classifier: a definite native signal
    // wins; `'unknown'` (Loom had no signal) yields a truthful `unknown` — never faked idle.
    const nativeAttention = mapLoomStatus(pane.nativeStatus);
    const { attention } = classifyAttention({
      state: RUNNING_STATE,
      nativeAttention,
    });

    const cell: StatusBoardCell = {
      workspaceId: pane.workspaceId,
      agentKind: workspace.runtimeId,
      ...(taskGroup ? { taskGroup } : {}),
      nativeStatus: pane.nativeStatus,
    };
    return { attention, cell };
  }

  /** A truthful DEGRADED board — empty columns + zero totals + a `reason`, never fabricated. */
  private degraded(scope: StatusBoardScope, reason: string): StatusBoardSnapshot {
    const columns = emptyColumns();
    return {
      scope,
      columns,
      totals: countColumns(columns),
      total: 0,
      degraded: true,
      reason,
    };
  }
}
