/**
 * @module error-taxonomy
 *
 * Canonical error taxonomy for the Recoder A2A system.
 */

// ---------------------------------------------------------------------------
// Error severity
// ---------------------------------------------------------------------------

export const A2AErrorSeverityEnum = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Critical: 'critical',
} as const;

export type A2AErrorSeverity = (typeof A2AErrorSeverityEnum)[keyof typeof A2AErrorSeverityEnum];

// ---------------------------------------------------------------------------
// Error categories
// ---------------------------------------------------------------------------

export const A2AErrorCategoryEnum = {
  Envelope: 'envelope',
  Connector: 'connector',
  Policy: 'policy',
  Task: 'task',
  Registry: 'registry',
  Collaboration: 'collaboration',
  Transport: 'transport',
  Auth: 'auth',
  RateLimit: 'rate_limit',
  Internal: 'internal',
} as const;

export type A2AErrorCategory = (typeof A2AErrorCategoryEnum)[keyof typeof A2AErrorCategoryEnum];

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const A2AErrorCodeEnum = {
  // -- envelope ---------------------------------------------------------------
  InvalidEnvelope: 'INVALID_ENVELOPE',
  UnsupportedEnvelopeVersion: 'UNSUPPORTED_ENVELOPE_VERSION',
  MissingEnvelopeField: 'MISSING_ENVELOPE_FIELD',
  InvalidPayload: 'INVALID_PAYLOAD',
  InvalidParams: 'INVALID_ENVELOPE',

  // -- connector --------------------------------------------------------------
  ConnectorNotFound: 'CONNECTOR_NOT_FOUND',
  ConnectorTimeout: 'CONNECTOR_TIMEOUT',
  ConnectorError: 'CONNECTOR_ERROR',
  ConnectorUnavailable: 'CONNECTOR_UNAVAILABLE',
  ProtocolMismatch: 'PROTOCOL_MISMATCH',

  // -- policy -----------------------------------------------------------------
  PolicyDenied: 'POLICY_DENIED',
  PolicyHandlerMissing: 'POLICY_HANDLER_MISSING',
  PolicyTimeout: 'POLICY_TIMEOUT',

  // -- task -------------------------------------------------------------------
  TaskNotFound: 'TASK_NOT_FOUND',
  InvalidStateTransition: 'INVALID_STATE_TRANSITION',
  TaskAlreadyTerminal: 'TASK_ALREADY_TERMINAL',
  TaskExecutionFailed: 'TASK_EXECUTION_FAILED',
  TaskCancelled: 'TASK_CANCELLED',

  // -- registry ---------------------------------------------------------------
  AgentNotFound: 'AGENT_NOT_FOUND',
  AgentAlreadyRegistered: 'AGENT_ALREADY_REGISTERED',
  CapabilityNotFound: 'CAPABILITY_NOT_FOUND',

  // -- collaboration ----------------------------------------------------------
  ChannelNotFound: 'CHANNEL_NOT_FOUND',
  ThreadNotFound: 'THREAD_NOT_FOUND',
  MessageNotFound: 'MESSAGE_NOT_FOUND',
  NotChannelMember: 'NOT_CHANNEL_MEMBER',

  // -- transport --------------------------------------------------------------
  NetworkError: 'NETWORK_ERROR',
  UnexpectedStatus: 'UNEXPECTED_STATUS',
  SerializationError: 'SERIALIZATION_ERROR',

  // -- auth -------------------------------------------------------------------
  AuthenticationFailed: 'AUTHENTICATION_FAILED',
  AuthorizationDenied: 'AUTHORIZATION_DENIED',
  TokenExpired: 'TOKEN_EXPIRED',

  // -- rate limit -------------------------------------------------------------
  RateLimitExceeded: 'RATE_LIMIT_EXCEEDED',
  QuotaExceeded: 'QUOTA_EXCEEDED',

  // -- internal ---------------------------------------------------------------
  InternalError: 'INTERNAL_ERROR',
  ConfigurationError: 'CONFIGURATION_ERROR',
} as const;

export type A2AErrorCode = (typeof A2AErrorCodeEnum)[keyof typeof A2AErrorCodeEnum];

// ---------------------------------------------------------------------------
// Error code metadata
// ---------------------------------------------------------------------------

export interface A2AErrorCodeMeta {
  code: A2AErrorCode;
  category: A2AErrorCategory;
  severity: A2AErrorSeverity;
  retryable: boolean;
  description: string;
}

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

export interface A2AError {
  code: A2AErrorCode;
  category: A2AErrorCategory;
  message: string;
  severity: A2AErrorSeverity;
  retryable: boolean;
  details?: Record<string, unknown>;
  timestamp?: string;
  trace_id?: string;
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

export function buildA2AError(input: {
  code: A2AErrorCode;
  message: string;
  details?: Record<string, unknown>;
  trace_id?: string;
  severity?: A2AErrorSeverity;
  retryable?: boolean;
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

export function getErrorCodeMeta(code: string): A2AErrorCodeMeta | undefined {
  return A2A_ERROR_CODE_REGISTRY[code as A2AErrorCode];
}

export function isA2AErrorCode(code: string): code is A2AErrorCode {
  return code in A2A_ERROR_CODE_REGISTRY;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class A2AStructuredError extends Error {
  readonly a2aError: A2AError;

  constructor(a2aError: A2AError) {
    super(`[${a2aError.code}] ${a2aError.message}`);
    this.name = 'A2AStructuredError';
    this.a2aError = a2aError;
    Object.setPrototypeOf(this, A2AStructuredError.prototype);
  }

  get code(): A2AErrorCode {
    return this.a2aError.code;
  }

  get category(): A2AErrorCategory {
    return this.a2aError.category;
  }

  get severity(): A2AErrorSeverity {
    return this.a2aError.severity;
  }

  get retryable(): boolean {
    return this.a2aError.retryable;
  }
}
