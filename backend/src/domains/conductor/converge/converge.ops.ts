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
 * Three materialization MODES per winning file (from the plan):
 *  - `pick`: the winning file is copied verbatim from the chosen sibling's worktree
 *    (the safe whole-file default);
 *  - `synthesize`: an automatic LINE-LEVEL 3-way merge of the contesting siblings'
 *    versions against the task BASE via `git merge-file` (the standard 3-way). For
 *    N>2 contributors it folds PAIRWISE in workspaceId order — the running result is
 *    `ours`, the next sibling is `theirs`, and the ORIGINAL base is the common
 *    ancestor at every step (deterministic). A CLEAN merge is written; a CONFLICT is
 *    NEVER written as markers into a "trusted" branch — the path flips to UNRESOLVED
 *    (`synthesize-conflict`) and the whole compose aborts so the caller falls back to
 *    an explicit `pick` (preserving the "one TRUSTED change" invariant);
 *  - `assisted` (explicit per-file opt-in): the SAME mechanical 3-way runs first, and
 *    ONLY a conflicting fold escalates to a one-shot LLM synthesis via the injected
 *    `deps.inference`. A VALIDATED response (non-empty, marker-free, preserving every
 *    line both sides agreed on) is written and recorded on `plan.assisted` (never a
 *    silent quality degrade); an invalid response, `routed:false`, or an unwired
 *    inference dep falls through to the exact `synthesize-conflict` behavior above.
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
// Type-only cross-domain seam (erased at build — boundary-legal): the VALUE is
// injected via `ConvergeOpsDeps.inference`, never imported here.
import type {
  TensorzeroInferenceInput,
  TensorzeroInferenceResult,
} from '../../inference/tensorzero-embedded-client.js';
import { resolveRepoDefaultBranch } from '../git-default-branch.js';
import {
  planConvergence,
  winnerSources,
  type AssistedFileRecord,
  type ConflictRegion,
  type ContestedProbe,
  type ConvergenceMode,
  type ConvergencePlan,
  type ConvergencePlanSiblingInput,
  type ConvergenceUnresolved,
} from './converge-plan.service.js';

export type { AssistedFileRecord, ConflictRegion } from './converge-plan.service.js';

/**
 * The degrade-safe one-shot inference seam `assisted` synthesis runs over —
 * signature-compatible with `postInference` (inference domain), which NEVER throws
 * and answers `routed:false` on any unavailability.
 */
export type ConvergeInferenceFn = (
  input: TensorzeroInferenceInput,
) => Promise<TensorzeroInferenceResult>;

/**
 * Bounded assist payloads — an oversized contributor version (per-version cap) or
 * an oversized composed prompt (total cap) SKIPS the LLM escalation and degrades
 * truthfully to the mechanical `synthesize-conflict` path (a plan-visible
 * unresolved entry + a logged note), never an unbounded inference call.
 */
export const MAX_ASSIST_FILE_BYTES = 64 * 1024;
export const MAX_ASSIST_PROMPT_BYTES = 256 * 1024;

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
  /** For `pick`: the winning sibling. ABSENT for `synthesize`/`assisted`. */
  readonly sourceWorkspaceId?: string;
  /** For `synthesize`/`assisted`: the sibling ids whose versions merged. ABSENT for `pick`. */
  readonly contributors?: readonly string[];
  readonly contested: boolean;
}

