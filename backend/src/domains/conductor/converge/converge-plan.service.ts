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
 *  - a CONTESTED path (≥2 authors) resolves to the caller's SELECTION per file, one of:
 *      · a real author's workspaceId ⇒ `pick` (that sibling's whole file wins);
 *      · the {@link SYNTHESIZE_SELECTION} sentinel ⇒ `synthesize` (an automatic
 *        line-level 3-way merge of the contesting siblings against base — run in the
 *        ops layer, NOT here; see below);
 *    else it is UNRESOLVED (a truthful "you must decide", never an invented winner).
 *
 * WHOLE-FILE PICK is the safe default; SYNTHESIZE is the line-level refinement. This
 * pure fold is OPTIMISTIC about synthesize — it records the requested `mode` but
 * runs NO git (it stays pure, mirroring `readiness.service.ts` foldReadiness). The
 * real 3-way merge happens in `converge.ops.ts`; if it CONFLICTS, compose flips that
 * path back to UNRESOLVED with reason `synthesize-conflict` (never a marker-poisoned
 * "trusted" branch), so `complete` is only truly final after compose has merged.
 *
 * Degrade-truthful — a sibling whose changed-file list is UNREADABLE contributes
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

/**
 * The reserved selection VALUE that requests an automatic line-level 3-way merge of
 * a contested path (instead of picking one sibling's whole file). Chosen as an
 * `@`-prefixed sentinel that can never collide with a real workspaceId (`ws_…`).
 */
export const SYNTHESIZE_SELECTION = '@synthesize' as const;

/** How a contested path's winner is produced: a whole-file `pick` or a 3-way `synthesize`. */
export type ConvergenceMode = 'pick' | 'synthesize';

/** The read-only inputs the pure plan folds over. */
export interface ConvergencePlanInput {
  readonly taskGroup: string | null;
  readonly siblings: readonly ConvergencePlanSiblingInput[];
  /**
   * Contested path → either a chosen sibling workspaceId (`pick`) or the
   * {@link SYNTHESIZE_SELECTION} sentinel (`synthesize`). Non-contested paths ignore this.
   */
  readonly selection: Readonly<Record<string, string>>;
}

/** A resolved winning file in the plan: how its content will be materialized. */
export interface ConvergenceFileWinner {
  readonly path: string;
  /** `pick` (a sibling's whole file) or `synthesize` (an automatic 3-way merge). */
  readonly mode: ConvergenceMode;
  /** For `pick`: the workspaceId whose whole file wins. ABSENT for `synthesize`. */
  readonly sourceWorkspaceId?: string;
  /** For `synthesize`: the sibling ids whose versions are 3-way merged (sorted). ABSENT for `pick`. */
  readonly contributors?: readonly string[];
  /** True when 2+ siblings authored this path (the winner came from the selection). */
  readonly contested: boolean;
  /** Every sibling that authored this path (sorted, deduped) — the choosable set. */
  readonly candidates: readonly string[];
}

/**
 * Why a contested path could not be resolved (surfaced to the caller as a decision):
 *  - `no-selection` / `invalid-selection` — from the pure fold (no/bad pick);
 *  - `synthesize-conflict` — from the OPS layer only: a requested 3-way merge
 *    conflicted, so the caller must fall back to an explicit `pick`.
 */
export type UnresolvedReason = 'no-selection' | 'invalid-selection' | 'synthesize-conflict';

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

/**
 * One conflict region parsed from `git merge-file`'s merged-with-markers output —
 * WHERE the contesting siblings collided in a file. `startLine`/`endLine` are the
 * 1-indexed positions of the `<<<<<<<`/`>>>>>>>` marker lines IN that marker
 * content; `ours`/`theirs` are each side's lines. `truncated:true` marks a
 * server-side cap (more lines/regions existed than the bounded payload carries).
 */
export interface ConflictRegion {
  readonly startLine: number;
  readonly endLine: number;
  readonly ours: readonly string[];
  readonly theirs: readonly string[];
  readonly truncated: boolean;
}

