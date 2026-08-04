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
import type { GroupAttachHint } from '../ports/workspace-grid.port.js';

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

/** A file 2+ siblings BOTH touched — where parallel agents will collide. */
export interface ContestedFile {
  readonly path: string;
  /** Workspace ids of the 2+ siblings that BOTH touched this path (sorted, deduped). */
  readonly workspaceIds: readonly string[];
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
  /** Tracked changed-file paths vs base — ABSENT (with a reason) when unreadable; `[]` = readable, no changes. */
  readonly changedFiles?: readonly string[];
  /** Truthful reason `changedFiles` is absent (no worktree, non-repo, git absent). */
  readonly changedFilesReason?: string;
  /**
   * The sibling's live tmux session name, PROJECTED verbatim from the Workspace
   * record (absent when never launched) — the operator-grid/attach seam reads it.
   * Read-only projection: this service computes nothing new.
   */
  readonly sessionName?: string;
  /**
   * The sibling's isolated worktree path, PROJECTED verbatim from the Workspace
   * record (absent when never launched / torn down) — the per-pane cwd the
   * worktree-bound grid binds to. Read-only projection.
   */
  readonly worktreePath?: string;
}

/** The aggregate of one parallel-run group for side-by-side review. */
export interface CompareView {
  /** The shared group key, or `null` when the subject workspace is ungrouped. */
  readonly taskGroup: string | null;
  /** Number of siblings in the group. */
  readonly count: number;
  /** The siblings, sorted oldest-first (stable by workspaceId on a tie). */
  readonly siblings: readonly SiblingCompareEntry[];
  /**
   * Files 2+ siblings BOTH touched — where parallel agents will collide. Always
   * emitted; an empty group (or no overlap) ⇒ `[]`. A sibling whose changed-file
   * list is unreadable contributes NOTHING (never a fabricated collision).
   */
  readonly contested: readonly ContestedFile[];
  /**
   * A READ-ONLY operator-attach hint for the group, enriched by the conductor
   * module AFTER this pure read (never here — this service stays read-only +
   * substrate-free). Absent when the group is a singleton, dmux is absent, or the
   * repo/sessions are unknown (truthful degrade — never a fabricated grid).
   */
  readonly grid?: GroupAttachHint;
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
  /**
   * Read-only tracked changed-file paths for a workspace. MUST be side-effect free
   * and degrade-safe: unreadable ⇒ `{ reason }` (never a fabricated list).
   */
  changedFiles(workspace: Workspace): Promise<{ files?: readonly string[]; reason?: string }>;
  /**
   * OPTIONAL per-caller access predicate (recoder-kybr). A group is keyed on a
   * shared `taskGroup`, NOT a single workspace id, so the `:id` ownership guard
   * cannot cover it — without this, an authed caller could aggregate/converge
   * across siblings they do not own. When present, a workspace for which it returns
   * FALSE is EXCLUDED from the aggregate, so a group-scoped compare/converge folds
   * ONLY the siblings the caller may access. ABSENT (internal callers — e.g. the
   * merge-time evidence read) ⇒ the FULL group is seen. This pure service merely
   * applies the predicate; the ownership semantics (createdBy/tenant + admin/solo
   * fail-open) live in the caller (routes/workspace-access `canAccessWorkspace`).
   */
  canAccess?(workspace: Workspace): boolean;
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

/**
 * The CONTESTED set: files 2+ siblings BOTH touched — where parallel agents will
 * collide. Pure + degrade-truthful: a sibling whose `changedFiles` is absent
 * (unreadable) contributes NOTHING (never a fabricated collision); paths are
 * deduped within a sibling; the result is sorted by path with sorted workspaceIds.
 */
export function computeContested(siblings: readonly SiblingCompareEntry[]): ContestedFile[] {
  const byPath = new Map<string, Set<string>>();
  for (const sibling of siblings) {
    if (!sibling.changedFiles) continue; // degrade: an unreadable sibling contributes nothing
    for (const path of new Set(sibling.changedFiles)) {
      // dedupe within a sibling
      let ids = byPath.get(path);
      if (!ids) {
        ids = new Set();
        byPath.set(path, ids);
      }
      ids.add(sibling.workspaceId);
    }
  }
  return [...byPath.entries()]
    .filter(([, ids]) => ids.size >= 2)
    .map(([path, ids]) => ({ path, workspaceIds: [...ids].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function buildEntry(deps: CompareDeps, workspace: Workspace): Promise<SiblingCompareEntry> {
  const [view, diff, changed] = await Promise.all([
    safeView(deps, workspace),
    deps.diffStat(workspace),
    deps.changedFiles(workspace),
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
    // `[]` is truthy → a readable-but-empty changed-file list is KEPT (not a reason).
    ...(changed.files ? { changedFiles: changed.files } : {}),
    ...(changed.reason ? { changedFilesReason: changed.reason } : {}),
    // Read-only PROJECTION of two fields already on the Workspace record (the
    // worktree-bound grid + attach seam read them); computes nothing new.
    ...(workspace.sessionName ? { sessionName: workspace.sessionName } : {}),
    ...(workspace.worktreePath ? { worktreePath: workspace.worktreePath } : {}),
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
  if (!group) return { taskGroup: null, count: 0, siblings: [], contested: [] };

  const all = await deps.listWorkspaces();
  // recoder-kybr: fold ONLY the group siblings the caller may access. `canAccess`
  // absent (an internal, principal-less read) ⇒ the full group, unchanged.
  const members = all.filter(
    (ws) => taskGroupOf(ws) === group && (deps.canAccess ? deps.canAccess(ws) : true),
  );
  const siblings = await Promise.all(members.map((ws) => buildEntry(deps, ws)));
  siblings.sort(bySiblingOrder);
  const contested = computeContested(siblings);
  return { taskGroup: group, count: siblings.length, siblings, contested };
}

/**
 * The synthetic-group-id prefix for an AD-HOC converge (PW1 #1). An F3 launch stamps
 * `metadata.taskGroup` as an opaque id and NEVER an `adhoc:`-prefixed one, so this
 * namespace can never collide with a real parallel-run group.
 */
export const AD_HOC_GROUP_PREFIX = 'adhoc:';

/**
 * A deterministic synthetic group id for an ad-hoc converge over an EXPLICIT set of
 * separately-launched workspaces — the sorted, `+`-joined ids behind {@link
 * AD_HOC_GROUP_PREFIX}. Carried as {@link CompareView.taskGroup} and (downstream) the
 * convergence provenance's `fromTaskGroup`, so the composed record + its sealed
 * evidence truthfully name WHICH workspaces were converged. Deterministic in the id
 * set (not call order) so the plan and the compose resolve the identical id.
 */
export function adHocGroupId(workspaceIds: readonly string[]): string {
  return AD_HOC_GROUP_PREFIX + [...workspaceIds].sort().join('+');
}

/**
 * The typed outcome of an AD-HOC compare over an EXPLICIT workspace list (PW1 #1) — a
 * converge group formed from workspaces launched SEPARATELY (each its own taskGroup,
 * or none), not the F3 siblings of one shared group. Fail-closed + truthful:
 *  - `too-few`      — fewer than 2 DISTINCT ids after dedupe (nothing to converge);
 *  - `not-found`    — a requested id is missing OR the caller may not access it. The
 *    WHOLE call fails with a no-oracle 404 at the edge (byte-identical to an unknown
 *    workspace): an explicit list must NEVER silently drop an unowned id the way a
 *    taskGroup aggregate does, and never confirm which named ids exist;
 *  - `incompatible` — the workspaces do not share a repo (different space/project
 *    binding), so a converged diff across them would be nonsense — rejected with a
 *    truthful reason, never a fabricated cross-repo diff.
 */
export type AdHocCompareOutcome =
  | { readonly ok: true; readonly view: CompareView }
  | { readonly ok: false; readonly code: 'not-found' }
  | { readonly ok: false; readonly code: 'too-few'; readonly reason: string }
  | { readonly ok: false; readonly code: 'incompatible'; readonly reason: string };

/**
 * Aggregate an EXPLICIT set of workspaces (launched separately, NOT F3 siblings of a
 * shared taskGroup) into the SAME {@link CompareView} shape {@link compareTaskGroup}
 * returns — the ad-hoc converge group (PW1 #1). The converge math already operates on
 * a SET of sibling rows; the `taskGroup` was only ever the DISCOVERY key, so this
 * supplies the set from a caller-given id list and reuses the identical row +
 * contested-overlap projection (`buildEntry`/`computeContested`) — no duplicated math.
 *
 * Fail-closed (see {@link AdHocCompareOutcome}): <2 distinct ids ⇒ `too-few`; any id
 * missing OR inaccessible to the caller (recoder-kybr `deps.canAccess`) ⇒ a no-oracle
 * `not-found` (ownership is checked BEFORE repo-compat, so a foreign id never leaks
 * another tenant's repo); workspaces spanning different space/project ⇒ `incompatible`.
 */
export async function compareWorkspaces(
  deps: CompareDeps,
  workspaceIds: readonly string[],
): Promise<AdHocCompareOutcome> {
  const distinct = [
    ...new Set(workspaceIds.map((id) => id.trim()).filter((id) => id.length > 0)),
  ];
  if (distinct.length < 2) {
    return {
      ok: false,
      code: 'too-few',
      reason: `ad-hoc converge needs ≥2 distinct workspace ids (got ${distinct.length})`,
    };
  }

  // Fetch + ownership FIRST. Any missing OR inaccessible id fails the WHOLE call as a
  // no-oracle not-found — an explicit list must not silently drop an unowned id (as a
  // taskGroup aggregate does), and a named id the caller can't see is a 404, not a leak.
  const workspaces: Workspace[] = [];
  for (const id of distinct) {
    const workspace = await deps.getWorkspace(id);
    if (!workspace) return { ok: false, code: 'not-found' };
    if (deps.canAccess && !deps.canAccess(workspace)) return { ok: false, code: 'not-found' };
    workspaces.push(workspace);
  }

  // Repo compatibility: converging across repos is nonsense. The state-of-record binds
  // a workspace to its repo via (spaceId, projectId), so a shared pair is the durable
  // "same repo" signal — no git probe, fail-closed on any drift. (Base is inherited
  // from the primary source at compose time, so separate launches whose base advanced
  // between them still converge — only a genuinely different repo is rejected.)
  const [first, ...rest] = workspaces;
  const mismatch = rest.find(
    (ws) => ws.spaceId !== first.spaceId || ws.projectId !== first.projectId,
  );
  if (mismatch) {
    return {
      ok: false,
      code: 'incompatible',
      reason:
        'cannot converge workspaces from different repos ' +
        `(project ${first.projectId} vs ${mismatch.projectId})`,
    };
  }

  const siblings = await Promise.all(workspaces.map((ws) => buildEntry(deps, ws)));
  siblings.sort(bySiblingOrder);
  return {
    ok: true,
    view: {
      taskGroup: adHocGroupId(distinct),
      count: siblings.length,
      siblings,
      contested: computeContested(siblings),
    },
  };
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
  // recoder-kybr: an inaccessible workspace is a no-oracle null (the route maps it
  // to the SAME 404 as a genuinely-missing one) — never confirm it exists.
  if (deps.canAccess && !deps.canAccess(workspace)) return null;

  const group = taskGroupOf(workspace);
  if (!group) {
    const entry = await buildEntry(deps, workspace);
    // A singleton can't contest itself — always `[]` (truthful).
    return { taskGroup: null, count: 1, siblings: [entry], contested: computeContested([entry]) };
  }
  return compareTaskGroup(deps, group);
}
