/**
 * @module adapters/openclaw/mapper
 *
 * Mapper functions that transform OpenClaw gateway events into canonical
 * TaskEnvelope instances.
 *
 * Each OpenClaw event type has a dedicated mapper that:
 * 1. Extracts or generates a trace_id for distributed tracing.
 * 2. Maps OpenClaw-specific fields to canonical envelope fields.
 * 3. Sets the correct initial TaskState based on the event semantics.
 * 4. Populates connector info for the OpenClaw adapter.
 * 5. Constructs proper requester/assignee agent references.
 *
 * The top-level `mapOpenClawEvent` function dispatches to the correct mapper
 * based on the event discriminator.
 *
 * @example
 * ```ts
 * import { mapOpenClawEvent } from '@recoder/shared/a2a/adapters/openclaw';
 *
 * const result = mapOpenClawEvent(openclawEvent, { workspace_id: 'ws_abc' });
 * if (result.ok) {
 *   // result.envelope is a TaskEnvelope
 * } else {
 *   // result.error is an A2AError
 * }
 * ```
 */

import {
  TaskStateEnum,
  createTaskEnvelope,
  type TaskEnvelope,
  type TaskAgentRef,
  type TaskConnectorInfo,
  type TaskErrorInfo,
} from '../../schemas/task-envelope';
import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '../../schemas/error-taxonomy';
import type {
  OpenClawGatewayEvent,
  OpenClawTaskGeneratingEvent,
  OpenClawVoiceTranscriptEvent,
  OpenClawAgentRequestEvent,
  OpenClawChatSubscribeEvent,
  OpenClawChatUnsubscribeEvent,
  OpenClawExecStartedEvent,
  OpenClawExecFinishedEvent,
  OpenClawExecDeniedEvent,
  OpenClawHookWakeEvent,
  OpenClawHookAgentEvent,
  OpenClawAgentLifecycleEvent,
  OpenClawAgentToolEvent,
  OpenClawAgentAssistantEvent,
  OpenClawAgentErrorEvent,
  OpenClawTraceContext,
} from './types';
import type { RecoderPayload } from '../../types';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Options passed to the mapper to provide context that the event itself
 * does not carry (workspace scoping, default agent identities).
 */
export interface OpenClawMapperOptions {
  /** The workspace ID to scope the envelope to. Required. */
  workspace_id: string;

  /**
   * Default thread ID when the event does not carry one.
   * If not provided, a session-key-based or generated thread_id is used.
   */
  default_thread_id?: string;

  /**
   * The agent ID representing the OpenClaw gateway itself.
   * Defaults to 'openclaw-gateway'.
   */
  gateway_agent_id?: string;

  /**
   * The agent ID representing the assignee agent that processes tasks.
   * Defaults to 'openclaw-agent'.
   */
  assignee_agent_id?: string;

  /**
   * Override the ID factory for task IDs.
   * Defaults to generating a `task_<hex>` identifier.
   */
  id_factory?: () => string;

  /**
   * Override the trace_id factory.
   * Defaults to generating a 32-char hex W3C trace ID.
   */
  trace_id_factory?: () => string;

