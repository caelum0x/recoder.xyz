/**
 * @module approval-gate.service
 *
 * Approval gate for privileged inter-agent actions.
 *
 * Creates approval requests that block delegation until a human
 * grants or rejects them (or timeout expires). Publishes interactive
 * messages in the workspace channel.
 */

import { v4 as uuid } from 'uuid';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { createLogger } from '../logger';
import { loadA2AApprovals, saveA2AApprovals } from './a2a-persistence';
import type { ApprovalRequest, ApprovalStatus } from '@recoder/shared/a2a';

const logger = createLogger('a2a-approval-gate');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateApprovalInput {
  workspaceId: string;
  requestingAgentId: string;
  targetAgentId: string;
  action: string;
  details: Record<string, unknown>;
  timeoutMs?: number;
}

type ApprovalCallback = (approval: ApprovalRequest) => void;

/**
 * Decision sink invoked whenever an approval reaches a resolved state
 * (granted / rejected / expired). Used to drive the task lifecycle from an
 * approval-gate resolution without creating an import cycle between the
 * approval-gate and task-lifecycle services. Registered via
 * {@link ApprovalGateService.onDecision}.
 */
export type ApprovalDecisionSink = (
  approval: ApprovalRequest,
  decision: 'granted' | 'rejected' | 'expired',
) => void;

/**
 * Extract the originating task id from an approval request's details bag.
 * Approval requests carry the source task id under one of several key
 * variants depending on which caller created them.
 */
