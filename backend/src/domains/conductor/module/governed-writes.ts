/**
 * Governed workspace writes behind the `ConductorComposer` facade: the gated
 * create/steer/stop/advance/reconcile flow plus the review→delivery lifecycle
 * (archive / discard / PR / merge with convergence evidence) and the follow-up
 * message path. Every write clears the SAME governance gate + audit seal it did
 * on the composer; method bodies moved VERBATIM.
 */
import {
  execFileSafe,
  reconcile as substrateReconcile,
  type ReconcileReport,
} from '@recoder/substrate';
import type {
  Workspace,
  WorkspaceState,
  WorkspaceSubstrate,
} from '@recoder/agent-os';
import type { Principal } from '../../identity/types.js';
import type {
  GateVerdict,
  GovernanceAction,
  AuditRecord,
} from '../ports/index.js';
import type { SteerInput, SubstrateKind } from '../types.js';
import type { ConductorPlanDecision } from '../ports/plan.port.js';
import { deriveSeedTerms } from '../adapters/code-intel.adapter.js';
import {
  selectSubstrateForRuntime,
  isOpenfangRuntime,
} from '../adapters/runtime-substrate-selector.js';
import { stampSiblingAwareness } from '../adapters/sibling-awareness.adapter.js';
import { readRepoPassages } from '../adapters/repo-passages.adapter.js';
import { resolveRepoDefaultBranch } from '../git-default-branch.js';
import {
  conductorAuditEntry,
  conductorTarget,
  guardConductorWrite,
  recordConductorAudit,
} from '../audit/conductor-audit.js';
import { archiveWorkspace as archiveWorkspaceOp } from '../review/workspace-review.ops.js';
import {
  discardWorkspacePaths as discardWorkspacePathsOp,
  type WorkspaceDiscardView,
} from '../review/workspace-discard.ops.js';
import {
  discardWorkspaceHunks as discardWorkspaceHunksOp,
  type WorkspaceDiscardHunksView,
} from '../review/workspace-discard-hunks.ops.js';
import {
  createWorkspacePr as createWorkspacePrOp,
  mergeWorkspace as mergeWorkspaceOp,
  type CreatePrInput,
  type CreatePrResultView,
  type MergeInput,
  type MergeResultView,
  type PublishOpsDeps,
} from '../review/workspace-publish.ops.js';
import {
  continueWorkspace as continueWorkspaceOp,
  type ContinueOpsDeps,
  type ContinueWorkspaceInput,
  type ContinueWorkspaceResult,
} from '../review/workspace-continue.ops.js';
import {
  composeReviewPrompt,
  parseReviewComments,
  type ReviewComment,
} from '../review/review-comments.js';
import { repoKeyFor } from '../services/repo-setup.service.js';
import { computeWorkspacePort } from '../services/workspace-port.js';
import type { ReadinessView } from '../services/readiness.service.js';
import { taskGroupOf } from '../services/compare.service.js';
import {
  assembleConvergenceEvidence,
  type ConvergenceEvidenceRecord,
  type EvidenceCandidateInput,
  type EvidenceConvergence,
  type EvidenceGovernance,
} from '../evidence/convergence-evidence.js';
import { computeConvergenceTrust } from '../evidence/convergence-trust.js';
import { evaluateMergeTrustGate } from '../evidence/merge-trust-gate.js';
import {
  ADVANCE_TARGET_STATES,
  buildReviewDeps,
  injectWorktreeMcp,
  type ConductorContext,
  type ConductorWriteResult,
  type CreateConductorWorkspaceInput,
  type ReviewCommentDelivery,
} from './shared.js';

/** States a `stop` may act on — exactly those with a legal `→ cancelled` transition. */
const STOPPABLE_STATES: readonly WorkspaceState[] = [
  'created',
  'setting_up',
  'ready',
  'running',
  'awaiting_approval',
];

export class ConductorGovernedWrites {
  constructor(private readonly ctx: ConductorContext) {}

  /**
   * Path (b) prompt enrichment: fold two capability blocks into the prompt the
   * native openfang turn runs as its `command`:
   *   1. MEMORY recall (mem0 ∪ beads ∪ candidates → rerank) — unchanged.
   *   2. CODE-MAP (recodergit code-knowledge-graph): a bounded, code-aware launch
   *      context (`codeIntel.queryContext`) appended AFTER the memory block.
   * Degrade-safe: no brain / empty prompt / recall fault ⇒ the raw prompt (or
   * `undefined` when there is no prompt, so the substrate refuses truthfully); an
   * absent/disabled/not-indexed code-graph ⇒ the prompt is left memory-only.
   *
   * Ordering caveat (degrade-truthful, NOT a bug): `startCodeIntel` fires the repo
   * index fire-and-forget AFTER this enrichment, so the FIRST launch of a
   * never-indexed repo races the index and truthfully gets `queryContext === null`
   * (memory-only prompt). The code-map warms on subsequent launches and after the
   * completion-hook reindex — never forced ahead of the index here.
   */
  private async enrichOpenfangCommand(
    input: CreateConductorWorkspaceInput,
    principal: Principal
  ): Promise<string | undefined> {
    const raw = (input.prompt ?? '').trim();
    if (!raw) return undefined;

    // 1) MEMORY recall (unchanged): no brain ⇒ the raw prompt is the base; a
    //    recall fault logs + leaves the base prompt, then the code-map still runs.
    let prompt = input.prompt ?? '';
    if (this.ctx.brain) {
      try {
        const enriched = await this.ctx.brain.enrichPrompt({
          prompt: input.prompt ?? '',
          userId: principal.userId,
          ...(input.taskId ? { taskId: input.taskId } : {}),
          ...(input.repoPath ? { repoPath: input.repoPath } : {}),
          ...(input.library ? { library: input.library } : {}),
          // Thread the SAME per-repo ColBERT collection `startCodeIntel` builds so
          // the brain's first-stage retrieval reads the index instead of leaving it
          // a dead write. Gated on `repoPath` — the only case `startCodeIntel`
          // builds a `repo_<id>` collection — so we never point search at an index
          // that was never built (absent ⇒ retrieval falls back to its default).
          ...(input.repoPath
            ? {
                repoCollection: `repo_${repoIdFromRepoRef(input.projectId || input.repoPath)}`,
              }
            : {}),
        });
        prompt = enriched.prompt;
      } catch (err) {
        this.ctx.log.warn(
          { err, runtimeId: input.runtimeId },
          'conductor openfang prompt enrich faulted — running raw prompt'
        );
      }
    }

    // 2) CODE-MAP (recodergit code-graph), degrade-truthful. Probe the OPTIONAL
    //    port method before calling (older impls omit it). Gated on `repoPath`
    //    (the only case a `repo_<id>` index exists) and derived with the SAME
    //    `repoIdFromRepoRef(projectId || repoPath)` `startCodeIntel` indexes under,
    //    so we only query an index that was, or will be, built for this repo.
    //    `queryContext` returns a rendered block OR a truthful `null` (disabled /
    //    not-indexed / no seed match) ⇒ the prompt is left memory-only. Bounded +
    //    non-blocking: a fault is logged and skipped, never crashing a launch.
    if (input.repoPath && this.ctx.codeIntel?.queryContext) {
      try {
        const repoId = repoIdFromRepoRef(input.projectId || input.repoPath);
        const seeds = deriveSeedTerms(input.prompt ?? '');
        const block = await this.ctx.codeIntel.queryContext(repoId, seeds);
        if (block) prompt = `${prompt}\n\n${block}`;
      } catch (err) {
        this.ctx.log.warn(
          { err, runtimeId: input.runtimeId },
          'conductor openfang code-context enrich faulted — skipped'
        );
      }
    }

    return prompt;
  }

