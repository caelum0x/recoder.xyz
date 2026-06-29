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
}

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

    return { summary, candidate, browserVerification, nodeStatuses, ranViaRunner: true };
  } catch (err) {
    // Degrade-safe: the runner / package was unavailable or threw unexpectedly.
    logger.warn({ workspaceId, err }, 'post-run workflow runner unavailable — caller will fall back inline');
    return { summary, candidate, browserVerification, nodeStatuses: [], ranViaRunner: false };
  }
}
