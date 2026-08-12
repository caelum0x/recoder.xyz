/**
 * Multi-agent compare (F3 parallel-run groups) + convergence behind the
 * `ConductorComposer` facade: the caller-narrowed sibling aggregates, pairwise
 * diff, the operator grid, the convergence plan/compose flow, and the persisted
 * convergence-evidence reads. Every method body moved VERBATIM from the composer.
 */
import type { Workspace } from '@recoder/agent-os';
import type { Principal } from '../../identity/types.js';
import { canAccessWorkspace } from '../routes/workspace-access.js';
import { workspaceDiffFiles as workspaceDiffFilesOp } from '../review/workspace-review.ops.js';
import {
  compareTaskGroup as compareTaskGroupOp,
  workspaceSiblings as workspaceSiblingsOp,
  compareWorkspaces as compareWorkspacesOp,
  parseDiffStat,
  type CompareDeps,
  type CompareView,
  type AdHocCompareOutcome,
} from '../services/compare.service.js';
import {
  pairwiseDiff as pairwiseDiffOp,
  sharedPairPaths,
  type PairwiseDiffView,
} from '../services/pairwise-diff.service.js';
import {
  planConvergence as planConvergenceOp,
  type ConvergencePlan,
} from '../converge/converge-plan.service.js';
import {
  ConvergeCockpitService,
  type CockpitSnapshot,
} from '../cockpit/converge-cockpit.service.js';
import {
  composeConvergence as composeConvergenceOp,
  probeSynthesizability as probeSynthesizabilityOp,
  gatherFileVersions as gatherFileVersionsOp,
  EmptyConvergenceError,
  UnresolvedConvergenceError,
  type ComposeConvergenceInput,
  type ComposeConvergenceResult,
  type ConvergeOpsDeps,
  type FileVersionsView,
} from '../converge/converge.ops.js';
import type { ConvergenceEvidenceRecord } from '../evidence/convergence-evidence.js';
import {
  renderEvidenceExport,
  type EvidenceExport,
} from '../evidence/evidence-export.js';
import { signEvidenceExport } from '../evidence/evidence-signing.js';
import type { GroupGridArrangement } from '../ports/workspace-grid.port.js';
import {
  conductorAuditEntry,
  guardConductorWrite,
  recordConductorAudit,
} from '../audit/conductor-audit.js';
import {
  buildReviewDeps,
  type ConductorContext,
  type ConductorWriteResult,
} from './shared.js';

/**
 * The inference function assisted convergence synthesis addresses — MUST equal the
 * inference domain's canonical default chat function (`TENSORZERO_DEFAULT_FUNCTION`
 * = 'recoder_default' in `domains/inference/tensorzero-config.ts`). A DOCUMENTED
 * LITERAL, not an import: the inference PUBLIC surface (`domains/inference/index.ts`)
 * exports no such constant, and a cross-domain VALUE import of the internal would
 * break the domain-boundary invariant (only type-only seams are legal). The converge
 * ops themselves stay name-free (`ConvergeOpsDeps.inferenceFunctionName`), so this
 * composition layer is the ONE place the name lives on the conductor side.
 */
const CONVERGE_ASSIST_FUNCTION_NAME = 'recoder_default';

/**
 * The failure arm of an AD-HOC converge (PW1 #1) — the route maps `not-found` to a
 * no-oracle 404 and `too-few`/`incompatible` to a truthful 400. Mirrors {@link
 * AdHocCompareOutcome}'s failure cases (it carries NO `verdict`, which is how a
 * caller discriminates it from a governed {@link ConductorWriteResult} failure).
 */
export type AdHocReject =
  | { readonly ok: false; readonly code: 'not-found' }
  | { readonly ok: false; readonly code: 'too-few'; readonly reason: string }
  | {
      readonly ok: false;
      readonly code: 'incompatible';
      readonly reason: string;
    };

