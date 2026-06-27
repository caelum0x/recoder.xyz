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
/**
 * Severity levels for A2A errors, mirroring the audit severity for
 * consistency.
 */
export declare const A2AErrorSeverityEnum: {
    /** Low impact -- informational or gracefully handled. */
    readonly Low: "low";
    /** Medium impact -- degraded functionality but system continues. */
    readonly Medium: "medium";
    /** High impact -- a key operation failed and needs attention. */
    readonly High: "high";
    /** Critical -- system stability at risk, immediate action required. */
    readonly Critical: "critical";
};
/** Union of all valid error severity string values. */
export type A2AErrorSeverity = (typeof A2AErrorSeverityEnum)[keyof typeof A2AErrorSeverityEnum];
/**
 * Top-level error categories. Every error code belongs to exactly one
 * category.
 */
export declare const A2AErrorCategoryEnum: {
    /** Errors in the envelope or message format (validation, parsing). */
    readonly Envelope: "envelope";
    /** Errors in the connector/adapter layer. */
    readonly Connector: "connector";
    /** Errors in the policy/approval plane. */
    readonly Policy: "policy";
    /** Errors in the task orchestration layer. */
    readonly Task: "task";
    /** Errors in the agent registry. */
    readonly Registry: "registry";
    /** Errors in the collaboration service. */
    readonly Collaboration: "collaboration";
    /** Transport/network-level errors. */
    readonly Transport: "transport";
    /** Authentication and authorization errors. */
    readonly Auth: "auth";
    /** Rate-limiting and quota errors. */
    readonly RateLimit: "rate_limit";
    /** Internal / unexpected errors. */
    readonly Internal: "internal";
};
/** Union of all valid error category string values. */
export type A2AErrorCategory = (typeof A2AErrorCategoryEnum)[keyof typeof A2AErrorCategoryEnum];
/**
 * Exhaustive list of machine-readable error codes.
 * Convention: UPPER_SNAKE_CASE, prefixed implicitly by category context.
 */
