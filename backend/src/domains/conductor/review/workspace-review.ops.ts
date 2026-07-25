/**
 * Conductor review ops — turn a workspace's work into a reviewable diff + file
 * tree, and archive the workspace when done. Ported from the proven v1
 * `conductor/review.ts` onto the domain's injected seams (engine advance,
 * substrate registry, exec) — no module singletons, no `process.env`.
 *
 * Host-side git on the workspace's isolated worktree (the Conductor model).
 * PR creation and merge are outward-facing actions and live in
 * `workspace-publish.ops.ts`. Every op is truthful: a missing workspace/worktree
 * throws a "not found" the route maps to 404; a non-repo tree degrades to empty.
 */
import { execFileSafe } from '@recoder/substrate';
import type { Workspace, WorkspaceState, WorkspaceSubstrate } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { ConductorSubstrate, WorkLockPort } from '../ports/index.js';
import { resolveRepoDefaultBranch } from '../git-default-branch.js';

export interface WorkspaceDiffView {
  workspaceId: string;
  baseRef: string;
  branch: string;
  /** `git diff --stat` summary against the base. */
  stat: string;
  /** Full unified patch of tracked changes against the base. */
  patch: string;
  /** Untracked files in the worktree (not yet in the patch). */
  untracked: string[];
  changedFiles: number;
}

export interface WorkspaceTreeView {
  workspaceId: string;
  /** Repo-relative file paths in the worktree (tracked + untracked), sorted. */
  files: string[];
  /** Subset of `files` changed vs the index/HEAD (added/modified/untracked). */
  changed: string[];
  /** True when the file list was capped (very large repo). */
  truncated: boolean;
}

/** Cap the tree so a huge repo can't flood the UI or the response. */
const MAX_TREE_FILES = 5000;

/** A changed file's git status in the per-file changed-list (numstat + name-status). */
export type DiffFileStatus = 'added' | 'modified' | 'deleted' | 'renamed';

/** One changed file in {@link WorkspaceDiffFilesView} — a truthful slice of the `/diff` blob. */
export interface DiffFileEntry {
  /** Repo-relative path (the NEW path for a rename). */
  path: string;
  /** Git status letter mapped to a stable label. */
  status: DiffFileStatus;
  /** Added lines, or `null` for a binary file (git numstat prints `-`). */
  insertions: number | null;
  /** Removed lines, or `null` for a binary file. */
  deletions: number | null;
  /** The OLD path when `status === 'renamed'` (else omitted). */
  oldPath?: string;
}

/**
 * The `GET /workspaces/:id/diff/files` payload — the per-file changed list, a
 * faithful slice of the existing `/diff` blob (working tree vs base). `available`
 * is false for a non-repo / missing worktree / git-absent tree (files `[]`,
 * never fabricated).
 */
export interface WorkspaceDiffFilesView {
  workspaceId: string;
  /** The base ref the worktree was diffed against ({@link resolveReviewBase}). */
  base: string;
  /** Display-only branch name (`''` when the workspace has none). */
  branch: string;
  /** Whether the changed-list could be computed (false ⇒ no repo/worktree/git). */
  available: boolean;
  /** The changed files (empty when unavailable or genuinely no changes). */
  files: DiffFileEntry[];
}

/**
 * The `GET /workspaces/:id/diff/file?path=` payload — a single file's unified
 * patch (working tree vs base). `patch:null` = could-not-compute (non-repo / no
 * worktree / exec fault / rejected path); `patch:''` = computed, no diff for that
 * path. `binary:true` ⇒ `patch` carries git's binary marker text, not a hunk.
 */
export interface WorkspaceFilePatchView {
  workspaceId: string;
  base: string;
  branch: string;
  /** The requested repo-relative path (echoed back for the caller). */
  path: string;
  available: boolean;
  binary: boolean;
  patch: string | null;
}

/** Per-file git reads are local — bound them like the PrStatus/Mergeability probes. */
const PER_FILE_DIFF_TIMEOUT_MS = 6_000;
const PER_FILE_DIFF_MAX_BUFFER = 8 * 1024 * 1024;

/**
 * The centralized base rule for the per-file diff edges (the SAME rule
 * `mergeability.service.ts` applies): the workspace `baseRef`, UNLESS it is unset,
 * the detached `HEAD`, or begins with `-` (a poisoned ref that could inject a git
 * option), in which case fall back to `main`. Used by BOTH per-file edges so the
 * base can never become a git flag and matches the mergeability panel reviewers
 * already read. The legacy {@link workspaceDiff} keeps its own `baseRef || 'HEAD'`
 * rule untouched (zero consumer break).
 */
export function resolveReviewBase(ws: Pick<Workspace, 'baseRef'>): string {
  const baseRef = ws.baseRef;
  if (!baseRef || baseRef === 'HEAD' || baseRef.startsWith('-')) return 'main';
  return baseRef;
}