/** The outcome of an ad-hoc convergence PLAN: the folded plan, or a typed reject. */
export type AdHocPlanOutcome =
  { readonly ok: true; readonly plan: ConvergencePlan } | AdHocReject;

export class ConductorCompareConverge {
  constructor(private readonly ctx: ConductorContext) {}

  /**
   * The per-caller access predicate the compare/converge aggregation folds through
   * (recoder-kybr). A group-scoped read/compose is keyed on a shared `taskGroup`,
   * so the single-id `:id` guard cannot cover it — this restricts the group to the
   * siblings the caller may access, reusing the SAME `canAccessWorkspace` semantics
   * (createdBy/tenant + admin + solo fail-open) the `:id` routes enforce. A
   * principal-less (INTERNAL) call ⇒ `undefined` (no filter — the FULL group, as the
   * merge-time evidence read needs). Pure + side-effect free.
   */
  private compareAccessFilter(
    principal?: Principal
  ): ((workspace: Workspace) => boolean) | undefined {
    if (!principal) return undefined;
    const opts = { soloMode: this.ctx.cfg.soloMode };
    return workspace => canAccessWorkspace(principal, workspace, opts);
  }

  /**
   * The narrow read seams the compare service groups + projects over. When a
   * `principal` is supplied (every HTTP route), the aggregate is narrowed to the
   * caller's OWN siblings via {@link compareAccessFilter}; a principal-less internal
   * call sees the full group.
   */
  private compareDeps(principal?: Principal): CompareDeps {
    const canAccess = this.compareAccessFilter(principal);
    return {
      listWorkspaces: () => this.ctx.engine.listWorkspaces(),
      getWorkspace: id => this.ctx.engine.getWorkspace(id),
      buildView: workspace => this.ctx.buildWorkspaceView(workspace),
      diffStat: workspace => this.computeDiffStat(workspace),
      changedFiles: workspace => this.computeChangedFiles(workspace),
      ...(canAccess ? { canAccess } : {}),
    };
  }

  /**
   * A READ-ONLY tracked changed-file path list for one workspace — the compare
   * row's `changedFiles` + the input to the CONTESTED overlap. REUSES the shipped
   * pure `workspaceDiffFiles` op (base fenced before `--`, NO agent pathspec,
   * exec-bounded) — no new git surface. Mirrors `computeDiffStat`'s degrade
   * posture: a record with no worktree, a non-repo/git-absent tree, or a racy
   * vanish yields a truthful reason and NO list (never a fabricated set).
   */
  private async computeChangedFiles(
    workspace: Workspace
  ): Promise<{ files?: readonly string[]; reason?: string }> {
    if (!workspace.worktreePath) {
      return { reason: 'no worktree (never launched or already torn down)' };
    }
    try {
      const view = await workspaceDiffFilesOp(
        buildReviewDeps(this.ctx),
        workspace.workspaceId
      );
      if (!view.available) {
        return {
          reason: 'changed-file list unavailable (non-repo / git absent)',
        };
      }
      return { files: view.files.map(f => f.path) };
    } catch (err) {
      return {
        reason: err instanceof Error ? err.message : 'changed-file list failed',
      };
    }
  }

  /**
   * A READ-ONLY diff footprint (files / +lines / -lines) for one workspace — the
   * compare row's `diffStat`. Unlike `workspaceDiff`, this NEVER transitions the
   * workspace (no running → awaiting_review side effect). Degrade-safe: a record
   * with no worktree, or a substrate diff fault, yields a truthful reason and NO
   * stat (never a fabricated `0/0/0`).
   */
  private async computeDiffStat(
    workspace: Workspace
  ): Promise<{ stat?: ReturnType<typeof parseDiffStat>; reason?: string }> {
    if (!workspace.worktreePath) {
      return { reason: 'no worktree (never launched or already torn down)' };
    }
    try {
      const substrate = this.ctx.registry.getFull(workspace.substrate);
      const diff = await substrate.diff(
        {
          ref: workspace.workspaceId,
          sessionName: workspace.sessionName,
          worktreePath: workspace.worktreePath,
        },
        workspace.baseRef || 'HEAD'
      );
      return { stat: parseDiffStat(diff.stat, diff.changedFiles) };
    } catch (err) {
      return { reason: err instanceof Error ? err.message : 'diff failed' };
    }
  }

