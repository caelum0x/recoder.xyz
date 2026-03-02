/**
 * @module error-taxonomy
 *
 * Canonical error taxonomy for the Recoder A2A system.
 *
 * This module defines a deterministic set of error categories, codes, and
 * severity levels that every connector, service, and adapter in the system
 * must use when reporting errors. Having a single taxonomy ensures that:
 *
 * 1. Error codes are unique and greppable across the entire codebase.
 * 2. Consumers (UI, alerting, billing) can switch on `category` + `code`
 *    without brittle string matching.
 * 3. Retry logic can be driven by the `retryable` flag.
 * 4. Severity-based routing (PagerDuty, Slack, silent log) is consistent.
 *
 * Consumed by: all connectors, control-plane orchestrator, error-contract
 * module, UI error renderers.
 *
 * @example
 * ```ts
 * import {
 *   A2AErrorCategoryEnum,
 *   A2AErrorCodeEnum,
 *   buildA2AError,
 * } from '@recoder/shared/a2a/schemas';
 *
 * const error = buildA2AError({
 *   code: A2AErrorCodeEnum.ConnectorTimeout,
 *   message: 'Codex adapter timed out after 30s',
 * });
 * // => { code: 'CONNECTOR_TIMEOUT', category: 'connector', severity: 'high', ... }
 * ```
 */

// ---------------------------------------------------------------------------
// Error severity
// ---------------------------------------------------------------------------

/**
 * Severity levels for A2A errors, mirroring the audit severity for
 * consistency.
 */
export const A2AErrorSeverityEnum = {
  /** Low impact -- informational or gracefully handled. */
  Low: 'low',
  /** Medium impact -- degraded functionality but system continues. */
  Medium: 'medium',
  /** High impact -- a key operation failed and needs attention. */
  High: 'high',
  /** Critical -- system stability at risk, immediate action required. */
  Critical: 'critical',
} as const;

/** Union of all valid error severity string values. */
export type A2AErrorSeverity = (typeof A2AErrorSeverityEnum)[keyof typeof A2AErrorSeverityEnum];

// ---------------------------------------------------------------------------
// Error categories
// ---------------------------------------------------------------------------

/**
 * Top-level error categories. Every error code belongs to exactly one
 * category.
 */
export const A2AErrorCategoryEnum = {
  /** Errors in the envelope or message format (validation, parsing). */
  Envelope: 'envelope',
  /** Errors in the connector/adapter layer. */
  Connector: 'connector',
  /** Errors in the policy/approval plane. */
  Policy: 'policy',
  /** Errors in the task orchestration layer. */
  Task: 'task',
  /** Errors in the agent registry. */
  Registry: 'registry',
  /** Errors in the collaboration service. */
  Collaboration: 'collaboration',
  /** Transport/network-level errors. */
  Transport: 'transport',
  /** Authentication and authorization errors. */
  Auth: 'auth',
  /** Rate-limiting and quota errors. */
  RateLimit: 'rate_limit',
  /** Internal / unexpected errors. */
  Internal: 'internal',
} as const;

/** Union of all valid error category string values. */
export type A2AErrorCategory = (typeof A2AErrorCategoryEnum)[keyof typeof A2AErrorCategoryEnum];

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/**
 * Exhaustive list of machine-readable error codes.
 * Convention: UPPER_SNAKE_CASE, prefixed implicitly by category context.
 */
