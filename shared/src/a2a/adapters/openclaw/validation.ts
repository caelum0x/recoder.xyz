/**
 * @module adapters/openclaw/validation
 *
 * Validation functions for OpenClaw gateway events.
 *
 * Validates raw unknown payloads against the OpenClaw event type definitions
 * before they are passed to the mapper. Rejects malformed events with proper
 * A2A error codes from the canonical error taxonomy.
 *
 * Validation is intentionally strict: missing required fields are rejected
 * with MISSING_ENVELOPE_FIELD, structurally invalid events with
 * INVALID_ENVELOPE, and unrecognized event types with INVALID_PAYLOAD.
 *
 * @example
 * ```ts
 * import { validateOpenClawEvent } from '@recoder/shared/a2a/adapters/openclaw';
 *
 * const result = validateOpenClawEvent(rawPayload);
 * if (result.ok) {
 *   // result.event is a validated OpenClawGatewayEvent
 * } else {
 *   // result.error is an A2AError with proper code and details
 * }
 * ```
 */

import {
  A2AErrorCodeEnum,
  buildA2AError,
  type A2AError,
} from '../../schemas/error-taxonomy';
import {
  isOpenClawEventName,
  type OpenClawGatewayEvent,
  type OpenClawEventName,
} from './types';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ValidationSuccess {
  ok: true;
  event: OpenClawGatewayEvent;
}

