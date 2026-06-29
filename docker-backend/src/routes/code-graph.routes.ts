/**
 * Code Intelligence API (code knowledge graph) Routes
 *
 * Build a queryable symbol/import graph from project files so agents can
 * navigate a codebase: find symbols, list a file's exports, who-imports, deps.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. The
 * `code-graph` collaborators are lazily imported exactly as before; only the
 * `authenticateRequest` middleware is injected via the factory.
 */

import express, { Router } from 'express';
import {
  ErrorCode,
  createError,
  asyncHandler,
  sendError,
  sendSuccess,
} from '../errors/index.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface CodeGraphRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createCodeGraphRouter(deps: CodeGraphRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  router.post('/api/code-graph/build', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { files, graphId, maxFiles, maxFileBytes } = req.body ?? {};
    if (!Array.isArray(files) || files.length === 0) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'files (non-empty array of {path, content}) is required'));
    }
    const { buildCodeGraph, storeGraph } = await import('../code-graph.js');
    const graph = buildCodeGraph(files, { maxFiles, maxFileBytes });
    const id = (typeof graphId === 'string' && graphId.trim()) ? graphId.trim() : `graph_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    storeGraph(id, graph);
    sendSuccess(res, { graphId: id, stats: graph.stats });
  }));

  router.get('/api/code-graph/:graphId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { getStoredGraph } = await import('../code-graph.js');
    const graph = getStoredGraph(req.params.graphId);
    if (!graph) return sendError(res, createError(ErrorCode.NOT_FOUND, 'graph not found or expired — rebuild it'));
    const full = req.query.full === 'true';
    sendSuccess(res, full ? graph : { stats: graph.stats });
  }));

  router.get('/api/code-graph/:graphId/search', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { getStoredGraph, searchSymbols } = await import('../code-graph.js');
    const graph = getStoredGraph(req.params.graphId);
    if (!graph) return sendError(res, createError(ErrorCode.NOT_FOUND, 'graph not found or expired — rebuild it'));
    const q = (req.query.q as string | undefined)?.trim();
    if (!q) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'q query param is required'));
    sendSuccess(res, { results: searchSymbols(graph, q, Number(req.query.limit) || 50) });
  }));

  router.get('/api/code-graph/:graphId/symbol', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { getStoredGraph, findSymbol } = await import('../code-graph.js');
    const graph = getStoredGraph(req.params.graphId);
    if (!graph) return sendError(res, createError(ErrorCode.NOT_FOUND, 'graph not found or expired — rebuild it'));
    const name = (req.query.name as string | undefined)?.trim();
    if (!name) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'name query param is required'));
    sendSuccess(res, { results: findSymbol(graph, name) });
  }));

  router.get('/api/code-graph/:graphId/file-symbols', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { getStoredGraph, fileSymbols } = await import('../code-graph.js');
    const graph = getStoredGraph(req.params.graphId);
    if (!graph) return sendError(res, createError(ErrorCode.NOT_FOUND, 'graph not found or expired — rebuild it'));
    const path = (req.query.path as string | undefined)?.trim();
    if (!path) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'path query param is required'));
    sendSuccess(res, { symbols: fileSymbols(graph, path) });
  }));

  router.get('/api/code-graph/:graphId/who-imports', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { getStoredGraph, whoImports } = await import('../code-graph.js');
    const graph = getStoredGraph(req.params.graphId);
    if (!graph) return sendError(res, createError(ErrorCode.NOT_FOUND, 'graph not found or expired — rebuild it'));
    const path = (req.query.path as string | undefined)?.trim();
    if (!path) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'path query param is required'));
    sendSuccess(res, { importers: whoImports(graph, path) });
  }));

  router.get('/api/code-graph/:graphId/dependencies', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { getStoredGraph, dependenciesOf } = await import('../code-graph.js');
    const graph = getStoredGraph(req.params.graphId);
    if (!graph) return sendError(res, createError(ErrorCode.NOT_FOUND, 'graph not found or expired — rebuild it'));
    const path = (req.query.path as string | undefined)?.trim();
    if (!path) return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'path query param is required'));
    sendSuccess(res, { dependencies: dependenciesOf(graph, path) });
  }));

  return router;
}
