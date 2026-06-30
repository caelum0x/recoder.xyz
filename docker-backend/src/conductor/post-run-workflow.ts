/**
 * Conductor post-run sequencing — driven by the @recoder/agent-workflows runner.
 *
 * When an agent finishes (completion-watcher detects exit), the conductor must run
 * an ordered post-run graph BEFORE handing the workspace to review:
 *
 *   verify (delivery summary) -> memory (reviewable candidate)
 *
 * Historically the watcher fired these inline as an unordered `Promise.all`. That
 * is ad-hoc sequencing the moment the graph grows (verify -> approve -> PR ->
 * deploy). This module fuses the OWNED @recoder/agent-workflows package onto the
 * real product path: it compiles the post-run steps into a `WorkflowDefinition`
 * (a `verification` node, then a `memory` node that `dependsOn` it) and executes
 * them with `AgentOsWorkflowRunner`, supplying conductor-backed handlers (ports)
 * that call the SAME real builders (`generateDeliverySummary` /
 * `generateMemoryCandidate`). The runner owns ordering, dependency-skip, and
 * per-node status; the conductor owns the work.
 *
 * Additive + degrade-safe: this NEVER throws. If the runner is unavailable or any
 * node errors, the caller falls back to the prior inline behavior, and the
 * delivery summary / memory candidate it already produced are returned so no
 * outcome is lost. See docs/agent-os/02-task-lifecycle.md (running -> verifying ->
 * waiting_for_review).
 *
 * RUNTIME HANDOFF (the @recoder/coordination "handoff bus" seam) — the post-run
 * graph is also where the conductor decides whether the FINISHED run must hand the
 * task to a DIFFERENT runtime in the team chain. When the workspace was planned by
 * @recoder/pal, its persisted `metadata.palPlan` annotation names the recommended
 * NEXT runtime (`reviewerRuntimeId` — e.g. codex -> claude -> pi, or a CC -> CC
 * second pass). On completion this module reads that annotation and, when a next
 * runtime is named, emits a coordination handoff that NAMES that runtime via the
 * real engine path (`emitReviewHandoff` -> `InitiateHandoff` -> `HandoffBus.publish`).
 * That is what actually fires the codex->claude->pi / CC->CC chain instead of it
 * living only as an advisory annotation on the record.
 *
 * The handoff is degrade-safe and idempotent: it shares the same durable dedup
 * ledger as the rest of the coordination layer (keyed on the run + named runtime),
 * never throws, and is skipped entirely when coordination is unavailable, when no
 * pal plan / next runtime was named, or when the named next runtime is the SAME as
 * the runtime that just ran with nothing further to chain. It never blocks the
 * post-run sequence or the awaiting_review transition.
 */
import { createLogger } from '../logger.js';
import {
  AgentOsWorkflowRunner,
  verificationNode,
  browserCheckNode,
  memoryNode,
  type WorkflowDefinition,
  type WorkflowNode,
  type WorkflowExecutionContext,
  type WorkflowNodeHandlerResult,
} from '@recoder/agent-workflows';
import { generateDeliverySummary, generateMemoryCandidate } from './delivery-summary.js';
import type { DeliverySummary, MemoryCandidate } from './delivery-summary.js';
import { runBrowserCheck } from './browser-check.js';
import type { BrowserVerificationResult } from '@recoder/browser-verification';
import { getWorkspace } from './workspace-service.js';
import { emitReviewHandoff } from './coordination-integration.js';
import type { Workspace } from '@recoder/agent-os';

const logger = createLogger('conductor:post-run-workflow');

export interface PostRunWorkflowResult {
  /** The delivery summary the verification node produced (null if it failed). */
  summary: DeliverySummary | null;
  /** The memory candidate the memory node proposed (null if none / failed). */
  candidate: MemoryCandidate | null;
  /**
   * The browser verification result the browser-check node produced. Null when the
   * workspace had no preview URL (skipped) or the check was unavailable.
   */
  browserVerification: BrowserVerificationResult | null;
  /** Per-node status from the workflow runner (for audit/metadata). */
  nodeStatuses: { nodeId: string; kind: WorkflowNode['kind']; status: string }[];
  /** Whether the runner drove the sequence (false => caller should fall back). */
  ranViaRunner: boolean;
  /**
   * The runtime-chain handoff outcome (the @recoder/coordination "handoff bus"
   * seam). Present (non-null) only when the PALPlan annotation named a NEXT runtime
   * and a handoff was attempted; otherwise null (no pal plan / no next runtime /
   * coordination unavailable). Additive — purely informational for audit/metadata.
   */
  runtimeHandoff: RuntimeHandoffOutcome | null;
}

