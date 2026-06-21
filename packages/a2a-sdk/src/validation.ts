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
  TASK_ARTIFACT_TYPES,
  TASK_ENVELOPE_VERSION,
  AUDIT_EVENT_TYPES,
  AUDIT_EVENT_VERSION,
  isA2AErrorCode,
} from './schemas';
import {
  AGENT_CAPABILITY_KINDS,
  AGENT_RUNTIME_KINDS,
  AGENT_VENDOR_SURFACES,
  MEMORY_SCOPES,
  TOOL_CAPABILITY_MODES,
  type AgentProfile,
} from './agent-profile';
import {
  APPROVAL_GATE_STATUSES,
  APPROVAL_POLICY_MODES,
  APPROVAL_REQUIREMENT_TIMINGS,
  CWD_POLICY_MODES,
  PERMISSION_EFFECTS,
  RUNTIME_HEALTH_STATUSES,
  TOOL_PERMISSION_MODES,
} from './policy';
import { type ApprovalGate } from './policy';
import {
  INSTRUCTION_SOURCE_KINDS,
  MEMORY_REFERENCE_SCOPES,
  type InstructionBundle,
} from './instruction-bundle';
import { TASK_INTENTS } from './task-intent';

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

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

const VALID_PLATFORMS = new Set<string>([
  'codex',
  'claude_code',
  'recoder_app',
  'recoder_pm',
  'recoder_agency',
  'recoder_backend',
  'recoder_desktop',
  'custom',
]);

const VALID_PROTOCOLS = new Set<string>(['a2a', 'mcp', 'jsonrpc', 'rest', 'file_git']);

const VALID_TASK_STATES = new Set<string>(TASK_STATES);
const VALID_TASK_ARTIFACT_TYPES = new Set<string>(TASK_ARTIFACT_TYPES);

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
const VALID_AGENT_VENDOR_SURFACES = new Set<string>(AGENT_VENDOR_SURFACES);
const VALID_AGENT_RUNTIME_KINDS = new Set<string>(AGENT_RUNTIME_KINDS);
const VALID_AGENT_CAPABILITY_KINDS = new Set<string>(AGENT_CAPABILITY_KINDS);
const VALID_TOOL_CAPABILITY_MODES = new Set<string>(TOOL_CAPABILITY_MODES);
const VALID_TASK_INTENTS = new Set<string>(TASK_INTENTS);
const VALID_PERMISSION_EFFECTS = new Set<string>(PERMISSION_EFFECTS);
const VALID_TOOL_PERMISSION_MODES = new Set<string>(TOOL_PERMISSION_MODES);
const VALID_APPROVAL_POLICY_MODES = new Set<string>(APPROVAL_POLICY_MODES);
const VALID_APPROVAL_REQUIREMENT_TIMINGS = new Set<string>(APPROVAL_REQUIREMENT_TIMINGS);
const VALID_CWD_POLICY_MODES = new Set<string>(CWD_POLICY_MODES);
const VALID_RUNTIME_HEALTH_STATUSES = new Set<string>(RUNTIME_HEALTH_STATUSES);
const VALID_MEMORY_SCOPES = new Set<string>(MEMORY_SCOPES);
const VALID_INSTRUCTION_SOURCE_KINDS = new Set<string>(INSTRUCTION_SOURCE_KINDS);
const VALID_MEMORY_REFERENCE_SCOPES = new Set<string>(MEMORY_REFERENCE_SCOPES);
const VALID_APPROVAL_GATE_STATUSES = new Set<string>(APPROVAL_GATE_STATUSES);

function validateStringArray(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
  options?: {
    allowEmptyArray?: boolean;
  },
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'must be an array' });
    return;
  }

  if (!options?.allowEmptyArray && value.length === 0) {
    issues.push({ path, message: 'must not be empty' });
  }

  value.forEach((item, index) => {
    if (!isNonEmptyString(item)) {
      issues.push({
        path: `${path}[${index}]`,
        message: 'must be a non-empty string',
      });
    }
  });
}

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
      validateArtifactType(
        isNonEmptyString(value.artifactType) ? value.artifactType : value.artifact_type,
        `${path}.artifactType`,
        issues,
      );
      if (!isNonEmptyString(value.mimeType) && !isNonEmptyString(value.mime_type)) {
        issues.push({ path: `${path}.mimeType`, message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(value.content)) {
        issues.push({ path: `${path}.content`, message: 'must be a non-empty string' });
      }
      break;
  }
}