/**
 * The RESOLVING form of {@link resolveReviewBase}: when the workspace only carries
 * the detached `HEAD` sentinel (or an unset / option-poisoned ref), probe the
 * worktree git-native for the repo's REAL integration base instead of the literal
 * `main` — so the per-file diff edges compute against the branch that actually
 * exists (`master` / `develop` / …). Falls back to the sync `resolveReviewBase`
 * literal only when there is no worktree or git cannot answer. Never throws.
 */
export async function resolveReviewBaseResolved(
  deps: Pick<ReviewOpsDeps, 'exec'>,
  ws: Pick<Workspace, 'baseRef' | 'worktreePath'>,
): Promise<string> {
  const baseRef = ws.baseRef;
  if (baseRef && baseRef !== 'HEAD' && !baseRef.startsWith('-')) return baseRef;
  if (ws.worktreePath) {
    const resolved = await resolveRepoDefaultBranch(deps.exec ?? execFileSafe, ws.worktreePath);
    if (resolved) return resolved;
  }
  return resolveReviewBase(ws);
}

/** Map a git status letter to a stable label (R/C → renamed; M/T/U/other → modified). */
function letterToStatus(letter: string): DiffFileStatus {
  switch (letter) {
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
    case 'C':
      return 'renamed';
    default:
      return 'modified';
  }
}

/**
 * Parse `git diff --name-status -z` output (NUL-tokenized) into the authoritative
 * status + rename-oldPath per changed file. The code token comes first; an `R*`/`C*`
 * record consumes the NEXT two tokens (old, new) with the key being the NEW path and
 * `oldPath` capturing the old; every other record consumes one path token.
 */
export function parseNameStatusZ(
  stdout: string,
): { status: DiffFileStatus; path: string; oldPath?: string }[] {
  const tokens = stdout.split('\0');
  const out: { status: DiffFileStatus; path: string; oldPath?: string }[] = [];
  let i = 0;
  while (i < tokens.length) {
    const code = tokens[i];
    if (!code) {
      i += 1;
      continue;
    }
    const letter = code[0] ?? '';
    const status = letterToStatus(letter);
    if (letter === 'R' || letter === 'C') {
      const oldPath = tokens[i + 1];
      const newPath = tokens[i + 2];
      i += 3;
      if (newPath) out.push({ status, path: newPath, ...(oldPath ? { oldPath } : {}) });
    } else {
      const path = tokens[i + 1];
      i += 2;
      if (path) out.push({ status, path });
    }
  }
  return out;
}

/** `-` ⇒ null (binary), a finite number ⇒ itself, anything else ⇒ null (never a guess). */
function parseCount(token: string): number | null {
  if (token === '-') return null;
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse `git diff --numstat -z` output (NUL-tokenized) into a `path → counts` map.
 * Each record's first token is `insertions\tdeletions\trest`; when `rest === ''`
 * it is a rename and the NEXT two tokens are the old/new paths (keyed by NEW).
 * A binary file's counts are `-` → `null` (truthful, never fabricated as 0).
 */
export function parseNumstatZ(
  stdout: string,
): Map<string, { insertions: number | null; deletions: number | null }> {
  const tokens = stdout.split('\0');
  const map = new Map<string, { insertions: number | null; deletions: number | null }>();
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (!token) {
      i += 1;
      continue;
    }
    const parts = token.split('\t');
    if (parts.length < 3) {
      i += 1;
      continue;
    }
    const insertions = parseCount(parts[0]);
    const deletions = parseCount(parts[1]);
    const rest = parts.slice(2).join('\t');
    let key: string | undefined;
    if (rest === '') {
      // Rename: the two following NUL tokens are old,new — key by the NEW path.
      key = tokens[i + 2];
      i += 3;
    } else {
      key = rest;
      i += 1;
    }
    if (key) map.set(key, { insertions, deletions });
  }
  return map;
}

/**
 * Slice the workspace's `/diff` blob into a per-file changed list — the working
 * tree diffed against {@link resolveReviewBase} (TWO-dot `git diff <base>`, so it
 * captures uncommitted worktree work and stays a faithful slice of the `/diff`
 * blob). Read-only + PURE: unlike {@link workspaceDiff} it NEVER transitions the
 * workspace. Degrade-truthful — a missing workspace throws a "not found" (route →
 * 404); everything else (no worktree, non-repo, git absent, exec fault) degrades
 * to `available:false, files:[]`, NEVER a 500 and never a fabricated file. Untracked
 * files are intentionally OUT of scope (the analog of the blob PATCH, which also
 * excludes them; they stay in `/diff.untracked` + `/tree.changed`).
 */
