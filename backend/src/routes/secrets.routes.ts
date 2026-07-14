/**
 * Secrets / Environment Variables Routes
 *
 * Per-project, per-environment secret management backed by the container's
 * secrets manager.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. Closures
 * that previously lived in server.ts (container lifecycle helpers, audit log,
 * sanitizer, logger) are injected via the factory.
 */

import express, { Router } from 'express';
import { secretsManager } from '../secrets-manager.js';
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

export interface SecretsRouterDeps {
  authenticateRequest: Middleware;
  verifyProjectOwnership: Middleware;
  sanitizeProjectId: (projectId: string) => string;
  getOrRecoverContainer: (projectId: string) => Promise<ContainerEntry | undefined>;
  ensureContainerRunning: (
    entry: ContainerEntry,
    projectId: string,
  ) => Promise<{ running: boolean; restarted: boolean; error?: string }>;
  auditLog: (event: {
    userId?: string;
    action: string;
    projectId?: string;
    details?: Record<string, unknown>;
    ip?: string;
  }) => void;
  logger: { error: (obj: unknown, msg: string) => void };
}

export function createSecretsRouter(deps: SecretsRouterDeps): Router {
  const {
    authenticateRequest,
    verifyProjectOwnership,
    sanitizeProjectId,
    getOrRecoverContainer,
    ensureContainerRunning,
    auditLog,
    logger,
  } = deps;
  const router = Router();

  // Get secrets for an environment
  router.get('/api/secrets/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const environment = (req.query.environment as string) || 'development';

      if (!['development', 'production', 'test', 'local'].includes(environment)) {
        return res.status(400).json({ error: 'Invalid environment' });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      // Ensure container is running
      const containerStatus = await ensureContainerRunning(entry, projectId);
      if (!containerStatus.running) {
        return res.status(503).json({ error: 'Container not running', canRetry: true });
      }

      entry.lastActive = Date.now();

      const secrets = await secretsManager.getSecrets(entry.id, environment);
      res.json({ secrets, environment });
    } catch (err: any) {
      logger.error({ err }, 'Secrets: get secrets error');
      res.status(500).json({ error: err.message });
    }
  });

  // Set a secret
  router.post('/api/secrets/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { key, value, environment = 'development' } = req.body;

      if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: 'Key is required' });
      }

      if (value === undefined) {
        return res.status(400).json({ error: 'Value is required' });
      }

      if (!['development', 'production', 'test', 'local'].includes(environment)) {
        return res.status(400).json({ error: 'Invalid environment' });
      }

      // Sanitize key
      const safeKey = key.replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
      if (!safeKey || safeKey.length > 128) {
        return res.status(400).json({ error: 'Invalid key name' });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'SECRET_SET',
        projectId,
        details: { key: safeKey, environment },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await secretsManager.setSecret(entry.id, safeKey, String(value), environment);

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error || 'Failed to set secret' });
      }
    } catch (err: any) {
      logger.error({ err }, 'Secrets: set secret error');
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a secret
  router.delete('/api/secrets/:projectId/:key', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const key = decodeURIComponent(req.params.key);
      const environment = (req.query.environment as string) || 'development';

      if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: 'Key is required' });
      }

      if (!['development', 'production', 'test', 'local'].includes(environment)) {
        return res.status(400).json({ error: 'Invalid environment' });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'SECRET_DELETE',
        projectId,
        details: { key, environment },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await secretsManager.deleteSecret(entry.id, key, environment);

      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ error: result.error || 'Failed to delete secret' });
      }
    } catch (err: any) {
      logger.error({ err }, 'Secrets: delete secret error');
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
