"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.A2AStructuredError = exports.A2A_ERROR_CODE_REGISTRY = exports.A2AErrorCodeEnum = exports.A2AErrorCategoryEnum = exports.A2AErrorSeverityEnum = void 0;
exports.buildA2AError = buildA2AError;
exports.getErrorCodeMeta = getErrorCodeMeta;
exports.isA2AErrorCode = isA2AErrorCode;
// ---------------------------------------------------------------------------
// Error severity
// ---------------------------------------------------------------------------
/**
 * Severity levels for A2A errors, mirroring the audit severity for
 * consistency.
 */
exports.A2AErrorSeverityEnum = {
    /** Low impact -- informational or gracefully handled. */
    Low: 'low',
    /** Medium impact -- degraded functionality but system continues. */
    Medium: 'medium',
    /** High impact -- a key operation failed and needs attention. */
    High: 'high',
    /** Critical -- system stability at risk, immediate action required. */
    Critical: 'critical',
};
// ---------------------------------------------------------------------------
// Error categories
// ---------------------------------------------------------------------------
/**
 * Top-level error categories. Every error code belongs to exactly one
 * category.
 */
exports.A2AErrorCategoryEnum = {
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
};
// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------
/**
 * Exhaustive list of machine-readable error codes.
 * Convention: UPPER_SNAKE_CASE, prefixed implicitly by category context.
 */
exports.A2AErrorCodeEnum = {
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
};
/**
 * Registry mapping every error code to its metadata.
 * This is the single source of truth for error classification.
 */
