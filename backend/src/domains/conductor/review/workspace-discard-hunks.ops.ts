/**
 * Conductor discard-hunks ops — HUNK-level REJECT in the Review flow: reverse-
 * apply the selected hunks of ONE path against the review base so Apply
 * (= merge) delivers only the accepted edits (DESIGN-REFERENCE "accept/reject
 * at set / file / hunk", the HUNK level — `workspace-discard.ops.ts` covers the
 * FILE level).
 *
 * Host-side git on the workspace's isolated worktree, mirroring the file-level
 * op's seams — no module singletons, no `process.env`. Flow: `git diff <base>
 * -- <path>` → split into hunks with the PURE parser (`parseUnifiedDiffHunks`,
 * split on `@@` headers, file header kept) → assemble a patch of ONLY the
 * requested hunks → `git apply -R --whitespace=nowarn` (via a temp patch file —
 * the exec seam has no stdin) → ONE commit on the worktree branch, pathspec-
 * limited to the path so unrelated agent work (staged or not) is never swept
 * in. Degrade-truthful: an out-of-range index fails THAT index with a reason;
 * the assembled patch applies atomically (a failed apply fails ALL selected
 * hunks and makes NO commit — never a half-applied file); a no-diff / binary /
 * multi-file pathspec is a truthful failed; a zero-effect call is a truthful
 * no-op (`committed:false`, no empty commit).
 */
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSafe } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import { resolveReviewBaseResolved } from './workspace-review.ops.js';
import type { DiscardOpsDeps } from './workspace-discard.ops.js';

/** What happened to one requested hunk index — truthful per-hunk, never batch-faked. */
export type DiscardHunkAction = 'discarded' | 'failed';

export interface DiscardHunkResult {
  /** The requested hunk index (echoed back for the caller). */
  index: number;
  action: DiscardHunkAction;
  /** Present only for `failed` — the truthful per-hunk reason. */
  reason?: string;
}

/** The `POST /workspaces/:id/files/discard-hunks` payload (mirrors `WorkspaceDiscardView`). */
export interface WorkspaceDiscardHunksView {
  workspaceId: string;
  /** The review base the hunks were rejected against ({@link resolveReviewBaseResolved}). */
  base: string;
  /** The requested repo-relative path (echoed back for the caller). */
  path: string;
  /** True when a discard commit was created (false ⇒ zero-effect no-op). */
  committed: boolean;
  /** The created commit — present only when `committed` is true. */
  commitSha?: string;
  hunks: DiscardHunkResult[];
}

/** A single-path diff + reverse-apply is local — bound it like the file-level op. */
const DISCARD_TIMEOUT_MS = 6_000;
const DISCARD_MAX_BUFFER = 8 * 1024 * 1024;

/**
 * Reject a path that could escape the worktree or become a git option (the
 * SAME guard `workspace-discard.ops.ts#isSafeRelPath` applies): no absolute
 * path, no `..` segment, no leading `-`, no NUL. Local mirror — defense-in-
 * depth over the route's 400.
 */
function isSafeRelPath(p: string): boolean {
  if (!p || p.startsWith('-') || p.includes('\0')) return false;
  if (path.isAbsolute(p)) return false;
  return !p.split(/[\\/]/).some((seg) => seg === '..');
}

/** A unified diff split into its file header + `@@`-delimited hunks (both newline-free at the edges). */
export interface ParsedUnifiedDiff {
  /** Everything before the first `@@` header (`diff --git` / `index` / `---` / `+++`). */
  header: string;
  /** Each hunk from its `@@` header to the next (the `\ No newline` marker stays attached). */
  hunks: string[];
}

/**
 * PURE parser: split one file's unified diff into its header and `@@` hunks.
 * No git, no IO — the seam the tests exercise directly. An empty diff parses
 * to `{header:'', hunks:[]}`.
 */
export function parseUnifiedDiffHunks(diffText: string): ParsedUnifiedDiff {
  const lines = diffText.split('\n');
  // Drop the trailing '' produced by the diff's final newline (not a content line).
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const headerLines: string[] = [];
  const hunks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith('@@')) {
      current = [line];
      hunks.push(current);
      continue;
    }
    if (current) current.push(line);
    else headerLines.push(line);
  }
  return { header: headerLines.join('\n'), hunks: hunks.map((h) => h.join('\n')) };
}

/** Assemble a patch of the header + the selected hunks (git needs the trailing newline). */
function assembleHunkPatch(header: string, hunks: readonly string[]): string {
  return `${[header, ...hunks].join('\n')}\n`;
}

/** All requested indexes failed for one shared reason (no-diff / binary / unsafe path). */
function allFailed(
  view: Omit<WorkspaceDiscardHunksView, 'hunks' | 'committed'>,
  hunkIndexes: readonly number[],
  reason: string,
): WorkspaceDiscardHunksView {
  return {
    ...view,
    committed: false,
    hunks: hunkIndexes.map((index) => ({ index, action: 'failed' as const, reason })),
  };
}

