/**
 * Context7 Up-to-date Docs API Routes
 *
 * Resolve a library and fetch current docs to inject into coding-agent context.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. The
 * `context7-client` collaborators are lazily imported exactly as before; only the
 * `authenticateRequest` middleware is injected via the factory.
 *
 * Note: a separate GET /api/context7/docs route (backed by ./context7.js) remains
 * inline in server.ts and is intentionally NOT part of this router.
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

export interface Context7RouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createContext7Router(deps: Context7RouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  router.get('/api/context7/health', (_req, res) => {
    import('../context7-client.js').then(({ context7Health }) => sendSuccess(res, context7Health()));
  });

  router.get('/api/context7/resolve', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const library = (req.query.library as string | undefined)?.trim();
    const query = (req.query.query as string | undefined) ?? '';
    if (!library) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'library query param is required'));
    }
    const { resolveLibrary } = await import('../context7-client.js');
    sendSuccess(res, await resolveLibrary(library, query));
  }));

  router.post('/api/context7/docs', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { libraryId, query } = req.body ?? {};
    if (typeof libraryId !== 'string' || !libraryId.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'libraryId (string) is required'));
    }
    if (typeof query !== 'string' || !query.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'query (string) is required'));
    }
    const { getLibraryDocs } = await import('../context7-client.js');
    sendSuccess(res, await getLibraryDocs(libraryId, query));
  }));

  router.post('/api/context7/inject', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { libraryName, query } = req.body ?? {};
    if (typeof libraryName !== 'string' || !libraryName.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'libraryName (string) is required'));
    }
    if (typeof query !== 'string' || !query.trim()) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'query (string) is required'));
    }
    const { getDocsForQuery } = await import('../context7-client.js');
    sendSuccess(res, await getDocsForQuery({ libraryName, query }));
  }));

  return router;
}
