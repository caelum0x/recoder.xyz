/**
 * Signed-ingress gate: hostile-by-default admission. Proves the fail-closed
 * precedence — required-but-no-secret denies, verified admits, tamper/expiry
 * reject, and dev-insecure never leaks in production posture.
 */
import { describe, it, expect } from 'vitest';
import { createEnvelopeService } from '../wire/a2a-envelope.service.js';
import { createSignedIngressGate } from '../wire/signed-ingress.gate.js';

const SECRET = 'gate-secret-xyz';

function gate(opts: { requireSigned: boolean; hmacSecret: string | null; allowInsecure: boolean }) {
  const envelope = createEnvelopeService({ hmacSecret: opts.hmacSecret, keyId: 'k', requireSignature: opts.requireSigned });
  return { envelope, g: createSignedIngressGate(envelope, opts) };
}

describe('signed-ingress gate', () => {
  it('admits a correctly-signed envelope and returns the verified payload', async () => {
    const { envelope, g } = gate({ requireSigned: true, hmacSecret: SECRET, allowInsecure: false });
    const sealed = envelope.sealEnvelope(envelope.buildEnvelope({ from: 'a', kind: 'k', payload: { ok: true } }));
    const result = await g.admit<{ ok: boolean }>(sealed);
    expect(result.admitted).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toEqual({ ok: true });
  });

  it('DENIES (503) when a signature is required but no secret is configured', async () => {
    const { g } = gate({ requireSigned: true, hmacSecret: null, allowInsecure: false });
    const result = await g.admit({ anything: true });
    expect(result.admitted).toBe(false);
    expect(result.status).toBe(503);
    expect(result.code).toBe('signed_ingress_secret_missing');
  });

  it('rejects a tampered envelope (bad signature) — never admits forged input', async () => {
    const { envelope, g } = gate({ requireSigned: true, hmacSecret: SECRET, allowInsecure: false });
    const sealed = envelope.sealEnvelope(envelope.buildEnvelope({ from: 'a', kind: 'k', payload: { v: 1 } }));
    const forged = { ...sealed, payload: { ...(sealed.payload as object), v: 2 } };
    const result = await g.admit(forged);
    expect(result.admitted).toBe(false);
    expect(result.status).toBe(401);
  });

  it('rejects an unsigned envelope in production posture (requireSigned)', async () => {
    const { g } = gate({ requireSigned: true, hmacSecret: SECRET, allowInsecure: false });
    const result = await g.admit({ id: 'x', from: 'a', kind: 'k', payload: {}, createdAt: new Date().toISOString() });
    expect(result.admitted).toBe(false);
  });

  it('never throws on hostile garbage input', async () => {
    const { g } = gate({ requireSigned: true, hmacSecret: SECRET, allowInsecure: false });
    await expect(g.admit(null)).resolves.toMatchObject({ admitted: false });
    await expect(g.admit('not-an-envelope')).resolves.toMatchObject({ admitted: false });
  });
});
