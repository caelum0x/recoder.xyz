/**
 * Convergence compose (product step 2 → 3 bridge) — MATERIALIZE a
 * {@link ConvergencePlan} into a NEW convergence worktree/branch: start from the
 * task's base, apply each winning sibling's version of each file, commit, and
 * register a normal Workspace record. The result then flows through the EXISTING
 * governed merge + exportable evidence path (nothing new is invented downstream).
 *
 * Git-native + reuse-only: it drives the SAME host `git` seam (`execFileSafe`) the
 * merge/checkpoint ops already use — `git worktree add` for the fresh worktree, a
 * plain file copy from each winning sibling's worktree for the whole-file pick, and
 * an identity-scoped commit (mirroring `commitWorktreeChanges`). It invents NO new
 * git layer and launches NO agent (unlike `engine.createWorkspace`, which spawns a
 * CLI): compose produces only a reviewable branch.
 *
 * Whole-file pick (the correct first cut): a winning file is taken verbatim from the
 * chosen sibling's worktree; there is NO semantic/AST merge WITHIN a file. Line-level
 * synthesis of two siblings' edits to the SAME file is explicitly deferred.
 *
 * Truthful throughout: an incomplete plan (unresolved contested paths) throws BEFORE
 * any git runs (the composer maps it to a 4xx with the unresolved paths); a missing
 * source worktree / git failure surfaces its real message — nothing is faked, and a
 * half-created worktree is cleaned up on failure so a retry is never wedged.
 */
import { execFileSafe } from '@recoder/substrate';
import path from 'node:path';
import { cp, mkdir, rm } from 'node:fs/promises';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import { resolveRepoDefaultBranch } from '../git-default-branch.js';
import {
  planConvergence,
  type ConvergencePlan,
  type ConvergencePlanSiblingInput,
} from './converge-plan.service.js';

/** Thrown when the plan still has unresolved contested paths — mapped to a 4xx. */
export class UnresolvedConvergenceError extends Error {
  constructor(readonly plan: ConvergencePlan) {
    super(
      `convergence plan has ${plan.unresolved.length} unresolved contested path(s): ` +
        plan.unresolved.map((u) => u.path).join(', '),
    );
    this.name = 'UnresolvedConvergenceError';
  }
}

/** Thrown when the group has nothing to converge (no ≥2 candidates, or no changes). */
export class EmptyConvergenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyConvergenceError';
  }
}

/** The convergence provenance stamped onto the composed workspace's metadata (→ evidence). */
export interface ConvergenceProvenance {
  readonly fromTaskGroup: string | null;
  readonly sourceCount: number;
  readonly fileCount: number;
  readonly selections: readonly {
    readonly path: string;
    readonly sourceWorkspaceId: string;
    readonly contested: boolean;
  }[];
}

/** Input to compose a convergence from a parallel-run group + a per-contested-file selection. */
export interface ComposeConvergenceInput {
  readonly taskGroup: string;
  /** Contested path → chosen sibling workspaceId. */
  readonly selection: Readonly<Record<string, string>>;
  /** Branch name for the new worktree (default: `recoder/converge-<shortId>`). */
  readonly branch?: string;
  /** The actor composing (stamped from the principal by the composer). */
  readonly createdBy: string;
}

/** The truthful result of composing a convergence workspace. */
export interface ComposeConvergenceResult {
  /** The NEW composed workspace id — the one to review + merge. */
  readonly workspaceId: string;
  readonly branch: string;
  readonly base: string;
  readonly taskGroup: string;
  readonly fileCount: number;
  readonly plan: ConvergencePlan;
  readonly workspace: Workspace;
}

/** The injected seams the compose op runs over — no module singletons, no env. */
export interface ConvergeOpsDeps {
  /** The side-by-side compare view of the group (the composer's compare read). */
  readonly compare: (taskGroup: string) => Promise<{
    readonly count: number;
    readonly siblings: readonly {
      readonly workspaceId: string;
      readonly agent: string;
      readonly changedFiles?: readonly string[];
    }[];
  }>;
  /** Fetch a workspace record by id (source worktrees + inherited fields). */
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  /** Persist the composed Workspace record (the composer's `repository.upsertWorkspace`). */
  readonly registerWorkspace: (workspace: Workspace) => Promise<Workspace>;
  readonly logger: Logger;
  /** Child-process seam for host git; defaults to `execFileSafe`. */
  readonly exec?: typeof execFileSafe;
  /** Id generator; defaults to `crypto.randomUUID`. */
  readonly newId?: () => string;
  /** Clock seam; defaults to `new Date().toISOString()`. */
  readonly now?: () => string;
  /**
   * Resolve the absolute path the new worktree is created at, from the repo path +
   * a short id. Defaults to a sibling dir of the repo (`<repo>-converge-<shortId>`).
   */
  readonly worktreePathFor?: (repoPath: string, shortId: string) => string;
}

