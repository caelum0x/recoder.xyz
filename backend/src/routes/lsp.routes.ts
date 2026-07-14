/**
 * LSP API Routes (Language Server Protocol bridge)
 *
 * Start/stop LSP servers for a project, query server status and configs, forward
 * LSP requests (completion, hover, definition, etc.), sync document state, and
 * report manager statistics.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. Closures
 * that previously lived in server.ts (container lifecycle helper, audit log,
 * sanitizer, logger) are injected via the factory; module collaborators
 * (lspServerManager, getConfigForExtension, LSP_SERVER_CONFIGS) are imported here.
 */

import express, { Router } from 'express';
import { lspServerManager, getConfigForExtension, LSP_SERVER_CONFIGS } from '../lsp/index.js';
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

export interface LspRouterDeps {
  authenticateRequest: Middleware;
  verifyProjectOwnership: Middleware;
  sanitizeProjectId: (projectId: string) => string;
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

export function createLspRouter(deps: LspRouterDeps): Router {
  const {
    authenticateRequest,
    verifyProjectOwnership,
    sanitizeProjectId,
    getOrRecoverContainer,
    auditLog,
    logger,
  } = deps;
  const router = Router();

  // Start LSP servers for a project (auto-detect languages)
  router.post('/api/lsp/:projectId/start', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const entry = await getOrRecoverContainer(projectId);

      if (!entry) {
        return res.status(404).json({ error: 'Container not found. Start a project first.' });
      }

      auditLog({
        userId: req.userId,
        action: 'LSP_START',
        projectId,
        ip: req.ip,
      });

      entry.lastActive = Date.now();

      // Auto-start LSP servers for detected languages
      await lspServerManager.autoStartForContainer(entry.id, projectId);

      const status = lspServerManager.getProjectStatus(projectId);
      res.json({
        success: true,
        servers: status,
        message: `Started ${status.length} LSP server(s)`,
      });
    } catch (err: any) {
      logger.error({ err }, 'LSP: start error');
      res.status(500).json({ error: err.message });
    }
  });

  // Stop LSP servers for a project
  router.post('/api/lsp/:projectId/stop', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);

      await lspServerManager.stopAllForProject(projectId);

      auditLog({
        userId: req.userId,
        action: 'LSP_STOP',
        projectId,
        ip: req.ip,
      });

      res.json({ success: true });
    } catch (err: any) {
      logger.error({ err }, 'LSP: stop error');
      res.status(500).json({ error: err.message });
    }
  });

  // Get LSP server status for a project
  router.get('/api/lsp/:projectId/status', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const status = lspServerManager.getProjectStatus(projectId);

      res.json({
        success: true,
        servers: status,
      });
    } catch (err: any) {
      logger.error({ err }, 'LSP: status error');
      res.status(500).json({ error: err.message });
    }
  });

  // Get available LSP server configurations
  router.get('/api/lsp/configs', authenticateRequest, (_req: AuthenticatedRequest, res) => {
    res.json({
      success: true,
      configs: Object.values(LSP_SERVER_CONFIGS).map(c => ({
        languageId: c.languageId,
        name: c.name,
        extensions: c.fileExtensions,
      })),
    });
  });

  // Send LSP request (completion, hover, definition, etc.)
  router.post('/api/lsp/:projectId/request', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { filePath, method, params } = req.body;

      if (!filePath || !method) {
        return res.status(400).json({ error: 'filePath and method are required' });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();

      // Get file extension to find the right LSP server
      const ext = '.' + filePath.split('.').pop();
      const config = getConfigForExtension(ext);

      if (!config) {
        return res.status(400).json({ error: `No LSP server available for file type: ${ext}` });
      }

      // Get or create LSP client
      const client = await lspServerManager.getClient(projectId, config.languageId);

      if (!client) {
        // Try to start the server
        await lspServerManager.startServer(entry.id, projectId, config);
        const newClient = await lspServerManager.getClient(projectId, config.languageId);

        if (!newClient) {
          return res.status(503).json({ error: `LSP server for ${config.name} is not ready` });
        }
      }

      const lspClient = await lspServerManager.getClient(projectId, config.languageId);
      if (!lspClient) {
        return res.status(503).json({ error: 'LSP client not available' });
      }

      // Send the request
      const result = await lspClient.sendRequest(method, {
        textDocument: {
          uri: `file:///workspace/${filePath}`,
        },
        ...params,
      });

      res.json({
        success: true,
        result,
      });
    } catch (err: any) {
      logger.error({ err }, 'LSP: request error');
      res.status(500).json({ error: err.message });
    }
  });

  // Document sync notification (for when files change)
  router.post('/api/lsp/:projectId/sync', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    try {
      const projectId = sanitizeProjectId(req.params.projectId);
      const { filePath, content, version } = req.body;

      if (!filePath || content === undefined) {
        return res.status(400).json({ error: 'filePath and content are required' });
      }

      const entry = await getOrRecoverContainer(projectId);
      if (!entry) {
        return res.status(404).json({ error: 'Container not found' });
      }

      entry.lastActive = Date.now();

      const ext = '.' + filePath.split('.').pop();
      const config = getConfigForExtension(ext);

      if (!config) {
        return res.json({ success: true, synced: false, reason: 'No LSP for file type' });
      }

      const client = await lspServerManager.getClient(projectId, config.languageId);

      if (!client || !client.isInitialized()) {
        return res.json({ success: true, synced: false, reason: 'LSP not initialized' });
      }

      // Send didOpen or didChange notification
      client.sendNotification('textDocument/didOpen', {
        textDocument: {
          uri: `file:///workspace/${filePath}`,
          languageId: config.languageId,
          version: version || 1,
          text: content,
        },
      });

      res.json({ success: true, synced: true });
    } catch (err: any) {
      logger.error({ err }, 'LSP: sync error');
      res.status(500).json({ error: err.message });
    }
  });

  // Get LSP manager statistics
  router.get('/api/lsp/stats', authenticateRequest, (_req: AuthenticatedRequest, res) => {
    const stats = lspServerManager.getStats();
    const clientStats = lspServerManager.getStats();

    res.json({
      success: true,
      stats: {
        ...stats,
        clients: clientStats,
      },
    });
  });

  return router;
}
