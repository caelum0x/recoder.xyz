/**
 * Auto-completion watcher — polls running workspaces, detects agent completion
 * (via exit code), and auto-generates delivery summaries + memory candidates.
 *
 * Per docs/agent-os/02-task-lifecycle.md: the lifecycle is
 * running → verifying → waiting_for_review. This watcher bridges the gap: when
 * the run-tailer detects the agent finished, this module transitions the
 * workspace from `running` to `awaiting_review` and attaches the delivery
 * summary + memory candidate to its metadata.
 *
 * It is the autonomous "landing the plane" mechanism — no operator needed
 * to notice a workspace finished.
 */
import { createLogger } from '../logger.js';
import { agentOsContainer } from '../agent-os/service-container';
import { getWorkspace, advanceWorkspace, listWorkspaces } from './workspace-service.js';
import { getSubstrate } from './substrate.js';
import { generateDeliverySummary, generateMemoryCandidate } from './delivery-summary.js';
import { runPostRunDelivery } from './post-run-workflow.js';
import { metrics } from './conductor-metrics.js';
import { transitionWorkspace, type Workspace } from '@recoder/agent-os';

const logger = createLogger('conductor:watcher');

const POLL_INTERVAL_MS = Number(process.env.CONDUCTOR_WATCHER_INTERVAL_MS) || 10_000;

let timer: ReturnType<typeof setInterval> | undefined;

/**
 * Workspaces whose completion is currently being processed. A completion check
 * has an async gap (delivery-summary + memory-candidate generation) during which
 * the workspace is still `state === 'running'`, so the next poll tick would
 * otherwise re-select it and fire a SECOND `awaiting_review` transition before
 * the first persists. This in-flight guard makes `checkWorkspaceCompletion`
 * run at most once per workspace at a time. (recoder-38n3)
 */
const inFlight = new Set<string>();

/**
 * Start the auto-completion watcher. Polls running workspaces at a fixed interval,
 * detects agent completion via substrate exitCode, and auto-transitions the
 * workspace to awaiting_review with delivery summary + memory candidate.
 */
export function startCompletionWatcher(): void {
  if (timer) return;
  timer = setInterval(() => void pollRunningWorkspaces().catch(noop), POLL_INTERVAL_MS);
  timer.unref();
  logger.info({ intervalMs: POLL_INTERVAL_MS }, 'auto-completion watcher started');
}

export function stopCompletionWatcher(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = undefined;
  logger.info('auto-completion watcher stopped');
}

async function noop(): Promise<void> {}

async function pollRunningWorkspaces(): Promise<void> {
  const workspaces = await listWorkspaces();
  const running = workspaces.filter((w) => w.state === 'running');
  if (running.length === 0) return;

  logger.debug({ running: running.length }, 'watcher polling running workspaces');

  await Promise.allSettled(running.map((ws) => checkWorkspaceCompletion(ws)));
}

async function checkWorkspaceCompletion(workspace: Workspace): Promise<void> {
  if (!workspace.sessionName) return;

  // Concurrency guard: never let two overlapping poll ticks process the same
  // workspace — the completion path is not atomic (it persists only after the
  // async delivery-summary gap), so a second entry would double-fire the
  // awaiting_review transition. (recoder-38n3)
  if (inFlight.has(workspace.workspaceId)) return;
  inFlight.add(workspace.workspaceId);
  try {
    await runCompletionCheck(workspace);
  } finally {
    inFlight.delete(workspace.workspaceId);
  }
}

