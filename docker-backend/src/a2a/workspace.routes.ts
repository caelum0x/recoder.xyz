/**
 * @module workspace.routes
 *
 * Express route handlers for A2A workspace management.
 *
 * | Method | Path                           | Description                |
 * |--------|--------------------------------|----------------------------|
 * | POST   | /                              | Create workspace           |
 * | GET    | /                              | List user workspaces       |
 * | GET    | /:wsId                         | Get workspace              |
 * | PATCH  | /:wsId                         | Update workspace           |
 * | DELETE | /:wsId                         | Delete workspace           |
 * | POST   | /:wsId/agents                  | Add agent                  |
 * | DELETE | /:wsId/agents/:agentId         | Remove agent               |
 * | GET    | /:wsId/agents                  | List agents with health    |
 * | GET    | /:wsId/channels                | List channels              |
 * | GET    | /:wsId/tasks                   | List tasks                 |
 * | GET    | /:wsId/run-history             | Unified run history (PM+Agents) |
 * | GET    | /:wsId/stream                  | SSE workspace event stream |
 */

import { Router, type Request, type Response } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '@recoder/shared/a2a';
import { getWorkspaceService } from './workspace.service';
import { getCollaborationSvc } from './collaboration.service';
import { getA2AEventBus } from './a2a-event-bus';
import { multiDispatchRouter } from './multi-dispatch.routes';
import { getWorktreeManagerService } from './worktree-manager.service';
import { getAgentBridgeService } from './agent-bridge.service';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { getApprovalGateService } from './approval-gate.service';
import {
  buildRunHistory,
  type RunHistoryFilter,
  type RunHistoryEntryType,
} from './run-history.service';
import { createLogger } from '../logger';

const logger = createLogger('a2a-workspace-routes');

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

export const workspaceRouter = Router();

// Parse JSON bodies
workspaceRouter.use((req: Request, _res: Response, next) => {
  if (req.headers['content-type']?.includes('application/json') && typeof req.body === 'string') {
    try {
      req.body = JSON.parse(req.body);
    } catch {
      // leave as-is
    }
  }
  next();
});

// ── POST / — Create workspace ────────────────────────────────────────────

workspaceRouter.post('/', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!body?.name || !body?.projectId) {
      return sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.InvalidParams,
        message: 'name and projectId are required',
      }));
    }

    const ws = getWorkspaceService().create({
      name: body.name,
      projectId: body.projectId,
      ownerId: body.ownerId ?? 'anonymous',
      memberAgentIds: body.memberAgentIds,
      settings: body.settings,
    });

    sendSuccess(res, ws, 201);
  } catch (err: any) {
    logger.error({ err }, 'failed to create workspace');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message || 'Failed to create workspace',
    }));
  }
});

// ── GET / — List workspaces ──────────────────────────────────────────────

workspaceRouter.get('/', (req: Request, res: Response) => {
  try {
    const ownerId = req.query.ownerId as string | undefined;
    const workspaces = getWorkspaceService().list(ownerId);
    sendSuccess(res, { workspaces, total: workspaces.length });
  } catch (err: any) {
    logger.error({ err }, 'failed to list workspaces');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message || 'Failed to list workspaces',
    }));
  }
});

// ── GET /:wsId — Get workspace ───────────────────────────────────────────

