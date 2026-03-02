/**
 * @module validation
 *
 * Validation utilities for incoming payloads against the canonical A2A schemas.
 *
 * These validators perform structural checks on raw objects to confirm they
 * conform to the `TaskEnvelope`, `AuditEvent`, and related schema shapes.
 * They are designed for use at ingress boundaries -- API routes, message
 * consumers, webhook handlers -- where untyped JSON must be validated before
 * it enters the typed domain.
 *
 * All validators return a `ValidationResult` with a list of issues rather
 * than throwing, so that callers can aggregate errors or return structured
 * 422 responses.
 *
 * @example
 * ```ts
 * import { validateTaskEnvelope, validateAuditEvent } from '@recoder/a2a-sdk/validation';
 *
 * const result = validateTaskEnvelope(rawPayload);
 * if (!result.valid) {
 *   console.error('Invalid envelope:', result.issues);
 * }
 * ```
 */

import {
  type TaskEnvelope,
  type AuditEvent,
  type A2AError,
  TASK_STATES,
  TASK_ENVELOPE_VERSION,
  AUDIT_EVENT_TYPES,
  AUDIT_EVENT_VERSION,
  isA2AErrorCode,
} from '@recoder/shared/a2a/schemas';

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

/**
 * A single validation issue found during schema validation.
 */
export interface ValidationIssue {
  /** Dot-delimited path to the field that failed validation. */
  path: string;
  /** Human-readable description of what is wrong. */
  message: string;
}

/**
 * The result of a validation operation.
 */