/**
 * Reject the selected hunks of `filePath` in the workspace's worktree: compute
 * the unified diff vs the review base, reverse-apply ONLY the requested hunks,
 * and commit the result as ONE pathspec-limited commit on the worktree branch
 * (only when something actually changed vs the branch HEAD — never an empty
 * commit). The workspace record is resolved by the CALLER (module) — a missing
 * worktree throws a truthful error.
 */
export async function discardWorkspaceHunks(
  deps: DiscardOpsDeps,
  workspace: Workspace,
  filePath: string,
  hunkIndexes: readonly number[],
): Promise<WorkspaceDiscardHunksView> {
  const workspaceId = workspace.workspaceId;
  const base = await resolveReviewBaseResolved(deps, workspace);
  if (!workspace.worktreePath) throw new Error(`workspace has no worktree: ${workspaceId}`);
  const wt = workspace.worktreePath;
  const exec = deps.exec ?? execFileSafe;
  const options = { timeoutMs: DISCARD_TIMEOUT_MS, maxBuffer: DISCARD_MAX_BUFFER };
  const head = { workspaceId, base, path: filePath };

  if (!isSafeRelPath(filePath)) {
    return allFailed(head, hunkIndexes, 'unsafe path (absolute, "..", or option-like)');
  }

  // The single-path unified diff vs base — the path ONLY as a pathspec after `--`.
  const { stdout: diffText } = await exec('git', ['-C', wt, 'diff', base, '--', filePath], options);
  if (diffText.trim().length === 0) {
    return allFailed(head, hunkIndexes, 'path has no diff vs the review base');
  }
  const fileHeaders = diffText.split('\n').filter((l) => l.startsWith('diff --git ')).length;
  if (fileHeaders > 1) {
    return allFailed(head, hunkIndexes, 'path matched more than one file (directory pathspec unsupported)');
  }
  const parsed = parseUnifiedDiffHunks(diffText);
  if (parsed.hunks.length === 0) {
    return allFailed(head, hunkIndexes, 'no reversible text hunks (binary or mode-only change)');
  }

  // Partition the requested indexes: out-of-range fails per-index, valid ones
  // form ONE assembled patch that applies atomically.
  const results: DiscardHunkResult[] = [];
  const selected = new Set<number>();
  for (const index of hunkIndexes) {
    if (!Number.isInteger(index) || index < 0 || index >= parsed.hunks.length) {
      results.push({
        index,
        action: 'failed',
        reason: `hunk index out of range (${parsed.hunks.length} hunk(s) in diff)`,
      });
      continue;
    }
    selected.add(index);
    results.push({ index, action: 'discarded' });
  }
  if (selected.size === 0) return { ...head, committed: false, hunks: results };

  const ordered = [...selected].sort((a, b) => a - b);
  const patch = assembleHunkPatch(parsed.header, ordered.map((i) => parsed.hunks[i]));

  // Reverse-apply the assembled patch ATOMICALLY (git apply is all-or-nothing):
  // a failure fails every selected hunk and leaves the worktree untouched. The
  // exec seam has no stdin, so the patch goes through a private temp file.
  const tmp = await mkdtemp(path.join(tmpdir(), 'recoder-discard-hunks-'));
  try {
    const patchFile = path.join(tmp, 'reject.patch');
    await writeFile(patchFile, patch, 'utf8');
    await exec('git', ['-C', wt, 'apply', '-R', '--whitespace=nowarn', patchFile], options);
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'git apply -R failed';
    deps.logger.warn({ err, workspaceId, path: filePath }, 'conductor discard-hunks apply faulted');
    return {
      ...head,
      committed: false,
      hunks: results.map((r) =>
        r.action === 'discarded' ? { index: r.index, action: 'failed' as const, reason } : r,
      ),
    };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  // ONE commit, pathspec-limited to the path so unrelated agent work (staged or
  // not) is never swept in — and ONLY when the reverted content actually differs
  // from the branch HEAD (a zero-effect revert needs no commit).
  await exec('git', ['-C', wt, 'add', '--', filePath], options);
  const { stdout } = await exec(
    'git',
    ['-C', wt, 'diff', '--cached', '--name-only', '-z', '--', filePath],
    options,
  );
  if (!stdout.split('\0').some((line) => line.length > 0)) {
    return { ...head, committed: false, hunks: results };
  }
  await exec(
    'git',
    [
      '-C', wt,
      '-c', 'user.email=agent@recoder.dev',
      '-c', 'user.name=Recoder Agent',
      '-c', 'commit.gpgsign=false',
      'commit',
      '-m', `recoder: discard ${ordered.length} hunk(s) in ${filePath}`,
      '--', filePath,
    ],
    options,
  );
  const { stdout: sha } = await exec('git', ['-C', wt, 'rev-parse', 'HEAD'], options);
  return { ...head, committed: true, commitSha: sha.trim(), hunks: results };
}
