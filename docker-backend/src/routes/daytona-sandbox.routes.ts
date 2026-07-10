/**
 * Daytona Sandbox Integration Routes
 *
 * REST-based Daytona sandbox management for Spaces projects.
 * Provides an alternative to local Docker containers using the self-hosted Daytona API.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged.
 */

import express, { Router } from 'express';
import { getDaytonaClient, isDaytonaConfigured } from '../daytona-client.js';
import {
  ErrorCode,
  createError,
  asyncHandler,
  sendError,
  sendSuccess,
} from '../errors/index.js';
import { createLogger } from '../logger.js';

const logger = createLogger('server');

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

export type OwnershipResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Verify the caller owns the sandbox by comparing the `userId` label stamped at
 * creation. Fail-closed: no caller userId, missing label, or mismatch => deny.
 */
export async function assertSandboxOwnership(
  client: { getSandbox: (id: string) => Promise<{ labels?: Record<string, string> }> },
  sandboxId: string,
  userId: string | undefined,
): Promise<OwnershipResult> {
  if (!userId) return { ok: false, status: 401, error: 'Unauthorized' };
  let ownerId: string | undefined;
  try {
    const sandbox = await client.getSandbox(sandboxId);
    ownerId = sandbox.labels?.userId;
  } catch {
    return { ok: false, status: 404, error: 'Sandbox not found' };
  }
  if (ownerId !== userId) {
    return { ok: false, status: 403, error: 'You do not have access to this sandbox' };
  }
  return { ok: true };
}

type AuthMiddleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface DaytonaSandboxRouterDeps {
  authenticateRequest: AuthMiddleware;
}

