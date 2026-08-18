/**
 * Workspace reads behind the `ConductorComposer` facade: the state-of-record
 * lists/queries, the run-screen detail reads, the attention-enriched views, the
 * review diff/tree projections, merge readiness, and the environment/transcript/
 * run-config/audit probes. Every method body moved VERBATIM from the composer.
 */
import type { RunEvent, Workspace } from '@recoder/agent-os';
import type { ReconcileFindingView, WorkspaceView } from '../types.js';
import type { AuditRecord } from '../ports/index.js';
import type { PrReviewEvidenceView } from '../ports/pr-review.port.js';
import {
  classifyAttention,
  type AttentionResult,
  type AttentionSignals,
} from '../attention/attention-classifier.js';
import type { WaitFrameData } from '../wait/wait.service.js';
import {
  workspaceDiff as workspaceDiffOp,
  workspaceDiffFiles as workspaceDiffFilesOp,
  workspaceFilePatch as workspaceFilePatchOp,
  workspaceTree as workspaceTreeOp,
  type WorkspaceDiffView,
  type WorkspaceDiffFilesView,
  type WorkspaceFilePatchView,
  type WorkspaceTreeView,
} from '../review/workspace-review.ops.js';
import {
  detectDevCommand,
  type DevCommandView,
} from '../adapters/dev-command.adapter.js';
import {
  filterWorkspaces,
  sortByRecencyDesc,
  type WorkspaceQueryFilters,
} from '../services/workspace-query.service.js';
import { repoKeyFor } from '../services/repo-setup.service.js';
import type { PrStatusView } from '../services/pr-status.service.js';
import type { MergeabilityView } from '../services/mergeability.service.js';
import { computeWorkspacePort } from '../services/workspace-port.js';
import { readWorkspacePanes } from '../services/workspace-panes.js';
import { readRepoConfigFile } from '../services/repo-config-file.js';
import type { EnvironmentImportView } from '../services/environment-import.js';
import type {
  TranscriptSearchView,
  WorkspaceTranscriptView,
} from '../services/session-transcript.service.js';
import {
  foldReadiness,
  type ReadinessView,
} from '../services/readiness.service.js';
import { foldOpenWork, type OpenWorkView } from '../services/openwork.service.js';
import { scanDiffForSecrets, type SecurityScanResult } from '../services/security-scan.service.js';
import { foldCheckRuns } from '../services/check-run.service.js';
import {
  buildReviewDeps,
  type ConductorContext,
  type WorkspaceRunConfigView,
} from './shared.js';

/** How many trailing terminal lines the attention probe captures. */
const ATTENTION_TAIL_LINES = 60;

export class ConductorReads {
  constructor(private readonly ctx: ConductorContext) {}

  async listWorkspaces(): Promise<Workspace[]> {
    return this.ctx.engine.listWorkspaces();
  }

  /**
   * Board search/filter — the state-of-record list narrowed by the query filters
   * (free-text `q` over codename/repo/branch/task/goal/agent, plus exact `state`,
   * substring `repo`/`agent`, and the tri-state `archived`). Read-only: it fetches
   * the canonical list and applies the pure {@link filterWorkspaces}, never gating,
   * auditing, or mutating. An empty match is a truthful empty list.
   */
  async queryWorkspaces(filters: WorkspaceQueryFilters): Promise<Workspace[]> {
    const workspaces = await this.ctx.engine.listWorkspaces();
    return filterWorkspaces(workspaces, filters);
  }

  /**
   * Archived history — every archived workspace, most-recent-first. A convenience
   * over {@link queryWorkspaces} with `archived: true`; read-only and degrade-safe
   * (no archived records ⇒ a truthful empty list).
   */
  async listArchivedWorkspaces(): Promise<Workspace[]> {
    const workspaces = await this.ctx.engine.listWorkspaces();
    return sortByRecencyDesc(filterWorkspaces(workspaces, { archived: true }));
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.ctx.engine.getWorkspace(workspaceId);
  }

  async listWorkspaceEvents(workspaceId: string): Promise<RunEvent[]> {
    return this.ctx.engine.listWorkspaceEvents(workspaceId);
  }

