/**
 * Multi-agent compare (product F3) — aggregate the sibling workspaces of one
 * parallel-run group for side-by-side review.
 *
 * F3 launches the SAME task with N agents, one isolated worktree per agent, all
 * tagged with a SHARED `taskGroup` (persisted in `Workspace.metadata.taskGroup`
 * by the launch path). This service groups those siblings and, for each, projects
 * the truthful comparison row the cockpit renders: which `agent` ran it, its
 * `diffStat` (files / additions / deletions), its live `outcome` (durable state +
 * attention), and the `runId`.
 *
 * Read-only + degrade-safe throughout: a workspace with no taskGroup is its own
 * singleton group (never invented siblings); a diff that can't be computed (no
 * worktree / substrate fault) yields an ABSENT `diffStat` with a truthful reason,
 * never a fabricated `0/0/0`; a group with no members is a truthful EMPTY view,
 * never an error. No governance gate — nothing here mutates.
 */
import type { Workspace, WorkspaceState } from '@recoder/agent-os';
import type { AttentionState, WorkspaceView } from '../types.js';

/** The metadata key the F3 launch stamps to bind sibling workspaces into one group. */
export const TASK_GROUP_METADATA_KEY = 'taskGroup';

/** A workspace's change footprint against its base ref (files / +lines / -lines). */
export interface DiffStat {
  /** Number of changed files. */
  readonly files: number;
  /** Lines inserted. */
  readonly additions: number;
  /** Lines deleted. */
  readonly deletions: number;
}

/** One agent's row in the side-by-side compare of a parallel-run group. */
export interface SiblingCompareEntry {
  readonly workspaceId: string;
  /** The agent that ran this sibling (the workspace runtimeId) — the compare key. */
  readonly agent: string;
  /** Alias of {@link agent} kept for callers that speak the canonical field name. */
  readonly runtimeId: string;
  /** The most recent run in this workspace, if any. */
  readonly runId?: string;
  readonly branch: string;
  /** Durable lifecycle state (part of the outcome). */
  readonly state: WorkspaceState;
  /** Live attention classification (the other half of the outcome; may be absent). */
  readonly attention?: AttentionState;
  /** Why the attention state was chosen (truthful signal, or the lack of one). */
  readonly attentionReason?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** Change footprint vs base — ABSENT (with a reason) when it can't be computed. */
  readonly diffStat?: DiffStat;
  /** Truthful reason `diffStat` is absent (no worktree, substrate fault, …). */
  readonly diffStatReason?: string;
}

/** The aggregate of one parallel-run group for side-by-side review. */
export interface CompareView {
  /** The shared group key, or `null` when the subject workspace is ungrouped. */
  readonly taskGroup: string | null;
  /** Number of siblings in the group. */
  readonly count: number;
  /** The siblings, sorted oldest-first (stable by workspaceId on a tie). */
  readonly siblings: readonly SiblingCompareEntry[];
}

/** The narrow, injectable seams the compare service reads through (no substrate coupling). */
export interface CompareDeps {
  /** Every workspace record (state of record) — the population to group over. */
  listWorkspaces(): Promise<Workspace[]>;
  /** Fetch one workspace by id, or null. */
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  /** The attention-enriched view (supplies the `outcome`'s attention half). */
  buildView(workspace: Workspace): Promise<WorkspaceView>;
  /**
   * Compute a read-only diff footprint for a workspace. MUST be side-effect free
   * (no state transition) and degrade-safe: an uncomputable diff returns
   * `{ reason }` (no `stat`), never a fabricated stat.
   */
  diffStat(workspace: Workspace): Promise<{ stat?: DiffStat; reason?: string }>;
}

/** Read a workspace's shared group key from its metadata (absent/blank ⇒ undefined). */
export function taskGroupOf(workspace: Workspace): string | undefined {
  const raw = workspace.metadata?.[TASK_GROUP_METADATA_KEY];
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined;
}

/**
 * Parse a `git diff --stat` summary into a {@link DiffStat}. `changedFiles` is the
 * authoritative file count (the substrate already computed it); insertions and
 * deletions are read from the summary line and default to 0 when absent (a diff
 * with only additions has no "deletions(-)" clause, and vice-versa).
 */
export function parseDiffStat(stat: string, changedFiles: number): DiffStat {
  return {
    files: Number.isFinite(changedFiles) && changedFiles > 0 ? Math.trunc(changedFiles) : 0,
    additions: firstIntMatch(stat, /(\d+)\s+insertion/),
    deletions: firstIntMatch(stat, /(\d+)\s+deletion/),
  };
}

function firstIntMatch(source: string, pattern: RegExp): number {
  const match = pattern.exec(source);
  if (!match) return 0;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : 0;
}

/** Oldest-first, stable by workspaceId — a deterministic side-by-side ordering. */
function bySiblingOrder(a: SiblingCompareEntry, b: SiblingCompareEntry): number {
  return a.createdAt.localeCompare(b.createdAt) || a.workspaceId.localeCompare(b.workspaceId);
}

async function buildEntry(deps: CompareDeps, workspace: Workspace): Promise<SiblingCompareEntry> {
  const [view, diff] = await Promise.all([
    safeView(deps, workspace),
    deps.diffStat(workspace),
  ]);
  return {
    workspaceId: workspace.workspaceId,
    agent: workspace.runtimeId,
    runtimeId: workspace.runtimeId,
    ...(workspace.runId ? { runId: workspace.runId } : {}),
    branch: workspace.branch,
    state: workspace.state,
    ...(view?.attention ? { attention: view.attention } : {}),
    ...(view?.attentionReason ? { attentionReason: view.attentionReason } : {}),
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    ...(diff.stat ? { diffStat: diff.stat } : {}),
    ...(diff.reason ? { diffStatReason: diff.reason } : {}),
  };
}

/** The attention view is enrichment, not the record — a fault degrades to no attention. */
async function safeView(deps: CompareDeps, workspace: Workspace): Promise<WorkspaceView | null> {
  try {
    return await deps.buildView(workspace);
  } catch {
    return null;
  }
}

/**
 * Aggregate every sibling workspace sharing `taskGroup` into a side-by-side view.
 * A blank group is a truthful empty view; a group with no members is a truthful
 * empty view (count 0) — never an error, never invented rows.
 */
export async function compareTaskGroup(
  deps: CompareDeps,
  taskGroup: string,
): Promise<CompareView> {
  const group = taskGroup.trim();
  if (!group) return { taskGroup: null, count: 0, siblings: [] };

  const all = await deps.listWorkspaces();
  const members = all.filter((ws) => taskGroupOf(ws) === group);
  const siblings = await Promise.all(members.map((ws) => buildEntry(deps, ws)));
  siblings.sort(bySiblingOrder);
  return { taskGroup: group, count: siblings.length, siblings };
}

/**
 * The compare view for the group a single workspace belongs to. An ungrouped
 * workspace (no `taskGroup`) is its OWN singleton sibling set — the truthful read
 * (never invents peers). A missing workspace returns null (the route maps to 404).
 */
export async function workspaceSiblings(
  deps: CompareDeps,
  workspaceId: string,
): Promise<CompareView | null> {
  const workspace = await deps.getWorkspace(workspaceId);
  if (!workspace) return null;

  const group = taskGroupOf(workspace);
  if (!group) {
    const entry = await buildEntry(deps, workspace);
    return { taskGroup: null, count: 1, siblings: [entry] };
  }
  return compareTaskGroup(deps, group);
}