  async compareTaskGroup(
    taskGroup: string,
    principal?: Principal
  ): Promise<CompareView> {
    const view = await compareTaskGroupOp(
      this.compareDeps(principal),
      taskGroup
    );
    return this.withGridHint(view);
  }

  async workspaceSiblings(
    workspaceId: string,
    principal?: Principal
  ): Promise<CompareView | null> {
    const view = await workspaceSiblingsOp(
      this.compareDeps(principal),
      workspaceId
    );
    return view ? this.withGridHint(view) : view;
  }

  /**
   * The TRUE line-level A-vs-B pairwise diff of a parallel-run pair — one unified
   * patch per shared file across the TWO sibling worktrees (the Compare view's
   * PairwisePanel edge). Read-only. recoder-kybr: the group is resolved with the
   * SAME principal narrowing as {@link compareTaskGroup}, and BOTH `aId` and `bId`
   * must be members of the caller-narrowed sibling set — either missing ⇒ `null`
   * (the route's no-oracle 404, byte-identical to an unknown workspace). `paths`
   * defaults to the pair's shared changed files from the compare view.
   */
  async pairwiseDiff(
    taskGroup: string,
    aId: string,
    bId: string,
    paths: readonly string[] | undefined,
    principal?: Principal
  ): Promise<PairwiseDiffView | null> {
    const view = await compareTaskGroupOp(
      this.compareDeps(principal),
      taskGroup
    );
    const aSibling = view.siblings.find(s => s.workspaceId === aId);
    const bSibling = view.siblings.find(s => s.workspaceId === bId);
    if (!aSibling || !bSibling) return null;
    const [a, b] = await Promise.all([
      this.ctx.engine.getWorkspace(aId),
      this.ctx.engine.getWorkspace(bId),
    ]);
    if (!a || !b) return null;
    const resolved =
      paths && paths.length > 0
        ? paths
        : sharedPairPaths(aSibling, bSibling, view.contested);
    return pairwiseDiffOp({ logger: this.ctx.log }, { a, b, paths: resolved });
  }

  /**
   * The N-up per-file version read (`GET …/file-versions?path=`) — for ONE contested
   * path, EACH sibling's version of that file + the base version, so the desktop can
   * render N columns of the SAME file side by side (the deferred costly part of the
   * N-up compare). Read-only. Reuses the SAME version-gathering the synthesize probe
   * uses (`gatherContributorVersions` / `showFileAtRef`) — no new git logic.
   *
   * recoder-kybr: the group is narrowed to the caller's OWN siblings via
   * {@link rawCompare}. A group the caller owns no sibling of ⇒ `null` (the route's
   * no-oracle 404, byte-identical to an unknown group). A deleted/unreadable sibling
   * ⇒ `content:null` + a truthful reason (never a fabricated version); each version is
   * bounded with a `truncated` flag.
   */
  async fileVersions(
    taskGroup: string,
    relPath: string,
    principal?: Principal
  ): Promise<FileVersionsView | null> {
    const view = await this.rawCompare(taskGroup, principal);
    if (view.count === 0) return null; // no accessible sibling ⇒ no-oracle 404
    const siblings = view.siblings.map(s => ({
      workspaceId: s.workspaceId,
      agent: s.agent,
    }));
    return gatherFileVersionsOp(this.convergeDeps(principal), {
      siblings,
      relPath,
    });
  }

