import { describe, expect, it } from 'vitest';

import { createTaskEnvelope } from './schemas';
import { normalizeInboundEnvelope } from './ingress';

const validInput = {
  id: 'task-1',
  workspace_id: 'ws-1',
  thread_id: 'th-1',
  trace_id: 'tr-1',
  requester: { agent_id: 'req-1', platform: 'recoder_web' as const },
  assignee: { agent_id: 'asg-1', platform: 'recoder_pm' as const },
  connector: {
    platform: 'recoder_pm' as const,
    protocol: 'a2a' as const,
    connector_id: 'conn-1',
  },
  payload: { kind: 'text' as const, text: 'hello' },
  now: '2026-05-31T00:00:00.000Z',
};

describe('normalizeInboundEnvelope', () => {
  it('accepts a valid envelope object', () => {
    const env = createTaskEnvelope(validInput);
    const result = normalizeInboundEnvelope(env);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.envelope.id).toBe('task-1');
      expect(result.envelope.workspace_id).toBe('ws-1');
    }
  });

  it('accepts a valid envelope passed as a raw JSON string', () => {
    const env = createTaskEnvelope(validInput);
    const result = normalizeInboundEnvelope(JSON.stringify(env));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.envelope.trace_id).toBe('tr-1');
  });

  it('rejects malformed JSON strings with a single parse issue', () => {
    const result = normalizeInboundEnvelope('{ not valid json ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].path).toBe('$');
      expect(result.issues[0].message).toMatch(/invalid JSON/i);
    }
  });

  it('rejects a non-object value', () => {
    const result = normalizeInboundEnvelope(42);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0].path).toBe('$');
  });

  it('returns field-level issues for an incomplete envelope', () => {
    const result = normalizeInboundEnvelope({ id: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const paths = result.issues.map((i) => i.path);
      expect(paths).toContain('workspace_id');
      expect(paths).toContain('requester');
    }
  });

  it('passes a present-but-legacy version when not strict, and rejects it under strictVersion', () => {
    // Mirrors the PM ingress case: legacy envelope_version "0.3.0".
    const legacy = { ...createTaskEnvelope(validInput), envelope_version: '0.3.0' };

    const loose = normalizeInboundEnvelope(legacy);
    expect(loose.ok).toBe(true);

    const strict = normalizeInboundEnvelope(legacy, { strictVersion: true });
    expect(strict.ok).toBe(false);
    if (!strict.ok) {
      expect(strict.issues.some((i) => i.path === 'envelope_version')).toBe(true);
    }
  });
});
