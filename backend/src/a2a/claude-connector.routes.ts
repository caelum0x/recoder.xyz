/**
 * @module claude-connector.routes
 *
 * Express route handlers for the Claude Code MCP Connector REST API.
 *
 * Provides the following endpoints (mounted under `/api/a2a/connectors/claude`):
 *
 * | Method | Path       | Description                                         |
 * |--------|------------|-----------------------------------------------------|
 * | POST   | /execute   | Execute a task via Claude Code MCP tool call         |
 * | GET    | /status    | Get connector runtime status                        |
 * | GET    | /tools     | List discovered MCP tools                           |
 * | POST   | /start     | Start the Claude Code MCP server process             |
 * | POST   | /stop      | Stop the Claude Code MCP server process              |
 * | POST   | /restart   | Restart the Claude Code MCP server process            |
 * | POST   | /tools/refresh | Re-discover tools from the running MCP server    |
 * | POST   | /call      | Direct tool call (low-level MCP tools/call)          |
 * | GET    | /task/:taskId       | Get task status by ID                       |
 * | POST   | /task/:taskId/cancel| Cancel a running task                       |
 * | POST   | /approval/:approvalId | Respond to an approval request            |
 */

import { Router, type Request, type Response } from 'express';
import type { InstructionBundle } from '@recoder/a2a-sdk';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '@recoder/shared/a2a';
import {
  getClaudeConnectorRuntime,
  type ExecuteTaskInput,
} from './claude-connector-runtime.service';
import { getTaskLifecycleService, generateId } from './task-lifecycle.service';
import { parseJsonTextBody } from './task-lifecycle.middleware';
import { getA2ASloMetrics } from './slo-metrics';
import { withConnectorRetry } from './connector-retry';
import { createLogger } from '../logger';

const logger = createLogger('claude-connector-routes');

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

export const claudeConnectorRouter = Router();

// Parse JSON text body (since /api/a2a uses express.text())
claudeConnectorRouter.use(parseJsonTextBody);

// ---------------------------------------------------------------------------
// POST /execute -- Execute a task via Claude Code
// ---------------------------------------------------------------------------