/** The convergence provenance stamped onto the composed workspace's metadata (→ evidence). */
export interface ConvergenceProvenance {
  readonly fromTaskGroup: string | null;
  readonly sourceCount: number;
  readonly fileCount: number;
  readonly selections: readonly ConvergenceSelectionRecord[];
  /** Files whose conflicts an LLM resolved (validated output) — ABSENT when none. */
  readonly assisted?: readonly AssistedFileRecord[];
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
  /**
   * OPTIONAL one-shot LLM inference for `assisted` files. WIRING POINT: the
   * composition layer (`conductor-module.convergeDeps`) injects `postInference`
   * from `src/domains/inference/tensorzero-embedded-client.ts` here — a value
   * import would cross the domain boundary, so the ops take it as a dep and stay
   * pure. ABSENT ⇒ every `assisted` conflict falls back to `synthesize-conflict`
   * (mechanical behavior; never a fake merge).
   */
  readonly inference?: ConvergeInferenceFn;
  /**
   * The inference function name the assist call addresses. OWNED by the
   * composition layer (the inference domain's canonical default chat function —
   * `TENSORZERO_DEFAULT_FUNCTION`), NEVER hardcoded here: the ops stay name-free
   * so a rename in the inference domain cannot silently drift. `inference` wired
   * WITHOUT a name ⇒ assist skips truthfully (mechanical `synthesize-conflict`).
   */
  readonly inferenceFunctionName?: string;
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
  // Which files an LLM actually wrote (validated assisted syntheses) — recorded on
  // the plan + provenance so the evidence trail NEVER hides a model-authored merge.
  const assistedRecords: AssistedFileRecord[] = [];
  try {
    // --- materialize each winning file (pick = copy, synthesize/assisted = 3-way) ---
    const synthConflicts: ConvergenceUnresolved[] = [];
    for (const file of plan.files) {
      if (!isSafeRelPath(file.path)) {
        throw new Error(`unsafe convergence path rejected: ${file.path}`);
      }
      const to = path.join(newWorktree, file.path);

      if (file.mode === 'synthesize' || file.mode === 'assisted') {
        // The pristine worktree copy IS the base version (the worktree was created
        // off base and this path is not overwritten yet) — the 3-way common ancestor.
        const result = await synthesizeFile(deps, {
          basePath: to,
          relPath: file.path,
          mode: file.mode,
          contributors: winnerSources(file),
          sourceWorktrees,
          tmpDir,
        });
        if (!result.clean) {
          // NEVER write conflict markers into a "trusted" branch — flip to unresolved.
          synthConflicts.push({ path: file.path, candidates: file.candidates, reason: 'synthesize-conflict' });
          continue;
        }
        if (result.assisted) assistedRecords.push(result.assisted);
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
      } catch (err) {
        // ONLY a genuinely-absent source (ENOENT) means the winning sibling
        // DELETED this path — reflect the deletion (remove the base's copy). ANY
        // other cp fault (EACCES/ENOSPC/EIO/ENOTDIR/…) must NOT be silently read
        // as a deletion: doing so would DROP the file from the convergence on a
        // transient error — real data loss. Re-throw so the whole compose aborts
        // (mapped to a 5xx) rather than shipping a lossy "trusted" branch. (recoder-ezov)
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
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
  // The plan the caller gets back (and evidence serializes) carries the assisted
  // record — `plan.files` iterates path-sorted, so the records are path-sorted too.
  const finalPlan: ConvergencePlan =
    assistedRecords.length > 0 ? { ...plan, assisted: assistedRecords } : plan;
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
    ...(assistedRecords.length > 0 ? { assisted: assistedRecords } : {}),
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
    plan: finalPlan,
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

/** A synthesized file's outcome; `assisted` is set ONLY when an LLM wrote the content. */
type SynthesisOutcome =
  | { readonly clean: true; readonly content: string; readonly assisted?: AssistedFileRecord }
  | { readonly clean: false };

/**
 * LINE-LEVEL 3-way synthesis of a contested path across its contributors, against
 * the base (common ancestor). Folds pairwise in the given (workspaceId-sorted)
 * order: `running := contributor[0]`, then for each next contributor `running :=
 * merge-file(ours=running, base, theirs=next)`, base fixed as the ancestor. A clean
 * fold returns the merged content. A CONFLICT: in `assisted` mode it escalates to a
 * one-shot LLM synthesis ({@link assistSynthesis}); otherwise — and for a contributor
 * that DELETED the path (a delete/modify with no version to fold OR prompt) — it
 * returns `{clean:false}` so the caller flips the path to `synthesize-conflict`.
 * Never throws for a merge conflict.
 */
async function synthesizeFile(
  deps: ConvergeOpsDeps,
  args: {
    readonly basePath: string;
    readonly relPath: string;
    readonly mode: 'synthesize' | 'assisted';
    readonly contributors: readonly string[];
    readonly sourceWorktrees: Map<string, string>;
    readonly tmpDir: string;
  },
): Promise<SynthesisOutcome> {
  const { basePath, relPath, mode, contributors, sourceWorktrees, tmpDir } = args;
  // Base = the pristine worktree copy; absent (added-by-both) ⇒ an empty ancestor.
  const baseContent = (await readOptional(basePath)) ?? '';
  const gathered = await gatherContributorVersions(sourceWorktrees, relPath, contributors);
  if (!gathered.ok) return { clean: false }; // missing contributor ⇒ delete/modify
  const fold = await threeWayFold(deps, baseContent, gathered.versions, tmpDir);
  if (fold.clean) return fold;
  if (mode !== 'assisted') return { clean: false };
  return assistSynthesis(deps, {
    relPath,
    baseContent,
    contributors,
    versions: gathered.versions,
    conflictContent: fold.content,
  });
}

/**
 * One-shot LLM synthesis of a mechanically-unmergeable contested file. Asks the
 * injected inference for a SINGLE complete merged file, then VALIDATES the reply
 * (non-empty, marker-free, every line both sides agreed on outside the conflict
 * regions still present) before trusting it. ANY failure — no inference wired,
 * `routed:false`, unparsable/invalid output — returns `{clean:false}` so the caller
 * falls back to the exact mechanical `synthesize-conflict` path (never a silent
 * quality degrade, never a fabricated merge).
 *
 * WHY (prompt-injection posture): the model's output here is FILE CONTENT entering
 * an ALREADY-reviewable composed workspace — the same trust level as agent-written
 * code in a sibling worktree. It is never auto-merged: the composed branch still
 * goes through review and the governed merge gate, and `plan.assisted` +
 * provenance record exactly which files a model wrote.
 */
async function assistSynthesis(
  deps: ConvergeOpsDeps,
  args: {
    readonly relPath: string;
    readonly baseContent: string;
    readonly contributors: readonly string[];
    readonly versions: readonly string[];
    readonly conflictContent?: string;
  },
): Promise<SynthesisOutcome> {
  if (!deps.inference) return { clean: false }; // not wired ⇒ mechanical behavior
  const functionName = deps.inferenceFunctionName;
  if (!functionName) {
    // Never guess a function name — the composition layer owns it (see the dep doc).
    deps.logger.warn(
      { path: args.relPath },
      'assisted synthesis skipped — inference wired without a function name; falling back to synthesize-conflict',
    );
    return { clean: false };
  }
  if (args.versions.some((v) => Buffer.byteLength(v, 'utf8') > MAX_ASSIST_FILE_BYTES)) {
    deps.logger.warn(
      { path: args.relPath, capBytes: MAX_ASSIST_FILE_BYTES },
      'assisted synthesis skipped — a contributor version exceeds the per-version byte cap; falling back to synthesize-conflict',
    );
    return { clean: false };
  }
  const regions = args.conflictContent != null ? parseConflictRegions(args.conflictContent) : [];
  const prompt = buildAssistPrompt(args, regions);
  if (Buffer.byteLength(prompt, 'utf8') > MAX_ASSIST_PROMPT_BYTES) {
    deps.logger.warn(
      { path: args.relPath, capBytes: MAX_ASSIST_PROMPT_BYTES },
      'assisted synthesis skipped — the merge prompt exceeds the total byte cap; falling back to synthesize-conflict',
    );
    return { clean: false };
  }
  const result = await deps.inference({
    function_name: functionName,
    input: { messages: [{ role: 'user', content: prompt }] },
  });
  if (!result.routed) {
    deps.logger.warn(
      { path: args.relPath, reason: result.reason },
      'assisted synthesis unavailable — falling back to synthesize-conflict',
    );
    return { clean: false };
  }
  const merged = stripCodeFences(extractInferenceText(result.content));
  if (!isValidAssistedMerge(merged, args.conflictContent)) {
    deps.logger.warn(
      { path: args.relPath, inferenceId: result.inference_id },
      'assisted synthesis output failed validation — falling back to synthesize-conflict',
    );
    return { clean: false };
  }
  return {
    clean: true,
    content: merged,
    assisted: {
      path: args.relPath,
      ...(result.inference_id ? { inference_id: result.inference_id } : {}),
    },
  };
}

/** Build the single-turn merge prompt: path, base, contributor versions, conflict regions. */
function buildAssistPrompt(
  args: {
    readonly relPath: string;
    readonly baseContent: string;
    readonly contributors: readonly string[];
    readonly versions: readonly string[];
  },
  regions: readonly ConflictRegion[],
): string {
  const parts: string[] = [
    'You are merging divergent versions of one file produced by parallel coding agents.',
    `File path: ${args.relPath}`,
    'An automatic line-level 3-way merge of the versions below CONFLICTED. Produce the',
    'single best merged file that preserves the INTENT of every version.',
    '',
    'Rules:',
    '- Reply with the COMPLETE merged file content and NOTHING else.',
    '- No conflict markers (<<<<<<< / ======= / >>>>>>>), no commentary, no code fences.',
    '- Keep every line the versions agree on unchanged.',
    '',
    '--- BASE (common ancestor) ---',
    args.baseContent,
  ];
  args.contributors.forEach((workspaceId, i) => {
    parts.push(`--- VERSION from ${workspaceId} ---`, args.versions[i] ?? '');
  });
  if (regions.length > 0) {
    parts.push('--- CONFLICTING REGIONS (from the failed automatic merge) ---');
    for (const region of regions) {
      parts.push(
        `lines ${region.startLine}-${region.endLine}:`,
        `  ours:   ${region.ours.join('\n          ')}`,
        `  theirs: ${region.theirs.join('\n          ')}`,
      );
    }
  }
  return parts.join('\n');
}

/** Flatten a TensorZero `content` payload (string or text-block array) to plain text. */
function extractInferenceText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      if (block && typeof block === 'object' && typeof (block as { text?: unknown }).text === 'string') {
        return (block as { text: string }).text;
      }
      return '';
    })
    .join('');
}

/**
 * Strip ONE wrapping markdown code fence (```lang … ```) when both the opening and
 * closing fence are present — models add them despite instructions. Unfenced text
 * passes through untouched; a non-empty result is normalized to end with a newline.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return '';
  let body = trimmed;
  if (trimmed.startsWith('```')) {
    const lines = trimmed.split('\n');
    if (lines.length >= 2 && lines[lines.length - 1].trim() === '```') {
      body = lines.slice(1, -1).join('\n');
    }
  }
  return body.length > 0 && !body.endsWith('\n') ? `${body}\n` : body;
}

/**
 * Cheap sanity gate over an assisted merge: non-empty, NO conflict markers
 * (open/close AND the bare `=======` separator — a model echoing half a region
 * would otherwise slip through), and every line both sides AGREED on (the
 * non-region lines of the merged-with-markers fold output) still appears in the
 * merged file — a model that dropped agreed content is rejected, not trusted.
 */
function isValidAssistedMerge(merged: string, conflictContent: string | undefined): boolean {
  if (merged.trim().length === 0) return false;
  const lines = merged.split('\n');
  if (lines.some((line) => isOpenMarker(line) || isCloseMarker(line) || line === '=======')) {
    return false;
  }
  if (conflictContent == null) return true;
  const mergedSet = new Set(lines);
  return agreedLinesOutsideRegions(conflictContent).every((line) => mergedSet.has(line));
}

/** The non-region (both-sides-agreed) lines of merged-with-markers 3-way output. */
function agreedLinesOutsideRegions(conflictContent: string): string[] {
  const agreed: string[] = [];
  let insideRegion = false;
  for (const line of conflictContent.split('\n')) {
    if (isOpenMarker(line)) {
      insideRegion = true;
      continue;
    }
    if (isCloseMarker(line)) {
      insideRegion = false;
      continue;
    }
    if (!insideRegion && line.length > 0) agreed.push(line);
  }
  return agreed;
}

/**
 * Read each contributor's version of `relPath` from its worktree, in the given
 * (workspaceId-sorted) order. A contributor with NO resolved worktree, or one that
 * DELETED the path (missing on disk), fails the gather (`{ok:false}`) — a
 * delete/modify that cannot auto-merge. Shared by compose + the read-only probe.
 */
async function gatherContributorVersions(
  sourceWorktrees: Map<string, string>,
  relPath: string,
  contributors: readonly string[],
): Promise<{ ok: true; versions: string[] } | { ok: false }> {
  if (contributors.length === 0) return { ok: false };
  const versions: string[] = [];
  for (const workspaceId of contributors) {
    const wt = sourceWorktrees.get(workspaceId);
    if (!wt) return { ok: false };
    const content = await readOptional(path.join(wt, relPath));
    if (content === null) return { ok: false }; // deletion vs edit ⇒ conflict
    versions.push(content);
  }
  return { ok: true, versions };
}

/**
 * The PAIRWISE line-level 3-way fold shared by compose (writes the result) and the
 * probe (dry-run). `running := versions[0]`, then for each next version `running :=
 * merge-file(ours=running, base=ancestor, theirs=next)` with the ORIGINAL base as
 * the common ancestor at every step (deterministic in the given order). A clean fold
 * returns the merged content; ANY conflict returns `{clean:false}` carrying git's
 * merged-with-markers `content` from the first conflicting pairwise step (so the
 * probe can parse WHERE the collision is). A real git fault PROPAGATES (never
 * masqueraded as a conflict). Operands are temp files in `tmpDir`.
 */
async function threeWayFold(
  deps: ConvergeOpsDeps,
  baseContent: string,
  versions: readonly string[],
  tmpDir: string,
): Promise<{ clean: true; content: string } | { clean: false; content?: string }> {
  if (versions.length === 0) return { clean: false };
  const baseFile = path.join(tmpDir, 'base');
  const oursFile = path.join(tmpDir, 'ours');
  const theirsFile = path.join(tmpDir, 'theirs');
  await writeFile(baseFile, baseContent);

  let running = versions[0];
  for (let i = 1; i < versions.length; i += 1) {
    await writeFile(oursFile, running);
    await writeFile(theirsFile, versions[i]);
    const merged = await mergeFile(deps, oursFile, baseFile, theirsFile);
    if (!merged.clean) return { clean: false, content: merged.content };
    running = merged.content;
  }
  return { clean: true, content: running };
}

/** Bounded-payload caps for {@link parseConflictRegions} — degrade-truthful, never unbounded. */
export const MAX_CONFLICT_REGIONS = 20;
export const MAX_CONFLICT_SIDE_LINES = 40;

/** A line that OPENS/CLOSES a merge-file conflict region (label optional, may contain spaces). */
function isOpenMarker(line: string): boolean {
  return line === '<<<<<<<' || line.startsWith('<<<<<<< ');
}

function isCloseMarker(line: string): boolean {
  return line === '>>>>>>>' || line.startsWith('>>>>>>> ');
}

/**
 * Parse `git merge-file` merged-with-markers output into the per-file conflict
 * regions — WHERE the contesting siblings collided. PURE + TOTAL: malformed or
 * nested marker input NEVER throws (the regions parsed so far are returned; a
 * dangling/unterminated region is discarded, a nested open marker restarts the
 * region). BOUNDED: at most {@link MAX_CONFLICT_REGIONS} regions per file (the last
 * kept region is marked `truncated` when more existed) and at most
 * {@link MAX_CONFLICT_SIDE_LINES} lines per side (`truncated:true` marks the cut).
 * `startLine`/`endLine` are 1-indexed positions of the marker lines in `content`.
 */
export function parseConflictRegions(content: string): ConflictRegion[] {
  const lines = content.split('\n');
  const regions: ConflictRegion[] = [];
  let startLine = 0;
  let side: 'ours' | 'theirs' | null = null;
  let ours: string[] = [];
  let theirs: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isOpenMarker(line)) {
      if (regions.length >= MAX_CONFLICT_REGIONS) {
        // More regions exist beyond the cap — mark the last kept one truncated.
        regions[regions.length - 1] = { ...regions[regions.length - 1], truncated: true };
        return regions;
      }
      startLine = i + 1;
      side = 'ours';
      ours = [];
      theirs = [];
      continue;
    }
    if (line === '=======' && side === 'ours') {
      side = 'theirs';
      continue;
    }
    if (isCloseMarker(line) && side === 'theirs') {
      const cut = ours.length > MAX_CONFLICT_SIDE_LINES || theirs.length > MAX_CONFLICT_SIDE_LINES;
      regions.push({
        startLine,
        endLine: i + 1,
        ours: ours.slice(0, MAX_CONFLICT_SIDE_LINES),
        theirs: theirs.slice(0, MAX_CONFLICT_SIDE_LINES),
        truncated: cut,
      });
      side = null;
      continue;
    }
    if (side === 'ours') ours.push(line);
    else if (side === 'theirs') theirs.push(line);
  }
  // EOF inside a region: the dangling partial is discarded (never a throw).
  return regions;
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