function validateArtifactType(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isNonEmptyString(value) || !VALID_TASK_ARTIFACT_TYPES.has(value as string)) {
    issues.push({
      path,
      message: `must be one of: ${[...VALID_TASK_ARTIFACT_TYPES].join(', ')}`,
    });
  }
}

function validateTaskArtifact(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }
  if (!isNonEmptyString(value.key)) {
    issues.push({ path: `${path}.key`, message: 'must be a non-empty string' });
  }
  validateArtifactType(value.artifact_type, `${path}.artifact_type`, issues);
  if (!isNonEmptyString(value.mime_type)) {
    issues.push({ path: `${path}.mime_type`, message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.content)) {
    issues.push({ path: `${path}.content`, message: 'must be a non-empty string' });
  }
}

function validateTaskResult(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }
  if (value.text !== undefined && !isNonEmptyString(value.text)) {
    issues.push({ path: `${path}.text`, message: 'must be a non-empty string when present' });
  }
  if (value.data !== undefined && !isRecord(value.data)) {
    issues.push({ path: `${path}.data`, message: 'must be an object when present' });
  }
  if (value.artifacts !== undefined) {
    if (!Array.isArray(value.artifacts)) {
      issues.push({ path: `${path}.artifacts`, message: 'must be an array when present' });
      return;
    }
    value.artifacts.forEach((artifact, index) => {
      validateTaskArtifact(artifact, `${path}.artifacts[${index}]`, issues);
    });
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

  // Result artifacts (optional but validated if present)
  if (value.result !== undefined) {
    validateTaskResult(value.result, 'result', issues);
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

function validatePathRules(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'must be an array' });
    return;
  }

  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: 'must be an object' });
      return;
    }
    if (!isNonEmptyString(item.glob)) {
      issues.push({ path: `${itemPath}.glob`, message: 'must be a non-empty string' });
    }
    if (!isNonEmptyString(item.effect) || !VALID_PERMISSION_EFFECTS.has(item.effect as string)) {
      issues.push({
        path: `${itemPath}.effect`,
        message: `must be one of: ${[...VALID_PERMISSION_EFFECTS].join(', ')}`,
      });
    }
    if (item.requires_approval !== undefined && !isBoolean(item.requires_approval)) {
      issues.push({
        path: `${itemPath}.requires_approval`,
        message: 'must be a boolean when present',
      });
    }
  });
}

function validateToolRules(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'must be an array' });
    return;
  }

  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: 'must be an object' });
      return;
    }
    if (!isNonEmptyString(item.tool_name)) {
      issues.push({ path: `${itemPath}.tool_name`, message: 'must be a non-empty string' });
    }
    if (!isNonEmptyString(item.effect) || !VALID_PERMISSION_EFFECTS.has(item.effect as string)) {
      issues.push({
        path: `${itemPath}.effect`,
        message: `must be one of: ${[...VALID_PERMISSION_EFFECTS].join(', ')}`,
      });
    }
    if (item.modes !== undefined) {
      if (!Array.isArray(item.modes)) {
        issues.push({ path: `${itemPath}.modes`, message: 'must be an array when present' });
      } else {
        item.modes.forEach((mode, modeIndex) => {
          if (!isNonEmptyString(mode) || !VALID_TOOL_PERMISSION_MODES.has(mode as string)) {
            issues.push({
              path: `${itemPath}.modes[${modeIndex}]`,
              message: `must be one of: ${[...VALID_TOOL_PERMISSION_MODES].join(', ')}`,
            });
          }
        });
      }
    }
    if (item.requires_approval !== undefined && !isBoolean(item.requires_approval)) {
      issues.push({
        path: `${itemPath}.requires_approval`,
        message: 'must be a boolean when present',
      });
    }
  });
}

