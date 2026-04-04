/**
 * @module opencode-connector.routes
 *
 * REST API surface for the experimental OpenCode connector.
 */

import { Router, type Request, type Response } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
  type RecoderAgentPlatform,
} from '@recoder/shared/a2a';
import {
  getOpencodeConnectorRuntime,
  type OpencodeExecuteInput,
} from './opencode-connector-runtime.service';
import { getTaskLifecycleService, generateId } from './task-lifecycle.service';
import { parseJsonTextBody } from './task-lifecycle.middleware';
import { getA2ASloMetrics } from './slo-metrics';
import { withConnectorRetry } from './connector-retry';
import { createLogger } from '../logger';

const logger = createLogger('opencode-connector-routes');

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

function readProviderKeys(body: Record<string, unknown>): OpencodeExecuteInput['providerKeys'] {
  const candidate = body.providerKeys ?? body.provider_keys;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return undefined;
  }

  const record = candidate as Record<string, unknown>;
  const output: NonNullable<OpencodeExecuteInput['providerKeys']> = {};

  if (typeof record.openrouter === 'string') output.openrouter = record.openrouter;
  if (typeof record.openai === 'string') output.openai = record.openai;
  if (typeof record.anthropic === 'string') output.anthropic = record.anthropic;
  if (typeof record.gemini === 'string') output.gemini = record.gemini;

  return Object.keys(output).length > 0 ? output : undefined;
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const record = Object.entries(value as Record<string, unknown>).filter(([, entry]) => typeof entry === 'string');
  if (record.length === 0) {
    return undefined;
  }

  return Object.fromEntries(record) as Record<string, string>;
}

function readRequesterPlatform(value: unknown): RecoderAgentPlatform {
  if (typeof value !== 'string') {
    return 'recoder_web';
  }

  switch (value) {
    case 'claude_code':
    case 'codex':
    case 'cursor':
    case 'windsurf':
    case 'replit':
    case 'recoder_web':
    case 'recoder_pm':
    case 'recoder_agency':
    case 'custom':
      return value;
    default:
      return 'recoder_web';
  }
}

function readProjectId(body: Record<string, unknown>): string | undefined {
  const candidate = body.projectId ?? body.project_id;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined;
}

export const opencodeConnectorRouter = Router();

opencodeConnectorRouter.use(parseJsonTextBody);

