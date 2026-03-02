/**
 * @module connector-contracts.test
 *
 * SFA-014: Connector contract test suite for the canonical A2A schemas.
 *
 * These tests serve as a CI gate ensuring that the canonical schemas remain
 * structurally sound and that connectors can rely on the contracts defined in
 * `shared/src/a2a/schemas/`. If any of these tests fail, PRs to main are
 * blocked until the contract is restored.
 *
 * Coverage:
 * 1. TaskEnvelope creation with all required fields
 * 2. State transitions -- valid transitions pass, invalid transitions reject
 * 3. TaskStateEnum completeness -- all values are present in TASK_STATES
 * 4. AuditEvent creation with every event type
 * 5. Error taxonomy -- all codes map correctly, buildA2AError works
 * 6. Terminal states are properly identified
 * 7. Envelope immutability -- transitionTaskEnvelope returns a new object
 */

import { describe, expect, it } from 'vitest';
import {
  // -- TaskEnvelope -----------------------------------------------------------
  TASK_ENVELOPE_VERSION,
  TaskStateEnum,
  TASK_STATES,
  TERMINAL_TASK_STATES,
  isTerminalState,
  ALLOWED_STATE_TRANSITIONS,
  isValidTransition,
  transitionTaskEnvelope,
  createTaskEnvelope,
  type TaskEnvelope,
  type TaskState,
  type CreateTaskEnvelopeInput,

  // -- AuditEvent -------------------------------------------------------------
  AUDIT_EVENT_VERSION,
  AuditEventTypeEnum,
  AUDIT_EVENT_TYPES,
  AuditActorKindEnum,
  AuditTargetKindEnum,
  AuditSeverityEnum,
  createAuditEvent,
  type AuditEventType,

  // -- Error taxonomy ---------------------------------------------------------
  A2AErrorSeverityEnum,
  A2AErrorCategoryEnum,
  A2AErrorCodeEnum,
  A2A_ERROR_CODE_REGISTRY,
  buildA2AError,
  getErrorCodeMeta,
  isA2AErrorCode,
  A2AStructuredError,
  type A2AErrorCode,
} from '../index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard input for creating a test TaskEnvelope. */
function makeEnvelopeInput(overrides: Partial<CreateTaskEnvelopeInput> = {}): CreateTaskEnvelopeInput {
  return {
    id: 'task_test_001',
    workspace_id: 'ws_test',
    thread_id: 'thr_test',
    trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
    requester: { agent_id: 'agent-pm', platform: 'recoder_pm' },
    assignee: { agent_id: 'agent-codex', platform: 'codex' },
    connector: { platform: 'codex', protocol: 'jsonrpc', connector_id: 'codex-v1' },
    payload: { kind: 'text', text: 'Implement the auth flow' },
    now: '2026-02-25T00:00:00.000Z',
    ...overrides,
  };
}

// ============================================================================
// 1. TaskEnvelope creation
// ============================================================================

