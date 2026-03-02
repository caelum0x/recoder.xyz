/**
 * @module windsurf-connector.routes
 *
 * Express route handlers for the Windsurf IDE Connector REST API.
 *
 * Provides the following endpoints (mounted under `/api/a2a/connectors/windsurf`):
 *
 * | Method | Path       | Description                                    |
 * |--------|------------|------------------------------------------------|
 * | POST   | /execute   | Execute a task via Windsurf bridge              |
 * | GET    | /status    | Get connector runtime status                   |
 * | POST   | /start     | Start the Windsurf bridge process               |
 * | POST   | /stop      | Stop the Windsurf bridge process                |
 * | POST   | /restart   | Restart the Windsurf bridge process              |
 * | GET    | /task/:taskId          | Query task status                    |
 * | POST   | /task/:taskId/cancel   | Cancel a running task                |
 * | POST   | /approval/:approvalId  | Respond to an approval request       |
 *
 * NOTE: Tier-2 scaffold. Wire protocol methods are stubbed.
 */

import { Router, type Request, type Response } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '@recoder/shared/a2a';
import {
  getWindsurfConnectorRuntime,
  type WindsurfExecuteInput,
} from './windsurf-connector-runtime.service';
import { getTaskLifecycleService, generateId } from './task-lifecycle.service';
import { parseJsonTextBody } from './task-lifecycle.middleware';
import { getA2ASloMetrics } from './slo-metrics';
import { withConnectorRetry } from './connector-retry';
import { createLogger } from '../logger';

const logger = createLogger('windsurf-connector-routes');

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

interface SuccessResponse<T> {
  success: true;
  data: T;
}

interface ErrorResponse {
  success: false;
  error: A2AError;
}

function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: SuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(response);
}

function sendError(res: Response, httpStatus: number, error: A2AError): void {
  const response: ErrorResponse = { success: false, error };
  res.status(httpStatus).json(response);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const windsurfConnectorRouter = Router();

// Parse JSON text body (since /api/a2a uses express.text())
windsurfConnectorRouter.use(parseJsonTextBody);

// ---------------------------------------------------------------------------
// POST /execute -- Execute a task via Windsurf
// ---------------------------------------------------------------------------

windsurfConnectorRouter.post('/execute', async (req: Request, res: Response) => {
  let executionStartedAt: number | null = null;
  try {
    const runtime = getWindsurfConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Windsurf connector is not running. Start it first via POST /start.',
      }));
      return;
    }

    const { prompt, taskId, requester, workspace_id, thread_id, artifacts } = req.body || {};

    if (!prompt || typeof prompt !== 'string') {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required field: prompt (string)',
        details: { missing_fields: ['prompt'] },
      }));
      return;
    }

    // Create a task in the lifecycle service if no taskId is provided
    const lifecycle = getTaskLifecycleService();
    let effectiveTaskId = taskId;

    if (!effectiveTaskId) {
      const createResult = lifecycle.createTask({
        workspace_id: workspace_id || 'default',
        thread_id: thread_id || generateId('thr'),
        requester: {
          agent_id: requester?.id || 'api-caller',
          platform: requester?.platform || 'recoder_web',
          name: requester?.name || 'API Caller',
        },
        assignee: {
          agent_id: 'windsurf-connector',
          platform: 'windsurf',
          name: 'Windsurf IDE Connector',
        },
        connector: {
          connector_id: 'windsurf-bridge',
          platform: 'windsurf',
          protocol: 'jsonrpc',
        },
        payload: { kind: 'text', text: prompt },
        tags: ['windsurf-connector'],
      });

      if (!createResult.ok) {
        sendError(res, createResult.httpStatus, createResult.error);
        return;
      }

      effectiveTaskId = createResult.data.id;
    }

    const input: WindsurfExecuteInput = {
      taskId: effectiveTaskId,
      prompt,
      requester: {
        id: requester?.id || 'api-caller',
        name: requester?.name || 'API Caller',
        platform: requester?.platform || 'recoder_web',
      },
      workspaceId: workspace_id,
      threadId: thread_id,
      artifacts,
    };

    executionStartedAt = Date.now();
    const result = await withConnectorRetry(() => runtime.executeTask(input));
    getA2ASloMetrics().recordConnectorExecution({
      connectorId: 'windsurf',
      success: result.success,
      durationMs: Date.now() - executionStartedAt,
    });

    if (result.success) {
      sendSuccess(res, {
        taskId: result.taskId,
        resultText: result.resultText,
        artifacts: result.artifacts,
        envelope: result.envelope,
      });
    } else {
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorError,
        message: result.error || 'Task execution failed',
        details: { taskId: result.taskId },
      }));
    }
  } catch (err) {
    if (executionStartedAt !== null) {
      getA2ASloMetrics().recordConnectorExecution({
        connectorId: 'windsurf',
        success: false,
        durationMs: Date.now() - executionStartedAt,
      });
    }
    logger.error({ err }, 'Unhandled error in POST /execute');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: 'Internal server error during task execution',
    }));
  }
});

// ---------------------------------------------------------------------------
// GET /status -- Connector runtime status
// ---------------------------------------------------------------------------