/** The contested-path input the probe scores (path + the siblings that touched it). */
export interface ContestedProbeInput {
  readonly path: string;
  readonly workspaceIds: readonly string[];
}

/**
 * DRY-RUN synthesizability probe (read-only) — for each contested path, run the SAME
 * pairwise 3-way merge compose would, in a TEMP DIR (no `git worktree add`, no branch,
 * no mutation), and report whether it comes out clean. The base version is read via
 * `git show <base>:<path>` (empty when the path is added-by-both); contributor
 * versions are read from the sibling worktrees. DEGRADE-TRUTHFUL + NEVER throws: a
 * delete/modify ⇒ `synthesizable:false, reason:'delete-modify'`; a conflict ⇒
 * `reason:'overlap'`; any git/read fault or unresolved worktree ⇒ `reason:'unreadable'`.
 * Bounded to the contested paths passed in; the temp dir is always disposed.
 */
export async function probeSynthesizability(
  deps: ConvergeOpsDeps,
  contested: readonly ContestedProbeInput[],
): Promise<ContestedProbe[]> {
  const sorted = [...contested].sort((a, b) => a.path.localeCompare(b.path));
  if (sorted.length === 0) return [];

  // Resolve every candidate's worktree once (a fault ⇒ absent ⇒ that path degrades).
  const ids = [...new Set(sorted.flatMap((c) => c.workspaceIds))];
  const worktrees = new Map<string, string>();
  let primary: Workspace | null = null;
  for (const id of ids) {
    const ws = await deps.getWorkspace(id).catch(() => null);
    if (ws?.worktreePath) {
      worktrees.set(id, ws.worktreePath);
      primary ??= ws;
    }
  }
  // No resolvable worktree in the whole group — every path is truthfully unreadable.
  if (!primary?.worktreePath) {
    return sorted.map((c) => ({
      path: c.path,
      workspaceIds: [...c.workspaceIds].sort(),
      synthesizable: false,
      reason: 'unreadable',
    }));
  }

  const repoPath = await resolveMainRepo(deps, primary.worktreePath);
  const base = await resolveBase(deps, primary, repoPath);
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'recoder-probe-'));
  try {
    const out: ContestedProbe[] = [];
    for (const c of sorted) {
      const contributors = [...c.workspaceIds].sort();
      const result = await probeOne(deps, { repoPath, base, relPath: c.path, contributors, worktrees, tmpDir });
      out.push({ path: c.path, workspaceIds: contributors, ...result });
    }
    return out;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Probe ONE contested path — the same gather + 3-way fold as compose, but read-only. */
async function probeOne(
  deps: ConvergeOpsDeps,
  args: {
    readonly repoPath: string;
    readonly base: string;
    readonly relPath: string;
    readonly contributors: readonly string[];
    readonly worktrees: Map<string, string>;
    readonly tmpDir: string;
  },
): Promise<{ synthesizable: boolean; reason?: string; regions?: ConflictRegion[] }> {
  const { repoPath, base, relPath, contributors, worktrees, tmpDir } = args;
  if (!isSafeRelPath(relPath)) return { synthesizable: false, reason: 'unreadable' };
  // A contributor with no RESOLVED worktree is unreadable (distinct from a deletion).
  if (contributors.some((id) => !worktrees.has(id))) return { synthesizable: false, reason: 'unreadable' };
  const gathered = await gatherContributorVersions(worktrees, relPath, contributors);
  if (!gathered.ok) return { synthesizable: false, reason: 'delete-modify' }; // a MISSING file
  const baseContent = await showFileAtRef(deps, repoPath, base, relPath);
  try {
    const fold = await threeWayFold(deps, baseContent, gathered.versions, tmpDir);
    if (fold.clean) return { synthesizable: true };
    // Surface WHERE the collision is: parse the fold's merged-with-markers content
    // into bounded regions ('overlap' only — the other reasons have no markers).
    const regions = fold.content != null ? parseConflictRegions(fold.content) : [];
    return {
      synthesizable: false,
      reason: 'overlap',
      ...(regions.length > 0 ? { regions } : {}),
    };
  } catch {
    // A real git/read fault during the dry-run — truthfully "could not judge".
    return { synthesizable: false, reason: 'unreadable' };
  }
}

/**
 * Read `git show <ref>:<relPath>` (the base version of a path) as a string. A failure
 * (the path is NOT tracked at base — added-by-both — or the ref is unreadable) yields
 * `''`, matching compose's empty-ancestor behavior for an added-by-both file.
 */
async function showFileAtRef(
  deps: ConvergeOpsDeps,
  repoPath: string,
  ref: string,
  relPath: string,
): Promise<string> {
  const exec = deps.exec ?? execFileSafe;
  try {
    const { stdout } = await exec('git', ['-C', repoPath, 'show', `${ref}:${relPath}`], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return ''; // not tracked at base (added-by-both) — an empty common ancestor
  }
}

/** One sibling's version of ONE path for the N-up compare — null content + a truthful reason when absent. */
export interface FileVersionEntry {
  readonly workspaceId: string;
  readonly agent: string;
  /** The sibling's on-disk content of the path, or `null` when absent/unreadable (NEVER fabricated). */
  readonly content: string | null;
  /** WHY `content` is null (no worktree / deleted / unsafe path); omitted when content is present. */
  readonly reason?: string;
  /** True when `content` was cut to {@link MAX_ASSIST_FILE_BYTES} (the UI shows a "truncated" marker). */
  readonly truncated?: boolean;
}

/**
 * The N-up file-versions view — the base version + each sibling's version of ONE
 * contested path, side by side, so the desktop can render N columns of the SAME file.
 */
export interface FileVersionsView {
  readonly path: string;
  /** The base (task-base ref) version of the path, or `null` when no worktree resolves to read it. */
  readonly base: string | null;
  /** True when `base` was cut to {@link MAX_ASSIST_FILE_BYTES}. */
  readonly baseTruncated?: boolean;
  /** One entry per sibling, in the given order (deleted/unreadable siblings carry `content:null`). */
  readonly versions: readonly FileVersionEntry[];
}

/**
 * Cap a string to {@link MAX_ASSIST_FILE_BYTES}, flagging truncation — a DISPLAY
 * bound so an N-up view never ships an unbounded blob. A split trailing multibyte
 * char at the cut is tolerated (display-only, never re-parsed as source).
 */
function capToAssistBytes(content: string): { content: string; truncated: boolean } {
  const buf = Buffer.from(content, 'utf8');
  if (buf.byteLength <= MAX_ASSIST_FILE_BYTES) return { content, truncated: false };
  return { content: buf.subarray(0, MAX_ASSIST_FILE_BYTES).toString('utf8'), truncated: true };
}

/**
 * Read each sibling's version of ONE path + the base version, side by side — the
 * N-up compare edge (the desktop renders N columns of the SAME file). REUSE-ONLY: it
 * runs the SAME per-file reads the synthesize probe does — `gatherContributorVersions`
 * for each sibling's worktree copy and `showFileAtRef` for the base — inventing NO new
 * git logic. DEGRADE-TRUTHFUL + NEVER throws: a sibling with no resolvable worktree, or
 * one that DELETED / never-created the path, yields `content:null` + a truthful
 * `reason` (never a fabricated version); each version (and the base) is bounded by
 * {@link MAX_ASSIST_FILE_BYTES} with a `truncated` flag. `base` is null ONLY when no
 * sibling worktree resolves (there is then no repo to run `git show` from); a path
 * untracked at base (added by every sibling) reads as `''` per `showFileAtRef`'s
 * empty-ancestor convention, matching compose's 3-way base.
 */
export async function gatherFileVersions(
  deps: ConvergeOpsDeps,
  args: {
    readonly siblings: readonly { readonly workspaceId: string; readonly agent: string }[];
    readonly relPath: string;
  },
): Promise<FileVersionsView> {
  const { siblings, relPath } = args;
  // Reject a poisoned path up front (defense-in-depth over the caller-supplied path):
  // no base, every sibling truthfully absent — never a spawn, never a fabricated read.
  if (!isSafeRelPath(relPath)) {
    return {
      path: relPath,
      base: null,
      versions: siblings.map((s) => ({
        workspaceId: s.workspaceId,
        agent: s.agent,
        content: null,
        reason: 'unsafe path rejected',
      })),
    };
  }

  // Resolve each sibling's worktree once; keep the FIRST resolvable one as the primary
  // whose repo + base ref the base version is read from (mirrors probeSynthesizability).
  const worktrees = new Map<string, string>();
  let primary: Workspace | null = null;
  for (const s of siblings) {
    const ws = await deps.getWorkspace(s.workspaceId).catch(() => null);
    if (ws?.worktreePath) {
      worktrees.set(s.workspaceId, ws.worktreePath);
      primary ??= ws;
    }
  }

  // Base version via `git show <base>:<path>` (reuse showFileAtRef). Null ONLY when no
  // worktree resolves — there is then no repo to read the base from (a truthful absence,
  // never a fabricated base). Bounded like every version.
  let base: string | null = null;
  let baseTruncated = false;
  if (primary?.worktreePath) {
    const repoPath = await resolveMainRepo(deps, primary.worktreePath);
    const baseRef = await resolveBase(deps, primary, repoPath);
    const capped = capToAssistBytes(await showFileAtRef(deps, repoPath, baseRef, relPath));
    base = capped.content;
    baseTruncated = capped.truncated;
  }

  // Each sibling's worktree copy — reuse the probe's gatherContributorVersions per id.
  // The worktree is pre-checked resolved here, so its `{ok:false}` means the file is
  // MISSING on disk (a deletion / never-created), distinct from an unresolved worktree.
  const versions: FileVersionEntry[] = [];
  for (const s of siblings) {
    if (!worktrees.has(s.workspaceId)) {
      versions.push({
        workspaceId: s.workspaceId,
        agent: s.agent,
        content: null,
        reason: 'no worktree (never launched or already torn down)',
      });
      continue;
    }
    const gathered = await gatherContributorVersions(worktrees, relPath, [s.workspaceId]);
    if (!gathered.ok) {
      versions.push({
        workspaceId: s.workspaceId,
        agent: s.agent,
        content: null,
        reason: 'file not present in this sibling (deleted or never created)',
      });
      continue;
    }
    const capped = capToAssistBytes(gathered.versions[0]);
    versions.push({
      workspaceId: s.workspaceId,
      agent: s.agent,
      content: capped.content,
      ...(capped.truncated ? { truncated: true } : {}),
    });
  }

  return { path: relPath, base, ...(baseTruncated ? { baseTruncated: true } : {}), versions };
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