async function runCompletionCheck(workspace: Workspace): Promise<void> {
  const substrate = getSubstrate(workspace.substrate);
  const handle = {
    ref: workspace.workspaceId,
    sessionName: workspace.sessionName,
    worktreePath: workspace.worktreePath,
  };

  let alive: boolean;
  try {
    alive = await substrate.alive(handle);
  } catch {
    return;
  }
  if (alive) return;

  // Agent is no longer alive — it finished or crashed.
  let exitCode: number | null | undefined = null;
  if (substrate.exitCode) {
    try {
      exitCode = await substrate.exitCode(handle);
    } catch {
      exitCode = null;
    }
  }

  // Terminal-state guard: re-read the canonical record now that the agent is
  // confirmed dead. If a prior tick already advanced it out of `running`, do
  // nothing — the transition (and its artifacts) already happened exactly once.
  const fresh = await getWorkspace(workspace.workspaceId);
  if (!fresh || fresh.state !== 'running') return;

  metrics.counter('conductor_agent_completions', {
    result: exitCode === 0 ? 'success' : 'failure',
  });

  logger.info(
    { workspaceId: workspace.workspaceId, exitCode, state: workspace.state },
    'agent completed — auto-transitioning to awaiting_review',
  );

  try {
    // Post-run sequencing is driven by the @recoder/agent-workflows runner: it
    // compiles verify -> memory into a node graph and executes it in dependency
    // order (the package owns ordering; the conductor owns the work). Degrade-safe:
    // if the runner is unavailable or did not drive the graph, fall back to the
    // proven inline path so a completion is never lost.
    let summary: Awaited<ReturnType<typeof generateDeliverySummary>> | null = null;
    let candidate: Awaited<ReturnType<typeof generateMemoryCandidate>> | null = null;
    let postRunNodeStatuses: { nodeId: string; kind: string; status: string }[] = [];
    let browserVerification: Awaited<ReturnType<typeof runPostRunDelivery>>['browserVerification'] = null;

    const workflowResult = await runPostRunDelivery(workspace.workspaceId);
    if (workflowResult.ranViaRunner) {
      summary = workflowResult.summary;
      candidate = workflowResult.candidate;
      postRunNodeStatuses = workflowResult.nodeStatuses;
      browserVerification = workflowResult.browserVerification;
    } else {
      // Fallback: prior inline behavior (runner unavailable). Keep both best-effort.
      [summary, candidate] = await Promise.all([
        generateDeliverySummary(workspace.workspaceId).catch((err) => {
          logger.warn({ workspaceId: workspace.workspaceId, err }, 'delivery summary generation failed');
          return null;
        }),
        generateMemoryCandidate(workspace.workspaceId).catch((err) => {
          logger.warn({ workspaceId: workspace.workspaceId, err }, 'memory candidate generation failed');
          return null;
        }),
      ]);
    }

    // Transition to awaiting_review with the delivery artifacts in metadata.
    const metadata: Record<string, unknown> = {
      completedAt: new Date().toISOString(),
      exitCode,
      delivery: summary
        ? {
            changedFiles: summary.changedFiles,
            success: summary.success,
            diffStat: summary.diffStat,
          }
        : undefined,
      memoryCandidate: candidate ? { candidateId: candidate.candidateId, proposedAt: candidate.proposedAt } : undefined,
      // Browser verification of the agent's preview/web output (only present when
      // the workspace had a preview URL — skipped otherwise). Surfaces the
      // preview-health signal on the review handoff per the Agent OS frontend rule.
      browserVerification: browserVerification
        ? {
            previewUrl: browserVerification.previewUrl,
            status: browserVerification.status,
            checkedAt: browserVerification.checkedAt,
            checks: browserVerification.checks.length,
          }
        : undefined,
      // Audit trail: which post-run graph nodes ran and their status (empty on the
      // inline fallback path). Additive — does not change the review handoff.
      postRunWorkflow: postRunNodeStatuses.length > 0 ? { nodes: postRunNodeStatuses } : undefined,
    };

    await advanceWorkspace(workspace.workspaceId, 'awaiting_review', undefined, metadata);
    logger.info(
      { workspaceId: workspace.workspaceId, changedFiles: summary?.changedFiles ?? 0 },
      'workspace auto-transitioned to awaiting_review with delivery artifacts',
    );
  } catch (err) {
    logger.error({ workspaceId: workspace.workspaceId, err }, 'auto-completion transition failed');
  }
}