function runGit(deps: ConvergeOpsDeps) {
  const exec = deps.exec ?? execFileSafe;
  return async (cwd: string, args: string[]): Promise<string> => {
    const { stdout } = await exec('git', ['-C', cwd, ...args], { maxBuffer: 16 * 1024 * 1024 });
    return stdout.trim();
  };
}

/**
 * Reject a changed path that could escape the worktree (defense-in-depth over the
 * git-tracked list): no absolute path, no `..` segment, no leading `-`, no NUL.
 */
function isSafeRelPath(p: string): boolean {
  if (!p || p.startsWith('-') || p.includes('\0')) return false;
  if (path.isAbsolute(p)) return false;
  return !p.split(/[\\/]/).some((seg) => seg === '..');
}

/** Resolve the repository's PRIMARY working tree from a member worktree path. */
async function resolveMainRepo(deps: ConvergeOpsDeps, worktreePath: string): Promise<string> {
  const git = runGit(deps);
  try {
    const out = await git(worktreePath, ['worktree', 'list', '--porcelain']);
    const first = out.split('\n').find((line) => line.startsWith('worktree '));
    if (first) return first.slice('worktree '.length).trim();
  } catch {
    /* fall through to the worktree itself */
  }
  return worktreePath;
}

/** Resolve the base ref the convergence branches from (concrete ref, else repo default). */
async function resolveBase(
  deps: ConvergeOpsDeps,
  primary: Workspace,
  repoPath: string,
): Promise<string> {
  if (primary.baseRef && primary.baseRef !== 'HEAD' && !primary.baseRef.startsWith('-')) {
    return primary.baseRef;
  }
  const resolved = await resolveRepoDefaultBranch(deps.exec ?? execFileSafe, repoPath);
  return resolved ?? 'main';
}

/**
 * Compose a convergence: fold the plan, materialize the winning file versions into a
 * fresh worktree/branch off the base, commit, and register the composed Workspace.
 * Throws {@link EmptyConvergenceError} / {@link UnresolvedConvergenceError} (mapped
 * to 4xx) BEFORE any git mutation; any git failure aborts + cleans up the partial
 * worktree before re-throwing (never a wedged half-created worktree).
 */
