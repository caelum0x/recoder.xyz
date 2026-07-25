/**
 * Convergence compose (product step 2 → 3 bridge) — MATERIALIZE a
 * {@link ConvergencePlan} into a NEW convergence worktree/branch: start from the
 * task's base, apply each winning sibling's version of each file, commit, and
 * register a normal Workspace record. The result then flows through the EXISTING
 * governed merge + exportable evidence path (nothing new is invented downstream).
 *
 * Git-native + reuse-only: it drives the SAME host `git` seam (`execFileSafe`) the
 * merge/checkpoint ops already use — `git worktree add` for the fresh worktree, and
 * an identity-scoped commit (mirroring `commitWorktreeChanges`). It invents NO new
 * git layer and launches NO agent (unlike `engine.createWorkspace`, which spawns a
 * CLI): compose produces only a reviewable branch.
 *
 * Two materialization MODES per winning file (from the plan):
 *  - `pick`: the winning file is copied verbatim from the chosen sibling's worktree
 *    (the safe whole-file default);
 *  - `synthesize`: an automatic LINE-LEVEL 3-way merge of the contesting siblings'
 *    versions against the task BASE via `git merge-file` (the standard 3-way). For
 *    N>2 contributors it folds PAIRWISE in workspaceId order — the running result is
 *    `ours`, the next sibling is `theirs`, and the ORIGINAL base is the common
 *    ancestor at every step (deterministic). A CLEAN merge is written; a CONFLICT is
 *    NEVER written as markers into a "trusted" branch — the path flips to UNRESOLVED
 *    (`synthesize-conflict`) and the whole compose aborts so the caller falls back to
 *    an explicit `pick` (preserving the "one TRUSTED change" invariant).
 *
 * Truthful throughout: an incomplete plan (unresolved contested paths) throws BEFORE
 * any git runs; a missing source worktree / git failure surfaces its real message —
 * nothing is faked, and a half-created worktree is cleaned up on failure so a retry
 * is never wedged.
 */