  /**
   * Fire-and-forget code-intel on workspace create: recodergit repo index + beads
   * issue-graph claim + ColBERT PLAID index build. Never awaited (a slow/absent
   * engine must not block launch); every call is `void` + self-logging +
   * degrade-safe inside the adapter (or guarded by a truthful `configured()` probe).
   */
  private startCodeIntel(
    input: CreateConductorWorkspaceInput,
    workspace: Workspace
  ): void {
    const repoId = repoIdFromRepoRef(input.projectId || input.repoPath);
    // ColBERT per-repo late-interaction index: chunk the repo's text files and
    // build/refresh the PLAID collection so retrieval can surface passages the
    // single-vector Qdrant top-K misses. Degrade-truthful: no daemon configured, an
    // empty passage set, or a build fault is a logged skip — never blocks a launch.
    if (this.ctx.colbertIndex?.configured() && input.repoPath) {
      const collection = `repo_${repoId}`;
      void readRepoPassages(input.repoPath)
        .then(passages =>
          passages.length > 0
            ? this.ctx.colbertIndex!.ensureIndex(collection, passages, {
                overwrite: true,
              })
            : undefined
        )
        .catch(err =>
          this.ctx.log.warn(
            { err, repoId },
            'conductor colbert index hook faulted'
          )
        );
    }
    if (!this.ctx.codeIntel) return;
    const codeIntel = this.ctx.codeIntel;
    void codeIntel
      .indexRepo(input.repoPath, repoId)
      .catch(err =>
        this.ctx.log.warn(
          { err, repoId },
          'conductor recodergit index hook faulted'
        )
      );
    if (input.taskId) {
      void codeIntel
        .trackWork(input.taskId, workspace.workspaceId)
        .catch(err =>
          this.ctx.log.warn(
            { err, taskId: input.taskId },
            'conductor beads track hook faulted'
          )
        );
    }
  }

  /**
   * Run the repo's configured setup script inside the freshly-created worktree
   * (fire-and-forget). Truthful degrade: no worktree on the record, or no script
   * configured for the repo, is a logged skip — the service NEVER throws and a
   * failing script is a captured (non-blocking) failure, so an allowed launch is
   * never aborted by setup. The repo key is derived from the projectId (preferred)
   * falling back to the repoPath, matching the config write key.
   */
  private runRepoSetup(
    input: CreateConductorWorkspaceInput,
    workspace: Workspace
  ): void {
    if (!workspace.worktreePath) {
      this.ctx.log.debug(
        { workspaceId: workspace.workspaceId, substrate: workspace.substrate },
        'conductor repo-setup skipped (no worktree path)'
      );
      return;
    }
    const repoKey = repoKeyFor(input.projectId, input.repoPath);
    const recoderPort = computeWorkspacePort(workspace.workspaceId);
    void this.ctx.repoSetup
      .runSetup({
        repoKey,
        worktreePath: workspace.worktreePath,
        workspaceId: workspace.workspaceId,
        recoderPort,
      })
      .then(result => {
        if (result.ran && result.ok === false) {
          this.ctx.log.warn(
            {
              workspaceId: workspace.workspaceId,
              repoKey,
              exitCode: result.exitCode,
            },
            'conductor repo-setup script failed (non-blocking)'
          );
        }
      })
      .catch(err =>
        this.ctx.log.warn(
          { err, workspaceId: workspace.workspaceId, repoKey },
          'conductor repo-setup hook faulted'
        )
      );
  }

  /**
   * Resolve the concrete baseRef to persist for a launch. An explicit, concrete
   * caller `baseRef` (e.g. the checkpoint-branch tag) always wins. Otherwise, when
   * the caller left it unset or passed the detached `HEAD` sentinel, probe the repo
   * git-native for its REAL integration base. Never throws; when git cannot answer
   * it returns the caller's value unchanged (the engine then keeps `HEAD`, and the
   * read/merge edges resolve git-native as defense-in-depth).
   */
  private async resolveLaunchBaseRef(
    input: CreateConductorWorkspaceInput
  ): Promise<string | undefined> {
    if (input.baseRef && input.baseRef !== 'HEAD') return input.baseRef;
    if (!input.repoPath) return input.baseRef;
    const resolved = await resolveRepoDefaultBranch(
      execFileSafe,
      input.repoPath
    );
    return resolved ?? input.baseRef;
  }

  async createWorkspace(
    input: CreateConductorWorkspaceInput,
    principal: Principal
  ): Promise<ConductorWriteResult<Workspace>> {
    const action = 'workspace.create';
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('repository', input.repoPath),
        ...(input.taskId ? { taskId: input.taskId } : {}),
        metadata: {
          projectId: input.projectId,
          runtimeId: input.runtimeId,
          substrate: input.substrate,
        },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };

    // Pre-dispatch billing quota gate (OPTIONAL). When wired, a run counts against
    // the subject's `agent_run` quota BEFORE the substrate launches; over-quota is
    // refused truthfully. Absent ⇒ degrade OPEN (no quota gate). A gate EXCEPTION
    // (not a deny) degrades open too — a metering hiccup must not block launches
    // the policy gate already allowed. The gate itself is fail-safe on `allowed`.
    if (this.ctx.entitlementGate) {
      try {
        const decision = await this.ctx.entitlementGate.check(principal, {
          quota: 'agent_run',
        });
        if (!decision.allowed) {
          const reason =
            decision.message ??
            `run quota denied (${decision.reason ?? 'quota_exceeded'})`;
          return { ok: false, verdict, reason };
        }
      } catch (err) {
        this.ctx.log.warn(
          { err, projectId: input.projectId },
          'conductor entitlement quota check errored — degrading open'
        );
      }
    }

