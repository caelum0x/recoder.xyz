/**
 * Recoder Conductor routes — manage parallel agent sessions (tmux + git worktrees).
 * The pivot product surface: start/observe/steer/stop many isolated agents.
 */
import { Router, type Request, type Response } from 'express';
import {
  conductorAvailability,
  startSession,
  listSessions,
  capturePane,
  sendKeys,
  killSession,
  paneExitCode,
} from './tmux-orchestrator.js';
import {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  listWorkspaceEvents,
  reconcile,
  ADMISSION_REJECTED_PREFIX,
} from './workspace-service.js';
import { runtimeAvailability } from './runtime-commands.js';
import { listSubstrates, getSubstrate } from './substrate.js';
import { workspaceDiff, archiveWorkspace } from './review.js';
import { createWorkspacePr, mergeWorkspace } from './review-publish.js';
import { DeliveryApprovalRequiredError } from './delivery-approval.js';
import {
  dmuxAvailability,
  launchDmuxConsole,
  dmuxAttachCommand,
  dmuxVisibleSessions,
} from './dmux-adapter.js';
import { executeWorkflow, type WorkflowPattern, type WorkflowStep } from './workflow-runner.js';
import { conductorHealth } from './conductor-health.js';
import { resourceSnapshot } from './resource-governor.js';
import { steerRuntime, runtimeStatus } from './runtime-driver.js';
import type { SubstrateHandle } from './substrate.js';
import { isTerminalWorkspaceState, type Workspace } from '@recoder/agent-os';
import { attachWorkspaceStream } from './live-events.js';
import { generateDeliverySummary, generateMemoryCandidate } from './delivery-summary.js';
import { metrics } from './conductor-metrics.js';
import { bulkCancel, bulkArchive, listByState } from './batch-ops.js';
import { cleanupStaleWorktrees } from './worktree-cleanup.js';