export function extractApprovalTaskId(approval: ApprovalRequest): string | undefined {
  const details = approval.details;
  if (!details || typeof details !== 'object') return undefined;
  const bag = details as Record<string, unknown>;
  const candidate = bag.sourceTaskId ?? bag.taskId ?? bag.task_id;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : undefined;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ApprovalGateService {
  private readonly requests: Map<string, ApprovalRequest>;
  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly callbacks = new Map<string, ApprovalCallback[]>();
  private readonly decisionSinks: ApprovalDecisionSink[] = [];

  constructor() {
    // Hydrate from disk and re-arm timeouts for still-pending requests
    this.requests = loadA2AApprovals();
    if (this.requests.size > 0) {
      logger.info({ count: this.requests.size }, 'loaded persisted A2A approvals');
    }
    // Re-arm timeout timers for any pending requests that haven't expired
    const now = Date.now();
    for (const [approvalId, request] of this.requests) {
      if (request.status !== 'pending') continue;
      const createdMs = new Date(request.createdAt).getTime();
      const remainingMs = request.timeoutMs - (now - createdMs);
      if (remainingMs <= 0) {
        // Already past deadline -- expire immediately
        this.expire(approvalId);
      } else {
        const timer = setTimeout(() => {
          this.expire(approvalId);
        }, remainingMs);
        this.timeouts.set(approvalId, timer);
      }
    }
  }

  createRequest(input: CreateApprovalInput): ApprovalRequest {
    const approvalId = `approval_${uuid().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const timeoutMs = input.timeoutMs ?? 300_000; // 5 min default

    const request: ApprovalRequest = {
      approvalId,
      workspaceId: input.workspaceId,
      requestingAgentId: input.requestingAgentId,
      targetAgentId: input.targetAgentId,
      action: input.action,
      details: input.details,
      status: 'pending',
      createdAt: now,
      timeoutMs,
    };

    this.requests.set(approvalId, request);
    this.persist();

    // Set timeout
    const timer = setTimeout(() => {
      this.expire(approvalId);
    }, timeoutMs);
    this.timeouts.set(approvalId, timer);

    logger.info({ approvalId, action: input.action }, 'approval request created');
    return request;
  }

  grant(approvalId: string, resolvedBy: string): ApprovalRequest | undefined {
    const request = this.requests.get(approvalId);
    if (!request || (request.status !== 'pending' && request.status !== 'escalated')) return undefined;

    request.status = 'granted';
    request.resolvedAt = new Date().toISOString();
    request.resolvedBy = resolvedBy;

    this.clearTimeout(approvalId);
    this.persist();

    getA2AEventBus().publish({
      id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
      type: A2AEventType.ApprovalGranted,
      timestamp: request.resolvedAt,
      data: { approval: request },
      workspaceId: request.workspaceId,
    });

    // Fire callbacks
    this.fireCallbacks(approvalId, request);
    this.fireDecision(request, 'granted');

    logger.info({ approvalId, resolvedBy }, 'approval granted');
    return request;
  }

  reject(approvalId: string, resolvedBy: string): ApprovalRequest | undefined {
    const request = this.requests.get(approvalId);
    if (!request || (request.status !== 'pending' && request.status !== 'escalated')) return undefined;

    request.status = 'rejected';
    request.resolvedAt = new Date().toISOString();
    request.resolvedBy = resolvedBy;

    this.clearTimeout(approvalId);
    this.persist();

    getA2AEventBus().publish({
      id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
      type: A2AEventType.ApprovalRejected,
      timestamp: request.resolvedAt,
      data: { approval: request },
      workspaceId: request.workspaceId,
    });

    this.fireDecision(request, 'rejected');

    logger.info({ approvalId, resolvedBy }, 'approval rejected');
    return request;
  }

  /**
   * Escalate an approval — marks it as escalated and extends the timeout by 2x
   * to give more time for human review.
   */
  escalate(approvalId: string, reason?: string): ApprovalRequest | undefined {
    const request = this.requests.get(approvalId);
    if (!request || (request.status !== 'pending' && request.status !== 'escalated')) return undefined;

    request.status = 'escalated';

    // Extend the timeout by 2x from now
    const extendedTimeoutMs = request.timeoutMs * 2;
    request.timeoutMs = extendedTimeoutMs;

    // Clear existing timeout and re-arm with extended duration
    this.clearTimeout(approvalId);
    const createdMs = new Date(request.createdAt).getTime();
    const elapsedMs = Date.now() - createdMs;
    const newRemainingMs = Math.max(0, extendedTimeoutMs - elapsedMs);
    const timer = setTimeout(() => {
      this.expire(approvalId);
    }, newRemainingMs);
    this.timeouts.set(approvalId, timer);

    this.persist();

    getA2AEventBus().publish({
      id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
      type: A2AEventType.ApprovalEscalated,
      timestamp: new Date().toISOString(),
      data: { approval: request, reason: reason ?? '' },
      workspaceId: request.workspaceId,
    });

    logger.info({ approvalId, reason, extendedTimeoutMs }, 'approval escalated');
    return request;
  }

  get(approvalId: string): ApprovalRequest | undefined {
    return this.requests.get(approvalId);
  }

  listPending(workspaceId: string): ApprovalRequest[] {
    return [...this.requests.values()].filter(
      (r) => r.workspaceId === workspaceId && (r.status === 'pending' || r.status === 'escalated'),
    );
  }

  /**
   * List all approval requests (any status) for a workspace. Used by
   * read-only projections such as the task timeline aggregator, which need
   * resolved approvals as well as pending ones.
   */
  listForWorkspace(workspaceId: string): ApprovalRequest[] {
    return [...this.requests.values()].filter((r) => r.workspaceId === workspaceId);
  }

  /**
   * List approval requests (any status) for a single task within a workspace.
   * Filters {@link listForWorkspace} down to approvals whose details bag
   * references the given task id, so that read-only projections (e.g. the task
   * timeline) never leak other tasks' approval records.
   */
  listForTask(workspaceId: string, taskId: string): ApprovalRequest[] {
    return this.listForWorkspace(workspaceId).filter(
      (r) => extractApprovalTaskId(r) === taskId,
    );
  }

  /**
   * Register a callback for when an approval is resolved.
   */
  onResolved(approvalId: string, callback: ApprovalCallback): void {
    const existing = this.callbacks.get(approvalId) ?? [];
    existing.push(callback);
    this.callbacks.set(approvalId, existing);
  }

  /**
   * Register a global decision sink invoked for every resolved approval
   * (granted / rejected / expired). Used to drive task-lifecycle transitions
   * from approval-gate resolutions.
   */
  onDecision(sink: ApprovalDecisionSink): void {
    this.decisionSinks.push(sink);
  }

  private fireDecision(
    request: ApprovalRequest,
    decision: 'granted' | 'rejected' | 'expired',
  ): void {
    for (const sink of this.decisionSinks) {
      try {
        sink(request, decision);
      } catch (err) {
        logger.error({ err, approvalId: request.approvalId, decision }, 'approval decision sink error');
      }
    }
  }

  private expire(approvalId: string): void {
    const request = this.requests.get(approvalId);
    if (!request || (request.status !== 'pending' && request.status !== 'escalated')) return;

    request.status = 'expired';
    request.resolvedAt = new Date().toISOString();
    this.persist();

    this.fireDecision(request, 'expired');

    logger.info({ approvalId }, 'approval expired');
  }

  private clearTimeout(approvalId: string): void {
    const timer = this.timeouts.get(approvalId);
    if (timer) {
      clearTimeout(timer);
      this.timeouts.delete(approvalId);
    }
  }

  /** Write current approval map to disk. */
  private persist(): void {
    saveA2AApprovals(this.requests);
  }

  private fireCallbacks(approvalId: string, request: ApprovalRequest): void {
    const cbs = this.callbacks.get(approvalId);
    if (cbs) {
      for (const cb of cbs) {
        try {
          cb(request);
        } catch (err) {
          logger.error({ err, approvalId }, 'approval callback error');
        }
      }
      this.callbacks.delete(approvalId);
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: ApprovalGateService | null = null;

export function getApprovalGateService(): ApprovalGateService {
  if (!_instance) {
    _instance = new ApprovalGateService();
  }
  return _instance;
}

export function resetApprovalGateService(): void {
  _instance = null;
}
