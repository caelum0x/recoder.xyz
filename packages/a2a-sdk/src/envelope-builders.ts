/**
 * @module envelope-builders
 *
 * Convenience factory functions for creating `TaskEnvelope` instances
 * pre-configured for specific connector platforms.
 *
 * These builders reduce boilerplate in adapter code by pre-filling the
 * `connector`, `requester`, and `assignee` fields with sensible defaults
 * for each platform while still allowing full override.
 *
 * @example
 * ```ts
 * import { buildCodexEnvelope, buildClaudeEnvelope } from '@recoder/a2a-sdk/envelope-builders';
 *
 * const codexEnv = buildCodexEnvelope({
 *   id: 'task_01',
 *   workspace_id: 'ws_abc',
 *   thread_id: 'thr_def',
 *   trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
 *   requester: { agent_id: 'agent-pm', platform: 'recoder_pm' },
 *   payload: { kind: 'text', text: 'Implement auth flow' },
 * });
 * ```
 */

import {
  type TaskEnvelope,
  type TaskAgentRef,
  type TaskConnectorInfo,
  type TaskState,
  type TaskResult,
  type TaskErrorInfo,
  type CreateTaskEnvelopeInput,
  TaskStateEnum,
  createTaskEnvelope,
  transitionTaskEnvelope,
} from '@recoder/shared/a2a/schemas';

import type { RecoderPayload, RecoderAgentPlatform } from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Shared input type for connector envelope builders
// ---------------------------------------------------------------------------

/**
 * Minimal input for a connector-specific envelope builder.
 * Fields that can be derived from the connector context are optional.
 */
export interface ConnectorEnvelopeInput {
  /** Unique task ID. */
  id: string;
  /** Workspace ID. */
  workspace_id: string;
  /** Thread ID. */
  thread_id: string;
  /** Trace ID (W3C Trace Context compatible). */
  trace_id: string;
  /** Optional parent span ID. */
  parent_id?: string;
  /** The requester agent reference. */
  requester: TaskAgentRef;
  /** Optional override for the assignee (defaults to the connector agent). */
  assignee?: TaskAgentRef;
  /** The task payload. */
  payload: RecoderPayload | RecoderPayload[];
  /** Optional metadata. */
  metadata?: Record<string, unknown>;
  /** Optional tags. */
  tags?: string[];
  /** Override the initial state (defaults to 'submitted'). */
  initial_state?: TaskState;
  /** Override the creation timestamp. */
  now?: string;
}

// ---------------------------------------------------------------------------
// Codex envelope builder
// ---------------------------------------------------------------------------

/**
 * Optional overrides specific to Codex envelopes.
 */
export interface CodexEnvelopeOptions {
  /** Override the Codex connector ID (defaults to 'codex-v1'). */
  connector_id?: string;
  /** Codex model name (stored in connector metadata). */
  model?: string;
  /** Codex API endpoint (stored in connector metadata). */
  endpoint?: string;
  /** Additional connector metadata. */
  connector_metadata?: Record<string, unknown>;
}

/**
 * Build a `TaskEnvelope` pre-configured for the Codex connector.
 *
 * Defaults:
 * - `connector.platform`: `'codex'`
 * - `connector.protocol`: `'jsonrpc'`
 * - `connector.connector_id`: `'codex-v1'`
 * - `assignee.platform`: `'codex'`
 *
 * @param input - The core envelope fields.
 * @param options - Optional Codex-specific overrides.
 * @returns A fully populated `TaskEnvelope`.
 */
export function buildCodexEnvelope(
  input: ConnectorEnvelopeInput,
  options?: CodexEnvelopeOptions,
): TaskEnvelope {
  const connectorMeta: Record<string, unknown> = {
    ...options?.connector_metadata,
  };
  if (options?.model) connectorMeta.model = options.model;
  if (options?.endpoint) connectorMeta.endpoint = options.endpoint;

  const connector: TaskConnectorInfo = {
    platform: 'codex',
    protocol: 'jsonrpc',
    connector_id: options?.connector_id ?? 'codex-v1',
    name: 'Codex Adapter',
    metadata: Object.keys(connectorMeta).length > 0 ? connectorMeta : undefined,
  };

  const assignee: TaskAgentRef = input.assignee ?? {
    agent_id: `codex-agent-${input.workspace_id}`,
    platform: 'codex',
    name: 'Codex Agent',
  };

  return createTaskEnvelope({
    id: input.id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    trace_id: input.trace_id,
    parent_id: input.parent_id,
    requester: input.requester,
    assignee,
    connector,
    payload: input.payload,
    metadata: input.metadata,
    tags: input.tags,
    initial_state: input.initial_state,
    now: input.now,
  });
}

// ---------------------------------------------------------------------------
// Claude Code envelope builder
// ---------------------------------------------------------------------------

/**
 * Optional overrides specific to Claude Code envelopes.
 */
export interface ClaudeEnvelopeOptions {
  /** Override the Claude connector ID (defaults to 'claude-code-v1'). */
  connector_id?: string;
  /** Claude model name (stored in connector metadata). */
  model?: string;
  /** Claude API endpoint (stored in connector metadata). */
  endpoint?: string;
  /** Maximum tokens for the Claude session. */
  max_tokens?: number;
  /** Additional connector metadata. */
  connector_metadata?: Record<string, unknown>;
}

