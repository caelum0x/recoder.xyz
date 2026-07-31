/**
 * acp-session-update — the structured-marker mapper, tested against the real ACP
 * SessionUpdate shapes. Proves: tool_call / tool_call_update / plan produce a
 * marker; streaming-text + metadata variants produce none; summaries are concise;
 * and the transcript line is empty (append-nothing) for non-structured updates.
 */
import { describe, it, expect } from 'vitest';
import {
  mapSessionUpdate,
  summarizeStructuredUpdate,
  structuredUpdateLine,
} from './acp-session-update.js';

const wrap = (update: Record<string, unknown>) => ({ sessionId: 's1', update });

describe('mapSessionUpdate', () => {
  it('maps a tool_call to a structured marker', () => {
    const m = mapSessionUpdate(
      wrap({
        sessionUpdate: 'tool_call',
        toolCallId: 't1',
        title: 'run tests',
        kind: 'execute',
        status: 'in_progress',
      })
    );
    expect(m).toEqual({
      type: 'tool_call',
      toolCallId: 't1',
      title: 'run tests',
      kind: 'execute',
      status: 'in_progress',
    });
  });

  it('maps a tool_call_update (status change)', () => {
    const m = mapSessionUpdate(
      wrap({
        sessionUpdate: 'tool_call_update',
        toolCallId: 't1',
        status: 'completed',
      })
    );
    expect(m).toEqual({
      type: 'tool_call',
      toolCallId: 't1',
      status: 'completed',
    });
  });

  it('maps a plan with its entries', () => {
    const m = mapSessionUpdate(
      wrap({
        sessionUpdate: 'plan',
        entries: [
          { content: 'read code', status: 'completed', priority: 'high' },
          { content: 'edit file', status: 'in_progress' },
          { junk: true },
        ],
      })
    );
    expect(m).toEqual({
      type: 'plan',
      entries: [
        { content: 'read code', status: 'completed', priority: 'high' },
        { content: 'edit file', status: 'in_progress' },
        { content: '' },
      ],
    });
  });

  it('returns null for streaming-text + metadata variants', () => {
    for (const kind of [
      'agent_message_chunk',
      'user_message_chunk',
      'agent_thought_chunk',
      'usage_update',
      'current_mode_update',
    ]) {
      expect(
        mapSessionUpdate(wrap({ sessionUpdate: kind, content: { text: 'x' } }))
      ).toBeNull();
    }
  });

  it('returns null for malformed params', () => {
    expect(mapSessionUpdate(null)).toBeNull();
    expect(mapSessionUpdate({})).toBeNull();
    expect(mapSessionUpdate({ update: 'nope' })).toBeNull();
  });
});

describe('summarizeStructuredUpdate', () => {
  it('summarizes a tool call with title/kind/status', () => {
    expect(
      summarizeStructuredUpdate({
        type: 'tool_call',
        title: 'run tests',
        kind: 'execute',
        status: 'in_progress',
      })
    ).toBe('tool: run tests [execute] — in_progress');
  });

  it('summarizes a plan with done/total and the active entry', () => {
    const s = summarizeStructuredUpdate({
      type: 'plan',
      entries: [
        { content: 'a', status: 'completed' },
        { content: 'b', status: 'in_progress' },
        { content: 'c', status: 'pending' },
      ],
    });
    expect(s).toBe('plan: 1/3 done — now: b');
  });
});

describe('structuredUpdateLine', () => {
  it('produces a bracketed transcript line for a structured update', () => {
    expect(
      structuredUpdateLine(
        wrap({
          sessionUpdate: 'tool_call',
          title: 'grep',
          kind: 'search',
          status: 'completed',
        })
      )
    ).toBe('\n[acp tool: grep [search] — completed]');
  });

  it('produces an empty string (append-nothing) for non-structured updates', () => {
    expect(
      structuredUpdateLine(
        wrap({ sessionUpdate: 'agent_message_chunk', content: { text: 'hi' } })
      )
    ).toBe('');
  });
});
