/**
 * @module cursor-connector.routes
 *
 * Express route handlers for the Cursor IDE Connector REST API.
 *
 * Provides the following endpoints (mounted under `/api/a2a/connectors/cursor`):
 *
 * | Method | Path       | Description                                    |
 * |--------|------------|------------------------------------------------|
 * | POST   | /execute   | Execute a task via Cursor bridge                |
 * | GET    | /status    | Get connector runtime status                   |
 * | POST   | /start     | Start the Cursor bridge process                 |
 * | POST   | /stop      | Stop the Cursor bridge process                  |
 * | POST   | /restart   | Restart the Cursor bridge process                |
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
  getCursorConnectorRuntime,
  type CursorExecuteInput,
} from './cursor-connector-runtime.service';
import { getTaskLifecycleService, generateId } from './task-lifecycle.service';
import { parseJsonTextBody } from './task-lifecycle.middleware';
import { getA2ASloMetrics } from './slo-metrics';
import { withConnectorRetry } from './connector-retry';
import { createLogger } from '../logger';

const logger = createLogger('cursor-connector-routes');

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

export const cursorConnectorRouter = Router();

// Parse JSON text body (since /api/a2a uses express.text())
cursorConnectorRouter.use(parseJsonTextBody);

// ---------------------------------------------------------------------------
// POST /execute -- Execute a task via Cursor
// ---------------------------------------------------------------------------

cursorConnectorRouter.post('/execute', async (req: Request, res: Response) => {
  let executionStartedAt: number | null = null;
  try {
    const runtime = getCursorConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Cursor connector is not running. Start it first via POST /start.',
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
          platform: requester?.platform || 'recoder_app',
          name: requester?.name || 'API Caller',
        },
        assignee: {
          agent_id: 'cursor-connector',
          platform: 'cursor',
          name: 'Cursor IDE Connector',
        },
        connector: {
          connector_id: 'cursor-bridge',
          platform: 'cursor',
          protocol: 'jsonrpc',
        },
        payload: { kind: 'text', text: prompt },
        tags: ['cursor-connector'],
      });

      if (!createResult.ok) {
        sendError(res, createResult.httpStatus, createResult.error);
        return;
      }

      effectiveTaskId = createResult.data.id;
    }

    const input: CursorExecuteInput = {
      taskId: effectiveTaskId,
      prompt,
      requester: {
        id: requester?.id || 'api-caller',
        name: requester?.name || 'API Caller',
        platform: requester?.platform || 'recoder_app',
      },
      workspaceId: workspace_id,
      threadId: thread_id,
      artifacts,
    };

    executionStartedAt = Date.now();
    const result = await withConnectorRetry(() => runtime.executeTask(input));
    getA2ASloMetrics().recordConnectorExecution({
      connectorId: 'cursor',
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
        connectorId: 'cursor',
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

cursorConnectorRouter.get('/status', (_req: Request, res: Response) => {
  try {
    const runtime = getCursorConnectorRuntime();
    const state = runtime.getState();

    sendSuccess(res, {
      connector: 'cursor-bridge',
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
// POST /start -- Start Cursor bridge process
// ---------------------------------------------------------------------------

cursorConnectorRouter.post('/start', async (req: Request, res: Response) => {
  try {
    const runtime = getCursorConnectorRuntime();

    if (runtime.isRunning()) {
      const state = runtime.getState();
      sendSuccess(res, {
        message: 'Cursor connector is already running',
        ...state,
      });
      return;
    }

    await runtime.start();
    runtime.registerWithAgentRegistry();

    const state = runtime.getState();
    sendSuccess(res, {
      message: 'Cursor connector started successfully',
      ...state,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to start Cursor connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to start Cursor connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /stop -- Stop Cursor bridge process
// ---------------------------------------------------------------------------

cursorConnectorRouter.post('/stop', async (_req: Request, res: Response) => {
  try {
    const runtime = getCursorConnectorRuntime();

    if (!runtime.isRunning()) {
      sendSuccess(res, {
        message: 'Cursor connector is already stopped',
        ...runtime.getState(),
      });
      return;
    }

    await runtime.stop();
    sendSuccess(res, {
      message: 'Cursor connector stopped',
      ...runtime.getState(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to stop Cursor connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to stop Cursor connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /restart -- Restart Cursor bridge process
// ---------------------------------------------------------------------------

cursorConnectorRouter.post('/restart', async (_req: Request, res: Response) => {
  try {
    const runtime = getCursorConnectorRuntime();
    await runtime.restart();
    runtime.registerWithAgentRegistry();

    const state = runtime.getState();
    sendSuccess(res, {
      message: 'Cursor connector restarted successfully',
      ...state,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to restart Cursor connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to restart Cursor connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// GET /task/:taskId -- Get task status (parity with Codex connector)
// ---------------------------------------------------------------------------

cursorConnectorRouter.get('/task/:taskId', async (req: Request, res: Response) => {
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

cursorConnectorRouter.post('/task/:taskId/cancel', async (req: Request, res: Response) => {
  try {
    const runtime = getCursorConnectorRuntime();
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
    const result = lifecycle.cancelTask(taskId, reason || 'Cancelled via Cursor connector API');

    if (!result.ok) {
      sendError(res, result.httpStatus, result.error);
      return;
    }

    logger.info({ taskId, reason }, 'Task cancelled via Cursor connector');

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

cursorConnectorRouter.post('/approval/:approvalId', async (req: Request, res: Response) => {
  try {
    const runtime = getCursorConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Cursor connector is not running.',
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
      logger.info({ approvalId, taskId, reason }, 'Approval granted for Cursor connector task');
    } else {
      // Reject -- cancel the task
      lifecycle.cancelTask(taskId, reason || `Approval ${approvalId} denied`);
      runtime.emit('approval:denied', { approvalId, taskId, reason });
      logger.info({ approvalId, taskId, reason }, 'Approval denied for Cursor connector task');
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
