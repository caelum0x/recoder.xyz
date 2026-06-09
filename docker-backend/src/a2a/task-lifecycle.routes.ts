/**
 * @module task-lifecycle.routes
 *
 * Express route handlers for A2A task lifecycle operations.
 *
 * Provides the following endpoints under the `/api/a2a/tasks` prefix:
 *
 * | Method | Path                          | Description                              |
 * |--------|-------------------------------|------------------------------------------|
 * | POST   | /                             | Create a new task (state: submitted)     |
 * | PATCH  | /:taskId/transition           | Transition task to a new state           |
 * | GET    | /:taskId                      | Get a task with full envelope            |
 * | GET    | /:taskId/history              | Get transition history for a task        |
 * | GET    | /                             | List tasks with optional filters         |
 * | POST   | /:taskId/execute              | Execute a task via Pi/OpenCode agent     |
 *
 * All error responses use the canonical A2A error taxonomy from
 * `@recoder/shared/a2a/schemas`.
 */

import { Router, type Request, type Response } from 'express';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
  type TaskArtifact,
  type TaskEnvelope,
  type TaskPreviewLink,
  type TaskRoutingHints,
} from '@recoder/shared/a2a';
import { getAgentBridgeService } from './agent-bridge.service';
import {
  getTaskLifecycleService,
  type CreateTaskInput,
  type TransitionTaskInput,
  type TaskListFilter,
} from './task-lifecycle.service';
import { buildTaskRunContext } from './run-context.service';
import { getWorkspaceService } from './workspace.service';
import { getAgentRegistryService } from './agent-registry.service';
import { getCapabilityMatcher } from './capability-matcher.service';
import { deriveRoutingPlan } from './multi-dispatch.service';
import { getApprovalGateService } from './approval-gate.service';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { getMemoryCandidateService, type MemoryCandidateScope } from './memory-candidate.service';
import {
  buildInstructionBundleArtifact,
  buildInstructionBundleMetadata,
  compileInstructionBundleForTask,
  INSTRUCTION_BUNDLE_TRIGGER,
} from './compiled-instructions';
import { getPreviewDeploymentService } from '../edge/preview-deployment.service';
import {
  validateCreateTaskBody,
  validateTransitionBody,
  loadTaskEnvelope,
  parseJsonTextBody,
} from './task-lifecycle.middleware';
import { createLogger } from '../logger';
import { getRecentContext } from './memory-store';

const logger = createLogger('a2a-task-routes');

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

interface A2ASuccessResponse<T> {
  success: true;
  data: T;
}

interface A2AErrorResponse {
  success: false;
  error: A2AError;
}

function sendSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const response: A2ASuccessResponse<T> = { success: true, data };
  res.status(statusCode).json(response);
}

function sendError(res: Response, httpStatus: number, error: A2AError): void {
  const response: A2AErrorResponse = { success: false, error };
  res.status(httpStatus).json(response);
}

function extractBridgePrompt(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }

  if (Array.isArray(payload)) {
    for (const part of payload) {
      const prompt = extractBridgePrompt(part);
      if (prompt) return prompt;
    }
    return '';
  }

  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const record = payload as Record<string, unknown>;
  if (record.kind === 'text' && typeof record.text === 'string') {
    return record.text;
  }
  if (typeof record.task === 'string') {
    return record.task;
  }
  if (typeof record.prompt === 'string') {
    return record.prompt;
  }
  if (typeof record.content === 'string') {
    return record.content;
  }

  return '';
}

function extractBridgeIntent(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  const intent = (payload as Record<string, unknown>).intent;
  return typeof intent === 'string' && intent.trim() ? intent : undefined;
}

function parseRoutingHints(value: unknown): TaskRoutingHints | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as TaskRoutingHints;
}

