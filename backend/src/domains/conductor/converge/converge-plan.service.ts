/**
 * Convergence plan (product step 2) — the PURE fold that turns N divergent sibling
 * diffs + a per-contested-file selection into ONE resolved file→source map: the
 * blueprint a compose then materializes into a single trusted change.
 *
 * The thesis (PRODUCT-THESIS.md): running N agents in parallel is solved; making
 * their divergent diffs CONVERGE is the unclaimed hard part. `compare.service`
 * already surfaces the CONTESTED set (files 2+ siblings both touched). This service
 * takes the next step WITHOUT any git mutation: for every changed path across the
 * group it resolves which sibling's version wins —
 *
 *  - a NON-CONTESTED path (exactly one author) auto-resolves to that sole author;
 *  - a CONTESTED path (≥2 authors) resolves to the caller's SELECTION, and only
 *    when the selection names a real author of that path; otherwise it is
 *    UNRESOLVED (a truthful "you must decide", never an invented winner).
 *
 * This is a whole-file pick (the correct first cut) — it selects a winning sibling
 * PER FILE, not a semantic/AST merge WITHIN a file (see the deferred note in the
 * ops). Mirrors `readiness.service.ts` foldReadiness: no I/O, no mutation, and
 * degrade-truthful — a sibling whose changed-file list is UNREADABLE contributes
 * nothing (never a fabricated authorship), exactly as `computeContested` degrades.
 */

/** One sibling's contribution to the fold — its readable changed-file paths (or none). */
export interface ConvergencePlanSiblingInput {
  readonly workspaceId: string;
  /** The agent (runtimeId) that produced this sibling — carried onto the plan sources. */
  readonly agent: string;
  /**
   * Tracked changed-file paths vs base. ABSENT ⇒ unreadable (no worktree / non-repo)
   * — the sibling contributes NO authorship (never a fabricated claim), consistent
   * with `compare.service.computeContested`. `[]` ⇒ readable, genuinely no changes.
   */
  readonly changedFiles?: readonly string[];
}

/** The read-only inputs the pure plan folds over. */
export interface ConvergencePlanInput {
  readonly taskGroup: string | null;
  readonly siblings: readonly ConvergencePlanSiblingInput[];
  /** Contested path → chosen sibling workspaceId. Non-contested paths ignore this. */
  readonly selection: Readonly<Record<string, string>>;
}

/** A resolved winning file in the plan: the sibling whose version will be materialized. */
export interface ConvergenceFileWinner {
  readonly path: string;
  /** The workspaceId whose version wins this path. */
  readonly sourceWorkspaceId: string;
  /** True when 2+ siblings authored this path (the winner came from the selection). */
  readonly contested: boolean;
  /** Every sibling that authored this path (sorted, deduped) — the choosable set. */
  readonly candidates: readonly string[];
}

/** Why a contested path could not be resolved (surfaced to the caller as a decision to make). */
export type UnresolvedReason = 'no-selection' | 'invalid-selection';

/** A contested path with no valid selection — the caller must choose among `candidates`. */
export interface ConvergenceUnresolved {
  readonly path: string;
  /** The sibling workspaceIds that authored this path (sorted) — the valid choices. */
  readonly candidates: readonly string[];
  readonly reason: UnresolvedReason;
}

/** One source sibling's contribution count in the resolved plan. */
export interface ConvergencePlanSource {
  readonly workspaceId: string;
  readonly agent: string;
  /** Number of winning files sourced from this sibling. */
  readonly fileCount: number;
}

/** The folded convergence plan (`GET …/converge-plan`) — the compose blueprint. */
export interface ConvergencePlan {
  readonly taskGroup: string | null;
  readonly siblingCount: number;
  /** Resolved winning files, sorted by path — what compose will materialize. */
  readonly files: readonly ConvergenceFileWinner[];
  /** Contested paths still needing a decision, sorted by path (empty ⇒ ready). */
  readonly unresolved: readonly ConvergenceUnresolved[];
  /** Per-source contribution (only sources that win ≥1 file), sorted by workspaceId. */
  readonly sources: readonly ConvergencePlanSource[];
  /** The union of every changed path seen across the group, sorted. */
  readonly changedFiles: readonly string[];
  /** True when there is ≥1 winning file AND nothing is unresolved — compose-ready. */
  readonly complete: boolean;
}

/** Build the per-path authorship map (path → set of authoring workspaceIds), degrade-truthful. */
function computeAuthorship(
  siblings: readonly ConvergencePlanSiblingInput[],
): Map<string, Set<string>> {
  const byPath = new Map<string, Set<string>>();
  for (const sibling of siblings) {
    if (!sibling.changedFiles) continue; // unreadable ⇒ contributes no authorship
    for (const path of new Set(sibling.changedFiles)) {
      // dedupe within a sibling
      let authors = byPath.get(path);
      if (!authors) {
        authors = new Set();
        byPath.set(path, authors);
      }
      authors.add(sibling.workspaceId);
    }
  }
  return byPath;
}

/**
 * Fold the group's diffs + selection into a {@link ConvergencePlan}. PURE — no I/O,
 * no mutation. Non-contested paths auto-resolve to their sole author; contested
 * paths resolve to a VALID selection (one that names a real author) or become
 * UNRESOLVED. Deterministic: files/unresolved/sources/changedFiles are all sorted.
 */
export function planConvergence(input: ConvergencePlanInput): ConvergencePlan {
  const authorship = computeAuthorship(input.siblings);
  const files: ConvergenceFileWinner[] = [];
  const unresolved: ConvergenceUnresolved[] = [];

  for (const [path, authorSet] of authorship) {
    const candidates = [...authorSet].sort();
    if (candidates.length === 1) {
      // Non-contested: exactly one author wins automatically.
      files.push({ path, sourceWorkspaceId: candidates[0], contested: false, candidates });
      continue;
    }
    // Contested: the caller must have selected a real author of this path.
    const chosen = input.selection[path];
    if (!chosen) {
      unresolved.push({ path, candidates, reason: 'no-selection' });
    } else if (!authorSet.has(chosen)) {
      // A selection that names a non-author is invalid (never silently accepted).
      unresolved.push({ path, candidates, reason: 'invalid-selection' });
    } else {
      files.push({ path, sourceWorkspaceId: chosen, contested: true, candidates });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  unresolved.sort((a, b) => a.path.localeCompare(b.path));

  const sources = computeSources(files, input.siblings);
  const changedFiles = [...authorship.keys()].sort();
  const complete = files.length > 0 && unresolved.length === 0;

  return {
    taskGroup: input.taskGroup,
    siblingCount: input.siblings.length,
    files,
    unresolved,
    sources,
    changedFiles,
    complete,
  };
}

/** Tally each winning source's file count, joined to its agent, sorted by workspaceId. */
function computeSources(
  files: readonly ConvergenceFileWinner[],
  siblings: readonly ConvergencePlanSiblingInput[],
): ConvergencePlanSource[] {
  const agentOf = new Map(siblings.map((s) => [s.workspaceId, s.agent]));
  const counts = new Map<string, number>();
  for (const file of files) {
    counts.set(file.sourceWorkspaceId, (counts.get(file.sourceWorkspaceId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([workspaceId, fileCount]) => ({
      workspaceId,
      agent: agentOf.get(workspaceId) ?? 'unknown',
      fileCount,
    }))
    .sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));
}
