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
import { getApprovalGateService } from './approval-gate.service';
import { getDelegationChainService, type DelegationRequest, type DelegationStatus } from './delegation-chain.service';
import { getAgentRegistryService } from './agent-registry.service';
import { getTaskLifecycleService } from './task-lifecycle.service';
import { buildTaskRunSummary } from './run-context.service';
import { createLogger } from '../logger';
import { listBridgeSessionsForBinding } from '../a2a-gateway';

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

function mapDelegationStatus(status: DelegationStatus): 'active' | 'accepted' | 'declined' | 'completed' {
  switch (status) {
    case 'accepted':
      return 'accepted';
    case 'completed':
      return 'completed';
    case 'rejected':
    case 'failed':
    case 'cancelled':
      return 'declined';
    case 'pending':
    case 'in-progress':
    default:
      return 'active';
  }
}

function inferWorkspaceIdForDelegation(delegation: DelegationRequest): string | null {
  const directWorkspace = delegation.metadata?.workspaceId;
  if (directWorkspace) return directWorkspace;

  const channelId = delegation.metadata?.channelId;
  if (!channelId) return null;

  const workspace = getWorkspaceService().list().find((ws) => ws.defaultChannelId === channelId);
  return workspace?.workspaceId || null;
}

function mapDelegationToHandoffRecord(delegation: DelegationRequest, workspaceId: string) {
  return {
    handoffId: delegation.delegationId,
    workspaceId,
    fromAgentId: delegation.fromAgentId,
    toAgentId: delegation.toAgentId,
    taskId: delegation.metadata?.sourceTaskId || delegation.metadata?.handoffSourceTaskId || '',
    intent: ((delegation.metadata?.intent as 'handoff' | 'delegate' | 'review' | undefined) || 'handoff'),
    context: delegation.metadata ? { ...delegation.metadata } : {},
    status: mapDelegationStatus(delegation.status),
    createdAt: delegation.createdAt,
  };
}

type WorkspaceHandoffRecord = ReturnType<typeof mapDelegationToHandoffRecord>;

async function buildWorkspaceAgentRows(workspaceId: string) {
  const agentIds = getWorkspaceService().listAgents(workspaceId);
  if (!agentIds) return null;

  const bridge = getAgentBridgeService();
  const registry = getAgentRegistryService();
  return agentIds.map((agentId) => {
    const connected = bridge.getAgent(agentId);
    const sessions = bridge.getSessionsForAgent(agentId);
    const registryAgent = registry.getWithHealth(agentId);
    const bridgeCapabilities = Array.from(new Set(sessions.flatMap((session) => session.capabilities)));
    const skillNames = registryAgent?.card.skills.map((skill) => skill.name) ?? [];
    const status = connected
      ? connected.status
      : registryAgent?.health.online
        ? 'online'
        : 'offline';
    return {
      agentId,
      name: registryAgent?.identity.name ?? agentId,
      platform: registryAgent?.identity.platform ?? 'custom',
      status,
      isLocal: sessions.length > 0,
      capabilities: bridgeCapabilities,
      skills: skillNames,
      lastSeen: connected?.lastHeartbeat ?? registryAgent?.health.lastHeartbeat ?? '',
      connectedSessionCount: sessions.length,
      registry: registryAgent
        ? {
            online: registryAgent.health.online,
            lastHeartbeat: registryAgent.health.lastHeartbeat,
            reconnectCount: registryAgent.lifecycle.reconnectCount,
            registrationCount: registryAgent.lifecycle.registrationCount,
          }
        : null,
    };
  });
}

async function buildWorkspaceTaskRows(workspaceId: string, limit = 200) {
  const rawTasks = getTaskLifecycleService().list({
    workspace_id: workspaceId,
    limit,
  });
  return Promise.all(rawTasks.map((task) => buildTaskRunSummary(task)));
}

function buildWorkspaceApprovalRows(workspaceId: string) {
  return getApprovalGateService().listByWorkspace(workspaceId);
}

function buildWorkspaceHandoffRows(workspaceId: string, activeOnly = false) {
  const activeStatuses: DelegationStatus[] = ['pending', 'accepted', 'in-progress'];
  const rawDelegations = getDelegationChainService().list({
    statuses: activeOnly ? activeStatuses : undefined,
  });

  return rawDelegations
    .map((delegation) => {
      const delegationWorkspaceId = inferWorkspaceIdForDelegation(delegation);
      return delegationWorkspaceId === workspaceId
        ? mapDelegationToHandoffRecord(delegation, delegationWorkspaceId)
        : null;
    })
    .filter((value): value is WorkspaceHandoffRecord => value !== null);
}