export const A2AErrorCodeEnum = {
  // -- envelope ---------------------------------------------------------------
  /** The envelope failed structural validation. */
  InvalidEnvelope: 'INVALID_ENVELOPE',
  /** The envelope version is unsupported. */
  UnsupportedEnvelopeVersion: 'UNSUPPORTED_ENVELOPE_VERSION',
  /** A required field is missing from the envelope. */
  MissingEnvelopeField: 'MISSING_ENVELOPE_FIELD',
  /** The payload kind is unknown or malformed. */
  InvalidPayload: 'INVALID_PAYLOAD',

  // -- connector --------------------------------------------------------------
  /** No connector is attached for the target agent. */
  ConnectorNotFound: 'CONNECTOR_NOT_FOUND',
  /** The connector timed out during task execution. */
  ConnectorTimeout: 'CONNECTOR_TIMEOUT',
  /** The connector returned an unexpected error. */
  ConnectorError: 'CONNECTOR_ERROR',
  /** The connector is temporarily unavailable. */
  ConnectorUnavailable: 'CONNECTOR_UNAVAILABLE',
  /** Protocol mismatch between connector and remote agent. */
  ProtocolMismatch: 'PROTOCOL_MISMATCH',

  // -- policy -----------------------------------------------------------------
  /** The policy plane denied the requested action. */
  PolicyDenied: 'POLICY_DENIED',
  /** No prompt handler is configured for the policy rule. */
  PolicyHandlerMissing: 'POLICY_HANDLER_MISSING',
  /** The policy evaluation timed out. */
  PolicyTimeout: 'POLICY_TIMEOUT',

  // -- task -------------------------------------------------------------------
  /** The task was not found. */
  TaskNotFound: 'TASK_NOT_FOUND',
  /** An invalid state transition was attempted. */
  InvalidStateTransition: 'INVALID_STATE_TRANSITION',
  /** The task has already reached a terminal state. */
  TaskAlreadyTerminal: 'TASK_ALREADY_TERMINAL',
  /** The task failed during execution. */
  TaskExecutionFailed: 'TASK_EXECUTION_FAILED',
  /** The task was cancelled. */
  TaskCancelled: 'TASK_CANCELLED',

  // -- registry ---------------------------------------------------------------
  /** The agent was not found in the registry. */
  AgentNotFound: 'AGENT_NOT_FOUND',
  /** The agent is already registered. */
  AgentAlreadyRegistered: 'AGENT_ALREADY_REGISTERED',
  /** The agent does not have the requested capability. */
  CapabilityNotFound: 'CAPABILITY_NOT_FOUND',

  // -- collaboration ----------------------------------------------------------
  /** The channel was not found. */
  ChannelNotFound: 'CHANNEL_NOT_FOUND',
  /** The thread was not found. */
  ThreadNotFound: 'THREAD_NOT_FOUND',
  /** The message was not found. */
  MessageNotFound: 'MESSAGE_NOT_FOUND',
  /** The sender is not a member of the target channel. */
  NotChannelMember: 'NOT_CHANNEL_MEMBER',

  // -- transport --------------------------------------------------------------
  /** A network request failed. */
  NetworkError: 'NETWORK_ERROR',
  /** The remote endpoint returned an unexpected status. */
  UnexpectedStatus: 'UNEXPECTED_STATUS',
  /** The request or response body could not be parsed. */
  SerializationError: 'SERIALIZATION_ERROR',

  // -- auth -------------------------------------------------------------------
  /** Authentication failed (invalid or missing credentials). */
  AuthenticationFailed: 'AUTHENTICATION_FAILED',
  /** The caller is not authorized for the requested operation. */
  AuthorizationDenied: 'AUTHORIZATION_DENIED',
  /** The access token has expired. */
  TokenExpired: 'TOKEN_EXPIRED',

  // -- rate limit -------------------------------------------------------------
  /** The caller has exceeded the rate limit. */
  RateLimitExceeded: 'RATE_LIMIT_EXCEEDED',
  /** The caller has exceeded their usage quota. */
  QuotaExceeded: 'QUOTA_EXCEEDED',

  // -- internal ---------------------------------------------------------------
  /** An unexpected internal error occurred. */
  InternalError: 'INTERNAL_ERROR',
  /** A configuration error was detected. */
  ConfigurationError: 'CONFIGURATION_ERROR',
} as const;

/** Union of all valid error code string values. */
export type A2AErrorCode = (typeof A2AErrorCodeEnum)[keyof typeof A2AErrorCodeEnum];

// ---------------------------------------------------------------------------
// Error code metadata
// ---------------------------------------------------------------------------

/**
 * Metadata associated with each error code, providing default severity,
 * category, retryable flag, and a human-readable description.
 */
export interface A2AErrorCodeMeta {
  /** The error code. */
  code: A2AErrorCode;
  /** The category this code belongs to. */
  category: A2AErrorCategory;
  /** Default severity for this error. */
  severity: A2AErrorSeverity;
  /** Whether operations that hit this error can be retried. */
  retryable: boolean;
  /** Short human-readable description. */
  description: string;
}

/**
 * Registry mapping every error code to its metadata.
 * This is the single source of truth for error classification.
 */