claudeConnectorRouter.post('/execute', async (req: Request, res: Response) => {
  let executionStartedAt: number | null = null;
  try {
    const runtime = getClaudeConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Claude Code MCP connector is not running. Start it first via POST /start.',
      }));
      return;
    }

    const { prompt, taskId, toolName, toolArgs, requester, artifacts } = req.body || {};
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
          platform: requester?.platform || 'recoder_app',
          name: requester?.name || 'API Caller',
        },
        assignee: {
          agent_id: 'claude-code-connector',
          platform: 'claude_code',
          name: 'Claude Code MCP Connector',
        },
        connector: {
          connector_id: 'claude-code-mcp',
          platform: 'claude_code',
          protocol: 'mcp',
        },
        payload: { kind: 'text', text: effectivePrompt },
        tags: ['claude-connector'],
      });

      if (!createResult.ok) {
        sendError(res, createResult.httpStatus, createResult.error);
        return;
      }

      effectiveTaskId = createResult.data.id;
    }

    const input: ExecuteTaskInput = {
      taskId: effectiveTaskId,
      prompt: effectivePrompt,
      instructionBundle,
      toolName,
      toolArgs,
      workspaceId: req.body.workspace_id,
      threadId: req.body.thread_id,
      requester: {
        id: requester?.id || 'api-caller',
        name: requester?.name || 'API Caller',
        platform: requester?.platform || 'recoder_app',
      },
      artifacts,
    };

    executionStartedAt = Date.now();
    const result = await withConnectorRetry(() => runtime.executeTask(input));
    getA2ASloMetrics().recordConnectorExecution({
      connectorId: 'claude',
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
        connectorId: 'claude',
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

claudeConnectorRouter.get('/status', (_req: Request, res: Response) => {
  try {
    const runtime = getClaudeConnectorRuntime();
    const state = runtime.getState();

    sendSuccess(res, {
      connector: 'claude-code-mcp',
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
// GET /tools -- List discovered MCP tools
// ---------------------------------------------------------------------------

claudeConnectorRouter.get('/tools', (_req: Request, res: Response) => {
  try {
    const runtime = getClaudeConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Claude Code MCP connector is not running. Start it first to discover tools.',
      }));
      return;
    }

    const tools = runtime.getTools();

    sendSuccess(res, {
      tools,
      count: tools.length,
    });
  } catch (err) {
    logger.error({ err }, 'Unhandled error in GET /tools');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: 'Internal server error while listing tools',
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /start -- Start Claude Code MCP server process
// ---------------------------------------------------------------------------

claudeConnectorRouter.post('/start', async (req: Request, res: Response) => {
  try {
    const runtime = getClaudeConnectorRuntime();

    if (runtime.isRunning()) {
      const state = runtime.getState();
      sendSuccess(res, {
        message: 'Claude Code MCP connector is already running',
        ...state,
      });
      return;
    }

    await runtime.start();

    // Register in agent registry after successful start
    runtime.registerWithAgentRegistry();

    const state = runtime.getState();

    sendSuccess(res, {
      message: 'Claude Code MCP connector started successfully',
      ...state,
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to start Claude connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to start Claude Code MCP connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /stop -- Stop Claude Code MCP server process
// ---------------------------------------------------------------------------

claudeConnectorRouter.post('/stop', async (_req: Request, res: Response) => {
  try {
    const runtime = getClaudeConnectorRuntime();

    if (!runtime.isRunning()) {
      sendSuccess(res, {
        message: 'Claude Code MCP connector is already stopped',
        ...runtime.getState(),
      });
      return;
    }

    await runtime.stop();

    sendSuccess(res, {
      message: 'Claude Code MCP connector stopped',
      ...runtime.getState(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to stop Claude connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to stop Claude Code MCP connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /restart -- Restart Claude Code MCP server process
// ---------------------------------------------------------------------------

claudeConnectorRouter.post('/restart', async (_req: Request, res: Response) => {
  try {
    const runtime = getClaudeConnectorRuntime();
    await runtime.restart();

    // Re-register after restart
    runtime.registerWithAgentRegistry();

    const state = runtime.getState();

    sendSuccess(res, {
      message: 'Claude Code MCP connector restarted successfully',
      ...state,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to restart Claude connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to restart Claude Code MCP connector: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /tools/refresh -- Re-discover tools from running server
// ---------------------------------------------------------------------------

claudeConnectorRouter.post('/tools/refresh', async (_req: Request, res: Response) => {
  try {
    const runtime = getClaudeConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Claude Code MCP connector is not running.',
      }));
      return;
    }

    const tools = await runtime.refreshTools();

    sendSuccess(res, {
      tools,
      count: tools.length,
      message: 'Tools refreshed successfully',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to refresh tools');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to refresh tools: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// POST /call -- Direct MCP tool call (low-level)
// ---------------------------------------------------------------------------

claudeConnectorRouter.post('/call', async (req: Request, res: Response) => {
  try {
    const runtime = getClaudeConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Claude Code MCP connector is not running.',
      }));
      return;
    }

    const { toolName, args } = req.body || {};

    if (!toolName || typeof toolName !== 'string') {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required field: toolName (string)',
        details: { missing_fields: ['toolName'] },
      }));
      return;
    }

    const result = await runtime.callTool(toolName, args || {});

    sendSuccess(res, {
      toolName,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err: message }, 'Failed to call tool');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Tool call failed: ${message}`,
    }));
  }
});

// ---------------------------------------------------------------------------
// GET /task/:taskId -- Get task status (parity with Codex connector)
// ---------------------------------------------------------------------------

claudeConnectorRouter.get('/task/:taskId', async (req: Request, res: Response) => {
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

claudeConnectorRouter.post('/task/:taskId/cancel', async (req: Request, res: Response) => {
  try {
    const runtime = getClaudeConnectorRuntime();
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
    const result = lifecycle.cancelTask(taskId, reason || 'Cancelled via Claude connector API');

    if (!result.ok) {
      sendError(res, result.httpStatus, result.error);
      return;
    }

    logger.info({ taskId, reason }, 'Task cancelled via Claude connector');

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

claudeConnectorRouter.post('/approval/:approvalId', async (req: Request, res: Response) => {
  try {
    const runtime = getClaudeConnectorRuntime();

    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'Claude Code MCP connector is not running.',
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

    // Claude Code MCP doesn't natively support approval workflows the way
    // Codex does, but we maintain parity by tracking approval state in the
    // task lifecycle and emitting an event that upstream orchestrators can
    // listen for.
    const lifecycle = getTaskLifecycleService();

    // Look up the task associated with this approval ID.
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
      logger.info({ approvalId, taskId, reason }, 'Approval granted for Claude connector task');
    } else {
      // Reject -- cancel the task
      lifecycle.cancelTask(taskId, reason || `Approval ${approvalId} denied`);
      runtime.emit('approval:denied', { approvalId, taskId, reason });
      logger.info({ approvalId, taskId, reason }, 'Approval denied for Claude connector task');
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