export interface ValidationFailure {
  ok: false;
  error: A2AError;
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

// ---------------------------------------------------------------------------
// Issue collector
// ---------------------------------------------------------------------------

interface ValidationIssue {
  field: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalNumber(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'boolean';
}

function fail(code: typeof A2AErrorCodeEnum[keyof typeof A2AErrorCodeEnum], message: string, details?: Record<string, unknown>): ValidationFailure {
  return {
    ok: false,
    error: buildA2AError({ code, message, details }),
  };
}

// ---------------------------------------------------------------------------
// Per-event validators
// ---------------------------------------------------------------------------

function validateVoiceTranscript(obj: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(obj.nodeId)) {
    issues.push({ field: 'nodeId', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(obj.text)) {
    issues.push({ field: 'text', message: 'must be a non-empty string' });
  }
  if (!isOptionalString(obj.sessionKey)) {
    issues.push({ field: 'sessionKey', message: 'must be a string when provided' });
  }
  return issues;
}

function validateAgentRequest(obj: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(obj.nodeId)) {
    issues.push({ field: 'nodeId', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(obj.message)) {
    issues.push({ field: 'message', message: 'must be a non-empty string' });
  }
  if (!isOptionalString(obj.sessionKey)) {
    issues.push({ field: 'sessionKey', message: 'must be a string when provided' });
  }
  if (!isOptionalString(obj.thinking)) {
    issues.push({ field: 'thinking', message: 'must be a string when provided' });
  }
  if (!isOptionalBoolean(obj.deliver)) {
    issues.push({ field: 'deliver', message: 'must be a boolean when provided' });
  }
  if (!isOptionalString(obj.to)) {
    issues.push({ field: 'to', message: 'must be a string when provided' });
  }
  if (!isOptionalString(obj.channel)) {
    issues.push({ field: 'channel', message: 'must be a string when provided' });
  }
  if (!isOptionalNumber(obj.timeoutSeconds)) {
    issues.push({ field: 'timeoutSeconds', message: 'must be a number when provided' });
  }
  return issues;
}

function validateChatSubscribe(obj: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(obj.nodeId)) {
    issues.push({ field: 'nodeId', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(obj.sessionKey)) {
    issues.push({ field: 'sessionKey', message: 'must be a non-empty string' });
  }
  return issues;
}

function validateChatUnsubscribe(obj: Record<string, unknown>): ValidationIssue[] {
  // Same shape as chat.subscribe.
  return validateChatSubscribe(obj);
}

function validateExecStarted(obj: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(obj.nodeId)) {
    issues.push({ field: 'nodeId', message: 'must be a non-empty string' });
  }
  if (!isOptionalString(obj.sessionKey)) {
    issues.push({ field: 'sessionKey', message: 'must be a string when provided' });
  }
  if (!isOptionalString(obj.runId)) {
    issues.push({ field: 'runId', message: 'must be a string when provided' });
  }
  if (!isOptionalString(obj.command)) {
    issues.push({ field: 'command', message: 'must be a string when provided' });
  }
  return issues;
}

function validateExecFinished(obj: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(obj.nodeId)) {
    issues.push({ field: 'nodeId', message: 'must be a non-empty string' });
  }
  if (!isOptionalString(obj.sessionKey)) {
    issues.push({ field: 'sessionKey', message: 'must be a string when provided' });
  }
  if (!isOptionalString(obj.runId)) {
    issues.push({ field: 'runId', message: 'must be a string when provided' });
  }
  if (!isOptionalNumber(obj.exitCode)) {
    issues.push({ field: 'exitCode', message: 'must be a number when provided' });
  }
  if (!isOptionalBoolean(obj.timedOut)) {
    issues.push({ field: 'timedOut', message: 'must be a boolean when provided' });
  }
  if (!isOptionalString(obj.output)) {
    issues.push({ field: 'output', message: 'must be a string when provided' });
  }
  return issues;
}

function validateExecDenied(obj: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(obj.nodeId)) {
    issues.push({ field: 'nodeId', message: 'must be a non-empty string' });
  }
  if (!isOptionalString(obj.sessionKey)) {
    issues.push({ field: 'sessionKey', message: 'must be a string when provided' });
  }
  if (!isOptionalString(obj.runId)) {
    issues.push({ field: 'runId', message: 'must be a string when provided' });
  }
  if (!isOptionalString(obj.command)) {
    issues.push({ field: 'command', message: 'must be a string when provided' });
  }
  if (!isOptionalString(obj.reason)) {
    issues.push({ field: 'reason', message: 'must be a string when provided' });
  }
  return issues;
}

function validateHookWake(obj: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(obj.text)) {
    issues.push({ field: 'text', message: 'must be a non-empty string' });
  }
  if (obj.mode !== 'now' && obj.mode !== 'next-heartbeat') {
    issues.push({ field: 'mode', message: 'must be "now" or "next-heartbeat"' });
  }
  return issues;
}

function validateHookAgent(obj: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(obj.message)) {
    issues.push({ field: 'message', message: 'must be a non-empty string' });
  }
  if (!isNonEmptyString(obj.name)) {
    issues.push({ field: 'name', message: 'must be a non-empty string' });
  }
  if (obj.wakeMode !== 'now' && obj.wakeMode !== 'next-heartbeat') {
    issues.push({ field: 'wakeMode', message: 'must be "now" or "next-heartbeat"' });
  }
  if (!isNonEmptyString(obj.sessionKey)) {
    issues.push({ field: 'sessionKey', message: 'must be a non-empty string' });
  }
  if (typeof obj.deliver !== 'boolean') {
    issues.push({ field: 'deliver', message: 'must be a boolean' });
  }
  if (!isNonEmptyString(obj.channel)) {
    issues.push({ field: 'channel', message: 'must be a non-empty string' });
  }
  return issues;
}

function validateAgentBusEvent(obj: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(obj.runId)) {
    issues.push({ field: 'runId', message: 'must be a non-empty string' });
  }
  if (typeof obj.seq !== 'number' || !Number.isFinite(obj.seq)) {
    issues.push({ field: 'seq', message: 'must be a finite number' });
  }
  if (typeof obj.ts !== 'number' || !Number.isFinite(obj.ts)) {
    issues.push({ field: 'ts', message: 'must be a finite number (epoch ms)' });
  }
  return issues;
}

