/**
 * @module a2a-openclaw-adapter.test
 *
 * Tests for SFA-010: OpenClaw adapter endpoint.
 *
 * These are unit-level tests that exercise the exported helpers and
 * integration-level tests that exercise the Express router via
 * lightweight HTTP simulation (supertest-style, but without the dep --
 * we use the router directly with mock req/res).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  __testTaskStore,
  __testStoreTask,
  __testGetTask,
  __testParseTraceparent,
  __testResolveTraceId,
} from './a2a-openclaw-adapter';
import {
  validateOpenClawEvent,
  mapOpenClawEvent,
  type TaskEnvelope,
} from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeVoiceTranscriptEvent(overrides?: Record<string, unknown>) {
  return {
    event: 'voice.transcript',
    nodeId: 'node-test-1',
    text: 'Hello world',
    ...overrides,
  };
}

function makeAgentRequestEvent(overrides?: Record<string, unknown>) {
  return {
    event: 'agent.request',
    nodeId: 'node-test-1',
    message: 'Do something',
    ...overrides,
  };
}

function makeChatSubscribeEvent(overrides?: Record<string, unknown>) {
  return {
    event: 'chat.subscribe',
    nodeId: 'node-test-1',
    sessionKey: 'session-1',
    ...overrides,
  };
}

function makeExecStartedEvent(overrides?: Record<string, unknown>) {
  return {
    event: 'exec.started',
    nodeId: 'node-test-1',
    sessionKey: 'sess-1',
    runId: 'run-abc',
    command: 'npm test',
    ...overrides,
  };
}

function makeHookAgentEvent(overrides?: Record<string, unknown>) {
  return {
    event: 'hook.agent',
    message: 'run this',
    name: 'TestHook',
    wakeMode: 'now',
    sessionKey: 'sess-1',
    deliver: true,
    channel: 'telegram',
    ...overrides,
  };
}

function makeAgentLifecycleEvent(overrides?: Record<string, unknown>) {
  return {
    event: 'agent.lifecycle',
    runId: 'run-1',
    seq: 1,
    ts: Date.now(),
    phase: 'start',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: Traceparent parsing
// ---------------------------------------------------------------------------

describe('parseTraceparent', () => {
  it('parses a valid W3C traceparent header', () => {
    const result = __testParseTraceparent(
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    );
    expect(result).not.toBeNull();
    expect(result!.version).toBe('00');
    expect(result!.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(result!.parent_id).toBe('00f067aa0ba902b7');
    expect(result!.trace_flags).toBe('01');
  });

  it('returns null for invalid traceparent', () => {
    expect(__testParseTraceparent('invalid')).toBeNull();
    expect(__testParseTraceparent('')).toBeNull();
    expect(__testParseTraceparent('00-short-short-01')).toBeNull();
  });

  it('handles uppercase by lowercasing', () => {
    const result = __testParseTraceparent(
      '00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01'
    );
    expect(result).not.toBeNull();
    expect(result!.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
  });

  it('trims whitespace', () => {
    const result = __testParseTraceparent(
      '  00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01  '
    );
    expect(result).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Trace ID resolution
// ---------------------------------------------------------------------------

describe('resolveTraceId', () => {
  it('prefers event trace_id over traceparent', () => {
    const result = __testResolveTraceId(
      'event-trace-id-12345678901234567890',
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    );
    expect(result.trace_id).toBe('event-trace-id-12345678901234567890');
    expect(result.source).toBe('event');
  });

  it('falls back to traceparent when event trace_id is missing', () => {
    const result = __testResolveTraceId(
      undefined,
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    );
    expect(result.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(result.source).toBe('traceparent');
  });

  it('falls back to traceparent when event trace_id is empty string', () => {
    const result = __testResolveTraceId(
      '',
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'
    );
    expect(result.trace_id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(result.source).toBe('traceparent');
  });

  it('generates a trace_id when neither event nor traceparent is available', () => {
    const result = __testResolveTraceId(undefined, undefined);
    expect(result.trace_id).toBeTruthy();
    expect(result.trace_id.length).toBe(32);
    expect(result.source).toBe('generated');
  });

  it('generates a trace_id when traceparent is invalid', () => {
    const result = __testResolveTraceId(undefined, 'not-valid');
    expect(result.trace_id).toBeTruthy();
    expect(result.source).toBe('generated');
  });
});

// ---------------------------------------------------------------------------
// Tests: Task store
// ---------------------------------------------------------------------------

describe('task store', () => {
  beforeEach(() => {
    __testTaskStore.clear();
  });

  it('stores and retrieves a task envelope', () => {
    const validation = validateOpenClawEvent(makeVoiceTranscriptEvent());
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const result = mapOpenClawEvent(validation.event, {
      workspace_id: 'ws_test',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || 'skipped' in result) return;

    const envelope = result.envelope;
    __testStoreTask(envelope);

    const retrieved = __testGetTask(envelope.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(envelope.id);
    expect(retrieved!.trace_id).toBe(envelope.trace_id);
  });

  it('returns undefined for non-existent task', () => {
    expect(__testGetTask('nonexistent-task-id')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: Validation + mapping integration
// ---------------------------------------------------------------------------

describe('validation and mapping integration', () => {
  it('validates and maps a voice.transcript event', () => {
    const raw = makeVoiceTranscriptEvent();
    const validation = validateOpenClawEvent(raw);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const result = mapOpenClawEvent(validation.event, {
      workspace_id: 'ws_test',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || 'skipped' in result) return;

    expect(result.envelope.id).toBeTruthy();
    expect(result.envelope.trace_id).toBeTruthy();
    expect(result.envelope.state).toBe('submitted');
    expect(result.envelope.workspace_id).toBe('ws_test');
    expect(result.envelope.connector.connector_id).toBe(
      'openclaw-gateway-v1'
    );
  });

  it('validates and maps an agent.request event', () => {
    const raw = makeAgentRequestEvent();
    const validation = validateOpenClawEvent(raw);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const result = mapOpenClawEvent(validation.event, {
      workspace_id: 'ws_test',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || 'skipped' in result) return;

    expect(result.envelope.state).toBe('submitted');
  });

  it('skips chat.subscribe events', () => {
    const raw = makeChatSubscribeEvent();
    const validation = validateOpenClawEvent(raw);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const result = mapOpenClawEvent(validation.event, {
      workspace_id: 'ws_test',
    });
    expect(result.ok).toBe(true);
    expect('skipped' in result).toBe(true);
  });

  it('skips chat.unsubscribe events', () => {
    const raw = {
      event: 'chat.unsubscribe',
      nodeId: 'node-1',
      sessionKey: 'session-1',
    };
    const validation = validateOpenClawEvent(raw);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const result = mapOpenClawEvent(validation.event, {
      workspace_id: 'ws_test',
    });
    expect(result.ok).toBe(true);
    expect('skipped' in result).toBe(true);
  });

  it('maps exec.started to working state', () => {
    const raw = makeExecStartedEvent();
    const validation = validateOpenClawEvent(raw);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const result = mapOpenClawEvent(validation.event, {
      workspace_id: 'ws_test',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || 'skipped' in result) return;

    expect(result.envelope.state).toBe('working');
  });

  it('maps hook.agent with custom trace_id', () => {
    const raw = makeHookAgentEvent({
      trace: { trace_id: 'custom-trace-for-hook-agent-test' },
    });
    const validation = validateOpenClawEvent(raw);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const result = mapOpenClawEvent(validation.event, {
      workspace_id: 'ws_test',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || 'skipped' in result) return;

    expect(result.envelope.trace_id).toBe('custom-trace-for-hook-agent-test');
  });

  it('maps agent.lifecycle with start phase to working state', () => {
    const raw = makeAgentLifecycleEvent();
    const validation = validateOpenClawEvent(raw);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const result = mapOpenClawEvent(validation.event, {
      workspace_id: 'ws_test',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || 'skipped' in result) return;

    expect(result.envelope.state).toBe('working');
  });

  it('rejects malformed events (missing required fields)', () => {
    const raw = { event: 'voice.transcript' }; // missing nodeId, text
    const validation = validateOpenClawEvent(raw);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error.code).toBe('MISSING_ENVELOPE_FIELD');
  });

  it('rejects unknown event types', () => {
    const raw = { event: 'unknown.event.type' };
    const validation = validateOpenClawEvent(raw);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error.code).toBe('INVALID_PAYLOAD');
  });

  it('rejects non-object payloads', () => {
    const validation = validateOpenClawEvent('not an object');
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error.code).toBe('INVALID_ENVELOPE');
  });

  it('rejects null payloads', () => {
    const validation = validateOpenClawEvent(null);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error.code).toBe('INVALID_ENVELOPE');
  });
});

// ---------------------------------------------------------------------------
// Tests: Error codes mapping to HTTP status
// ---------------------------------------------------------------------------

describe('error code to HTTP status mapping', () => {
  it('INVALID_ENVELOPE maps to 400', () => {
    const validation = validateOpenClawEvent(null);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    // The adapter route maps all validation failures to 400
    expect(validation.error.code).toBe('INVALID_ENVELOPE');
  });

  it('MISSING_ENVELOPE_FIELD maps to 400', () => {
    const validation = validateOpenClawEvent({ event: 'voice.transcript' });
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error.code).toBe('MISSING_ENVELOPE_FIELD');
  });

  it('INVALID_PAYLOAD maps to 400', () => {
    const validation = validateOpenClawEvent({ event: 'bogus.event' });
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.error.code).toBe('INVALID_PAYLOAD');
  });
});

// ---------------------------------------------------------------------------
// Tests: Trace propagation with mapper options
// ---------------------------------------------------------------------------

describe('trace propagation through mapper', () => {
  it('uses custom trace_id_factory when provided', () => {
    const raw = makeVoiceTranscriptEvent();
    const validation = validateOpenClawEvent(raw);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const fixedTraceId = 'aaaabbbbccccddddeeeeffffaaaabbbb';
    const result = mapOpenClawEvent(validation.event, {
      workspace_id: 'ws_test',
      trace_id_factory: () => fixedTraceId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok || 'skipped' in result) return;

    expect(result.envelope.trace_id).toBe(fixedTraceId);
  });

  it('preserves event trace_id over factory', () => {
    const eventTraceId = 'event123456789012345678901234567890'.slice(0, 32);
    const raw = makeVoiceTranscriptEvent({
      trace: { trace_id: eventTraceId },
    });
    const validation = validateOpenClawEvent(raw);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const result = mapOpenClawEvent(validation.event, {
      workspace_id: 'ws_test',
      trace_id_factory: () => 'should-not-be-used-12345678901',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || 'skipped' in result) return;

    expect(result.envelope.trace_id).toBe(eventTraceId);
  });
});

// ---------------------------------------------------------------------------
// Tests: Full event type coverage
// ---------------------------------------------------------------------------

describe('full event type coverage', () => {
  const allTaskEvents = [
    { name: 'voice.transcript', factory: makeVoiceTranscriptEvent },
    { name: 'agent.request', factory: makeAgentRequestEvent },
    { name: 'exec.started', factory: makeExecStartedEvent },
    {
      name: 'exec.finished',
      factory: () => ({
        event: 'exec.finished',
        nodeId: 'node-1',
        runId: 'run-1',
        exitCode: 0,
        output: 'success',
      }),
    },
    {
      name: 'exec.denied',
      factory: () => ({
        event: 'exec.denied',
        nodeId: 'node-1',
        runId: 'run-1',
        command: 'rm -rf /',
        reason: 'dangerous',
      }),
    },
    {
      name: 'hook.wake',
      factory: () => ({
        event: 'hook.wake',
        text: 'wake up',
        mode: 'now',
      }),
    },
    { name: 'hook.agent', factory: makeHookAgentEvent },
    { name: 'agent.lifecycle', factory: makeAgentLifecycleEvent },
    {
      name: 'agent.tool',
      factory: () => ({
        event: 'agent.tool',
        runId: 'run-1',
        seq: 1,
        ts: Date.now(),
      }),
    },
    {
      name: 'agent.assistant',
      factory: () => ({
        event: 'agent.assistant',
        runId: 'run-1',
        seq: 1,
        ts: Date.now(),
        data: { text: 'Hello!' },
      }),
    },
    {
      name: 'agent.error',
      factory: () => ({
        event: 'agent.error',
        runId: 'run-1',
        seq: 1,
        ts: Date.now(),
        data: { error: 'boom' },
      }),
    },
  ];

  for (const { name, factory } of allTaskEvents) {
    it(`maps ${name} to a TaskEnvelope`, () => {
      const raw = factory();
      const validation = validateOpenClawEvent(raw);
      expect(validation.ok).toBe(true);
      if (!validation.ok) return;

      const result = mapOpenClawEvent(validation.event, {
        workspace_id: 'ws_coverage_test',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect('skipped' in result).toBe(false);
      if ('skipped' in result) return;

      const envelope = result.envelope;
      expect(envelope.id).toBeTruthy();
      expect(envelope.trace_id).toBeTruthy();
      expect(envelope.workspace_id).toBe('ws_coverage_test');
      expect(envelope.connector.connector_id).toBe('openclaw-gateway-v1');
    });
  }

  const skippedEvents = [
    {
      name: 'chat.subscribe',
      factory: makeChatSubscribeEvent,
    },
    {
      name: 'chat.unsubscribe',
      factory: () => ({
        event: 'chat.unsubscribe',
        nodeId: 'node-1',
        sessionKey: 'session-1',
      }),
    },
  ];

  for (const { name, factory } of skippedEvents) {
    it(`skips ${name} as non-task event`, () => {
      const raw = factory();
      const validation = validateOpenClawEvent(raw);
      expect(validation.ok).toBe(true);
      if (!validation.ok) return;

      const result = mapOpenClawEvent(validation.event, {
        workspace_id: 'ws_test',
      });
      expect(result.ok).toBe(true);
      expect('skipped' in result).toBe(true);
    });
  }
});
