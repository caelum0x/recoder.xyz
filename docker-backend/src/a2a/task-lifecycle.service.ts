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
  const rand = crypto.randomUUID().slice(0, 4);
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
  /** Optional cleanup hook. Called during graceful shutdown. */
  dispose?(): void;
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

/**
 * Override for the audit event emitted by a transition. Used by PM lifecycle
 * decisions to fold their richer context (User actor, PM event type, decision
 * metadata) into the single transition audit event rather than emitting a
 * second overlapping one.
 */
export interface TransitionAuditOverride {
  eventType?: (typeof AuditEventTypeEnum)[keyof typeof AuditEventTypeEnum];
  severity?: (typeof AuditSeverityEnum)[keyof typeof AuditSeverityEnum];
  actor?: {
    kind: (typeof AuditActorKindEnum)[keyof typeof AuditActorKindEnum];
    id: string;
    name?: string;
  };
  /** Extra metadata merged into the audit event's metadata bag. */
  metadata?: Record<string, unknown>;
}

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
  /**
   * Shallow-merge patch applied to the envelope's `metadata` as part of this
   * transition, persisted atomically with the state change (avoids a second
   * `store.set`). Keys set to `undefined` are removed.
   */
  metadataPatch?: Record<string, unknown>;
  /**
   * Suppress the default System-actor transition audit event. PM lifecycle
   * decisions set this together with {@link auditOverride} so exactly one
   * coherent audit event is emitted per transition.
   */
  suppressBaseAudit?: boolean;
  /** Override the audit event emitted for this transition. */
  auditOverride?: TransitionAuditOverride;
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

    // 5b. Apply an optional metadata patch atomically with the transition so
    // callers (e.g. PM lifecycle decisions) do not need a second store.set.
    if (input.metadataPatch) {
      updated = {
        ...updated,
        metadata: { ...updated.metadata, ...input.metadataPatch },
      };
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

    // 7. Emit a single audit event for this transition.
    //
    // Callers may suppress the default System-actor event and supply an
    // override (e.g. PM lifecycle decisions) so exactly one coherent audit
    // event is produced per transition instead of two overlapping ones.
    if (!input.suppressBaseAudit) {
      const override = input.auditOverride;
      this.emitAudit(
        createAuditEvent({
          id: generateId('evt'),
          event_type: override?.eventType ?? this.stateToAuditEventType(input.target_state),
          severity: override?.severity ?? this.stateToAuditSeverity(input.target_state),
          actor: override?.actor ?? {
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
            ...(override?.metadata ?? {}),
          },
          now,
        }),
      );
    }

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
  // PM lifecycle decisions (pause / resume / reject / handoff)
  // -----------------------------------------------------------------------
  //
  // These methods make Project-Manager (PM) decisions first-class lifecycle
  // transitions rather than downstream annotations. They map onto the
  // canonical state machine:
  //
  //   pause   : working        -> input-required  (hold for approval/decision)
  //   resume  : input-required  -> working         (decision granted, continue)
  //   reject  : * (non-terminal)-> cancelled       (decision denied, terminate)
  //   handoff : reassign assignee, preserving state / history / artifacts
  //
  // Pause/resume reuse the existing non-terminal `input-required` hold state so
  // the change stays additive to the shared state machine. The richer PM
  // semantics (pause reason, linked approval, prior assignee) are recorded in
  // metadata + audit so they can be reconstructed without schema changes.

  /**
   * Pause a running task pending a PM approval or decision.
   *
   * Transitions `working` -> `input-required` (a non-terminal hold) and records
   * the pause context (reason + optional linked approval id) in metadata under
   * `pmLifecycle.pause`, leaving history/artifacts intact for later resume.
   */
  pauseTask(
    taskId: string,
    options: { reason?: string; triggeredBy?: string; approvalId?: string } = {},
  ): ServiceResult<TaskEnvelope> {
    const reason = options.reason || 'Paused pending PM approval';
    const now = new Date().toISOString();
    const existing = this.store.get(taskId);

    const result = this.transitionTask(taskId, {
      target_state: TaskStateEnum.InputRequired,
      triggered_by: options.triggeredBy,
      reason,
      // Fold the PM pause context into the single transition write + audit.
      metadataPatch: {
        pmLifecycle: {
          ...(existing ? this.readPmLifecycle(existing) : {}),
          phase: 'paused',
          pause: {
            reason,
            approvalId: options.approvalId,
            pausedBy: options.triggeredBy ?? 'pm',
            pausedAt: now,
          },
        },
      },
      auditOverride: this.pmAuditOverride({
        decision: 'pause',
        toState: TaskStateEnum.InputRequired,
        reason,
        triggeredBy: options.triggeredBy,
        severity: AuditSeverityEnum.Warning,
        extra: { approval_id: options.approvalId },
      }),
    });
    if (!result.ok) return result;

    logger.info({ task_id: taskId, approval_id: options.approvalId }, 'task paused (PM decision)');
    return { ok: true, data: result.data };
  }

  /**
   * Resume a paused task after a PM approval/decision is granted.
   *
   * Transitions `input-required` -> `working` and clears the pause hold,
   * preserving the audit trail of the pause/resume cycle.
   */
  resumeTask(
    taskId: string,
    options: { reason?: string; triggeredBy?: string } = {},
  ): ServiceResult<TaskEnvelope> {
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
    if (existing.state !== TaskStateEnum.InputRequired) {
      return {
        ok: false,
        httpStatus: 422,
        error: buildA2AError({
          code: A2AErrorCodeEnum.InvalidStateTransition,
          message: `Can only resume tasks in 'input-required' state; task ${taskId} is in '${existing.state}'`,
          details: { task_id: taskId, current_state: existing.state },
        }),
      };
    }

    const reason = options.reason || 'Resumed after PM approval';
    const now = new Date().toISOString();
    const result = this.transitionTask(taskId, {
      target_state: TaskStateEnum.Working,
      triggered_by: options.triggeredBy,
      reason,
      // Fold the PM resume context into the single transition write + audit.
      metadataPatch: {
        pmLifecycle: {
          ...this.readPmLifecycle(existing),
          phase: 'resumed',
          pause: undefined,
          resume: {
            reason,
            resumedBy: options.triggeredBy ?? 'pm',
            resumedAt: now,
          },
        },
      },
      auditOverride: this.pmAuditOverride({
        decision: 'resume',
        toState: TaskStateEnum.Working,
        reason,
        triggeredBy: options.triggeredBy,
        severity: AuditSeverityEnum.Info,
      }),
    });
    if (!result.ok) return result;

    logger.info({ task_id: taskId }, 'task resumed (PM decision)');
    return { ok: true, data: result.data };
  }

  /**
   * Reject a task as a terminal PM decision.
   *
   * Transitions the task to `cancelled` (terminal) and records the rejection
   * decision + reason in metadata under `pmLifecycle.reject`, distinct from a
   * plain cancellation so consumers can tell a denied approval apart from an
   * operator cancel.
   */
  rejectTask(
    taskId: string,
    options: { reason?: string; triggeredBy?: string; approvalId?: string } = {},
  ): ServiceResult<TaskEnvelope> {
    const reason = options.reason || 'Rejected by PM decision';
    const existing = this.store.get(taskId);
    const result = this.transitionTask(taskId, {
      target_state: TaskStateEnum.Cancelled,
      triggered_by: options.triggeredBy,
      reason,
      // Fold the PM reject context into the single transition write + audit.
      metadataPatch: {
        pmLifecycle: {
          ...(existing ? this.readPmLifecycle(existing) : {}),
          phase: 'rejected',
          pause: undefined,
          reject: {
            reason,
            approvalId: options.approvalId,
            rejectedBy: options.triggeredBy ?? 'pm',
            rejectedAt: new Date().toISOString(),
          },
        },
      },
      auditOverride: this.pmAuditOverride({
        decision: 'reject',
        toState: TaskStateEnum.Cancelled,
        reason,
        triggeredBy: options.triggeredBy,
        severity: AuditSeverityEnum.Warning,
        extra: { approval_id: options.approvalId },
      }),
    });
    if (!result.ok) return result;

    logger.info({ task_id: taskId, approval_id: options.approvalId }, 'task rejected (PM decision)');
    return { ok: true, data: result.data };
  }

  /**
   * Hand off a task to a new assignee while preserving ownership lineage,
   * artifacts, and the full audit/history trail.
   *
   * The task's `state`, `history`, `result`, and `tags` are untouched; only
   * the `assignee` is reassigned. The prior assignee and handoff reason are
   * recorded in metadata under `pmLifecycle.handoffs` (append-only) so the
   * complete chain of custody is auditable. A `task.progress` audit event with
   * `decision: 'handoff'` is emitted.
   */
  handoffTask(
    taskId: string,
    newAssignee: TaskAgentRef,
    options: { reason?: string; triggeredBy?: string } = {},
  ): ServiceResult<TaskEnvelope> {
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

    if (isTerminalState(existing.state)) {
      return {
        ok: false,
        httpStatus: 409,
        error: buildA2AError({
          code: A2AErrorCodeEnum.TaskAlreadyTerminal,
          message: `Cannot hand off task in terminal state '${existing.state}'`,
          details: { task_id: taskId, current_state: existing.state },
        }),
      };
    }

    if (!newAssignee?.agent_id || !newAssignee?.platform) {
      return {
        ok: false,
        httpStatus: 400,
        error: buildA2AError({
          code: A2AErrorCodeEnum.MissingEnvelopeField,
          message: 'Handoff requires newAssignee.agent_id and newAssignee.platform',
          details: { task_id: taskId },
        }),
      };
    }

    const now = new Date().toISOString();
    const reason = options.reason || 'Handed off by PM decision';
    const priorAssignee = existing.assignee;
    const pmLifecycle = this.readPmLifecycle(existing);
    const priorHandoffs = Array.isArray(pmLifecycle.handoffs) ? pmLifecycle.handoffs : [];

    const handed: TaskEnvelope = {
      ...existing,
      assignee: newAssignee,
      updated_at: now,
      // Preserve history/result/artifacts; append a chain-of-custody record.
      metadata: {
        ...existing.metadata,
        // Clear any stale single-session claim so the new assignee can claim.
        claimedBy: undefined,
        pmLifecycle: {
          ...pmLifecycle,
          phase: 'handed-off',
          handoffs: [
            ...priorHandoffs,
            {
              from: { agent_id: priorAssignee.agent_id, platform: priorAssignee.platform },
              to: { agent_id: newAssignee.agent_id, platform: newAssignee.platform },
              reason,
              handedOffBy: options.triggeredBy ?? 'pm',
              handedOffAt: now,
            },
          ],
        },
      },
    };
    this.store.set(taskId, handed);

    this.emitPmAudit(handed, {
      decision: 'handoff',
      reason,
      triggeredBy: options.triggeredBy,
      severity: AuditSeverityEnum.Info,
      extra: {
        from_assignee: priorAssignee.agent_id,
        to_assignee: newAssignee.agent_id,
      },
      now,
    });

    logger.info(
      { task_id: taskId, from: priorAssignee.agent_id, to: newAssignee.agent_id },
      'task handed off (PM decision)',
    );
    return { ok: true, data: handed };
  }

  /**
   * Drive a task's lifecycle from a resolved approval-gate decision.
   *
   * This is the wiring that makes "resolving an approval gate drive the task
   * state": when an approval that paused a task is granted the task resumes;
   * when it is rejected (or expires) the task is terminated. Idempotent and
   * tolerant of tasks that are not currently paused.
   */
  resolveApprovalDecision(
    taskId: string,
    decision: 'granted' | 'rejected' | 'expired',
    options: { reason?: string; triggeredBy?: string; approvalId?: string } = {},
  ): ServiceResult<TaskEnvelope> {
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

    // Already terminal: nothing to drive (idempotent no-op success).
    if (isTerminalState(existing.state)) {
      return { ok: true, data: existing };
    }

    if (decision === 'granted') {
      // Only resume if the task is actually paused; otherwise leave as-is.
      if (existing.state === TaskStateEnum.InputRequired) {
        return this.resumeTask(taskId, {
          reason: options.reason || 'Approval granted',
          triggeredBy: options.triggeredBy,
        });
      }
      return { ok: true, data: existing };
    }

    // rejected or expired -> terminate the run.
    return this.rejectTask(taskId, {
      reason: options.reason || (decision === 'expired' ? 'Approval expired' : 'Approval rejected'),
      triggeredBy: options.triggeredBy,
      approvalId: options.approvalId,
    });
  }

  /** Safely read the `pmLifecycle` metadata bag from an envelope. */
  private readPmLifecycle(envelope: TaskEnvelope): Record<string, unknown> {
    const bag = envelope.metadata?.pmLifecycle;
    return bag && typeof bag === 'object' ? { ...(bag as Record<string, unknown>) } : {};
  }

  /**
   * Build a {@link TransitionAuditOverride} for a PM lifecycle decision so the
   * underlying transition emits a single, PM-attributed audit event (User actor,
   * PM event type, `pm_decision` metadata) instead of the default System event
   * plus a second overlapping PM event.
   */
  private pmAuditOverride(input: {
    decision: 'pause' | 'resume' | 'reject' | 'handoff';
    toState: TaskState;
    reason?: string;
    triggeredBy?: string;
    severity: (typeof AuditSeverityEnum)[keyof typeof AuditSeverityEnum];
    extra?: Record<string, unknown>;
  }): TransitionAuditOverride {
    const eventTypeByDecision = {
      pause: AuditEventTypeEnum.TaskInputRequired,
      resume: AuditEventTypeEnum.TaskStarted,
      reject: AuditEventTypeEnum.TaskCancelled,
      handoff: AuditEventTypeEnum.TaskProgress,
    } as const;

    return {
      eventType: eventTypeByDecision[input.decision],
      severity: input.severity,
      actor: {
        kind: AuditActorKindEnum.User,
        id: input.triggeredBy || 'pm',
        name: input.triggeredBy || 'pm',
      },
      metadata: {
        pm_decision: input.decision,
        to_state: input.toState,
        reason: input.reason,
        ...(input.extra ?? {}),
      },
    };
  }

  /** Emit an audit event for a PM lifecycle decision. */
  private emitPmAudit(
    envelope: TaskEnvelope,
    input: {
      decision: 'pause' | 'resume' | 'reject' | 'handoff';
      reason?: string;
      triggeredBy?: string;
      severity: (typeof AuditSeverityEnum)[keyof typeof AuditSeverityEnum];
      extra?: Record<string, unknown>;
      now: string;
    },
  ): void {
    const eventTypeByDecision = {
      pause: AuditEventTypeEnum.TaskInputRequired,
      resume: AuditEventTypeEnum.TaskStarted,
      reject: AuditEventTypeEnum.TaskCancelled,
      handoff: AuditEventTypeEnum.TaskProgress,
    } as const;

    this.emitAudit(
      createAuditEvent({
        id: generateId('evt'),
        event_type: eventTypeByDecision[input.decision],
        severity: input.severity,
        actor: {
          kind: AuditActorKindEnum.User,
          id: input.triggeredBy || 'pm',
          name: input.triggeredBy || 'pm',
        },
        target: {
          kind: AuditTargetKindEnum.Task,
          id: envelope.id,
        },
        trace_id: envelope.trace_id,
        workspace_id: envelope.workspace_id,
        thread_id: envelope.thread_id,
        task_id: envelope.id,
        metadata: {
          pm_decision: input.decision,
          to_state: envelope.state,
          reason: input.reason,
          ...(input.extra ?? {}),
        },
        now: input.now,
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Atomically claim a task for exclusive processing by a given session.
   * Idempotent: re-claiming by the same session returns the existing envelope.
   * Returns 409 if already claimed by a different session.
   */
  claimTask(taskId: string, sessionId: string, agentId: string): ServiceResult<TaskEnvelope> {
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

    if (isTerminalState(envelope.state)) {
      return {
        ok: false,
        httpStatus: 422,
        error: buildA2AError({
          code: A2AErrorCodeEnum.InvalidStateTransition,
          message: `Cannot claim task in terminal state '${envelope.state}'`,
          details: { task_id: taskId, current_state: envelope.state },
        }),
      };
    }

    const existingClaim = envelope.metadata?.claimedBy as { sessionId: string; agentId: string } | undefined;

    if (existingClaim && existingClaim.sessionId !== sessionId) {
      return {
        ok: false,
        httpStatus: 409,
        error: buildA2AError({
          code: A2AErrorCodeEnum.InvalidStateTransition,
          message: `Task ${taskId} is already claimed by session ${existingClaim.sessionId}`,
          details: { task_id: taskId, claimed_by_session: existingClaim.sessionId },
        }),
      };
    }

    // Idempotent: same session re-claiming
    if (existingClaim && existingClaim.sessionId === sessionId) {
      return { ok: true, data: envelope };
    }

    const updated: TaskEnvelope = {
      ...envelope,
      metadata: {
        ...envelope.metadata,
        claimedBy: { sessionId, agentId, claimedAt: new Date().toISOString() },
      },
    };
    this.store.set(taskId, updated);
    logger.info({ task_id: taskId, sessionId, agentId }, 'task claimed');
    return { ok: true, data: updated };
  }

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

  /**
   * Dispose the underlying store (e.g. disconnect Redis, stop timers).
   * Call during graceful shutdown.
   */
  dispose(): void {
    if (typeof this.store.dispose === 'function') {
      this.store.dispose();
    }
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
      const terminalTaskTtlMs = Number(process.env.RECODER_A2A_TASK_TTL_MS) || undefined;
      const store = new RedisTaskStore({ redisUrl, terminalTaskTtlMs });
      logger.info(
        { terminalTaskTtlMs: terminalTaskTtlMs ?? '24h (default)' },
        'TaskLifecycleService using RedisTaskStore',
      );
      _defaultService = new TaskLifecycleService(store);
    } else {
      logger.info('TaskLifecycleService using InMemoryTaskStore (no REDIS_URL)');
      _defaultService = new TaskLifecycleService();
    }
  }
  return _defaultService;
}

/**
 * Dispose and reset the singleton. Disconnects Redis, stops eviction timers.
 * Call during graceful shutdown.
 */
export function disposeTaskLifecycleService(): void {
  if (_defaultService) {
    _defaultService.dispose();
    _defaultService = null;
  }
}

/** Reset the singleton (for testing). */
export function resetTaskLifecycleService(): void {
  if (_defaultService) {
    _defaultService.dispose();
  }
  _defaultService = null;
}