export function createDaytonaSandboxRouter(deps: DaytonaSandboxRouterDeps): Router {
  const { authenticateRequest } = deps;
  const router = Router();

  // POST /api/daytona/sandbox - Create a new Daytona sandbox
  router.post('/api/daytona/sandbox', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    if (!isDaytonaConfigured()) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona integration not configured'));
    }

    const { snapshot, envVars, labels, autoStopInterval, autoArchiveInterval, resources } = req.body;

    try {
      const sandbox = await getDaytonaClient().createSandbox({
        snapshot,
        envVars,
        labels: { ...(labels || {}), userId: req.userId, source: 'docker-backend' },
        autoStopInterval,
        autoArchiveInterval,
        resources,
      });

      sendSuccess(res, { sandbox });
    } catch (err: any) {
      logger.error({ err, userId: req.userId }, 'Failed to create Daytona sandbox');
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Daytona sandbox creation failed: ${err.message}`));
    }
  }));

  // GET /api/daytona/sandbox - List Daytona sandboxes
  router.get('/api/daytona/sandbox', authenticateRequest, asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
    if (!isDaytonaConfigured()) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona integration not configured'));
    }

    try {
      const sandboxes = await getDaytonaClient().listSandboxes();
      sendSuccess(res, { sandboxes, total: sandboxes.length });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Failed to list Daytona sandboxes: ${err.message}`));
    }
  }));

  // GET /api/daytona/sandbox/:sandboxId - Get Daytona sandbox info
  router.get('/api/daytona/sandbox/:sandboxId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    if (!isDaytonaConfigured()) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona integration not configured'));
    }

    const owns = await assertSandboxOwnership(getDaytonaClient(), req.params.sandboxId, req.userId);
    if (!owns.ok) {
      return sendError(res, createError(
        owns.status === 403 ? ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED : ErrorCode.VALIDATION_ERROR,
        owns.error,
      ));
    }

    try {
      const sandbox = await getDaytonaClient().getSandbox(req.params.sandboxId);
      sendSuccess(res, { sandbox });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Failed to get Daytona sandbox: ${err.message}`));
    }
  }));

  // POST /api/daytona/sandbox/:sandboxId/start - Start a stopped sandbox
  router.post('/api/daytona/sandbox/:sandboxId/start', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    if (!isDaytonaConfigured()) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona integration not configured'));
    }

    const owns = await assertSandboxOwnership(getDaytonaClient(), req.params.sandboxId, req.userId);
    if (!owns.ok) {
      return sendError(res, createError(
        owns.status === 403 ? ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED : ErrorCode.VALIDATION_ERROR,
        owns.error,
      ));
    }

    try {
      await getDaytonaClient().startSandbox(req.params.sandboxId);
      sendSuccess(res, { started: true, sandboxId: req.params.sandboxId });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Failed to start Daytona sandbox: ${err.message}`));
    }
  }));

  // POST /api/daytona/sandbox/:sandboxId/stop - Stop a running sandbox
  router.post('/api/daytona/sandbox/:sandboxId/stop', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    if (!isDaytonaConfigured()) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona integration not configured'));
    }

    const owns = await assertSandboxOwnership(getDaytonaClient(), req.params.sandboxId, req.userId);
    if (!owns.ok) {
      return sendError(res, createError(
        owns.status === 403 ? ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED : ErrorCode.VALIDATION_ERROR,
        owns.error,
      ));
    }

    try {
      await getDaytonaClient().stopSandbox(req.params.sandboxId);
      sendSuccess(res, { stopped: true, sandboxId: req.params.sandboxId });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Failed to stop Daytona sandbox: ${err.message}`));
    }
  }));

  // DELETE /api/daytona/sandbox/:sandboxId - Delete a sandbox
  router.delete('/api/daytona/sandbox/:sandboxId', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    if (!isDaytonaConfigured()) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona integration not configured'));
    }

    const owns = await assertSandboxOwnership(getDaytonaClient(), req.params.sandboxId, req.userId);
    if (!owns.ok) {
      return sendError(res, createError(
        owns.status === 403 ? ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED : ErrorCode.VALIDATION_ERROR,
        owns.error,
      ));
    }

    try {
      await getDaytonaClient().deleteSandbox(req.params.sandboxId);
      sendSuccess(res, { deleted: true, sandboxId: req.params.sandboxId });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Failed to delete Daytona sandbox: ${err.message}`));
    }
  }));

  // POST /api/daytona/sandbox/:sandboxId/exec - Execute command in sandbox
  router.post('/api/daytona/sandbox/:sandboxId/exec', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    if (!isDaytonaConfigured()) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona integration not configured'));
    }

    const owns = await assertSandboxOwnership(getDaytonaClient(), req.params.sandboxId, req.userId);
    if (!owns.ok) {
      return sendError(res, createError(
        owns.status === 403 ? ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED : ErrorCode.VALIDATION_ERROR,
        owns.error,
      ));
    }

    const { command, cwd, timeoutSecs } = req.body;
    if (!command) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'command is required'));
    }

    try {
      const result = await getDaytonaClient().execCommand(req.params.sandboxId, command, { cwd, timeoutSecs });
      sendSuccess(res, result);
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Command execution failed: ${err.message}`));
    }
  }));

  // POST /api/daytona/sandbox/:sandboxId/files/write - Write file to sandbox
  router.post('/api/daytona/sandbox/:sandboxId/files/write', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    if (!isDaytonaConfigured()) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona integration not configured'));
    }

    const owns = await assertSandboxOwnership(getDaytonaClient(), req.params.sandboxId, req.userId);
    if (!owns.ok) {
      return sendError(res, createError(
        owns.status === 403 ? ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED : ErrorCode.VALIDATION_ERROR,
        owns.error,
      ));
    }

    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'path and content are required'));
    }

    try {
      await getDaytonaClient().uploadFile(req.params.sandboxId, filePath, content);

      // Queue background indexing (Qdrant + Meilisearch) — fire-and-forget
      try {
        const { queueFileIndex } = await import('../a2a/trigger-jobs.js');
        const textContent = typeof content === 'string' ? content : '';
        if (textContent.length > 0 && textContent.length < 100_000) {
          queueFileIndex(req.params.sandboxId, filePath, textContent);
        }
      } catch { /* trigger-jobs module may not be available */ }

      sendSuccess(res, { written: true, path: filePath });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, `File write failed: ${err.message}`));
    }
  }));

  // GET /api/daytona/sandbox/:sandboxId/files/read - Read file from sandbox
  router.get('/api/daytona/sandbox/:sandboxId/files/read', authenticateRequest, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    if (!isDaytonaConfigured()) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona integration not configured'));
    }

    const owns = await assertSandboxOwnership(getDaytonaClient(), req.params.sandboxId, req.userId);
    if (!owns.ok) {
      return sendError(res, createError(
        owns.status === 403 ? ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED : ErrorCode.VALIDATION_ERROR,
        owns.error,
      ));
    }

    const filePath = req.query.path as string;
    if (!filePath) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'path query parameter is required'));
    }

    try {
      const content = await getDaytonaClient().downloadFile(req.params.sandboxId, filePath);
      sendSuccess(res, { path: filePath, content });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, `File read failed: ${err.message}`));
    }
  }));

  // GET /api/daytona/sandbox/:sandboxId/preview - Get preview URL for a port
  router.get('/api/daytona/sandbox/:sandboxId/preview', authenticateRequest, async (req: AuthenticatedRequest, res: express.Response) => {
    if (!isDaytonaConfigured()) {
      return sendError(res, createError(ErrorCode.SERVICE_UNAVAILABLE, 'Daytona integration not configured'));
    }

    const owns = await assertSandboxOwnership(getDaytonaClient(), req.params.sandboxId, req.userId);
    if (!owns.ok) {
      return sendError(res, createError(
        owns.status === 403 ? ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED : ErrorCode.VALIDATION_ERROR,
        owns.error,
      ));
    }

    const port = parseInt(req.query.port as string, 10);
    if (!port || isNaN(port)) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'port query parameter is required'));
    }

    try {
      const preview = await getDaytonaClient().getPortPreviewUrl(req.params.sandboxId, port);
      sendSuccess(res, { ...preview, port });
    } catch (err: any) {
      sendError(res, createError(ErrorCode.INTERNAL_ERROR, `Failed to get Daytona preview URL: ${err.message}`));
    }
  });

  return router;
}