export const A2A_ERROR_CODE_REGISTRY: Readonly<Record<A2AErrorCode, A2AErrorCodeMeta>> = {
  // envelope
  [A2AErrorCodeEnum.InvalidEnvelope]: {
    code: A2AErrorCodeEnum.InvalidEnvelope,
    category: A2AErrorCategoryEnum.Envelope,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The envelope failed structural validation.',
  },
  [A2AErrorCodeEnum.UnsupportedEnvelopeVersion]: {
    code: A2AErrorCodeEnum.UnsupportedEnvelopeVersion,
    category: A2AErrorCategoryEnum.Envelope,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The envelope version is not supported by this service.',
  },
  [A2AErrorCodeEnum.MissingEnvelopeField]: {
    code: A2AErrorCodeEnum.MissingEnvelopeField,
    category: A2AErrorCategoryEnum.Envelope,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'A required field is missing from the envelope.',
  },
  [A2AErrorCodeEnum.InvalidPayload]: {
    code: A2AErrorCodeEnum.InvalidPayload,
    category: A2AErrorCategoryEnum.Envelope,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The payload kind is unknown or malformed.',
  },

  // connector
  [A2AErrorCodeEnum.ConnectorNotFound]: {
    code: A2AErrorCodeEnum.ConnectorNotFound,
    category: A2AErrorCategoryEnum.Connector,
    severity: A2AErrorSeverityEnum.High,
    retryable: false,
    description: 'No connector is attached for the target agent.',
  },
  [A2AErrorCodeEnum.ConnectorTimeout]: {
    code: A2AErrorCodeEnum.ConnectorTimeout,
    category: A2AErrorCategoryEnum.Connector,
    severity: A2AErrorSeverityEnum.High,
    retryable: true,
    description: 'The connector timed out during task execution.',
  },
  [A2AErrorCodeEnum.ConnectorError]: {
    code: A2AErrorCodeEnum.ConnectorError,
    category: A2AErrorCategoryEnum.Connector,
    severity: A2AErrorSeverityEnum.High,
    retryable: true,
    description: 'The connector returned an unexpected error.',
  },
  [A2AErrorCodeEnum.ConnectorUnavailable]: {
    code: A2AErrorCodeEnum.ConnectorUnavailable,
    category: A2AErrorCategoryEnum.Connector,
    severity: A2AErrorSeverityEnum.High,
    retryable: true,
    description: 'The connector is temporarily unavailable.',
  },
  [A2AErrorCodeEnum.ProtocolMismatch]: {
    code: A2AErrorCodeEnum.ProtocolMismatch,
    category: A2AErrorCategoryEnum.Connector,
    severity: A2AErrorSeverityEnum.High,
    retryable: false,
    description: 'Protocol mismatch between connector and remote agent.',
  },

  // policy
  [A2AErrorCodeEnum.PolicyDenied]: {
    code: A2AErrorCodeEnum.PolicyDenied,
    category: A2AErrorCategoryEnum.Policy,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The policy plane denied the requested action.',
  },
  [A2AErrorCodeEnum.PolicyHandlerMissing]: {
    code: A2AErrorCodeEnum.PolicyHandlerMissing,
    category: A2AErrorCategoryEnum.Policy,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'No prompt handler is configured for the policy rule.',
  },
  [A2AErrorCodeEnum.PolicyTimeout]: {
    code: A2AErrorCodeEnum.PolicyTimeout,
    category: A2AErrorCategoryEnum.Policy,
    severity: A2AErrorSeverityEnum.High,
    retryable: true,
    description: 'The policy evaluation timed out.',
  },

  // task
  [A2AErrorCodeEnum.TaskNotFound]: {
    code: A2AErrorCodeEnum.TaskNotFound,
    category: A2AErrorCategoryEnum.Task,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The task was not found.',
  },
  [A2AErrorCodeEnum.InvalidStateTransition]: {
    code: A2AErrorCodeEnum.InvalidStateTransition,
    category: A2AErrorCategoryEnum.Task,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'An invalid state transition was attempted.',
  },
  [A2AErrorCodeEnum.TaskAlreadyTerminal]: {
    code: A2AErrorCodeEnum.TaskAlreadyTerminal,
    category: A2AErrorCategoryEnum.Task,
    severity: A2AErrorSeverityEnum.Low,
    retryable: false,
    description: 'The task has already reached a terminal state.',
  },
  [A2AErrorCodeEnum.TaskExecutionFailed]: {
    code: A2AErrorCodeEnum.TaskExecutionFailed,
    category: A2AErrorCategoryEnum.Task,
    severity: A2AErrorSeverityEnum.High,
    retryable: true,
    description: 'The task failed during execution.',
  },
  [A2AErrorCodeEnum.TaskCancelled]: {
    code: A2AErrorCodeEnum.TaskCancelled,
    category: A2AErrorCategoryEnum.Task,
    severity: A2AErrorSeverityEnum.Low,
    retryable: false,
    description: 'The task was cancelled.',
  },

  // registry
  [A2AErrorCodeEnum.AgentNotFound]: {
    code: A2AErrorCodeEnum.AgentNotFound,
    category: A2AErrorCategoryEnum.Registry,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The agent was not found in the registry.',
  },
  [A2AErrorCodeEnum.AgentAlreadyRegistered]: {
    code: A2AErrorCodeEnum.AgentAlreadyRegistered,
    category: A2AErrorCategoryEnum.Registry,
    severity: A2AErrorSeverityEnum.Low,
    retryable: false,
    description: 'The agent is already registered.',
  },
  [A2AErrorCodeEnum.CapabilityNotFound]: {
    code: A2AErrorCodeEnum.CapabilityNotFound,
    category: A2AErrorCategoryEnum.Registry,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The agent does not have the requested capability.',
  },

  // collaboration
  [A2AErrorCodeEnum.ChannelNotFound]: {
    code: A2AErrorCodeEnum.ChannelNotFound,
    category: A2AErrorCategoryEnum.Collaboration,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The channel was not found.',
  },
  [A2AErrorCodeEnum.ThreadNotFound]: {
    code: A2AErrorCodeEnum.ThreadNotFound,
    category: A2AErrorCategoryEnum.Collaboration,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The thread was not found.',
  },
  [A2AErrorCodeEnum.MessageNotFound]: {
    code: A2AErrorCodeEnum.MessageNotFound,
    category: A2AErrorCategoryEnum.Collaboration,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The message was not found.',
  },
  [A2AErrorCodeEnum.NotChannelMember]: {
    code: A2AErrorCodeEnum.NotChannelMember,
    category: A2AErrorCategoryEnum.Collaboration,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The sender is not a member of the target channel.',
  },

  // transport
  [A2AErrorCodeEnum.NetworkError]: {
    code: A2AErrorCodeEnum.NetworkError,
    category: A2AErrorCategoryEnum.Transport,
    severity: A2AErrorSeverityEnum.High,
    retryable: true,
    description: 'A network request failed.',
  },
  [A2AErrorCodeEnum.UnexpectedStatus]: {
    code: A2AErrorCodeEnum.UnexpectedStatus,
    category: A2AErrorCategoryEnum.Transport,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: true,
    description: 'The remote endpoint returned an unexpected status.',
  },
  [A2AErrorCodeEnum.SerializationError]: {
    code: A2AErrorCodeEnum.SerializationError,
    category: A2AErrorCategoryEnum.Transport,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The request or response body could not be parsed.',
  },

  // auth
  [A2AErrorCodeEnum.AuthenticationFailed]: {
    code: A2AErrorCodeEnum.AuthenticationFailed,
    category: A2AErrorCategoryEnum.Auth,
    severity: A2AErrorSeverityEnum.High,
    retryable: false,
    description: 'Authentication failed (invalid or missing credentials).',
  },
  [A2AErrorCodeEnum.AuthorizationDenied]: {
    code: A2AErrorCodeEnum.AuthorizationDenied,
    category: A2AErrorCategoryEnum.Auth,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The caller is not authorized for the requested operation.',
  },
  [A2AErrorCodeEnum.TokenExpired]: {
    code: A2AErrorCodeEnum.TokenExpired,
    category: A2AErrorCategoryEnum.Auth,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: true,
    description: 'The access token has expired.',
  },

  // rate limit
  [A2AErrorCodeEnum.RateLimitExceeded]: {
    code: A2AErrorCodeEnum.RateLimitExceeded,
    category: A2AErrorCategoryEnum.RateLimit,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: true,
    description: 'The caller has exceeded the rate limit.',
  },
  [A2AErrorCodeEnum.QuotaExceeded]: {
    code: A2AErrorCodeEnum.QuotaExceeded,
    category: A2AErrorCategoryEnum.RateLimit,
    severity: A2AErrorSeverityEnum.Medium,
    retryable: false,
    description: 'The caller has exceeded their usage quota.',
  },

  // internal
  [A2AErrorCodeEnum.InternalError]: {
    code: A2AErrorCodeEnum.InternalError,
    category: A2AErrorCategoryEnum.Internal,
    severity: A2AErrorSeverityEnum.Critical,
    retryable: false,
    description: 'An unexpected internal error occurred.',
  },
  [A2AErrorCodeEnum.ConfigurationError]: {
    code: A2AErrorCodeEnum.ConfigurationError,
    category: A2AErrorCategoryEnum.Internal,
    severity: A2AErrorSeverityEnum.High,
    retryable: false,
    description: 'A configuration error was detected.',
  },
};