windsurfConnectorRouter.get('/status', (_req: Request, res: Response) => {
  try {
    const runtime = getWindsurfConnectorRuntime();
    const state = runtime.getState();

    sendSuccess(res, {
      connector: 'windsurf-bridge',
      tier: 'tier-2',
      ...state,
    });
  } catch (err) {
    logger.error({ err }, 'Unhandled error in GET /status');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: 'Internal server error while fetching connector status',
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /start -- Start Windsurf bridge process
// ---------------------------------------------------------------------------

windsurfConnectorRouter.post('/start', async (req: Request, res: Response) => {
  try {
    const runtime = getWindsurfConnectorRuntime();

    if (runtime.isRunning()) {
      const state = runtime.getState();
      sendSuccess(res, {
        message: 'Windsurf connector is already running',
        ...state,
      });
      return;
    }

    await runtime.start();
    runtime.registerWithAgentRegistry();

    const state = runtime.getState();
    sendSuccess(res, {
      message: 'Windsurf connector started successfully',
      ...state,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to start Windsurf connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to start Windsurf connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /stop -- Stop Windsurf bridge process
// ---------------------------------------------------------------------------

windsurfConnectorRouter.post('/stop', async (_req: Request, res: Response) => {
  try {
    const runtime = getWindsurfConnectorRuntime();

    if (!runtime.isRunning()) {
      sendSuccess(res, {
        message: 'Windsurf connector is already stopped',
        ...runtime.getState(),
      });
      return;
    }

    await runtime.stop();
    sendSuccess(res, {
      message: 'Windsurf connector stopped',
      ...runtime.getState(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to stop Windsurf connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to stop Windsurf connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /restart -- Restart Windsurf bridge process
// ---------------------------------------------------------------------------

windsurfConnectorRouter.post('/restart', async (_req: Request, res: Response) => {
  try {
    const runtime = getWindsurfConnectorRuntime();
    await runtime.restart();
    runtime.registerWithAgentRegistry();

    const state = runtime.getState();
    sendSuccess(res, {
      message: 'Windsurf connector restarted successfully',
      ...state,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to restart Windsurf connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to restart Windsurf connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// GET /task/:taskId -- Get task status (parity with Codex connector)
// ---------------------------------------------------------------------------

windsurfConnectorRouter.get('/task/:taskId', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    if (!taskId) {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required parameter: taskId',
      }));
      return;
    }

    const lifecycle = getTaskLifecycleService();
    const result = lifecycle.getTask(taskId);

    if (!result.ok) {
      sendError(res, result.httpStatus, result.error);
      return;
    }

    const envelope = result.data;
    sendSuccess(res, {
      taskId,
      state: envelope.state,
      connector: envelope.connector,
      result: envelope.result,
      error: envelope.error,
      createdAt: envelope.created_at,
      updatedAt: envelope.updated_at,
      history: envelope.history,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, taskId: req.params.taskId }, 'Failed to get task status');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: `Failed to get task status: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /task/:taskId/cancel -- Cancel a running task (parity with Codex)
// ---------------------------------------------------------------------------

windsurfConnectorRouter.post('/task/:taskId/cancel', async (req: Request, res: Response) => {
  try {
    const runtime = getWindsurfConnectorRuntime();
    const { taskId } = req.params;
    const { reason } = req.body || {};

    if (!taskId) {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required parameter: taskId',
      }));
      return;
    }

    // Transition the task to cancelled via lifecycle service
    const lifecycle = getTaskLifecycleService();
    const result = lifecycle.cancelTask(taskId, reason || 'Cancelled via Windsurf connector API');

    if (!result.ok) {
      sendError(res, result.httpStatus, result.error);
      return;
    }

    logger.info({ taskId, reason }, 'Task cancelled via Windsurf connector');

    sendSuccess(res, {
      taskId,
      cancelled: true,
      state: result.data.state,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, taskId: req.params.taskId }, 'Failed to cancel task');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to cancel task: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /approval/:approvalId -- Respond to an approval request (parity with Codex)
// ---------------------------------------------------------------------------

windsurfConnectorRouter.post('/approval/:approvalId', async (req: Request, res: Response) => {
  try {
    const runtime = getWindsurfConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Windsurf connector is not running.',
      }));
      return;
    }

    const { approvalId } = req.params;
    const { approved, reason } = req.body || {};

    if (!approvalId) {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required parameter: approvalId',
      }));
      return;
    }

    if (typeof approved !== 'boolean') {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required field: approved (boolean)',
        details: { missing_fields: ['approved'] },
      }));
      return;
    }

    const lifecycle = getTaskLifecycleService();

    // Convention: approvalId is either the taskId itself or prefixed with the taskId.
    const taskId = approvalId.includes(':') ? approvalId.split(':')[0] : approvalId;
    const taskResult = lifecycle.getTask(taskId);

    if (!taskResult.ok) {
      sendError(res, taskResult.httpStatus, taskResult.error);
      return;
    }

    if (approved) {
      // Resume the task -- emit event for orchestrator to pick up
      runtime.emit('approval:granted', { approvalId, taskId, reason });
      logger.info({ approvalId, taskId, reason }, 'Approval granted for Windsurf connector task');
    } else {
      // Reject -- cancel the task
      lifecycle.cancelTask(taskId, reason || `Approval ${approvalId} denied`);
      runtime.emit('approval:denied', { approvalId, taskId, reason });
      logger.info({ approvalId, taskId, reason }, 'Approval denied for Windsurf connector task');
    }

    sendSuccess(res, {
      approvalId,
      approved,
      taskId,
      result: approved ? 'resumed' : 'cancelled',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, approvalId: req.params.approvalId }, 'Failed to respond to approval');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to respond to approval: ${message}`,
    }));
  }
});
