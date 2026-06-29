/**
 * Snapshot API Routes (Git-based project state / version time-travel)
 *
 * Create/list/restore project snapshots, diff snapshots, read file content at a
 * snapshot, manage auto-save, compress, prune, and report stats. Snapshots also
 * capture/restore a linked Neon DB timestamp on a best-effort basis.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. Closures
 * that previously lived in server.ts (container lifecycle helper, audit log,
 * sanitizers, logger) and module collaborators (snapshotManager, neonClient,
 * integrationStore) are injected via the factory.
 */

import express, { Router } from 'express';
import { snapshotManager } from '../snapshot-manager.js';
import * as neonClient from '../integrations/neon-client.js';
import * as integrationStore from '../integrations/integration-store.js';
import type { ContainerEntry } from '../daytona-file-ops.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type Middleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface SnapshotRouterDeps {
  authenticateRequest: Middleware;
  verifyProjectOwnership: Middleware;
  sanitizeProjectId: (projectId: string) => string;
  sanitizePath: (path: string) => string;
  getOrRecoverContainer: (projectId: string) => Promise<ContainerEntry | undefined>;
  auditLog: (event: {
    userId?: string;
    action: string;
    projectId?: string;
    details?: Record<string, unknown>;
    ip?: string;
  }) => void;
  logger: {
    info: (obj: unknown, msg: string) => void;
    warn: (obj: unknown, msg: string) => void;
    error: (obj: unknown, msg: string) => void;
  };
}

