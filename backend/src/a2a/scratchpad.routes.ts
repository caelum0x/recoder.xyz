/**
 * @module scratchpad.routes
 *
 * HTTP routes for the A2A session-scoped scratchpad.
 * Mounted at /api/a2a/scratchpad
 *
 * POST /write         Write a key/value to a session scratchpad
 * POST /read          Read a key from a session scratchpad
 * GET  /list          List all keys in a session scratchpad
 * DELETE /key         Delete a key from a session scratchpad
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  scratchpadSet,
  scratchpadGet,
  scratchpadList,
  scratchpadDelete,
} from './scratchpad.js';
import { logger } from '../logger.js';

const router = Router();

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
}

// POST /api/a2a/scratchpad/write
router.post('/write', (req: Request, res: Response) => {
  const { sessionId, agentId = 'unknown', key, value } = req.body as {
    sessionId?: string;
    agentId?: string;
    key?: string;
    value?: unknown;
  };

  if (!sessionId || !key) return fail(res, 400, 'sessionId and key are required');

  try {
    const entry = scratchpadSet({ sessionId, agentId, key, value });
    ok(res, entry);
  } catch (err) {
    logger.warn({ err }, '[scratchpad.routes] write failed');
    fail(res, 500, err instanceof Error ? err.message : 'Write failed');
  }
});

// POST /api/a2a/scratchpad/read
router.post('/read', (req: Request, res: Response) => {
  const { sessionId, key } = req.body as { sessionId?: string; key?: string };

  if (!sessionId || !key) return fail(res, 400, 'sessionId and key are required');

  const entry = scratchpadGet({ sessionId, key });
  if (!entry) return ok(res, null);
  ok(res, entry);
});

// GET /api/a2a/scratchpad/list?sessionId=xxx
router.get('/list', (req: Request, res: Response) => {
  const sessionId = String(req.query.sessionId ?? '');
  if (!sessionId) return fail(res, 400, 'sessionId is required');

  const entries = scratchpadList({ sessionId });
  ok(res, entries);
});

// DELETE /api/a2a/scratchpad/key
router.delete('/key', (req: Request, res: Response) => {
  const { sessionId, key } = req.body as { sessionId?: string; key?: string };
  if (!sessionId || !key) return fail(res, 400, 'sessionId and key are required');

  const deleted = scratchpadDelete({ sessionId, key });
  ok(res, { deleted });
});

export { router as scratchpadRouter };
