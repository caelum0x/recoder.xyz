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
} from './tmux-orchestrator.js';
import {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  listWorkspaceEvents,
  reconcile,
} from './workspace-service.js';
import { runtimeAvailability } from './runtime-commands.js';
import { workspaceDiff, archiveWorkspace } from './review.js';
import { createWorkspacePr, mergeWorkspace } from './review-publish.js';

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

  // Which installed agent CLIs Conductor can actually launch (truthful availability).
  router.get('/runtimes', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await runtimeAvailability() });
  });

  // --- Workspaces: the persisted, restart-survivable unit of parallel work ---

  router.get('/workspaces', async (_req: Request, res: Response) => {
    res.json({ success: true, data: await listWorkspaces() });
  });

  router.post('/workspaces', async (req: Request, res: Response) => {
    try {
      const { spaceId, projectId, taskId, repoPath, runtimeId, command, prompt, model, createdBy, branch, baseRef, env, metadata } =
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
        command,
        prompt,
        model,
        createdBy,
        branch,
        baseRef,
        env,
        metadata,
      });
      res.status(workspace.state === 'failed' ? 409 : 201).json({ success: true, data: workspace });
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

  // Open a PR for the workspace branch (outward-facing; caller enforces approval).
  router.post('/workspaces/:workspaceId/pr', async (req: Request, res: Response) => {
    try {
      const { title, body, base, draft, remote } = req.body ?? {};
      res.status(201).json({
        success: true,
        data: await createWorkspacePr(req.params.workspaceId, { title, body, base, draft, remote }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'pr failed';
      res.status(msg.includes('not found') ? 404 : 400).json({ success: false, error: msg });
    }
  });

  // Merge the workspace PR (outward-facing; caller enforces approval/policy).
  router.post('/workspaces/:workspaceId/merge', async (req: Request, res: Response) => {
    try {
      const { strategy, deleteBranch } = req.body ?? {};
      res.json({ success: true, data: await mergeWorkspace(req.params.workspaceId, { strategy, deleteBranch }) });
    } catch (err) {
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

  return router;
}
