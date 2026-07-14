/**
 * @module code-search.routes
 *
 * HTTP routes for semantic code search.
 * Mounted at /api/a2a/code-search
 *
 * POST /search        semantic search within a project
 * POST /index         manually trigger file indexing
 * DELETE /project/:id drop entire project index
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { searchCode, indexFile, dropProjectIndex } from './code-search.js';
import { logger } from '../logger.js';

interface AuthedRequest extends Request {
  userId?: string;
}

const router = Router();

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

function err(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
}

// POST /api/a2a/code-search/search
router.post('/search', async (req: AuthedRequest, res: Response) => {
  const { projectId, query, limit = 10 } = req.body as {
    projectId?: string;
    query?: string;
    limit?: number;
  };

  if (!projectId || !query) {
    return err(res, 400, 'projectId and query are required');
  }

  try {
    const results = await searchCode({ projectId, query, limit, userId: req.userId });
    ok(res, results);
  } catch (e) {
    logger.warn({ e }, '[code-search.routes] search failed');
    err(res, 500, e instanceof Error ? e.message : 'Search failed');
  }
});

// POST /api/a2a/code-search/index — index or re-index a file
router.post('/index', async (req: AuthedRequest, res: Response) => {
  const { projectId, filePath, content, debounce = true } = req.body as {
    projectId?: string;
    filePath?: string;
    content?: string;
    debounce?: boolean;
  };

  if (!projectId || !filePath || content == null) {
    return err(res, 400, 'projectId, filePath, and content are required');
  }

  try {
    await indexFile({ projectId, filePath, content, debounce, userId: req.userId });
    ok(res, { queued: debounce, filePath });
  } catch (e) {
    logger.warn({ e }, '[code-search.routes] index failed');
    err(res, 500, e instanceof Error ? e.message : 'Index failed');
  }
});

// DELETE /api/a2a/code-search/project/:projectId
router.delete('/project/:projectId', async (req: AuthedRequest, res: Response) => {
  const { projectId } = req.params;
  try {
    await dropProjectIndex(projectId);
    ok(res, { dropped: projectId });
  } catch (e) {
    logger.warn({ e }, '[code-search.routes] drop failed');
    err(res, 500, e instanceof Error ? e.message : 'Drop failed');
  }
});

export { router as codeSearchRouter };
