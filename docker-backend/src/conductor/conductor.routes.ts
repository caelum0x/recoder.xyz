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

  return router;
}
