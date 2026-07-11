/**
 * MCP Server Management API Routes
 *
 * Project-scoped MCP marketplace catalog plus server lifecycle (start/stop/
 * stop-all), server/tool listing, and tool calls. These routes are registered
 * AFTER the Agent OS MCP host registry router so names like /servers and /tools
 * are not interpreted as project IDs.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error handling are unchanged. The
 * `authenticateRequest` / `verifyProjectOwnership` middleware closures, the
 * `auditLog` helper, and the `logger` instance that previously lived in server.ts
 * are injected via the factory. The `mcpManager`, `PREINSTALLED_SERVERS`, and
 * `NPX_SERVERS` collaborators are imported directly from their existing module.
 */

import express, { Router } from 'express';
import { createLogger } from '../logger.js';
import { mcpManager, PREINSTALLED_SERVERS, NPX_SERVERS, PYTHON_SERVERS } from '../mcp-manager.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type Middleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

type AuditLog = (event: {
  userId?: string;
  action: string;
  projectId?: string;
  details?: Record<string, unknown>;
  ip?: string;
}) => void;

export interface McpRouterDeps {
  authenticateRequest: Middleware;
  verifyProjectOwnership: Middleware;
  auditLog: AuditLog;
  logger: ReturnType<typeof createLogger>;
}

export function createMcpRouter(deps: McpRouterDeps): Router {
  const { authenticateRequest, verifyProjectOwnership, auditLog, logger } = deps;
  const router = Router();

  // Get available MCP servers (marketplace catalog)
  router.get('/api/mcp/catalog', authenticateRequest, (_req: AuthenticatedRequest, res) => {
    const preinstalled = Object.entries(PREINSTALLED_SERVERS).map(([id, config]) => ({
      id,
      ...config,
      preinstalled: true,
      requiresApiKey: false,
    }));

    const npxServers = Object.entries(NPX_SERVERS).map(([id, config]) => ({
      id,
      ...config,
      preinstalled: false,
      requiresApiKey: !!config.env && Object.keys(config.env).length > 0,
      requiredEnvVars: config.env ? Object.keys(config.env) : [],
    }));

    // Python servers are degrade-safe: only offered when the opt-in env flag is set.
    const pythonServers = Object.entries(PYTHON_SERVERS)
      .filter(([, config]) => process.env[config.enabledByEnv] === '1')
      .map(([id, config]) => {
        const { enabledByEnv: _gate, ...rest } = config;
        return {
          id,
          ...rest,
          preinstalled: false,
          requiresApiKey: false,
        };
      });

    res.json({ servers: [...preinstalled, ...npxServers, ...pythonServers] });
  });

  // Start an MCP server for a project
  router.post('/api/mcp/:projectId/start', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;
    const { serverId, config } = req.body;

    if (!serverId) {
      return res.status(400).json({ error: 'serverId is required' });
    }

    // Build server config
    let serverConfig;
    if (PREINSTALLED_SERVERS[serverId]) {
      // Use preinstalled config (instant startup)
      serverConfig = {
        id: serverId,
        ...PREINSTALLED_SERVERS[serverId],
        env: { ...config?.env },
      };
    } else if (NPX_SERVERS[serverId]) {
      // Use npx server config (requires download on first use)
      const npxConfig = NPX_SERVERS[serverId];
      serverConfig = {
        id: serverId,
        ...npxConfig,
        env: { ...npxConfig.env, ...config?.env },
      };
    } else if (PYTHON_SERVERS[serverId]) {
      // Python server: degrade-safe — refuse if the opt-in env flag is absent
      const pyEntry = PYTHON_SERVERS[serverId];
      if (process.env[pyEntry.enabledByEnv] !== '1') {
        return res.status(503).json({
          error: `MCP server '${serverId}' is not available (set ${pyEntry.enabledByEnv}=1 to enable)`,
        });
      }
      const { enabledByEnv: _gate, ...pyConfig } = pyEntry;
      serverConfig = {
        id: serverId,
        ...pyConfig,
        env: { ...pyConfig.env, ...config?.env },
      };
    } else if (config) {
      // Custom server config
      serverConfig = {
        id: serverId,
        name: config.name || serverId,
        command: config.command,
        args: config.args || [],
        env: config.env,
      };
    } else {
      return res.status(400).json({ error: 'Invalid server configuration' });
    }

    try {
      const result = await mcpManager.startServer(projectId, serverConfig);
      if (result.success) {
        auditLog({
          userId: req.userId,
          action: 'mcp_start',
          projectId,
          details: { serverId },
        });
        res.json({ success: true, tools: result.tools });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      logger.error({ err: error }, 'MCP: error starting server');
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Stop an MCP server
  router.post('/api/mcp/:projectId/stop', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;
    const { serverId } = req.body;

    if (!serverId) {
      return res.status(400).json({ error: 'serverId is required' });
    }

    try {
      await mcpManager.stopServer(projectId, serverId);
      auditLog({
        userId: req.userId,
        action: 'mcp_stop',
        projectId,
        details: { serverId },
      });
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Stop all MCP servers for a project
  router.post('/api/mcp/:projectId/stop-all', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;

    try {
      await mcpManager.stopAllServers(projectId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get running MCP servers for a project
  router.get('/api/mcp/:projectId/servers', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;

    try {
      const servers = mcpManager.getServers(projectId);
      res.json({ servers });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get all tools from running MCP servers
  router.get('/api/mcp/:projectId/tools', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;

    try {
      const tools = mcpManager.getAllTools(projectId);
      res.json({ tools });
    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Call a tool on an MCP server
  router.post('/api/mcp/:projectId/call', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;
    const { serverId, toolName, args } = req.body;

    if (!serverId || !toolName) {
      return res.status(400).json({ error: 'serverId and toolName are required' });
    }

    try {
      const result = await mcpManager.callTool(projectId, serverId, toolName, args || {});
      auditLog({
        userId: req.userId,
        action: 'mcp_tool_call',
        projectId,
        details: { serverId, toolName },
      });
      res.json({ success: true, result });
    } catch (error: any) {
      logger.error({ err: error }, 'MCP: tool call error');
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  return router;
}
