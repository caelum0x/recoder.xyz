/**
 * Pairwise A/B line-level diff (BE-W8-PAIRWISE) — the TRUE per-file unified diff
 * of the SAME path across TWO sibling worktrees, the backend edge the desktop
 * Compare view's PairwisePanel needs (`git diff --no-index A/<path> B/<path>`).
 *
 * Pure + injected: no module singletons, no env — the `exec` seam defaults to
 * `execFileSafe` exactly like `converge.ops` / `workspace-review.ops`. Git exits 1
 * when the operands differ, so an `ExecError` with a small positive code AND a
 * non-empty stdout is git's truthful "they differ" (the patch), mirroring
 * `mergeFile`'s ExecError read in converge.ops.
 *
 * Degrade-truthful throughout, NEVER throws to the route: a poisoned path (empty /
 * leading `-` / NUL / absolute / `..` segment — we JOIN it onto the worktree roots,
 * so the whole-path guard is stricter than the pathspec-only one) is rejected
 * BEFORE any spawn; a missing worktree, a one-sided file, or an exec fault yields
 * `{ available:false, patch:null, reason }`; a differing binary file reports
 * `binary:true, patch:null` (never megabytes of binary noise); identical files are
 * a COMPUTED `patch:''` (not "unavailable"). The batched read is bounded to
 * {@link PAIRWISE_MAX_PATHS} paths with a truthful `capped` flag.
 */
import { execFileSafe, ExecError } from '@recoder/substrate';
import path from 'node:path';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';

/** Bounded batch size for {@link pairwiseDiff} — never an unbounded git fan-out. */
export const PAIRWISE_MAX_PATHS = 50;
/** Per-file exec bounds — the same posture as the review per-file patch read. */
const PAIRWISE_DIFF_TIMEOUT_MS = 6_000;
const PAIRWISE_DIFF_MAX_BUFFER = 8 * 1024 * 1024;

/** The injected seams the pairwise read runs over. */
export interface PairwiseDiffDeps {
  readonly logger: Logger;
  /** Child-process seam for host git; defaults to `execFileSafe`. */
  readonly exec?: typeof execFileSafe;
}

/** One file's A-vs-B unified diff. `patch:''` = computed, identical. */
export interface PairwiseFileDiff {
  readonly path: string;
  readonly available: boolean;
  readonly binary: boolean;
  readonly patch: string | null;
  /** Truthful reason `available` is false (bad path, no worktree, git fault). */
  readonly reason?: string;
}

/** The batched pairwise read of one A/B pair over a bounded path list. */
export interface PairwiseDiffView {
  /** Workspace id of side A (its line reads as `-`). */
  readonly a: string;
  /** Workspace id of side B (its line reads as `+`). */
  readonly b: string;
  readonly files: readonly PairwiseFileDiff[];
  /** True when the requested path list exceeded {@link PAIRWISE_MAX_PATHS}. */
  readonly capped: boolean;
}

/**
 * Reject a path that could escape the worktree roots BEFORE any spawn: no empty,
 * no leading `-` (option injection), no NUL, no absolute path, no `..` segment —
 * stricter than the pathspec-only review guard because this path is JOINED onto
 * both worktree roots (mirrors `isSafeRelPath` in converge.ops).
 */
function isSafeRelPath(p: string): boolean {
  if (!p || p.startsWith('-') || p.includes('\0')) return false;
  if (path.isAbsolute(p)) return false;
  return !p.split(/[\\/]/).some((seg) => seg === '..');
}

/**
 * ONE file's line-level A-vs-B unified diff via `git diff --no-index`. Never
 * throws: every failure mode is a truthful `{ available:false, patch:null, reason }`.
 */
