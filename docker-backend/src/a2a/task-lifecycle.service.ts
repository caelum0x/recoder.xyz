/**
 * @module task-lifecycle.service
 *
 * Canonical task lifecycle enforcement service for the docker-backend
 * A2A gateway / orchestrator.
 *
 * This service is the **single authority** for task state transitions within
 * the docker-backend process. Every state change -- whether initiated by an
 * API request, a connector callback, or an internal orchestration step --
 * must flow through this service so that:
 *
 * 1. The transition is validated against the canonical state machine
 *    (`ALLOWED_STATE_TRANSITIONS` from `@recoder/shared/a2a/schemas`).
 * 2. The full `TaskEnvelope` is updated immutably with appended history.
 * 3. An audit event is produced for every transition.
 * 4. Invalid transitions are rejected with structured A2A errors.
 *
 * The service wraps an in-process `Map<string, TaskEnvelope>` store.
 * Production deployments should replace this with a Redis or Postgres
 * persistence layer by implementing the `TaskStore` interface.
 */

import {
  type TaskEnvelope,
  type TaskState,
  type TaskStateTransition,
  type TaskAgentRef,
  type TaskConnectorInfo,
  type TaskResult,
  type TaskErrorInfo,
  type CreateTaskEnvelopeInput,
  type AuditEvent,
  type A2AError,
  type RecoderPayload,
  type RecoderAgentPlatform,
  TaskStateEnum,
  TERMINAL_TASK_STATES,
  isTerminalState,
  isValidTransition,
  transitionTaskEnvelope,
  createTaskEnvelope,
  TASK_ENVELOPE_VERSION,
  A2AErrorCodeEnum,
  buildA2AError,
  AuditEventTypeEnum,
  AuditActorKindEnum,
  AuditTargetKindEnum,
  AuditSeverityEnum,
  createAuditEvent,
} from '@recoder/shared/a2a';

import { createLogger } from '../logger';
import { getA2ARetentionWindowConfig, redactSensitiveData } from './data-hygiene';
import { loadA2ATasks, saveA2ATasks } from './a2a-persistence';

const logger = createLogger('a2a-task-lifecycle');

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _idCounter = 0;