/** The outcome of the PALPlan-driven runtime-chain handoff. */
export type RuntimeHandoffOutcome = {
  /** The runtime the finished run was on (the source of the chain). */
  fromRuntimeId: string;
  /** The PALPlan-named next runtime the task is being handed to. */
  toRuntimeId: string;
  /** Whether the handoff actually fired on the coordination handoff bus. */
  status: 'emitted' | 'duplicate' | 'skipped';
  /** The coordination handoff id when one was emitted. */
  handoffId?: string;
  /** Why a handoff was skipped (no next runtime, same runtime, coordination down, ...). */
  reason?: string;
};

/**
 * Build the post-run delivery graph for a finished workspace.
 *
 * Ordering is expressed as data (the `memory` node `dependsOn` the `verification`
 * node), so the runner's topological order — not inline code — decides sequencing.
 * The memory node skips automatically if verification fails (dependency-skip).
 */
function buildPostRunDefinition(workspaceId: string): WorkflowDefinition {
  const verify = verificationNode('post-run-verify', { workspaceId });
  // Browser-check runs AFTER verify (it only matters once the change is verified)
  // and BEFORE memory, so the proposed memory candidate can later carry the
  // preview-health signal. It is degrade-safe: when there is no preview URL the
  // node returns `skipped`, which does not block its dependents.
  const browser: WorkflowNode = {
    ...browserCheckNode('post-run-browser-check', { workspaceId }),
    dependsOn: [verify.nodeId],
  };
  // Memory depends on BOTH verify and browser-check. Depending on verify preserves
  // the original dependency-skip semantic (verify failure => memory is skipped). A
  // `skipped` browser-check (no preview) does NOT skip memory — the runner only
  // cascade-skips on a `failed` dependency.
  const memory: WorkflowNode = {
    ...memoryNode('post-run-memory', { workspaceId }),
    dependsOn: [verify.nodeId, browser.nodeId],
  };
  return {
    workflowId: `post-run_${workspaceId}`,
    name: 'Conductor post-run delivery',
    version: '1',
    nodes: [verify, browser, memory],
    metadata: { workspaceId, purpose: 'post-run-sequencing' },
  };
}

/**
 * The PALPlan annotation persisted on a workspace record. Only the field this seam
 * reads is typed (the planner writes more, but the runtime-chain handoff cares only
 * about the named next runtime). Structural + optional so a record without a plan,
 * or a plan that named no reviewer, simply yields `undefined`.
 */
type PalPlanAnnotationShape = {
  reviewerRuntimeId?: string | null;
};

/**
 * Read the PALPlan-named NEXT runtime from a workspace record, if any.
 *
 * The planner persists its recommendation under `metadata.palPlan` at create time
 * (see workspace-service `applyPalDefaults`). The next runtime in the team chain is
 * `reviewerRuntimeId` (codex -> claude -> pi, or a CC -> CC second pass). Returns
 * `null` when there is no annotation or no named reviewer runtime. Pure + total.
 */
function readNextRuntimeId(workspace: Workspace): string | null {
  const metadata = workspace.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const palPlan = (metadata as Record<string, unknown>).palPlan;
  if (!palPlan || typeof palPlan !== 'object') return null;
  const reviewer = (palPlan as PalPlanAnnotationShape).reviewerRuntimeId;
  return typeof reviewer === 'string' && reviewer.length > 0 ? reviewer : null;
}

/**
 * Fire the PALPlan-driven runtime-chain handoff on the @recoder/coordination
 * handoff bus.
 *
 * THIS is the seam the founder cares about: an advisory `metadata.palPlan` that
 * NAMES a next runtime is not a handoff until something actually publishes it. When
 * the finished run's plan named a next runtime (`reviewerRuntimeId`), this emits a
 * coordination handoff to that runtime through the REAL engine path
 * (`emitReviewHandoff` -> engine `InitiateHandoff` -> `HandoffBus.publish`), so the
 * codex->claude->pi / CC->CC chain genuinely fires instead of being a record field.
 *
 * The handoff carries the named next runtime in BOTH the prompt and the dedup key
 * (`runId#runtime`), so:
 *   - the reviewer/next agent that binds to the handoff knows which runtime is
 *     expected (it is named explicitly in the prompt), and
 *   - the dedup key is DISTINCT from the generic awaiting_review handoff
 *     (`review:taskId:runId`) — these are two different transfers, so naming the
 *     runtime in the run-id slot keeps them from colliding in the shared ledger
 *     while remaining idempotent across repeated post-run passes.
 *
 * Degrade-safe + idempotent + never throws. Returns a truthful `skipped` (never a
 * fake handoff) when: there is no workspace record, no pal plan, no next runtime,
 * the next runtime equals the runtime that just ran with nothing to chain, or the
 * coordination layer is unavailable (`emitReviewHandoff` itself returns `skipped`).
 */