  async workspaceOutput(
    workspaceId: string,
    lines?: number
  ): Promise<{ output: string }> {
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
    const substrate = this.ctx.registry.getFull(workspace.substrate);
    const captured = await substrate.capture(
      {
        ref: workspaceId,
        sessionName: workspace.sessionName,
        worktreePath: workspace.worktreePath,
      },
      lines
    );
    // A gone handle captures null — an empty output is the truthful read.
    return { output: captured ?? '' };
  }

  async workspaceStatus(workspaceId: string): Promise<{
    alive: boolean;
    exitCode: number | null;
    recentOutput: string | null;
    state: Workspace['state'];
    reason?: string;
  }> {
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
    if (!workspace.sessionName && !workspace.worktreePath) {
      return {
        alive: false,
        exitCode: null,
        recentOutput: null,
        state: workspace.state,
        reason:
          'no live substrate handle (never launched or already torn down)',
      };
    }
    const substrate = this.ctx.registry.getFull(workspace.substrate);
    const handle = {
      ref: workspaceId,
      sessionName: workspace.sessionName,
      worktreePath: workspace.worktreePath,
    };
    const [alive, exitCode, recentOutput] = await Promise.all([
      substrate.alive(handle),
      substrate.exitCode
        ? substrate.exitCode(handle)
        : Promise.resolve(undefined),
      substrate.capture(handle, 50),
    ]);
    return {
      alive,
      // `undefined` (still running / unknown) is not JSON-representable — the
      // wire contract carries null for "no exit code yet"; NEVER a fabricated 0.
      exitCode: exitCode ?? null,
      recentOutput,
      state: workspace.state,
    };
  }

  // --- workspace views (attention-enriched read model) --------------------------