  /**
   * The LIVE convergence cockpit snapshot (`recoder_converge_cockpit`,
   * LOOM-ROADMAP.md §1 build-now #1) — one truthful view that makes a fan-out
   * OBSERVABLE: each pane's live attention + native status folded with the shipped
   * read-only convergence probe (`planConvergence(probe)`) and the N-up column view
   * (`gatherFileVersions`). THIN COMPOSITION over {@link ConvergeCockpitService}: it
   * reuses this class's already-narrowed reads and reimplements NO convergence math.
   *
   * recoder-kybr: the group is narrowed to the caller's OWN siblings via
   * {@link rawCompare}. A group the caller owns no sibling of ⇒ `null` (the route's
   * no-oracle 404, byte-identical to an unknown group). Degrade-truthful: a
   * too-few/probe fault yields a DEGRADED snapshot (truthful zeros + a reason), never
   * fabricated numbers.
   */
  async convergeCockpit(
    taskGroup: string,
    principal?: Principal
  ): Promise<CockpitSnapshot | null> {
    const view = await this.rawCompare(taskGroup, principal);
    if (view.count === 0) return null; // no accessible sibling ⇒ no-oracle miss

    const service = new ConvergeCockpitService({
      logger: this.ctx.log,
      // (a) the sibling set + each pane's live attention + agent kind (compare read).
      loadPanes: async () => ({
        taskGroup: view.taskGroup,
        panes: view.siblings.map(s => ({
          workspaceId: s.workspaceId,
          agent: s.agent,
          state: s.attention ?? 'unknown',
        })),
      }),
      // (b) the PROBED plan — the shipped pure fold enriched with the read-only
      // synthesizability dry-run over the contested paths (no worktree/mutation).
      plan: () =>
        this.planConvergence(taskGroup, {}, { probe: true }, principal),
      // (c) the N-up column read per contested path — reuses the shipped
      // `gatherFileVersions` seam (same narrowing, truthful null on a torn-down sibling).
      fileVersions: async paths => {
        const out: FileVersionsView[] = [];
        for (const path of paths) {
          const fv = await this.fileVersions(taskGroup, path, principal);
          if (fv) out.push(fv);
        }
        return out;
      },
    });
    return service.snapshot();
  }

  /**
   * Enrich a compare read with the READ-ONLY operator-attach hint (never a
   * mutation — the pure service stays substrate-free). Degrade-truthful: no grid
   * seam, a singleton/ungrouped view, or no repo/sessions ⇒ the identical
   * hint-less view; `attachHint` faulting ⇒ the view unchanged. The `attachCommand`
   * half is tenant-gated inside the adapter (desktop-only); `visibleSessions`
   * (intersected to the group) is always safe.
   */
  private async withGridHint(view: CompareView): Promise<CompareView> {
    if (!this.ctx.workspaceGrid || view.count < 2) return view; // singleton/ungrouped ⇒ no grid
    const sessions = view.siblings
      .map(s => s.sessionName)
      .filter(
        (name): name is string =>
          typeof name === 'string' && name.trim().length > 0
      );
    const repoPath = this.groupRepoPath(view);
    if (!repoPath || sessions.length === 0) return view; // truthful: no repo/sessions ⇒ no hint
    const hint = await this.ctx.workspaceGrid
      .attachHint({ repoPath, groupSessionNames: sessions })
      .catch(() => null);
    return hint ? { ...view, grid: hint } : view; // dmux absent/fault ⇒ unchanged view
  }

  /**
   * A real member worktree path the operator console launches in (dmux renders
   * the box-wide `recoder-*` sessions from any cwd). The FIRST sibling with a real
   * `worktreePath` — never a fabricated/shared repoPath; `undefined` when none has
   * one (⇒ no hint).
   */
  private groupRepoPath(view: CompareView): string | undefined {
    for (const sibling of view.siblings) {
      if (
        typeof sibling.worktreePath === 'string' &&
        sibling.worktreePath.trim().length > 0
      ) {
        return sibling.worktreePath;
      }
    }
    return undefined;
  }

