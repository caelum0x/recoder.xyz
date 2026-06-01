import { describe, expect, it } from 'vitest';

import { validateInboundA2AEnvelope } from './index';

const baseLegacy = {
  envelopeVersion: '0.3.0',
  protocolVersion: '0.3.0',
  messageId: 'msg-1',
  threadId: 'thr-1',
  createdAt: '2026-05-31T00:00:00.000Z',
  from: { id: 'agent-a', platform: 'recoder_pm', name: 'A' },
  to: { id: 'agent-b', platform: 'recoder_agency', name: 'B' },
  intent: 'execute',
  payload: [{ kind: 'text' as const, text: 'hi' }],
  trace: { traceId: 'trace-1' },
};

describe('validateInboundA2AEnvelope', () => {
  it('adapts and validates a legacy envelope, preserving thread/trace ids', () => {
    const result = validateInboundA2AEnvelope(baseLegacy, { workspaceId: 'ws-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.workspace_id).toBe('ws-1');
      expect(result.envelope.thread_id).toBe('thr-1');
      expect(result.envelope.trace_id).toBe('trace-1');
      expect(result.envelope.id).toBe('msg-1');
    }
  });

  it('falls back trace_id to messageId when no trace block is present', () => {
    const { trace: _trace, ...noTrace } = baseLegacy;
    const result = validateInboundA2AEnvelope(noTrace, { workspaceId: 'ws-1' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.envelope.trace_id).toBe('msg-1');
  });

  it('normalizes non-canonical legacy platforms to custom instead of rejecting', () => {
    const cursorLegacy = {
      ...baseLegacy,
      from: { id: 'agent-a', platform: 'cursor', name: 'A' },
    };
    const result = validateInboundA2AEnvelope(cursorLegacy, { workspaceId: 'ws-1' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.envelope.requester.platform).toBe('custom');
  });

  it('returns a canonical INVALID_ENVELOPE error for a malformed envelope', () => {
    const broken = { ...baseLegacy, messageId: '' };
    const result = validateInboundA2AEnvelope(broken, { workspaceId: 'ws-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_ENVELOPE');
      expect(result.error.category).toBeTruthy();
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
});