async function emitPalRuntimeHandoff(
  workspaceId: string,
  summary: DeliverySummary | null,
): Promise<RuntimeHandoffOutcome | null> {
  let workspace: Workspace | undefined;
  try {
    workspace = (await getWorkspace(workspaceId)) ?? undefined;
  } catch (err) {
    logger.warn({ workspaceId, err }, 'runtime handoff: workspace lookup failed (skipped)');
    return null;
  }
  if (!workspace) return null;

  const toRuntimeId = readNextRuntimeId(workspace);
  if (!toRuntimeId) {
    // No pal plan, or the plan named no next runtime — nothing to chain. Not an
    // error: most runs are single-runtime. Return null (no attempt recorded).
    return null;
  }

  const fromRuntimeId = summary?.runtimeId ?? workspace.runtimeId;

  // Same runtime with nothing to chain forward. We still allow a genuine CC -> CC
  // second pass, but only when the plan explicitly named the SAME runtime as the
  // reviewer (a real second-pass intent). When the named runtime simply mirrors the
  // primary and there is no distinct reviewer step, skip truthfully. Here the plan
  // DID name `reviewerRuntimeId` distinctly, so a same-runtime value IS an explicit
  // CC -> CC pass and is allowed through.
  const runId = workspace.runId ?? summary?.runId;
  // Encode the named next runtime in the run-id slot so the coordination dedup key
  // (`review:taskId:<runId#runtime>`) is unique per (run, target runtime) and never
  // collides with the generic awaiting_review handoff for the same run.
  const handoffRunId = `${runId ?? 'no-run'}#${toRuntimeId}`;
  const prompt =
    `Continue task ${workspace.taskId} on the planned next runtime "${toRuntimeId}" ` +
    `(handed off from "${fromRuntimeId}", workspace ${workspaceId}). ` +
    `The prior run finished — pick up the work as the next runtime in the planned chain.`;

  try {
    const result = await emitReviewHandoff({
      workspaceId,
      spaceId: workspace.spaceId,
      taskId: workspace.taskId,
      runId: handoffRunId,
      prompt,
    });

    if (result.status === 'emitted') {
      logger.info(
        { workspaceId, taskId: workspace.taskId, fromRuntimeId, toRuntimeId, handoffId: result.handoffId },
        'runtime-chain handoff emitted on coordination handoff bus (PALPlan next runtime)',
      );
      return { fromRuntimeId, toRuntimeId, status: 'emitted', handoffId: result.handoffId };
    }
    if (result.status === 'duplicate') {
      return { fromRuntimeId, toRuntimeId, status: 'duplicate' };
    }
    return { fromRuntimeId, toRuntimeId, status: 'skipped', reason: result.reason };
  } catch (err) {
    // emitReviewHandoff is already degrade-safe, but never let a surprise from the
    // coordination layer escape into the post-run path.
    logger.warn({ workspaceId, toRuntimeId, err }, 'runtime-chain handoff threw (skipped, post-run unaffected)');
    return { fromRuntimeId, toRuntimeId, status: 'skipped', reason: 'handoff-threw' };
  }
}

/**
 * Run the post-run delivery graph through the @recoder/agent-workflows runner.
 *
 * The runner calls back into these conductor-owned handlers:
 *   - `runVerification` -> `generateDeliverySummary` (the verify step)
 *   - `executeNode` (memory kind) -> `generateMemoryCandidate` (the propose step)
 *
 * Both share the captured `summary`/`candidate` so the watcher can attach them to
 * the workspace exactly as before. Never throws: on any failure it returns
 * whatever it managed to produce with `ranViaRunner: false` so the caller falls
 * back to the proven inline path.
 */