async function buildWorkspaceControlPlaneSnapshot(wsId: string) {
  const ws = getWorkspaceService().get(wsId);
  if (!ws) return null;

  const [agents, tasks, bridgeSessions] = await Promise.all([
    buildWorkspaceAgentRows(ws.workspaceId),
    buildWorkspaceTaskRows(ws.workspaceId),
    listBridgeSessionsForBinding({ workspaceId: ws.workspaceId }),
  ]);
  if (!agents) return null;

  const approvals = buildWorkspaceApprovalRows(ws.workspaceId);
  const handoffs = buildWorkspaceHandoffRows(ws.workspaceId);

  const tasksByState = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.state] = (acc[task.state] || 0) + 1;
    return acc;
  }, {});

  const summary = tasks.reduce(
    (acc, task) => {
      acc.totalTasks += 1;
      if (task.state === 'working' || task.state === 'input-required') {
        acc.activeTasks += 1;
      }
      acc.evidenceItems += typeof task.runtime?.evidenceCount === 'number' ? task.runtime.evidenceCount : 0;
      acc.previews += typeof task.runtime?.previewCount === 'number' ? task.runtime.previewCount : 0;
      acc.artifacts += typeof task.runtime?.artifactCount === 'number' ? task.runtime.artifactCount : 0;
      acc.logEvidence += typeof task.runtime?.logCount === 'number' ? task.runtime.logCount : 0;
      acc.runtimeEvidence += typeof task.runtime?.runtimeCount === 'number' ? task.runtime.runtimeCount : 0;
      return acc;
    },
    {
      totalAgents: agents.length,
      onlineAgents: agents.filter((agent) => agent.status !== 'offline').length,
      offlineAgents: agents.filter((agent) => agent.status === 'offline').length,
      localBridgeSessions: agents.reduce((sum, agent) => sum + agent.connectedSessionCount, 0),
      pairedBridgeSessions: bridgeSessions.length,
      totalTasks: 0,
      activeTasks: 0,
      tasksByState,
      pendingApprovals: approvals.filter((approval) => approval.status === 'pending' || approval.status === 'escalated').length,
      totalApprovals: approvals.length,
      activeHandoffs: handoffs.filter((handoff) => handoff.status === 'active' || handoff.status === 'accepted').length,
      totalHandoffs: handoffs.length,
      evidenceItems: 0,
      previews: 0,
      artifacts: 0,
      logEvidence: 0,
      runtimeEvidence: 0,
    },
  );

  return {
    workspace: ws,
    summary,
    agents,
    tasks,
    approvals,
    handoffs,
    bridgeSessions: bridgeSessions.map((session) => ({
      bridgeId: session.bridgeId,
      scope: session.scope || null,
      agentId: session.agentId || null,
      agentName: session.agentName || null,
      agentPlatform: session.agentPlatform || null,
      workspaceId: session.workspaceId || null,
      projectId: session.projectId || null,
      capabilities: session.capabilities || [],
      metadata: session.metadata || null,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      heartbeat: session.heartbeat,
    })),
  };
}

function buildWorkspaceContextPackageFromSnapshot(
  snapshot: NonNullable<Awaited<ReturnType<typeof buildWorkspaceControlPlaneSnapshot>>>,
) {
  return {
    contextVersion: '2026-05-12',
    workspace: {
      workspaceId: snapshot.workspace.workspaceId,
      name: snapshot.workspace.name,
      projectId: snapshot.workspace.projectId,
      ownerId: snapshot.workspace.ownerId,
      defaultChannelId: snapshot.workspace.defaultChannelId,
      settings: snapshot.workspace.settings,
      createdAt: snapshot.workspace.createdAt,
      updatedAt: snapshot.workspace.updatedAt,
    },
    summary: snapshot.summary,
    agents: snapshot.agents.map((agent) => ({
      agentId: agent.agentId,
      name: agent.name,
      platform: agent.platform,
      status: agent.status,
      capabilities: agent.capabilities,
      skills: agent.skills,
      lastSeen: agent.lastSeen,
      connectedSessionCount: agent.connectedSessionCount,
      isLocal: agent.isLocal,
    })),
    recentTasks: snapshot.tasks.slice(0, 20).map((task) => ({
      id: task.id,
      prompt: task.prompt,
      state: task.state,
      workspace_id: task.workspace_id,
      assignee_agent_id: task.assignee_agent_id,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      approvalStatus: task.approval?.status ?? null,
      handoffStatus: task.handoff?.status ?? null,
      runtime: task.runtime ?? null,
    })),
    pendingApprovals: snapshot.approvals
      .filter((approval) => approval.status === 'pending' || approval.status === 'escalated')
      .map((approval) => ({
        approvalId: approval.approvalId,
        taskId:
          typeof approval.details.sourceTaskId === 'string'
            ? approval.details.sourceTaskId
            : typeof approval.details.taskId === 'string'
              ? approval.details.taskId
              : null,
        status: approval.status,
        action: approval.action,
        requester: approval.requestingAgentId,
        target: approval.targetAgentId,
        createdAt: approval.createdAt,
      })),
    activeHandoffs: snapshot.handoffs
      .filter((handoff) => handoff.status === 'active' || handoff.status === 'accepted')
      .map((handoff) => ({
        handoffId: handoff.handoffId,
        taskId: handoff.taskId,
        fromAgentId: handoff.fromAgentId,
        toAgentId: handoff.toAgentId,
        intent: handoff.intent,
        status: handoff.status,
        createdAt: handoff.createdAt,
      })),
    bridgeSessions: snapshot.bridgeSessions.map((session) => ({
      bridgeId: session.bridgeId,
      agentId: session.agentId,
      agentName: session.agentName,
      agentPlatform: session.agentPlatform,
      workspaceId: session.workspaceId,
      projectId: session.projectId,
      capabilities: session.capabilities,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    })),
  };
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
    buildWorkspaceAgentRows(req.params.wsId).then((agents) => {
      if (!agents) {
        sendError(res, 404, buildA2AError({
          code: A2AErrorCodeEnum.TaskNotFound,
          message: `Workspace not found: ${req.params.wsId}`,
        }));
        return;
      }

      sendSuccess(res, { agents, total: agents.length });
    }).catch((err: any) => {
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: err.message,
      }));
    });
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── GET /:wsId/control-plane — Unified workspace control-plane snapshot ──