export async function workspaceDiffFiles(
  deps: ReviewOpsDeps,
  workspaceId: string,
): Promise<WorkspaceDiffFilesView> {
  const workspace = await deps.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  const base = await resolveReviewBaseResolved(deps, workspace);
  const branch = workspace.branch ?? '';
  if (!workspace.worktreePath) {
    return { workspaceId, base, branch, available: false, files: [] };
  }
  const wt = workspace.worktreePath;
  const exec = deps.exec ?? execFileSafe;
  const options = { timeoutMs: PER_FILE_DIFF_TIMEOUT_MS, maxBuffer: PER_FILE_DIFF_MAX_BUFFER };
  try {
    // base is fenced before `--`; no pathspec follows. numstat carries the line
    // counts; name-status is authoritative for status + rename oldPath.
    const [numstat, nameStatus] = await Promise.all([
      exec('git', ['-C', wt, 'diff', '--numstat', '-z', base, '--'], options),
      exec('git', ['-C', wt, 'diff', '--name-status', '-z', base, '--'], options),
    ]);
    const counts = parseNumstatZ(numstat.stdout);
    const entries = parseNameStatusZ(nameStatus.stdout);
    const files: DiffFileEntry[] = entries.map((entry) => {
      const c = counts.get(entry.path);
      return {
        path: entry.path,
        status: entry.status,
        insertions: c ? c.insertions : null,
        deletions: c ? c.deletions : null,
        ...(entry.oldPath ? { oldPath: entry.oldPath } : {}),
      };
    });
    return { workspaceId, base, branch, available: true, files };
  } catch (err) {
    // No git / not a repo / oversize — a truthful empty list, never a 500.
    deps.logger.warn({ err, workspaceId }, 'conductor diff-files read faulted — reporting unavailable');
    return { workspaceId, base, branch, available: false, files: [] };
  }
}

/**
 * Read ONE file's unified patch (working tree vs {@link resolveReviewBase}). The
 * agent-supplied `path` is the ONLY user input and is passed EXCLUSIVELY as a
 * pathspec AFTER the `--` fence; a leading `-`, an empty string, or an embedded NUL
 * is rejected BEFORE any spawn (defense-in-depth over the route's 400). Read-only +
 * PURE (no state transition). Degrade-truthful: a missing workspace throws "not
 * found" (route → 404); no worktree / non-repo / git absent / oversize ⇒
 * `patch:null, available:false`. `patch:''` = computed, no diff for that path;
 * `binary:true` ⇒ `patch` carries git's binary marker text.
 */
export async function workspaceFilePatch(
  deps: ReviewOpsDeps,
  workspaceId: string,
  path: string,
): Promise<WorkspaceFilePatchView> {
  const workspace = await deps.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  const base = await resolveReviewBaseResolved(deps, workspace);
  const branch = workspace.branch ?? '';

  // Path guard (defense-in-depth, BEFORE any spawn): a poisoned path can never
  // reach exec — no leading `-` (option injection), no empty, no embedded NUL.
  if (!path || path.startsWith('-') || path.includes('\0')) {
    return { workspaceId, base, branch, path, available: false, binary: false, patch: null };
  }
  if (!workspace.worktreePath) {
    return { workspaceId, base, branch, path, available: false, binary: false, patch: null };
  }
  const wt = workspace.worktreePath;
  const exec = deps.exec ?? execFileSafe;
  const options = { timeoutMs: PER_FILE_DIFF_TIMEOUT_MS, maxBuffer: PER_FILE_DIFF_MAX_BUFFER };
  try {
    // base BEFORE `--`; the agent path ONLY as a pathspec AFTER the `--` fence.
    const { stdout } = await exec('git', ['-C', wt, 'diff', base, '--', path], options);
    const binary = /^Binary files .+ differ$/m.test(stdout) || stdout.includes('GIT binary patch');
    return { workspaceId, base, branch, path, available: true, binary, patch: stdout };
  } catch (err) {
    // git absent / not a repo / oversize (maxBuffer trip) — truthful degrade.
    deps.logger.warn({ err, workspaceId, path }, 'conductor file-patch read faulted — reporting unavailable');
    return { workspaceId, base, branch, path, available: false, binary: false, patch: null };
  }
}

export type AdvanceWorkspaceFn = (
  workspaceId: string,
  to: WorkspaceState,
  patch?: Partial<Workspace>,
  metadata?: Record<string, unknown>,
) => Promise<Workspace>;

export interface ReviewOpsDeps {
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  readonly advanceWorkspace: AdvanceWorkspaceFn;
  readonly getSubstrate: (id: WorkspaceSubstrate) => ConductorSubstrate;
  readonly logger: Logger;
  /** Optional write-lock port — archive releases the workspace's repo scope. */
  readonly lock?: WorkLockPort;
  /** Child-process seam for host git (tree); defaults to `execFileSafe`. */
  readonly exec?: typeof execFileSafe;
}

