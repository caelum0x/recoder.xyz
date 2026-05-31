import { describe, expect, it } from 'vitest';

import { adaptLegacyEnvelopeToTaskEnvelope } from './envelope-adapters';
import { normalizeInboundEnvelope } from './ingress';

const legacy = {
  envelopeVersion: '2026-02-14',
  protocolVersion: '0.3.0',
  messageId: 'msg-1',
  threadId: 'thread-1',
  createdAt: '2026-05-31T00:00:00.000Z',
  from: { id: 'agent-web', platform: 'recoder_web', name: 'Web' },
  to: { id: 'agent-pm', platform: 'recoder_pm', name: 'PM', instanceId: 'pm-iid' },
  intent: 'plan',
  payload: [{ kind: 'text', text: 'hello' }],
  metadata: { foo: 'bar' },
  trace: { traceId: 'trace-1', parentMessageId: 'msg-0' },
};

describe('adaptLegacyEnvelopeToTaskEnvelope', () => {
  it('renames legacy fields onto the canonical envelope', () => {
    const env = adaptLegacyEnvelopeToTaskEnvelope(legacy, { workspaceId: 'ws-9' });
    expect(env.id).toBe('msg-1');
    expect(env.thread_id).toBe('thread-1');
    expect(env.trace_id).toBe('trace-1');
    expect(env.parent_id).toBe('msg-0');
    expect(env.workspace_id).toBe('ws-9');
    expect(env.requester).toMatchObject({ agent_id: 'agent-web', platform: 'recoder_web' });
    expect(env.assignee).toMatchObject({ agent_id: 'agent-pm', platform: 'recoder_pm', instance_id: 'pm-iid' });
    expect(env.created_at).toBe('2026-05-31T00:00:00.000Z');
    expect(env.updated_at).toBe('2026-05-31T00:00:00.000Z');
  });

  it('produces an envelope that passes shared ingress validation', () => {
    const env = adaptLegacyEnvelopeToTaskEnvelope(legacy, { workspaceId: 'ws-9' });
    const result = normalizeInboundEnvelope(env);
    expect(result.ok).toBe(true);
  });

  it('preserves intent and legacy versions in metadata (nothing lost)', () => {
    const env = adaptLegacyEnvelopeToTaskEnvelope(legacy, { workspaceId: 'ws-9' });
    expect(env.metadata).toMatchObject({
      foo: 'bar',
      intent: 'plan',
      legacyProtocolVersion: '0.3.0',
      legacyEnvelopeVersion: '2026-02-14',
    });
  });

  it('defaults connector protocol to a2a and connector_id to the assignee id', () => {
    const env = adaptLegacyEnvelopeToTaskEnvelope(legacy, { workspaceId: 'ws-9' });
    expect(env.connector).toMatchObject({
      platform: 'recoder_pm',
      protocol: 'a2a',
      connector_id: 'agent-pm',
    });
  });

  it('honors explicit protocol/connectorId/state overrides', () => {
    const env = adaptLegacyEnvelopeToTaskEnvelope(legacy, {
      workspaceId: 'ws-9',
      protocol: 'mcp',
      connectorId: 'conn-custom',
      state: 'working',
    });
    expect(env.connector.protocol).toBe('mcp');
    expect(env.connector.connector_id).toBe('conn-custom');
    expect(env.state).toBe('working');
  });

  it('falls back trace_id to messageId when no trace is present', () => {
    const noTrace = { ...legacy, trace: undefined };
    const env = adaptLegacyEnvelopeToTaskEnvelope(noTrace, { workspaceId: 'ws-9' });
    expect(env.trace_id).toBe('msg-1');
    expect(env.parent_id).toBeUndefined();
  });
});