/**
 * Build a `TaskEnvelope` pre-configured for the Claude Code connector.
 *
 * Defaults:
 * - `connector.platform`: `'claude_code'`
 * - `connector.protocol`: `'jsonrpc'`
 * - `connector.connector_id`: `'claude-code-v1'`
 * - `assignee.platform`: `'claude_code'`
 *
 * @param input - The core envelope fields.
 * @param options - Optional Claude-specific overrides.
 * @returns A fully populated `TaskEnvelope`.
 */
export function buildClaudeEnvelope(
  input: ConnectorEnvelopeInput,
  options?: ClaudeEnvelopeOptions,
): TaskEnvelope {
  const connectorMeta: Record<string, unknown> = {
    ...options?.connector_metadata,
  };
  if (options?.model) connectorMeta.model = options.model;
  if (options?.endpoint) connectorMeta.endpoint = options.endpoint;
  if (options?.max_tokens !== undefined) connectorMeta.max_tokens = options.max_tokens;

  const connector: TaskConnectorInfo = {
    platform: 'claude_code',
    protocol: 'jsonrpc',
    connector_id: options?.connector_id ?? 'claude-code-v1',
    name: 'Claude Code Adapter',
    metadata: Object.keys(connectorMeta).length > 0 ? connectorMeta : undefined,
  };

  const assignee: TaskAgentRef = input.assignee ?? {
    agent_id: `claude-agent-${input.workspace_id}`,
    platform: 'claude_code',
    name: 'Claude Code Agent',
  };

  return createTaskEnvelope({
    id: input.id,
    workspace_id: input.workspace_id,
    thread_id: input.thread_id,
    trace_id: input.trace_id,
    parent_id: input.parent_id,
    requester: input.requester,
    assignee,
    connector,
    payload: input.payload,
    metadata: input.metadata,
    tags: input.tags,
    initial_state: input.initial_state,
    now: input.now,
  });
}

// ---------------------------------------------------------------------------
// Envelope lifecycle helpers
// ---------------------------------------------------------------------------

/**
 * Apply a result to a completed task envelope.
 *
 * Transitions the envelope to `completed` and attaches the result payload.
 *
 * @param envelope - The current task envelope (must be in a non-terminal state).
 * @param result - The result data.
 * @param options - Optional reason and actor for the transition.
 * @returns The updated envelope with state `completed` and the result attached.
 */
export function completeEnvelope(
  envelope: TaskEnvelope,
  result: TaskResult,
  options?: { reason?: string; triggered_by?: string; now?: string },
): TaskEnvelope {
  const transitioned = transitionTaskEnvelope(envelope, TaskStateEnum.Completed, options);
  return {
    ...transitioned,
    result,
  };
}

/**
 * Apply an error to a failed task envelope.
 *
 * Transitions the envelope to `failed` and attaches the error info.
 *
 * @param envelope - The current task envelope (must be in a non-terminal state).
 * @param error - The error information.
 * @param options - Optional reason and actor for the transition.
 * @returns The updated envelope with state `failed` and the error attached.
 */
export function failEnvelope(
  envelope: TaskEnvelope,
  error: TaskErrorInfo,
  options?: { reason?: string; triggered_by?: string; now?: string },
): TaskEnvelope {
  const transitioned = transitionTaskEnvelope(envelope, TaskStateEnum.Failed, options);
  return {
    ...transitioned,
    error,
  };
}

/**
 * Cancel a task envelope.
 *
 * Transitions the envelope to `cancelled`.
 *
 * @param envelope - The current task envelope.
 * @param options - Optional reason and actor for the transition.
 * @returns The updated envelope with state `cancelled`.
 */
export function cancelEnvelope(
  envelope: TaskEnvelope,
  options?: { reason?: string; triggered_by?: string; now?: string },
): TaskEnvelope {
  return transitionTaskEnvelope(envelope, TaskStateEnum.Cancelled, options);
}

/**
 * Start working on a task envelope.
 *
 * Transitions the envelope from `submitted` to `working`.
 *
 * @param envelope - The current task envelope (must be in `submitted` state).
 * @param options - Optional reason and actor for the transition.
 * @returns The updated envelope with state `working`.
 */
export function startEnvelope(
  envelope: TaskEnvelope,
  options?: { reason?: string; triggered_by?: string; now?: string },
): TaskEnvelope {
  return transitionTaskEnvelope(envelope, TaskStateEnum.Working, options);
}

// ---------------------------------------------------------------------------
// Utility: Convert A2AError to TaskErrorInfo
// ---------------------------------------------------------------------------

/**
 * Convert a canonical `A2AError` to the `TaskErrorInfo` shape expected
 * by the `TaskEnvelope.error` field.
 *
 * @param a2aError - The source A2AError.
 * @returns A `TaskErrorInfo` suitable for embedding in an envelope.
 */
export function a2aErrorToTaskErrorInfo(a2aError: {
  code: string;
  category: string;
  message: string;
  severity: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}): TaskErrorInfo {
  return {
    code: a2aError.code,
    category: a2aError.category,
    message: a2aError.message,
    severity: a2aError.severity as TaskErrorInfo['severity'],
    retryable: a2aError.retryable,
    details: a2aError.details,
  };
}