export function createConductorRouter(): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await conductorAvailability() });
  });

  router.get('/sessions', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await listSessions() });
  });

  router.post('/sessions', async (req: Request, res: Response) => {
    try {
      const { sessionId, repoPath, command, branch, baseRef } = req.body ?? {};
      if (!sessionId || !repoPath || !command) {
        res.status(400).json({ success: false, error: 'sessionId, repoPath, and command are required' });
        return;
      }
      const session = await startSession({ sessionId, repoPath, command, branch, baseRef });
      res.status(201).json({ success: true, data: session });
    } catch (err) {
      res.status(409).json({ success: false, error: err instanceof Error ? err.message : 'start failed' });
    }
  });

  router.get('/sessions/:sessionId/output', async (req: Request, res: Response) => {
    try {
      const lines = Number(req.query?.lines ?? '200') || 200;
      res.json({ success: true, data: { output: await capturePane(req.params.sessionId, lines) } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'capture failed';
      res.status(msg.includes('not found') ? 404 : 500).json({ success: false, error: msg });
    }
  });

  router.post('/sessions/:sessionId/keys', async (req: Request, res: Response) => {
    try {
      const keys = String(req.body?.keys ?? '');
      if (!keys) {
        res.status(400).json({ success: false, error: 'keys is required' });
        return;
      }
      await sendKeys(req.params.sessionId, keys);
      res.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'send failed';
      res.status(msg.includes('not found') ? 404 : 500).json({ success: false, error: msg });
    }
  });

  router.delete('/sessions/:sessionId', async (req: Request, res: Response) => {
    await killSession(req.params.sessionId, { removeWorktree: req.query?.keepWorktree !== 'true' });
    res.json({ success: true });
  });

  // True exit code of a completed session's pane (distinguishes success from crash).
  router.get('/sessions/:sessionId/exit-code', async (req: Request, res: Response) => {
    try {
      const code = await paneExitCode(`recoder-${req.params.sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
      res.json({ success: true, data: { exitCode: code } });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'exit-code check failed' });
    }
  });

  // Which installed agent CLIs Conductor can actually launch (truthful availability).
  router.get('/runtimes', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await runtimeAvailability() });
  });

  // Registered execution substrates + their availability (tmux_worktree, daytona…).
  router.get('/substrates', async (_req: Request, res: Response) => {
    const data = await Promise.all(
      listSubstrates().map(async (id) => ({ id, ...(await getSubstrate(id).available()) })),
    );
    res.json({ success: true, data });
  });

  // --- dmux operator console (OPTIONAL view layer over the tmux substrate) ---
  // dmux is never on the critical path; if absent, conductor works via tmux alone.

  router.get('/dmux', async (_req: Request, res: Response) => {
    const [availability, visibleSessions] = await Promise.all([
      dmuxAvailability(),
      dmuxVisibleSessions(),
    ]);
    res.json({ success: true, data: { ...availability, visibleSessions } });
  });

  router.post('/dmux/launch', async (req: Request, res: Response) => {
    try {
      const { repoPath, extraArgs } = req.body ?? {};
      if (!repoPath) {
        res.status(400).json({ success: false, error: 'repoPath is required' });
        return;
      }
      const availability = await dmuxAvailability();
      if (!availability.available) {
        res.status(409).json({ success: false, error: availability.reason ?? 'dmux unavailable' });
        return;
      }
      const result = launchDmuxConsole({ repoPath, extraArgs });
      res.status(201).json({
        success: true,
        data: { ...result, attachHint: `Run in your terminal: ${dmuxAttachCommand(repoPath)}` },
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'dmux launch failed' });
    }
  });

  // --- Workspaces: the persisted, restart-survivable unit of parallel work ---

  router.get('/workspaces', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await listWorkspaces() });
  });

  router.post('/workspaces', async (req: Request, res: Response) => {
    try {
      const { spaceId, projectId, taskId, repoPath, runtimeId, substrate, command, prompt, model, createdBy, branch, baseRef, env, metadata } =
        req.body ?? {};
      if (!spaceId || !projectId || !taskId || !repoPath || !runtimeId || !createdBy || (!command && !prompt)) {
        res.status(400).json({
          success: false,
          error: 'spaceId, projectId, taskId, repoPath, runtimeId, createdBy, and one of (command|prompt) are required',
        });
        return;
      }
      const workspace = await createWorkspace({
        spaceId,
        projectId,
        taskId,
        repoPath,
        runtimeId,
        substrate,
        command,
        prompt,
        model,
        createdBy,
        branch,
        baseRef,
        env,
        metadata,
      });
      // Resource-governor rejection maps to 429 (over budget, retry later);
      // any other failed launch (lock conflict, provisioning error) stays 409.
      if (workspace.state === 'failed') {
        const reason = typeof workspace.metadata?.error === 'string' ? workspace.metadata.error : '';
        const status = reason.startsWith(ADMISSION_REJECTED_PREFIX) ? 429 : 409;
        res.status(status).json({ success: false, error: reason || 'workspace launch failed', data: workspace });
        return;
      }
      res.status(201).json({ success: true, data: workspace });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'create failed' });
    }
  });

  router.get('/workspaces/:workspaceId', async (req: Request, res: Response) => {
    const workspace = await getWorkspace(req.params.workspaceId);
    if (!workspace) {
      res.status(404).json({ success: false, error: 'workspace not found' });
      return;
    }
    res.json({ success: true, data: workspace });
  });

  // Streamed RunEvents for the workspace's run (live terminal + lifecycle log).
  router.get('/workspaces/:workspaceId/events', async (req: Request, res: Response) => {
    res.json({ success: true, data: await listWorkspaceEvents(req.params.workspaceId) });
  });

  // Reviewable diff of the workspace's worktree against its base ref.
  router.get('/workspaces/:workspaceId/diff', async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await workspaceDiff(req.params.workspaceId) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'diff failed';
      res.status(msg.includes('not found') ? 404 : 500).json({ success: false, error: msg });
    }
  });

  // Open a PR for the workspace branch. Approval-gated: when no approval record
  // exists the workspace is moved to awaiting_approval and a 409 is returned (the
  // branch is not pushed and no PR is opened).
  router.post('/workspaces/:workspaceId/pr', async (req: Request, res: Response) => {
    try {
      const { title, body, base, draft, remote } = req.body ?? {};
      res.status(201).json({
        success: true,
        data: await createWorkspacePr(req.params.workspaceId, { title, body, base, draft, remote }),
      });
    } catch (err) {
      if (err instanceof DeliveryApprovalRequiredError) {
        res.status(409).json({
          success: false,
          error: err.message,
          data: {
            state: err.state, action: err.action, approvalId: err.approvalId, transitioned: err.transitioned,
            // Surface the @recoder/governance verdict so the cockpit can show the risk tier
            // + Merkle audit hash (truthful: nulls when governance is degraded/unavailable).
            governance: {
              tier: err.governanceTier ?? null,
              effect: err.governanceEffect ?? null,
              auditHash: err.governanceAuditHash ?? null,
              hardDeny: err.governanceHardDeny,
              degraded: err.governanceDegraded ?? false,
            },
          },
        });
        return;
      }
      const msg = err instanceof Error ? err.message : 'pr failed';
      res.status(msg.includes('not found') ? 404 : 400).json({ success: false, error: msg });
    }
  });

  // Merge the workspace PR. Approval-gated: a merge is a customer-visible delivery
  // and requires an approval record. Absent one, the workspace is moved to
  // awaiting_approval and a 409 is returned instead of silently merging.
  router.post('/workspaces/:workspaceId/merge', async (req: Request, res: Response) => {
    try {
      const { strategy, deleteBranch } = req.body ?? {};
      res.json({ success: true, data: await mergeWorkspace(req.params.workspaceId, { strategy, deleteBranch }) });
    } catch (err) {
      if (err instanceof DeliveryApprovalRequiredError) {
        res.status(409).json({
          success: false,
          error: err.message,
          data: {
            state: err.state, action: err.action, approvalId: err.approvalId, transitioned: err.transitioned,
            // Surface the @recoder/governance verdict so the cockpit can show the risk tier
            // + Merkle audit hash (truthful: nulls when governance is degraded/unavailable).
            governance: {
              tier: err.governanceTier ?? null,
              effect: err.governanceEffect ?? null,
              auditHash: err.governanceAuditHash ?? null,
              hardDeny: err.governanceHardDeny,
              degraded: err.governanceDegraded ?? false,
            },
          },
        });
        return;
      }
      const msg = err instanceof Error ? err.message : 'merge failed';
      res.status(msg.includes('not found') ? 404 : 400).json({ success: false, error: msg });
    }
  });

  // Archive a finished workspace: stop session, remove worktree, mark archived.
  router.post('/workspaces/:workspaceId/archive', async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await archiveWorkspace(req.params.workspaceId) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'archive failed';
      res.status(msg.includes('not found') ? 404 : 500).json({ success: false, error: msg });
    }
  });

  // Reconcile persisted workspaces against the real tmux + git substrate.
  router.post('/reconcile', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await reconcile() });
  });

  // --- Capability surfaces: multi-agent workflows, rich health, resources, ---
  // --- live workspace status, and steering. These drive the headline ---
  // --- "many parallel agents" product on top of the proven tmux substrate. ---

  // Unified production health: substrate + runtimes + resources + tails + dmux.
  router.get('/health/full', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await conductorHealth() });
  });

  // Prometheus-style metrics snapshot (counters, gauges, histograms).
  router.get('/metrics', (_req: Request, res: Response) => {
    res.json({ success: true, data: metrics.snapshot() });
  });

  // Current resource-governor utilization vs. limits (truthful capacity view).
  router.get('/resources', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await resourceSnapshot() });
  });

  // Launch a multi-agent workflow (direct | fan_out | pipeline | competitive).
  // Each step is isolated in its own worktree; admission is resource-governed.
  router.post('/workflows', async (req: Request, res: Response) => {
    try {
      const { spaceId, projectId, taskId, repoPath, createdBy, pattern, steps, baseRef, env, limits } =
        req.body ?? {};
      if (!spaceId || !projectId || !taskId || !repoPath || !createdBy || !pattern || !Array.isArray(steps)) {
        res.status(400).json({
          success: false,
          error: 'spaceId, projectId, taskId, repoPath, createdBy, pattern, and steps[] are required',
        });
        return;
      }
      const validPatterns: WorkflowPattern[] = ['direct', 'fan_out', 'pipeline', 'competitive'];
      if (!validPatterns.includes(pattern)) {
        res.status(400).json({ success: false, error: `pattern must be one of: ${validPatterns.join(', ')}` });
        return;
      }
      if (steps.length === 0) {
        res.status(400).json({ success: false, error: 'steps[] must contain at least one step' });
        return;
      }
      for (const step of steps as WorkflowStep[]) {
        if (!step?.runtimeId || !step?.prompt) {
          res.status(400).json({ success: false, error: 'each step requires runtimeId and prompt' });
          return;
        }
      }
      const result = await executeWorkflow({
        spaceId,
        projectId,
        taskId,
        repoPath,
        createdBy,
        pattern,
        steps,
        baseRef,
        env,
        limits,
      });
      // Resource rejection (over budget) is a 429, not a 5xx or generic 4xx.
      if (result.state === 'rejected') {
        res.status(429).json({ success: false, error: result.reason ?? 'resource limit reached', data: result });
        return;
      }
      res.status(result.state === 'failed' ? 502 : 201).json({ success: true, data: result });
    } catch (err) {
      res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'workflow failed' });
    }
  });

  // Live status of a running workspace's agent (alive + exit code + recent output),
  // resolved through the workspace's own substrate handle.
  router.get('/workspaces/:workspaceId/status', async (req: Request, res: Response) => {
    try {
      const workspace = await getWorkspace(req.params.workspaceId);
      if (!workspace) {
        res.status(404).json({ success: false, error: 'workspace not found' });
        return;
      }
      const handle = workspaceHandle(workspace);
      if (!handle) {
        res.json({
          success: true,
          data: { alive: false, exitCode: null, recentOutput: null, state: workspace.state, reason: 'no live substrate handle' },
        });
        return;
      }
      const status = await runtimeStatus(workspace.substrate, handle);
      res.json({ success: true, data: { ...status, state: workspace.state } });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'status failed' });
    }
  });

  // Steer a running workspace's agent: send keys/input (approval, interrupt,
  // instruction). Only interactive substrates (tmux) support steering.
  router.post('/workspaces/:workspaceId/steer', async (req: Request, res: Response) => {
    try {
      const keys = String(req.body?.keys ?? '');
      if (!keys) {
        res.status(400).json({ success: false, error: 'keys is required' });
        return;
      }
      const workspace = await getWorkspace(req.params.workspaceId);
      if (!workspace) {
        res.status(404).json({ success: false, error: 'workspace not found' });
        return;
      }
      if (isTerminalWorkspaceState(workspace.state)) {
        res.status(409).json({ success: false, error: `workspace is ${workspace.state} (cannot steer a terminal workspace)` });
        return;
      }
      const handle = workspaceHandle(workspace);
      if (!handle) {
        res.status(409).json({ success: false, error: 'workspace has no live substrate handle to steer' });
        return;
      }
      await steerRuntime(workspace.substrate, handle, keys);
      res.json({ success: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'steer failed';
      res.status(msg.includes('not supported') ? 400 : 500).json({ success: false, error: msg });
    }
  });

  // Delivery summary for a completed workspace (diff + logs + exit code).
  router.get('/workspaces/:workspaceId/delivery', async (req: Request, res: Response) => {
    try {
      res.json({ success: true, data: await generateDeliverySummary(req.params.workspaceId) });
    } catch (err) {
      res.status(404).json({ success: false, error: err instanceof Error ? err.message : 'delivery summary failed' });
    }
  });

  // Memory candidate proposed by a completed workspace (review-gated, not durable).
  router.get('/workspaces/:workspaceId/memory-candidate', async (req: Request, res: Response) => {
    try {
      const candidate = await generateMemoryCandidate(req.params.workspaceId);
      if (!candidate) {
        res.status(204).end();
        return;
      }
      res.json({ success: true, data: candidate });
    } catch (err) {
      res.status(404).json({ success: false, error: err instanceof Error ? err.message : 'memory candidate failed' });
    }
  });

  // Batch: cancel all non-terminal workspaces (filter by projectId/createdBy).
  router.post('/batch/cancel', async (req: Request, res: Response) => {
    try {
      const { projectId, createdBy } = req.body ?? {};
      res.json({ success: true, data: await bulkCancel({ projectId, createdBy }) });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'batch cancel failed' });
    }
  });

  // Batch: archive all terminal workspaces (frees disk).
  router.post('/batch/archive', async (req: Request, res: Response) => {
    try {
      const { projectId, states } = req.body ?? {};
      res.json({ success: true, data: await bulkArchive({ projectId, states }) });
    } catch (err) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'batch archive failed' });
    }
  });

  // Worktree disk cleanup: prune stale worktrees + kill orphaned sessions.
  router.post('/cleanup', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await cleanupStaleWorktrees() });
  });

  // WebSocket upgrade for live workspace events (operator console live terminal).
  // The express-ws middleware injects the `ws` property onto the router; if the
  // server doesn't have express-ws enabled, this route is simply not matched.
  (router as any).ws('/workspaces/:workspaceId/stream', (ws: any, req: { params: { workspaceId: string } }) => {
    const cleanup = attachWorkspaceStream(ws, req.params.workspaceId);
    ws.on('close', cleanup);
  });

  return router;
}

/**
 * Resolve a substrate handle from a persisted workspace record. The handle is
 * reconstructed from the record's deterministic identifiers (workspaceId →
 * substrate `ref`, plus persisted sessionName/worktreePath), so status/steer
 * work even after a backend restart cleared the orchestrator's in-memory map.
 * Returns `undefined` when the workspace was never provisioned (no session).
 */
function workspaceHandle(workspace: Workspace): SubstrateHandle | undefined {
  if (!workspace.sessionName && !workspace.worktreePath) return undefined;
  return {
    ref: workspace.workspaceId,
    sessionName: workspace.sessionName,
    worktreePath: workspace.worktreePath,
  };
}