import { execFileSafe, ExecError } from '@recoder/substrate';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import { resolveRepoDefaultBranch } from '../git-default-branch.js';
import {
  planConvergence,
  winnerSources,
  type ConvergenceMode,
  type ConvergencePlan,
  type ConvergencePlanSiblingInput,
  type ConvergenceUnresolved,
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

/** One converged file's provenance entry (matches the evidence `EvidenceFileSelection`). */
export interface ConvergenceSelectionRecord {
  readonly path: string;
  readonly mode: ConvergenceMode;
  /** For `pick`: the winning sibling. ABSENT for `synthesize`. */
  readonly sourceWorkspaceId?: string;
  /** For `synthesize`: the sibling ids whose versions were 3-way merged. ABSENT for `pick`. */
  readonly contributors?: readonly string[];
  readonly contested: boolean;
}

/** The convergence provenance stamped onto the composed workspace's metadata (→ evidence). */
export interface ConvergenceProvenance {
  readonly fromTaskGroup: string | null;
  readonly sourceCount: number;
  readonly fileCount: number;
  readonly selections: readonly ConvergenceSelectionRecord[];
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

  // Scratch space for the 3-way `git merge-file` operands (base/ours/theirs).
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'recoder-3way-'));
  try {
    // --- materialize each winning file (pick = copy, synthesize = 3-way) ------
    const synthConflicts: ConvergenceUnresolved[] = [];
    for (const file of plan.files) {
      if (!isSafeRelPath(file.path)) {
        throw new Error(`unsafe convergence path rejected: ${file.path}`);
      }
      const to = path.join(newWorktree, file.path);

      if (file.mode === 'synthesize') {
        // The pristine worktree copy IS the base version (the worktree was created
        // off base and this path is not overwritten yet) — the 3-way common ancestor.
        const result = await synthesizeFile(deps, {
          basePath: to,
          relPath: file.path,
          contributors: winnerSources(file),
          sourceWorktrees,
          tmpDir,
        });
        if (!result.clean) {
          // NEVER write conflict markers into a "trusted" branch — flip to unresolved.
          synthConflicts.push({ path: file.path, candidates: file.candidates, reason: 'synthesize-conflict' });
          continue;
        }
        await mkdir(path.dirname(to), { recursive: true });
        await writeFile(to, result.content);
        continue;
      }

      // pick: copy the chosen sibling's whole file (a deletion ⇒ remove the base copy).
      const sourceId = file.sourceWorkspaceId;
      const sourceWt = sourceId ? sourceWorktrees.get(sourceId) : undefined;
      if (!sourceWt) throw new Error(`missing source worktree for ${sourceId ?? '(none)'}`);
      const from = path.join(sourceWt, file.path);
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

    // A synthesize CONFLICT means the convergence is not trustworthy as requested —
    // abort the whole compose (no partial/marker-poisoned branch) so the caller
    // re-picks those paths. UnresolvedConvergenceError → the composer maps it to 4xx.
    if (synthConflicts.length > 0) {
      throw new UnresolvedConvergenceError(withSynthesizeConflicts(plan, synthConflicts));
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
  } finally {
    // The 3-way scratch dir is always disposable.
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
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
      mode: f.mode,
      ...(f.sourceWorkspaceId ? { sourceWorkspaceId: f.sourceWorkspaceId } : {}),
      ...(f.contributors ? { contributors: f.contributors } : {}),
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

/** Rebuild a plan with the synthesize-conflicted paths moved from `files` to `unresolved`. */
function withSynthesizeConflicts(
  plan: ConvergencePlan,
  conflicts: readonly ConvergenceUnresolved[],
): ConvergencePlan {
  const conflictPaths = new Set(conflicts.map((c) => c.path));
  return {
    ...plan,
    files: plan.files.filter((f) => !conflictPaths.has(f.path)),
    unresolved: [...plan.unresolved, ...conflicts].sort((a, b) => a.path.localeCompare(b.path)),
    complete: false,
  };
}

/** Read a file as UTF-8, or `null` when it does not exist (a truthful absence, not a throw). */
async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * LINE-LEVEL 3-way synthesis of a contested path across its contributors, against
 * the base (common ancestor). Folds pairwise in the given (workspaceId-sorted)
 * order: `running := contributor[0]`, then for each next contributor `running :=
 * merge-file(ours=running, base, theirs=next)`, base fixed as the ancestor. A clean
 * fold returns the merged content; ANY conflict (or a contributor that DELETED the
 * path — a delete/modify that cannot auto-merge) returns `{clean:false}` so the
 * caller flips the path to `synthesize-conflict`. Never throws for a merge conflict.
 */
async function synthesizeFile(
  deps: ConvergeOpsDeps,
  args: {
    readonly basePath: string;
    readonly relPath: string;
    readonly contributors: readonly string[];
    readonly sourceWorktrees: Map<string, string>;
    readonly tmpDir: string;
  },
): Promise<{ clean: true; content: string } | { clean: false }> {
  const { basePath, relPath, contributors, sourceWorktrees, tmpDir } = args;
  if (contributors.length === 0) return { clean: false };

  // Base = the pristine worktree copy; absent (added-by-both) ⇒ an empty ancestor.
  const baseContent = (await readOptional(basePath)) ?? '';

  // Each contributor's version; a MISSING one is a delete/modify — cannot synthesize.
  const versions: string[] = [];
  for (const workspaceId of contributors) {
    const wt = sourceWorktrees.get(workspaceId);
    if (!wt) return { clean: false };
    const content = await readOptional(path.join(wt, relPath));
    if (content === null) return { clean: false }; // deletion vs edit ⇒ conflict
    versions.push(content);
  }

  const baseFile = path.join(tmpDir, 'base');
  const oursFile = path.join(tmpDir, 'ours');
  const theirsFile = path.join(tmpDir, 'theirs');
  await writeFile(baseFile, baseContent);

  let running = versions[0];
  for (let i = 1; i < versions.length; i += 1) {
    await writeFile(oursFile, running);
    await writeFile(theirsFile, versions[i]);
    const merged = await mergeFile(deps, oursFile, baseFile, theirsFile);
    if (!merged.clean) return { clean: false };
    running = merged.content;
  }
  return { clean: true, content: running };
}

/**
 * Run `git merge-file -p ours base theirs` (a pure 3-way merge to stdout — it never
 * mutates the operands). Exit 0 ⇒ clean; a small positive exit with a non-empty
 * stdout is git's truthful "N conflicts" (the merged-with-markers content) ⇒
 * `{clean:false}`. Any OTHER failure (git absent, unreadable operand) re-throws so a
 * real fault surfaces truthfully instead of masquerading as a merge conflict.
 */
async function mergeFile(
  deps: ConvergeOpsDeps,
  oursFile: string,
  baseFile: string,
  theirsFile: string,
): Promise<{ clean: boolean; content: string }> {
  const exec = deps.exec ?? execFileSafe;
  try {
    const { stdout } = await exec('git', ['merge-file', '-p', oursFile, baseFile, theirsFile], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return { clean: true, content: stdout };
  } catch (err) {
    if (
      err instanceof ExecError &&
      typeof err.code === 'number' &&
      err.code > 0 &&
      err.code < 128 &&
      err.stdout.length > 0
    ) {
      return { clean: false, content: err.stdout };
    }
    throw err;
  }
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