describe('TaskEnvelope creation', () => {
  it('creates an envelope with all required fields populated', () => {
    const input = makeEnvelopeInput();
    const envelope = createTaskEnvelope(input);

    expect(envelope.envelope_version).toBe(TASK_ENVELOPE_VERSION);
    expect(envelope.id).toBe('task_test_001');
    expect(envelope.workspace_id).toBe('ws_test');
    expect(envelope.thread_id).toBe('thr_test');
    expect(envelope.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(envelope.state).toBe(TaskStateEnum.Submitted);
    expect(envelope.requester.agent_id).toBe('agent-pm');
    expect(envelope.assignee.agent_id).toBe('agent-codex');
    expect(envelope.connector.platform).toBe('codex');
    expect(envelope.connector.protocol).toBe('jsonrpc');
    expect(envelope.connector.connector_id).toBe('codex-v1');
    expect(envelope.created_at).toBe('2026-02-25T00:00:00.000Z');
    expect(envelope.updated_at).toBe('2026-02-25T00:00:00.000Z');
    expect(envelope.history).toEqual([]);
  });

  it('defaults initial state to submitted', () => {
    const envelope = createTaskEnvelope(makeEnvelopeInput());
    expect(envelope.state).toBe('submitted');
  });

  it('allows overriding initial state', () => {
    const envelope = createTaskEnvelope(makeEnvelopeInput({ initial_state: 'working' }));
    expect(envelope.state).toBe('working');
  });

  it('sets version to the current TASK_ENVELOPE_VERSION constant', () => {
    const envelope = createTaskEnvelope(makeEnvelopeInput());
    expect(envelope.envelope_version).toBe('1.0.0');
    expect(envelope.envelope_version).toBe(TASK_ENVELOPE_VERSION);
  });

  it('carries optional metadata and tags', () => {
    const envelope = createTaskEnvelope(
      makeEnvelopeInput({
        metadata: { priority: 'high' },
        tags: ['team:backend', 'sprint:42'],
      })
    );
    expect(envelope.metadata).toEqual({ priority: 'high' });
    expect(envelope.tags).toEqual(['team:backend', 'sprint:42']);
  });

  it('carries optional parent_id', () => {
    const envelope = createTaskEnvelope(
      makeEnvelopeInput({ parent_id: 'parent_span_001' })
    );
    expect(envelope.parent_id).toBe('parent_span_001');
  });

  it('accepts array payloads', () => {
    const envelope = createTaskEnvelope(
      makeEnvelopeInput({
        payload: [
          { kind: 'text', text: 'First part' },
          { kind: 'json', data: { key: 'value' } },
        ],
      })
    );
    expect(Array.isArray(envelope.payload)).toBe(true);
    expect((envelope.payload as unknown[]).length).toBe(2);
  });
});

// ============================================================================
// 2. State transitions
// ============================================================================

describe('State transitions -- valid', () => {
  it('submitted -> working is valid', () => {
    expect(isValidTransition('submitted', 'working')).toBe(true);
  });

  it('submitted -> cancelled is valid', () => {
    expect(isValidTransition('submitted', 'cancelled')).toBe(true);
  });

  it('submitted -> failed is valid', () => {
    expect(isValidTransition('submitted', 'failed')).toBe(true);
  });

  it('working -> completed is valid', () => {
    expect(isValidTransition('working', 'completed')).toBe(true);
  });

  it('working -> failed is valid', () => {
    expect(isValidTransition('working', 'failed')).toBe(true);
  });

  it('working -> cancelled is valid', () => {
    expect(isValidTransition('working', 'cancelled')).toBe(true);
  });

  it('working -> input-required is valid', () => {
    expect(isValidTransition('working', 'input-required')).toBe(true);
  });

  it('input-required -> working is valid', () => {
    expect(isValidTransition('input-required', 'working')).toBe(true);
  });

  it('input-required -> cancelled is valid', () => {
    expect(isValidTransition('input-required', 'cancelled')).toBe(true);
  });

  it('input-required -> failed is valid', () => {
    expect(isValidTransition('input-required', 'failed')).toBe(true);
  });

  it('all declared transitions are accepted by isValidTransition', () => {
    for (const [from, targets] of Object.entries(ALLOWED_STATE_TRANSITIONS)) {
      for (const to of targets) {
        expect(
          isValidTransition(from as TaskState, to),
          `Expected ${from} -> ${to} to be valid`
        ).toBe(true);
      }
    }
  });
});

describe('State transitions -- invalid', () => {
  it('submitted -> completed is invalid (must go through working)', () => {
    expect(isValidTransition('submitted', 'completed')).toBe(false);
  });

  it('submitted -> input-required is invalid', () => {
    expect(isValidTransition('submitted', 'input-required')).toBe(false);
  });

  it('completed -> anything is invalid (terminal state)', () => {
    for (const state of TASK_STATES) {
      expect(
        isValidTransition('completed', state),
        `completed -> ${state} should be invalid`
      ).toBe(false);
    }
  });

  it('failed -> anything is invalid (terminal state)', () => {
    for (const state of TASK_STATES) {
      expect(
        isValidTransition('failed', state),
        `failed -> ${state} should be invalid`
      ).toBe(false);
    }
  });

  it('cancelled -> anything is invalid (terminal state)', () => {
    for (const state of TASK_STATES) {
      expect(
        isValidTransition('cancelled', state),
        `cancelled -> ${state} should be invalid`
      ).toBe(false);
    }
  });

  it('terminal states have empty transition lists', () => {
    for (const terminalState of TERMINAL_TASK_STATES) {
      expect(
        ALLOWED_STATE_TRANSITIONS[terminalState],
        `${terminalState} should have no outgoing transitions`
      ).toEqual([]);
    }
  });

  it('transitionTaskEnvelope throws on invalid transition', () => {
    const envelope = createTaskEnvelope(makeEnvelopeInput());
    // submitted -> completed is invalid
    expect(() => transitionTaskEnvelope(envelope, 'completed')).toThrow(
      'Invalid task state transition: submitted -> completed'
    );
  });
});

// ============================================================================
// 3. TaskStateEnum completeness
// ============================================================================

describe('TaskStateEnum completeness', () => {
  const enumValues = Object.values(TaskStateEnum);

  it('contains exactly 6 states', () => {
    expect(enumValues).toHaveLength(6);
  });

  it('matches TASK_STATES array', () => {
    expect(new Set(enumValues)).toEqual(new Set(TASK_STATES));
  });

  it('every TASK_STATES entry has a named enum key', () => {
    for (const state of TASK_STATES) {
      expect(enumValues).toContain(state);
    }
  });

  it('every enum value is a key in ALLOWED_STATE_TRANSITIONS', () => {
    for (const state of enumValues) {
      expect(state in ALLOWED_STATE_TRANSITIONS).toBe(true);
    }
  });

  it('contains the expected state values', () => {
    expect(TaskStateEnum.Submitted).toBe('submitted');
    expect(TaskStateEnum.Working).toBe('working');
    expect(TaskStateEnum.InputRequired).toBe('input-required');
    expect(TaskStateEnum.Completed).toBe('completed');
    expect(TaskStateEnum.Failed).toBe('failed');
    expect(TaskStateEnum.Cancelled).toBe('cancelled');
  });
});

// ============================================================================
// 4. AuditEvent creation with all event types
// ============================================================================

describe('AuditEvent creation', () => {
  it('creates an event with all required fields', () => {
    const event = createAuditEvent({
      id: 'evt_001',
      event_type: AuditEventTypeEnum.TaskSubmitted,
      actor: { kind: AuditActorKindEnum.Agent, id: 'agent-pm', platform: 'recoder_pm' },
      target: { kind: AuditTargetKindEnum.Task, id: 'task_001' },
      trace_id: '4bf92f3577b34da6a3ce929d0e0e4736',
      workspace_id: 'ws_test',
      now: '2026-02-25T00:00:00.000Z',
    });

    expect(event.schema_version).toBe(AUDIT_EVENT_VERSION);
    expect(event.id).toBe('evt_001');
    expect(event.event_type).toBe('task.submitted');
    expect(event.actor.kind).toBe('agent');
    expect(event.target.kind).toBe('task');
    expect(event.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(event.workspace_id).toBe('ws_test');
    expect(event.timestamp).toBe('2026-02-25T00:00:00.000Z');
  });

  it('can create an event for every AuditEventType', () => {
    for (const eventType of AUDIT_EVENT_TYPES) {
      const event = createAuditEvent({
        id: `evt_${eventType.replace(/\./g, '_')}`,
        event_type: eventType,
        actor: { kind: AuditActorKindEnum.System, id: 'system' },
        target: { kind: AuditTargetKindEnum.System, id: 'system' },
        trace_id: 'trace_001',
        workspace_id: 'ws_test',
        now: '2026-02-25T00:00:00.000Z',
      });

      expect(event.event_type).toBe(eventType);
      expect(event.schema_version).toBe(AUDIT_EVENT_VERSION);
    }
  });

  it('AUDIT_EVENT_TYPES contains all AuditEventTypeEnum values', () => {
    const enumValues = Object.values(AuditEventTypeEnum);
    expect(new Set(AUDIT_EVENT_TYPES)).toEqual(new Set(enumValues));
    expect(AUDIT_EVENT_TYPES).toHaveLength(enumValues.length);
  });

  it('carries optional fields: severity, policy, metadata, tags, thread_id, task_id, duration_ms', () => {
    const event = createAuditEvent({
      id: 'evt_full',
      event_type: AuditEventTypeEnum.PolicyChecked,
      actor: { kind: AuditActorKindEnum.Connector, id: 'codex-v1' },
      target: { kind: AuditTargetKindEnum.Task, id: 'task_001' },
      trace_id: 'trace_full',
      workspace_id: 'ws_test',
      thread_id: 'thr_001',
      task_id: 'task_001',
      severity: AuditSeverityEnum.Warning,
      duration_ms: 42,
      policy: {
        action: 'file:write',
        rule: 'auto',
        approved: true,
        reason: 'Auto-approved',
        agent_id: 'codex-agent',
      },
      metadata: { connector: 'codex' },
      tags: ['connector:codex'],
      now: '2026-02-25T00:00:00.000Z',
    });

    expect(event.severity).toBe('warning');
    expect(event.thread_id).toBe('thr_001');
    expect(event.task_id).toBe('task_001');
    expect(event.duration_ms).toBe(42);
    expect(event.policy?.approved).toBe(true);
    expect(event.metadata).toEqual({ connector: 'codex' });
    expect(event.tags).toEqual(['connector:codex']);
  });
});

// ============================================================================
// 5. Error taxonomy
// ============================================================================

describe('Error taxonomy -- error code registry', () => {
  const allCodes = Object.values(A2AErrorCodeEnum);

  it('every A2AErrorCodeEnum value has an entry in A2A_ERROR_CODE_REGISTRY', () => {
    for (const code of allCodes) {
      const meta = A2A_ERROR_CODE_REGISTRY[code];
      expect(meta, `Missing registry entry for code: ${code}`).toBeDefined();
      expect(meta.code).toBe(code);
    }
  });

  it('registry has no extra entries beyond A2AErrorCodeEnum', () => {
    const registryCodes = Object.keys(A2A_ERROR_CODE_REGISTRY);
    expect(new Set(registryCodes)).toEqual(new Set(allCodes));
  });

  it('every registry entry has a valid category', () => {
    const validCategories = new Set(Object.values(A2AErrorCategoryEnum));
    for (const meta of Object.values(A2A_ERROR_CODE_REGISTRY)) {
      expect(
        validCategories.has(meta.category),
        `Invalid category "${meta.category}" for code "${meta.code}"`
      ).toBe(true);
    }
  });

  it('every registry entry has a valid severity', () => {
    const validSeverities = new Set(Object.values(A2AErrorSeverityEnum));
    for (const meta of Object.values(A2A_ERROR_CODE_REGISTRY)) {
      expect(
        validSeverities.has(meta.severity),
        `Invalid severity "${meta.severity}" for code "${meta.code}"`
      ).toBe(true);
    }
  });

  it('every registry entry has a boolean retryable flag', () => {
    for (const meta of Object.values(A2A_ERROR_CODE_REGISTRY)) {
      expect(typeof meta.retryable).toBe('boolean');
    }
  });

  it('every registry entry has a non-empty description', () => {
    for (const meta of Object.values(A2A_ERROR_CODE_REGISTRY)) {
      expect(meta.description.length).toBeGreaterThan(0);
    }
  });
});

describe('Error taxonomy -- buildA2AError', () => {
  it('builds a structured error with auto-resolved category and severity', () => {
    const error = buildA2AError({
      code: A2AErrorCodeEnum.ConnectorTimeout,
      message: 'Codex adapter timed out after 30s',
      now: '2026-02-25T00:00:00.000Z',
    });

    expect(error.code).toBe('CONNECTOR_TIMEOUT');
    expect(error.category).toBe('connector');
    expect(error.severity).toBe('high');
    expect(error.retryable).toBe(true);
    expect(error.message).toBe('Codex adapter timed out after 30s');
    expect(error.timestamp).toBe('2026-02-25T00:00:00.000Z');
  });

  it('allows overriding severity and retryable', () => {
    const error = buildA2AError({
      code: A2AErrorCodeEnum.InternalError,
      message: 'Overridden',
      severity: 'low',
      retryable: true,
    });

    expect(error.severity).toBe('low');
    expect(error.retryable).toBe(true);
  });

  it('includes optional details and trace_id', () => {
    const error = buildA2AError({
      code: A2AErrorCodeEnum.PolicyDenied,
      message: 'Denied',
      details: { action: 'bash:exec' },
      trace_id: 'trace_001',
    });

    expect(error.details).toEqual({ action: 'bash:exec' });
    expect(error.trace_id).toBe('trace_001');
  });

  it('works for every error code in the registry', () => {
    for (const code of Object.values(A2AErrorCodeEnum)) {
      const error = buildA2AError({
        code,
        message: `Test error for ${code}`,
        now: '2026-02-25T00:00:00.000Z',
      });
      const meta = A2A_ERROR_CODE_REGISTRY[code];
      expect(error.code).toBe(code);
      expect(error.category).toBe(meta.category);
      expect(error.severity).toBe(meta.severity);
      expect(error.retryable).toBe(meta.retryable);
    }
  });
});

describe('Error taxonomy -- helper functions', () => {
  it('getErrorCodeMeta returns metadata for valid codes', () => {
    const meta = getErrorCodeMeta('CONNECTOR_TIMEOUT');
    expect(meta).toBeDefined();
    expect(meta!.code).toBe('CONNECTOR_TIMEOUT');
    expect(meta!.category).toBe('connector');
  });

  it('getErrorCodeMeta returns undefined for invalid codes', () => {
    expect(getErrorCodeMeta('NONEXISTENT_CODE')).toBeUndefined();
  });

  it('isA2AErrorCode returns true for valid codes', () => {
    for (const code of Object.values(A2AErrorCodeEnum)) {
      expect(isA2AErrorCode(code)).toBe(true);
    }
  });

  it('isA2AErrorCode returns false for invalid codes', () => {
    expect(isA2AErrorCode('MADE_UP_CODE')).toBe(false);
    expect(isA2AErrorCode('')).toBe(false);
  });
});

describe('Error taxonomy -- A2AStructuredError class', () => {
  it('creates a throwable error with code, category, severity, retryable', () => {
    const a2aError = buildA2AError({
      code: A2AErrorCodeEnum.AuthenticationFailed,
      message: 'Invalid token',
    });
    const err = new A2AStructuredError(a2aError);

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(A2AStructuredError);
    expect(err.name).toBe('A2AStructuredError');
    expect(err.code).toBe('AUTHENTICATION_FAILED');
    expect(err.category).toBe('auth');
    expect(err.severity).toBe('high');
    expect(err.retryable).toBe(false);
    expect(err.message).toContain('AUTHENTICATION_FAILED');
    expect(err.message).toContain('Invalid token');
  });
});

// ============================================================================
// 6. Terminal states
// ============================================================================

describe('Terminal state identification', () => {
  it('completed is terminal', () => {
    expect(isTerminalState('completed')).toBe(true);
    expect(TERMINAL_TASK_STATES.has('completed')).toBe(true);
  });

  it('failed is terminal', () => {
    expect(isTerminalState('failed')).toBe(true);
    expect(TERMINAL_TASK_STATES.has('failed')).toBe(true);
  });

  it('cancelled is terminal', () => {
    expect(isTerminalState('cancelled')).toBe(true);
    expect(TERMINAL_TASK_STATES.has('cancelled')).toBe(true);
  });

  it('submitted is NOT terminal', () => {
    expect(isTerminalState('submitted')).toBe(false);
  });

  it('working is NOT terminal', () => {
    expect(isTerminalState('working')).toBe(false);
  });

  it('input-required is NOT terminal', () => {
    expect(isTerminalState('input-required')).toBe(false);
  });

  it('TERMINAL_TASK_STATES contains exactly 3 states', () => {
    expect(TERMINAL_TASK_STATES.size).toBe(3);
  });

  it('terminal states have no outgoing transitions in ALLOWED_STATE_TRANSITIONS', () => {
    for (const state of TERMINAL_TASK_STATES) {
      expect(ALLOWED_STATE_TRANSITIONS[state]).toEqual([]);
    }
  });

  it('non-terminal states have at least one outgoing transition', () => {
    for (const state of TASK_STATES) {
      if (!TERMINAL_TASK_STATES.has(state)) {
        expect(
          ALLOWED_STATE_TRANSITIONS[state].length,
          `${state} should have outgoing transitions`
        ).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================================================
// 7. Envelope immutability
// ============================================================================

describe('Envelope immutability -- transitionTaskEnvelope returns new object', () => {
  it('returns a new envelope object, does not mutate the original', () => {
    const original = createTaskEnvelope(makeEnvelopeInput());
    const transitioned = transitionTaskEnvelope(original, 'working', {
      reason: 'Starting execution',
      triggered_by: 'control-plane',
      now: '2026-02-25T00:01:00.000Z',
    });

    // New object
    expect(transitioned).not.toBe(original);

    // Original unchanged
    expect(original.state).toBe('submitted');
    expect(original.history).toEqual([]);
    expect(original.updated_at).toBe('2026-02-25T00:00:00.000Z');

    // Transitioned has new state
    expect(transitioned.state).toBe('working');
    expect(transitioned.updated_at).toBe('2026-02-25T00:01:00.000Z');
  });

  it('appends to history without mutating the original history', () => {
    const original = createTaskEnvelope(makeEnvelopeInput());
    const step1 = transitionTaskEnvelope(original, 'working', {
      now: '2026-02-25T00:01:00.000Z',
    });
    const step2 = transitionTaskEnvelope(step1, 'completed', {
      now: '2026-02-25T00:02:00.000Z',
    });

    expect(original.history).toHaveLength(0);
    expect(step1.history).toHaveLength(1);
    expect(step2.history).toHaveLength(2);

    // Original history array is not the same reference
    expect(step1.history).not.toBe(original.history);
    expect(step2.history).not.toBe(step1.history);
  });

  it('history entries record correct from/to states', () => {
    const envelope = createTaskEnvelope(makeEnvelopeInput());
    const working = transitionTaskEnvelope(envelope, 'working', {
      now: '2026-02-25T00:01:00.000Z',
    });
    const inputRequired = transitionTaskEnvelope(working, 'input-required', {
      now: '2026-02-25T00:02:00.000Z',
    });
    const backToWorking = transitionTaskEnvelope(inputRequired, 'working', {
      now: '2026-02-25T00:03:00.000Z',
    });
    const completed = transitionTaskEnvelope(backToWorking, 'completed', {
      now: '2026-02-25T00:04:00.000Z',
    });

    expect(completed.history).toHaveLength(4);
    expect(completed.history![0]).toMatchObject({ from: 'submitted', to: 'working' });
    expect(completed.history![1]).toMatchObject({ from: 'working', to: 'input-required' });
    expect(completed.history![2]).toMatchObject({ from: 'input-required', to: 'working' });
    expect(completed.history![3]).toMatchObject({ from: 'working', to: 'completed' });
  });

  it('history entries carry reason and triggered_by when provided', () => {
    const envelope = createTaskEnvelope(makeEnvelopeInput());
    const transitioned = transitionTaskEnvelope(envelope, 'working', {
      reason: 'Agent picked up the task',
      triggered_by: 'agent-codex',
      now: '2026-02-25T00:01:00.000Z',
    });

    expect(transitioned.history![0].reason).toBe('Agent picked up the task');
    expect(transitioned.history![0].triggered_by).toBe('agent-codex');
    expect(transitioned.history![0].transitioned_at).toBe('2026-02-25T00:01:00.000Z');
  });

  it('cannot transition from a terminal state', () => {
    const envelope = createTaskEnvelope(makeEnvelopeInput());
    const working = transitionTaskEnvelope(envelope, 'working');
    const completed = transitionTaskEnvelope(working, 'completed');

    expect(() => transitionTaskEnvelope(completed, 'working')).toThrow(
      'Invalid task state transition: completed -> working'
    );
  });

  it('preserves all other envelope fields through transitions', () => {
    const envelope = createTaskEnvelope(
      makeEnvelopeInput({
        metadata: { priority: 'high' },
        tags: ['team:backend'],
        parent_id: 'parent_001',
      })
    );
    const transitioned = transitionTaskEnvelope(envelope, 'working');

    expect(transitioned.id).toBe(envelope.id);
    expect(transitioned.workspace_id).toBe(envelope.workspace_id);
    expect(transitioned.thread_id).toBe(envelope.thread_id);
    expect(transitioned.trace_id).toBe(envelope.trace_id);
    expect(transitioned.parent_id).toBe('parent_001');
    expect(transitioned.requester).toEqual(envelope.requester);
    expect(transitioned.assignee).toEqual(envelope.assignee);
    expect(transitioned.connector).toEqual(envelope.connector);
    expect(transitioned.payload).toEqual(envelope.payload);
    expect(transitioned.metadata).toEqual({ priority: 'high' });
    expect(transitioned.tags).toEqual(['team:backend']);
    expect(transitioned.created_at).toBe(envelope.created_at);
  });
});

// ============================================================================
// 8. Schema version constants
// ============================================================================

describe('Schema version constants', () => {
  it('TASK_ENVELOPE_VERSION is a valid semver string', () => {
    expect(TASK_ENVELOPE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('AUDIT_EVENT_VERSION is a valid semver string', () => {
    expect(AUDIT_EVENT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ============================================================================
// 9. Error category coverage
// ============================================================================

describe('Error category coverage', () => {
  it('every category has at least one error code', () => {
    const categoriesWithCodes = new Set(
      Object.values(A2A_ERROR_CODE_REGISTRY).map((m) => m.category)
    );
    const allCategories = new Set(Object.values(A2AErrorCategoryEnum));

    for (const category of allCategories) {
      expect(
        categoriesWithCodes.has(category),
        `Category "${category}" has no error codes`
      ).toBe(true);
    }
  });
});
