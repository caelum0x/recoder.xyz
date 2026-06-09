/**
 * @module codex-connector.routes
 *
 * Express route handlers for the OpenAI Codex CLI Connector REST API.
 *
 * Provides the following endpoints (mounted under `/api/a2a/connectors/codex`):
 *
 * | Method | Path           | Description                                         |
 * |--------|----------------|-----------------------------------------------------|
 * | POST   | /execute       | Execute a task via Codex CLI JSON-RPC                |
 * | GET    | /status        | Get connector runtime status                        |
 * | POST   | /start         | Start the Codex CLI process                          |
 * | POST   | /stop          | Stop the Codex CLI process                           |
 * | POST   | /restart       | Restart the Codex CLI process                        |
 * | GET    | /task/:taskId  | Get task status from Codex                           |
 * | POST   | /task/:taskId/cancel | Cancel a running task                          |
 * | POST   | /approval/:id  | Respond to an approval request                      |
 */

import { Router, type Request, type Response } from 'express';
import type { InstructionBundle } from '@recoder/a2a-sdk';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '@recoder/shared/a2a';
import {
  getCodexConnectorRuntime,
  type CodexExecuteInput,
} from './codex-connector-runtime.service';
import { getTaskLifecycleService, generateId } from './task-lifecycle.service';
import { parseJsonTextBody } from './task-lifecycle.middleware';
import { getA2ASloMetrics } from './slo-metrics';
import { withConnectorRetry } from './connector-retry';
import { createLogger } from '../logger';

const logger = createLogger('codex-connector-routes');

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

function readInstructionBundle(value: unknown): InstructionBundle | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return typeof (value as Record<string, unknown>).agent_specific_prompt === 'string'
    ? (value as InstructionBundle)
    : undefined;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const codexConnectorRouter = Router();

// Parse JSON text body (since /api/a2a uses express.text())
codexConnectorRouter.use(parseJsonTextBody);

// ---------------------------------------------------------------------------
// POST /execute -- Execute a task via Codex CLI
// ---------------------------------------------------------------------------