function deriveConnectorProtocol(platform: string): 'jsonrpc' | 'mcp' | 'rest' {
  if (platform === 'claude_code') return 'mcp';
  if (platform === 'codex' || platform === 'cursor' || platform === 'windsurf') return 'jsonrpc';
  return 'rest';
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseTaskArtifacts(value: unknown): TaskArtifact[] | null {
  if (!Array.isArray(value)) return null;
  const artifacts: TaskArtifact[] = [];

  for (const item of value) {
    const record = readRecord(item);
    if (!record) return null;
    if (
      typeof record.key !== 'string' ||
      typeof record.artifact_type !== 'string' ||
      typeof record.mime_type !== 'string' ||
      typeof record.content !== 'string'
    ) {
      return null;
    }

    artifacts.push({
      key: record.key,
      artifact_type: record.artifact_type as TaskArtifact['artifact_type'],
      mime_type: record.mime_type,
      content: record.content,
      ...(typeof record.path === 'string' ? { path: record.path } : {}),
      ...(readRecord(record.metadata) ? { metadata: readRecord(record.metadata) } : {}),
    });
  }

  return artifacts;
}

function buildPreviewArtifactContent(record: Record<string, unknown>): string {
  return JSON.stringify(record, null, 2);
}

function isMemoryCandidateScope(value: unknown): value is MemoryCandidateScope {
  return value === 'space' || value === 'repo' || value === 'user' || value === 'org';
}

function emitReviewLifecycleEvents(input: {
  taskId: string;
  workspaceId: string;
  metadataPatch: Record<string, unknown>;
  triggeredBy: string;
}): void {
  const review = readRecord(input.metadataPatch.handoff);
  const merge = readRecord(input.metadataPatch.merge);
  const now = new Date().toISOString();
  const bus = getA2AEventBus();

  if (review?.status === 'review-accepted') {
    bus.publish({
      id: `evt_${Date.now()}_review_${input.taskId}`,
      type: A2AEventType.ReviewAccepted,
      timestamp: now,
      taskId: input.taskId,
      workspaceId: input.workspaceId,
      data: {
        taskId: input.taskId,
        status: review.status,
        intent: typeof review.intent === 'string' ? review.intent : null,
        reviewTarget: typeof review.reviewTarget === 'string' ? review.reviewTarget : null,
        reviewPath: typeof review.reviewPath === 'string' ? review.reviewPath : null,
        assignedBy: typeof review.assignedBy === 'string' ? review.assignedBy : input.triggeredBy,
      },
    });
  }

  if (merge?.status === 'merge-requested') {
    bus.publish({
      id: `evt_${Date.now()}_merge_${input.taskId}`,
      type: A2AEventType.MergeRequested,
      timestamp: now,
      taskId: input.taskId,
      workspaceId: input.workspaceId,
      data: {
        taskId: input.taskId,
        status: merge.status,
        branchName: typeof merge.branchName === 'string' ? merge.branchName : null,
        baseBranch: typeof merge.baseBranch === 'string' ? merge.baseBranch : null,
        suggestedAction:
          typeof merge.suggestedAction === 'string' ? merge.suggestedAction : null,
        requestedBy: input.triggeredBy,
      },
    });
  }
}

function buildReviewHistoryEntries(input: {
  taskId: string;
  metadataPatch: Record<string, unknown>;
  triggeredBy: string;
  reason: string;
}): Array<Record<string, unknown>> {
  const review = readRecord(input.metadataPatch.handoff);
  const merge = readRecord(input.metadataPatch.merge);
  const now = new Date().toISOString();
  const entries: Array<Record<string, unknown>> = [];

  if (review?.status === 'review-accepted') {
    entries.push({
      at: now,
      type: 'review.accepted',
      taskId: input.taskId,
      actor: input.triggeredBy,
      status: review.status,
      intent: typeof review.intent === 'string' ? review.intent : null,
      reviewTarget: typeof review.reviewTarget === 'string' ? review.reviewTarget : null,
      reviewPath: typeof review.reviewPath === 'string' ? review.reviewPath : null,
      note: input.reason,
    });
  }

  if (merge?.status === 'merge-requested') {
    entries.push({
      at: now,
      type: 'merge.requested',
      taskId: input.taskId,
      actor: input.triggeredBy,
      status: merge.status,
      branchName: typeof merge.branchName === 'string' ? merge.branchName : null,
      baseBranch: typeof merge.baseBranch === 'string' ? merge.baseBranch : null,
      suggestedAction:
        typeof merge.suggestedAction === 'string' ? merge.suggestedAction : null,
      note: input.reason,
    });
  }

  return entries;
}

async function resolveAutoRouteAssignee(input: {
  workspaceId: string;
  payload: unknown;
  routingHints?: TaskRoutingHints;
}) {
  const workspace = getWorkspaceService().get(input.workspaceId);
  if (!workspace) {
    throw buildA2AError({
      code: A2AErrorCodeEnum.TaskNotFound,
      message: `Workspace not found: ${input.workspaceId}`,
    });
  }

  const prompt = extractBridgePrompt(input.payload);
  const routingPlan = deriveRoutingPlan(prompt, input.routingHints);
  const matcher = getCapabilityMatcher();
  const bridge = getAgentBridgeService();
  const registry = getAgentRegistryService();

  const ranked = matcher.matchAgents({
    ...routingPlan.requirements,
    tags: [],
  }).matches
    .filter((candidate) => workspace.memberAgentIds.includes(candidate.agentId))
    .map((candidate) => ({
      ...candidate,
      onlineBonus: bridge.isAgentOnline(candidate.agentId) ? 15 : 0,
      totalScore: candidate.score + (bridge.isAgentOnline(candidate.agentId) ? 15 : 0),
    }))
    .sort((a, b) => b.totalScore - a.totalScore);

  const fallbackAgentId =
    workspace.memberAgentIds.find((agentId) => bridge.isAgentOnline(agentId))
    ?? workspace.memberAgentIds[0];

  const selected = ranked[0];
  const selectedAgentId = selected?.agentId ?? fallbackAgentId;
  if (!selectedAgentId) {
    throw buildA2AError({
      code: A2AErrorCodeEnum.InvalidParams,
      message: `Workspace ${input.workspaceId} has no eligible member agents`,
    });
  }

  const registryAgent = registry.get(selectedAgentId);
  const platform = registryAgent?.identity.platform ?? selected?.platform ?? routingPlan.requirements.preferredPlatform ?? 'custom';

  return {
    assignee: {
      agent_id: selectedAgentId,
      platform,
      name: registryAgent?.identity.name,
    },
    connector: {
      connector_id: registryAgent?.identity.id ? `registry-${registryAgent.identity.id}` : `auto-${selectedAgentId}`,
      platform,
      protocol: deriveConnectorProtocol(platform),
      metadata: {
        autoRouted: true,
      },
    },
    routing: {
      runtimeCategory: routingPlan.runtimeCategory,
      routingRequirements: routingPlan.requirements,
      intentCategory: routingPlan.intent.category,
      intentConfidence: routingPlan.intent.confidence,
      routingReason: selected?.reason ?? 'Fallback to first available workspace member',
      selectedBy: selected ? 'capability-matcher' : 'workspace-fallback',
      onlineAtRouting: bridge.isAgentOnline(selectedAgentId),
    },
  };
}

async function gateTaskForApproval(task: TaskEnvelope, input: {
  requesterAgentId: string;
  assigneeAgentId: string;
  action: string;
  prompt: string;
  routing?: Record<string, unknown>;
}): Promise<TaskEnvelope> {
  const lifecycle = getTaskLifecycleService();
  const approvalGate = getApprovalGateService();
  const approval = approvalGate.createRequest({
    workspaceId: task.workspace_id,
    requestingAgentId: input.requesterAgentId,
    targetAgentId: input.assigneeAgentId,
    action: input.action,
    details: {
      prompt: input.prompt,
      taskId: task.id,
      threadId: task.thread_id,
      ...(input.routing ? { routing: input.routing } : {}),
    },
    timeoutMs: 300_000,
  });

  lifecycle.updateTaskMetadata(task.id, {
    metadataPatch: {
      approval: {
        approvalId: approval.approvalId,
        status: approval.status,
        action: input.action,
        targetAgentId: input.assigneeAgentId,
      },
      ...(input.routing ? { routing: input.routing } : {}),
    },
    triggeredBy: 'approval-gate',
    reason: 'Task approval requested',
  });
  lifecycle.startTask(task.id, 'approval-gate');
  const gated = lifecycle.requestInput(
    task.id,
    `Awaiting approval for ${input.action} to ${input.assigneeAgentId}`,
    'approval-gate',
  );
  const pending = gated.ok ? gated.data : task;

  approvalGate.onResolved(approval.approvalId, (resolved) => {
    lifecycle.updateTaskMetadata(task.id, {
      metadataPatch: {
        approval: {
          approvalId: resolved.approvalId,
          status: resolved.status,
          action: resolved.action,
          targetAgentId: resolved.targetAgentId,
          resolvedAt: resolved.resolvedAt,
          resolvedBy: resolved.resolvedBy,
        },
        ...(input.routing ? { routing: input.routing } : {}),
      },
      triggeredBy: 'approval-gate',
      reason: `Task approval ${resolved.status}`,
    });

    if (resolved.status === 'granted') {
      const resumed = lifecycle.startTask(task.id, 'approval-gate');
      if (resumed.ok) {
        void dispatchTaskToBridgeIfOnline(resumed.data);
      }
      return;
    }

    lifecycle.cancelTask(task.id, `Approval ${resolved.status}`, 'approval-gate');
  });

  getA2AEventBus().publish({
    id: `evt_${Date.now()}_${approval.approvalId}`,
    type: A2AEventType.ApprovalRequested,
    timestamp: new Date().toISOString(),
    data: { approval, taskId: task.id },
    taskId: task.id,
    workspaceId: task.workspace_id,
  });

  return pending;
}

async function dispatchTaskToBridgeIfOnline(task: TaskEnvelope): Promise<void> {
  const assigneeId = task.assignee?.agent_id;
  if (!assigneeId) return;

  const bridge = getAgentBridgeService();
  if (!bridge.isAgentOnline(assigneeId)) {
    return;
  }

  const prompt = extractBridgePrompt(task.payload);
  const intent = extractBridgeIntent(task.payload);
  const lifecycle = getTaskLifecycleService();
  const compiledInstructionBundle = compileInstructionBundleForTask(task);

  if (compiledInstructionBundle) {
    lifecycle.updateTaskMetadata(task.id, {
      metadataPatch: {
        instructionBundle: buildInstructionBundleMetadata(compiledInstructionBundle),
      },
      triggeredBy: INSTRUCTION_BUNDLE_TRIGGER,
      reason: 'Compiled instruction bundle attached to task metadata',
    });
    lifecycle.appendTaskArtifacts(task.id, {
      artifacts: [buildInstructionBundleArtifact(task.id, compiledInstructionBundle)],
      triggeredBy: INSTRUCTION_BUNDLE_TRIGGER,
      reason: 'Compiled instruction bundle artifact attached',
    });
  }

  // Fetch agent's recent memory context before dispatch
  const connected = bridge.getAgent(assigneeId);
  const memoryQuery = compiledInstructionBundle?.shared_goal || prompt;
  const memoryContext = connected?.userId && memoryQuery
    ? await getRecentContext({ query: memoryQuery, userId: connected.userId })
    : [];
  const effectivePrompt =
    compiledInstructionBundle?.agent_specific_prompt || prompt;

  const delivered = bridge.sendToAgent(assigneeId, {
    type: 'task.assigned',
    taskId: task.id,
    prompt: effectivePrompt,
    ...(intent ? { intent } : {}),
    context: {
      source: 'a2a-rest',
      from: task.requester?.agent_id || 'unknown',
      workspace_id: task.workspace_id,
      thread_id: task.thread_id,
      trace_id: task.trace_id,
      connector: task.connector,
      payload: task.payload,
      ...(compiledInstructionBundle ? { instructionBundle: compiledInstructionBundle } : {}),
      ...(memoryContext.length > 0 ? { memoryContext } : {}),
    },
  });

  if (delivered) {
    if (connected) connected.status = 'working';
    logger.info({ taskId: task.id, assigneeId, memoryEntries: memoryContext.length }, 'REST-created task dispatched to bridge-connected agent');
  } else {
    logger.warn({ taskId: task.id, assigneeId }, 'failed to dispatch REST-created task to bridge-connected agent');
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const taskLifecycleRouter = Router();

// All routes expect JSON bodies. Since the parent A2A mount may use
// express.text() for raw verification, we parse it back first.
taskLifecycleRouter.use(parseJsonTextBody);

// ---------------------------------------------------------------------------
// POST / -- Create a new task
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/',
  validateCreateTaskBody,
  async (req: Request, res: Response) => {
    try {
      const service = getTaskLifecycleService();
      const routingHints = parseRoutingHints(req.body.routing_hints);
      const wantsAutoRoute = req.body.auto_route === true;
      const resolvedAssignment = wantsAutoRoute
        ? await resolveAutoRouteAssignee({
            workspaceId: req.body.workspace_id,
            payload: req.body.payload,
            routingHints,
          })
        : null;
      const workspace = getWorkspaceService().get(req.body.workspace_id);
      const assignee = resolvedAssignment?.assignee ?? req.body.assignee;
      const connector = resolvedAssignment?.connector ?? req.body.connector;
      const metadata = {
        ...(readRecord(req.body.metadata) ?? {}),
        ...(resolvedAssignment?.routing ? { routing: resolvedAssignment.routing } : {}),
      };
      const input: CreateTaskInput = {
        workspace_id: req.body.workspace_id,
        thread_id: req.body.thread_id,
        trace_id: req.body.trace_id,
        parent_id: req.body.parent_id,
        requester: req.body.requester,
        assignee,
        connector,
        payload: req.body.payload,
        metadata,
        tags: req.body.tags,
      };

      const result = service.createTask(input);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      const createdTask = result.data;
      const prompt = extractBridgePrompt(createdTask.payload);
      const requiresApproval = Boolean(
        workspace?.settings.approvalRequired &&
        createdTask.requester.agent_id !== createdTask.assignee.agent_id,
      );

      if (requiresApproval) {
        const gatedTask = await gateTaskForApproval(createdTask, {
          requesterAgentId: createdTask.requester.agent_id,
          assigneeAgentId: createdTask.assignee.agent_id,
          action: wantsAutoRoute ? 'auto-route' : 'delegate',
          prompt,
          routing: resolvedAssignment?.routing,
        });
        sendSuccess(res, gatedTask, 201);
        return;
      }

      // Bridge dispatch is best-effort and async (memory lookup) — fire-and-forget.
      void dispatchTaskToBridgeIfOnline(createdTask);

      sendSuccess(res, createdTask, 201);
    } catch (err) {
      logger.error({ err }, 'unhandled error in POST /api/a2a/tasks');
      if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
        sendError(res, 400, err as A2AError);
        return;
      }
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while creating task',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// PATCH /:taskId/transition -- Transition task state
// ---------------------------------------------------------------------------

taskLifecycleRouter.patch(
  '/:taskId/transition',
  validateTransitionBody,
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const service = getTaskLifecycleService();

      const input: TransitionTaskInput = {
        target_state: req.body.target_state,
        reason: req.body.reason,
        triggered_by: req.body.triggered_by,
        result: req.body.result,
        error: req.body.error,
      };

      const result = service.transitionTask(taskId, input);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in PATCH /api/a2a/tasks/:taskId/transition');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while transitioning task',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:taskId -- Get task with full envelope
// ---------------------------------------------------------------------------

taskLifecycleRouter.get(
  '/:taskId',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;

      // Guard against matching the literal string "undefined" or empty
      if (!taskId || taskId === 'undefined') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'taskId parameter is required',
        }));
        return;
      }

      const service = getTaskLifecycleService();
      const result = service.getTask(taskId);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while fetching task',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:taskId/history -- Get transition history
// ---------------------------------------------------------------------------

taskLifecycleRouter.get(
  '/:taskId/history',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const service = getTaskLifecycleService();
      const result = service.getTaskHistory(taskId);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, {
        task_id: taskId,
        transitions: result.data,
        transition_count: result.data.length,
      });
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId/history');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while fetching task history',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:taskId/context -- Unified run context view
// ---------------------------------------------------------------------------

taskLifecycleRouter.get(
  '/:taskId/context',
  async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const service = getTaskLifecycleService();
      const taskResult = service.getTask(taskId);

      if (!taskResult.ok) {
        sendError(res, taskResult.httpStatus, taskResult.error);
        return;
      }

      const context = await buildTaskRunContext(taskResult.data);
      sendSuccess(res, context);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId/context');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while fetching task context',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET /:taskId/memory-candidates -- List reviewed/pending memory candidates
// ---------------------------------------------------------------------------

taskLifecycleRouter.get(
  '/:taskId/memory-candidates',
  (req: Request, res: Response) => {
    try {
      const taskResult = getTaskLifecycleService().getTask(req.params.taskId);
      if (!taskResult.ok) {
        sendError(res, taskResult.httpStatus, taskResult.error);
        return;
      }

      const candidates = getMemoryCandidateService().listByTask(req.params.taskId);
      sendSuccess(res, {
        taskId: req.params.taskId,
        candidates,
      });
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId/memory-candidates');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while listing memory candidates',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/memory-candidates -- Propose a reviewed memory candidate
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/:taskId/memory-candidates',
  (req: Request, res: Response) => {
    try {
      const taskId = req.params.taskId;
      const taskResult = getTaskLifecycleService().getTask(taskId);
      if (!taskResult.ok) {
        sendError(res, taskResult.httpStatus, taskResult.error);
        return;
      }

      const { scope, title, body, evidence, proposedBy, userId, agentId } = req.body || {};
      if (!isMemoryCandidateScope(scope)) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidParams,
          message: 'scope must be one of: space, repo, user, org',
        }));
        return;
      }
      if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || !body.trim()) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidParams,
          message: 'title and body are required',
        }));
        return;
      }

      const evidenceRecord = readRecord(evidence);
      const candidate = getMemoryCandidateService().createCandidate({
        taskId,
        scope,
        title: title.trim(),
        body: body.trim(),
        evidence: {
          taskId,
          artifactId:
            typeof evidenceRecord?.artifactId === 'string'
              ? evidenceRecord.artifactId
              : typeof evidenceRecord?.artifact_id === 'string'
                ? evidenceRecord.artifact_id
                : undefined,
        },
        proposedBy:
          typeof proposedBy === 'string' && proposedBy.trim().length > 0
            ? proposedBy.trim()
            : 'external-client',
        ...(typeof userId === 'string' && userId.trim().length > 0 ? { userId: userId.trim() } : {}),
        ...(typeof agentId === 'string' && agentId.trim().length > 0 ? { agentId: agentId.trim() } : {}),
      });

      getTaskLifecycleService().appendTaskArtifacts(taskId, {
        artifacts: [
          {
            key: `memory-candidate:${candidate.candidateId}`,
            artifact_type: 'custom',
            mime_type: 'application/json',
            path: `.recoder/artifacts/memory-candidate-${candidate.candidateId}.json`,
            content: JSON.stringify(candidate, null, 2),
            metadata: {
              type: 'memory_candidate',
              candidateId: candidate.candidateId,
              scope: candidate.scope,
              status: candidate.status,
              title: candidate.title,
              createdAt: candidate.createdAt,
            },
          },
        ],
        triggeredBy: candidate.proposedBy,
        reason: 'Memory candidate proposed',
      });

      sendSuccess(res, candidate, 201);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/memory-candidates');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: err instanceof Error ? err.message : 'Internal server error while creating memory candidate',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/memory-candidates/:candidateId/approve -- Approve and persist
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/:taskId/memory-candidates/:candidateId/approve',
  async (req: Request, res: Response) => {
    try {
      const taskId = req.params.taskId;
      const taskResult = getTaskLifecycleService().getTask(taskId);
      if (!taskResult.ok) {
        sendError(res, taskResult.httpStatus, taskResult.error);
        return;
      }

      const reviewedBy =
        typeof req.body?.reviewedBy === 'string' && req.body.reviewedBy.trim().length > 0
          ? req.body.reviewedBy.trim()
          : 'external-reviewer';
      const reviewReason =
        typeof req.body?.reviewReason === 'string' && req.body.reviewReason.trim().length > 0
          ? req.body.reviewReason.trim()
          : undefined;

      const candidate = await getMemoryCandidateService().approve(
        req.params.candidateId,
        reviewedBy,
        reviewReason,
      );

      getTaskLifecycleService().appendTaskArtifacts(taskId, {
        artifacts: [
          {
            key: `memory-candidate-review:${candidate.candidateId}`,
            artifact_type: 'custom',
            mime_type: 'application/json',
            path: `.recoder/artifacts/memory-candidate-review-${candidate.candidateId}.json`,
            content: JSON.stringify(candidate, null, 2),
            metadata: {
              type: 'memory_candidate_review',
              candidateId: candidate.candidateId,
              status: candidate.status,
              approvedMemoryId: candidate.approvedMemoryId,
              reviewedBy: candidate.reviewedBy,
              updatedAt: candidate.updatedAt,
            },
          },
        ],
        triggeredBy: reviewedBy,
        reason: 'Memory candidate approved',
      });

      sendSuccess(res, candidate);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId, candidateId: req.params.candidateId }, 'unhandled error in POST /api/a2a/tasks/:taskId/memory-candidates/:candidateId/approve');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: err instanceof Error ? err.message : 'Internal server error while approving memory candidate',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/memory-candidates/:candidateId/reject -- Reject candidate
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/:taskId/memory-candidates/:candidateId/reject',
  (req: Request, res: Response) => {
    try {
      const taskId = req.params.taskId;
      const taskResult = getTaskLifecycleService().getTask(taskId);
      if (!taskResult.ok) {
        sendError(res, taskResult.httpStatus, taskResult.error);
        return;
      }

      const reviewedBy =
        typeof req.body?.reviewedBy === 'string' && req.body.reviewedBy.trim().length > 0
          ? req.body.reviewedBy.trim()
          : 'external-reviewer';
      const reviewReason =
        typeof req.body?.reviewReason === 'string' && req.body.reviewReason.trim().length > 0
          ? req.body.reviewReason.trim()
          : undefined;

      const candidate = getMemoryCandidateService().reject(
        req.params.candidateId,
        reviewedBy,
        reviewReason,
      );

      getTaskLifecycleService().appendTaskArtifacts(taskId, {
        artifacts: [
          {
            key: `memory-candidate-review:${candidate.candidateId}`,
            artifact_type: 'custom',
            mime_type: 'application/json',
            path: `.recoder/artifacts/memory-candidate-review-${candidate.candidateId}.json`,
            content: JSON.stringify(candidate, null, 2),
            metadata: {
              type: 'memory_candidate_review',
              candidateId: candidate.candidateId,
              status: candidate.status,
              reviewedBy: candidate.reviewedBy,
              updatedAt: candidate.updatedAt,
            },
          },
        ],
        triggeredBy: reviewedBy,
        reason: 'Memory candidate rejected',
      });

      sendSuccess(res, candidate);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId, candidateId: req.params.candidateId }, 'unhandled error in POST /api/a2a/tasks/:taskId/memory-candidates/:candidateId/reject');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: err instanceof Error ? err.message : 'Internal server error while rejecting memory candidate',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/metadata -- Merge metadata into a task without state change
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/:taskId/metadata',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const metadataPatch = readRecord(req.body?.metadataPatch);
      const reason =
        typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
          ? req.body.reason.trim()
          : 'Task metadata updated';
      const triggeredBy =
        typeof req.body?.triggeredBy === 'string' && req.body.triggeredBy.trim().length > 0
          ? req.body.triggeredBy.trim()
          : 'external-client';

      if (!metadataPatch) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'metadataPatch must be an object',
        }));
        return;
      }

      const taskResult = getTaskLifecycleService().getTask(taskId);
      if (!taskResult.ok) {
        sendError(res, taskResult.httpStatus, taskResult.error);
        return;
      }

      const historyEntries = buildReviewHistoryEntries({
        taskId,
        metadataPatch,
        triggeredBy,
        reason,
      });
      const existingHistory = Array.isArray(taskResult.data.metadata?.reviewHistory)
        ? taskResult.data.metadata?.reviewHistory.filter((entry) => Boolean(entry))
        : [];
      const metadataPatchWithHistory = historyEntries.length > 0
        ? {
            ...metadataPatch,
            reviewHistory: [...existingHistory, ...historyEntries].slice(-50),
          }
        : metadataPatch;

      const result = getTaskLifecycleService().updateTaskMetadata(taskId, {
        metadataPatch: metadataPatchWithHistory,
        reason,
        triggeredBy,
      });

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      emitReviewLifecycleEvents({
        taskId,
        workspaceId: result.data.workspace_id,
        metadataPatch: metadataPatchWithHistory,
        triggeredBy,
      });

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/metadata');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while updating task metadata',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/artifacts -- Append artifacts to a task result
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/:taskId/artifacts',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const artifacts = parseTaskArtifacts(req.body?.artifacts);
      const reason =
        typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
          ? req.body.reason.trim()
          : 'Task artifacts appended';
      const triggeredBy =
        typeof req.body?.triggeredBy === 'string' && req.body.triggeredBy.trim().length > 0
          ? req.body.triggeredBy.trim()
          : 'external-client';

      if (!artifacts) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'artifacts must be an array of TaskArtifact objects',
        }));
        return;
      }

      const result = getTaskLifecycleService().appendTaskArtifacts(taskId, {
        artifacts,
        triggeredBy,
        reason,
      });

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      getA2AEventBus().publish({
        id: `evt_${Date.now()}_artifact_${taskId}`,
        type: A2AEventType.ArtifactAttached,
        timestamp: new Date().toISOString(),
        taskId,
        workspaceId: result.data.workspace_id,
        data: {
          taskId,
          artifactCount: artifacts.length,
          artifactKeys: artifacts.map((artifact) => artifact.key),
          triggeredBy,
          reason,
        },
      });

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/artifacts');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while appending task artifacts',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/preview-deploy -- Attach a preview deployment artifact
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/:taskId/preview-deploy',
  async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const taskResult = getTaskLifecycleService().getTask(taskId);
      if (!taskResult.ok) {
        sendError(res, taskResult.httpStatus, taskResult.error);
        return;
      }

      const body = typeof req.body === 'string'
        ? (() => {
            try {
              return JSON.parse(req.body);
            } catch {
              return null;
            }
          })()
        : req.body;

      if (!body || typeof body !== 'object') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.InvalidEnvelope,
          message: 'Invalid JSON body',
        }));
        return;
      }

      const projectId = typeof body.projectId === 'string' && body.projectId.trim().length > 0
        ? body.projectId.trim()
        : null;
      if (!projectId) {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'projectId is required',
        }));
        return;
      }

      const task = taskResult.data;
      const createdBy =
        typeof body.createdBy === 'string' && body.createdBy.trim().length > 0
          ? body.createdBy.trim()
          : task.assignee.agent_id;
      const protectionMode =
        body.protectionMode === 'public' || body.protectionMode === 'private' || body.protectionMode === 'signed'
          ? body.protectionMode
          : undefined;
      const previewDeployment = getPreviewDeploymentService().create({
        projectId,
        taskId: task.id,
        workspaceId: task.workspace_id,
        threadId: task.thread_id,
        traceId: task.trace_id,
        branchName: typeof body.branchName === 'string' ? body.branchName : undefined,
        prUrl: typeof body.prUrl === 'string' ? body.prUrl : undefined,
        prNumber: typeof body.prNumber === 'number' ? body.prNumber : undefined,
        protectionMode,
        createdBy,
        metadata: readRecord(body.metadata),
      });

      const previewLink: TaskPreviewLink = {
        url: previewDeployment.protectedPreviewUrl,
        label: 'Protected preview deployment',
        source: 'preview-deploy',
        metadata: {
          deploymentId: previewDeployment.id,
          projectId: previewDeployment.projectId,
          basePreviewUrl: previewDeployment.basePreviewUrl,
          edgeHost: previewDeployment.edgeHost,
          protectionMode: previewDeployment.protectionMode,
          ...(typeof previewDeployment.prNumber === 'number' ? { prNumber: previewDeployment.prNumber } : {}),
          ...(previewDeployment.prUrl ? { prUrl: previewDeployment.prUrl } : {}),
          ...(previewDeployment.branchName ? { branchName: previewDeployment.branchName } : {}),
        },
      };

      const previewUpdate = getTaskLifecycleService().appendTaskPreview(taskId, {
        preview: [previewLink],
        triggeredBy: createdBy,
        reason: 'Preview deployment attached',
      });
      if (!previewUpdate.ok) {
        sendError(res, previewUpdate.httpStatus, previewUpdate.error);
        return;
      }

      const artifact: TaskArtifact = {
        key: previewDeployment.artifactKey,
        artifact_type: 'custom',
        mime_type: 'application/json',
        content: buildPreviewArtifactContent({
          type: 'deployment_preview',
          deploymentId: previewDeployment.id,
          projectId: previewDeployment.projectId,
          basePreviewUrl: previewDeployment.basePreviewUrl,
          protectedPreviewUrl: previewDeployment.protectedPreviewUrl,
          protectionMode: previewDeployment.protectionMode,
          edgeHost: previewDeployment.edgeHost,
          prUrl: previewDeployment.prUrl || null,
          prNumber: previewDeployment.prNumber ?? null,
          branchName: previewDeployment.branchName || null,
        }),
        path: `.recoder/artifacts/${previewDeployment.id}.json`,
        metadata: {
          type: 'deployment_preview',
          deploymentId: previewDeployment.id,
          previewUrl: previewDeployment.protectedPreviewUrl,
          basePreviewUrl: previewDeployment.basePreviewUrl,
          protectionMode: previewDeployment.protectionMode,
          edgeHost: previewDeployment.edgeHost,
        },
      };

      const artifactUpdate = getTaskLifecycleService().appendTaskArtifacts(taskId, {
        artifacts: [artifact],
        triggeredBy: createdBy,
        reason: 'Preview deployment artifact attached',
      });
      if (!artifactUpdate.ok) {
        sendError(res, artifactUpdate.httpStatus, artifactUpdate.error);
        return;
      }

      const metadataUpdate = getTaskLifecycleService().updateTaskMetadata(taskId, {
        metadataPatch: {
          deploymentPreview: {
            deploymentId: previewDeployment.id,
            projectId: previewDeployment.projectId,
            basePreviewUrl: previewDeployment.basePreviewUrl,
            protectedPreviewUrl: previewDeployment.protectedPreviewUrl,
            protectionMode: previewDeployment.protectionMode,
            edgeHost: previewDeployment.edgeHost,
            ...(typeof previewDeployment.prNumber === 'number' ? { prNumber: previewDeployment.prNumber } : {}),
            ...(previewDeployment.prUrl ? { prUrl: previewDeployment.prUrl } : {}),
            ...(previewDeployment.branchName ? { branchName: previewDeployment.branchName } : {}),
          },
        },
        triggeredBy: createdBy,
        reason: 'Preview deployment registered',
      });
      if (!metadataUpdate.ok) {
        sendError(res, metadataUpdate.httpStatus, metadataUpdate.error);
        return;
      }

      getA2AEventBus().publish({
        id: `evt_${Date.now()}_preview_${taskId}`,
        type: A2AEventType.ArtifactAttached,
        timestamp: new Date().toISOString(),
        taskId,
        workspaceId: task.workspace_id,
        data: {
          taskId,
          deploymentId: previewDeployment.id,
          previewUrl: previewDeployment.protectedPreviewUrl,
          basePreviewUrl: previewDeployment.basePreviewUrl,
          edgeHost: previewDeployment.edgeHost,
          protectionMode: previewDeployment.protectionMode,
          triggeredBy: createdBy,
        },
      });

      sendSuccess(res, {
        task: metadataUpdate.data,
        previewDeployment,
      }, 201);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/preview-deploy');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while attaching preview deployment',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/claim -- Claim a task for exclusive processing by a session
