/**
 * Package Manager Routes
 *
 * Per-project package management (list/search/install/uninstall/update) backed
 * by the package manager service running inside the project's container.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. Closures
 * that previously lived in server.ts (container lifecycle helpers, audit log,
 * sanitizer, logger) are injected via the factory.
 */

import express, { Router } from 'express';
import { packageManagerService } from '../package-manager.js';
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

export interface PackageManagerRouterDeps {
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

export function createPackageManagerRouter(deps: PackageManagerRouterDeps): Router {
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

  // Get installed packages
  router.get('/api/packages/:projectId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const manager = req.query.manager as string;

      if (!manager || !['npm', 'bun', 'pip', 'cargo', 'go', 'composer', 'gem'].includes(manager)) {
        return res.status(400).json({ error: 'Valid package manager required (npm, bun, pip, cargo, go, composer, gem)' });
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

      const packages = await packageManagerService.getPackages(entry.id, manager as any);
      res.json({ packages, manager });
    } catch (err: any) {
      logger.error({ err }, 'PackageManager: get packages error');
      res.status(500).json({ error: err.message });
    }
  });

  // Search package registry
  router.post('/api/packages/:projectId/search', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const { query, manager } = req.body;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Query is required' });
      }

      if (!manager || !['npm', 'bun', 'pip', 'cargo', 'go', 'composer', 'gem'].includes(manager)) {
        return res.status(400).json({ error: 'Valid package manager required' });
      }

      const results = await packageManagerService.searchPackages(manager as any, query);
      res.json({ results });
    } catch (err: any) {
      logger.error({ err }, 'PackageManager: search error');
      res.status(500).json({ error: err.message });
    }
  });

  // Install a package
  router.post('/api/packages/:projectId/install', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { packageName, manager, isDev } = req.body;

      if (!packageName || typeof packageName !== 'string') {
        return res.status(400).json({ error: 'Package name is required' });
      }

      if (!manager || !['npm', 'bun', 'pip', 'cargo', 'go', 'composer', 'gem'].includes(manager)) {
        return res.status(400).json({ error: 'Valid package manager required' });
      }

      // Sanitize package name to prevent command injection
      const safePackageName = packageName.replace(/[;&|`$(){}]/g, '').trim();
      if (!safePackageName) {
        return res.status(400).json({ error: 'Invalid package name' });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'PACKAGE_INSTALL',
        projectId,
        details: { packageName: safePackageName, manager, isDev },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await packageManagerService.installPackage(entry.id, manager as any, safePackageName, isDev === true);

      if (result.success) {
        res.json({ success: true, output: result.output });
      } else {
        res.status(400).json({ error: result.error || 'Install failed' });
      }
    } catch (err: any) {
      logger.error({ err }, 'PackageManager: install error');
      res.status(500).json({ error: err.message });
    }
  });

  // Uninstall a package
  router.post('/api/packages/:projectId/uninstall', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { packageName, manager } = req.body;

      if (!packageName || typeof packageName !== 'string') {
        return res.status(400).json({ error: 'Package name is required' });
      }

      if (!manager || !['npm', 'bun', 'pip', 'cargo', 'go', 'composer', 'gem'].includes(manager)) {
        return res.status(400).json({ error: 'Valid package manager required' });
      }

      const safePackageName = packageName.replace(/[;&|`$(){}]/g, '').trim();
      if (!safePackageName) {
        return res.status(400).json({ error: 'Invalid package name' });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'PACKAGE_UNINSTALL',
        projectId,
        details: { packageName: safePackageName, manager },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await packageManagerService.uninstallPackage(entry.id, manager as any, safePackageName);

      if (result.success) {
        res.json({ success: true, output: result.output });
      } else {
        res.status(400).json({ error: result.error || 'Uninstall failed' });
      }
    } catch (err: any) {
      logger.error({ err }, 'PackageManager: uninstall error');
      res.status(500).json({ error: err.message });
    }
  });

  // Update a package
  router.post('/api/packages/:projectId/update', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { packageName, manager } = req.body;

      if (!packageName || typeof packageName !== 'string') {
        return res.status(400).json({ error: 'Package name is required' });
      }

      if (!manager || !['npm', 'bun', 'pip', 'cargo', 'go', 'composer', 'gem'].includes(manager)) {
        return res.status(400).json({ error: 'Valid package manager required' });
      }

      const safePackageName = packageName.replace(/[;&|`$(){}]/g, '').trim();
      if (!safePackageName) {
        return res.status(400).json({ error: 'Invalid package name' });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      auditLog({
        userId: req.userId,
        action: 'PACKAGE_UPDATE',
        projectId,
        details: { packageName: safePackageName, manager },
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      const result = await packageManagerService.updatePackage(entry.id, manager as any, safePackageName);

      if (result.success) {
        res.json({ success: true, output: result.output });
      } else {
        res.status(400).json({ error: result.error || 'Update failed' });
      }
    } catch (err: any) {
      logger.error({ err }, 'PackageManager: update error');
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
