import { describe, it, expect } from 'vitest';
import { createEnvelopeService } from './a2a-envelope.service.js';

const svc = createEnvelopeService();

const wellFormed = { id: 'a2a_1', from: 'agent-a', kind: 'task.request', payload: { n: 1 } };

describe('createEnvelopeService — build', () => {
  it('builds a well-formed envelope carrying from/kind/payload and a createdAt', () => {
    const env = svc.buildEnvelope({ from: 'agent-a', kind: 'task.request', payload: { n: 1 } });
    expect(env.from).toBe('agent-a');
    expect(env.kind).toBe('task.request');
    expect(env.payload).toEqual({ n: 1 });
    expect(typeof env.id).toBe('string');
    expect(env.id.startsWith('a2a_')).toBe(true);
    expect(typeof env.createdAt).toBe('string');
  });

  it('preserves the optional to + correlationId when supplied', () => {
    const env = svc.buildEnvelope({ from: 'a', to: 'b', kind: 'k', payload: 1, correlationId: 'corr-1' });
    expect(env.to).toBe('b');
    expect(env.correlationId).toBe('corr-1');
  });
});

describe('createEnvelopeService — parse (never throws on untrusted input)', () => {
  it('returns the envelope for a well-formed shape', () => {
    expect(svc.parseEnvelope(wellFormed)).toEqual(wellFormed);
  });

  it.each([null, undefined, 42, 'str', {}, { id: 'x' }, { id: 'x', from: 'a', kind: 'k' /* no payload */ }])(
    'returns null (not a throw) for malformed input %j',
    (bad) => {
      expect(svc.parseEnvelope(bad)).toBeNull();
    },
  );
});

describe('createEnvelopeService — validateInbound (fail-closed, never fake-valid)', () => {
  it('accepts a structurally valid envelope', () => {
    const v = svc.validateInbound(wellFormed);
    expect(v.valid).toBe(true);
    expect(v.code).toBe('envelope_ok');
    expect(v.envelope).toEqual(wellFormed);
  });

  it.each([null, undefined, 'nope', 7, {}, { id: 'x', from: 'a' /* missing kind + payload */ }])(
    'REJECTS malformed input %j as envelope_malformed with no envelope attached',
    (bad) => {
      const v = svc.validateInbound(bad);
      expect(v.valid).toBe(false);
      expect(v.code).toBe('envelope_malformed');
      expect(v.envelope).toBeUndefined();
    },
  );
});