exports.A2A_ERROR_CODE_REGISTRY = {
    // envelope
    [exports.A2AErrorCodeEnum.InvalidEnvelope]: {
        code: exports.A2AErrorCodeEnum.InvalidEnvelope,
        category: exports.A2AErrorCategoryEnum.Envelope,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The envelope failed structural validation.',
    },
    [exports.A2AErrorCodeEnum.UnsupportedEnvelopeVersion]: {
        code: exports.A2AErrorCodeEnum.UnsupportedEnvelopeVersion,
        category: exports.A2AErrorCategoryEnum.Envelope,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The envelope version is not supported by this service.',
    },
    [exports.A2AErrorCodeEnum.MissingEnvelopeField]: {
        code: exports.A2AErrorCodeEnum.MissingEnvelopeField,
        category: exports.A2AErrorCategoryEnum.Envelope,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'A required field is missing from the envelope.',
    },
    [exports.A2AErrorCodeEnum.InvalidPayload]: {
        code: exports.A2AErrorCodeEnum.InvalidPayload,
        category: exports.A2AErrorCategoryEnum.Envelope,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The payload kind is unknown or malformed.',
    },
    // connector
    [exports.A2AErrorCodeEnum.ConnectorNotFound]: {
        code: exports.A2AErrorCodeEnum.ConnectorNotFound,
        category: exports.A2AErrorCategoryEnum.Connector,
        severity: exports.A2AErrorSeverityEnum.High,
        retryable: false,
        description: 'No connector is attached for the target agent.',
    },
    [exports.A2AErrorCodeEnum.ConnectorTimeout]: {
        code: exports.A2AErrorCodeEnum.ConnectorTimeout,
        category: exports.A2AErrorCategoryEnum.Connector,
        severity: exports.A2AErrorSeverityEnum.High,
        retryable: true,
        description: 'The connector timed out during task execution.',
    },
    [exports.A2AErrorCodeEnum.ConnectorError]: {
        code: exports.A2AErrorCodeEnum.ConnectorError,
        category: exports.A2AErrorCategoryEnum.Connector,
        severity: exports.A2AErrorSeverityEnum.High,
        retryable: true,
        description: 'The connector returned an unexpected error.',
    },
    [exports.A2AErrorCodeEnum.ConnectorUnavailable]: {
        code: exports.A2AErrorCodeEnum.ConnectorUnavailable,
        category: exports.A2AErrorCategoryEnum.Connector,
        severity: exports.A2AErrorSeverityEnum.High,
        retryable: true,
        description: 'The connector is temporarily unavailable.',
    },
    [exports.A2AErrorCodeEnum.ProtocolMismatch]: {
        code: exports.A2AErrorCodeEnum.ProtocolMismatch,
        category: exports.A2AErrorCategoryEnum.Connector,
        severity: exports.A2AErrorSeverityEnum.High,
        retryable: false,
        description: 'Protocol mismatch between connector and remote agent.',
    },
    // policy
    [exports.A2AErrorCodeEnum.PolicyDenied]: {
        code: exports.A2AErrorCodeEnum.PolicyDenied,
        category: exports.A2AErrorCategoryEnum.Policy,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The policy plane denied the requested action.',
    },
    [exports.A2AErrorCodeEnum.PolicyHandlerMissing]: {
        code: exports.A2AErrorCodeEnum.PolicyHandlerMissing,
        category: exports.A2AErrorCategoryEnum.Policy,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'No prompt handler is configured for the policy rule.',
    },
    [exports.A2AErrorCodeEnum.PolicyTimeout]: {
        code: exports.A2AErrorCodeEnum.PolicyTimeout,
        category: exports.A2AErrorCategoryEnum.Policy,
        severity: exports.A2AErrorSeverityEnum.High,
        retryable: true,
        description: 'The policy evaluation timed out.',
    },
    // task
    [exports.A2AErrorCodeEnum.TaskNotFound]: {
        code: exports.A2AErrorCodeEnum.TaskNotFound,
        category: exports.A2AErrorCategoryEnum.Task,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The task was not found.',
    },
    [exports.A2AErrorCodeEnum.InvalidStateTransition]: {
        code: exports.A2AErrorCodeEnum.InvalidStateTransition,
        category: exports.A2AErrorCategoryEnum.Task,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'An invalid state transition was attempted.',
    },
    [exports.A2AErrorCodeEnum.TaskAlreadyTerminal]: {
        code: exports.A2AErrorCodeEnum.TaskAlreadyTerminal,
        category: exports.A2AErrorCategoryEnum.Task,
        severity: exports.A2AErrorSeverityEnum.Low,
        retryable: false,
        description: 'The task has already reached a terminal state.',
    },
    [exports.A2AErrorCodeEnum.TaskExecutionFailed]: {
        code: exports.A2AErrorCodeEnum.TaskExecutionFailed,
        category: exports.A2AErrorCategoryEnum.Task,
        severity: exports.A2AErrorSeverityEnum.High,
        retryable: true,
        description: 'The task failed during execution.',
    },
    [exports.A2AErrorCodeEnum.TaskCancelled]: {
        code: exports.A2AErrorCodeEnum.TaskCancelled,
        category: exports.A2AErrorCategoryEnum.Task,
        severity: exports.A2AErrorSeverityEnum.Low,
        retryable: false,
        description: 'The task was cancelled.',
    },
    // registry
    [exports.A2AErrorCodeEnum.AgentNotFound]: {
        code: exports.A2AErrorCodeEnum.AgentNotFound,
        category: exports.A2AErrorCategoryEnum.Registry,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The agent was not found in the registry.',
    },
    [exports.A2AErrorCodeEnum.AgentAlreadyRegistered]: {
        code: exports.A2AErrorCodeEnum.AgentAlreadyRegistered,
        category: exports.A2AErrorCategoryEnum.Registry,
        severity: exports.A2AErrorSeverityEnum.Low,
        retryable: false,
        description: 'The agent is already registered.',
    },
    [exports.A2AErrorCodeEnum.CapabilityNotFound]: {
        code: exports.A2AErrorCodeEnum.CapabilityNotFound,
        category: exports.A2AErrorCategoryEnum.Registry,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The agent does not have the requested capability.',
    },
    // collaboration
    [exports.A2AErrorCodeEnum.ChannelNotFound]: {
        code: exports.A2AErrorCodeEnum.ChannelNotFound,
        category: exports.A2AErrorCategoryEnum.Collaboration,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The channel was not found.',
    },
    [exports.A2AErrorCodeEnum.ThreadNotFound]: {
        code: exports.A2AErrorCodeEnum.ThreadNotFound,
        category: exports.A2AErrorCategoryEnum.Collaboration,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The thread was not found.',
    },
    [exports.A2AErrorCodeEnum.MessageNotFound]: {
        code: exports.A2AErrorCodeEnum.MessageNotFound,
        category: exports.A2AErrorCategoryEnum.Collaboration,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The message was not found.',
    },
    [exports.A2AErrorCodeEnum.NotChannelMember]: {
        code: exports.A2AErrorCodeEnum.NotChannelMember,
        category: exports.A2AErrorCategoryEnum.Collaboration,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The sender is not a member of the target channel.',
    },
    // transport
    [exports.A2AErrorCodeEnum.NetworkError]: {
        code: exports.A2AErrorCodeEnum.NetworkError,
        category: exports.A2AErrorCategoryEnum.Transport,
        severity: exports.A2AErrorSeverityEnum.High,
        retryable: true,
        description: 'A network request failed.',
    },
    [exports.A2AErrorCodeEnum.UnexpectedStatus]: {
        code: exports.A2AErrorCodeEnum.UnexpectedStatus,
        category: exports.A2AErrorCategoryEnum.Transport,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: true,
        description: 'The remote endpoint returned an unexpected status.',
    },
    [exports.A2AErrorCodeEnum.SerializationError]: {
        code: exports.A2AErrorCodeEnum.SerializationError,
        category: exports.A2AErrorCategoryEnum.Transport,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The request or response body could not be parsed.',
    },
    // auth
    [exports.A2AErrorCodeEnum.AuthenticationFailed]: {
        code: exports.A2AErrorCodeEnum.AuthenticationFailed,
        category: exports.A2AErrorCategoryEnum.Auth,
        severity: exports.A2AErrorSeverityEnum.High,
        retryable: false,
        description: 'Authentication failed (invalid or missing credentials).',
    },
    [exports.A2AErrorCodeEnum.AuthorizationDenied]: {
        code: exports.A2AErrorCodeEnum.AuthorizationDenied,
        category: exports.A2AErrorCategoryEnum.Auth,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The caller is not authorized for the requested operation.',
    },
    [exports.A2AErrorCodeEnum.TokenExpired]: {
        code: exports.A2AErrorCodeEnum.TokenExpired,
        category: exports.A2AErrorCategoryEnum.Auth,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: true,
        description: 'The access token has expired.',
    },
    // rate limit
    [exports.A2AErrorCodeEnum.RateLimitExceeded]: {
        code: exports.A2AErrorCodeEnum.RateLimitExceeded,
        category: exports.A2AErrorCategoryEnum.RateLimit,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: true,
        description: 'The caller has exceeded the rate limit.',
    },
    [exports.A2AErrorCodeEnum.QuotaExceeded]: {
        code: exports.A2AErrorCodeEnum.QuotaExceeded,
        category: exports.A2AErrorCategoryEnum.RateLimit,
        severity: exports.A2AErrorSeverityEnum.Medium,
        retryable: false,
        description: 'The caller has exceeded their usage quota.',
    },
    // internal
    [exports.A2AErrorCodeEnum.InternalError]: {
        code: exports.A2AErrorCodeEnum.InternalError,
        category: exports.A2AErrorCategoryEnum.Internal,
        severity: exports.A2AErrorSeverityEnum.Critical,
        retryable: false,
        description: 'An unexpected internal error occurred.',
    },
    [exports.A2AErrorCodeEnum.ConfigurationError]: {
        code: exports.A2AErrorCodeEnum.ConfigurationError,
        category: exports.A2AErrorCategoryEnum.Internal,
        severity: exports.A2AErrorSeverityEnum.High,
        retryable: false,
        description: 'A configuration error was detected.',
    },
};
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
function buildA2AError(input) {
    const meta = exports.A2A_ERROR_CODE_REGISTRY[input.code];
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
function getErrorCodeMeta(code) {
    return exports.A2A_ERROR_CODE_REGISTRY[code];
}
/**
 * Check whether a given string is a valid A2A error code.
 *
 * @param code - The string to check.
 */
function isA2AErrorCode(code) {
    return code in exports.A2A_ERROR_CODE_REGISTRY;
}
// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------
/**
 * A throwable Error subclass that carries the full structured A2A error.
 * Useful in control-plane code where you need to throw and catch typed errors.
 */
class A2AStructuredError extends Error {
    /** The structured error payload. */
    a2aError;
    constructor(a2aError) {
        super(`[${a2aError.code}] ${a2aError.message}`);
        this.name = 'A2AStructuredError';
        this.a2aError = a2aError;
        Object.setPrototypeOf(this, A2AStructuredError.prototype);
    }
    /** Convenience getter for the error code. */
    get code() {
        return this.a2aError.code;
    }
    /** Convenience getter for the error category. */
    get category() {
        return this.a2aError.category;
    }
    /** Convenience getter for the severity. */
    get severity() {
        return this.a2aError.severity;
    }
    /** Whether this error is retryable. */
    get retryable() {
        return this.a2aError.retryable;
    }
}
exports.A2AStructuredError = A2AStructuredError;