async function requireWorktree(
  deps: ReviewOpsDeps,
  workspaceId: string,
): Promise<Workspace & { worktreePath: string }> {
  const workspace = await deps.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  if (!workspace.worktreePath) throw new Error(`workspace has no worktree: ${workspaceId}`);
  return workspace as Workspace & { worktreePath: string };
}

/**
 * Compute the reviewable diff of the workspace's worktree against its base ref,
 * and move the workspace to `awaiting_review` (when it is currently running).
 */
export async function workspaceDiff(
  deps: ReviewOpsDeps,
  workspaceId: string,
): Promise<WorkspaceDiffView> {
  const workspace = await requireWorktree(deps, workspaceId);
  const base = workspace.baseRef || 'HEAD';

  const result = await deps.getSubstrate(workspace.substrate).diff(
    { ref: workspaceId, sessionName: workspace.sessionName, worktreePath: workspace.worktreePath },
    base,
  );

  if (workspace.state === 'running') {
    await deps.advanceWorkspace(workspaceId, 'awaiting_review', undefined, {
      changedFiles: result.changedFiles,
    });
  }

  return {
    workspaceId,
    baseRef: base,
    branch: workspace.branch,
    stat: result.stat,
    patch: result.patch,
    untracked: result.untracked,
    changedFiles: result.changedFiles,
  };
}

/** Run a git command in the worktree, returning trimmed non-empty stdout lines. Degrade-safe. */
async function gitLines(deps: ReviewOpsDeps, cwd: string, args: string[]): Promise<string[]> {
  const exec = deps.exec ?? execFileSafe;
  try {
    const { stdout } = await exec('git', ['-C', cwd, ...args], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout.split('\n').map((s) => s.trimEnd()).filter(Boolean);
  } catch {
    // No git / not a repo / empty tree — surface an empty tree, never throw.
    return [];
  }
}

/**
 * List the workspace worktree's files as a flat, sorted path list (tracked via
 * `git ls-files` + untracked via `git status --porcelain`, gitignore-aware),
 * marking which are changed. This powers the right panel's "All files" tree —
 * the full workspace, not just the diff.
 */
export async function workspaceTree(
  deps: ReviewOpsDeps,
  workspaceId: string,
): Promise<WorkspaceTreeView> {
  const workspace = await requireWorktree(deps, workspaceId);
  const cwd = workspace.worktreePath;

  const tracked = await gitLines(deps, cwd, ['ls-files']);
  const status = await gitLines(deps, cwd, ['status', '--porcelain']);

  const changed = new Set<string>();
  const untracked: string[] = [];
  for (const line of status) {
    // Porcelain: "XY <path>"; renames are "R  old -> new" — take the new path.
    let path = line.slice(3).trim();
    const arrow = path.indexOf(' -> ');
    if (arrow !== -1) path = path.slice(arrow + 4).trim();
    if (!path) continue;
    changed.add(path);
    if (line.startsWith('??')) untracked.push(path);
  }

  const all = Array.from(new Set([...tracked, ...untracked])).sort((a, b) => a.localeCompare(b));
  const truncated = all.length > MAX_TREE_FILES;
  return {
    workspaceId,
    files: truncated ? all.slice(0, MAX_TREE_FILES) : all,
    changed: Array.from(changed),
    truncated,
  };
}

/**
 * Archive a finished workspace: stop its session, remove its worktree, release
 * its write-lock scope, and move the record to `archived`. Idempotent-ish; safe
 * to call after merge or failure.
 */
export async function archiveWorkspace(
  deps: ReviewOpsDeps,
  workspaceId: string,
): Promise<Workspace> {
  const workspace = await deps.getWorkspace(workspaceId);
  if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
  if (workspace.state === 'archived') return workspace;

  // Release the workspace's write-lock so its repo scope is freed for the next
  // workspace. Degrade-safe (no-op when locking is disabled/unavailable).
  if (deps.lock) {
    try {
      await deps.lock.release({
        workspaceId,
        spaceId: workspace.spaceId,
        taskId: workspace.taskId,
      });
    } catch (err) {
      deps.logger.warn({ workspaceId, err }, 'lock release on archive failed');
    }
  }

  await deps.getSubstrate(workspace.substrate).teardown(
    { ref: workspaceId, sessionName: workspace.sessionName, worktreePath: workspace.worktreePath },
    { removeIsolation: true },
  );

  // archived is only reachable from merged|failed|cancelled — cancel first if needed.
  if (!['merged', 'failed', 'cancelled'].includes(workspace.state)) {
    await deps.advanceWorkspace(workspaceId, 'cancelled');
  }
  const archived = await deps.advanceWorkspace(workspaceId, 'archived', {
    worktreePath: undefined,
    sessionName: undefined,
  });
  deps.logger.info({ workspaceId }, 'workspace archived');
  return archived;
}