  /**
   * Override the current timestamp.
   * Defaults to `new Date().toISOString()`.
   */
  now?: string;
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/** Successful mapping result. */
export interface OpenClawMapperSuccess {
  ok: true;
  envelope: TaskEnvelope;
}

/** Failed mapping result. */
export interface OpenClawMapperFailure {
  ok: false;
  error: A2AError;
}

/**
 * Skipped result -- the event is valid but does not produce a TaskEnvelope
 * (e.g. chat.subscribe / chat.unsubscribe are control signals).
 */
export interface OpenClawMapperSkipped {
  ok: true;
  skipped: true;
  reason: string;
}

/** Union of all possible mapping outcomes. */
export type OpenClawMapperResult =
  | OpenClawMapperSuccess
  | OpenClawMapperFailure
  | OpenClawMapperSkipped;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a 32-char hex string suitable for W3C trace ID.
 * Uses globalThis.crypto (Web Crypto API, available in Node 19+ and all
 * modern browsers) with a fallback to Math.random for environments
 * where crypto is unavailable.
 */
function generateTraceId(): string {
  if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function') {
    // randomUUID returns a v4 UUID like "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    // Strip dashes and take first 32 chars for W3C trace context.
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }
  // Fallback: Math.random-based hex (not cryptographically secure, fine for dev).
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/** Generate a task ID. */
function generateTaskId(): string {
  return `task_${generateTraceId().slice(0, 16)}`;
}

/** Resolve trace_id: preserve from event, or generate a new one. */
function resolveTraceId(
  trace: OpenClawTraceContext | undefined,
  factory?: () => string
): { trace_id: string; parent_id?: string } {
  const trace_id = trace?.trace_id || (factory ?? generateTraceId)();
  return {
    trace_id,
    parent_id: trace?.parent_id,
  };
}

/** Build the standard OpenClaw connector info. */
function openclawConnectorInfo(): TaskConnectorInfo {
  return {
    platform: 'custom',
    protocol: 'rest',
    connector_id: 'openclaw-gateway-v1',
    name: 'OpenClaw Gateway',
    metadata: { adapter: 'openclaw' },
  };
}

/** Build the gateway agent ref (the requester for most events). */
function gatewayRequester(opts: OpenClawMapperOptions, nodeId?: string): TaskAgentRef {
  return {
    agent_id: opts.gateway_agent_id ?? 'openclaw-gateway',
    platform: 'custom',
    name: 'OpenClaw Gateway',
    instance_id: nodeId,
  };
}

/** Build the assignee agent ref. */
function defaultAssignee(opts: OpenClawMapperOptions): TaskAgentRef {
  return {
    agent_id: opts.assignee_agent_id ?? 'openclaw-agent',
    platform: 'custom',
    name: 'OpenClaw Agent',
  };
}

/**
 * Derive a thread_id from the event.
 * Uses sessionKey when available, falls back to default or generated.
 */
function resolveThreadId(
  sessionKey: string | undefined,
  opts: OpenClawMapperOptions
): string {
  if (sessionKey && sessionKey.trim()) {
    return `oc_thread_${sessionKey}`;
  }
  return opts.default_thread_id ?? `oc_thread_${(opts.id_factory ?? generateTaskId)()}`;
}

// ---------------------------------------------------------------------------
// Per-event mappers
// ---------------------------------------------------------------------------

function mapVoiceTranscript(
  evt: OpenClawVoiceTranscriptEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const { trace_id, parent_id } = resolveTraceId(evt.trace, opts.trace_id_factory);
  const thread_id = resolveThreadId(evt.sessionKey, opts);
  const now = opts.now ?? new Date().toISOString();

  const payload: RecoderPayload = {
    kind: 'text',
    text: evt.text,
  };

  const envelope = createTaskEnvelope({
    id: (opts.id_factory ?? generateTaskId)(),
    workspace_id: opts.workspace_id,
    thread_id,
    trace_id,
    parent_id,
    requester: gatewayRequester(opts, evt.nodeId),
    assignee: defaultAssignee(opts),
    connector: openclawConnectorInfo(),
    payload,
    metadata: {
      openclaw_event: 'voice.transcript',
      node_id: evt.nodeId,
      session_key: evt.sessionKey,
      source: 'voice',
    },
    tags: ['source:voice', `node:${evt.nodeId}`],
    now,
  });

  return { ok: true, envelope };
}

function mapAgentRequest(
  evt: OpenClawAgentRequestEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const { trace_id, parent_id } = resolveTraceId(evt.trace, opts.trace_id_factory);
  const thread_id = resolveThreadId(evt.sessionKey, opts);
  const now = opts.now ?? new Date().toISOString();

  const payload: RecoderPayload = {
    kind: 'text',
    text: evt.message,
  };

  const envelope = createTaskEnvelope({
    id: (opts.id_factory ?? generateTaskId)(),
    workspace_id: opts.workspace_id,
    thread_id,
    trace_id,
    parent_id,
    requester: gatewayRequester(opts, evt.nodeId),
    assignee: evt.to
      ? { agent_id: evt.to, platform: 'custom', name: evt.to }
      : defaultAssignee(opts),
    connector: openclawConnectorInfo(),
    payload,
    metadata: {
      openclaw_event: 'agent.request',
      node_id: evt.nodeId,
      session_key: evt.sessionKey,
      channel: evt.channel,
      deliver: evt.deliver,
      thinking: evt.thinking,
      timeout_seconds: evt.timeoutSeconds,
    },
    tags: ['source:node', `node:${evt.nodeId}`],
    now,
  });

  return { ok: true, envelope };
}

function mapChatSubscribe(
  _evt: OpenClawChatSubscribeEvent,
  _opts: OpenClawMapperOptions
): OpenClawMapperResult {
  return {
    ok: true,
    skipped: true,
    reason: 'chat.subscribe is a control-plane signal; no TaskEnvelope produced',
  };
}

function mapChatUnsubscribe(
  _evt: OpenClawChatUnsubscribeEvent,
  _opts: OpenClawMapperOptions
): OpenClawMapperResult {
  return {
    ok: true,
    skipped: true,
    reason: 'chat.unsubscribe is a control-plane signal; no TaskEnvelope produced',
  };
}

function mapExecStarted(
  evt: OpenClawExecStartedEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const { trace_id, parent_id } = resolveTraceId(evt.trace, opts.trace_id_factory);
  const thread_id = resolveThreadId(evt.sessionKey, opts);
  const now = opts.now ?? new Date().toISOString();

  const payload: RecoderPayload = {
    kind: 'command',
    command: evt.command ?? '',
  };

  const envelope = createTaskEnvelope({
    id: evt.runId
      ? `task_exec_${evt.runId}`
      : (opts.id_factory ?? generateTaskId)(),
    workspace_id: opts.workspace_id,
    thread_id,
    trace_id,
    parent_id,
    requester: gatewayRequester(opts, evt.nodeId),
    assignee: defaultAssignee(opts),
    connector: openclawConnectorInfo(),
    payload,
    initial_state: TaskStateEnum.Working,
    metadata: {
      openclaw_event: 'exec.started',
      node_id: evt.nodeId,
      run_id: evt.runId,
      session_key: evt.sessionKey,
    },
    tags: ['source:exec', `node:${evt.nodeId}`],
    now,
  });

  return { ok: true, envelope };
}

function mapExecFinished(
  evt: OpenClawExecFinishedEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const { trace_id, parent_id } = resolveTraceId(evt.trace, opts.trace_id_factory);
  const thread_id = resolveThreadId(evt.sessionKey, opts);
  const now = opts.now ?? new Date().toISOString();

  const payload: RecoderPayload = {
    kind: 'command',
    command: evt.command ?? '',
  };

  // Determine terminal state based on exit result.
  const timedOut = evt.timedOut === true;
  const exitCode = evt.exitCode;
  const failed = timedOut || (typeof exitCode === 'number' && exitCode !== 0);
  const terminalState = failed ? TaskStateEnum.Failed : TaskStateEnum.Completed;

  const envelope = createTaskEnvelope({
    id: evt.runId
      ? `task_exec_${evt.runId}`
      : (opts.id_factory ?? generateTaskId)(),
    workspace_id: opts.workspace_id,
    thread_id,
    trace_id,
    parent_id,
    requester: gatewayRequester(opts, evt.nodeId),
    assignee: defaultAssignee(opts),
    connector: openclawConnectorInfo(),
    payload,
    initial_state: terminalState,
    metadata: {
      openclaw_event: 'exec.finished',
      node_id: evt.nodeId,
      run_id: evt.runId,
      session_key: evt.sessionKey,
      exit_code: exitCode,
      timed_out: timedOut,
      output: evt.output,
    },
    tags: ['source:exec', `node:${evt.nodeId}`],
    now,
  });

  // Attach result or error info depending on outcome.
  if (failed) {
    const errorInfo: TaskErrorInfo = {
      code: timedOut ? 'CONNECTOR_TIMEOUT' : 'TASK_EXECUTION_FAILED',
      category: timedOut ? 'connector' : 'task',
      message: timedOut
        ? `Command timed out on node ${evt.nodeId}`
        : `Command exited with code ${exitCode ?? '?'} on node ${evt.nodeId}`,
      severity: 'high',
      retryable: timedOut,
      details: { exit_code: exitCode, timed_out: timedOut, output: evt.output },
    };
    return {
      ok: true,
      envelope: {
        ...envelope,
        error: errorInfo,
        result: { text: evt.output, data: { exit_code: exitCode, timed_out: timedOut } },
      },
    };
  }

  return {
    ok: true,
    envelope: {
      ...envelope,
      result: { text: evt.output, data: { exit_code: exitCode } },
    },
  };
}

function mapExecDenied(
  evt: OpenClawExecDeniedEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const { trace_id, parent_id } = resolveTraceId(evt.trace, opts.trace_id_factory);
  const thread_id = resolveThreadId(evt.sessionKey, opts);
  const now = opts.now ?? new Date().toISOString();

  const payload: RecoderPayload = {
    kind: 'command',
    command: evt.command ?? '',
  };

  const envelope = createTaskEnvelope({
    id: evt.runId
      ? `task_exec_${evt.runId}`
      : (opts.id_factory ?? generateTaskId)(),
    workspace_id: opts.workspace_id,
    thread_id,
    trace_id,
    parent_id,
    requester: gatewayRequester(opts, evt.nodeId),
    assignee: defaultAssignee(opts),
    connector: openclawConnectorInfo(),
    payload,
    initial_state: TaskStateEnum.Failed,
    metadata: {
      openclaw_event: 'exec.denied',
      node_id: evt.nodeId,
      run_id: evt.runId,
      session_key: evt.sessionKey,
      denial_reason: evt.reason,
    },
    tags: ['source:exec', 'denied', `node:${evt.nodeId}`],
    now,
  });

  const errorInfo: TaskErrorInfo = {
    code: 'POLICY_DENIED',
    category: 'policy',
    message: evt.reason
      ? `Execution denied: ${evt.reason}`
      : `Execution denied by policy on node ${evt.nodeId}`,
    severity: 'medium',
    retryable: false,
    details: { reason: evt.reason, command: evt.command },
  };

  return {
    ok: true,
    envelope: {
      ...envelope,
      error: errorInfo,
      policy: [
        {
          action: 'bash:exec',
          approved: false,
          rule: 'deny',
          reason: evt.reason ?? 'Policy denied execution',
          checked_at: now,
        },
      ],
    },
  };
}

function mapHookWake(
  evt: OpenClawHookWakeEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const { trace_id, parent_id } = resolveTraceId(evt.trace, opts.trace_id_factory);
  const now = opts.now ?? new Date().toISOString();

  const payload: RecoderPayload = {
    kind: 'text',
    text: evt.text,
  };

  const envelope = createTaskEnvelope({
    id: (opts.id_factory ?? generateTaskId)(),
    workspace_id: opts.workspace_id,
    thread_id: opts.default_thread_id ?? `oc_thread_hook_wake`,
    trace_id,
    parent_id,
    requester: {
      agent_id: 'openclaw-hook',
      platform: 'custom',
      name: 'OpenClaw HTTP Hook',
    },
    assignee: defaultAssignee(opts),
    connector: openclawConnectorInfo(),
    payload,
    metadata: {
      openclaw_event: 'hook.wake',
      wake_mode: evt.mode,
    },
    tags: ['source:hook', `wake:${evt.mode}`],
    now,
  });

  return { ok: true, envelope };
}

function mapHookAgent(
  evt: OpenClawHookAgentEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const { trace_id, parent_id } = resolveTraceId(evt.trace, opts.trace_id_factory);
  const thread_id = resolveThreadId(evt.sessionKey, opts);
  const now = opts.now ?? new Date().toISOString();

  const payload: RecoderPayload = {
    kind: 'text',
    text: evt.message,
  };

  const envelope = createTaskEnvelope({
    id: evt.runId
      ? `task_hook_${evt.runId}`
      : (opts.id_factory ?? generateTaskId)(),
    workspace_id: opts.workspace_id,
    thread_id,
    trace_id,
    parent_id,
    requester: {
      agent_id: 'openclaw-hook',
      platform: 'custom',
      name: evt.name || 'OpenClaw HTTP Hook',
    },
    assignee: evt.to
      ? { agent_id: evt.to, platform: 'custom', name: evt.to }
      : defaultAssignee(opts),
    connector: openclawConnectorInfo(),
    payload,
    metadata: {
      openclaw_event: 'hook.agent',
      session_key: evt.sessionKey,
      channel: evt.channel,
      deliver: evt.deliver,
      wake_mode: evt.wakeMode,
      model: evt.model,
      thinking: evt.thinking,
      timeout_seconds: evt.timeoutSeconds,
      run_id: evt.runId,
    },
    tags: ['source:hook', `hook:${evt.name}`],
    now,
  });

  return { ok: true, envelope };
}

function mapAgentLifecycle(
  evt: OpenClawAgentLifecycleEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const { trace_id, parent_id } = resolveTraceId(evt.trace, opts.trace_id_factory);
  const thread_id = resolveThreadId(evt.sessionKey, opts);
  const now = opts.now ?? new Date(evt.ts).toISOString();

  // Map lifecycle phase to task state.
  const stateMap: Record<string, typeof TaskStateEnum[keyof typeof TaskStateEnum]> = {
    start: TaskStateEnum.Working,
    end: TaskStateEnum.Completed,
    error: TaskStateEnum.Failed,
  };
  const state = stateMap[evt.phase] ?? TaskStateEnum.Working;

  const payload: RecoderPayload = {
    kind: 'json',
    data: {
      phase: evt.phase,
      seq: evt.seq,
      ...(evt.data ?? {}),
    },
  };

  const envelope = createTaskEnvelope({
    id: `task_run_${evt.runId}`,
    workspace_id: opts.workspace_id,
    thread_id,
    trace_id,
    parent_id,
    requester: gatewayRequester(opts),
    assignee: defaultAssignee(opts),
    connector: openclawConnectorInfo(),
    payload,
    initial_state: state,
    metadata: {
      openclaw_event: 'agent.lifecycle',
      run_id: evt.runId,
      phase: evt.phase,
      seq: evt.seq,
      session_key: evt.sessionKey,
    },
    tags: ['source:agent-bus', `phase:${evt.phase}`],
    now,
  });

  // Attach error info when phase is 'error'.
  if (evt.phase === 'error') {
    const errorMessage =
      typeof evt.data?.error === 'string'
        ? evt.data.error
        : `Agent run ${evt.runId} failed`;
    const errorInfo: TaskErrorInfo = {
      code: 'TASK_EXECUTION_FAILED',
      category: 'task',
      message: errorMessage,
      severity: 'high',
      retryable: true,
      details: evt.data,
    };
    return {
      ok: true,
      envelope: { ...envelope, error: errorInfo },
    };
  }

  return { ok: true, envelope };
}

function mapAgentTool(
  evt: OpenClawAgentToolEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const { trace_id, parent_id } = resolveTraceId(evt.trace, opts.trace_id_factory);
  const thread_id = resolveThreadId(evt.sessionKey, opts);
  const now = opts.now ?? new Date(evt.ts).toISOString();

  const payload: RecoderPayload = {
    kind: 'json',
    data: {
      stream: 'tool',
      seq: evt.seq,
      ...(evt.data ?? {}),
    },
  };

  const envelope = createTaskEnvelope({
    id: `task_run_${evt.runId}`,
    workspace_id: opts.workspace_id,
    thread_id,
    trace_id,
    parent_id,
    requester: gatewayRequester(opts),
    assignee: defaultAssignee(opts),
    connector: openclawConnectorInfo(),
    payload,
    initial_state: TaskStateEnum.Working,
    metadata: {
      openclaw_event: 'agent.tool',
      run_id: evt.runId,
      seq: evt.seq,
      session_key: evt.sessionKey,
    },
    tags: ['source:agent-bus', 'stream:tool'],
    now,
  });

  return { ok: true, envelope };
}

function mapAgentAssistant(
  evt: OpenClawAgentAssistantEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const { trace_id, parent_id } = resolveTraceId(evt.trace, opts.trace_id_factory);
  const thread_id = resolveThreadId(evt.sessionKey, opts);
  const now = opts.now ?? new Date(evt.ts).toISOString();

  const text = evt.data?.text ?? '';
  const payload: RecoderPayload = {
    kind: 'text',
    text: text || '(streaming)',
  };

  const envelope = createTaskEnvelope({
    id: `task_run_${evt.runId}`,
    workspace_id: opts.workspace_id,
    thread_id,
    trace_id,
    parent_id,
    requester: gatewayRequester(opts),
    assignee: defaultAssignee(opts),
    connector: openclawConnectorInfo(),
    payload,
    initial_state: TaskStateEnum.Working,
    metadata: {
      openclaw_event: 'agent.assistant',
      run_id: evt.runId,
      seq: evt.seq,
      session_key: evt.sessionKey,
    },
    tags: ['source:agent-bus', 'stream:assistant'],
    now,
  });

  return { ok: true, envelope };
}

function mapAgentError(
  evt: OpenClawAgentErrorEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const { trace_id, parent_id } = resolveTraceId(evt.trace, opts.trace_id_factory);
  const thread_id = resolveThreadId(evt.sessionKey, opts);
  const now = opts.now ?? new Date(evt.ts).toISOString();

  const payload: RecoderPayload = {
    kind: 'json',
    data: {
      stream: 'error',
      seq: evt.seq,
      ...(evt.data ?? {}),
    },
  };

  const errorMessage =
    evt.data?.error ?? evt.data?.reason ?? `Agent run ${evt.runId} error`;
  const errorInfo: TaskErrorInfo = {
    code: 'TASK_EXECUTION_FAILED',
    category: 'task',
    message: typeof errorMessage === 'string' ? errorMessage : String(errorMessage),
    severity: 'high',
    retryable: true,
    details: evt.data,
  };

  const envelope = createTaskEnvelope({
    id: `task_run_${evt.runId}`,
    workspace_id: opts.workspace_id,
    thread_id,
    trace_id,
    parent_id,
    requester: gatewayRequester(opts),
    assignee: defaultAssignee(opts),
    connector: openclawConnectorInfo(),
    payload,
    initial_state: TaskStateEnum.Failed,
    metadata: {
      openclaw_event: 'agent.error',
      run_id: evt.runId,
      seq: evt.seq,
      session_key: evt.sessionKey,
    },
    tags: ['source:agent-bus', 'stream:error'],
    now,
  });

  return {
    ok: true,
    envelope: { ...envelope, error: errorInfo },
  };
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

type MapperFn = (evt: any, opts: OpenClawMapperOptions) => OpenClawMapperResult;

const EVENT_MAPPERS: Record<string, MapperFn> = {
  'voice.transcript': mapVoiceTranscript,
  'agent.request': mapAgentRequest,
  'chat.subscribe': mapChatSubscribe,
  'chat.unsubscribe': mapChatUnsubscribe,
  'exec.started': mapExecStarted,
  'exec.finished': mapExecFinished,
  'exec.denied': mapExecDenied,
  'hook.wake': mapHookWake,
  'hook.agent': mapHookAgent,
  'agent.lifecycle': mapAgentLifecycle,
  'agent.tool': mapAgentTool,
  'agent.assistant': mapAgentAssistant,
  'agent.error': mapAgentError,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map any OpenClaw gateway event to a canonical TaskEnvelope.
 *
 * This is the primary entry point. It dispatches to the correct per-event
 * mapper based on the `event` discriminator field.
 *
 * @param event - The raw OpenClaw gateway event.
 * @param opts  - Mapping options (workspace_id is required).
 * @returns A result indicating success (with envelope), skip, or failure.
 */
export function mapOpenClawEvent(
  event: OpenClawGatewayEvent,
  opts: OpenClawMapperOptions
): OpenClawMapperResult {
  const mapper = EVENT_MAPPERS[event.event];
  if (!mapper) {
    return {
      ok: false,
      error: buildA2AError({
        code: A2AErrorCodeEnum.InvalidPayload,
        message: `Unrecognized OpenClaw event type: ${event.event}`,
        details: { event_type: event.event },
      }),
    };
  }
  return mapper(event, opts);
}

/**
 * Map an OpenClaw event, asserting that it produces a TaskEnvelope
 * (not skipped). Throws A2AStructuredError on failure.
 *
 * Convenience wrapper for cases where the caller knows the event type
 * is task-generating and wants to skip the result discrimination.
 */
export function mapOpenClawEventStrict(
  event: OpenClawTaskGeneratingEvent,
  opts: OpenClawMapperOptions
): TaskEnvelope {
  const result = mapOpenClawEvent(event, opts);
  if ('error' in result) {
    throw new Error(`[${result.error.code}] ${result.error.message}`);
  }
  if ('skipped' in result) {
    throw new Error(`Event ${event.event} was unexpectedly skipped`);
  }
  return result.envelope;
}

// ---------------------------------------------------------------------------
// Re-export individual mappers for direct use
// ---------------------------------------------------------------------------

export {
  mapVoiceTranscript,
  mapAgentRequest,
  mapChatSubscribe,
  mapChatUnsubscribe,
  mapExecStarted,
  mapExecFinished,
  mapExecDenied,
  mapHookWake,
  mapHookAgent,
  mapAgentLifecycle,
  mapAgentTool,
  mapAgentAssistant,
  mapAgentError,
};