export declare const A2AErrorCodeEnum: {
    /** The envelope failed structural validation. */
    readonly InvalidEnvelope: "INVALID_ENVELOPE";
    /** The envelope version is unsupported. */
    readonly UnsupportedEnvelopeVersion: "UNSUPPORTED_ENVELOPE_VERSION";
    /** A required field is missing from the envelope. */
    readonly MissingEnvelopeField: "MISSING_ENVELOPE_FIELD";
    /** The payload kind is unknown or malformed. */
    readonly InvalidPayload: "INVALID_PAYLOAD";
    /** Compatibility alias used by older gateway/workspace routes. */
    readonly InvalidParams: "INVALID_ENVELOPE";
    /** No connector is attached for the target agent. */
    readonly ConnectorNotFound: "CONNECTOR_NOT_FOUND";
    /** The connector timed out during task execution. */
    readonly ConnectorTimeout: "CONNECTOR_TIMEOUT";
    /** The connector returned an unexpected error. */
    readonly ConnectorError: "CONNECTOR_ERROR";
    /** The connector is temporarily unavailable. */
    readonly ConnectorUnavailable: "CONNECTOR_UNAVAILABLE";
    /** Protocol mismatch between connector and remote agent. */
    readonly ProtocolMismatch: "PROTOCOL_MISMATCH";
    /** The policy plane denied the requested action. */
    readonly PolicyDenied: "POLICY_DENIED";
    /** No prompt handler is configured for the policy rule. */
    readonly PolicyHandlerMissing: "POLICY_HANDLER_MISSING";
    /** The policy evaluation timed out. */
    readonly PolicyTimeout: "POLICY_TIMEOUT";
    /** The task was not found. */
    readonly TaskNotFound: "TASK_NOT_FOUND";
    /** An invalid state transition was attempted. */
    readonly InvalidStateTransition: "INVALID_STATE_TRANSITION";
    /** The task has already reached a terminal state. */
    readonly TaskAlreadyTerminal: "TASK_ALREADY_TERMINAL";
    /** The task failed during execution. */
    readonly TaskExecutionFailed: "TASK_EXECUTION_FAILED";
    /** The task was cancelled. */
    readonly TaskCancelled: "TASK_CANCELLED";
    /** The agent was not found in the registry. */
    readonly AgentNotFound: "AGENT_NOT_FOUND";
    /** The agent is already registered. */
    readonly AgentAlreadyRegistered: "AGENT_ALREADY_REGISTERED";
    /** The agent does not have the requested capability. */
    readonly CapabilityNotFound: "CAPABILITY_NOT_FOUND";
    /** The channel was not found. */
    readonly ChannelNotFound: "CHANNEL_NOT_FOUND";
    /** The thread was not found. */
    readonly ThreadNotFound: "THREAD_NOT_FOUND";
    /** The message was not found. */
    readonly MessageNotFound: "MESSAGE_NOT_FOUND";
    /** The sender is not a member of the target channel. */
    readonly NotChannelMember: "NOT_CHANNEL_MEMBER";
    /** A network request failed. */
    readonly NetworkError: "NETWORK_ERROR";
    /** The remote endpoint returned an unexpected status. */
    readonly UnexpectedStatus: "UNEXPECTED_STATUS";
    /** The request or response body could not be parsed. */
    readonly SerializationError: "SERIALIZATION_ERROR";
    /** Authentication failed (invalid or missing credentials). */
    readonly AuthenticationFailed: "AUTHENTICATION_FAILED";
    /** The caller is not authorized for the requested operation. */
    readonly AuthorizationDenied: "AUTHORIZATION_DENIED";
    /** The access token has expired. */
    readonly TokenExpired: "TOKEN_EXPIRED";
    /** The caller has exceeded the rate limit. */
    readonly RateLimitExceeded: "RATE_LIMIT_EXCEEDED";
    /** The caller has exceeded their usage quota. */
    readonly QuotaExceeded: "QUOTA_EXCEEDED";
    /** An unexpected internal error occurred. */
    readonly InternalError: "INTERNAL_ERROR";
    /** A configuration error was detected. */
    readonly ConfigurationError: "CONFIGURATION_ERROR";
};
/** Union of all valid error code string values. */
export type A2AErrorCode = (typeof A2AErrorCodeEnum)[keyof typeof A2AErrorCodeEnum];
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
export declare const A2A_ERROR_CODE_REGISTRY: Readonly<Record<A2AErrorCode, A2AErrorCodeMeta>>;
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
/**
 * Build a structured `A2AError` from a code and message.
 * Category, severity, and retryable flag are automatically looked up from
 * the error code registry.
 *
 * @param input - The error code, message, and optional overrides.
 * @returns A fully populated `A2AError`.
 */
export declare function buildA2AError(input: {
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
}): A2AError;
/**
 * Look up the metadata for an error code.
 *
 * @param code - The error code to look up.
 * @returns The error code metadata, or `undefined` if the code is not in the registry.
 */
export declare function getErrorCodeMeta(code: string): A2AErrorCodeMeta | undefined;
/**
 * Check whether a given string is a valid A2A error code.
 *
 * @param code - The string to check.
 */
export declare function isA2AErrorCode(code: string): code is A2AErrorCode;
/**
 * A throwable Error subclass that carries the full structured A2A error.
 * Useful in control-plane code where you need to throw and catch typed errors.
 */
export declare class A2AStructuredError extends Error {
    /** The structured error payload. */
    readonly a2aError: A2AError;
    constructor(a2aError: A2AError);
    /** Convenience getter for the error code. */
    get code(): A2AErrorCode;
    /** Convenience getter for the error category. */
    get category(): A2AErrorCategory;
    /** Convenience getter for the severity. */
    get severity(): A2AErrorSeverity;
    /** Whether this error is retryable. */
    get retryable(): boolean;
}