// ---------------------------------------------------------------------------
// Structured error type
// ---------------------------------------------------------------------------

/**
 * A structured A2A error that can be embedded in `TaskEnvelope.error`,
 * returned from connectors, or included in API error responses.
 */
export interface A2AError {
  /** Machine-readable error code from the taxonomy. */
  code: A2AErrorCode;
  /** Error category. */
  category: A2AErrorCategory;
  /** Human-readable error message. */
  message: string;
  /** Error severity. */
  severity: A2AErrorSeverity;
  /** Whether the operation can be retried. */
  retryable: boolean;
  /** Additional details about the error. */
  details?: Record<string, unknown>;
  /** ISO-8601 timestamp of when the error occurred. */
  timestamp?: string;
  /** Trace ID for correlation. */
  trace_id?: string;
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

/**
 * Build a structured `A2AError` from a code and message.
 * Category, severity, and retryable flag are automatically looked up from
 * the error code registry.
 *
 * @param input - The error code, message, and optional overrides.
 * @returns A fully populated `A2AError`.
 */
export function buildA2AError(input: {
  code: A2AErrorCode;
  message: string;
  details?: Record<string, unknown>;
  trace_id?: string;
  /** Override the default severity from the registry. */
  severity?: A2AErrorSeverity;
  /** Override the default retryable flag from the registry. */
  retryable?: boolean;
  /** Override the timestamp (defaults to now). */
  now?: string;
}): A2AError {
  const meta = A2A_ERROR_CODE_REGISTRY[input.code];
  return {
    code: input.code,
    category: meta.category,
    message: input.message,
    severity: input.severity ?? meta.severity,
    retryable: input.retryable ?? meta.retryable,
    details: input.details,
    timestamp: input.now ?? new Date().toISOString(),
    trace_id: input.trace_id,
  };
}

/**
 * Look up the metadata for an error code.
 *
 * @param code - The error code to look up.
 * @returns The error code metadata, or `undefined` if the code is not in the registry.
 */
export function getErrorCodeMeta(code: string): A2AErrorCodeMeta | undefined {
  return A2A_ERROR_CODE_REGISTRY[code as A2AErrorCode];
}

/**
 * Check whether a given string is a valid A2A error code.
 *
 * @param code - The string to check.
 */
export function isA2AErrorCode(code: string): code is A2AErrorCode {
  return code in A2A_ERROR_CODE_REGISTRY;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * A throwable Error subclass that carries the full structured A2A error.
 * Useful in control-plane code where you need to throw and catch typed errors.
 */
export class A2AStructuredError extends Error {
  /** The structured error payload. */
  readonly a2aError: A2AError;

  constructor(a2aError: A2AError) {
    super(`[${a2aError.code}] ${a2aError.message}`);
    this.name = 'A2AStructuredError';
    this.a2aError = a2aError;
    Object.setPrototypeOf(this, A2AStructuredError.prototype);
  }

  /** Convenience getter for the error code. */
  get code(): A2AErrorCode {
    return this.a2aError.code;
  }

  /** Convenience getter for the error category. */
  get category(): A2AErrorCategory {
    return this.a2aError.category;
  }

  /** Convenience getter for the severity. */
  get severity(): A2AErrorSeverity {
    return this.a2aError.severity;
  }

  /** Whether this error is retryable. */
  get retryable(): boolean {
    return this.a2aError.retryable;
  }
}