codexConnectorRouter.post('/execute', async (req: Request, res: Response) => {
  let executionStartedAt: number | null = null;
  try {
    const runtime = getCodexConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Codex CLI connector is not running. Start it first via POST /start.',
      }));
      return;
    }

    const { prompt, taskId, requester, artifacts } = req.body || {};
    const instructionBundle = readInstructionBundle(req.body?.instructionBundle);
    const effectivePrompt =
      typeof prompt === 'string' && prompt.trim().length > 0
        ? prompt
        : instructionBundle?.agent_specific_prompt;

    if (!effectivePrompt) {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required field: prompt (string) or instructionBundle.agent_specific_prompt',
        details: { missing_fields: ['prompt', 'instructionBundle.agent_specific_prompt'] },
      }));
      return;
    }

    // Create a task in the lifecycle service if no taskId is provided
    const lifecycle = getTaskLifecycleService();
    let effectiveTaskId = taskId;

    if (!effectiveTaskId) {
      const createResult = lifecycle.createTask({
        workspace_id: req.body.workspace_id || 'default',
        thread_id: req.body.thread_id || generateId('thr'),
        requester: {
          agent_id: requester?.id || 'api-caller',
          platform: requester?.platform || 'recoder_web',
          name: requester?.name || 'API Caller',
        },
        assignee: {
          agent_id: 'codex-connector',
          platform: 'codex',
          name: 'OpenAI Codex CLI Connector',
        },
        connector: {
          connector_id: 'codex-cli',
          platform: 'codex',
          protocol: 'jsonrpc',
        },
        payload: { kind: 'text', text: effectivePrompt },
        tags: ['codex-connector'],
      });

      if (!createResult.ok) {
        sendError(res, createResult.httpStatus, createResult.error);
        return;
      }

      effectiveTaskId = createResult.data.id;
    }

    const input: CodexExecuteInput = {
      taskId: effectiveTaskId,
      prompt: effectivePrompt,
      instructionBundle,
      workspaceId: req.body.workspace_id,
      threadId: req.body.thread_id,
      requester: {
        id: requester?.id || 'api-caller',
        name: requester?.name || 'API Caller',
        platform: requester?.platform || 'recoder_web',
      },
      artifacts,
    };

    executionStartedAt = Date.now();
    const result = await withConnectorRetry(() => runtime.executeTask(input));
    getA2ASloMetrics().recordConnectorExecution({
      connectorId: 'codex',
      success: result.success,
      durationMs: Date.now() - executionStartedAt,
    });

    if (result.success) {
      sendSuccess(res, {
        taskId: result.taskId,
        resultText: result.resultText,
        artifacts: result.artifacts,
        raw: result.raw,
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
        connectorId: 'codex',
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

codexConnectorRouter.get('/status', (_req: Request, res: Response) => {
  try {
    const runtime = getCodexConnectorRuntime();
    const state = runtime.getState();

    sendSuccess(res, {
      connector: 'codex-cli',
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
// POST /start -- Start Codex CLI process
// ---------------------------------------------------------------------------

codexConnectorRouter.post('/start', async (req: Request, res: Response) => {
  try {
    const runtime = getCodexConnectorRuntime();

    if (runtime.isRunning()) {
      const state = runtime.getState();
      sendSuccess(res, {
        message: 'Codex CLI connector is already running',
        ...state,
      });
      return;
    }

    await runtime.start();

    const state = runtime.getState();

    sendSuccess(res, {
      message: 'Codex CLI connector started successfully',
      ...state,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to start Codex connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to start Codex CLI connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /stop -- Stop Codex CLI process
// ---------------------------------------------------------------------------

codexConnectorRouter.post('/stop', async (_req: Request, res: Response) => {
  try {
    const runtime = getCodexConnectorRuntime();

    if (!runtime.isRunning()) {
      sendSuccess(res, {
        message: 'Codex CLI connector is already stopped',
        ...runtime.getState(),
      });
      return;
    }

    await runtime.stop();

    sendSuccess(res, {
      message: 'Codex CLI connector stopped',
      ...runtime.getState(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to stop Codex connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to stop Codex CLI connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /restart -- Restart Codex CLI process
// ---------------------------------------------------------------------------

codexConnectorRouter.post('/restart', async (_req: Request, res: Response) => {
  try {
    const runtime = getCodexConnectorRuntime();
    await runtime.restart();

    const state = runtime.getState();

    sendSuccess(res, {
      message: 'Codex CLI connector restarted successfully',
      ...state,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to restart Codex connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to restart Codex CLI connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// GET /task/:taskId -- Get task status from Codex
// ---------------------------------------------------------------------------

codexConnectorRouter.get('/task/:taskId', async (req: Request, res: Response) => {
  try {
    const runtime = getCodexConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Codex CLI connector is not running.',
      }));
      return;
    }

    const { taskId } = req.params;

    if (!taskId) {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required parameter: taskId',
      }));
      return;
    }

    const status = await runtime.getTaskStatus(taskId);

    sendSuccess(res, {
      taskId,
      status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message, taskId: req.params.taskId }, 'Failed to get task status');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to get task status: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /task/:taskId/cancel -- Cancel a running task
// ---------------------------------------------------------------------------

codexConnectorRouter.post('/task/:taskId/cancel', async (req: Request, res: Response) => {
  try {
    const runtime = getCodexConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Codex CLI connector is not running.',
      }));
      return;
    }

    const { taskId } = req.params;

    if (!taskId) {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required parameter: taskId',
      }));
      return;
    }

    const result = await runtime.cancelTask(taskId);

    sendSuccess(res, {
      taskId,
      cancelled: true,
      result,
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
// POST /approval/:approvalId -- Respond to an approval request
// ---------------------------------------------------------------------------

codexConnectorRouter.post('/approval/:approvalId', async (req: Request, res: Response) => {
  try {
    const runtime = getCodexConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Codex CLI connector is not running.',
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

    const result = await runtime.respondToApproval(approvalId, approved, reason);

    sendSuccess(res, {
      approvalId,
      approved,
      result,
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