export interface ValidationResult {
  /** Whether the payload passed all checks. */
  valid: boolean;
  /** List of issues found. Empty when `valid` is true. */
  issues: ValidationIssue[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidISODate(value: unknown): boolean {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

const VALID_PLATFORMS = new Set<string>([
  'codex',
  'claude_code',
  'recoder_web',
  'recoder_pm',
  'recoder_agency',
  'recoder_backend',
  'recoder_desktop',
  'custom',
]);

const VALID_PROTOCOLS = new Set<string>(['a2a', 'mcp', 'jsonrpc', 'rest', 'file_git']);

const VALID_TASK_STATES = new Set<string>(TASK_STATES);

const VALID_AUDIT_EVENT_TYPES = new Set<string>(AUDIT_EVENT_TYPES);

const VALID_ACTOR_KINDS = new Set<string>(['agent', 'user', 'system', 'connector']);

const VALID_TARGET_KINDS = new Set<string>([
  'task',
  'agent',
  'connector',
  'channel',
  'thread',
  'message',
  'policy',
  'workspace',
  'system',
]);

const VALID_SEVERITIES = new Set<string>(['low', 'medium', 'high', 'critical']);

const VALID_AUDIT_SEVERITIES = new Set<string>(['info', 'warning', 'error', 'critical']);

// ---------------------------------------------------------------------------
// TaskEnvelope validation
// ---------------------------------------------------------------------------

function validateAgentRef(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }
  if (!isNonEmptyString(value.agent_id)) {
    issues.push({ path: `${path}.agent_id`, message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.platform) || !VALID_PLATFORMS.has(value.platform as string)) {
    issues.push({
      path: `${path}.platform`,
      message: `must be one of: ${[...VALID_PLATFORMS].join(', ')}`,
    });
  }
}

function validateConnectorInfo(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }
  if (!isNonEmptyString(value.platform) || !VALID_PLATFORMS.has(value.platform as string)) {
    issues.push({
      path: `${path}.platform`,
      message: `must be one of: ${[...VALID_PLATFORMS].join(', ')}`,
    });
  }
  if (!isNonEmptyString(value.protocol) || !VALID_PROTOCOLS.has(value.protocol as string)) {
    issues.push({
      path: `${path}.protocol`,
      message: `must be one of: ${[...VALID_PROTOCOLS].join(', ')}`,
    });
  }
  if (!isNonEmptyString(value.connector_id)) {
    issues.push({
      path: `${path}.connector_id`,
      message: 'must be a non-empty string',
    });
  }
}

function validatePayloadItem(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }

  const validKinds = new Set(['text', 'json', 'command', 'artifact']);
  if (!isNonEmptyString(value.kind) || !validKinds.has(value.kind as string)) {
    issues.push({
      path: `${path}.kind`,
      message: `must be one of: ${[...validKinds].join(', ')}`,
    });
    return;
  }

  switch (value.kind) {
    case 'text':
      if (!isNonEmptyString(value.text)) {
        issues.push({ path: `${path}.text`, message: 'must be a non-empty string' });
      }
      break;
    case 'json':
      if (!isRecord(value.data)) {
        issues.push({ path: `${path}.data`, message: 'must be an object' });
      }
      break;
    case 'command':
      if (!isNonEmptyString(value.command)) {
        issues.push({ path: `${path}.command`, message: 'must be a non-empty string' });
      }
      break;
    case 'artifact':
      if (!isNonEmptyString(value.mimeType) && !isNonEmptyString(value.mime_type)) {
        issues.push({ path: `${path}.mimeType`, message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(value.content)) {
        issues.push({ path: `${path}.content`, message: 'must be a non-empty string' });
      }
      break;
  }
}

/**
 * Validate a raw object against the `TaskEnvelope` schema.
 *
 * Checks all required fields, type correctness, enum membership, and
 * nested object structures. Does NOT check whether state transitions in
 * the `history` array are valid -- use `isValidTransition` for that.
 *
 * @param value - The raw object to validate.
 * @param options - Optional strictness flags.
 * @returns A `ValidationResult`.
 */
export function validateTaskEnvelope(
  value: unknown,
  options?: {
    /** If true, require `envelope_version` to match `TASK_ENVELOPE_VERSION`. */
    strictVersion?: boolean;
  },
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return { valid: false, issues: [{ path: '$', message: 'must be an object' }] };
  }

  // Identity
  if (!isNonEmptyString(value.envelope_version)) {
    issues.push({ path: 'envelope_version', message: 'must be a non-empty string' });
  } else if (options?.strictVersion && value.envelope_version !== TASK_ENVELOPE_VERSION) {
    issues.push({
      path: 'envelope_version',
      message: `must equal "${TASK_ENVELOPE_VERSION}"`,
    });
  }

  if (!isNonEmptyString(value.id)) {
    issues.push({ path: 'id', message: 'must be a non-empty string' });
  }

  // Scoping
  if (!isNonEmptyString(value.workspace_id)) {
    issues.push({ path: 'workspace_id', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.thread_id)) {
    issues.push({ path: 'thread_id', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.trace_id)) {
    issues.push({ path: 'trace_id', message: 'must be a non-empty string' });
  }

  // State
  if (
    !isNonEmptyString(value.state) ||
    !VALID_TASK_STATES.has(value.state as string)
  ) {
    issues.push({
      path: 'state',
      message: `must be one of: ${[...VALID_TASK_STATES].join(', ')}`,
    });
  }

  // Participants
  validateAgentRef(value.requester, 'requester', issues);
  validateAgentRef(value.assignee, 'assignee', issues);

  // Connector
  validateConnectorInfo(value.connector, 'connector', issues);

  // Payload
  if (value.payload === undefined || value.payload === null) {
    issues.push({ path: 'payload', message: 'is required' });
  } else if (Array.isArray(value.payload)) {
    (value.payload as unknown[]).forEach((item, i) =>
      validatePayloadItem(item, `payload[${i}]`, issues),
    );
  } else {
    validatePayloadItem(value.payload, 'payload', issues);
  }

  // Timestamps
  if (!isValidISODate(value.created_at)) {
    issues.push({ path: 'created_at', message: 'must be a valid ISO-8601 timestamp' });
  }
  if (!isValidISODate(value.updated_at)) {
    issues.push({ path: 'updated_at', message: 'must be a valid ISO-8601 timestamp' });
  }

  // Error info (optional but validated if present)
  if (value.error !== undefined) {
    if (!isRecord(value.error)) {
      issues.push({ path: 'error', message: 'must be an object when present' });
    } else {
      if (!isNonEmptyString(value.error.code)) {
        issues.push({ path: 'error.code', message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(value.error.category)) {
        issues.push({ path: 'error.category', message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(value.error.message)) {
        issues.push({ path: 'error.message', message: 'must be a non-empty string' });
      }
      if (
        !isNonEmptyString(value.error.severity) ||
        !VALID_SEVERITIES.has(value.error.severity as string)
      ) {
        issues.push({
          path: 'error.severity',
          message: `must be one of: ${[...VALID_SEVERITIES].join(', ')}`,
        });
      }
      if (typeof value.error.retryable !== 'boolean') {
        issues.push({ path: 'error.retryable', message: 'must be a boolean' });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Type guard: check whether a value is a valid `TaskEnvelope`.
 *
 * @param value - The value to check.
 * @returns `true` if the value passes structural validation.
 */
export function isValidTaskEnvelope(value: unknown): value is TaskEnvelope {
  return validateTaskEnvelope(value).valid;
}

/**
 * Assert that a value is a valid `TaskEnvelope`, throwing a descriptive
 * error if it is not.
 *
 * @param value - The value to assert.
 * @throws {Error} With a summary of validation issues.
 */
export function assertTaskEnvelope(value: unknown): asserts value is TaskEnvelope {
  const result = validateTaskEnvelope(value);
  if (!result.valid) {
    const summary = result.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n');
    throw new Error(`Invalid TaskEnvelope:\n${summary}`);
  }
}

// ---------------------------------------------------------------------------
// AuditEvent validation
// ---------------------------------------------------------------------------

function validateAuditActor(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }
  if (!isNonEmptyString(value.kind) || !VALID_ACTOR_KINDS.has(value.kind as string)) {
    issues.push({
      path: `${path}.kind`,
      message: `must be one of: ${[...VALID_ACTOR_KINDS].join(', ')}`,
    });
  }
  if (!isNonEmptyString(value.id)) {
    issues.push({ path: `${path}.id`, message: 'must be a non-empty string' });
  }
}

function validateAuditTarget(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }
  if (!isNonEmptyString(value.kind) || !VALID_TARGET_KINDS.has(value.kind as string)) {
    issues.push({
      path: `${path}.kind`,
      message: `must be one of: ${[...VALID_TARGET_KINDS].join(', ')}`,
    });
  }
  if (!isNonEmptyString(value.id)) {
    issues.push({ path: `${path}.id`, message: 'must be a non-empty string' });
  }
}

/**
 * Validate a raw object against the `AuditEvent` schema.
 *
 * @param value - The raw object to validate.
 * @param options - Optional strictness flags.
 * @returns A `ValidationResult`.
 */
export function validateAuditEvent(
  value: unknown,
  options?: {
    /** If true, require `schema_version` to match `AUDIT_EVENT_VERSION`. */
    strictVersion?: boolean;
  },
): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return { valid: false, issues: [{ path: '$', message: 'must be an object' }] };
  }

  // Identity
  if (!isNonEmptyString(value.schema_version)) {
    issues.push({ path: 'schema_version', message: 'must be a non-empty string' });
  } else if (options?.strictVersion && value.schema_version !== AUDIT_EVENT_VERSION) {
    issues.push({
      path: 'schema_version',
      message: `must equal "${AUDIT_EVENT_VERSION}"`,
    });
  }

  if (!isNonEmptyString(value.id)) {
    issues.push({ path: 'id', message: 'must be a non-empty string' });
  }

  // Classification
  if (
    !isNonEmptyString(value.event_type) ||
    !VALID_AUDIT_EVENT_TYPES.has(value.event_type as string)
  ) {
    issues.push({
      path: 'event_type',
      message: `must be one of the canonical audit event types`,
    });
  }

  if (
    value.severity !== undefined &&
    (!isNonEmptyString(value.severity) ||
      !VALID_AUDIT_SEVERITIES.has(value.severity as string))
  ) {
    issues.push({
      path: 'severity',
      message: `must be one of: ${[...VALID_AUDIT_SEVERITIES].join(', ')}`,
    });
  }

  // Actor & target
  validateAuditActor(value.actor, 'actor', issues);
  validateAuditTarget(value.target, 'target', issues);

  // Tracing & scoping
  if (!isNonEmptyString(value.trace_id)) {
    issues.push({ path: 'trace_id', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.workspace_id)) {
    issues.push({ path: 'workspace_id', message: 'must be a non-empty string' });
  }

  // Timestamp
  if (!isValidISODate(value.timestamp)) {
    issues.push({ path: 'timestamp', message: 'must be a valid ISO-8601 timestamp' });
  }

  // Policy context (optional)
  if (value.policy !== undefined) {
    if (!isRecord(value.policy)) {
      issues.push({ path: 'policy', message: 'must be an object when present' });
    } else {
      if (!isNonEmptyString(value.policy.action)) {
        issues.push({ path: 'policy.action', message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(value.policy.rule)) {
        issues.push({ path: 'policy.rule', message: 'must be a non-empty string' });
      }
      if (typeof value.policy.approved !== 'boolean') {
        issues.push({ path: 'policy.approved', message: 'must be a boolean' });
      }
      if (!isNonEmptyString(value.policy.reason)) {
        issues.push({ path: 'policy.reason', message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(value.policy.agent_id)) {
        issues.push({ path: 'policy.agent_id', message: 'must be a non-empty string' });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Type guard: check whether a value is a valid `AuditEvent`.
 *
 * @param value - The value to check.
 * @returns `true` if the value passes structural validation.
 */
export function isValidAuditEvent(value: unknown): value is AuditEvent {
  return validateAuditEvent(value).valid;
}

/**
 * Assert that a value is a valid `AuditEvent`, throwing a descriptive
 * error if it is not.
 *
 * @param value - The value to assert.
 * @throws {Error} With a summary of validation issues.
 */
export function assertAuditEvent(value: unknown): asserts value is AuditEvent {
  const result = validateAuditEvent(value);
  if (!result.valid) {
    const summary = result.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n');
    throw new Error(`Invalid AuditEvent:\n${summary}`);
  }
}

// ---------------------------------------------------------------------------
// A2AError validation
// ---------------------------------------------------------------------------

/**
 * Validate a raw object against the `A2AError` structure.
 *
 * @param value - The raw object to validate.
 * @returns A `ValidationResult`.
 */
export function validateA2AError(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return { valid: false, issues: [{ path: '$', message: 'must be an object' }] };
  }

  if (!isNonEmptyString(value.code)) {
    issues.push({ path: 'code', message: 'must be a non-empty string' });
  } else if (!isA2AErrorCode(value.code as string)) {
    issues.push({
      path: 'code',
      message: 'must be a recognized A2A error code',
    });
  }

  if (!isNonEmptyString(value.category)) {
    issues.push({ path: 'category', message: 'must be a non-empty string' });
  }

  if (!isNonEmptyString(value.message)) {
    issues.push({ path: 'message', message: 'must be a non-empty string' });
  }

  if (
    !isNonEmptyString(value.severity) ||
    !VALID_SEVERITIES.has(value.severity as string)
  ) {
    issues.push({
      path: 'severity',
      message: `must be one of: ${[...VALID_SEVERITIES].join(', ')}`,
    });
  }

  if (typeof value.retryable !== 'boolean') {
    issues.push({ path: 'retryable', message: 'must be a boolean' });
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Type guard: check whether a value is a valid `A2AError`.
 *
 * @param value - The value to check.
 */
export function isValidA2AError(value: unknown): value is A2AError {
  return validateA2AError(value).valid;
}
