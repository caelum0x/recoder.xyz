/**
 * @module error-mapping
 *
 * Error mapping helpers for connector adapters.
 *
 * Each connector may report errors in its own format (HTTP status codes,
 * vendor-specific error objects, raw exceptions). This module provides
 * functions that normalize those heterogeneous error shapes into canonical
 * `A2AError` instances using the error taxonomy from
 * `@recoder/shared/a2a/schemas`.
 *
 * Adapter authors should call these mappers at the boundary where connector
 * errors are caught, so that all upstream logic can operate on a uniform
 * error type.
 *
 * @example
 * ```ts
 * import { mapCodexError, mapClaudeError, mapHttpError } from '@recoder/a2a-sdk/error-mapping';
 *
 * const a2aError = mapCodexError({ type: 'timeout', message: 'Codex timed out' });
 * const httpError = mapHttpError(503, 'Service Unavailable');
 * ```
 */

import {
  type A2AError,
  type A2AErrorCode,
  A2AErrorCodeEnum,
  buildA2AError,
} from './schemas';

import type { ConnectorPlatform } from './state-mapping';

// ---------------------------------------------------------------------------
// Codex error mapping
// ---------------------------------------------------------------------------

/**
 * Shape of an error object emitted by the Codex adapter.
 * This is a normalized representation -- the actual wire format may vary,
 * and adapter code should transform the raw error into this shape before
 * calling `mapCodexError`.
 */
export interface CodexErrorInput {
  /** Codex-specific error type string. */
  type:
    | 'timeout'
    | 'rate_limit'
    | 'quota_exceeded'
    | 'auth_error'
    | 'connection_error'
    | 'invalid_request'
    | 'execution_error'
    | 'model_error'
    | 'internal_error'
    | 'cancelled'
    | string;
  /** Human-readable error message from Codex. */
  message: string;
  /** Optional HTTP status code (if the error originated from an HTTP call). */
  statusCode?: number;
  /** Optional raw details from the Codex API response. */
  details?: Record<string, unknown>;
  /** Optional trace ID for correlation. */
  traceId?: string;
}

/**
 * Map from Codex error type strings to canonical A2A error codes.
 */
const CODEX_ERROR_MAP: Readonly<Record<string, A2AErrorCode>> = {
  timeout: A2AErrorCodeEnum.ConnectorTimeout,
  rate_limit: A2AErrorCodeEnum.RateLimitExceeded,
  quota_exceeded: A2AErrorCodeEnum.QuotaExceeded,
  auth_error: A2AErrorCodeEnum.AuthenticationFailed,
  connection_error: A2AErrorCodeEnum.NetworkError,
  invalid_request: A2AErrorCodeEnum.InvalidPayload,
  execution_error: A2AErrorCodeEnum.TaskExecutionFailed,
  model_error: A2AErrorCodeEnum.ConnectorError,
  internal_error: A2AErrorCodeEnum.InternalError,
  cancelled: A2AErrorCodeEnum.TaskCancelled,
};

/**
 * Map a Codex adapter error to a canonical `A2AError`.
 *
 * @param input - The normalized Codex error.
 * @returns A canonical `A2AError`.
 */
export function mapCodexError(input: CodexErrorInput): A2AError {
  const code = CODEX_ERROR_MAP[input.type] ?? A2AErrorCodeEnum.ConnectorError;
  return buildA2AError({
    code,
    message: input.message,
    details: {
      ...input.details,
      connector_platform: 'codex' as const,
      original_error_type: input.type,
      ...(input.statusCode !== undefined ? { status_code: input.statusCode } : {}),
    },
    trace_id: input.traceId,
  });
}

// ---------------------------------------------------------------------------
// Claude Code error mapping
// ---------------------------------------------------------------------------

/**
 * Shape of an error object emitted by the Claude Code adapter.
 */
export interface ClaudeErrorInput {
  /** Claude-specific error type string. */
  type:
    | 'overloaded'
    | 'rate_limit'
    | 'authentication_error'
    | 'permission_error'
    | 'invalid_request'
    | 'api_error'
    | 'timeout'
    | 'connection_error'
    | 'tool_execution_error'
    | 'context_length_exceeded'
    | 'cancelled'
    | 'aborted'
    | string;
  /** Human-readable error message from Claude. */
  message: string;
  /** Optional HTTP status code. */
  statusCode?: number;
  /** Optional raw details from the Claude API response. */
  details?: Record<string, unknown>;
  /** Optional trace ID for correlation. */
  traceId?: string;
}

/**
 * Map from Claude Code error type strings to canonical A2A error codes.
 */
const CLAUDE_ERROR_MAP: Readonly<Record<string, A2AErrorCode>> = {
  overloaded: A2AErrorCodeEnum.ConnectorUnavailable,
  rate_limit: A2AErrorCodeEnum.RateLimitExceeded,
  authentication_error: A2AErrorCodeEnum.AuthenticationFailed,
  permission_error: A2AErrorCodeEnum.AuthorizationDenied,
  invalid_request: A2AErrorCodeEnum.InvalidPayload,
  api_error: A2AErrorCodeEnum.ConnectorError,
  timeout: A2AErrorCodeEnum.ConnectorTimeout,
  connection_error: A2AErrorCodeEnum.NetworkError,
  tool_execution_error: A2AErrorCodeEnum.TaskExecutionFailed,
  context_length_exceeded: A2AErrorCodeEnum.QuotaExceeded,
  cancelled: A2AErrorCodeEnum.TaskCancelled,
  aborted: A2AErrorCodeEnum.TaskCancelled,
};

