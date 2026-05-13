"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskLifecycleService = exports.InMemoryTaskStore = void 0;
exports.generateId = generateId;
exports.getTaskLifecycleService = getTaskLifecycleService;
exports.disposeTaskLifecycleService = disposeTaskLifecycleService;
exports.resetTaskLifecycleService = resetTaskLifecycleService;
const a2a_1 = require("@recoder/shared/a2a");
const logger_1 = require("../logger");
const data_hygiene_1 = require("./data-hygiene");
const a2a_persistence_1 = require("./a2a-persistence");
const logger = (0, logger_1.createLogger)('a2a-task-lifecycle');
function collectPreviewLinks(result, metadata) {
    const links = [...(result.preview ?? [])];
    const candidates = [
        {
            url: result.data?.previewUrl,
            source: 'result.data.previewUrl',
            createdAt: result.data?.previewCreatedAt,
        },
        {
            url: result.data?.preview?.url,
            source: 'result.data.preview',
            createdAt: result.data?.preview?.createdAt,
        },
        {
            url: (result.data?.raw?.previewUrl),
            source: 'result.data.raw.previewUrl',
            createdAt: result.data?.raw?.previewCreatedAt,
        },
        {
            url: metadata?.previewUrl,
            source: 'task.metadata.previewUrl',
            createdAt: metadata?.previewCreatedAt,
        },
    ];
    for (const candidate of candidates) {
        if (typeof candidate.url !== 'string' || candidate.url.trim() === '')
            continue;
        if (links.some((link) => link.url === candidate.url))
            continue;
        links.push({
            url: candidate.url,
            source: candidate.source,
            metadata: typeof candidate.createdAt === 'string' && candidate.createdAt
                ? { createdAt: candidate.createdAt }
                : undefined,
        });
    }
    return links;
}
function collectFilesChanged(result) {
    const direct = result.data?.filesChanged;
    if (Array.isArray(direct)) {
        return direct.filter((item) => typeof item === 'string' && item.length > 0);
    }
    const rawFiles = result.data?.raw?.filesChanged;
    if (Array.isArray(rawFiles)) {
        return rawFiles.filter((item) => typeof item === 'string' && item.length > 0);
    }
    return [];
}
function readRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function readString(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
function readStringArray(value) {
    if (Array.isArray(value)) {
        return value
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter(Boolean);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        return [value.trim()];
    }
    return [];
}
function toExcerpt(value, maxLength = 240) {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength)
        return normalized;
    return `${normalized.slice(0, maxLength - 3)}...`;
}
function collectLogEvidence(result) {
    const data = readRecord(result.data);
    const raw = readRecord(data?.raw);
    const candidates = [
        { stream: 'stdout', value: data?.stdout ?? raw?.stdout, label: 'stdout' },
        { stream: 'stderr', value: data?.stderr ?? raw?.stderr, label: 'stderr' },
        { stream: 'logs', value: data?.logs ?? raw?.logs, label: 'runtime logs' },
    ];
    const evidence = [];
    for (const candidate of candidates) {
        const entries = readStringArray(candidate.value);
        if (entries.length === 0)
            continue;
        evidence.push({
            kind: 'log',
            label: candidate.label,
            ref: candidate.stream,
            metadata: {
                stream: candidate.stream,
                lineCount: entries.length,
                excerpt: toExcerpt(entries.join('\n')),
            },
        });
    }
    return evidence;
}
function collectRuntimeEvidence(result) {
    const data = readRecord(result.data);
    const raw = readRecord(data?.raw);
    const gitStatus = readString(data?.gitStatus) ??
        readString(data?.git_status) ??
        readString(raw?.gitStatus) ??
        readString(raw?.git_status);
    const gitBranch = readString(data?.gitBranch) ??
        readString(data?.git_branch) ??
        readString(raw?.gitBranch) ??
        readString(raw?.git_branch);
    const cloneUrl = readString(data?.cloneUrl) ??
        readString(data?.clone_url) ??
        readString(raw?.cloneUrl) ??
        readString(raw?.clone_url);
    const runtimeType = readString(data?.runtimeType) ??
        readString(data?.runtime_type) ??
        readString(raw?.runtimeType) ??
        readString(raw?.runtime_type);
    const sessionId = readString(data?.sessionId) ??
        readString(data?.session_id) ??
        readString(raw?.sessionId) ??
        readString(raw?.session_id);
    const sandboxId = readString(data?.sandboxId) ??
        readString(data?.sandbox_id) ??
        readString(raw?.sandboxId) ??
        readString(raw?.sandbox_id);
    const evidence = [];
    if (gitStatus || gitBranch || cloneUrl) {
        evidence.push({
            kind: 'runtime',
            label: gitBranch ? `Git state (${gitBranch})` : 'Git state',
            ref: gitBranch ? `git:${gitBranch}` : 'git',
            metadata: {
                ...(gitStatus ? { gitStatus: toExcerpt(gitStatus) } : {}),
                ...(gitBranch ? { gitBranch } : {}),
                ...(cloneUrl ? { cloneUrl } : {}),
            },
        });
    }
    if (runtimeType || sessionId || sandboxId) {
        evidence.push({
            kind: 'runtime',
            label: runtimeType ? `Runtime session (${runtimeType})` : 'Runtime session',
            ref: sessionId || sandboxId || runtimeType || 'runtime',
            metadata: {
                ...(runtimeType ? { runtimeType } : {}),
                ...(sessionId ? { sessionId } : {}),
                ...(sandboxId ? { sandboxId } : {}),
            },
        });
    }
    return evidence;
}
function enrichTaskResult(envelope, result) {
    const preview = collectPreviewLinks(result, envelope.metadata);
    const filesChanged = collectFilesChanged(result);
    const explicitEvidence = [...(result.evidence ?? [])];
    const derivedEvidence = [
        {
            kind: 'trace',
            label: 'Task trace',
            ref: envelope.trace_id,
            metadata: { taskId: envelope.id },
        },
        ...preview.map((link) => ({
            kind: 'preview',
            label: link.label || 'Preview URL',
            ref: link.url,
            metadata: {
                ...(link.source ? { source: link.source } : {}),
                ...(link.port != null ? { port: link.port } : {}),
            },
        })),
        ...(result.artifacts ?? []).map((artifact) => ({
            kind: artifact.artifact_type === 'log' ? 'log' : 'artifact',
            label: artifact.path || artifact.key,
            ref: artifact.key,
            metadata: {
                artifactType: artifact.artifact_type,
                ...(artifact.path ? { path: artifact.path } : {}),
            },
        })),
        ...filesChanged.map((path) => ({
            kind: 'file-change',
            label: path,
            ref: path,
        })),
        ...collectLogEvidence(result),
        ...collectRuntimeEvidence(result),
    ];
    const seen = new Set();
    const evidence = [...explicitEvidence, ...derivedEvidence].filter((item) => {
        const key = `${item.kind}:${item.ref || item.label}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    return {
        ...result,
        ...(preview.length > 0 ? { preview } : {}),
        evidence,
    };
}
// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------
let _idCounter = 0;
/** Generate a unique ID with the given prefix. */
function generateId(prefix) {
    const ts = Date.now().toString(36);
    const counter = (_idCounter++).toString(36).padStart(4, '0');
    const rand = crypto.randomUUID().slice(0, 4);
    return `${prefix}_${ts}${counter}${rand}`;
}
/** Default in-memory store with JSON file persistence. */
class InMemoryTaskStore {
    store;
    constructor() {
        // Hydrate from disk on construction
        this.store = (0, a2a_persistence_1.loadA2ATasks)();
        if (this.store.size > 0) {
            logger.info({ count: this.store.size }, 'loaded persisted A2A tasks');
        }
    }
    get(taskId) {
        return this.store.get(taskId);
    }
    set(taskId, envelope) {
        this.store.set(taskId, envelope);
        this.persist();
    }
    delete(taskId) {
        const result = this.store.delete(taskId);
        if (result)
            this.persist();
        return result;
    }
    has(taskId) {
        return this.store.has(taskId);
    }
    list(filter) {
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
    clear() {
        this.store.clear();
        this.persist();
    }
    /** Visible for testing. */
    get size() {
        return this.store.size;
    }
    /** Debounced write to disk via a2a-persistence. */
    persist() {
        (0, a2a_persistence_1.saveA2ATasks)(this.store);
    }
}
exports.InMemoryTaskStore = InMemoryTaskStore;
// ---------------------------------------------------------------------------
// TaskLifecycleService
// ---------------------------------------------------------------------------
class TaskLifecycleService {
    store;
    auditSinks = [];
    retention = (0, data_hygiene_1.getA2ARetentionWindowConfig)();
    auditTrail = [];
    constructor(store) {
        this.store = store ?? new InMemoryTaskStore();
    }
    // -----------------------------------------------------------------------
    // Audit sink management
    // -----------------------------------------------------------------------
    /** Register an audit event sink. */
    addAuditSink(sink) {
        this.auditSinks.push(sink);
    }
    emitAudit(event) {
        const sanitizedEvent = {
            ...event,
            metadata: (0, data_hygiene_1.redactSensitiveData)(event.metadata ?? {}),
        };
        this.trackAuditEvent(sanitizedEvent);
        if (this.auditSinks.length === 0) {
            logger.debug({ event_type: sanitizedEvent.event_type, task_id: sanitizedEvent.task_id }, 'audit event (no sinks)');
            return;
        }
        for (const sink of this.auditSinks) {
            try {
                void sink(sanitizedEvent);
            }
            catch (err) {
                logger.warn({ err, event_type: sanitizedEvent.event_type }, 'audit sink threw');
            }
        }
    }
    trackAuditEvent(event) {
        const now = Date.now();
        this.auditTrail.push({
            event,
            expiresAt: now + this.retention.auditTtlMs,
        });
        this.pruneAuditTrail(now);
    }
    pruneAuditTrail(now = Date.now()) {
        while (this.auditTrail.length > 0 && this.auditTrail[0].expiresAt <= now) {
            this.auditTrail.shift();
        }
        while (this.auditTrail.length > this.retention.auditMaxRecords) {
            this.auditTrail.shift();
        }
    }
    createTask(input) {
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
        const missing = [];
        if (!createInput.workspace_id)
            missing.push('workspace_id');
        if (!createInput.thread_id)
            missing.push('thread_id');
        if (!createInput.requester?.agent_id)
            missing.push('requester.agent_id');
        if (!createInput.requester?.platform)
            missing.push('requester.platform');
        if (!createInput.assignee?.agent_id)
            missing.push('assignee.agent_id');
        if (!createInput.assignee?.platform)
            missing.push('assignee.platform');
        if (!createInput.connector?.connector_id)
            missing.push('connector.connector_id');
        if (!createInput.connector?.platform)
            missing.push('connector.platform');
        if (!createInput.connector?.protocol)
            missing.push('connector.protocol');
        if (createInput.payload === undefined || createInput.payload === null)
            missing.push('payload');
        if (missing.length > 0) {
            return {
                ok: false,
                httpStatus: 400,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                    message: `Missing required fields: ${missing.join(', ')}`,
                    details: { missing_fields: missing },
                }),
            };
        }
        const id = generateId('task');
        const trace_id = createInput.trace_id || generateId('trace');
        const now = new Date().toISOString();
        const envelope = (0, a2a_1.createTaskEnvelope)({
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
        logger.info({ task_id: id, workspace_id: input.workspace_id, state: a2a_1.TaskStateEnum.Submitted }, 'task created');
        // Emit audit event
        this.emitAudit((0, a2a_1.createAuditEvent)({
            id: generateId('evt'),
            event_type: a2a_1.AuditEventTypeEnum.TaskSubmitted,
            severity: a2a_1.AuditSeverityEnum.Info,
            actor: {
                kind: a2a_1.AuditActorKindEnum.Agent,
                id: createInput.requester.agent_id,
                platform: createInput.requester.platform,
                name: createInput.requester.name,
            },
            target: {
                kind: a2a_1.AuditTargetKindEnum.Task,
                id,
            },
            trace_id,
            workspace_id: createInput.workspace_id,
            thread_id: createInput.thread_id,
            task_id: id,
            metadata: { initial_state: a2a_1.TaskStateEnum.Submitted },
            now,
        }));
        return { ok: true, data: envelope };
    }
    /**
     * Legacy list compatibility.
     */
    list(filter) {
        const result = this.listTasks(filter);
        return result.ok ? result.data : [];
    }
    // -----------------------------------------------------------------------
    // Task retrieval
    // -----------------------------------------------------------------------
    /** Get a task envelope by ID. */
    getTask(taskId) {
        const envelope = this.store.get(taskId);
        if (!envelope) {
            return {
                ok: false,
                httpStatus: 404,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                    message: `Task not found: ${taskId}`,
                    details: { task_id: taskId },
                }),
            };
        }
        return { ok: true, data: envelope };
    }
    /** Get the transition history for a task. */
    getTaskHistory(taskId) {
        const envelope = this.store.get(taskId);
        if (!envelope) {
            return {
                ok: false,
                httpStatus: 404,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                    message: `Task not found: ${taskId}`,
                    details: { task_id: taskId },
                }),
            };
        }
        return { ok: true, data: envelope.history ?? [] };
    }
    /** List tasks with optional filters. */
    listTasks(filter) {
        return { ok: true, data: this.store.list(filter) };
    }
    transitionTask(taskIdOrInput, input) {
        if (typeof taskIdOrInput !== 'string') {
            const normalizedTarget = taskIdOrInput.targetState === 'succeeded'
                ? a2a_1.TaskStateEnum.Completed
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
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
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
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                    message: `Task not found: ${taskId}`,
                    details: { task_id: taskId },
                }),
            };
        }
        // 2. Check for terminal state
        if ((0, a2a_1.isTerminalState)(existing.state)) {
            return {
                ok: false,
                httpStatus: 409,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.TaskAlreadyTerminal,
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
        if (!(0, a2a_1.isValidTransition)(existing.state, input.target_state)) {
            return {
                ok: false,
                httpStatus: 422,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.InvalidStateTransition,
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
        let updated;
        try {
            updated = (0, a2a_1.transitionTaskEnvelope)(existing, input.target_state, {
                reason: input.reason,
                triggered_by: input.triggered_by,
                now,
            });
        }
        catch (err) {
            // This should not happen since we validated above, but guard anyway
            return {
                ok: false,
                httpStatus: 422,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.InvalidStateTransition,
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
        if (input.result && input.target_state === a2a_1.TaskStateEnum.Completed) {
            updated = { ...updated, result: enrichTaskResult(updated, input.result) };
        }
        if (input.error && input.target_state === a2a_1.TaskStateEnum.Failed) {
            updated = { ...updated, error: input.error };
        }
        // 5a. Attach cost/token tracking on completion
        if (input.target_state === a2a_1.TaskStateEnum.Completed) {
            if (input.tokensUsed != null) {
                updated = { ...updated, tokensUsed: input.tokensUsed };
            }
            if (input.estimatedCostUsd != null) {
                updated = { ...updated, estimatedCostUsd: input.estimatedCostUsd };
            }
        }
        // 6. Persist
        this.store.set(taskId, updated);
        logger.info({
            task_id: taskId,
            from: existing.state,
            to: input.target_state,
            triggered_by: input.triggered_by,
        }, 'task state transitioned');
        // 7. Emit audit event
        const auditEventType = this.stateToAuditEventType(input.target_state);
        const auditSeverity = this.stateToAuditSeverity(input.target_state);
        this.emitAudit((0, a2a_1.createAuditEvent)({
            id: generateId('evt'),
            event_type: auditEventType,
            severity: auditSeverity,
            actor: {
                kind: a2a_1.AuditActorKindEnum.System,
                id: input.triggered_by || 'orchestrator',
                name: input.triggered_by || 'orchestrator',
            },
            target: {
                kind: a2a_1.AuditTargetKindEnum.Task,
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
        }));
        return { ok: true, data: updated };
    }
    /**
     * Legacy transition compatibility.
     */
    transition(taskId, targetState, input = {}) {
        return this.transitionTask(taskId, {
            ...input,
            target_state: targetState,
        });
    }
    // -----------------------------------------------------------------------
    // Convenience transition methods
    // -----------------------------------------------------------------------
    /** Transition task to 'working'. */
    startTask(taskId, triggeredBy) {
        return this.transitionTask(taskId, {
            target_state: a2a_1.TaskStateEnum.Working,
            triggered_by: triggeredBy,
            reason: 'Task execution started',
        });
    }
    /** Transition task to 'completed' with result data and optional cost tracking. */
    completeTask(taskId, result, triggeredBy, costData) {
        return this.transitionTask(taskId, {
            target_state: a2a_1.TaskStateEnum.Completed,
            triggered_by: triggeredBy,
            reason: 'Task completed successfully',
            result,
            tokensUsed: costData?.tokensUsed,
            estimatedCostUsd: costData?.estimatedCostUsd,
        });
    }
    /** Transition task to 'failed' with error info. */
    failTask(taskId, errorInfo, triggeredBy) {
        return this.transitionTask(taskId, {
            target_state: a2a_1.TaskStateEnum.Failed,
            triggered_by: triggeredBy,
            reason: errorInfo?.message || 'Task failed',
            error: errorInfo,
        });
    }
    /** Transition task to 'cancelled'. */
    cancelTask(taskId, reason, triggeredBy) {
        return this.transitionTask(taskId, {
            target_state: a2a_1.TaskStateEnum.Cancelled,
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
    retryTask(taskId, triggeredBy) {
        const existing = this.store.get(taskId);
        if (!existing) {
            return {
                ok: false,
                httpStatus: 404,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                    message: `Task not found: ${taskId}`,
                    details: { task_id: taskId },
                }),
            };
        }
        if (existing.state !== a2a_1.TaskStateEnum.Failed) {
            return {
                ok: false,
                httpStatus: 422,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.InvalidStateTransition,
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
    requestInput(taskId, reason, triggeredBy) {
        return this.transitionTask(taskId, {
            target_state: a2a_1.TaskStateEnum.InputRequired,
            triggered_by: triggeredBy,
            reason: reason || 'Additional input required',
        });
    }
    /**
     * Merge metadata into an existing task without changing its state.
     * This is used for canonical run-context updates such as approvals,
     * handoffs, routing decisions, and other lifecycle-adjacent state that
     * should live on the task envelope itself.
     */
    updateTaskMetadata(taskId, input) {
        const envelope = this.store.get(taskId);
        if (!envelope) {
            return {
                ok: false,
                httpStatus: 404,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                    message: `Task not found: ${taskId}`,
                    details: { task_id: taskId },
                }),
            };
        }
        const now = new Date().toISOString();
        const updated = {
            ...envelope,
            updated_at: now,
            metadata: {
                ...(envelope.metadata ?? {}),
                ...input.metadataPatch,
            },
        };
        this.store.set(taskId, updated);
        this.emitAudit((0, a2a_1.createAuditEvent)({
            id: generateId('evt'),
            event_type: a2a_1.AuditEventTypeEnum.TaskProgress,
            severity: a2a_1.AuditSeverityEnum.Info,
            actor: {
                kind: a2a_1.AuditActorKindEnum.System,
                id: input.triggeredBy || 'orchestrator',
                name: input.triggeredBy || 'orchestrator',
            },
            target: {
                kind: a2a_1.AuditTargetKindEnum.Task,
                id: taskId,
            },
            trace_id: updated.trace_id,
            workspace_id: updated.workspace_id,
            thread_id: updated.thread_id,
            task_id: taskId,
            metadata: {
                reason: input.reason || 'Task metadata updated',
                metadata_patch: input.metadataPatch,
            },
            now,
        }));
        return { ok: true, data: updated };
    }
    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    /**
     * Atomically claim a task for exclusive processing by a given session.
     * Idempotent: re-claiming by the same session returns the existing envelope.
     * Returns 409 if already claimed by a different session.
     */
    claimTask(taskId, sessionId, agentId) {
        const envelope = this.store.get(taskId);
        if (!envelope) {
            return {
                ok: false,
                httpStatus: 404,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                    message: `Task not found: ${taskId}`,
                    details: { task_id: taskId },
                }),
            };
        }
        if ((0, a2a_1.isTerminalState)(envelope.state)) {
            return {
                ok: false,
                httpStatus: 422,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.InvalidStateTransition,
                    message: `Cannot claim task in terminal state '${envelope.state}'`,
                    details: { task_id: taskId, current_state: envelope.state },
                }),
            };
        }
        const existingClaim = envelope.metadata?.claimedBy;
        if (existingClaim && existingClaim.sessionId !== sessionId) {
            return {
                ok: false,
                httpStatus: 409,
                error: (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.InvalidStateTransition,
                    message: `Task ${taskId} is already claimed by session ${existingClaim.sessionId}`,
                    details: { task_id: taskId, claimed_by_session: existingClaim.sessionId },
                }),
            };
        }
        // Idempotent: same session re-claiming
        if (existingClaim && existingClaim.sessionId === sessionId) {
            return { ok: true, data: envelope };
        }
        const updated = {
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
    getStore() {
        return this.store;
    }
    /** Return recent retained audit records (newest last). */
    getRecentAuditEvents(limit = 100) {
        this.pruneAuditTrail();
        const normalizedLimit = Math.max(0, Math.floor(limit));
        if (normalizedLimit === 0)
            return [];
        return this.auditTrail.slice(-normalizedLimit).map((item) => item.event);
    }
    getRecentAuditEventsForTask(taskId, limit = 100) {
        this.pruneAuditTrail();
        const normalizedLimit = Math.max(0, Math.floor(limit));
        if (normalizedLimit === 0)
            return [];
        return this.auditTrail
            .filter((item) => item.event.task_id === taskId)
            .slice(-normalizedLimit)
            .map((item) => item.event);
    }
    stateToAuditEventType(state) {
        const map = {
            [a2a_1.TaskStateEnum.Submitted]: a2a_1.AuditEventTypeEnum.TaskSubmitted,
            [a2a_1.TaskStateEnum.Working]: a2a_1.AuditEventTypeEnum.TaskStarted,
            [a2a_1.TaskStateEnum.InputRequired]: a2a_1.AuditEventTypeEnum.TaskInputRequired,
            [a2a_1.TaskStateEnum.Completed]: a2a_1.AuditEventTypeEnum.TaskCompleted,
            [a2a_1.TaskStateEnum.Failed]: a2a_1.AuditEventTypeEnum.TaskFailed,
            [a2a_1.TaskStateEnum.Cancelled]: a2a_1.AuditEventTypeEnum.TaskCancelled,
        };
        return map[state] ?? a2a_1.AuditEventTypeEnum.TaskProgress;
    }
    stateToAuditSeverity(state) {
        if (state === a2a_1.TaskStateEnum.Failed)
            return a2a_1.AuditSeverityEnum.Error;
        if (state === a2a_1.TaskStateEnum.Cancelled)
            return a2a_1.AuditSeverityEnum.Warning;
        return a2a_1.AuditSeverityEnum.Info;
    }
    /**
     * Dispose the underlying store (e.g. disconnect Redis, stop timers).
     * Call during graceful shutdown.
     */
    dispose() {
        if (typeof this.store.dispose === 'function') {
            this.store.dispose();
        }
    }
}
exports.TaskLifecycleService = TaskLifecycleService;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _defaultService = null;
/** Get or create the default singleton instance. */
function getTaskLifecycleService() {
    if (!_defaultService) {
        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
            // Lazy-require to avoid pulling ioredis when not needed
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { RedisTaskStore } = require('./redis-task-store');
            const terminalTaskTtlMs = Number(process.env.RECODER_A2A_TASK_TTL_MS) || undefined;
            const store = new RedisTaskStore({ redisUrl, terminalTaskTtlMs });
            logger.info({ terminalTaskTtlMs: terminalTaskTtlMs ?? '24h (default)' }, 'TaskLifecycleService using RedisTaskStore');
            _defaultService = new TaskLifecycleService(store);
        }
        else {
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
function disposeTaskLifecycleService() {
    if (_defaultService) {
        _defaultService.dispose();
        _defaultService = null;
    }
}
/** Reset the singleton (for testing). */
function resetTaskLifecycleService() {
    if (_defaultService) {
        _defaultService.dispose();
    }
    _defaultService = null;
}