// ---------------------------------------------------------------------------

taskLifecycleRouter.post(
  '/:taskId/claim',
  (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { session_id, agent_id } = req.body ?? {};

      if (!session_id || typeof session_id !== 'string') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'session_id is required',
        }));
        return;
      }

      const service = getTaskLifecycleService();
      const result = service.claimTask(taskId, session_id, typeof agent_id === 'string' ? agent_id : 'unknown');

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, result.data);
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/claim');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while claiming task',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// GET / -- List tasks with optional filters
// ---------------------------------------------------------------------------

taskLifecycleRouter.get(
  '/',
  (req: Request, res: Response) => {
    try {
      const service = getTaskLifecycleService();

      const filter: TaskListFilter = {};
      if (typeof req.query.workspace_id === 'string') filter.workspace_id = req.query.workspace_id;
      if (typeof req.query.thread_id === 'string') filter.thread_id = req.query.thread_id;
      if (typeof req.query.state === 'string') filter.state = req.query.state as any;
      if (typeof req.query.assignee_agent_id === 'string') filter.assignee_agent_id = req.query.assignee_agent_id;
      if (typeof req.query.limit === 'string') {
        const parsed = parseInt(req.query.limit, 10);
        if (!isNaN(parsed) && parsed > 0) filter.limit = Math.min(parsed, 1000);
      }
      if (typeof req.query.offset === 'string') {
        const parsed = parseInt(req.query.offset, 10);
        if (!isNaN(parsed) && parsed >= 0) filter.offset = parsed;
      }

      const result = service.listTasks(filter);

      if (!result.ok) {
        sendError(res, result.httpStatus, result.error);
        return;
      }

      sendSuccess(res, {
        tasks: result.data,
        count: result.data.length,
        filter,
      });
    } catch (err) {
      logger.error({ err }, 'unhandled error in GET /api/a2a/tasks');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while listing tasks',
      }));
    }
  },
);