export async function pairwiseFileDiff(
  deps: PairwiseDiffDeps,
  input: { readonly a: Workspace; readonly b: Workspace; readonly path: string },
): Promise<PairwiseFileDiff> {
  const relPath = input.path;
  // Path guard (defense-in-depth, BEFORE any spawn) — a poisoned path never reaches exec.
  if (!isSafeRelPath(relPath)) {
    return { path: relPath, available: false, binary: false, patch: null, reason: 'invalid path' };
  }
  if (!input.a.worktreePath || !input.b.worktreePath) {
    const side = !input.a.worktreePath ? input.a.workspaceId : input.b.workspaceId;
    return {
      path: relPath,
      available: false,
      binary: false,
      patch: null,
      reason: `no worktree for ${side} (never launched or already torn down)`,
    };
  }
  const exec = deps.exec ?? execFileSafe;
  const options = { timeoutMs: PAIRWISE_DIFF_TIMEOUT_MS, maxBuffer: PAIRWISE_DIFF_MAX_BUFFER };
  const aFile = path.join(input.a.worktreePath, relPath);
  const bFile = path.join(input.b.worktreePath, relPath);
  try {
    // Exit 0 ⇒ identical operands ⇒ a computed empty patch (never "unavailable").
    const { stdout } = await exec('git', ['diff', '--no-index', '--', aFile, bFile], options);
    return { path: relPath, available: true, binary: false, patch: stdout };
  } catch (err) {
    // Git exits 1 when the operands DIFFER — a non-empty stdout is the patch
    // (the same ExecError read as converge.ops mergeFile). An exit 1 with an
    // EMPTY stdout is a real fault (e.g. "Could not access" a one-sided file).
    if (err instanceof ExecError && typeof err.code === 'number' && err.code > 0 && err.code < 128 && err.stdout.length > 0) {
      const binary = /^Binary files .+ differ$/m.test(err.stdout) || err.stdout.includes('GIT binary patch');
      return { path: relPath, available: true, binary, patch: binary ? null : err.stdout };
    }
    // git absent / one-sided file / oversize (maxBuffer trip) — truthful degrade.
    deps.logger.warn({ err, path: relPath }, 'conductor pairwise-diff read faulted — reporting unavailable');
    const reason = err instanceof ExecError && err.stderr.trim() ? err.stderr.trim() : err instanceof Error ? err.message : 'pairwise diff failed';
    return { path: relPath, available: false, binary: false, patch: null, reason };
  }
}

/**
 * The batched A-vs-B read over a bounded path list (order preserved). Bounded to
 * {@link PAIRWISE_MAX_PATHS} — the overflow is DROPPED with a truthful `capped:true`,
 * never an unbounded git fan-out.
 */
export async function pairwiseDiff(
  deps: PairwiseDiffDeps,
  input: { readonly a: Workspace; readonly b: Workspace; readonly paths: readonly string[] },
): Promise<PairwiseDiffView> {
  const capped = input.paths.length > PAIRWISE_MAX_PATHS;
  const bounded = capped ? input.paths.slice(0, PAIRWISE_MAX_PATHS) : input.paths;
  const files: PairwiseFileDiff[] = [];
  // Sequential on purpose: one bounded git child at a time, never a 50-wide fan-out.
  for (const relPath of bounded) {
    files.push(await pairwiseFileDiff(deps, { a: input.a, b: input.b, path: relPath }));
  }
  return { a: input.a.workspaceId, b: input.b.workspaceId, files, capped };
}

/**
 * PURE default-path fold: the files BOTH picked siblings touched, from the compare
 * view. Both changed-file lists readable ⇒ their intersection (A's order); either
 * unreadable ⇒ the group's contested set restricted to this pair (the same
 * truthful fallback the desktop's client-side pairwise view uses) — never a
 * fabricated list.
 */
export function sharedPairPaths(
  a: { readonly workspaceId: string; readonly changedFiles?: readonly string[] },
  b: { readonly workspaceId: string; readonly changedFiles?: readonly string[] },
  contested: readonly { readonly path: string; readonly workspaceIds: readonly string[] }[],
): string[] {
  if (a.changedFiles && b.changedFiles) {
    const bSet = new Set(b.changedFiles);
    return a.changedFiles.filter((p) => bSet.has(p));
  }
  return contested
    .filter((c) => c.workspaceIds.includes(a.workspaceId) && c.workspaceIds.includes(b.workspaceId))
    .map((c) => c.path);
}