function validateAgentPermissionPolicy(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }

  if (
    !isNonEmptyString(value.default_file_effect) ||
    !VALID_PERMISSION_EFFECTS.has(value.default_file_effect as string)
  ) {
    issues.push({
      path: `${path}.default_file_effect`,
      message: `must be one of: ${[...VALID_PERMISSION_EFFECTS].join(', ')}`,
    });
  }
  validatePathRules(value.path_rules, `${path}.path_rules`, issues);
  validateToolRules(value.tool_rules, `${path}.tool_rules`, issues);

  [
    'allow_network',
    'allow_shell',
    'allow_git_write',
    'allow_pr_creation',
    'allow_secrets_access',
    'write_lock_required',
  ].forEach((field) => {
    if (!isBoolean(value[field])) {
      issues.push({ path: `${path}.${field}`, message: 'must be a boolean' });
    }
  });

  if (!isNonNegativeInteger(value.max_parallel_subagents)) {
    issues.push({
      path: `${path}.max_parallel_subagents`,
      message: 'must be a non-negative integer',
    });
  }
}

function validateApprovalPolicy(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }

  if (!isNonEmptyString(value.mode) || !VALID_APPROVAL_POLICY_MODES.has(value.mode as string)) {
    issues.push({
      path: `${path}.mode`,
      message: `must be one of: ${[...VALID_APPROVAL_POLICY_MODES].join(', ')}`,
    });
  }
  if (!isBoolean(value.allow_auto_approval_for_low_risk)) {
    issues.push({
      path: `${path}.allow_auto_approval_for_low_risk`,
      message: 'must be a boolean',
    });
  }

  if (!Array.isArray(value.required_rules)) {
    issues.push({ path: `${path}.required_rules`, message: 'must be an array' });
    return;
  }

  value.required_rules.forEach((rule, index) => {
    const rulePath = `${path}.required_rules[${index}]`;
    if (!isRecord(rule)) {
      issues.push({ path: rulePath, message: 'must be an object' });
      return;
    }
    if (!isNonEmptyString(rule.id)) {
      issues.push({ path: `${rulePath}.id`, message: 'must be a non-empty string' });
    }
    if (!isNonEmptyString(rule.label)) {
      issues.push({ path: `${rulePath}.label`, message: 'must be a non-empty string' });
    }
    if (!isNonEmptyString(rule.when) || !VALID_APPROVAL_REQUIREMENT_TIMINGS.has(rule.when as string)) {
      issues.push({
        path: `${rulePath}.when`,
        message: `must be one of: ${[...VALID_APPROVAL_REQUIREMENT_TIMINGS].join(', ')}`,
      });
    }
    if (!isBoolean(rule.required)) {
      issues.push({ path: `${rulePath}.required`, message: 'must be a boolean' });
    }
    if (rule.path_globs !== undefined) {
      validateStringArray(rule.path_globs, `${rulePath}.path_globs`, issues, {
        allowEmptyArray: true,
      });
    }
    if (rule.capability_ids !== undefined) {
      validateStringArray(rule.capability_ids, `${rulePath}.capability_ids`, issues, {
        allowEmptyArray: true,
      });
    }
  });
}

function validateCwdPolicy(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }

  if (!isNonEmptyString(value.mode) || !VALID_CWD_POLICY_MODES.has(value.mode as string)) {
    issues.push({
      path: `${path}.mode`,
      message: `must be one of: ${[...VALID_CWD_POLICY_MODES].join(', ')}`,
    });
  }

  validateStringArray(value.allowed_roots, `${path}.allowed_roots`, issues);

  if (value.preferred_root !== undefined && !isNonEmptyString(value.preferred_root)) {
    issues.push({
      path: `${path}.preferred_root`,
      message: 'must be a non-empty string when present',
    });
  }
}

