/**
 * @module memory.routes
 *
 * HTTP routes for A2A agent memory operations.
 * Mounted at /api/a2a/memory — expects `authenticateRequest` upstream in server.ts.
 *
 * POST   /            store a new memory entry
 * POST   /search      semantic recall query
 * DELETE /:id         forget (delete) a memory entry
 * GET    /context     get recent context for session start injection
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { rememberEntry, recallEntries, forgetEntry, getRecentContext } from './memory-store.js';
import { logger } from '../logger.js';

interface AuthedRequest extends Request {
  userId?: string;
}

const router = Router();

function sendOk(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

function sendErr(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
}

// POST /api/a2a/memory — store a memory
router.post('/', async (req: AuthedRequest, res: Response) => {
  const userId = req.userId ?? 'anonymous';
  const { content, type = 'fact', tags = [], agentId = 'unknown' } = req.body as {
    content?: string;
    type?: string;
    tags?: string[];
    agentId?: string;
  };

  if (!content || typeof content !== 'string' || !content.trim()) {
    return sendErr(res, 400, 'content is required');
  }

  try {
    const entry = await rememberEntry({ content: content.trim(), type, tags, agentId, userId });
    sendOk(res, entry);
  } catch (err) {
    logger.warn({ err }, '[memory.routes] rememberEntry failed');
    sendErr(res, 500, err instanceof Error ? err.message : 'Failed to store memory');
  }
});

// POST /api/a2a/memory/search — recall memories by semantic query
router.post('/search', async (req: AuthedRequest, res: Response) => {
  const userId = req.userId ?? 'anonymous';
  const { query, limit = 10, type } = req.body as {
    query?: string;
    limit?: number;
    type?: string;
  };

  if (!query || typeof query !== 'string' || !query.trim()) {
    return sendErr(res, 400, 'query is required');
  }

  try {
    const entries = await recallEntries({ query: query.trim(), userId, limit, type });
    sendOk(res, entries);
  } catch (err) {
    logger.warn({ err }, '[memory.routes] recallEntries failed');
    sendErr(res, 500, err instanceof Error ? err.message : 'Recall failed');
  }
});

// GET /api/a2a/memory/context?query=...&limit=10 — recent context injection
router.get('/context', async (req: AuthedRequest, res: Response) => {
  const userId = req.userId ?? 'anonymous';
  const query = String(req.query.query ?? '');
  const limit = Number(req.query.limit ?? 10);

  try {
    const entries = await getRecentContext({ query: query || 'recent context', userId, limit });
    sendOk(res, entries);
  } catch (err) {
    logger.warn({ err }, '[memory.routes] getRecentContext failed');
    sendOk(res, []); // Non-fatal — return empty
  }
});

// DELETE /api/a2a/memory/:id — forget a memory entry
router.delete('/:id', async (req: AuthedRequest, res: Response) => {
  const userId = req.userId ?? 'anonymous';
  const { id } = req.params;

  if (!id) {
    return sendErr(res, 400, 'id is required');
  }

  try {
    const deleted = await forgetEntry({ id, userId });
    sendOk(res, { deleted });
  } catch (err) {
    logger.warn({ err }, '[memory.routes] forgetEntry failed');
    sendErr(res, 500, err instanceof Error ? err.message : 'Forget failed');
  }
});

export { router as memoryRouter };
