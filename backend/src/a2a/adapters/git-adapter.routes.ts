/**
 * @module git-adapter.routes
 *
 * Express route handlers for the Git Protocol Adapter API.
 *
 * Provides the following endpoints under the `/api/a2a/git-adapters` prefix:
 *
 * | Method | Path                                   | Description                        |
 * |--------|----------------------------------------|------------------------------------|
 * | POST   | /                                      | Register a new Git adapter         |
 * | GET    | /                                      | List all registered Git adapters   |
 * | GET    | /:adapterId                            | Get adapter details                |
 * | DELETE | /:adapterId                            | Unregister an adapter              |
 * | POST   | /:adapterId/create-task-branch         | Create a task branch               |
 * | GET    | /:adapterId/tasks/:taskId/poll         | Poll for task result               |
 * | GET    | /:adapterId/branches                   | List task branches                 |
 * | DELETE | /:adapterId/tasks/:taskId              | Cleanup a task branch              |
 *
 * P17-002: Git Protocol Adapter Routes
 */

import { Router, type Request, type Response } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '@recoder/shared/a2a';
import {
  GitAdapter,
  DefaultGitExecutor,
  registerGitAdapter,
  getGitAdapter,
  listGitAdapters,
  unregisterGitAdapter,
} from './git-adapter';
import { parseJsonTextBody } from '../task-lifecycle.middleware';
import { createLogger } from '../../logger';

const logger = createLogger('a2a-git-adapter-routes');

// ---------------------------------------------------------------------------
// Default local identity for adapters created via the REST API
// ---------------------------------------------------------------------------

const DEFAULT_LOCAL_IDENTITY = {
  id: 'recoder-backend',
  name: 'Recoder Backend',
  platform: 'recoder' as const,
};

// ---------------------------------------------------------------------------
// Response helpers (matching collaboration.routes.ts pattern)
// ---------------------------------------------------------------------------

interface GitAdapterSuccessResponse<T> {
  success: true;
  data: T;
}

interface GitAdapterErrorResponse {
  success: false;
  error: A2AError;
}

function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: GitAdapterSuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(response);
}