/**
 * Map a Claude Code adapter error to a canonical `A2AError`.
 *
 * @param input - The normalized Claude Code error.
 * @returns A canonical `A2AError`.
 */
export function mapClaudeError(input: ClaudeErrorInput): A2AError {
  const code = CLAUDE_ERROR_MAP[input.type] ?? A2AErrorCodeEnum.ConnectorError;
  return buildA2AError({
    code,
    message: input.message,
    details: {
      ...input.details,
      connector_platform: 'claude_code' as const,
      original_error_type: input.type,
      ...(input.statusCode !== undefined ? { status_code: input.statusCode } : {}),
    },
    trace_id: input.traceId,
  });
}

// ---------------------------------------------------------------------------
// HTTP error mapping
// ---------------------------------------------------------------------------

/**
 * Map from common HTTP status codes to canonical A2A error codes.
 */
const HTTP_STATUS_MAP: Readonly<Record<number, A2AErrorCode>> = {
  400: A2AErrorCodeEnum.InvalidPayload,
  401: A2AErrorCodeEnum.AuthenticationFailed,
  403: A2AErrorCodeEnum.AuthorizationDenied,
  404: A2AErrorCodeEnum.ConnectorNotFound,
  408: A2AErrorCodeEnum.ConnectorTimeout,
  409: A2AErrorCodeEnum.InvalidStateTransition,
  422: A2AErrorCodeEnum.InvalidEnvelope,
  429: A2AErrorCodeEnum.RateLimitExceeded,
  500: A2AErrorCodeEnum.InternalError,
  502: A2AErrorCodeEnum.NetworkError,
  503: A2AErrorCodeEnum.ConnectorUnavailable,
  504: A2AErrorCodeEnum.ConnectorTimeout,
};

/**
 * Map an HTTP status code and message to a canonical `A2AError`.
 *
 * Useful for connector adapters that communicate with external services
 * over HTTP/REST and need to normalize HTTP error responses.
 *
 * @param statusCode - The HTTP response status code.
 * @param message - Human-readable error message (e.g. from the response body).
 * @param options - Optional trace ID and additional details.
 * @returns A canonical `A2AError`.
 */
export function mapHttpError(
  statusCode: number,
  message: string,
  options?: {
    traceId?: string;
    details?: Record<string, unknown>;
    platform?: ConnectorPlatform;
  },
): A2AError {
  const code = HTTP_STATUS_MAP[statusCode] ?? A2AErrorCodeEnum.UnexpectedStatus;
  return buildA2AError({
    code,
    message,
    details: {
      ...options?.details,
      http_status: statusCode,
      ...(options?.platform ? { connector_platform: options.platform } : {}),
    },
    trace_id: options?.traceId,
  });
}

// ---------------------------------------------------------------------------
// Generic connector error mapping
// ---------------------------------------------------------------------------

/**
 * Generic connector error input that works with any platform.
 */
export interface ConnectorErrorInput {
  /** The connector platform. */
  platform: ConnectorPlatform;
  /** Connector-specific error type string. */
  type: string;
  /** Human-readable error message. */
  message: string;
  /** Optional HTTP status code. */
  statusCode?: number;
  /** Optional raw details. */
  details?: Record<string, unknown>;
  /** Optional trace ID. */
  traceId?: string;
}

/**
 * Map a generic connector error to a canonical `A2AError`, dispatching
 * to the appropriate platform-specific mapper.
 *
 * @param input - The connector error input.
 * @returns A canonical `A2AError`.
 */
export function mapConnectorError(input: ConnectorErrorInput): A2AError {
  switch (input.platform) {
    case 'codex':
      return mapCodexError(input);
    case 'claude_code':
      return mapClaudeError(input);
    default:
      // Fallback: use the HTTP mapper if we have a status code, otherwise generic
      if (input.statusCode !== undefined) {
        return mapHttpError(input.statusCode, input.message, {
          traceId: input.traceId,
          details: { ...input.details, original_error_type: input.type },
          platform: input.platform,
        });
      }
      return buildA2AError({
        code: A2AErrorCodeEnum.ConnectorError,
        message: input.message,
        details: {
          ...input.details,
          connector_platform: input.platform,
          original_error_type: input.type,
        },
        trace_id: input.traceId,
      });
  }
}

// ---------------------------------------------------------------------------
// Exception wrapping
// ---------------------------------------------------------------------------

/**
 * Wrap a caught JavaScript Error (or unknown) into a canonical `A2AError`.
 *
 * This is a last-resort mapper for unstructured exceptions that escape
 * the connector adapter. Prefer using the typed mappers above whenever
 * possible.
 *
 * @param err - The caught error.
 * @param options - Optional context: platform, trace ID.
 * @returns A canonical `A2AError`.
 */
export function wrapUnknownError(
  err: unknown,
  options?: {
    platform?: ConnectorPlatform;
    traceId?: string;
  },
): A2AError {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';

  const details: Record<string, unknown> = {};
  if (options?.platform) {
    details.connector_platform = options.platform;
  }
  if (err instanceof Error) {
    details.error_name = err.name;
    if (err.stack) {
      details.stack_preview = err.stack.split('\n').slice(0, 3).join('\n');
    }
  }

  return buildA2AError({
    code: A2AErrorCodeEnum.InternalError,
    message,
    details,
    trace_id: options?.traceId,
  });
}
