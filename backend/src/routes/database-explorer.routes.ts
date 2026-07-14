/**
 * Database Explorer Routes
 *
 * Connect/disconnect to PostgreSQL or SQLite, list connections, inspect schema,
 * preview tables, run parameterized queries, list schemas, and report stats.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, rate limiter, and error helpers are
 * unchanged. Closures that previously lived in server.ts (container lifecycle
 * helper, audit log, logger) are injected via the factory; database service
 * collaborators are imported directly from their existing module.
 */

import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  connectionManager,
  queryExecutor,
  schemaInspector,
  type ConnectionParams,
} from '../database/index.js';
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

export interface DatabaseExplorerRouterDeps {
  authenticateRequest: Middleware;
  verifyProjectOwnership: Middleware;
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
    error: (obj: unknown, msg: string) => void;
  };
}

export function createDatabaseExplorerRouter(deps: DatabaseExplorerRouterDeps): Router {
  const {
    authenticateRequest,
    verifyProjectOwnership,
    getOrRecoverContainer,
    auditLog,
    logger,
  } = deps;
  const router = Router();

  // Rate limit for database operations
  const databaseLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    message: { error: 'Too many database requests, please try again later' },
  });

  // Connect to a database
  router.post('/api/database/:projectId/connect', databaseLimiter, authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;
    const params = req.body as ConnectionParams;

    if (!params || !params.type) {
      return res.status(400).json({ error: 'Database connection parameters required' });
    }

    // Validate database type
    if (params.type !== 'postgresql' && params.type !== 'sqlite') {
      return res.status(400).json({ error: 'Unsupported database type. Use postgresql or sqlite.' });
    }

    try {
      // Get workspace path for SQLite path validation
      const entry = await getOrRecoverContainer(projectId);
      const basePath = entry ? '/workspace' : '/tmp';

      const result = await connectionManager.connect(projectId, params, basePath);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      auditLog({
        userId: req.userId,
        action: 'database_connect',
        projectId,
        details: { type: params.type, connectionId: result.connectionId },
      });

      logger.info({ type: params.type, projectId, connectionId: result.connectionId }, 'Database: connected');

      res.json({
        success: true,
        connectionId: result.connectionId,
        type: params.type,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Database: connect error');
      res.status(500).json({ success: false, error: 'Failed to connect to database' });
    }
  });

  // Disconnect from a database
  router.delete('/api/database/:projectId/disconnect/:connectionId', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId, connectionId } = req.params;

    if (!connectionId) {
      return res.status(400).json({ error: 'Connection ID required' });
    }

    try {
      const result = await connectionManager.disconnect(connectionId, projectId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      auditLog({
        userId: req.userId,
        action: 'database_disconnect',
        projectId,
        details: { connectionId },
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // List active connections for a project
  router.get('/api/database/:projectId/connections', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;

    try {
      const connections = connectionManager.getProjectConnections(projectId);

      res.json({
        success: true,
        connections: connections.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          createdAt: c.createdAt,
          lastUsed: c.lastUsed,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // List tables in a database
  router.get('/api/database/:projectId/tables', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;
    const { connectionId, schema } = req.query;

    if (!connectionId || typeof connectionId !== 'string') {
      return res.status(400).json({ error: 'Connection ID required' });
    }

    try {
      const result = await schemaInspector.getSchemaOverview(
        connectionId,
        projectId,
        typeof schema === 'string' ? schema : undefined
      );

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({
        success: true,
        data: result.data,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Get table schema details
  router.get('/api/database/:projectId/schema/:table', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId, table } = req.params;
    const { connectionId, schema } = req.query;

    if (!connectionId || typeof connectionId !== 'string') {
      return res.status(400).json({ error: 'Connection ID required' });
    }

    if (!table) {
      return res.status(400).json({ error: 'Table name required' });
    }

    try {
      const result = await schemaInspector.getTableDetails(
        connectionId,
        projectId,
        table,
        typeof schema === 'string' ? schema : undefined
      );

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({
        success: true,
        data: result.data,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Preview table data (limited rows)
  router.get('/api/database/:projectId/preview/:table', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId, table } = req.params;
    const { connectionId, schema, limit } = req.query;

    if (!connectionId || typeof connectionId !== 'string') {
      return res.status(400).json({ error: 'Connection ID required' });
    }

    if (!table) {
      return res.status(400).json({ error: 'Table name required' });
    }

    try {
      const result = await schemaInspector.previewTable(
        connectionId,
        projectId,
        table,
        typeof schema === 'string' ? schema : undefined,
        typeof limit === 'string' ? parseInt(limit, 10) : 100
      );

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({
        success: true,
        rows: result.rows,
        columns: result.columns,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Execute a parameterized query
  // SECURITY: Only accepts parameterized queries with bound values
  router.post('/api/database/:projectId/query', databaseLimiter, authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;
    const { connectionId, query, params = [], timeout, limit } = req.body;

    if (!connectionId || typeof connectionId !== 'string') {
      return res.status(400).json({ error: 'Connection ID required' });
    }

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query is required' });
    }

    // SECURITY: Ensure params is an array (for parameterized queries)
    if (!Array.isArray(params)) {
      return res.status(400).json({ error: 'Query params must be an array for parameterized queries' });
    }

    try {
      const result = await queryExecutor.execute({
        connectionId,
        projectId,
        query,
        params,
        timeout: typeof timeout === 'number' ? timeout : undefined,
        limit: typeof limit === 'number' ? limit : undefined,
      });

      auditLog({
        userId: req.userId,
        action: 'database_query',
        projectId,
        details: {
          connectionId,
          queryLength: query.length,
          paramsCount: params.length,
          success: result.success,
          rowCount: result.rowCount,
        },
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          executionTime: result.executionTime,
        });
      }

      res.json({
        success: true,
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields,
        executionTime: result.executionTime,
        truncated: result.truncated,
      });
    } catch (error: any) {
      logger.error({ err: error }, 'Database: query error');
      res.status(500).json({ success: false, error: 'Query execution failed' });
    }
  });

  // List available schemas (PostgreSQL only)
  router.get('/api/database/:projectId/schemas', authenticateRequest, verifyProjectOwnership, async (req: AuthenticatedRequest, res) => {
    const { projectId } = req.params;
    const { connectionId } = req.query;

    if (!connectionId || typeof connectionId !== 'string') {
      return res.status(400).json({ error: 'Connection ID required' });
    }

    try {
      const result = await schemaInspector.listSchemas(connectionId, projectId);

      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }

      res.json({
        success: true,
        schemas: result.schemas,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Get database connection statistics
  router.get('/api/database/stats', authenticateRequest, (_req: AuthenticatedRequest, res) => {
    try {
      const connectionStats = connectionManager.getStats();
      const queryStats = queryExecutor.getStats();

      res.json({
        success: true,
        connections: connectionStats,
        queries: queryStats,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  return router;
}
