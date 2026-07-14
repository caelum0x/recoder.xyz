/**
 * @module rest-adapter.routes
 *
 * Express route handlers for the REST Protocol Adapter management API.
 *
 * Provides the following endpoints under the `/api/a2a/adapters/rest` prefix:
 *
 * | Method | Path                       | Description                          |
 * |--------|----------------------------|--------------------------------------|
 * | POST   | /                          | Register a new REST adapter          |
 * | GET    | /                          | List all registered adapters         |
 * | GET    | /:adapterId                | Get adapter details                  |
 * | DELETE | /:adapterId                | Unregister an adapter                |
 * | POST   | /:adapterId/health-check   | Run health check on adapter          |
 * | POST   | /:adapterId/execute        | Execute a task via adapter           |
 *
 * All error responses use the canonical A2A error taxonomy.
 *
 * P17-009: REST Adapter Routes
 */

import { Router, type Request, type Response } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '@recoder/shared/a2a';
import { parseJsonTextBody } from '../task-lifecycle.middleware';
import { createLogger } from '../../logger';
import {
  RestAdapter,
  registerRestAdapter,
  getRestAdapter,
  listRestAdapters,
  unregisterRestAdapter,
  type RestAdapterConfig,
  type RestAuthMethod,
} from './rest-adapter';

const logger = createLogger('a2a-rest-adapter-routes');

// ---------------------------------------------------------------------------
// Default local identity for adapters created via the API
// ---------------------------------------------------------------------------

const DEFAULT_LOCAL_IDENTITY = {
  id: 'recoder-backend',
  name: 'Recoder Backend',
  platform: 'recoder',
} as const;

// ---------------------------------------------------------------------------
// Response helpers (matching collaboration.routes.ts pattern)
// ---------------------------------------------------------------------------

interface AdapterSuccessResponse<T> {
  success: true;
  data: T;
}

interface AdapterErrorResponse {
  success: false;
  error: A2AError;
}

function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: AdapterSuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(response);
}

function sendError(res: Response, httpStatus: number, error: A2AError): void {
  const response: AdapterErrorResponse = { success: false, error };
  res.status(httpStatus).json(response);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const restAdapterRouter = Router();

// Parse JSON text bodies (same pattern as collaboration routes -- the
// parent `/api/a2a` mount uses express.text() for raw verification).
restAdapterRouter.use(parseJsonTextBody);

// ---------------------------------------------------------------------------
// POST / -- Register a new REST adapter
// ---------------------------------------------------------------------------

restAdapterRouter.post(
  '/',
  (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const { adapterId, baseUrl, auth, timeoutMs, maxRetries, retryDelayMs, maxRetryDelayMs } = body;

      // Validate required fields
      if (!adapterId || typeof adapterId !== 'string' || adapterId.trim().length === 0) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'adapterId must be a non-empty string',
        }));
        return;
      }

      if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'baseUrl must be a non-empty string',
        }));
        return;
      }

      // Check for duplicate registration
      if (getRestAdapter(adapterId)) {
        sendError(res, 409, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: `REST adapter already registered with id: ${adapterId}`,
        }));
        return;
      }

      // Build adapter config
      const config: RestAdapterConfig = {
        adapterId: adapterId.trim(),
        baseUrl: baseUrl.trim(),
        auth: (auth as RestAuthMethod) ?? { type: 'none' },
        timeoutMs: typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30_000,
        maxRetries: typeof maxRetries === 'number' && maxRetries >= 0 ? maxRetries : 3,
        retryDelayMs: typeof retryDelayMs === 'number' && retryDelayMs > 0 ? retryDelayMs : 1_000,
        maxRetryDelayMs: typeof maxRetryDelayMs === 'number' && maxRetryDelayMs > 0 ? maxRetryDelayMs : 16_000,
        localIdentity: { ...DEFAULT_LOCAL_IDENTITY },
      };

      const adapter = new RestAdapter(config);
      registerRestAdapter(adapter);

      sendSuccess(res, adapter.getState(), 201);
    } catch (err) {
      logger.error({ err }, 'unhandled error in POST /api/a2a/adapters/rest');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while registering REST adapter',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET / -- List all registered adapters
// ---------------------------------------------------------------------------

restAdapterRouter.get(
  '/',
  (_req: Request, res: Response) => {
    try {
      const adapters = listRestAdapters().map((a) => a.getState());
      sendSuccess(res, { adapters, count: adapters.length });
    } catch (err) {
      logger.error({ err }, 'unhandled error in GET /api/a2a/adapters/rest');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while listing REST adapters',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:adapterId -- Get adapter details
// ---------------------------------------------------------------------------

restAdapterRouter.get(
  '/:adapterId',
  (req: Request, res: Response) => {
    try {
      const adapter = getRestAdapter(req.params.adapterId);

      if (!adapter) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ConnectorNotFound,
          message: `REST adapter not found: ${req.params.adapterId}`,
        }));
        return;
      }

      sendSuccess(res, adapter.getState());
    } catch (err) {
      logger.error({ err, adapterId: req.params.adapterId }, 'unhandled error in GET /api/a2a/adapters/rest/:adapterId');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while fetching REST adapter',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /:adapterId -- Unregister adapter
// ---------------------------------------------------------------------------

restAdapterRouter.delete(
  '/:adapterId',
  (req: Request, res: Response) => {
    try {
      const { adapterId } = req.params;

      // Check existence first
      if (!getRestAdapter(adapterId)) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ConnectorNotFound,
          message: `REST adapter not found: ${adapterId}`,
        }));
        return;
      }

      unregisterRestAdapter(adapterId);
      sendSuccess(res, { adapterId, unregistered: true });
    } catch (err) {
      logger.error({ err, adapterId: req.params.adapterId }, 'unhandled error in DELETE /api/a2a/adapters/rest/:adapterId');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while unregistering REST adapter',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:adapterId/health-check -- Run health check
// ---------------------------------------------------------------------------

restAdapterRouter.post(
  '/:adapterId/health-check',
  async (req: Request, res: Response) => {
    try {
      const adapter = getRestAdapter(req.params.adapterId);

      if (!adapter) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ConnectorNotFound,
          message: `REST adapter not found: ${req.params.adapterId}`,
        }));
        return;
      }

      const result = await adapter.checkHealth();
      sendSuccess(res, result);
    } catch (err) {
      logger.error({ err, adapterId: req.params.adapterId }, 'unhandled error in POST /api/a2a/adapters/rest/:adapterId/health-check');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while checking REST adapter health',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:adapterId/execute -- Execute a task via adapter
// ---------------------------------------------------------------------------

restAdapterRouter.post(
  '/:adapterId/execute',
  async (req: Request, res: Response) => {
    try {
      const adapter = getRestAdapter(req.params.adapterId);

      if (!adapter) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.ConnectorNotFound,
          message: `REST adapter not found: ${req.params.adapterId}`,
        }));
        return;
      }

      const body = req.body ?? {};
      const { taskId, prompt, targetAgent, intent, metadata } = body;

      // Validate required fields
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'prompt must be a non-empty string',
        }));
        return;
      }

      if (!targetAgent || typeof targetAgent !== 'object') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'targetAgent must be an object with id, name, and platform',
        }));
        return;
      }

      const result = await adapter.executeTask({
        targetAgent,
        taskId: taskId ?? `task-${Date.now()}`,
        prompt,
        intent,
        metadata,
      });

      sendSuccess(res, result);
    } catch (err) {
      logger.error({ err, adapterId: req.params.adapterId }, 'unhandled error in POST /api/a2a/adapters/rest/:adapterId/execute');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while executing task via REST adapter',
      }));
    }
  },
);