workspaceRouter.get('/:wsId', (req: Request, res: Response) => {
  try {
    const ws = getWorkspaceService().get(req.params.wsId);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }
    sendSuccess(res, ws);
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── PATCH /:wsId — Update workspace ──────────────────────────────────────

workspaceRouter.patch('/:wsId', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const ws = getWorkspaceService().update(req.params.wsId, body);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }
    sendSuccess(res, ws);
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── DELETE /:wsId — Delete workspace ─────────────────────────────────────

workspaceRouter.delete('/:wsId', (req: Request, res: Response) => {
  try {
    const deleted = getWorkspaceService().delete(req.params.wsId);
    if (!deleted) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }
    sendSuccess(res, { deleted: true });
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── POST /:wsId/agents — Add agent ──────────────────────────────────────

workspaceRouter.post('/:wsId/agents', (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body?.agentId) {
      return sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.InvalidParams,
        message: 'agentId is required',
      }));
    }

    const ws = getWorkspaceService().addAgent(req.params.wsId, body.agentId);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }
    sendSuccess(res, ws);
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── DELETE /:wsId/agents/:agentId — Remove agent ────────────────────────

workspaceRouter.delete('/:wsId/agents/:agentId', (req: Request, res: Response) => {
  try {
    const ws = getWorkspaceService().removeAgent(req.params.wsId, req.params.agentId);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }
    sendSuccess(res, ws);
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── GET /:wsId/agents — List agents with status ─────────────────────────

workspaceRouter.get('/:wsId/agents', (req: Request, res: Response) => {
  try {
    const agentIds = getWorkspaceService().listAgents(req.params.wsId);
    if (!agentIds) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }

    // Enrich agent IDs with bridge connection status
    const bridge = getAgentBridgeService();
    const agents = agentIds.map((agentId) => {
      const connected = bridge.getAgent(agentId);
      return {
        agentId,
        status: connected ? connected.status : 'offline',
        isLocal: !!connected,
        capabilities: connected?.capabilities ?? [],
        lastSeen: connected?.lastHeartbeat,
      };
    });

    sendSuccess(res, { agents, total: agents.length });
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── GET /:wsId/channels — List channels ─────────────────────────────────

workspaceRouter.get('/:wsId/channels', (req: Request, res: Response) => {
  try {
    const ws = getWorkspaceService().get(req.params.wsId);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }

    const channels = getCollaborationSvc().listChannels();
    sendSuccess(res, { channels, total: channels.length });
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── Multi-dispatch sub-router ────────────────────────────────────────────

workspaceRouter.use('/:wsId/dispatch', multiDispatchRouter);

// ── GET /:wsId/tasks — List tasks ───────────────────────────────────────

workspaceRouter.get('/:wsId/tasks', (req: Request, res: Response) => {
  try {
    const ws = getWorkspaceService().get(req.params.wsId);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }

    // Tasks are filtered by workspace_id in the task lifecycle service
    sendSuccess(res, { tasks: [], total: 0 });
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── GET /:wsId/run-history — Unified run history (PM + Agents) ───────────
//
// Read-only aggregation that merges every task's timeline (lifecycle,
// artifacts, PR, preview, approvals — via buildTaskTimeline) with the
// workspace audit trail (decisions + logs) into one ordered, queryable
// stream. Introduces no new storage; reuses the existing task-timeline
// read-model, the audit trail, and the approval gate. Both PM and Agents
// consume this endpoint identically.
//
// Query params:
//   task_id  — restrict to a single run/task within the workspace
//   types    — comma-separated entry types (task,artifact,pr,preview,
//              approval,audit,decision)
//   since    — ISO-8601 lower bound on entry timestamp
//   limit    — cap on number of returned entries (newest-trimmed)

const RUN_HISTORY_ENTRY_TYPES: readonly RunHistoryEntryType[] = [
  'task',
  'artifact',
  'pr',
  'preview',
  'approval',
  'audit',
  'decision',
];

workspaceRouter.get('/:wsId/run-history', (req: Request, res: Response) => {
  try {
    const { wsId } = req.params;

    const ws = getWorkspaceService().get(wsId);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${wsId}`,
      }));
    }

    const filter: RunHistoryFilter = {};
    if (typeof req.query.task_id === 'string' && req.query.task_id.trim()) {
      filter.taskId = req.query.task_id.trim();
    }
    if (typeof req.query.since === 'string' && req.query.since.trim()) {
      filter.since = req.query.since.trim();
    }
    if (typeof req.query.limit === 'string') {
      const parsed = parseInt(req.query.limit, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        filter.limit = Math.min(parsed, 5000);
      }
    }
    if (typeof req.query.types === 'string' && req.query.types.trim()) {
      const allowed = new Set<string>(RUN_HISTORY_ENTRY_TYPES);
      const requested = req.query.types
        .split(',')
        .map((t) => t.trim())
        .filter((t): t is RunHistoryEntryType => allowed.has(t));
      if (requested.length > 0) filter.types = requested;
    }

    const lifecycle = getTaskLifecycleService();
    const envelopes = lifecycle.list({ workspace_id: wsId, limit: 1000 });
    const approvals = getApprovalGateService().listForWorkspace(wsId);
    const auditEvents = lifecycle.getRecentAuditEvents(5000);

    const runHistory = buildRunHistory(wsId, envelopes, approvals, auditEvents, filter);

    sendSuccess(res, runHistory);
  } catch (err: any) {
    logger.error({ err, wsId: req.params.wsId }, 'failed to build workspace run history');
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err?.message ?? 'Internal server error while building run history',
    }));
  }
});

// ── Worktree routes ─────────────────────────────────────────────────────

// GET /:wsId/worktrees — List worktrees
workspaceRouter.get('/:wsId/worktrees', async (req: Request, res: Response) => {
  try {
    const ws = getWorkspaceService().get(req.params.wsId);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }

    // containerId comes from query param or workspace metadata
    const containerId = req.query.containerId as string;
    if (!containerId) {
      return sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.InvalidParams,
        message: 'containerId query parameter is required',
      }));
    }

    const worktrees = await getWorktreeManagerService().listWorktrees(containerId);
    sendSuccess(res, { worktrees, total: worktrees.length });
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// GET /:wsId/worktrees/:taskId/diff — Worktree diff
workspaceRouter.get('/:wsId/worktrees/:taskId/diff', async (req: Request, res: Response) => {
  try {
    const containerId = req.query.containerId as string;
    if (!containerId) {
      return sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.InvalidParams,
        message: 'containerId query parameter is required',
      }));
    }

    const diff = await getWorktreeManagerService().getWorktreeDiff(containerId, req.params.taskId);
    sendSuccess(res, { diff });
  } catch (err: any) {
    sendError(res, err.message?.includes('not found') ? 404 : 500, buildA2AError({
      code: err.message?.includes('not found') ? A2AErrorCodeEnum.TaskNotFound : A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// POST /:wsId/worktrees/:taskId/merge — Merge worktree to base
workspaceRouter.post('/:wsId/worktrees/:taskId/merge', async (req: Request, res: Response) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const containerId = body?.containerId ?? req.query.containerId;
    if (!containerId) {
      return sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.InvalidParams,
        message: 'containerId is required',
      }));
    }

    const strategy = body?.strategy ?? 'merge';
    const result = await getWorktreeManagerService().mergeWorktree(containerId, req.params.taskId, strategy);
    sendSuccess(res, result);
  } catch (err: any) {
    sendError(res, err.message?.includes('not found') ? 404 : 500, buildA2AError({
      code: err.message?.includes('not found') ? A2AErrorCodeEnum.TaskNotFound : A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// DELETE /:wsId/worktrees/:taskId — Cleanup worktree
workspaceRouter.delete('/:wsId/worktrees/:taskId', async (req: Request, res: Response) => {
  try {
    const containerId = req.query.containerId as string;
    if (!containerId) {
      return sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.InvalidParams,
        message: 'containerId query parameter is required',
      }));
    }

    await getWorktreeManagerService().cleanupWorktree(containerId, req.params.taskId);
    sendSuccess(res, { removed: true });
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── GET /:wsId/stream — SSE workspace event stream ──────────────────────

workspaceRouter.get('/:wsId/stream', (req: Request, res: Response) => {
  const wsId = req.params.wsId;
  const ws = getWorkspaceService().get(wsId);
  if (!ws) {
    return sendError(res, 404, buildA2AError({
      code: A2AErrorCodeEnum.TaskNotFound,
      message: `Workspace not found: ${wsId}`,
    }));
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  // Subscribe to workspace-scoped events
  const bus = getA2AEventBus();
  const unsubscribe = bus.subscribeWorkspace(wsId, (event) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  // Also subscribe to global events that are relevant to this workspace's agents
  const unsubGlobal = bus.subscribeGlobal((event) => {
    // Forward task/agent events relevant to workspace members
    if (event.workspaceId === wsId) return; // already sent via workspace subscription
    const data = event.data as Record<string, unknown>;
    const agentId = (data.agentId ?? data.assignee_agent_id ?? '') as string;
    if (agentId && ws.memberAgentIds.includes(agentId)) {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  });

  // Keep-alive ping
  const keepAlive = setInterval(() => {
    res.write(':ping\n\n');
  }, 30_000);

  // Cleanup on close
  req.on('close', () => {
    unsubscribe();
    unsubGlobal();
    clearInterval(keepAlive);
    logger.debug({ wsId }, 'workspace SSE stream closed');
  });

  logger.debug({ wsId }, 'workspace SSE stream opened');
});