// ---------------------------------------------------------------------------
// POST /:taskId/execute -- Execute a task via Pi or OpenCode agent
// ---------------------------------------------------------------------------
// Takes a task that has a prompt in its payload and dispatches it to the
// coding agent. The agent creates/edits files in the Daytona sandbox and
// returns the result. The task is transitioned to "working" → "completed".

taskLifecycleRouter.post(
  '/:taskId/execute',
  async (req: Request, res: Response) => {
    try {
      const { taskId } = req.params;
      const { project_id, sandbox_id } = req.body ?? {};

      if (!taskId || taskId === 'undefined') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'taskId parameter is required',
        }));
        return;
      }

      const service = getTaskLifecycleService();

      // Get the task
      const taskResult = service.getTask(taskId);
      if (!taskResult.ok) {
        sendError(res, taskResult.httpStatus, taskResult.error);
        return;
      }

      const task = taskResult.data;
      const payload = Array.isArray(task.payload) ? task.payload[0] : task.payload;
      const prompt = (payload as any)?.prompt || (payload as any)?.message || (payload as any)?.content;

      if (!prompt || typeof prompt !== 'string') {
        sendError(res, 400, buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'Task payload must contain a prompt, message, or content field',
        }));
        return;
      }

      // Transition to working
      service.transitionTask(taskId, { target_state: 'working' as any, triggered_by: 'a2a-execute' });

      // Try Pi agent first, then OpenCode
      const targetProjectId = project_id || task.metadata?.project_id || taskId;
      let result: { success: boolean; text: string; filesChanged?: string[] } | undefined;

      if (sandbox_id) {
        try {
          const { promptPiSession } = await import('./pi-runtime-adapter.js');
          result = await promptPiSession(targetProjectId, sandbox_id, prompt);
        } catch {
          // Pi unavailable — try OpenCode
        }
      }

      if (!result) {
        try {
          const { handleOpencodeServicePrompt } = await import('./opencode-service-handler.js');
          const ocResult = await handleOpencodeServicePrompt({
            projectId: targetProjectId,
            prompt,
          });
          result = {
            success: ocResult.success,
            text: ocResult.text,
          };
        } catch {
          // OpenCode also unavailable
        }
      }

      if (!result) {
        service.transitionTask(taskId, { target_state: 'failed' as any, reason: 'No coding agent available' });
        sendError(res, 503, buildA2AError({
          code: A2AErrorCodeEnum.InternalError,
          message: 'No coding agent available to execute the task',
        }));
        return;
      }

      // Transition to completed or failed
      if (result.success) {
        service.transitionTask(taskId, { target_state: 'completed' as any, reason: result.text });
      } else {
        service.transitionTask(taskId, { target_state: 'failed' as any, reason: result.text });
      }

      sendSuccess(res, {
        task_id: taskId,
        success: result.success,
        text: result.text,
        files_changed: result.filesChanged || [],
      });
    } catch (err) {
      logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/execute');
      sendError(res, 500, buildA2AError({
        code: A2AErrorCodeEnum.InternalError,
        message: 'Internal server error while executing task',
      }));
    }
  },
);