function validateRuntimeHealth(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }

  if (!isNonEmptyString(value.status) || !VALID_RUNTIME_HEALTH_STATUSES.has(value.status as string)) {
    issues.push({
      path: `${path}.status`,
      message: `must be one of: ${[...VALID_RUNTIME_HEALTH_STATUSES].join(', ')}`,
    });
  }
  if (!isValidISODate(value.checked_at)) {
    issues.push({
      path: `${path}.checked_at`,
      message: 'must be a valid ISO-8601 timestamp',
    });
  }
  if (value.latency_ms !== undefined && (typeof value.latency_ms !== 'number' || value.latency_ms < 0)) {
    issues.push({
      path: `${path}.latency_ms`,
      message: 'must be a non-negative number when present',
    });
  }
}

export function validateAgentProfile(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return { valid: false, issues: [{ path: '$', message: 'must be an object' }] };
  }

  if (!isNonEmptyString(value.agent_id)) {
    issues.push({ path: 'agent_id', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.display_name)) {
    issues.push({ path: 'display_name', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.vendor_surface) || !VALID_AGENT_VENDOR_SURFACES.has(value.vendor_surface as string)) {
    issues.push({
      path: 'vendor_surface',
      message: `must be one of: ${[...VALID_AGENT_VENDOR_SURFACES].join(', ')}`,
    });
  }
  if (!isNonEmptyString(value.connector_id)) {
    issues.push({ path: 'connector_id', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.runtime_kind) || !VALID_AGENT_RUNTIME_KINDS.has(value.runtime_kind as string)) {
    issues.push({
      path: 'runtime_kind',
      message: `must be one of: ${[...VALID_AGENT_RUNTIME_KINDS].join(', ')}`,
    });
  }

  if (!Array.isArray(value.capabilities)) {
    issues.push({ path: 'capabilities', message: 'must be an array' });
  } else {
    value.capabilities.forEach((capability, index) => {
      const itemPath = `capabilities[${index}]`;
      if (!isRecord(capability)) {
        issues.push({ path: itemPath, message: 'must be an object' });
        return;
      }
      if (!isNonEmptyString(capability.capability_id)) {
        issues.push({ path: `${itemPath}.capability_id`, message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(capability.label)) {
        issues.push({ path: `${itemPath}.label`, message: 'must be a non-empty string' });
      }
      if (
        !isNonEmptyString(capability.kind) ||
        !VALID_AGENT_CAPABILITY_KINDS.has(capability.kind as string)
      ) {
        issues.push({
          path: `${itemPath}.kind`,
          message: `must be one of: ${[...VALID_AGENT_CAPABILITY_KINDS].join(', ')}`,
        });
      }
      if (capability.risky !== undefined && !isBoolean(capability.risky)) {
        issues.push({ path: `${itemPath}.risky`, message: 'must be a boolean when present' });
      }
    });
  }

  if (!Array.isArray(value.tools)) {
    issues.push({ path: 'tools', message: 'must be an array' });
  } else {
    value.tools.forEach((tool, index) => {
      const itemPath = `tools[${index}]`;
      if (!isRecord(tool)) {
        issues.push({ path: itemPath, message: 'must be an object' });
        return;
      }
      if (!isNonEmptyString(tool.tool_name)) {
        issues.push({ path: `${itemPath}.tool_name`, message: 'must be a non-empty string' });
      }
      if (!Array.isArray(tool.modes) || tool.modes.length === 0) {
        issues.push({ path: `${itemPath}.modes`, message: 'must be a non-empty array' });
      } else {
        tool.modes.forEach((mode, modeIndex) => {
          if (!isNonEmptyString(mode) || !VALID_TOOL_CAPABILITY_MODES.has(mode as string)) {
            issues.push({
              path: `${itemPath}.modes[${modeIndex}]`,
              message: `must be one of: ${[...VALID_TOOL_CAPABILITY_MODES].join(', ')}`,
            });
          }
        });
      }
    });
  }

  if (!Array.isArray(value.supported_task_intents) || value.supported_task_intents.length === 0) {
    issues.push({
      path: 'supported_task_intents',
      message: 'must be a non-empty array',
    });
  } else {
    value.supported_task_intents.forEach((intent, index) => {
      if (!isNonEmptyString(intent) || !VALID_TASK_INTENTS.has(intent as string)) {
        issues.push({
          path: `supported_task_intents[${index}]`,
          message: `must be one of: ${[...VALID_TASK_INTENTS].join(', ')}`,
        });
      }
    });
  }

  validateAgentPermissionPolicy(value.permissions, 'permissions', issues);
  validateApprovalPolicy(value.approval_policy, 'approval_policy', issues);

  if (!isNonEmptyString(value.memory_scope) || !VALID_MEMORY_SCOPES.has(value.memory_scope as string)) {
    issues.push({
      path: 'memory_scope',
      message: `must be one of: ${[...VALID_MEMORY_SCOPES].join(', ')}`,
    });
  }

  validateCwdPolicy(value.cwd_policy, 'cwd_policy', issues);
  validateRuntimeHealth(value.health, 'health', issues);

  if (!isValidISODate(value.last_seen_at)) {
    issues.push({
      path: 'last_seen_at',
      message: 'must be a valid ISO-8601 timestamp',
    });
  }

  return { valid: issues.length === 0, issues };
}

export function isValidAgentProfile(value: unknown): value is AgentProfile {
  return validateAgentProfile(value).valid;
}

export function assertAgentProfile(value: unknown): asserts value is AgentProfile {
  const result = validateAgentProfile(value);
  if (!result.valid) {
    const summary = result.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n');
    throw new Error(`Invalid AgentProfile:\n${summary}`);
  }
}

function validateApprovalGate(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }
  if (!isNonEmptyString(value.approval_id)) {
    issues.push({ path: `${path}.approval_id`, message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.title)) {
    issues.push({ path: `${path}.title`, message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.status) || !VALID_APPROVAL_GATE_STATUSES.has(value.status as string)) {
    issues.push({
      path: `${path}.status`,
      message: `must be one of: ${[...VALID_APPROVAL_GATE_STATUSES].join(', ')}`,
    });
  }
  if (
    !isNonEmptyString(value.required_at) ||
    !VALID_APPROVAL_REQUIREMENT_TIMINGS.has(value.required_at as string)
  ) {
    issues.push({
      path: `${path}.required_at`,
      message: `must be one of: ${[...VALID_APPROVAL_REQUIREMENT_TIMINGS].join(', ')}`,
    });
  }
  if (!isNonEmptyString(value.reason)) {
    issues.push({ path: `${path}.reason`, message: 'must be a non-empty string' });
  }
  if (value.path_globs !== undefined) {
    validateStringArray(value.path_globs, `${path}.path_globs`, issues, {
      allowEmptyArray: true,
    });
  }
  if (value.capability_ids !== undefined) {
    validateStringArray(value.capability_ids, `${path}.capability_ids`, issues, {
      allowEmptyArray: true,
    });
  }
  if (value.decided_at !== undefined && !isValidISODate(value.decided_at)) {
    issues.push({
      path: `${path}.decided_at`,
      message: 'must be a valid ISO-8601 timestamp when present',
    });
  }
}

export function validateInstructionBundle(value: unknown): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isRecord(value)) {
    return { valid: false, issues: [{ path: '$', message: 'must be an object' }] };
  }

  if (!isNonEmptyString(value.shared_goal)) {
    issues.push({ path: 'shared_goal', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(value.agent_specific_prompt)) {
    issues.push({
      path: 'agent_specific_prompt',
      message: 'must be a non-empty string',
    });
  }

  if (!Array.isArray(value.system_context_refs) || value.system_context_refs.length === 0) {
    issues.push({
      path: 'system_context_refs',
      message: 'must be a non-empty array',
    });
  } else {
    value.system_context_refs.forEach((ref, index) => {
      const refPath = `system_context_refs[${index}]`;
      if (!isRecord(ref)) {
        issues.push({ path: refPath, message: 'must be an object' });
        return;
      }
      if (!isNonEmptyString(ref.ref_id)) {
        issues.push({ path: `${refPath}.ref_id`, message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(ref.kind) || !VALID_INSTRUCTION_SOURCE_KINDS.has(ref.kind as string)) {
        issues.push({
          path: `${refPath}.kind`,
          message: `must be one of: ${[...VALID_INSTRUCTION_SOURCE_KINDS].join(', ')}`,
        });
      }
      if (ref.path !== undefined && !isNonEmptyString(ref.path)) {
        issues.push({ path: `${refPath}.path`, message: 'must be a non-empty string when present' });
      }
      if (ref.sha !== undefined && !isNonEmptyString(ref.sha)) {
        issues.push({ path: `${refPath}.sha`, message: 'must be a non-empty string when present' });
      }
    });
  }

  validateStringArray(value.acceptance_criteria, 'acceptance_criteria', issues);
  validateStringArray(value.verification_commands, 'verification_commands', issues);
  validateStringArray(value.forbidden_actions, 'forbidden_actions', issues);

  if (!Array.isArray(value.approval_gates)) {
    issues.push({ path: 'approval_gates', message: 'must be an array' });
  } else {
    value.approval_gates.forEach((gate, index) => {
      validateApprovalGate(gate, `approval_gates[${index}]`, issues);
    });
  }

  if (!Array.isArray(value.memory_used)) {
    issues.push({ path: 'memory_used', message: 'must be an array' });
  } else {
    value.memory_used.forEach((memory, index) => {
      const memoryPath = `memory_used[${index}]`;
      if (!isRecord(memory)) {
        issues.push({ path: memoryPath, message: 'must be an object' });
        return;
      }
      if (!isNonEmptyString(memory.memory_id)) {
        issues.push({ path: `${memoryPath}.memory_id`, message: 'must be a non-empty string' });
      }
      if (!isNonEmptyString(memory.scope) || !VALID_MEMORY_REFERENCE_SCOPES.has(memory.scope as string)) {
        issues.push({
          path: `${memoryPath}.scope`,
          message: `must be one of: ${[...VALID_MEMORY_REFERENCE_SCOPES].join(', ')}`,
        });
      }
      if (!isNonEmptyString(memory.title)) {
        issues.push({ path: `${memoryPath}.title`, message: 'must be a non-empty string' });
      }
    });
  }

  if (!isRecord(value.provenance)) {
    issues.push({ path: 'provenance', message: 'must be an object' });
  } else {
    if (!Array.isArray(value.provenance.source_files) || value.provenance.source_files.length === 0) {
      issues.push({
        path: 'provenance.source_files',
        message: 'must be a non-empty array',
      });
    } else {
      value.provenance.source_files.forEach((file, index) => {
        const filePath = `provenance.source_files[${index}]`;
        if (!isRecord(file)) {
          issues.push({ path: filePath, message: 'must be an object' });
          return;
        }
        if (!isNonEmptyString(file.path)) {
          issues.push({ path: `${filePath}.path`, message: 'must be a non-empty string' });
        }
        if (!isNonEmptyString(file.sha)) {
          issues.push({ path: `${filePath}.sha`, message: 'must be a non-empty string' });
        }
      });
    }
    if (!isValidISODate(value.provenance.compiled_at)) {
      issues.push({
        path: 'provenance.compiled_at',
        message: 'must be a valid ISO-8601 timestamp',
      });
    }
    if (!isNonEmptyString(value.provenance.compiler_version)) {
      issues.push({
        path: 'provenance.compiler_version',
        message: 'must be a non-empty string',
      });
    }
  }

  return { valid: issues.length === 0, issues };
}

export function isValidInstructionBundle(value: unknown): value is InstructionBundle {
  return validateInstructionBundle(value).valid;
}

export function assertInstructionBundle(value: unknown): asserts value is InstructionBundle {
  const result = validateInstructionBundle(value);
  if (!result.valid) {
    const summary = result.issues.map((i) => `  ${i.path}: ${i.message}`).join('\n');
    throw new Error(`Invalid InstructionBundle:\n${summary}`);
  }
}