opencodeConnectorRouter.post('/execute', async (req: Request, res: Response) => {
  let executionStartedAt: number | null = null;

  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const prompt = body.prompt;
    const requester = (body.requester || {}) as Record<string, unknown>;
    const taskId = typeof body.taskId === 'string' ? body.taskId : undefined;
    const requesterPlatform = readRequesterPlatform(requester.platform);
    const projectId = readProjectId(body);

    if (!prompt || typeof prompt !== 'string') {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required field: prompt (string)',
        details: { missing_fields: ['prompt'] },
      }));
      return;
    }

    const lifecycle = getTaskLifecycleService();
    let effectiveTaskId = taskId;

    if (!effectiveTaskId) {
      const createResult = lifecycle.createTask({
        workspace_id: typeof body.workspace_id === 'string' ? body.workspace_id : projectId || 'default',
        thread_id: typeof body.thread_id === 'string' ? body.thread_id : generateId('thr'),
        requester: {
          agent_id: typeof requester.id === 'string' ? requester.id : 'api-caller',
          platform: requesterPlatform,
          name: typeof requester.name === 'string' ? requester.name : 'API Caller',
        },
        assignee: {
          agent_id: 'opencode-connector',
          platform: 'custom',
          name: 'OpenCode Connector',
        },
        connector: {
          connector_id: 'opencode-cli',
          platform: 'custom',
          protocol: 'jsonrpc',
        },
        payload: { kind: 'text', text: prompt },
        tags: ['opencode-connector'],
      });

      if (!createResult.ok) {
        sendError(res, createResult.httpStatus, createResult.error);
        return;
      }

      effectiveTaskId = createResult.data.id;
    }

    if (projectId) {
      executionStartedAt = Date.now();

      try {
        // Route through centralized opencode service when available,
        // otherwise fall back to sandbox-embedded exec via /api/opencode/:projectId
        if (process.env.OPENCODE_SERVICE_URL) {
          const { promptProject, setProviderKey } = await import('./opencode-service-adapter.js');

          // Forward BYOK keys
          const keys = readProviderKeys(body);
          if (keys) {
            const keyEntries: Array<[string, string | undefined]> = [
              ['openrouter', keys.openrouter],
              ['openai', keys.openai],
              ['anthropic', keys.anthropic],
              ['google', keys.gemini],
            ];
            for (const [provider, key] of keyEntries) {
              if (key) await setProviderKey(provider, key).catch(() => {});
            }
          }

          const result = await promptProject(projectId, {
            content: prompt,
            agent: typeof body.model === 'string' ? body.model : undefined,
          });

          const textParts = result.parts
            .filter((p: Record<string, unknown>) => p.type === 'text' || p.type === 'tool-result')
            .map((p: Record<string, unknown>) => String(p.text || p.content || ''))
            .filter(Boolean);

          getA2ASloMetrics().recordConnectorExecution({
            connectorId: 'opencode',
            success: true,
            durationMs: Date.now() - executionStartedAt,
          });

          sendSuccess(res, {
            taskId: effectiveTaskId,
            resultText: textParts.join('\n\n'),
            sessionId: result.info.sessionID,
            raw: result,
          });
          return;
        }

        // Legacy fallback: self-fetch through /api/opencode/:projectId (sandbox exec path)
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const authHeader = req.headers.authorization;
        if (typeof authHeader === 'string' && authHeader.trim()) {
          headers.Authorization = authHeader;
        }

        const upstream = await fetch(`http://127.0.0.1:${process.env.PORT || '3100'}/api/opencode/${encodeURIComponent(projectId)}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt,
            model: typeof body.model === 'string' ? body.model : undefined,
            sessionId: typeof body.sessionId === 'string' ? body.sessionId : typeof body.session_id === 'string' ? body.session_id : undefined,
            continueSession: body.continueSession === true || body.continue_session === true,
            providerKeys: readProviderKeys(body),
          }),
        });

        const payload = await upstream.json().catch(async () => ({ error: await upstream.text().catch(() => 'Sandbox execution failed') })) as {
          success?: boolean;
          text?: string;
          sessionId?: string;
          output?: string;
          error?: string;
        };

        getA2ASloMetrics().recordConnectorExecution({
          connectorId: 'opencode',
          success: upstream.ok && payload.success !== false,
          durationMs: Date.now() - executionStartedAt,
        });

        if (upstream.ok && payload.success !== false) {
          sendSuccess(res, {
            taskId: effectiveTaskId,
            resultText: payload.text || payload.output || '',
            sessionId: payload.sessionId,
            raw: payload,
          });
          return;
        }

        sendError(res, upstream.status || 500, buildA2AError({
          code: upstream.status === 401
            ? A2AErrorCodeEnum.AuthenticationFailed
            : upstream.status === 403
              ? A2AErrorCodeEnum.AuthorizationDenied
              : A2AErrorCodeEnum.ConnectorError,
          message: payload.error || 'Sandbox-backed OpenCode execution failed',
          details: { taskId: effectiveTaskId, projectId },
        }));
        return;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        getA2ASloMetrics().recordConnectorExecution({
          connectorId: 'opencode',
          success: false,
          durationMs: Date.now() - executionStartedAt,
        });
        sendError(res, 500, buildA2AError({
          code: A2AErrorCodeEnum.ConnectorError,
          message: errMsg,
          details: { taskId: effectiveTaskId, projectId },
        }));
        return;
      }
    }

    const runtime = getOpencodeConnectorRuntime();
    if (!runtime.isRunning()) {
      sendError(res, 503, buildA2AError({
        code: A2AErrorCodeEnum.ConnectorUnavailable,
        message: 'OpenCode connector is not running. Start it first via POST /start.',
      }));
      return;
    }

    const input: OpencodeExecuteInput = {
      taskId: effectiveTaskId,
      prompt,
      workspaceId: typeof body.workspace_id === 'string' ? body.workspace_id : undefined,
      threadId: typeof body.thread_id === 'string' ? body.thread_id : undefined,
      cwd: typeof body.cwd === 'string' ? body.cwd : typeof body.directory === 'string' ? body.directory : undefined,
      model: typeof body.model === 'string' ? body.model : undefined,
      agent: typeof body.agent === 'string' ? body.agent : undefined,
      variant: typeof body.variant === 'string' ? body.variant : undefined,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : typeof body.session_id === 'string' ? body.session_id : undefined,
      continueSession: body.continueSession === true || body.continue_session === true,
      providerKeys: readProviderKeys(body),
      env: readStringRecord(body.env),
      requester: {
        id: typeof requester.id === 'string' ? requester.id : 'api-caller',
        name: typeof requester.name === 'string' ? requester.name : 'API Caller',
        platform: requesterPlatform,
      },
    };

    executionStartedAt = Date.now();
    const result = await withConnectorRetry(() => runtime.executeTask(input));
    getA2ASloMetrics().recordConnectorExecution({
      connectorId: 'opencode',
      success: result.success,
      durationMs: Date.now() - executionStartedAt,
    });

    if (result.success) {
      sendSuccess(res, {
        taskId: result.taskId,
        resultText: result.resultText,
        sessionId: result.sessionId,
        raw: result.raw,
      });
      return;
    }

    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: result.error || 'Task execution failed',
      details: { taskId: result.taskId },
    }));
  } catch (error) {
    if (executionStartedAt !== null) {
      getA2ASloMetrics().recordConnectorExecution({
        connectorId: 'opencode',
        success: false,
        durationMs: Date.now() - executionStartedAt,
      });
    }

    logger.error({ error }, 'Unhandled error in POST /execute for OpenCode');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: 'Internal server error during OpenCode task execution',
    }));
  }
});

opencodeConnectorRouter.get('/status', (_req: Request, res: Response) => {
  try {
    const runtime = getOpencodeConnectorRuntime();
    sendSuccess(res, {
      connector: 'opencode-cli',
      ...runtime.getState(),
    });
  } catch (error) {
    logger.error({ error }, 'Unhandled error in GET /status for OpenCode');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: 'Internal server error while fetching OpenCode connector status',
    }));
  }
});

opencodeConnectorRouter.post('/start', async (_req: Request, res: Response) => {
  try {
    const runtime = getOpencodeConnectorRuntime();

    if (runtime.isRunning()) {
      sendSuccess(res, {
        message: 'OpenCode connector is already running',
        ...runtime.getState(),
      });
      return;
    }

    await runtime.start();
    sendSuccess(res, {
      message: 'OpenCode connector started successfully',
      ...runtime.getState(),
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to start OpenCode connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to start OpenCode connector: ${message}`,
    }));
  }
});