export function createSnapshotRouter(deps: SnapshotRouterDeps): Router {
  const {
    authenticateRequest,
    verifyProjectOwnership,
    sanitizeProjectId,
    sanitizePath,
    getOrRecoverContainer,
    auditLog,
    logger,
  } = deps;
  const router = Router();

  // Create a snapshot (save current state)
  router.post('/api/snapshot/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { message = 'Manual snapshot', author = 'user' } = req.body;

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      auditLog({
        userId: req.userId,
        action: 'SNAPSHOT_CREATE',
        projectId,
        details: { message },
        ip: req.ip,
      });

      // Check if project has Neon linked — capture DB timestamp
      let neonDbTimestamp: string | undefined;
      try {
        const links = integrationStore.getProjectLinks(projectId);
        if (links.neon?.projectId && req.userId) {
          const creds = integrationStore.getUserCredentials(req.userId);
          if (creds.neon?.apiKey) {
            neonDbTimestamp = new Date().toISOString();
            logger.info({ neonDbTimestamp, projectId }, 'Snapshot: capturing Neon DB timestamp');
          }
        }
      } catch (err: any) {
        logger.warn({ err }, 'Snapshot: failed to capture DB timestamp');
      }

      entry.lastActive = Date.now();
      const snapshot = await snapshotManager.createSnapshot(entry.id, projectId, message, author, { neonDbTimestamp });

      res.json(snapshot);
    } catch (err: any) {
      logger.error({ err }, 'snapshot create error');
      res.status(500).json({ error: err.message });
    }
  });

  // List all snapshots
  router.get('/api/snapshots/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      entry.lastActive = Date.now();
      const snapshots = await snapshotManager.listSnapshots(entry.id, limit);

      res.json({ snapshots });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get current snapshot (HEAD)
  router.get('/api/snapshot/:projectId/current', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      const snapshot = await snapshotManager.getCurrentSnapshot(entry.id);

      res.json({ snapshot });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Restore to a specific snapshot
  router.post('/api/snapshot/:projectId/restore', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { snapshotId } = req.body;

      if (!snapshotId) {
        return res.status(400).json({ error: 'snapshotId required' });
      }

      // Sanitize snapshot ID
      const safeSnapshotId = snapshotId.replace(/[^a-zA-Z0-9_-]/g, '');

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      auditLog({
        userId: req.userId,
        action: 'SNAPSHOT_RESTORE',
        projectId,
        details: { snapshotId: safeSnapshotId },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      // Restore Git files
      await snapshotManager.restoreSnapshot(entry.id, projectId, safeSnapshotId);

      // Check if snapshot has a Neon DB timestamp and restore DB state
      let dbRestored = false;
      try {
        const neonDbTimestamp = await snapshotManager.getSnapshotDbTimestamp(entry.id, safeSnapshotId);
        if (neonDbTimestamp && req.userId) {
          const links = integrationStore.getProjectLinks(projectId);
          const creds = integrationStore.getUserCredentials(req.userId);
          if (links.neon?.projectId && links.neon?.developmentBranchId && creds.neon?.apiKey) {
            logger.info({ neonDbTimestamp, projectId }, 'Snapshot: restoring Neon DB');
            await neonClient.restoreBranch(
              creds.neon.apiKey,
              links.neon.projectId,
              links.neon.developmentBranchId,
              neonDbTimestamp,
            );
            dbRestored = true;
            logger.info({ projectId }, 'Snapshot: Neon DB restored successfully');
          }
        }
      } catch (dbErr: any) {
        logger.warn({ err: dbErr }, 'Snapshot: DB restore failed (files still restored)');
      }

      res.json({ success: true, restoredTo: safeSnapshotId, dbRestored });
    } catch (err: any) {
      logger.error({ err }, 'snapshot restore error');
      res.status(500).json({ error: err.message });
    }
  });

  // Get diff between snapshots
  router.get('/api/snapshot/:projectId/diff', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { from, to = 'HEAD' } = req.query;

      if (!from) {
        return res.status(400).json({ error: 'from snapshot required' });
      }

      // Sanitize snapshot IDs
      const safeFrom = (from as string).replace(/[^a-zA-Z0-9_-]/g, '');
      const safeTo = (to as string).replace(/[^a-zA-Z0-9_-]/g, '');

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      const diff = await snapshotManager.getDiff(entry.id, safeFrom, safeTo);

      res.json(diff);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get file diff between snapshots
  router.get('/api/snapshot/:projectId/file-diff', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { path, from, to = 'HEAD' } = req.query;

      if (!path || !from) {
        return res.status(400).json({ error: 'path and from snapshot required' });
      }

      const safePath = sanitizePath(path as string);
      const safeFrom = (from as string).replace(/[^a-zA-Z0-9_-]/g, '');
      const safeTo = (to as string).replace(/[^a-zA-Z0-9_-]/g, '');

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      const diff = await snapshotManager.getFileDiff(
        entry.id,
        safePath,
        safeFrom,
        safeTo
      );

      res.json({ diff });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get file content at a specific snapshot
  router.get('/api/snapshot/:projectId/file', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { path, snapshotId } = req.query;

      if (!path || !snapshotId) {
        return res.status(400).json({ error: 'path and snapshotId required' });
      }

      const safePath = sanitizePath(path as string);
      const safeSnapshotId = (snapshotId as string).replace(/[^a-zA-Z0-9_-]/g, '');

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      const content = await snapshotManager.getFileAtSnapshot(
        entry.id,
        safePath,
        safeSnapshotId
      );

      if (content === null) {
        return res.status(404).json({ error: 'File not found at snapshot' });
      }

      res.json({ content });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Check for unsaved changes
  router.get('/api/snapshot/:projectId/status', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      const hasChanges = await snapshotManager.hasUnsavedChanges(entry.id);
      const current = await snapshotManager.getCurrentSnapshot(entry.id);

      res.json({ hasChanges, current });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Enable/disable auto-save
  router.post('/api/snapshot/:projectId/auto-save', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { enabled, intervalMs = 5 * 60 * 1000 } = req.body;

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      auditLog({
        userId: req.userId,
        action: 'AUTO_SAVE_CONFIG',
        projectId,
        details: { enabled, intervalMs },
        ip: req.ip,
      });

      if (enabled) {
        snapshotManager.startAutoSave(entry.id, projectId, intervalMs);
      } else {
        snapshotManager.stopAutoSave(projectId);
      }

      res.json({ success: true, autoSaveEnabled: enabled });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Compress snapshots (git gc)
  router.post('/api/snapshot/:projectId/compress', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      const result = await snapshotManager.compress(entry.id);
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Prune old snapshots
  router.post('/api/snapshot/:projectId/prune', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { keepCount = 50 } = req.body;
      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      auditLog({
        userId: req.userId,
        action: 'SNAPSHOT_PRUNE',
        projectId,
        details: { keepCount },
        ip: req.ip,
      });

      const pruned = await snapshotManager.pruneOldSnapshots(entry.id, keepCount);
      res.json({ success: true, prunedCount: pruned });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get snapshot stats
  router.get('/api/snapshot/:projectId/stats', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const entry = await getOrRecoverContainer(projectId);
      if (!entry) return res.status(404).json({ error: 'Container not found' });

      const stats = await snapshotManager.getStats(entry.id);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