export async function composeConvergence(
  deps: ConvergeOpsDeps,
  input: ComposeConvergenceInput,
): Promise<ComposeConvergenceResult> {
  const git = runGit(deps);
  const view = await deps.compare(input.taskGroup);
  if (view.count < 2) {
    throw new EmptyConvergenceError(
      `convergence needs ≥2 candidate workspaces in task group '${input.taskGroup}' (found ${view.count})`,
    );
  }

  const siblings: ConvergencePlanSiblingInput[] = view.siblings.map((s) => ({
    workspaceId: s.workspaceId,
    agent: s.agent,
    ...(s.changedFiles ? { changedFiles: s.changedFiles } : {}),
  }));
  const plan = planConvergence({ taskGroup: input.taskGroup, siblings, selection: input.selection });
  if (plan.changedFiles.length === 0) {
    throw new EmptyConvergenceError(`no changed files to converge in task group '${input.taskGroup}'`);
  }
  // Unresolved contested paths (or a group whose only changes are all contested +
  // unselected, leaving zero resolved files) — a truthful "decide first", not empty.
  if (!plan.complete) throw new UnresolvedConvergenceError(plan);

  // Resolve every winning source's worktree UP FRONT (a missing one is fatal
  // before we create anything). The FIRST source is the "primary" whose record
  // fields (space/project/task/runtime) the composed workspace inherits.
  const sourceWorktrees = new Map<string, string>();
  for (const source of plan.sources) {
    const ws = await deps.getWorkspace(source.workspaceId);
    if (!ws?.worktreePath) {
      throw new EmptyConvergenceError(
        `source workspace ${source.workspaceId} has no worktree to converge from`,
      );
    }
    sourceWorktrees.set(source.workspaceId, ws.worktreePath);
  }
  const primaryId = plan.sources[0].workspaceId;
  const primary = (await deps.getWorkspace(primaryId)) as Workspace & { worktreePath: string };

  const repoPath = await resolveMainRepo(deps, primary.worktreePath);
  const base = await resolveBase(deps, primary, repoPath);
  const shortId = (deps.newId ?? defaultId)().slice(0, 8);
  const branch = input.branch?.trim() || `recoder/converge-${shortId}`;
  const newWorktree =
    deps.worktreePathFor?.(repoPath, shortId) ?? `${repoPath}-converge-${shortId}`;

  // --- create the fresh worktree off base ------------------------------------
  await git(repoPath, ['worktree', 'add', '-b', branch, newWorktree, base]);

  try {
    // --- materialize each winning file (whole-file pick) ---------------------
    for (const file of plan.files) {
      if (!isSafeRelPath(file.path)) {
        throw new Error(`unsafe convergence path rejected: ${file.path}`);
      }
      const sourceWt = sourceWorktrees.get(file.sourceWorkspaceId);
      if (!sourceWt) throw new Error(`missing source worktree for ${file.sourceWorkspaceId}`);
      const from = path.join(sourceWt, file.path);
      const to = path.join(newWorktree, file.path);
      try {
        await mkdir(path.dirname(to), { recursive: true });
        // `recursive` copies a file or a (renamed-to) dir; overwrites the base copy.
        await cp(from, to, { recursive: true, force: true });
      } catch {
        // The winning sibling DELETED this path (not present in its worktree) —
        // reflect the deletion in the convergence (remove the base's copy).
        await rm(to, { recursive: true, force: true });
      }
    }

    // --- commit the converged tree ------------------------------------------
    const status = await git(newWorktree, ['status', '--porcelain']);
    if (status.length > 0) {
      await git(newWorktree, ['add', '-A']);
      await git(newWorktree, [
        '-c',
        'user.email=agent@recoder.dev',
        '-c',
        'user.name=Recoder Convergence',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '-m',
        `converge ${input.taskGroup}: ${plan.files.length} file(s) from ${plan.sources.length} agent(s)`,
      ]);
    }
  } catch (err) {
    // Clean up the partial worktree so a retry is never wedged, then re-throw.
    await abortWorktree(deps, repoPath, newWorktree);
    throw err;
  }

  // --- register the composed workspace record (no agent launched) -------------
  const now = (deps.now ?? defaultNow)();
  const workspaceId = `ws_${(deps.newId ?? defaultId)()}`;
  const provenance: ConvergenceProvenance = {
    fromTaskGroup: input.taskGroup,
    sourceCount: plan.sources.length,
    fileCount: plan.files.length,
    selections: plan.files.map((f) => ({
      path: f.path,
      sourceWorkspaceId: f.sourceWorkspaceId,
      contested: f.contested,
    })),
  };
  const composed: Workspace = {
    ...primary,
    workspaceId,
    branch,
    baseRef: base,
    worktreePath: newWorktree,
    state: 'awaiting_review',
    // Not a live run: drop the primary's session/run so nothing dangles.
    sessionName: undefined,
    runId: undefined,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    // Own singleton (NO shared `taskGroup`), so compare never re-lists it as a
    // sibling; the source group is recorded under `convergedFromTaskGroup`.
    metadata: {
      convergedFromTaskGroup: input.taskGroup,
      convergence: provenance,
    },
  };
  const workspace = await deps.registerWorkspace(composed);
  deps.logger.info(
    { workspaceId, taskGroup: input.taskGroup, branch, base, fileCount: plan.files.length },
    'composed convergence workspace',
  );
  return {
    workspaceId,
    branch,
    base,
    taskGroup: input.taskGroup,
    fileCount: plan.files.length,
    plan,
    workspace,
  };
}

/** Best-effort removal of a half-created worktree (a failure here is only logged). */
async function abortWorktree(
  deps: ConvergeOpsDeps,
  repoPath: string,
  worktreePath: string,
): Promise<void> {
  const git = runGit(deps);
  try {
    await git(repoPath, ['worktree', 'remove', '--force', worktreePath]);
  } catch {
    // Fall back to a plain rm — the worktree add may not have registered.
    try {
      await rm(worktreePath, { recursive: true, force: true });
    } catch {
      deps.logger.warn({ worktreePath }, 'failed to clean up partial convergence worktree');
    }
  }
}

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}