    // Pal launch advisory (OPTIONAL): after the write-gate allow, before substrate
    // selection, consult the engines-owned `planLaunch` facet. Pal ADVISES — the
    // caller's explicit choices always win, and pal only fills gaps the operator
    // left blank. A throwing/faulted port NEVER fails a launch (degrade to no
    // advisory); absent ⇒ the whole path is byte-identical to today. `planLaunch`
    // is a pure in-proc verb, so this adds no I/O latency to the launch path.
    let plan: ConductorPlanDecision | undefined;
    if (this.ctx.plan) {
      try {
        plan = this.ctx.plan.plan({
          ...(input.taskId ? { taskId: input.taskId } : {}),
          ...(input.prompt ? { goal: input.prompt } : {}),
        });
      } catch (err) {
        this.ctx.log.warn(
          { err, taskId: input.taskId },
          'conductor pal planLaunch faulted — launching without advisory'
        );
      }
    }

    // Coordination admission (OPTIONAL, degrade-open): on the axis
    // resource-governor → coordination-admission → work-lock → launch, defer a
    // launch whose ISSUE is ALREADY actively held by 2+ agents (a contention the
    // Multica `conflictStatus` sees under 2+ members). Keyed on `input.taskId`
    // (the bd issue the autopilot passes). FAIL-OPEN: absent gate / engine down /
    // any fault ⇒ admit — a coordination engine being down must NEVER block a
    // launch; only a LIVE, engine-confirmed double-assignment defers. The reroute
    // WRITE is governance-gated by the caller (`coordination.reroute`); a
    // deny/throw ⇒ no reroute, launch still deferred (fail-safe).
    if (this.ctx.coordinationAdmission && input.taskId) {
      const issueId = input.taskId;
      try {
        const decision = await this.ctx.coordinationAdmission.admitIssue(
          { issueId },
          {
            authorizeReroute: async () =>
              (
                await guardConductorWrite(
                  this.ctx.gate,
                  'coordination.reroute',
                  principal,
                  {
                    target: conductorTarget('repository', input.repoPath),
                    taskId: issueId,
                    metadata: { issueId },
                  }
                )
              ).allowed,
          }
        );
        if (!decision.admit) {
          // Truthful DEFER — not a governance deny: the write-gate already
          // allowed this launch; coordination re-balances a contended issue.
          await recordConductorAudit(
            this.ctx.gate,
            conductorAuditEntry(action, principal, verdict, {
              coordinationDeferred: true,
              contenders: decision.conflict?.contenders.length ?? 0,
              rerouted: decision.reroute?.routed ?? false,
            })
          );
          return {
            ok: false,
            verdict,
            reason: decision.reason ?? 'issue contended — launch deferred',
          };
        }
      } catch (err) {
        // An optional enrichment gate faulting must NEVER block a launch the
        // policy gate already allowed (fail-open, mirrors the entitlement gate).
        this.ctx.log.warn(
          { err, taskId: issueId },
          'conductor coordination admission errored — degrading open'
        );
      }
    }

