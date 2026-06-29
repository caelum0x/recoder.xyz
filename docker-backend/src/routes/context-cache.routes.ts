/**
 * Context Cache API Routes (S8-3)
 *
 * Server-side prompt/context caching for reduced latency and costs. Covers cache
 * stats, create/get/delete, file-hash listing, diff computation, diff apply,
 * per-project latest lookup, and standalone hash utility endpoints.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error handling are unchanged. The
 * `authenticateRequest` / `verifyProjectOwnership` middleware closures and the
 * `logger` instance that previously lived in server.ts are injected via the
 * factory. The `contextCache` store and hash utilities are imported directly from
 * their existing module.
 */

import express, { Router } from 'express';
import { createLogger } from '../logger.js';
import {
  contextCache,
  computeFileHash,
  computeFileHashes,
  type ContextDiff,
} from '../context-cache.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type Middleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface ContextCacheRouterDeps {
  authenticateRequest: Middleware;
  verifyProjectOwnership: Middleware;
  logger: ReturnType<typeof createLogger>;
}

export function createContextCacheRouter(deps: ContextCacheRouterDeps): Router {
  const { authenticateRequest, verifyProjectOwnership, logger } = deps;
  const router = Router();

  // ==================== CONTEXT CACHE ENDPOINTS (S8-3) ====================
  // Server-side prompt/context caching for reduced latency and costs

  // Get context cache stats
  router.get('/api/context/cache/stats', (_, res) => {
    const stats = contextCache.getStats();
    res.json(stats);
  });

  // Create a new context cache for a project
  router.post('/api/context/cache', authenticateRequest, async (req: AuthenticatedRequest, res) => {
    try {
      const { projectId, files, systemPrompt } = req.body;

      if (!projectId || !files) {
        return res.status(400).json({ error: 'projectId and files are required' });
      }

      // Convert files object to Map
      const fileMap = new Map<string, string>(Object.entries(files));

      const cacheId = contextCache.createCache(projectId, fileMap, systemPrompt);

      res.json({
        success: true,
        cacheId,
        fileCount: fileMap.size,
        message: 'Context cached successfully',
      });
    } catch (error: any) {
      logger.error({ err: error }, 'ContextCache: error creating cache');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get cached context by ID
  router.get('/api/context/cache/:cacheId', authenticateRequest, async (req: AuthenticatedRequest, res) => {
    try {
      const { cacheId } = req.params;
      const cache = contextCache.getCache(cacheId);

      if (!cache) {
        return res.status(404).json({ error: 'Cache not found or expired' });
      }

      // Return file list with hashes (not full content to save bandwidth)
      const files: Record<string, { hash: string; size: number }> = {};
      for (const [path, file] of cache.files) {
        files[path] = { hash: file.hash, size: file.size };
      }

      res.json({
        cacheId: cache.id,
        projectId: cache.projectId,
        files,
        fileCount: cache.files.size,
        totalSize: cache.totalSize,
        createdAt: cache.createdAt,
        lastAccessed: cache.lastAccessed,
        accessCount: cache.accessCount,
        hasSystemPrompt: !!cache.systemPromptHash,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'ContextCache: error getting cache');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get file hashes for a cached context (for client-side comparison)
  router.get('/api/context/cache/:cacheId/hashes', authenticateRequest, async (req: AuthenticatedRequest, res) => {
    try {
      const { cacheId } = req.params;
      const hashes = contextCache.getFileHashes(cacheId);

      if (!hashes) {
        return res.status(404).json({ error: 'Cache not found or expired' });
      }

      res.json({
        cacheId,
        hashes: Object.fromEntries(hashes),
      });
    } catch (error: any) {
      logger.error({ err: error }, 'ContextCache: error getting hashes');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Compute diff between client files and cached context
  router.post('/api/context/cache/:cacheId/diff', authenticateRequest, async (req: AuthenticatedRequest, res) => {
    try {
      const { cacheId } = req.params;
      const { files } = req.body;

      if (!files) {
        return res.status(400).json({ error: 'files are required' });
      }

      const fileMap = new Map<string, string>(Object.entries(files));
      const diff = contextCache.computeDiff(cacheId, fileMap);

      if (!diff) {
        return res.status(404).json({ error: 'Cache not found or expired' });
      }

      res.json({
        cacheId,
        changedFiles: Object.fromEntries(diff.changedFiles),
        deletedFiles: diff.deletedFiles,
        unchangedCount: diff.unchangedHashes.size,
        changedCount: diff.changedFiles.size,
        deletedCount: diff.deletedFiles.length,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'ContextCache: error computing diff');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Apply diff and get reconstructed context
  router.post('/api/context/cache/:cacheId/apply', authenticateRequest, async (req: AuthenticatedRequest, res) => {
    try {
      const { cacheId } = req.params;
      const { changedFiles, deletedFiles } = req.body;

      const diff: Partial<ContextDiff> = {
        changedFiles: changedFiles ? new Map(Object.entries(changedFiles)) : undefined,
        deletedFiles: deletedFiles || [],
      };

      const result = contextCache.applyDiff(cacheId, diff);

      if (!result) {
        return res.status(404).json({ error: 'Cache not found or expired' });
      }

      res.json({
        cacheId: result.cacheId,
        filesUpdated: result.filesUpdated,
        filesFromCache: result.filesFromCache,
        bytesSaved: result.bytesSaved,
        files: Object.fromEntries(result.reconstructedContext),
      });
    } catch (error: any) {
      logger.error({ err: error }, 'ContextCache: error applying diff');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete cache for a specific project
  router.delete('/api/context/cache/project/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const { projectId } = req.params;
      const deleted = contextCache.deleteProjectCaches(projectId);

      res.json({
        success: true,
        deletedCount: deleted,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'ContextCache: error deleting project caches');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete a specific cache by ID
  router.delete('/api/context/cache/:cacheId', authenticateRequest, async (req: AuthenticatedRequest, res) => {
    try {
      const { cacheId } = req.params;
      const deleted = contextCache.deleteCache(cacheId);

      res.json({
        success: deleted,
        message: deleted ? 'Cache deleted' : 'Cache not found',
      });
    } catch (error: any) {
      logger.error({ err: error }, 'ContextCache: error deleting cache');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get latest cache for a project
  router.get('/api/context/cache/project/:projectId/latest', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const { projectId } = req.params;
      const cacheId = contextCache.getLatestCacheForProject(projectId);

      if (!cacheId) {
        return res.status(404).json({ error: 'No cache found for project' });
      }

      const cache = contextCache.getCache(cacheId);
      if (!cache) {
        return res.status(404).json({ error: 'Cache expired' });
      }

      // Return file hashes for client comparison
      const hashes: Record<string, string> = {};
      for (const [path, file] of cache.files) {
        hashes[path] = file.hash;
      }

      res.json({
        cacheId,
        projectId,
        hashes,
        fileCount: cache.files.size,
        totalSize: cache.totalSize,
        lastAccessed: cache.lastAccessed,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'ContextCache: error getting latest cache');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Compute file hash (utility endpoint for client)
  router.post('/api/context/hash', authenticateRequest, (req: AuthenticatedRequest, res) => {
    try {
      const { content } = req.body;

      if (typeof content !== 'string') {
        return res.status(400).json({ error: 'content must be a string' });
      }

      const hash = computeFileHash(content);
      res.json({ hash });
    } catch (error: any) {
      logger.error({ err: error }, 'ContextCache: error computing hash');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Compute hashes for multiple files
  router.post('/api/context/hashes', authenticateRequest, (req: AuthenticatedRequest, res) => {
    try {
      const { files } = req.body;

      if (!files || typeof files !== 'object') {
        return res.status(400).json({ error: 'files must be an object' });
      }

      const fileMap = new Map<string, string>(Object.entries(files));
      const hashes = computeFileHashes(fileMap);

      res.json({
        hashes: Object.fromEntries(hashes),
      });
    } catch (error: any) {
      logger.error({ err: error }, 'ContextCache: error computing hashes');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ==================== END CONTEXT CACHE ENDPOINTS ====================

  return router;
}