/** Generate a unique ID with the given prefix. */
export function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const counter = (_idCounter++).toString(36).padStart(4, '0');
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}_${ts}${counter}${rand}`;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

/**
 * Abstraction for task envelope persistence.
 * The default in-memory implementation is suitable for single-process
 * deployments and tests. Replace with Redis/Postgres for production.
 */
export interface TaskStore {
  get(taskId: string): TaskEnvelope | undefined;
  set(taskId: string, envelope: TaskEnvelope): void;
  delete(taskId: string): boolean;
  has(taskId: string): boolean;
  list(filter?: TaskListFilter): TaskEnvelope[];
}

export interface TaskListFilter {
  workspace_id?: string;
  thread_id?: string;
  state?: TaskState;
  assignee_agent_id?: string;
  limit?: number;
  offset?: number;
}

/** Default in-memory store with JSON file persistence. */
export class InMemoryTaskStore implements TaskStore {
  private readonly store: Map<string, TaskEnvelope>;

  constructor() {
    // Hydrate from disk on construction
    this.store = loadA2ATasks();
    if (this.store.size > 0) {
      logger.info({ count: this.store.size }, 'loaded persisted A2A tasks');
    }
  }

  get(taskId: string): TaskEnvelope | undefined {
    return this.store.get(taskId);
  }

  set(taskId: string, envelope: TaskEnvelope): void {
    this.store.set(taskId, envelope);
    this.persist();
  }

  delete(taskId: string): boolean {
    const result = this.store.delete(taskId);
    if (result) this.persist();
    return result;
  }

  has(taskId: string): boolean {
    return this.store.has(taskId);
  }

  list(filter?: TaskListFilter): TaskEnvelope[] {
    let results = Array.from(this.store.values());

    if (filter?.workspace_id) {
      results = results.filter((e) => e.workspace_id === filter.workspace_id);
    }
    if (filter?.thread_id) {
      results = results.filter((e) => e.thread_id === filter.thread_id);
    }
    if (filter?.state) {
      results = results.filter((e) => e.state === filter.state);
    }
    if (filter?.assignee_agent_id) {
      results = results.filter((e) => e.assignee.agent_id === filter.assignee_agent_id);
    }

    // Sort by created_at descending (newest first)
    results.sort((a, b) => b.created_at.localeCompare(a.created_at));

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 100;
    return results.slice(offset, offset + limit);
  }

  /** Visible for testing. */
  clear(): void {
    this.store.clear();
    this.persist();
  }

  /** Visible for testing. */
  get size(): number {
    return this.store.size;
  }

  /** Debounced write to disk via a2a-persistence. */
  private persist(): void {
    saveA2ATasks(this.store);
  }
}

// ---------------------------------------------------------------------------
// Audit event sink interface
// ---------------------------------------------------------------------------

/**
 * Callback for audit events emitted during lifecycle operations.
 * Callers register a sink to persist / publish audit events.
 * If no sink is registered, events are logged at debug level.
 */
export type AuditEventSink = (event: AuditEvent) => void | Promise<void>;

// ---------------------------------------------------------------------------
// Create-task input
// ---------------------------------------------------------------------------

export interface CreateTaskInput {
  workspace_id: string;
  thread_id: string;
  trace_id?: string;
  parent_id?: string;
  requester: TaskAgentRef;
  assignee: TaskAgentRef;
  connector: TaskConnectorInfo;
  payload: RecoderPayload | RecoderPayload[];
  metadata?: Record<string, unknown>;
  tags?: string[];
}

/**
 * Legacy create-task shape used by older A2A orchestration code paths.
 * This is intentionally kept as a compatibility bridge while callers migrate
 * to the canonical `CreateTaskInput` contract.
 */
export interface LegacyCreateTaskInput {
  prompt: string;
  workspace_id?: string;
  thread_id?: string;
  assignee_agent_id: string;
  requester_agent_id?: string;
  priority?: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface LegacyTransitionTaskInput {
  taskId: string;
  targetState: TaskState | 'succeeded';
  agent?: {
    agent_id?: string;
    platform?: string;
  };
  message?: string;
}

// ---------------------------------------------------------------------------
// Transition input
// ---------------------------------------------------------------------------

export interface TransitionTaskInput {
  /** Target state. */
  target_state: TaskState;
  /** Human/agent-readable reason for the transition. */
  reason?: string;
  /** ID of the actor triggering the transition. */
  triggered_by?: string;
  /** Result data (only valid when transitioning to completed). */
  result?: TaskResult;
  /** Error info (only valid when transitioning to failed). */
  error?: TaskErrorInfo;
  /** Total tokens consumed (prompt + completion). Set when completing a task. */
  tokensUsed?: number;
  /** Estimated cost in USD. Set when completing a task. */
  estimatedCostUsd?: number;
}

// ---------------------------------------------------------------------------
// Service result types
// ---------------------------------------------------------------------------

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: A2AError; httpStatus: number };

// ---------------------------------------------------------------------------
// TaskLifecycleService
// ---------------------------------------------------------------------------

export class TaskLifecycleService {
  private readonly store: TaskStore;
  private readonly auditSinks: AuditEventSink[] = [];
  private readonly retention = getA2ARetentionWindowConfig();
  private readonly auditTrail: Array<{ event: AuditEvent; expiresAt: number }> = [];

  constructor(store?: TaskStore) {
    this.store = store ?? new InMemoryTaskStore();
  }

  // -----------------------------------------------------------------------
  // Audit sink management
  // -----------------------------------------------------------------------

  /** Register an audit event sink. */
  addAuditSink(sink: AuditEventSink): void {
    this.auditSinks.push(sink);
  }

  private emitAudit(event: AuditEvent): void {
    const sanitizedEvent: AuditEvent = {
      ...event,
      metadata: redactSensitiveData(event.metadata ?? {}) as Record<string, unknown>,
    };
    this.trackAuditEvent(sanitizedEvent);

    if (this.auditSinks.length === 0) {
      logger.debug({ event_type: sanitizedEvent.event_type, task_id: sanitizedEvent.task_id }, 'audit event (no sinks)');
      return;
    }
    for (const sink of this.auditSinks) {
      try {
        void sink(sanitizedEvent);
      } catch (err) {
        logger.warn({ err, event_type: sanitizedEvent.event_type }, 'audit sink threw');
      }
    }
  }

  private trackAuditEvent(event: AuditEvent): void {
    const now = Date.now();
    this.auditTrail.push({
      event,
      expiresAt: now + this.retention.auditTtlMs,
    });
    this.pruneAuditTrail(now);
  }

  private pruneAuditTrail(now = Date.now()): void {
    while (this.auditTrail.length > 0 && this.auditTrail[0].expiresAt <= now) {
      this.auditTrail.shift();
    }
    while (this.auditTrail.length > this.retention.auditMaxRecords) {
      this.auditTrail.shift();
    }
  }

  // -----------------------------------------------------------------------
  // Task creation
  // -----------------------------------------------------------------------

  /**
   * Create a new task in the `submitted` state.
   *
   * Validates that all required fields are present, generates an ID and
   * trace_id if not provided, persists the envelope, and emits a
   * `task.submitted` audit event.
   */
  createTask(input: CreateTaskInput): ServiceResult<TaskEnvelope>;
  createTask(input: LegacyCreateTaskInput): TaskEnvelope;
  createTask(input: CreateTaskInput | LegacyCreateTaskInput): ServiceResult<TaskEnvelope> | TaskEnvelope {
    if ('prompt' in input && 'assignee_agent_id' in input) {
      const now = new Date().toISOString();
      const normalized = this.createTask({
        workspace_id: input.workspace_id ?? 'legacy-workspace',
        thread_id: input.thread_id ?? 'legacy-thread',
        requester: {
          agent_id: input.requester_agent_id ?? 'legacy-requester',
          platform: 'recoder_backend',
        },
        assignee: {
          agent_id: input.assignee_agent_id,
          platform: 'recoder_backend',
        },
        connector: {
          connector_id: `legacy-${input.assignee_agent_id}`,
          platform: 'recoder_backend',
          protocol: 'rest',
        },
        payload: {
          kind: 'text',
          text: input.prompt,
        },
        metadata: {
          ...(input.metadata ?? {}),
          legacy_input: true,
          normalized_at: now,
        },
        tags: input.tags,
      });

      if (!normalized.ok) {
        throw new Error(normalized.error.message);
      }
      return normalized.data;
    }

    const createInput = input;

    // Validate required fields
    const missing: string[] = [];
    if (!createInput.workspace_id) missing.push('workspace_id');
    if (!createInput.thread_id) missing.push('thread_id');
    if (!createInput.requester?.agent_id) missing.push('requester.agent_id');
    if (!createInput.requester?.platform) missing.push('requester.platform');
    if (!createInput.assignee?.agent_id) missing.push('assignee.agent_id');
    if (!createInput.assignee?.platform) missing.push('assignee.platform');
    if (!createInput.connector?.connector_id) missing.push('connector.connector_id');
    if (!createInput.connector?.platform) missing.push('connector.platform');
    if (!createInput.connector?.protocol) missing.push('connector.protocol');
    if (createInput.payload === undefined || createInput.payload === null) missing.push('payload');

    if (missing.length > 0) {
      return {
        ok: false,
        httpStatus: 400,
        error: buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: `Missing required fields: ${missing.join(', ')}`,
          details: { missing_fields: missing },
        }),
      };
    }

    const id = generateId('task');
    const trace_id = createInput.trace_id || generateId('trace');
    const now = new Date().toISOString();

    const envelope = createTaskEnvelope({
      id,
      workspace_id: createInput.workspace_id,
      thread_id: createInput.thread_id,
      trace_id,
      parent_id: createInput.parent_id,
      requester: createInput.requester,
      assignee: createInput.assignee,
      connector: createInput.connector,
      payload: createInput.payload,
      metadata: createInput.metadata,
      tags: createInput.tags,
      now,
    });

    this.store.set(id, envelope);

    logger.info(
      { task_id: id, workspace_id: input.workspace_id, state: TaskStateEnum.Submitted },
      'task created',
    );

    // Emit audit event
    this.emitAudit(
      createAuditEvent({
        id: generateId('evt'),
        event_type: AuditEventTypeEnum.TaskSubmitted,
        severity: AuditSeverityEnum.Info,
        actor: {
          kind: AuditActorKindEnum.Agent,
          id: createInput.requester.agent_id,
          platform: createInput.requester.platform,
          name: createInput.requester.name,
        },
        target: {
          kind: AuditTargetKindEnum.Task,
          id,
        },
        trace_id,
        workspace_id: createInput.workspace_id,
        thread_id: createInput.thread_id,
        task_id: id,
        metadata: { initial_state: TaskStateEnum.Submitted },
        now,
      }),
    );

    return { ok: true, data: envelope };
  }

  /**
   * Legacy list compatibility.
   */
  list(filter?: TaskListFilter): TaskEnvelope[] {
    const result = this.listTasks(filter);
    return result.ok ? result.data : [];
  }

  // -----------------------------------------------------------------------
  // Task retrieval
  // -----------------------------------------------------------------------

  /** Get a task envelope by ID. */
  getTask(taskId: string): ServiceResult<TaskEnvelope> {
    const envelope = this.store.get(taskId);
    if (!envelope) {
      return {
        ok: false,
        httpStatus: 404,
        error: buildA2AError({
          code: A2AErrorCodeEnum.TaskNotFound,
          message: `Task not found: ${taskId}`,
          details: { task_id: taskId },
        }),
      };
    }
    return { ok: true, data: envelope };
  }

  /** Get the transition history for a task. */
  getTaskHistory(taskId: string): ServiceResult<TaskStateTransition[]> {
    const envelope = this.store.get(taskId);
    if (!envelope) {
      return {
        ok: false,
        httpStatus: 404,
        error: buildA2AError({
          code: A2AErrorCodeEnum.TaskNotFound,
          message: `Task not found: ${taskId}`,
          details: { task_id: taskId },
        }),
      };
    }
    return { ok: true, data: envelope.history ?? [] };
  }

  /** List tasks with optional filters. */
  listTasks(filter?: TaskListFilter): ServiceResult<TaskEnvelope[]> {
    return { ok: true, data: this.store.list(filter) };
  }

  // -----------------------------------------------------------------------
  // State transition
  // -----------------------------------------------------------------------

  /**
   * Transition a task to a new state.
   *
   * This is the **only** method that should be used to change task state.
   * It:
   * 1. Verifies the task exists.
   * 2. Checks the task is not already terminal.
   * 3. Validates the transition against the canonical state machine.
   * 4. Applies the transition immutably (via `transitionTaskEnvelope`).
   * 5. Attaches result/error data if appropriate.
   * 6. Persists the updated envelope.
   * 7. Emits the corresponding audit event.
   */
  transitionTask(taskId: string, input: TransitionTaskInput): ServiceResult<TaskEnvelope>;
  transitionTask(input: LegacyTransitionTaskInput): ServiceResult<TaskEnvelope>;
  transitionTask(
    taskIdOrInput: string | LegacyTransitionTaskInput,
    input?: TransitionTaskInput,
  ): ServiceResult<TaskEnvelope> {
    if (typeof taskIdOrInput !== 'string') {
      const normalizedTarget =
        taskIdOrInput.targetState === 'succeeded'
          ? TaskStateEnum.Completed
          : taskIdOrInput.targetState;
      return this.transitionTask(taskIdOrInput.taskId, {
        target_state: normalizedTarget,
        triggered_by: taskIdOrInput.agent?.agent_id,
        ...(taskIdOrInput.message
          ? {
              error: {
                code: 'LEGACY_CONNECTOR_ERROR',
                category: 'connector',
                message: taskIdOrInput.message,
                severity: 'high',
                retryable: false,
              },
            }
          : {}),
      });
    }

    if (!input) {
      return {
        ok: false,
        httpStatus: 400,
        error: buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'Missing transition input',
        }),
      };
    }

    const taskId = taskIdOrInput;

    // 1. Verify task exists
    const existing = this.store.get(taskId);
    if (!existing) {
      return {
        ok: false,
        httpStatus: 404,
        error: buildA2AError({
          code: A2AErrorCodeEnum.TaskNotFound,
          message: `Task not found: ${taskId}`,
          details: { task_id: taskId },
        }),
      };
    }

    // 2. Check for terminal state
    if (isTerminalState(existing.state)) {
      return {
        ok: false,
        httpStatus: 409,
        error: buildA2AError({
          code: A2AErrorCodeEnum.TaskAlreadyTerminal,
          message: `Task ${taskId} is already in terminal state '${existing.state}' and cannot be transitioned`,
          details: {
            task_id: taskId,
            current_state: existing.state,
            requested_state: input.target_state,
          },
        }),
      };
    }

    // 3. Validate transition
    if (!isValidTransition(existing.state, input.target_state)) {
      return {
        ok: false,
        httpStatus: 422,
        error: buildA2AError({
          code: A2AErrorCodeEnum.InvalidStateTransition,
          message: `Invalid state transition: '${existing.state}' -> '${input.target_state}' for task ${taskId}`,
          details: {
            task_id: taskId,
            current_state: existing.state,
            requested_state: input.target_state,
          },
        }),
      };
    }

    // 4. Apply transition
    const now = new Date().toISOString();
    let updated: TaskEnvelope;
    try {
      updated = transitionTaskEnvelope(existing, input.target_state, {
        reason: input.reason,
        triggered_by: input.triggered_by,
        now,
      });
    } catch (err) {
      // This should not happen since we validated above, but guard anyway
      return {
        ok: false,
        httpStatus: 422,
        error: buildA2AError({
          code: A2AErrorCodeEnum.InvalidStateTransition,
          message: err instanceof Error ? err.message : 'Transition failed',
          details: {
            task_id: taskId,
            current_state: existing.state,
            requested_state: input.target_state,
          },
        }),
      };
    }

    // 5. Attach result / error / cost data if provided
    if (input.result && input.target_state === TaskStateEnum.Completed) {
      updated = { ...updated, result: input.result };
    }
    if (input.error && input.target_state === TaskStateEnum.Failed) {
      updated = { ...updated, error: input.error };
    }

    // 5a. Attach cost/token tracking on completion
    if (input.target_state === TaskStateEnum.Completed) {
      if (input.tokensUsed != null) {
        updated = { ...updated, tokensUsed: input.tokensUsed };
      }
      if (input.estimatedCostUsd != null) {
        updated = { ...updated, estimatedCostUsd: input.estimatedCostUsd };
      }
    }

    // 6. Persist
    this.store.set(taskId, updated);

    logger.info(
      {
        task_id: taskId,
        from: existing.state,
        to: input.target_state,
        triggered_by: input.triggered_by,
      },
      'task state transitioned',
    );

    // 7. Emit audit event
    const auditEventType = this.stateToAuditEventType(input.target_state);
    const auditSeverity = this.stateToAuditSeverity(input.target_state);

    this.emitAudit(
      createAuditEvent({
        id: generateId('evt'),
        event_type: auditEventType,
        severity: auditSeverity,
        actor: {
          kind: AuditActorKindEnum.System,
          id: input.triggered_by || 'orchestrator',
          name: input.triggered_by || 'orchestrator',
        },
        target: {
          kind: AuditTargetKindEnum.Task,
          id: taskId,
        },
        trace_id: updated.trace_id,
        workspace_id: updated.workspace_id,
        thread_id: updated.thread_id,
        task_id: taskId,
        metadata: {
          from_state: existing.state,
          to_state: input.target_state,
          reason: input.reason,
        },
        now,
      }),
    );

    return { ok: true, data: updated };
  }

  /**
   * Legacy transition compatibility.
   */
  transition(
    taskId: string,
    targetState: TaskState,
    input: Omit<TransitionTaskInput, 'target_state'> = {},
  ): ServiceResult<TaskEnvelope> {
    return this.transitionTask(taskId, {
      ...input,
      target_state: targetState,
    });
  }

  // -----------------------------------------------------------------------
  // Convenience transition methods
  // -----------------------------------------------------------------------

  /** Transition task to 'working'. */
  startTask(taskId: string, triggeredBy?: string): ServiceResult<TaskEnvelope> {
    return this.transitionTask(taskId, {
      target_state: TaskStateEnum.Working,
      triggered_by: triggeredBy,
      reason: 'Task execution started',
    });
  }

  /** Transition task to 'completed' with result data and optional cost tracking. */
  completeTask(
    taskId: string,
    result?: TaskResult,
    triggeredBy?: string,
    costData?: { tokensUsed?: number; estimatedCostUsd?: number },
  ): ServiceResult<TaskEnvelope> {
    return this.transitionTask(taskId, {
      target_state: TaskStateEnum.Completed,
      triggered_by: triggeredBy,
      reason: 'Task completed successfully',
      result,
      tokensUsed: costData?.tokensUsed,
      estimatedCostUsd: costData?.estimatedCostUsd,
    });
  }

  /** Transition task to 'failed' with error info. */
  failTask(taskId: string, errorInfo?: TaskErrorInfo, triggeredBy?: string): ServiceResult<TaskEnvelope> {
    return this.transitionTask(taskId, {
      target_state: TaskStateEnum.Failed,
      triggered_by: triggeredBy,
      reason: errorInfo?.message || 'Task failed',
      error: errorInfo,
    });
  }

  /** Transition task to 'cancelled'. */
  cancelTask(taskId: string, reason?: string, triggeredBy?: string): ServiceResult<TaskEnvelope> {
    return this.transitionTask(taskId, {
      target_state: TaskStateEnum.Cancelled,
      triggered_by: triggeredBy,
      reason: reason || 'Task cancelled',
    });
  }

  /**
   * Retry a failed task by creating a new task envelope with incremented retryCount.
   * Since 'failed' is a terminal state, retries produce a new task rather than
   * re-transitioning the existing one. The new task carries the original payload
   * and metadata, plus an incremented retryCount.
   */
  retryTask(taskId: string, triggeredBy?: string): ServiceResult<TaskEnvelope> {
    const existing = this.store.get(taskId);
    if (!existing) {
      return {
        ok: false,
        httpStatus: 404,
        error: buildA2AError({
          code: A2AErrorCodeEnum.TaskNotFound,
          message: `Task not found: ${taskId}`,
          details: { task_id: taskId },
        }),
      };
    }

    if (existing.state !== TaskStateEnum.Failed) {
      return {
        ok: false,
        httpStatus: 422,
        error: buildA2AError({
          code: A2AErrorCodeEnum.InvalidStateTransition,
          message: `Can only retry tasks in 'failed' state; task ${taskId} is in '${existing.state}'`,
          details: { task_id: taskId, current_state: existing.state },
        }),
      };
    }

    const retryCount = (existing.retryCount ?? 0) + 1;
    return this.createTask({
      workspace_id: existing.workspace_id,
      thread_id: existing.thread_id,
      trace_id: existing.trace_id,
      parent_id: existing.id,
      requester: existing.requester,
      assignee: existing.assignee,
      connector: existing.connector,
      payload: existing.payload,
      metadata: {
        ...existing.metadata,
        retryCount,
        retried_from: existing.id,
        retried_by: triggeredBy ?? 'orchestrator',
      },
      tags: existing.tags,
    });
  }

  /** Transition task to 'input-required'. */
  requestInput(taskId: string, reason?: string, triggeredBy?: string): ServiceResult<TaskEnvelope> {
    return this.transitionTask(taskId, {
      target_state: TaskStateEnum.InputRequired,
      triggered_by: triggeredBy,
      reason: reason || 'Additional input required',
    });
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /** Expose the store for testing / advanced use. */
  getStore(): TaskStore {
    return this.store;
  }

  /** Return recent retained audit records (newest last). */
  getRecentAuditEvents(limit = 100): AuditEvent[] {
    this.pruneAuditTrail();
    const normalizedLimit = Math.max(0, Math.floor(limit));
    if (normalizedLimit === 0) return [];
    return this.auditTrail.slice(-normalizedLimit).map((item) => item.event);
  }

  private stateToAuditEventType(state: TaskState): (typeof AuditEventTypeEnum)[keyof typeof AuditEventTypeEnum] {
    const map: Record<string, (typeof AuditEventTypeEnum)[keyof typeof AuditEventTypeEnum]> = {
      [TaskStateEnum.Submitted]: AuditEventTypeEnum.TaskSubmitted,
      [TaskStateEnum.Working]: AuditEventTypeEnum.TaskStarted,
      [TaskStateEnum.InputRequired]: AuditEventTypeEnum.TaskInputRequired,
      [TaskStateEnum.Completed]: AuditEventTypeEnum.TaskCompleted,
      [TaskStateEnum.Failed]: AuditEventTypeEnum.TaskFailed,
      [TaskStateEnum.Cancelled]: AuditEventTypeEnum.TaskCancelled,
    };
    return map[state] ?? AuditEventTypeEnum.TaskProgress;
  }

  private stateToAuditSeverity(state: TaskState) {
    if (state === TaskStateEnum.Failed) return AuditSeverityEnum.Error;
    if (state === TaskStateEnum.Cancelled) return AuditSeverityEnum.Warning;
    return AuditSeverityEnum.Info;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _defaultService: TaskLifecycleService | null = null;

/** Get or create the default singleton instance. */
export function getTaskLifecycleService(): TaskLifecycleService {
  if (!_defaultService) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      // Lazy-require to avoid pulling ioredis when not needed
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { RedisTaskStore } = require('./redis-task-store') as typeof import('./redis-task-store');
      const store = new RedisTaskStore({ redisUrl });
      logger.info('TaskLifecycleService using RedisTaskStore');
      _defaultService = new TaskLifecycleService(store);
    } else {
      logger.info('TaskLifecycleService using InMemoryTaskStore (no REDIS_URL)');
      _defaultService = new TaskLifecycleService();
    }
  }
  return _defaultService;
}

/** Reset the singleton (for testing). */
export function resetTaskLifecycleService(): void {
  _defaultService = null;
}