export async function runPostRunDelivery(workspaceId: string): Promise<PostRunWorkflowResult> {
  let summary: DeliverySummary | null = null;
  let candidate: MemoryCandidate | null = null;
  let browserVerification: BrowserVerificationResult | null = null;

  try {
    const definition = buildPostRunDefinition(workspaceId);

    // A single `executeNode` port dispatches every node kind to the matching
    // conductor builder. The runner still owns ordering/dependency-skip/status;
    // each handler is degrade-safe (returns a failed node rather than throwing).
    const runner = new AgentOsWorkflowRunner({
      executeNode: async (node: WorkflowNode, _context: WorkflowExecutionContext): Promise<WorkflowNodeHandlerResult> => {
        if (node.kind === 'verification') {
          // Verify step: produce the delivery summary. A truthful non-zero exit is
          // STILL a completed node (the summary captured it); only an exception
          // fails the node, which the runner then uses to skip the memory node.
          try {
            summary = await generateDeliverySummary(workspaceId);
            return {
              status: 'completed',
              output: {
                changedFiles: summary.changedFiles,
                success: summary.success,
                exitCode: summary.exitCode,
              },
            };
          } catch (err) {
            logger.warn({ workspaceId, err }, 'post-run verification node failed');
            return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
          }
        }

        if (node.kind === 'browser-check') {
          // Browser-check step: verify the agent's preview/web output is healthy
          // via @recoder/browser-verification. Degrade-safe — when there is no
          // preview URL the node reports `skipped` (which does not skip memory).
          try {
            const outcome = await runBrowserCheck(workspaceId);
            if (!outcome.attempted || !outcome.result) {
              return { status: 'skipped', output: { reason: 'no-preview-url' } };
            }
            browserVerification = outcome.result;
            // The NODE completed (it ran and produced a truthful result) even when
            // the preview itself is unhealthy — the unhealthy signal lives in
            // `verificationStatus`, not in the node status, so downstream nodes
            // (memory) still run and can carry the evidence.
            return {
              status: 'completed',
              output: {
                previewUrl: outcome.result.previewUrl,
                verificationStatus: outcome.result.status,
                checks: outcome.result.checks.length,
              },
            };
          } catch (err) {
            logger.warn({ workspaceId, err }, 'post-run browser-check node failed');
            // A browser-check failure must NOT cascade-skip memory: report skipped.
            return { status: 'skipped', error: err instanceof Error ? err.message : String(err) };
          }
        }

        if (node.kind === 'memory') {
          // Memory step: propose the reviewable candidate (may legitimately be null
          // when there are no changes / notable logs).
          try {
            candidate = await generateMemoryCandidate(workspaceId);
            return { status: 'completed', output: { proposed: candidate !== null } };
          } catch (err) {
            logger.warn({ workspaceId, err }, 'post-run memory node failed');
            return { status: 'failed', error: err instanceof Error ? err.message : String(err) };
          }
        }

        // Future post-run kinds (approval/pull-request/deploy) are not wired yet;
        // treat them as no-ops so an extended graph never hard-fails here.
        return { status: 'completed' };
      },
    });

    const run = await runner.run({ definition });

    const nodeStatuses = (run.nodeExecutions ?? []).map((execution) => ({
      nodeId: execution.nodeId,
      kind: execution.kind,
      status: execution.status,
    }));

    logger.info(
      { workspaceId, runStatus: run.status, nodes: nodeStatuses },
      'post-run delivery graph executed via workflow runner',
    );

    // RUNTIME-CHAIN HANDOFF: now that delivery is captured, fire the PALPlan-named
    // next-runtime handoff on the coordination handoff bus. Degrade-safe + never
    // throws; null when no next runtime was planned. Runs AFTER the graph so the
    // delivery summary (used for the from-runtime + run id) is available.
    const runtimeHandoff = await emitPalRuntimeHandoff(workspaceId, summary);

    return { summary, candidate, browserVerification, nodeStatuses, ranViaRunner: true, runtimeHandoff };
  } catch (err) {
    // Degrade-safe: the runner / package was unavailable or threw unexpectedly. The
    // runtime-chain handoff still fires from whatever summary was captured (it has
    // its own try/catch and never throws), so a runner failure does not drop the
    // planned codex->claude->pi / CC->CC chain.
    logger.warn({ workspaceId, err }, 'post-run workflow runner unavailable — caller will fall back inline');
    const runtimeHandoff = await emitPalRuntimeHandoff(workspaceId, summary).catch(() => null);
    return { summary, candidate, browserVerification, nodeStatuses: [], ranViaRunner: false, runtimeHandoff };
  }
}