/**
 * A per-contested-file synthesizability probe result — an OPTIONAL, opt-in
 * enrichment produced by the OPS layer (a read-only dry-run 3-way merge), NEVER by
 * the pure fold. Present on {@link ConvergencePlan.contested} only when the plan was
 * requested with `probe`. Lets the UI show which contested files auto-merge cleanly
 * (can offer `@synthesize`) vs. which still need an explicit `pick`.
 */
export interface ContestedProbe {
  readonly path: string;
  /** Siblings that touched this path (sorted) — the pick options. */
  readonly workspaceIds: readonly string[];
  /** True when a clean line-level 3-way merge of the contesting versions is possible. */
  readonly synthesizable: boolean;
  /** When `synthesizable:false`: `'overlap'` | `'delete-modify'` | `'unreadable'`. */
  readonly reason?: string;
  /**
   * For `reason:'overlap'` ONLY: the parsed conflict regions of the dry-run merge —
   * WHERE the agents collided. Optional + additive: an older/unparsed probe simply
   * omits it, and unprobed plans are unaffected (see {@link ConvergencePlan.contested}).
   */
  readonly regions?: readonly ConflictRegion[];
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
  /**
   * OPTIONAL synthesizability probe over the contested paths — present ONLY when the
   * plan was requested with `probe` (the OPS layer attaches it; the pure fold never
   * does). Sorted by path. Omitted entirely when unprobed (additive; existing
   * callers/tests read only files/unresolved/sources/changedFiles/complete).
   */
  readonly contested?: readonly ContestedProbe[];
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
      // Non-contested: exactly one author wins automatically (always a pick).
      files.push({ path, mode: 'pick', sourceWorkspaceId: candidates[0], contested: false, candidates });
      continue;
    }
    // Contested: the caller must select a real author (pick) or request a synthesize.
    const chosen = input.selection[path];
    if (chosen === SYNTHESIZE_SELECTION) {
      // OPTIMISTIC: the pure fold records the requested 3-way; the ops layer runs it
      // and flips this to `synthesize-conflict` if the merge does not come out clean.
      files.push({ path, mode: 'synthesize', contributors: candidates, contested: true, candidates });
    } else if (!chosen) {
      unresolved.push({ path, candidates, reason: 'no-selection' });
    } else if (!authorSet.has(chosen)) {
      // A selection that names a non-author is invalid (never silently accepted).
      unresolved.push({ path, candidates, reason: 'invalid-selection' });
    } else {
      files.push({ path, mode: 'pick', sourceWorkspaceId: chosen, contested: true, candidates });
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

/**
 * The workspaceIds a winning file draws from: `[sourceWorkspaceId]` for a `pick`,
 * or every `contributor` for a `synthesize`. Used both to tally sources and (in the
 * ops layer) to know which worktrees a file must materialize from.
 */
export function winnerSources(file: ConvergenceFileWinner): readonly string[] {
  if (file.mode === 'synthesize') return file.contributors ?? file.candidates;
  return file.sourceWorkspaceId ? [file.sourceWorkspaceId] : [];
}

/**
 * Tally each winning source's file count, joined to its agent, sorted by workspaceId.
 * A `synthesize` file counts toward EACH contributing sibling (all its versions feed
 * the merge), so `sum(fileCount)` can exceed the file total — a truthful contribution
 * measure, not a partition.
 */
function computeSources(
  files: readonly ConvergenceFileWinner[],
  siblings: readonly ConvergencePlanSiblingInput[],
): ConvergencePlanSource[] {
  const agentOf = new Map(siblings.map((s) => [s.workspaceId, s.agent]));
  const counts = new Map<string, number>();
  for (const file of files) {
    for (const workspaceId of winnerSources(file)) {
      counts.set(workspaceId, (counts.get(workspaceId) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([workspaceId, fileCount]) => ({
      workspaceId,
      agent: agentOf.get(workspaceId) ?? 'unknown',
      fileCount,
    }))
    .sort((a, b) => a.workspaceId.localeCompare(b.workspaceId));
}