  /**
   * The attention-enriched read model of one workspace, or null. The attention
   * classification is derived truthfully from the durable state, the run's
   * RunEvents, and (for live states) the captured terminal tail; every signal
   * source is degrade-safe — a capture/repository fault is a MISSING signal
   * (`'unknown'`), never a fabricated one.
   */
  async workspaceView(workspaceId: string): Promise<WorkspaceView | null> {
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace) return null;
    const view = await this.buildWorkspaceView(workspace);
    // Pane probe — SINGLE-workspace read only (the list view must not shell out
    // per record), gated on the same live-ish states as the attention probe.
    // Degrade-truthful: no introspect port / no session / a fault ⇒ the facet
    // is omitted (undefined), never a fabricated empty list.
    const probePanes =
      (workspace.state === 'running' ||
        workspace.state === 'changes_requested') &&
      Boolean(workspace.sessionName);
    const panes = probePanes
      ? await readWorkspacePanes(
          this.ctx.tmuxIntrospect,
          workspace.sessionName,
          this.ctx.log
        )
      : undefined;
    return panes ? { ...view, panes } : view;
  }

  /**
   * Snapshot the AUTHORITATIVE attention signals + current run identity for one
   * workspace — the per-poll frame source behind the wait-until-settled primitive
   * (`wait/wait.service.ts`). Returns `null` when the workspace no longer exists
   * (a truthful stream end, never a fabricated frame). Mirrors the attention probe
   * of {@link buildWorkspaceView} (durable state + run events + live terminal tail)
   * but returns the RAW signals so the {@link WaitService} re-derives the state via
   * `classifyAttention` itself. Every signal source is degrade-safe: a capture /
   * event-read fault is a MISSING signal (`unknown` → keep waiting), never faked.
   */
  async attentionSnapshot(workspaceId: string): Promise<WaitFrameData | null> {
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace) return null;

    let tail: string | null | undefined;
    const probeLive =
      (workspace.state === 'running' ||
        workspace.state === 'changes_requested') &&
      Boolean(workspace.sessionName || workspace.worktreePath);
    if (probeLive) {
      try {
        const substrate = this.ctx.registry.getFull(workspace.substrate);
        tail = await substrate.capture(
          {
            ref: workspace.workspaceId,
            sessionName: workspace.sessionName,
            worktreePath: workspace.worktreePath,
          },
          ATTENTION_TAIL_LINES
        );
      } catch (err) {
        this.ctx.log.warn(
          { err, workspaceId: workspace.workspaceId },
          'wait attention probe faulted'
        );
      }
    }

    let events: readonly RunEvent[] | undefined;
    try {
      events = await this.ctx.engine.listWorkspaceEvents(workspace.workspaceId);
    } catch (err) {
      this.ctx.log.warn(
        { err, workspaceId: workspace.workspaceId },
        'wait attention event read faulted'
      );
    }

    const signals: AttentionSignals = {
      state: workspace.state,
      ...(workspace.runtimeId ? { runtime: workspace.runtimeId } : {}),
      ...(events ? { events } : {}),
      ...(tail !== undefined ? { tail } : {}),
    };
    return {
      signals,
      runId: workspace.runId ?? null,
      runtimeId: workspace.runtimeId ?? null,
    };
  }

  /** Attention-enriched views of every workspace (the cockpit list's badges). */
  async listWorkspaceViews(): Promise<WorkspaceView[]> {
    const workspaces = await this.ctx.engine.listWorkspaces();
    return Promise.all(
      workspaces.map(workspace => this.buildWorkspaceView(workspace))
    );
  }

  async buildWorkspaceView(workspace: Workspace): Promise<WorkspaceView> {
    // Probe the substrate ONLY where the live tail can decide (running-ish states
    // with a handle) — listing must not shell out per archived record.
    let tail: string | null | undefined;
    let live: boolean | undefined;
    const probeLive =
      (workspace.state === 'running' ||
        workspace.state === 'changes_requested') &&
      Boolean(workspace.sessionName || workspace.worktreePath);
    if (probeLive) {
      try {
        const substrate = this.ctx.registry.getFull(workspace.substrate);
        const handle = {
          ref: workspace.workspaceId,
          sessionName: workspace.sessionName,
          worktreePath: workspace.worktreePath,
        };
        [live, tail] = await Promise.all([
          substrate.alive(handle),
          substrate.capture(handle, ATTENTION_TAIL_LINES),
        ]);
      } catch (err) {
        // Missing signal, not a fabricated one — the classifier reports unknown.
        this.ctx.log.warn(
          { err, workspaceId: workspace.workspaceId },
          'attention probe faulted'
        );
      }
    }

    let events: readonly RunEvent[] | undefined;
    try {
      events = await this.ctx.engine.listWorkspaceEvents(workspace.workspaceId);
    } catch (err) {
      this.ctx.log.warn(
        { err, workspaceId: workspace.workspaceId },
        'attention event read faulted'
      );
    }

    const attention: AttentionResult = classifyAttention({
      state: workspace.state,
      ...(workspace.runtimeId ? { runtime: workspace.runtimeId } : {}),
      ...(events ? { events } : {}),
      ...(tail !== undefined ? { tail } : {}),
    });

    return {
      workspaceId: workspace.workspaceId,
      spaceId: workspace.spaceId,
      projectId: workspace.projectId,
      taskId: workspace.taskId,
      ...(workspace.runId ? { runId: workspace.runId } : {}),
      runtimeId: workspace.runtimeId,
      substrate: workspace.substrate,
      branch: workspace.branch,
      baseRef: workspace.baseRef,
      ...(workspace.worktreePath
        ? { worktreePath: workspace.worktreePath }
        : {}),
      ...(workspace.sessionName ? { sessionName: workspace.sessionName } : {}),
      state: workspace.state,
      createdBy: workspace.createdBy,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      attention: attention.attention,
      attentionReason: attention.reason,
      ...(live !== undefined ? { live } : {}),
    };
  }

  async workspaceDiff(workspaceId: string): Promise<WorkspaceDiffView> {
    return workspaceDiffOp(buildReviewDeps(this.ctx), workspaceId);
  }

  async workspaceTree(workspaceId: string): Promise<WorkspaceTreeView> {
    return workspaceTreeOp(buildReviewDeps(this.ctx), workspaceId);
  }

  /**
   * Per-file changed list — a faithful slice of the {@link workspaceDiff} blob
   * (working tree vs the review base). PURE read (no state transition, unlike the
   * legacy `/diff`); degrade-truthful (`available:false, files:[]` for a
   * non-repo/no-worktree tree, never a fabricated file).
   */
  async workspaceDiffFiles(
    workspaceId: string
  ): Promise<WorkspaceDiffFilesView> {
    return workspaceDiffFilesOp(buildReviewDeps(this.ctx), workspaceId);
  }

  /**
   * A single file's unified patch (working tree vs the review base). The
   * agent-supplied `path` is passed ONLY as a pathspec after the `--` fence and is
   * rejected pre-spawn if it begins with `-`. PURE read; degrade-truthful
   * (`patch:null` when it cannot be computed, `patch:''` for no diff).
   */
  async workspaceFilePatch(
    workspaceId: string,
    path: string
  ): Promise<WorkspaceFilePatchView> {
    return workspaceFilePatchOp(buildReviewDeps(this.ctx), workspaceId, path);
  }

  async workspaceMergeability(workspaceId: string): Promise<MergeabilityView> {
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
    return this.ctx.mergeability.probe(workspace);
  }

  /**
   * Fold the six merge-decision signals (lifecycle, worktree open-work,
   * mergeability, PR checks, preview verification, unresolved open work) into ONE
   * truthful read-model (`GET …/readiness`). PURE read: no gate, no audit, no mutation. Each probe is
   * settled INDEPENDENTLY via `Promise.allSettled`, so a rejected/hung probe degrades to
   * an ABSENT input — the corresponding signal reports `'unknown'` and the edge
   * never 500s, never a fabricated pass. `state` is read from the already-fetched
   * workspace record (NOT the view probe), so lifecycle stays truthful even if the
   * view probe rejects. A missing workspace throws (→ 404 at the edge). When the
   * PR-status probe fulfilled with a REAL open PR, the ADVISORY auto-review probe
   * ({@link probePrReview}) additionally attaches bounded review evidence — never
   * a 6th signal, never a verdict input.
   */
  async workspaceReadiness(workspaceId: string): Promise<ReadinessView> {
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace) throw new Error(`workspace not found: ${workspaceId}`);
    const [mergeR, prR, worktreeR, previewR, viewR, openWorkR, localChecksR] = await Promise.allSettled([
      this.ctx.mergeability.probe(workspace),
      this.ctx.prStatus.status(workspace),
      this.ctx.worktreeStatus.probe(workspace),
      this.ctx.getPreviewVerification(workspaceId),
      this.buildWorkspaceView(workspace),
      this.probeOpenWork(workspace),
      // Recoder's OWN checks (recoder-fxee) — only when a sandbox runner is wired;
      // absent ⇒ resolves to no local checks, so `checks` stays GitHub-only.
      this.ctx.checkRunner
        ? this.ctx.checkRunner.run(workspace.workspaceId).then((runs) => foldCheckRuns(runs))
        : Promise.resolve(undefined),
    ]);
    const review = await this.probePrReview(workspace, prR);
    return foldReadiness({
      state: workspace.state,
      ...(viewR.status === 'fulfilled' && viewR.value.attention
        ? { attention: viewR.value.attention }
        : {}),
      ...(mergeR.status === 'fulfilled' ? { mergeability: mergeR.value } : {}),
      ...(prR.status === 'fulfilled' ? { prStatus: prR.value } : {}),
      ...(worktreeR.status === 'fulfilled'
        ? { worktree: worktreeR.value }
        : {}),
      ...(previewR.status === 'fulfilled' ? { preview: previewR.value } : {}),
      ...(review ? { review } : {}),
      ...(openWorkR.status === 'fulfilled' ? { openWork: openWorkR.value.openWork } : {}),
      ...(openWorkR.status === 'fulfilled' ? { security: openWorkR.value.security } : {}),
      ...(localChecksR.status === 'fulfilled' && localChecksR.value
        ? { localChecks: localChecksR.value }
        : {}),
    });
  }

  /**
   * Gather the three OPEN-WORK sources into one truthful {@link OpenWorkView}: the
   * task issue's unchecked acceptance criteria (via `codeIntel.readIssue`), the
   * TODO/FIXME markers the change ADDS (scanned from the working-tree-vs-base
   * patch), and non-closed linked issues. Each source degrades to `null`
   * INDEPENDENTLY (unwired port, absent task, or a git/bd fault) so it contributes
   * nothing rather than a fabricated item; the pure {@link foldOpenWork} decides
   * availability. Never throws (the caller settles it, but this stays self-safe).
   *
   * The linked-issue source surfaces non-closed open work UNDER the task (open
   * blocked child issues, via `codeIntel.openLinkedWork`); it degrades to `null`
   * (truthfully absent, never fabricated) when the seam is unwired or the engine
   * is down.
   */
  private async probeOpenWork(
    workspace: Workspace,
  ): Promise<{ openWork: OpenWorkView; security: SecurityScanResult }> {
    const taskId = workspace.taskId?.trim();
    const [bodyR, diffR, issuesR] = await Promise.allSettled([
      taskId && this.ctx.codeIntel?.readIssue
        ? this.ctx.codeIntel.readIssue(taskId)
        : Promise.resolve(null),
      workspace.worktreePath
        ? workspaceDiffOp(buildReviewDeps(this.ctx), workspace.workspaceId)
        : Promise.resolve(null),
      taskId && this.ctx.codeIntel?.openLinkedWork
        ? this.ctx.codeIntel.openLinkedWork(taskId)
        : Promise.resolve(null),
    ]);
    const taskBody =
      bodyR.status === 'fulfilled' && bodyR.value ? bodyR.value.description ?? null : null;
    const diffText =
      diffR.status === 'fulfilled' && diffR.value ? diffR.value.patch : null;
    const openIssues = issuesR.status === 'fulfilled' ? issuesR.value : null;
    // The diff is fetched ONCE here and feeds two signals: open-work (TODO/criteria/
    // compliance) and the secret scan (recoder-tcn1). Scanning the same patch avoids a
    // second git-diff on this polled edge.
    return {
      openWork: foldOpenWork({ taskBody, diffText, openIssues }),
      security: scanDiffForSecrets({ diffText }),
    };
  }

  /**
   * ADVISORY auto-review probe backing the readiness `review` facet — NEVER a
   * 6th signal. Fires ONLY when the port is wired AND the PR-status probe
   * fulfilled with a real PR (`hasPr` + a numeric number) AND the workspace has
   * a worktree; settled with the same allSettled discipline as the other
   * probes, so a rejecting port degrades to `undefined` (facet omitted at the
   * fold — the readiness read never 500s, never a fabricated review).
   */
  private async probePrReview(
    workspace: Workspace,
    prR: PromiseSettledResult<PrStatusView>
  ): Promise<PrReviewEvidenceView | undefined> {
    const port = this.ctx.prReview;
    if (!port || prR.status !== 'fulfilled') return undefined;
    const prStatus = prR.value;
    if (prStatus.hasPr !== true || typeof prStatus.number !== 'number') {
      return undefined;
    }
    const repoRoot = workspace.worktreePath;
    if (!repoRoot) return undefined;
    const [settled] = await Promise.allSettled([
      port.review({
        prNumber: prStatus.number,
        repoRoot,
        workspaceId: workspace.workspaceId,
      }),
    ]);
    return settled.status === 'fulfilled' ? settled.value : undefined;
  }

  async workspaceDevCommand(
    workspaceId: string
  ): Promise<DevCommandView | null> {
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace?.worktreePath) return null;
    return detectDevCommand(workspace.worktreePath);
  }

  /**
   * First-run environment import (`GET …/environment`): the host git identity,
   * which agent CLIs are already configured, gh auth status, and the shell — so
   * onboarding can say "we found your setup" instead of showing an empty start.
   * PURE read, degrade-truthful (never throws, never fabricates a config).
   */
  async environmentImport(): Promise<EnvironmentImportView> {
    return this.ctx.environmentImportService.probe();
  }

  /**
   * Search Claude session transcripts by message content (`GET …/transcript/search`)
   * — the palette's "find that conversation" over ~/.claude/projects. PURE read,
   * bounded + degrade-truthful (empty query → no hits; no sessions dir →
   * available:false; never throws).
   */
  async searchTranscripts(query: string): Promise<TranscriptSearchView> {
    return this.ctx.sessionTranscriptService.search(query);
  }

  /**
   * Hydrate ONE workspace's Claude transcript (`GET …/workspaces/:id/transcript`)
   * so the Session view seeds prior turns before live replay. PURE read: no
   * worktree ⇒ null (the route maps that to a truthful 404); a workspace with no
   * session file degrades to `available:false` (never a fabricated history).
   */
  async workspaceTranscript(
    workspaceId: string
  ): Promise<WorkspaceTranscriptView | null> {
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace?.worktreePath) return null;
    return this.ctx.sessionTranscriptService.getWorkspaceTranscript(
      workspace.worktreePath
    );
  }

  /**
   * The effective run config for a workspace (`GET …/run-config`): the committed
   * `.recoder/settings.json` scripts, the stable `RECODER_PORT` derived from the
   * committed port window, and the auto-detected dev command. The `run` field is
   * the committed run script when set, else the detected command, else '' — so
   * the UI shows one truthful "how do I run this" answer. Degrade-safe: no
   * worktree ⇒ null; a missing/broken config file degrades to defaults.
   */
  async workspaceRunConfig(
    workspaceId: string
  ): Promise<WorkspaceRunConfigView | null> {
    const workspace = await this.ctx.engine.getWorkspace(workspaceId);
    if (!workspace?.worktreePath) return null;
    // Setup resolves through the SAME resolver the create hook executes
    // (store override → committed file), so this read model can never show a
    // script the hook would not run. repoKeyFor prefers the (required)
    // projectId, matching the create-time key.
    const [config, detected, setup] = await Promise.all([
      readRepoConfigFile(workspace.worktreePath),
      detectDevCommand(workspace.worktreePath),
      this.ctx.repoSetup.resolveScript(
        repoKeyFor(workspace.projectId, undefined),
        workspace.worktreePath
      ),
    ]);
    const port = computeWorkspacePort(
      workspaceId,
      config.port.base,
      config.port.span
    );
    const run =
      config.scripts.run !== ''
        ? config.scripts.run
        : (detected?.command ?? '');
    const runSource: WorkspaceRunConfigView['runSource'] =
      config.scripts.run !== ''
        ? 'config'
        : detected != null
          ? 'detected'
          : 'none';
    return {
      port,
      setup: setup.script,
      setupSource: setup.source,
      run,
      runSource,
      detectedCommand: detected?.command ?? null,
    };
  }

  async listReconcileFindings(
    workspaceId?: string
  ): Promise<readonly ReconcileFindingView[]> {
    return this.ctx.repository.listReconcileFindings(workspaceId);
  }

  /**
   * The durable governance-audit trail for one workspace — the sealed
   * control-plane events (merge/pr/advance/stop) whose payload carries this
   * `workspaceId`, ascending by chain `seq`. Read-only (no gate/mutation). The
   * READ half of the merge→audit seam: `POST …/merge` returns the sealed id and
   * this edge lets the cockpit pull the full queryable trail. Absent reader ⇒ a
   * truthful empty trail, never a fabricated record.
   */
  async workspaceAudit(
    workspaceId: string,
    limit?: number
  ): Promise<readonly AuditRecord[]> {
    if (!this.ctx.auditReader) return [];
    // Solo/desktop (bootstrap-injected `cfg.soloMode`): no durable audit store, so
    // the read hits an unavailable DB and would 503. Nothing is sealed to read
    // locally — degrade to an empty trail. Cloud keeps the truthful failure so an
    // audit-DB outage surfaces.
    if (this.ctx.cfg.soloMode) {
      try {
        return await this.ctx.auditReader.byWorkspace(workspaceId, limit);
      } catch {
        return [];
      }
    }
    return this.ctx.auditReader.byWorkspace(workspaceId, limit);
  }
}