opencodeConnectorRouter.post('/stop', async (_req: Request, res: Response) => {
  try {
    const runtime = getOpencodeConnectorRuntime();

    if (!runtime.isRunning()) {
      sendSuccess(res, {
        message: 'OpenCode connector is already stopped',
        ...runtime.getState(),
      });
      return;
    }

    await runtime.stop();
    sendSuccess(res, {
      message: 'OpenCode connector stopped successfully',
      ...runtime.getState(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to stop OpenCode connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to stop OpenCode connector: ${message}`,
    }));
  }
});

opencodeConnectorRouter.post('/restart', async (_req: Request, res: Response) => {
  try {
    const runtime = getOpencodeConnectorRuntime();
    await runtime.restart();
    sendSuccess(res, {
      message: 'OpenCode connector restarted successfully',
      ...runtime.getState(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to restart OpenCode connector');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to restart OpenCode connector: ${message}`,
    }));
  }
});

opencodeConnectorRouter.get('/task/:taskId', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId;
    if (!taskId) {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required path parameter: taskId',
      }));
      return;
    }

    const runtime = getOpencodeConnectorRuntime();
    const result = await runtime.getTaskStatus(taskId);
    sendSuccess(res, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to get OpenCode task status');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to get OpenCode task status: ${message}`,
    }));
  }
});

opencodeConnectorRouter.post('/task/:taskId/cancel', async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId;
    if (!taskId) {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required path parameter: taskId',
      }));
      return;
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const runtime = getOpencodeConnectorRuntime();
    const result = await runtime.cancelTask(taskId, reason);
    sendSuccess(res, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to cancel OpenCode task');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to cancel OpenCode task: ${message}`,
    }));
  }
});

opencodeConnectorRouter.post('/approval/:approvalId', async (req: Request, res: Response) => {
  try {
    const approvalId = req.params.approvalId;
    if (!approvalId) {
      sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.MissingEnvelopeField,
        message: 'Missing required path parameter: approvalId',
      }));
      return;
    }

    const approved = req.body?.approved === true;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
    const runtime = getOpencodeConnectorRuntime();
    const result = await runtime.respondToApproval(approvalId, approved, reason);
    sendSuccess(res, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to respond to OpenCode approval');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.ConnectorError,
      message: `Failed to respond to OpenCode approval: ${message}`,
    }));
  }
});
