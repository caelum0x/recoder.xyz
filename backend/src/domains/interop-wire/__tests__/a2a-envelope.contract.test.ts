/**
 * Golden round-trip + tamper/expiry contract for the A2A envelope service,
 * proving it binds correctly to `@recoder/a2a-sdk`'s canonical signed-envelope
 * primitives (build → seal → validate; and the fail-closed rejections).
 */
import { describe, it, expect } from 'vitest';
import { createEnvelopeService } from '../wire/a2a-envelope.service.js';

const SECRET = 'test-hmac-secret-abc123';

function svc() {
  return createEnvelopeService({ hmacSecret: SECRET, keyId: 'test-key', requireSignature: true });
}

describe('a2a-envelope contract', () => {
  it('round-trips a built → sealed → validated envelope with the payload intact', () => {
    const s = svc();
    const built = s.buildEnvelope({ from: 'agent:a', to: 'agent:b', kind: 'task.submit', payload: { hello: 'world', n: 7 } });
    const sealed = s.sealEnvelope(built);
    expect(sealed.signature.algorithm).toBe('hmac-sha256');
    expect(sealed.signature.signature).not.toBe(''); // real HMAC, not a marker
    const result = s.validateInbound<{ hello: string; n: number }>(sealed);
    expect(result.valid).toBe(true);
    expect(result.status).toBe(200);
    expect(result.envelope?.from).toBe('agent:a');
    expect(result.envelope?.payload).toEqual({ hello: 'world', n: 7 });
  });

  it('rejects a tampered payload (signature no longer matches) — 401, fail-closed', () => {
    const s = svc();
    const sealed = s.sealEnvelope(s.buildEnvelope({ from: 'a', kind: 'k', payload: { v: 1 } }));
    const tampered = { ...sealed, payload: { ...(sealed.payload as object), v: 999 } };
    const result = s.validateInbound(tampered);
    expect(result.valid).toBe(false);
    expect(result.status).toBe(401);
    expect(result.code).toBe('signed_envelope_bad_signature');
  });

  it('rejects an expired envelope — 401', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const s = createEnvelopeService({ hmacSecret: SECRET, keyId: 'k', requireSignature: true });
    const built = s.buildEnvelope({ from: 'a', kind: 'k', payload: {} });
    const sealed = s.sealEnvelope(built, { now });
    const expired = { ...sealed, signature: { ...sealed.signature, expires_at: '2025-12-31T00:00:00.000Z' } };
    const result = s.validateInbound(expired, { now });
    expect(result.valid).toBe(false);
    expect(result.code).toBe('signed_envelope_expired');
  });

  it('rejects an unsigned envelope when a signature is required — never a faked valid', () => {
    const s = svc();
    const result = s.validateInbound({ id: 'x', from: 'a', kind: 'k', payload: {}, createdAt: new Date().toISOString() });
    expect(result.valid).toBe(false);
    expect(result.code).toBe('signed_envelope_required');
  });

  it('never throws on garbage input', () => {
    const s = svc();
    expect(() => s.validateInbound(null)).not.toThrow();
    expect(() => s.validateInbound(42)).not.toThrow();
    expect(s.validateInbound(undefined).valid).toBe(false);
  });
});