    try {
      // Execution-path selection (the ONE seam that splits path a/b). openfang →
      // the native in-process substrate; every CLI runtime → tmux+worktree (or the
      // caller's explicitly requested, registered substrate). Both paths converge on
      // engine.createWorkspace + the SAME capability seams below. The caller's
      // runtimeId ALWAYS wins; pal's advisory runtime only fills a blank one.
      const registered = this.ctx.registry.registry.list();
      const runtimeId = input.runtimeId ?? plan?.runtimeId;
      const openfang = isOpenfangRuntime(runtimeId);
      // Loom is THE default runtime (bootstrap injects `defaultSubstrate: 'loom'`);
      // an unqualified CLI launch rides the durable always-on herd, not a throwaway
      // tmux session. A caller's explicit `input.substrate` always wins; if Loom
      // cannot come up the launch fails LOUD — no silent tmux fallback.
      const substrate: SubstrateKind = openfang
        ? selectSubstrateForRuntime(runtimeId, { registered })
        : (input.substrate ?? this.ctx.cfg.defaultSubstrate);

      // Path (b): the in-process substrate runs `command` as the agent turn, so the
      // integrator enriches the prompt HERE (memory recall) and passes it as command
      // — this bypasses the CLI-only resolveRuntimeCommand. Path (a): leave command
      // undefined so WorkspaceEngine enriches (engineDeps.brain) + resolves the CLI.
      let command = input.command;
      if (openfang && !command) {
        command = await this.enrichOpenfangCommand(input, principal);
      }

      // Resolve the repo's REAL integration base ONCE at launch so the workspace
      // is persisted with a concrete baseRef (e.g. `master`/`develop`/a feature
      // branch) instead of the detached `HEAD` sentinel. The worktree is then cut
      // off that ref, and every downstream read/merge edge (mergeability, review
      // diff, publish) reuses it directly rather than falling back to a hardcoded
      // `main`. Degrade-truthful: an unset caller baseRef that git cannot resolve
      // stays `HEAD` (the edges still resolve git-native as defense-in-depth); an
      // explicit caller baseRef always wins.
      const baseRef = await this.resolveLaunchBaseRef(input);

      // Compose the launch env: the task-id anchor (RECODER_TASK_ID lets the
      // in-process substrate + tailer attach RunEvents) plus — when the acp
      // substrate is selected — the ACP agent binary for this runtime (codex →
      // codex-acp, else claude-code-acp). The adapter resolves RECODER_ACP_AGENT
      // per launch and re-spawns the same binary on reattach.
      const launchEnv: Record<string, string> = { ...(input.env ?? {}) };
      if (input.taskId) launchEnv.RECODER_TASK_ID = input.taskId;
      if (substrate === 'acp')
        launchEnv.RECODER_ACP_AGENT = acpBinaryForRuntime(runtimeId);
      const hasEnv = Object.keys(launchEnv).length > 0;

      // Persist the sibling-awareness flag on the workspace metadata (default
      // TRUE for a taskGroup launch, explicit `false` opts out, ungrouped stays
      // byte-identical) so the completion-time hook can check it. The domain-only
      // `siblingAwareness` field is stripped before the engine input.
      const { siblingAwareness, ...engineInput } = input;
      const metadata = stampSiblingAwareness(input.metadata, siblingAwareness);
      const workspace = await this.ctx.engine.createWorkspace({
        ...engineInput,
        ...(metadata ? { metadata } : {}),
        ...(baseRef !== undefined ? { baseRef } : {}),
        substrate,
        ...(command !== undefined ? { command } : {}),
        ...(hasEnv ? { env: launchEnv } : {}),
        createdBy: principal.userId,
      });

      // Code-intel on create (a + b), fire-and-forget + degrade-safe: recodergit
      // INDEXES the repo (live code-knowledge-graph) and beads TRACKS the workspace
      // as an issue-graph node. A slow/absent engine never blocks the launch.
      this.startCodeIntel(input, workspace);

      // Point the launched agent at the GOVERNED backend MCP host: write a
      // secret-free `.mcp.json` into its worktree (merge-safe + idempotent +
      // git-excluded). Fire-and-forget + degrade-safe — no injector wired, or no
      // worktree yet, is a truthful skip that NEVER fails an allowed launch.
      injectWorktreeMcp(this.ctx, workspace);

      // Ready the checkout for the agent: run the repo's configured setup script
      // inside the new worktree (fire-and-forget + non-blocking + degrade-safe —
      // no script / a failing script never aborts the allowed launch).
      this.runRepoSetup(input, workspace);

      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId: workspace.workspaceId,
          substrate,
          // Pal advisory (present ONLY when the port is wired and pal was
          // consulted) — recorded for audit; pal advises, the governance kernel
          // still decides. Absent port ⇒ these keys are omitted (byte-identical).
          ...(plan
            ? {
                planRisk: plan.risk,
                planApprovalRequired: plan.approvalRequired,
                planSource: plan.source,
              }
            : {}),
        })
      );
      return { ok: true, verdict, value: workspace };
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'workspace launch failed';
      this.ctx.log.error(
        { err, projectId: input.projectId },
        'conductor createWorkspace failed'
      );
      return { ok: false, verdict, reason };
    }
  }

  async steerWorkspace(
    input: SteerInput,
    principal: Principal
  ): Promise<ConductorWriteResult<void>> {
    const action = 'workspace.steer';
    const workspace = await this.ctx.engine.getWorkspace(input.workspaceId);
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', input.workspaceId),
        ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
        metadata: { workspaceId: input.workspaceId },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    if (!workspace)
      return { ok: false, verdict, reason: 'workspace not found' };
    if (workspace.state !== 'running') {
      return {
        ok: false,
        verdict,
        reason: `workspace is ${workspace.state}, not running`,
      };
    }
    // The live transport router is wired at the composition root and dispatches
    // by the workspace's persisted substrate; absent it, steering is refused.
    if (!this.ctx.steerTransport) {
      return {
        ok: false,
        verdict,
        reason:
          'steering requires a live substrate transport (none wired in this composition)',
      };
    }
    // No live session address ⇒ nothing to steer into (never launched / torn down).
    if (!workspace.sessionName) {
      return {
        ok: false,
        verdict,
        reason: 'workspace has no live session handle (nothing to steer)',
      };
    }
    const keys = input.keys;
    if (!keys.trim()) {
      return { ok: false, verdict, reason: 'steer keys must be non-empty' };
    }
    try {
      await this.ctx.steerTransport.sendKeys({
        substrate: workspace.substrate,
        sessionName: workspace.sessionName,
        keys,
        submit: input.submit ?? true,
      });
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId: input.workspaceId,
          bytes: keys.length,
        })
      );
      return { ok: true, verdict };
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : 'steer delivery failed';
      this.ctx.log.warn(
        { err, workspaceId: input.workspaceId },
        'conductor steerWorkspace delivery failed'
      );
      return { ok: false, verdict, reason };
    }
  }

  /**
   * The review→agent roundtrip: fold the reviewer's line-anchored diff comments
   * into ONE structured prompt (`composeReviewPrompt`) and DRIVE the agent with it,
   * so `file:line — comment` notes become precise context the agent acts on.
   *
   * Routes by workspace state so the loop is wired for the REAL review flow (not
   * just a mid-flight running agent):
   *   - `running` (a live turn exists) ⇒ STEER the composed prompt into the session
   *     (fastest roundtrip, no new run) — {@link steerWorkspace}, gated
   *     `workspace.steer`.
   *   - any other (`awaiting_review` / `changes_requested` / `awaiting_approval`,
   *     the states a reviewer actually posts from) ⇒ drive a NEW gated run in the
   *     worktree via the continue/message path — {@link sendWorkspaceMessage}, gated
   *     `workspace.message`. This is the wiring the parity audit found missing: a
   *     comment on a reviewed (non-running) workspace otherwise died with
   *     "workspace is <state>, not running".
   *
   * Both branches inherit ALL governance from the method they delegate to (gate +
   * ownership context + audit seal). Degrade-truthful: a workspace that cannot
   * continue (no worktree / substrate has no in-place relaunch / not found) surfaces
   * the real reason from the continue op — it never fakes a delivery. A payload with
   * no valid comments composes to an empty prompt refused truthfully downstream
   * (`steer keys must be non-empty` / `message text is required`); the HTTP route
   * pre-validates for a clean 400 before we reach here.
   */
  async sendReviewComments(
    input: {
      readonly workspaceId: string;
      readonly comments: readonly ReviewComment[];
    },
    principal: Principal
  ): Promise<ConductorWriteResult<ReviewCommentDelivery>> {
    const prompt = composeReviewPrompt(parseReviewComments(input.comments));
    // Read the state ONLY to pick the delivery path; the actual write is gated
    // (and ownership-guarded at the route) by whichever branch we delegate to.
    const workspace = await this.ctx.engine.getWorkspace(input.workspaceId);

    // Re-type a failure passthrough onto the delivery result (no value present).
    const asFailure = (
      r: ConductorWriteResult<unknown>
    ): ConductorWriteResult<ReviewCommentDelivery> => ({
      ok: false,
      verdict: r.verdict,
      ...(r.reason != null ? { reason: r.reason } : {}),
      ...(r.code != null ? { code: r.code } : {}),
    });

    if (workspace?.state === 'running') {
      const steered = await this.steerWorkspace(
        { workspaceId: input.workspaceId, keys: prompt, submit: true },
        principal
      );
      if (!steered.ok) return asFailure(steered);
      return {
        ok: true,
        verdict: steered.verdict,
        value: { delivery: 'steer' },
      };
    }

    const run = await this.sendWorkspaceMessage(
      input.workspaceId,
      { text: prompt, createdBy: principal.userId },
      principal
    );
    if (!run.ok) return asFailure(run);
    return {
      ok: true,
      verdict: run.verdict,
      value: {
        delivery: 'run',
        runId: run.value?.runId,
        state: run.value?.state,
      },
    };
  }

  /**
   * Gracefully STOP a workspace's run: kill the live substrate session (the
   * worktree is PRESERVED for review), release the write-lock scope, transition
   * the record to `cancelled`, and seal the action into the audit chain.
   * Truthful throughout: a substrate kill that fails leaves the record's state
   * UNCHANGED (the agent may still be live) and surfaces the reason.
   */
  async stopWorkspace(
    workspaceId: string,
    principal: Principal
  ): Promise<ConductorWriteResult<Workspace>> {
    const action = 'workspace.stop';
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', workspaceId),
        ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
        metadata: { workspaceId },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    if (!workspace)
      return {
        ok: false,
        verdict,
        reason: `workspace not found: ${workspaceId}`,
      };
    if (!STOPPABLE_STATES.includes(workspace.state)) {
      return {
        ok: false,
        verdict,
        reason: `workspace is ${workspace.state}, not stoppable`,
      };
    }

    // Kill the live session FIRST (keep the worktree — the work stays reviewable).
    // A kill fault refuses truthfully: the state of record must not claim
    // `cancelled` while the agent may still be running.
    if (workspace.sessionName || workspace.worktreePath) {
      try {
        await this.ctx.registry.getFull(workspace.substrate).teardown(
          {
            ref: workspaceId,
            sessionName: workspace.sessionName,
            worktreePath: workspace.worktreePath,
          },
          { removeIsolation: false }
        );
      } catch (err) {
        const reason =
          err instanceof Error ? err.message : 'substrate kill failed';
        this.ctx.log.warn(
          { err, workspaceId },
          'conductor stopWorkspace substrate kill failed'
        );
        return {
          ok: false,
          verdict,
          reason: `stop failed (session may still be live): ${reason}`,
        };
      }
    }

    // Release the write-lock so the repo scope frees for the next workspace.
    // Degrade-safe: a lock fault never blocks the stop (the agent is dead).
    if (this.ctx.engineDeps.lock) {
      try {
        await this.ctx.engineDeps.lock.release({
          workspaceId,
          spaceId: workspace.spaceId,
          taskId: workspace.taskId,
        });
      } catch (err) {
        this.ctx.log.warn({ err, workspaceId }, 'lock release on stop failed');
      }
    }

    try {
      const stopped = await this.ctx.engine.advanceWorkspace(
        workspaceId,
        'cancelled',
        undefined,
        {
          stoppedBy: principal.userId,
          stoppedAt: new Date().toISOString(),
        }
      );
      this.ctx.terminalService.publishSync({
        workspaceId,
        kind: 'state',
        state: stopped.state,
        at: stopped.updatedAt,
      });
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          from: workspace.state,
        })
      );
      return { ok: true, verdict, value: stopped };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason: err instanceof Error ? err.message : 'stop failed',
      };
    }
  }

  /**
   * ADVANCE a workspace one lifecycle step (review → merge flow): a governed,
   * PURE state transition. Only {@link ADVANCE_TARGET_STATES} are accepted
   * (delivery states need their evidence-bearing edges); the from→to legality is
   * enforced by the canonical agent-os state machine — an illegal step is a
   * truthful refusal, never a forced write.
   */
  async advanceWorkspaceState(
    workspaceId: string,
    to: WorkspaceState,
    principal: Principal
  ): Promise<ConductorWriteResult<Workspace>> {
    const action = 'workspace.advance';
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', workspaceId),
        ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
        metadata: { workspaceId, to },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    if (!workspace)
      return {
        ok: false,
        verdict,
        reason: `workspace not found: ${workspaceId}`,
      };
    if (!ADVANCE_TARGET_STATES.includes(to)) {
      return {
        ok: false,
        verdict,
        reason: `'${to}' is not an advance target (merge/archive/stop own their transitions)`,
      };
    }
    try {
      const advanced = await this.ctx.engine.advanceWorkspace(
        workspaceId,
        to,
        undefined,
        {
          advancedBy: principal.userId,
        }
      );
      this.ctx.terminalService.publishSync({
        workspaceId,
        kind: 'state',
        state: advanced.state,
        at: advanced.updatedAt,
      });
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          from: workspace.state,
          to,
        })
      );
      return { ok: true, verdict, value: advanced };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason: err instanceof Error ? err.message : 'advance failed',
      };
    }
  }

  async reconcile(
    principal: Principal
  ): Promise<ConductorWriteResult<ReconcileReport>> {
    const action = 'workspace.reconcile';
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('global', 'reconcile'),
        metadata: { op: 'reconcile' },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    const report = await substrateReconcile(this.ctx.engineDeps);
    await recordConductorAudit(
      this.ctx.gate,
      conductorAuditEntry(action, principal, verdict, {
        live: report.live.length,
        orphanedWorkspaces: report.orphanedWorkspaces.length,
        resumed: report.resumed.length,
      })
    );
    return { ok: true, verdict, value: report };
  }

  async archiveWorkspace(
    workspaceId: string,
    principal: Principal
  ): Promise<ConductorWriteResult<Workspace>> {
    const action = 'workspace.archive';
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', workspaceId),
        metadata: { workspaceId },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const archived = await archiveWorkspaceOp(
        buildReviewDeps(this.ctx),
        workspaceId
      );
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, { workspaceId })
      );
      return { ok: true, verdict, value: archived };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason: err instanceof Error ? err.message : 'archive failed',
      };
    }
  }

  /**
   * FILE-LEVEL REJECT in review (`POST …/files/discard`) — restore the selected
   * paths to the review base so Apply (= merge) delivers only the accepted set.
   * GATED (`workspace.discard`): the governance gate runs BEFORE any git write
   * (a deny never reaches the worktree) and the performed discard is sealed
   * into the audit chain like every other workspace write. Degrade-truthful:
   * per-path outcomes come back individually (a bad path fails that path, not
   * the batch); a zero-effect call is a truthful no-op (`committed:false`).
   */
  async discardWorkspaceFiles(
    workspaceId: string,
    paths: readonly string[],
    principal: Principal
  ): Promise<ConductorWriteResult<WorkspaceDiscardView>> {
    const action = 'workspace.discard';
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', workspaceId, 'paths', ...[...paths].sort()),
        ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
        metadata: { workspaceId, pathCount: paths.length },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    if (!workspace)
      return {
        ok: false,
        verdict,
        reason: `workspace not found: ${workspaceId}`,
      };
    try {
      const view = await discardWorkspacePathsOp(
        buildReviewDeps(this.ctx),
        workspace,
        paths
      );
      const count = (a: string) =>
        view.results.filter(r => r.action === a).length;
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          requested: paths.length,
          restored: count('restored'),
          removed: count('removed'),
          unchanged: count('unchanged'),
          failed: count('failed'),
          committed: view.committed,
        })
      );
      return { ok: true, verdict, value: view };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason: err instanceof Error ? err.message : 'discard failed',
      };
    }
  }

  /**
   * HUNK-LEVEL REJECT in review (`POST …/files/discard-hunks`) — reverse-apply
   * the selected hunks of ONE path against the review base so Apply (= merge)
   * delivers only the accepted edits. GATED (`workspace.discard` — the SAME
   * action as the file-level reject: same risk, same approval seam) and sealed
   * into the audit chain like every other workspace write. Degrade-truthful:
   * per-hunk outcomes come back individually (an out-of-range index fails that
   * index, not the batch); the assembled patch applies atomically; a
   * zero-effect call is a truthful no-op (`committed:false`).
   */
  async discardWorkspaceHunks(
    workspaceId: string,
    filePath: string,
    hunkIndexes: readonly number[],
    principal: Principal
  ): Promise<ConductorWriteResult<WorkspaceDiscardHunksView>> {
    const action = 'workspace.discard';
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget(
          'workspace',
          workspaceId,
          'hunks',
          filePath,
          [...hunkIndexes].sort((a, b) => a - b).join(',')
        ),
        ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
        metadata: {
          workspaceId,
          path: filePath,
          hunkCount: hunkIndexes.length,
        },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    if (!workspace)
      return {
        ok: false,
        verdict,
        reason: `workspace not found: ${workspaceId}`,
      };
    try {
      const view = await discardWorkspaceHunksOp(
        buildReviewDeps(this.ctx),
        workspace,
        filePath,
        hunkIndexes
      );
      const count = (a: string) =>
        view.hunks.filter(h => h.action === a).length;
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          path: filePath,
          requested: hunkIndexes.length,
          discarded: count('discarded'),
          failed: count('failed'),
          committed: view.committed,
        })
      );
      return { ok: true, verdict, value: view };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason: err instanceof Error ? err.message : 'discard hunks failed',
      };
    }
  }

  async createWorkspacePr(
    workspaceId: string,
    input: CreatePrInput,
    principal: Principal
  ): Promise<ConductorWriteResult<CreatePrResultView>> {
    const action = 'workspace.pr';
    // Production rule: opening a PR pushes the branch (customer-visible delivery)
    // — the governance gate is THE approval seam; a deny never reaches git/gh.
    // The workspace's taskId anchors approval correlation: an `approved` record
    // for (taskId, action) clears a needs_approval verdict on retry.
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', workspaceId),
        ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
        metadata: { workspaceId, base: input.base },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const deps: PublishOpsDeps = buildReviewDeps(this.ctx);
      const result = await createWorkspacePrOp(deps, workspaceId, input);
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          url: result.url,
        })
      );
      return { ok: true, verdict, value: result };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason: err instanceof Error ? err.message : 'pr failed',
      };
    }
  }

  async mergeWorkspace(
    workspaceId: string,
    input: MergeInput,
    principal: Principal
  ): Promise<ConductorWriteResult<MergeResultView>> {
    const action = 'workspace.merge';
    // A merge is THE customer-visible delivery — gate before any git/gh runs.
    // The workspace's taskId anchors approval correlation: an `approved` record
    // for (taskId, action) clears a needs_approval verdict on retry.
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', workspaceId),
        ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
        metadata: { workspaceId, strategy: input.strategy },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      // Gather the convergence-evidence inputs at DECISION TIME (before the merge
      // mutates state): the candidate siblings + the folded pre-merge verification.
      // Degrade-truthful — never throws, so a compare/readiness fault never blocks
      // the merge (the evidence just records the parts it could truthfully gather).
      const preMerge = await this.gatherConvergenceInputs(
        workspaceId,
        workspace,
        principal
      );

      // MERGE TRUST GATE (product): fold the pre-merge signals (readiness verdict +
      // blockers, the merge verdict, breadth) into the convergence trust score and
      // enforce the deployment posture. `off` (default) never interferes; `block`
      // REFUSES a low-trust merge BEFORE it mutates; `warn` proceeds with an
      // advisory. Degrade-truthful: the trust only ever downgrades allowed→warned/
      // blocked, and every block carries the score's own reasons.
      let trustAdvisory:
        | { warning?: string; tier: 'high' | 'medium' | 'low'; score: number; flags: readonly string[] }
        | undefined;
      const trustMode = this.ctx.cfg.mergeTrustGate;
      if (trustMode !== 'off') {
        const view = preMerge.verification?.view;
        const trust = computeConvergenceTrust({
          verification: view
            ? {
                ...(view.verdict ? { verdict: view.verdict } : {}),
                blockers: view.blockers,
                ...(preMerge.verification?.reason
                  ? { reason: preMerge.verification.reason }
                  : {}),
              }
            : {
                available: false,
                reason: preMerge.verification?.reason ?? 'merge readiness unavailable',
              },
          governance: {
            degraded: verdict.degraded,
            riskTier: verdict.tier,
            effect: verdict.effect,
            ...(verdict.approvalId ? { approvalId: verdict.approvalId } : {}),
          },
          candidateCount: preMerge.candidates.length,
        });
        const gate = evaluateMergeTrustGate(trust, trustMode);
        if (!gate.allow) {
          await recordConductorAudit(
            this.ctx.gate,
            conductorAuditEntry(action, principal, verdict, {
              workspaceId,
              trustGate: 'blocked',
              trustTier: gate.tier,
              trustScore: gate.score,
            })
          );
          return { ok: false, verdict, reason: gate.reason };
        }
        trustAdvisory = {
          ...(gate.warning ? { warning: gate.warning } : {}),
          tier: gate.tier,
          score: gate.score,
          flags: trust.reviewFlags,
        };
      }

      const deps: PublishOpsDeps = buildReviewDeps(this.ctx);
      const result = await mergeWorkspaceOp(deps, workspaceId, input);

      // Assemble the exportable convergence evidence record (step-3 headline
      // artifact), seal its hash into the durable Merkle chain, and persist the
      // full record for `GET …/evidence`. Never blocks/rolls back the merge:
      // the merge already happened above, so ANY throw here degrades to a null
      // record (truthful) rather than misreporting the succeeded merge as failed
      // via the outer catch.
      let emitted: {
        record: ConvergenceEvidenceRecord | null;
        sealed: AuditRecord | null;
      } = {
        record: null,
        sealed: null,
      };
      try {
        emitted = await this.emitConvergenceEvidence({
          action,
          principal,
          verdict,
          workspace,
          result,
          preMerge,
        });
      } catch (err) {
        this.ctx.log.warn(
          { err, workspaceId },
          'convergence evidence emission failed (merge succeeded, unaffected)'
        );
      }

      const value: MergeResultView = {
        ...result,
        auditId: emitted.sealed?.id ?? null,
        auditSeq: emitted.sealed?.seq ?? null,
        auditEntryHash: emitted.sealed?.entryHash ?? null,
        evidenceHash: emitted.record?.evidence.contentHash ?? null,
        ...(trustAdvisory
          ? {
              ...(trustAdvisory.warning ? { trustWarning: trustAdvisory.warning } : {}),
              trustTier: trustAdvisory.tier,
              trustScore: trustAdvisory.score,
              ...(trustAdvisory.flags.length > 0 ? { trustFlags: trustAdvisory.flags } : {}),
            }
          : {}),
      };
      // Delivery-feedback fusion: a MERGED workspace is THE positive delivery
      // outcome. When the run's routed inference_id was persisted onto the record
      // (`metadata.inferenceId`), fire the inference routing feedback seam so the
      // LLM gateway learns `task_success` from real deliveries. Degrade-truthful:
      // no persisted inference_id (non-napi run / no correlation) ⇒ a silent skip, never faked.
      // The anchor IS persisted by the run-inference sink (bootstrap:1115 →
      // recordRunInferenceId) for napi-tier completions carrying a correlationWorkspaceId.
      if (result.merged && this.ctx.onDeliveryFeedback) {
        const inferenceId = workspace?.metadata?.inferenceId;
        if (typeof inferenceId === 'string' && inferenceId.length > 0) {
          this.ctx.onDeliveryFeedback(inferenceId, principal.userId, true);
        }
      }
      return { ok: true, verdict, value };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason: err instanceof Error ? err.message : 'merge failed',
      };
    }
  }

  /**
   * Gather the convergence-evidence inputs at DECISION TIME — the candidate
   * siblings (the compare read) and the folded pre-merge verification (readiness).
   * Both are settled INDEPENDENTLY so a rejected/hung probe degrades to an absent
   * input (never throws). Candidates always include at least the merged workspace
   * (`workspaceSiblings` returns a singleton for an ungrouped one; a bare fallback
   * covers a compare fault) so the record can never be candidate-less.
   */
  private async gatherConvergenceInputs(
    workspaceId: string,
    workspace: Workspace | null,
    principal: Principal
  ): Promise<{
    candidates: readonly EvidenceCandidateInput[];
    verification?: { view?: ReadinessView; reason?: string };
  }> {
    const [siblingsR, readinessR] = await Promise.allSettled([
      // Owner-scope the sibling gather to the MERGING principal — else a colliding,
      // caller-supplied taskGroup folds ANOTHER tenant's siblings (branch/diffStat/
      // changedFiles) into this merge's sealed evidence. Matches the compare route's
      // principal-narrowed seam. (recoder-ilnw)
      this.ctx.workspaceSiblings(workspaceId, principal),
      this.ctx.workspaceReadiness(workspaceId),
    ]);

    const candidates: EvidenceCandidateInput[] = [];
    if (siblingsR.status === 'fulfilled' && siblingsR.value) {
      for (const sibling of siblingsR.value.siblings) {
        candidates.push({
          workspaceId: sibling.workspaceId,
          agent: sibling.agent,
          branch: sibling.branch,
          ...(sibling.runId ? { runId: sibling.runId } : {}),
          state: sibling.state,
          ...(sibling.diffStat ? { diffStat: sibling.diffStat } : {}),
          ...(sibling.changedFiles
            ? { changedFiles: sibling.changedFiles }
            : {}),
        });
      }
    }
    // Fallback: a compare fault must not produce a candidate-less record — record
    // at least the chosen workspace from the record we already hold.
    if (candidates.length === 0 && workspace) {
      candidates.push({
        workspaceId: workspace.workspaceId,
        agent: workspace.runtimeId,
        branch: workspace.branch,
        ...(workspace.runId ? { runId: workspace.runId } : {}),
        state: workspace.state,
      });
    }

    const verification =
      readinessR.status === 'fulfilled'
        ? { view: readinessR.value }
        : { reason: 'readiness probe unavailable' };
    return { candidates, verification };
  }

  /**
   * Assemble + seal + persist the exportable convergence evidence record for a
   * merge. The evidence `contentHash` is sealed INTO the durable Merkle chain
   * payload (so the tamper-evident audit leaf commits to the exact evidence), then
   * the full record (evidence + the returned chain pointer) is persisted onto the
   * workspace for `GET …/evidence`. DEGRADE-TRUTHFUL: a sealing/persist fault
   * degrades to `null` ids (the merge already succeeded and is never rolled back).
   */
  private async emitConvergenceEvidence(args: {
    action: GovernanceAction;
    principal: Principal;
    verdict: GateVerdict;
    workspace: Workspace | null;
    result: MergeResultView;
    preMerge: {
      candidates: readonly EvidenceCandidateInput[];
      verification?: { view?: ReadinessView; reason?: string };
    };
  }): Promise<{
    record: ConvergenceEvidenceRecord | null;
    sealed: AuditRecord | null;
  }> {
    const { action, principal, verdict, workspace, result, preMerge } = args;
    const governance: EvidenceGovernance = {
      action,
      effect: verdict.effect,
      riskTier: verdict.tier,
      degraded: verdict.degraded,
      ...(verdict.reason ? { reason: verdict.reason } : {}),
      ...(verdict.approvalId ? { approvalId: verdict.approvalId } : {}),
    };
    const mergedAtRaw = workspace?.metadata?.mergedAt;
    // Step-2 provenance: a COMPOSED convergence workspace carries its per-file
    // selection block on `metadata.convergence` (stamped by `composeConvergence`).
    // Present ⇒ the evidence shows WHICH sibling won each contested file; a plain
    // single-agent merge has none (absent, never fabricated).
    const convergence = this.readConvergenceProvenance(workspace);
    const evidence = assembleConvergenceEvidence({
      chosenWorkspaceId: result.workspaceId,
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      taskGroup: workspace ? (taskGroupOf(workspace) ?? null) : null,
      ...(typeof result.mergeMode === 'string'
        ? { mergeMode: result.mergeMode }
        : {}),
      candidates: preMerge.candidates,
      governance,
      ...(preMerge.verification ? { verification: preMerge.verification } : {}),
      ...(convergence ? { convergence } : {}),
      actorId: principal.userId,
      mergedAt:
        typeof mergedAtRaw === 'string'
          ? mergedAtRaw
          : new Date().toISOString(),
    });

    // Seal the evidence hash into the Merkle chain (the audit leaf commits to it).
    const sealed = await recordConductorAudit(
      this.ctx.gate,
      conductorAuditEntry(action, principal, verdict, {
        workspaceId: result.workspaceId,
        merged: result.merged,
        evidenceHash: evidence.contentHash,
        taskGroup: evidence.taskGroup,
        candidateCount: evidence.candidateCount,
        verificationVerdict: evidence.verification.verdict ?? 'unavailable',
      })
    );

    const record: ConvergenceEvidenceRecord = {
      evidence,
      seal: {
        auditId: sealed?.id ?? null,
        auditSeq: sealed?.seq ?? null,
        auditEntryHash: sealed?.entryHash ?? null,
      },
    };
    // Persist for retrieval via the SAME same-state metadata-merge idiom
    // `previewVerification` uses (advanceWorkspace MERGES the patch, never replaces).
    // Best-effort: a persist fault never rolls back the merge.
    try {
      const current = await this.ctx.engine.getWorkspace(result.workspaceId);
      if (current) {
        await this.ctx.engine.advanceWorkspace(
          result.workspaceId,
          current.state,
          undefined,
          {
            convergenceEvidence: record,
          }
        );
      }
    } catch (err) {
      this.ctx.log.warn(
        { err, workspaceId: result.workspaceId },
        'convergence evidence persist failed (merge unaffected)'
      );
    }
    return { record, sealed };
  }

  /**
   * Read the step-2 convergence provenance a composed workspace carries on
   * `metadata.convergence`, narrowed to {@link EvidenceConvergence}. Absent /
   * malformed ⇒ `undefined` (a plain single-agent merge has none — never fabricated).
   */
  private readConvergenceProvenance(
    workspace: Workspace | null
  ): EvidenceConvergence | undefined {
    const raw = (workspace?.metadata as Record<string, unknown> | undefined)
      ?.convergence;
    if (!raw || typeof raw !== 'object') return undefined;
    const value = raw as Partial<EvidenceConvergence> & {
      assisted?: readonly { path?: unknown; inference_id?: unknown }[];
    };
    if (!Array.isArray(value.selections) || typeof value.fileCount !== 'number')
      return undefined;
    // The ops layer stamps model-written files as `assisted` (snake_case
    // inference_id from the gateway) — carry them into the sealed evidence;
    // dropping them here would hide a model-authored merge from the audit.
    const assisted = Array.isArray(value.assisted)
      ? value.assisted
          .filter(a => typeof a?.path === 'string')
          .map(a => ({
            path: a.path as string,
            ...(typeof a.inference_id === 'string'
              ? { inferenceId: a.inference_id }
              : {}),
          }))
      : [];
    return {
      fromTaskGroup:
        typeof value.fromTaskGroup === 'string' ? value.fromTaskGroup : null,
      sourceCount:
        typeof value.sourceCount === 'number' ? value.sourceCount : 0,
      fileCount: value.fileCount,
      selections: value.selections,
      ...(assisted.length > 0 ? { assisted } : {}),
    };
  }

  /**
   * SINGLE-WRITER persist of a run's napi-tier `inference_id` onto the workspace
   * record — the WRITE side of the merge → `feedback()` RLHF loop consumed at
   * {@link mergeWorkspace} (`:1338`). Reuses the same-state metadata-patch idiom of
   * {@link setPreviewUrl} (`:1245`): `advanceWorkspace` transitions the workspace to
   * its CURRENT state and MERGES the `{ inferenceId }` patch onto existing metadata
   * (verified: `transitionWorkspace` spreads `...metadata`), so a concurrent
   * lifecycle advance is never clobbered and only `inferenceId` is written.
   *
   * WRITE-ONCE: an already-anchored workspace returns `true` without a write — the
   * first napi-served completion of a run claims the anchor, minimizing the race
   * window against concurrent advances and never overwriting a resolvable id.
   *
   * No governance gate: this is an internal correlation write on the sink's
   * fire-and-forget path (mirrors the internal principal path the autopilot uses),
   * not a customer-visible action. Degrade-truthful: a missing workspace ⇒ `false`.
   */
  async recordRunInferenceId(
    workspaceId: string,
    inferenceId: string
  ): Promise<boolean> {
    if (!inferenceId) return false;
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace) return false;
    // Write-once anchor: never clobber a persisted id.
    const existing = workspace.metadata?.inferenceId;
    if (typeof existing === 'string' && existing.length > 0) return true;
    // Same-state advance (no illegal transition) — the metadata patch merges.
    await this.ctx.engine.advanceWorkspace(
      workspaceId,
      workspace.state,
      undefined,
      { inferenceId }
    );
    return true;
  }

  async sendWorkspaceMessage(
    workspaceId: string,
    input: ContinueWorkspaceInput,
    principal: Principal
  ): Promise<ConductorWriteResult<ContinueWorkspaceResult>> {
    const action = 'workspace.message';
    const { allowed, verdict } = await guardConductorWrite(
      this.ctx.gate,
      action,
      principal,
      {
        target: conductorTarget('workspace', workspaceId),
        metadata: { workspaceId },
      }
    );
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    try {
      const deps: ContinueOpsDeps = {
        getWorkspace: id => this.ctx.engine.getWorkspace(id),
        advanceWorkspace: (id, to, patch, metadata) =>
          this.ctx.engine.advanceWorkspace(id, to, patch, metadata),
        getSubstrate: (id: WorkspaceSubstrate) => this.ctx.registry.getFull(id),
        repository: this.ctx.repository,
        tailer: this.ctx.tailer,
        logger: this.ctx.log,
        ...(this.ctx.brain ? { brain: this.ctx.brain } : {}),
      };
      const result = await continueWorkspaceOp(deps, workspaceId, {
        ...input,
        createdBy: input.createdBy ?? principal.userId,
      });
      await recordConductorAudit(
        this.ctx.gate,
        conductorAuditEntry(action, principal, verdict, {
          workspaceId,
          runId: result.runId,
        })
      );
      return { ok: true, verdict, value: result };
    } catch (err) {
      return {
        ok: false,
        verdict,
        reason: err instanceof Error ? err.message : 'message failed',
      };
    }
  }
}

/**
 * Derive a deterministic, path-safe repo id for the recodergit index from a repo
 * full-name or absolute path (lowercase; every non `[a-z0-9_-]` run → `__`). Kept
 * local so the conductor never imports an engines-domain internal.
 */
function repoIdFromRepoRef(ref: string): string {
  return ref
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '__');
}

/**
 * Map a runtime to the ACP agent binary that drives it on the `acp` substrate:
 * the `codex` runtime uses Zed's `codex-acp`, everything else the default
 * `claude-code-acp`. Surfaced to the adapter via the `RECODER_ACP_AGENT` env var.
 */
function acpBinaryForRuntime(runtimeId: string | undefined): string {
  return runtimeId === 'codex' ? 'codex-acp' : 'claude-code-acp';
}
