/**
 * @module search.routes
 *
 * HTTP routes for cross-platform Meilisearch queries.
 * Mounted at /api/a2a/search
 *
 * POST /          search across selected sources
 * POST /index     manually trigger content indexing (threads, pm, agency, files)
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  searchAll,
  indexThread,
  indexPmFeature,
  indexAgencyItem,
  indexFile,
  type SearchSource,
} from './search-proxy.js';
import { logger } from '../logger.js';

interface AuthedRequest extends Request {
  userId?: string;
  sessionId?: string;
}

const router = Router();

function ok(res: Response, data: unknown): void {
  res.json({ success: true, data });
}

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ success: false, error: message });
}

// POST /api/a2a/search
router.post('/', async (req: AuthedRequest, res: Response) => {
  const { q, sources, limit = 10 } = req.body as {
    q?: string;
    sources?: SearchSource[];
    limit?: number;
  };

  if (!q || typeof q !== 'string' || !q.trim()) {
    return fail(res, 400, 'q (query) is required');
  }

  try {
    const results = await searchAll({
      query: q.trim(),
      sources,
      limit: Math.min(Number(limit) || 10, 50),
      sessionId: req.sessionId,
    });
    ok(res, results);
  } catch (err) {
    logger.warn({ err }, '[search.routes] searchAll failed');
    fail(res, 500, err instanceof Error ? err.message : 'Search failed');
  }
});

// POST /api/a2a/search/index — manual index push
router.post('/index', async (req: AuthedRequest, res: Response) => {
  const { type, document } = req.body as {
    type?: string;
    document?: Record<string, unknown>;
  };

  if (!type || !document) {
    return fail(res, 400, 'type and document are required');
  }

  try {
    switch (type) {
      case 'thread':
        await indexThread(document as Parameters<typeof indexThread>[0]);
        break;
      case 'pm_feature':
        await indexPmFeature(document as Parameters<typeof indexPmFeature>[0]);
        break;
      case 'agency_item':
        await indexAgencyItem(document as Parameters<typeof indexAgencyItem>[0]);
        break;
      case 'file':
        await indexFile(document as Parameters<typeof indexFile>[0]);
        break;
      default:
        return fail(res, 400, `Unknown index type: ${type}. Use thread | pm_feature | agency_item | file`);
    }
    ok(res, { indexed: type });
  } catch (err) {
    logger.warn({ err, type }, '[search.routes] index failed');
    fail(res, 500, err instanceof Error ? err.message : 'Index failed');
  }
});

export { router as searchRouter };