workspaceRouter.get('/:wsId/control-plane', async (req: Request, res: Response) => {
  try {
    const snapshot = await buildWorkspaceControlPlaneSnapshot(req.params.wsId);
    if (!snapshot) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }

    sendSuccess(res, snapshot);
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── GET /:wsId/context — Structured Recoder Space context package ───────

workspaceRouter.get('/:wsId/context', async (req: Request, res: Response) => {
  try {
    const snapshot = await buildWorkspaceControlPlaneSnapshot(req.params.wsId);
    if (!snapshot) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }

    sendSuccess(res, buildWorkspaceContextPackageFromSnapshot(snapshot));
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

workspaceRouter.get('/:wsId/tasks', async (req: Request, res: Response) => {
  try {
    const ws = getWorkspaceService().get(req.params.wsId);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }

    const tasks = await buildWorkspaceTaskRows(ws.workspaceId, Number(req.query.limit || 200));
    sendSuccess(res, { tasks, total: tasks.length });
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── GET /:wsId/approvals — List workspace approvals ─────────────────────

workspaceRouter.get('/:wsId/approvals', (req: Request, res: Response) => {
  try {
    const ws = getWorkspaceService().get(req.params.wsId);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }

    const statusQuery = String(req.query.status || '').trim().toLowerCase();
    const approvals = statusQuery === 'pending'
      ? getApprovalGateService().listPending(ws.workspaceId)
      : buildWorkspaceApprovalRows(ws.workspaceId);

    sendSuccess(res, { approvals, total: approvals.length });
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── GET /:wsId/handoffs — List workspace handoffs ───────────────────────

workspaceRouter.get('/:wsId/handoffs', (req: Request, res: Response) => {
  try {
    const ws = getWorkspaceService().get(req.params.wsId);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }

    const requestedStatus = String(req.query.status || '').trim().toLowerCase();
    const handoffs = buildWorkspaceHandoffRows(ws.workspaceId, requestedStatus === 'active');

    sendSuccess(res, { handoffs, total: handoffs.length });
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
    }));
  }
});

// ── POST /:wsId/handoffs — Create workspace handoff ─────────────────────

workspaceRouter.post('/:wsId/handoffs', (req: Request, res: Response) => {
  try {
    const ws = getWorkspaceService().get(req.params.wsId);
    if (!ws) {
      return sendError(res, 404, buildA2AError({
        code: A2AErrorCodeEnum.TaskNotFound,
        message: `Workspace not found: ${req.params.wsId}`,
      }));
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const fromAgentId = String(body?.fromAgentId || '').trim();
    const toAgentId = String(body?.toAgentId || '').trim();
    const taskId = String(body?.taskId || '').trim();
    const intent = String(body?.intent || 'handoff').trim().toLowerCase();
    const context = body?.context && typeof body.context === 'object' ? body.context : {};

    if (!fromAgentId || !toAgentId || !taskId) {
      return sendError(res, 400, buildA2AError({
        code: A2AErrorCodeEnum.InvalidParams,
        message: 'fromAgentId, toAgentId, and taskId are required',
      }));
    }

    const prompt =
      typeof (context as Record<string, unknown>).prompt === 'string' &&
      (context as Record<string, unknown>).prompt
        ? String((context as Record<string, unknown>).prompt)
        : `Continue ${intent} for task ${taskId}`;

    const delegation = getDelegationChainService().delegate({
      fromAgentId,
      toAgentId,
      prompt,
      metadata: {
        workspaceId: ws.workspaceId,
        projectId: ws.projectId,
        channelId: ws.defaultChannelId,
        sourceTaskId: taskId,
        intent: intent === 'delegate' || intent === 'review' ? intent : 'handoff',
      },
    });

    sendSuccess(res, mapDelegationToHandoffRecord(delegation, ws.workspaceId), 201);
  } catch (err: any) {
    sendError(res, 500, buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: err.message,
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