function sendError(res: Response, httpStatus: number, error: A2AError): void {
  const response: GitAdapterErrorResponse = { success: false, error };
  res.status(httpStatus).json(response);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const gitAdapterRouter = Router();

// Parse JSON text bodies (same pattern as collaboration routes -- the
// parent `/api/a2a` mount uses express.text() for raw verification).
gitAdapterRouter.use(parseJsonTextBody);

// ---------------------------------------------------------------------------
// POST / -- Register a new Git adapter
// ---------------------------------------------------------------------------

gitAdapterRouter.post(
  '/',
  (req: Request, res: Response) => {
    try {
      const body = req.body;

      if (!body || typeof body !== 'object') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'Request body must be a JSON object',
        }));
        return;
      }

      const { adapterId, repoPath, baseBranch, branchPrefix, pollIntervalMs, pollTimeoutMs } = body;

      // Validate required fields
      if (!adapterId || typeof adapterId !== 'string' || adapterId.trim().length === 0) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'adapterId must be a non-empty string',
        }));
        return;
      }

      if (!repoPath || typeof repoPath !== 'string' || repoPath.trim().length === 0) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'repoPath must be a non-empty string',
        }));
        return;
      }

      // Check for duplicate
      if (getGitAdapter(adapterId)) {
        sendError(res, 409, buildA2AError({
          code: A2AErrorCodeEnum.AgentAlreadyRegistered,
          message: `Git adapter already registered: ${adapterId}`,
        }));
        return;
      }

      // Create and register the adapter
      const adapter = new GitAdapter(
        {
          adapterId,
          repoPath,
          baseBranch: baseBranch ?? undefined,
          branchPrefix: branchPrefix ?? undefined,
          pollIntervalMs: pollIntervalMs ?? undefined,
          maxPollAttempts: pollTimeoutMs != null && pollIntervalMs != null
            ? Math.ceil(pollTimeoutMs / pollIntervalMs)
            : undefined,
          auth: { type: 'none' },
          localIdentity: DEFAULT_LOCAL_IDENTITY,
        },
        new DefaultGitExecutor(),
      );

      registerGitAdapter(adapter);
      sendSuccess(res, adapter.getState(), 201);
    } catch (err) {
      logger.error({ err }, 'unhandled error in POST /api/a2a/git-adapters');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while registering git adapter',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET / -- List all registered Git adapters
// ---------------------------------------------------------------------------

gitAdapterRouter.get(
  '/',
  (_req: Request, res: Response) => {
    try {
      const adapters = listGitAdapters().map((a) => a.getState());
      sendSuccess(res, { adapters, count: adapters.length });
    } catch (err) {
      logger.error({ err }, 'unhandled error in GET /api/a2a/git-adapters');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while listing git adapters',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:adapterId -- Get adapter details
// ---------------------------------------------------------------------------

gitAdapterRouter.get(
  '/:adapterId',
  (req: Request, res: Response) => {
    try {
      const adapter = getGitAdapter(req.params.adapterId);

      if (!adapter) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ConnectorNotFound,
          message: `Git adapter not found: ${req.params.adapterId}`,
        }));
        return;
      }

      sendSuccess(res, adapter.getState());
    } catch (err) {
      logger.error({ err, adapterId: req.params.adapterId }, 'unhandled error in GET /api/a2a/git-adapters/:adapterId');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while fetching git adapter',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /:adapterId -- Unregister an adapter
// ---------------------------------------------------------------------------

gitAdapterRouter.delete(
  '/:adapterId',
  (req: Request, res: Response) => {
    try {
      const { adapterId } = req.params;

      if (!getGitAdapter(adapterId)) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ConnectorNotFound,
          message: `Git adapter not found: ${adapterId}`,
        }));
        return;
      }

      unregisterGitAdapter(adapterId);
      sendSuccess(res, { adapterId, unregistered: true });
    } catch (err) {
      logger.error({ err, adapterId: req.params.adapterId }, 'unhandled error in DELETE /api/a2a/git-adapters/:adapterId');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while unregistering git adapter',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:adapterId/create-task-branch -- Create a task branch
// ---------------------------------------------------------------------------

gitAdapterRouter.post(
  '/:adapterId/create-task-branch',
  async (req: Request, res: Response) => {
    try {
      const adapter = getGitAdapter(req.params.adapterId);

      if (!adapter) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ConnectorNotFound,
          message: `Git adapter not found: ${req.params.adapterId}`,
        }));
        return;
      }

      const body = req.body;

      if (!body || typeof body !== 'object') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'Request body must be a JSON object',
        }));
        return;
      }

      const { taskId, intent, prompt, requester, metadata } = body;

      // Validate required fields
      const issues: string[] = [];
      if (!taskId || typeof taskId !== 'string') issues.push('taskId must be a non-empty string');
      if (!prompt || typeof prompt !== 'string') issues.push('prompt must be a non-empty string');
      if (!requester || typeof requester !== 'object') {
        issues.push('requester must be an object');
      } else {
        if (!requester.id || typeof requester.id !== 'string') issues.push('requester.id must be a non-empty string');
        if (!requester.name || typeof requester.name !== 'string') issues.push('requester.name must be a non-empty string');
        if (!requester.platform || typeof requester.platform !== 'string') issues.push('requester.platform must be a non-empty string');
      }

      if (issues.length > 0) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: `Validation failed: ${issues.join('; ')}`,
        }));
        return;
      }

      const result = await adapter.createTaskBranch({
        taskId,
        targetAgent: { id: requester.id, name: requester.name, platform: requester.platform },
        prompt,
        intent: intent ?? undefined,
        metadata: metadata ?? undefined,
      });

      sendSuccess(res, result, 201);
    } catch (err) {
      logger.error({ err, adapterId: req.params.adapterId }, 'unhandled error in POST /api/a2a/git-adapters/:adapterId/create-task-branch');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while creating task branch',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:adapterId/tasks/:taskId/poll -- Poll for task result
// ---------------------------------------------------------------------------

gitAdapterRouter.get(
  '/:adapterId/tasks/:taskId/poll',
  async (req: Request, res: Response) => {
    try {
      const adapter = getGitAdapter(req.params.adapterId);

      if (!adapter) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ConnectorNotFound,
          message: `Git adapter not found: ${req.params.adapterId}`,
        }));
        return;
      }

      const result = await adapter.pollTaskResult(req.params.taskId);

      if (result.found) {
        sendSuccess(res, result);
      } else {
        sendSuccess(res, { status: 'pending', ...result });
      }
    } catch (err) {
      logger.error(
        { err, adapterId: req.params.adapterId, taskId: req.params.taskId },
        'unhandled error in GET /api/a2a/git-adapters/:adapterId/tasks/:taskId/poll',
      );
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while polling for task result',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:adapterId/branches -- List task branches
// ---------------------------------------------------------------------------

gitAdapterRouter.get(
  '/:adapterId/branches',
  async (req: Request, res: Response) => {
    try {
      const adapter = getGitAdapter(req.params.adapterId);

      if (!adapter) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ConnectorNotFound,
          message: `Git adapter not found: ${req.params.adapterId}`,
        }));
        return;
      }

      const branches = await adapter.listTaskBranches();
      sendSuccess(res, { branches, count: branches.length });
    } catch (err) {
      logger.error(
        { err, adapterId: req.params.adapterId },
        'unhandled error in GET /api/a2a/git-adapters/:adapterId/branches',
      );
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while listing task branches',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /:adapterId/tasks/:taskId -- Cleanup a task branch
// ---------------------------------------------------------------------------

gitAdapterRouter.delete(
  '/:adapterId/tasks/:taskId',
  async (req: Request, res: Response) => {
    try {
      const adapter = getGitAdapter(req.params.adapterId);

      if (!adapter) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ConnectorNotFound,
          message: `Git adapter not found: ${req.params.adapterId}`,
        }));
        return;
      }

      const cleaned = await adapter.cleanupTaskBranch(req.params.taskId);
      sendSuccess(res, {
        taskId: req.params.taskId,
        adapterId: req.params.adapterId,
        cleaned,
      });
    } catch (err) {
      logger.error(
        { err, adapterId: req.params.adapterId, taskId: req.params.taskId },
        'unhandled error in DELETE /api/a2a/git-adapters/:adapterId/tasks/:taskId',
      );
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while cleaning up task branch',
      }));
    }
  },
);