  async arrangeCompareGrid(
    taskGroup: string,
    principal: Principal
  ): Promise<ConductorWriteResult<GroupGridArrangement | null>> {
    const action = 'workspace.grid';
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: { environment: 'conductor' },
        metadata: { taskGroup },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    // dmux absent ⇒ truthful null (no grid) — the write is a governed no-op.
    if (!this.ctx.workspaceGrid) return { ok: true, verdict, value: null };

    // recoder-kybr: arrange ONLY the caller's own worktrees — never span a grid
    // over another tenant's sibling of the same taskGroup.
    const view = await compareTaskGroupOp(
      this.compareDeps(principal),
      taskGroup
    );
    const worktrees = view.siblings
      .filter(
        (s): s is typeof s & { worktreePath: string } =>
          typeof s.worktreePath === 'string'
      )
      .map(s => ({ workspaceId: s.workspaceId, worktreePath: s.worktreePath }));
    // No honest N-way grid to build — never a hollow one-dir grid.
    if (worktrees.length < 2) return { ok: true, verdict, value: null };

    const arrangement = await this.ctx.workspaceGrid
      .arrangeGrid({ taskGroup, worktrees })
      .catch(() => null);
    if (arrangement) {
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          taskGroup,
          sessionName: arrangement.sessionName,
          paneCount: arrangement.paneCount,
        })
      );
    }
    return { ok: true, verdict, value: arrangement }; // null on any tmux fault
  }

  /**
   * The persisted exportable convergence evidence record for a workspace's merge
   * (`GET …/evidence`) — a PURE projection over `metadata.convergenceEvidence`, or
   * `null` when the workspace does not exist OR was never merged with evidence.
   * Read-only: no gate, no audit, no mutation. A never-merged workspace is a
   * truthful `null` (⇒ 404 at the edge), never a fabricated record.
   */
  async getConvergenceEvidence(
    workspaceId: string
  ): Promise<ConvergenceEvidenceRecord | null> {
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace) return null;
    const raw = (workspace.metadata as Record<string, unknown> | undefined)
      ?.convergenceEvidence;
    if (!raw || typeof raw !== 'object') return null;
    return raw as ConvergenceEvidenceRecord;
  }

  /**
   * The framework-mapped, exportable evidence PACK for a workspace's merge
   * (`GET …/evidence/export`) — renders the stored {@link ConvergenceEvidenceRecord}
   * into a control-mapped artifact (SOC 2 / EU AI Act / DORA / Recoder) with a
   * human-readable summary, content-hashed for integrity. PURE over the stored
   * record: no gate, no mutation, no network. Every control status is DERIVED from
   * the backing fields (never a fabricated `met`), and the pack's optional
   * `frameworks` annotations are export-time derived metadata — the SEALED record
   * (and its contentHash) is never altered by exporting. `null` when the workspace
   * does not exist OR was never merged with evidence (⇒ 404 at the edge).
   */
  async getConvergenceEvidenceExport(
    workspaceId: string
  ): Promise<EvidenceExport | null> {
    const record = await this.getConvergenceEvidence(workspaceId);
    if (!record) return null;
    // PURE render first (deterministic hash/controls), THEN a thin detached-signature
    // step — signing the stable contentHash, never mutating it. Unsigned when no key.
    const pack = renderEvidenceExport(record);
    return signEvidenceExport(pack, {
      privateKey: this.ctx.resolveEvidenceSigningKey(),
      logger: this.ctx.log,
    });
  }

  /**
   * The raw compare read (no grid enrichment) — the pure sibling aggregate. When a
   * `principal` is supplied the aggregate is narrowed to the caller's OWN siblings
   * (recoder-kybr); a principal-less internal read (merge-time evidence) sees all.
   */
  private async rawCompare(
    taskGroup: string,
    principal?: Principal
  ): Promise<CompareView> {
    return compareTaskGroupOp(this.compareDeps(principal), taskGroup);
  }

  /**
   * PLAN a convergence (`GET …/converge-plan`) — the PURE fold of the group's N
   * sibling diffs + a per-contested-file selection into a resolved file→source map.
   * Read-only: no gate, no mutation. Non-contested paths auto-resolve; contested
   * paths resolve to a VALID selection or surface as `unresolved` (a truthful
   * "you must decide", never an invented winner). An empty/absent group is a
   * truthful empty plan (`complete:false`).
   *
   * When `options.probe` is set, the plan is ENRICHED with a `contested[]`
   * synthesizability probe (an OPT-IN, read-only dry-run 3-way merge over the
   * contested paths — no worktree/mutation) so the UI can show which contested files
   * auto-merge cleanly. Unprobed (the default), the pure fold is returned verbatim
   * (no `contested` field) — existing callers are unaffected.
   */
  async planConvergence(
    taskGroup: string,
    selection: Readonly<Record<string, string>>,
    options?: { readonly probe?: boolean },
    principal?: Principal
  ): Promise<ConvergencePlan> {
    // recoder-kybr: plan over ONLY the caller's own siblings (a group is keyed on a
    // shared taskGroup, so the `:id` guard cannot cover it). Principal-less ⇒ full group.
    const view = await this.rawCompare(taskGroup, principal);
    const siblings = view.siblings.map(s => ({
      workspaceId: s.workspaceId,
      agent: s.agent,
      ...(s.changedFiles ? { changedFiles: s.changedFiles } : {}),
    }));
    const plan = planConvergenceOp({
      taskGroup: view.taskGroup,
      siblings,
      selection,
    });
    if (!options?.probe) return plan;

    // OPT-IN enrichment: dry-run the 3-way over every contested path (resolved-by-
    // synthesize/pick AND still-unresolved) so the UI can offer `@synthesize` only
    // where it will actually come out clean. Read-only — never mutates, never throws.
    const contestedInputs = [
      ...plan.files
        .filter(f => f.contested)
        .map(f => ({ path: f.path, workspaceIds: f.candidates })),
      ...plan.unresolved.map(u => ({
        path: u.path,
        workspaceIds: u.candidates,
      })),
    ];
    if (contestedInputs.length === 0) return { ...plan, contested: [] };
    const contested = await probeSynthesizabilityOp(
      this.convergeDeps(principal),
      contestedInputs
    );
    return { ...plan, contested };
  }

  /**
   * The injected seams the convergence ops (compose + probe) run over. When a
   * `principal` is supplied the `compare` seam is narrowed to the caller's OWN
   * siblings (recoder-kybr), so a converge folds only worktrees the caller owns;
   * a principal-less internal call sees the full group.
   */
  private convergeDeps(principal?: Principal): ConvergeOpsDeps {
    return {
      compare: taskGroup => this.rawCompare(taskGroup, principal),
      getWorkspace: id => this.ctx.engine.getWorkspace(id),
      registerWorkspace: workspace =>
        this.ctx.repository.upsertWorkspace(workspace),
      logger: this.ctx.log,
      // The headline LLM conflict-resolution seam: the injected degrade-safe
      // one-shot the `assisted` path escalates a mechanically-unmergeable file to,
      // threaded from bootstrap through `ctx.infer`. ABSENT (a DB-less /
      // inference-absent boot) ⇒ the assisted path degrades truthfully to
      // synthesize-conflict (mechanical behavior, never a fabricated merge).
      // Conditional spread so an absent seam is never a literal `inference:undefined`
      // (exactOptionalPropertyTypes).
      ...(this.ctx.infer ? { inference: this.ctx.infer } : {}),
      // The assist function name is owned HERE (composition), never by the ops —
      // see CONVERGE_ASSIST_FUNCTION_NAME.
      inferenceFunctionName: CONVERGE_ASSIST_FUNCTION_NAME,
    };
  }

  /**
   * COMPOSE a convergence (`POST …/converge`) — GATED (`workspace.branch`).
   * Materializes a complete plan into a NEW convergence worktree/branch (whole-file
   * pick, no agent launched), registers it as a reviewable workspace, and stamps
   * the per-file provenance so the LATER governed merge emits an evidence record
   * that shows which sibling won each contested file. The caller must have a
   * COMPLETE plan (the route pre-validates); the op re-checks and throws a truthful
   * error otherwise. Degrade-truthful: a git/compose fault returns `ok:false` with
   * the real reason (never a fabricated success), and the gate deny short-circuits.
   */
  async composeConvergence(
    input: ComposeConvergenceInput,
    principal: Principal
  ): Promise<ConductorWriteResult<ComposeConvergenceResult>> {
    const action = 'workspace.branch';
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: { environment: 'conductor' },
        metadata: { taskGroup: input.taskGroup },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      // recoder-kybr: fold ONLY the caller's own worktrees into the convergence.
      const result = await composeConvergenceOp(this.convergeDeps(principal), {
        ...input,
        createdBy: input.createdBy || principal.userId,
      });
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          taskGroup: input.taskGroup,
          workspaceId: result.workspaceId,
          branch: result.branch,
          fileCount: result.fileCount,
          sourceCount: result.plan.sources.length,
        })
      );
      return { ok: true, verdict, value: result };
    } catch (err) {
      // A CLIENT-input failure (nothing to converge / a requested path could not be
      // resolved — incl. a `synthesize-conflict` discovered during the 3-way merge)
      // is a 4xx, not a governance/service fault. Tag it so the edge maps it to 400.
      if (err instanceof EmptyConvergenceError) {
        return { ok: false, verdict, reason: err.message, code: 'empty' };
      }
      if (err instanceof UnresolvedConvergenceError) {
        return { ok: false, verdict, reason: err.message, code: 'unresolved' };
      }
      return {
        ok: false,
        verdict,
        reason:
          err instanceof Error ? err.message : 'convergence compose failed',
      };
    }
  }

  // --- AD-HOC convergence (PW1 #1): converge workspaces launched SEPARATELY --------
  // The taskGroup compare/converge keys off `metadata.taskGroup`, so a dev who ran
  // Claude in one workspace and Codex in another (each its own group) had NO converge
  // path. These methods form the group from an EXPLICIT id list and reuse the SAME
  // compare service + converge ops — only the discovery set changes, never the math.

  /**
   * AD-HOC compare — form a converge group from an EXPLICIT list of separately-
   * launched workspaces and return the SAME grid-enriched {@link CompareView} the
   * taskGroup compare does. recoder-kybr: every id is narrowed to the caller's OWN
   * workspaces (a foreign/missing id ⇒ `not-found`, the route's no-oracle 404). See
   * {@link compareWorkspacesOp} for the fail-closed validation.
   */
  async compareAdHoc(
    workspaceIds: readonly string[],
    principal?: Principal
  ): Promise<AdHocCompareOutcome> {
    const outcome = await compareWorkspacesOp(
      this.compareDeps(principal),
      workspaceIds
    );
    if (!outcome.ok) return outcome;
    return { ok: true, view: await this.withGridHint(outcome.view) };
  }

  /**
   * PLAN an ad-hoc convergence — the SAME pure fold as {@link planConvergence}, over
   * an explicit workspace set instead of a taskGroup (`options.probe` opts into the
   * identical read-only synthesizability dry-run). Returns a typed reject on the
   * ad-hoc validation failures so a bad set never reaches the fold.
   */
  async planConvergenceAdHoc(
    workspaceIds: readonly string[],
    selection: Readonly<Record<string, string>>,
    options?: { readonly probe?: boolean },
    principal?: Principal
  ): Promise<AdHocPlanOutcome> {
    const outcome = await compareWorkspacesOp(
      this.compareDeps(principal),
      workspaceIds
    );
    if (!outcome.ok) return outcome;
    const view = outcome.view;
    const siblings = view.siblings.map(s => ({
      workspaceId: s.workspaceId,
      agent: s.agent,
      ...(s.changedFiles ? { changedFiles: s.changedFiles } : {}),
    }));
    const plan = planConvergenceOp({
      taskGroup: view.taskGroup,
      siblings,
      selection,
    });
    if (!options?.probe) return { ok: true, plan };

    // OPT-IN enrichment (identical to the taskGroup path): the probe reads each
    // contested path's siblings by id via `getWorkspace`, so the regular convergeDeps
    // seam works unchanged (it never calls `compare`).
    const contestedInputs = [
      ...plan.files
        .filter(f => f.contested)
        .map(f => ({ path: f.path, workspaceIds: f.candidates })),
      ...plan.unresolved.map(u => ({
        path: u.path,
        workspaceIds: u.candidates,
      })),
    ];
    if (contestedInputs.length === 0) {
      return { ok: true, plan: { ...plan, contested: [] } };
    }
    const contested = await probeSynthesizabilityOp(
      this.convergeDeps(principal),
      contestedInputs
    );
    return { ok: true, plan: { ...plan, contested } };
  }

  /**
   * COMPOSE an ad-hoc convergence — GATED (`workspace.branch`), mirrors {@link
   * composeConvergence} but over an EXPLICIT workspace set. Resolves + validates the
   * set (typed reject on too-few/not-found/incompatible) BEFORE gating, then reuses
   * the SAME `composeConvergence` op with its `compare` seam FIXED to the resolved
   * ad-hoc view — the op's taskGroup arg becomes the synthetic ad-hoc group id, so the
   * composed workspace's provenance + sealed evidence (`convergedFromTaskGroup` /
   * `fromTaskGroup`) truthfully record WHICH separately-launched workspaces it
   * converged. The converge math is NOT duplicated — only the discovery set changes.
   */
  async composeConvergenceAdHoc(
    input: {
      readonly workspaceIds: readonly string[];
      readonly selection: Readonly<Record<string, string>>;
      readonly branch?: string;
      readonly createdBy: string;
    },
    principal: Principal
  ): Promise<ConductorWriteResult<ComposeConvergenceResult> | AdHocReject> {
    // Validate the ad-hoc set FIRST (ownership/distinct/repo) so a bad set is a 4xx
    // BEFORE the gate is ever consulted (and never a governance/service error).
    const outcome = await compareWorkspacesOp(
      this.compareDeps(principal),
      input.workspaceIds
    );
    if (!outcome.ok) return outcome;
    const view = outcome.view;
    // Never null here: a valid ad-hoc view always carries the synthetic group id.
    const groupId = view.taskGroup as string;

    const action = 'workspace.branch';
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: { environment: 'conductor' },
        metadata: {
          taskGroup: groupId,
          adHoc: true,
          workspaceIds: [...input.workspaceIds],
        },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      // Reuse the SAME compose op; FIX its `compare` seam to the resolved ad-hoc set
      // (its taskGroup arg is only the provenance label, never a discovery key here).
      const deps: ConvergeOpsDeps = {
        ...this.convergeDeps(principal),
        compare: async () => view,
      };
      const result = await composeConvergenceOp(deps, {
        taskGroup: groupId,
        selection: input.selection,
        ...(input.branch ? { branch: input.branch } : {}),
        createdBy: input.createdBy || principal.userId,
      });
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          taskGroup: groupId,
          adHoc: true,
          workspaceId: result.workspaceId,
          branch: result.branch,
          fileCount: result.fileCount,
          sourceCount: result.plan.sources.length,
        })
      );
      return { ok: true, verdict, value: result };
    } catch (err) {
      if (err instanceof EmptyConvergenceError) {
        return { ok: false, verdict, reason: err.message, code: 'empty' };
      }
      if (err instanceof UnresolvedConvergenceError) {
        return { ok: false, verdict, reason: err.message, code: 'unresolved' };
      }
      return {
        ok: false,
        verdict,
        reason:
          err instanceof Error ? err.message : 'convergence compose failed',
      };
    }
  }
}