function validateAgentLifecycle(obj: Record<string, unknown>): ValidationIssue[] {
  const issues = validateAgentBusEvent(obj);
  const validPhases = ['start', 'end', 'error'];
  if (!isNonEmptyString(obj.phase) || !validPhases.includes(obj.phase as string)) {
    issues.push({
      field: 'phase',
      message: `must be one of: ${validPhases.join(', ')}`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Validator dispatch table
// ---------------------------------------------------------------------------

const EVENT_VALIDATORS: Record<OpenClawEventName, (obj: Record<string, unknown>) => ValidationIssue[]> = {
  'voice.transcript': validateVoiceTranscript,
  'agent.request': validateAgentRequest,
  'chat.subscribe': validateChatSubscribe,
  'chat.unsubscribe': validateChatUnsubscribe,
  'exec.started': validateExecStarted,
  'exec.finished': validateExecFinished,
  'exec.denied': validateExecDenied,
  'hook.wake': validateHookWake,
  'hook.agent': validateHookAgent,
  'agent.lifecycle': validateAgentLifecycle,
  'agent.tool': validateAgentBusEvent,
  'agent.assistant': validateAgentBusEvent,
  'agent.error': validateAgentBusEvent,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a raw unknown value as an OpenClaw gateway event.
 *
 * Performs structural validation and rejects malformed events with
 * proper A2A error codes:
 * - `INVALID_ENVELOPE` -- the value is not an object
 * - `MISSING_ENVELOPE_FIELD` -- required fields are missing or invalid
 * - `INVALID_PAYLOAD` -- unrecognized event type
 *
 * @param value - The raw payload to validate.
 * @returns A typed result with the validated event or an A2A error.
 */
export function validateOpenClawEvent(value: unknown): ValidationResult {
  if (!isRecord(value)) {
    return fail(
      A2AErrorCodeEnum.InvalidEnvelope,
      'OpenClaw event must be a non-null object',
      { received: typeof value }
    );
  }

  if (!isNonEmptyString(value.event)) {
    return fail(
      A2AErrorCodeEnum.MissingEnvelopeField,
      'OpenClaw event must have a non-empty "event" string field',
      { received_event: value.event }
    );
  }

  const eventName = value.event as string;
  if (!isOpenClawEventName(eventName)) {
    return fail(
      A2AErrorCodeEnum.InvalidPayload,
      `Unrecognized OpenClaw event type: "${eventName}"`,
      { event_type: eventName }
    );
  }

  const validator = EVENT_VALIDATORS[eventName];
  const issues = validator(value);

  if (issues.length > 0) {
    const details: Record<string, unknown> = {
      event_type: eventName,
      issues: issues.map((i) => `${i.field}: ${i.message}`),
    };
    return fail(
      A2AErrorCodeEnum.MissingEnvelopeField,
      `OpenClaw event "${eventName}" validation failed: ${issues.map((i) => `${i.field} ${i.message}`).join('; ')}`,
      details
    );
  }

  // Validate optional trace context if present.
  if (value.trace !== undefined) {
    if (!isRecord(value.trace)) {
      return fail(
        A2AErrorCodeEnum.InvalidEnvelope,
        'OpenClaw event trace must be an object when provided',
        { event_type: eventName }
      );
    }
    if (
      (value.trace as Record<string, unknown>).trace_id !== undefined &&
      !isNonEmptyString((value.trace as Record<string, unknown>).trace_id)
    ) {
      return fail(
        A2AErrorCodeEnum.MissingEnvelopeField,
        'trace.trace_id must be a non-empty string when provided',
        { event_type: eventName }
      );
    }
  }

  return { ok: true, event: value as unknown as OpenClawGatewayEvent };
}

/**
 * Validate and map in one step. Convenience function that validates a raw
 * payload and then maps it to a TaskEnvelope.
 *
 * This is the recommended entry point for processing raw OpenClaw events
 * from HTTP or WebSocket ingestion.
 */
export { validateOpenClawEvent as validate };

// ---------------------------------------------------------------------------
// Inline assertions / self-tests
// ---------------------------------------------------------------------------

/**
 * Run inline validation assertions. Call during module initialization or
 * in test suites to verify the validation logic is correct.
 *
 * @throws Error if any assertion fails.
 */
export function runValidationAssertions(): void {
  // 1. Rejects non-objects
  assertRejects(validateOpenClawEvent(null), 'INVALID_ENVELOPE', 'null should be rejected');
  assertRejects(validateOpenClawEvent('not an object'), 'INVALID_ENVELOPE', 'string should be rejected');
  assertRejects(validateOpenClawEvent(42), 'INVALID_ENVELOPE', 'number should be rejected');

  // 2. Rejects missing event field
  assertRejects(validateOpenClawEvent({}), 'MISSING_ENVELOPE_FIELD', 'empty object should be rejected');

  // 3. Rejects unknown event type
  assertRejects(
    validateOpenClawEvent({ event: 'unknown.event' }),
    'INVALID_PAYLOAD',
    'unknown event type should be rejected'
  );

  // 4. Rejects voice.transcript missing required fields
  assertRejects(
    validateOpenClawEvent({ event: 'voice.transcript' }),
    'MISSING_ENVELOPE_FIELD',
    'voice.transcript without nodeId/text should be rejected'
  );

  // 5. Accepts valid voice.transcript
  assertAccepts(
    validateOpenClawEvent({
      event: 'voice.transcript',
      nodeId: 'node-1',
      text: 'hello world',
    }),
    'valid voice.transcript should pass'
  );

  // 6. Rejects agent.request missing message
  assertRejects(
    validateOpenClawEvent({ event: 'agent.request', nodeId: 'node-1' }),
    'MISSING_ENVELOPE_FIELD',
    'agent.request without message should be rejected'
  );

  // 7. Accepts valid agent.request
  assertAccepts(
    validateOpenClawEvent({
      event: 'agent.request',
      nodeId: 'node-1',
      message: 'do something',
    }),
    'valid agent.request should pass'
  );

  // 8. Accepts valid hook.wake
  assertAccepts(
    validateOpenClawEvent({
      event: 'hook.wake',
      text: 'wake up',
      mode: 'now',
    }),
    'valid hook.wake should pass'
  );

  // 9. Rejects hook.wake with invalid mode
  assertRejects(
    validateOpenClawEvent({
      event: 'hook.wake',
      text: 'wake up',
      mode: 'invalid',
    }),
    'MISSING_ENVELOPE_FIELD',
    'hook.wake with invalid mode should be rejected'
  );

  // 10. Accepts valid agent.lifecycle
  assertAccepts(
    validateOpenClawEvent({
      event: 'agent.lifecycle',
      runId: 'run-1',
      seq: 1,
      ts: Date.now(),
      phase: 'start',
    }),
    'valid agent.lifecycle should pass'
  );

  // 11. Rejects agent.lifecycle with invalid phase
  assertRejects(
    validateOpenClawEvent({
      event: 'agent.lifecycle',
      runId: 'run-1',
      seq: 1,
      ts: Date.now(),
      phase: 'invalid',
    }),
    'MISSING_ENVELOPE_FIELD',
    'agent.lifecycle with invalid phase should be rejected'
  );

  // 12. Accepts valid exec.denied
  assertAccepts(
    validateOpenClawEvent({
      event: 'exec.denied',
      nodeId: 'node-1',
      runId: 'run-1',
      command: 'rm -rf /',
      reason: 'dangerous command',
    }),
    'valid exec.denied should pass'
  );

  // 13. Rejects invalid trace context
  assertRejects(
    validateOpenClawEvent({
      event: 'voice.transcript',
      nodeId: 'node-1',
      text: 'hello',
      trace: 'not-an-object',
    }),
    'INVALID_ENVELOPE',
    'invalid trace should be rejected'
  );

  // 14. Accepts valid chat.subscribe (skippable event)
  assertAccepts(
    validateOpenClawEvent({
      event: 'chat.subscribe',
      nodeId: 'node-1',
      sessionKey: 'session-1',
    }),
    'valid chat.subscribe should pass'
  );

  // 15. Rejects hook.agent missing required fields
  assertRejects(
    validateOpenClawEvent({
      event: 'hook.agent',
      message: 'do something',
    }),
    'MISSING_ENVELOPE_FIELD',
    'hook.agent missing name/sessionKey/deliver/channel should be rejected'
  );

  // 16. Accepts valid hook.agent
  assertAccepts(
    validateOpenClawEvent({
      event: 'hook.agent',
      message: 'do something',
      name: 'TestHook',
      wakeMode: 'now',
      sessionKey: 'sess-1',
      deliver: true,
      channel: 'telegram',
    }),
    'valid hook.agent should pass'
  );
}

function assertRejects(r: ValidationResult, expectedCode: string, label: string): void {
  if (!('error' in r)) {
    throw new Error(`Validation assertion failed: ${label} (expected failure, got success)`);
  }
  if (r.error.code !== expectedCode) {
    throw new Error(
      `Validation assertion failed: ${label} (expected code ${expectedCode}, got ${r.error.code})`
    );
  }
}

function assertAccepts(r: ValidationResult, label: string): void {
  if ('error' in r) {
    throw new Error(
      `Validation assertion failed: ${label} (expected success, got error: ${r.error.code} - ${r.error.message})`
    );
  }
}
