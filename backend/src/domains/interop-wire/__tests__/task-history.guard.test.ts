/**
 * Task-history ingress guard: proves the a2a-sdk's `validateTaskHistory` is
 * WIRED at the point untrusted remote history enters Recoder — the interop-wire
 * ingress gates. A payload carrying a malformed / discontinuous / illegal
 * history chain is REJECTED (400 `task_history_invalid`) by:
 *   - the pure guard itself (`checkPayloadTaskHistory`),
 *   - the HMAC signed-ingress gate (via `validateInbound`), and
 *   - the ed25519 gate's domain-admission path (verified AND permissive modes).
 * A payload with no history projection, or a well-formed chain, is unaffected.
 */
import { describe, it, expect } from 'vitest';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { canonicalJson } from '@recoder/a2a-sdk';
import type { A2AEnvelope } from '../types.js';
import { createEnvelopeService } from '../wire/a2a-envelope.service.js';
import { createSignedIngressGate } from '../wire/signed-ingress.gate.js';
import { createEd25519IngressGate } from '../wire/ed25519-ingress.gate.js';
import { checkPayloadTaskHistory, TASK_HISTORY_INVALID_CODE } from '../wire/task-history.guard.js';

const SECRET = 'task-history-guard-secret';

const VALID_HISTORY = [
  { from: 'submitted', to: 'working', transitioned_at: '2026-01-01T00:00:00.000Z' },
  { from: 'working', to: 'completed', transitioned_at: '2026-01-01T00:01:00.000Z' },
];

/** Terminal → active is illegal under the canonical state machine. */
const ILLEGAL_HISTORY = [
  { from: 'completed', to: 'working', transitioned_at: '2026-01-01T00:00:00.000Z' },
];

/** Gap in the chain: previous `to` (working) ≠ next `from` (input-required),
 *  while each hop alone is a legal transition. */
const DISCONTINUOUS_HISTORY = [
  { from: 'submitted', to: 'working', transitioned_at: '2026-01-01T00:00:00.000Z' },
  { from: 'input-required', to: 'working', transitioned_at: '2026-01-01T00:01:00.000Z' },
];

describe('checkPayloadTaskHistory (pure guard)', () => {
  it('accepts payloads with no history projection (vacuously valid)', () => {
    expect(checkPayloadTaskHistory({ text: 'hello' })).toEqual({ ok: true });
    expect(checkPayloadTaskHistory(null)).toEqual({ ok: true });
    expect(checkPayloadTaskHistory('bare')).toEqual({ ok: true });
  });

  it('accepts a well-formed history chain (direct and nested)', () => {
    expect(checkPayloadTaskHistory({ history: VALID_HISTORY })).toEqual({ ok: true });
    expect(checkPayloadTaskHistory({ task: { history: VALID_HISTORY } })).toEqual({ ok: true });
  });

  it('rejects an illegal transition on `payload.history`', () => {
    const result = checkPayloadTaskHistory({ history: ILLEGAL_HISTORY });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('illegal transition');
  });

  it('rejects a discontinuous chain on `payload.task.history` (tasks/get projection)', () => {
    const result = checkPayloadTaskHistory({ task: { history: DISCONTINUOUS_HISTORY } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('discontinuous');
  });

  it('rejects a non-array history (shape violation)', () => {
    const result = checkPayloadTaskHistory({ history: 'forged' });
    expect(result.ok).toBe(false);
  });
});

describe('signed-ingress gate wires the history guard', () => {
  function gate() {
    const envelope = createEnvelopeService({ hmacSecret: SECRET, keyId: 'k', requireSignature: true });
    return { envelope, g: createSignedIngressGate(envelope, { requireSigned: true, hmacSecret: SECRET, allowInsecure: false }) };
  }

  it('DENIES (400 task_history_invalid) a correctly-signed envelope carrying a forged chain', async () => {
    const { envelope, g } = gate();
    const sealed = envelope.sealEnvelope(
      envelope.buildEnvelope({ from: 'peer', kind: 'task.report', payload: { history: ILLEGAL_HISTORY } }),
    );
    const result = await g.admit(sealed);
    expect(result.admitted).toBe(false);
    expect(result.status).toBe(400);
    expect(result.code).toBe(TASK_HISTORY_INVALID_CODE);
  });

  it('still admits a correctly-signed envelope with a well-formed chain', async () => {
    const { envelope, g } = gate();
    const sealed = envelope.sealEnvelope(
      envelope.buildEnvelope({ from: 'peer', kind: 'task.report', payload: { history: VALID_HISTORY } }),
    );
    const result = await g.admit(sealed);
    expect(result.admitted).toBe(true);
    expect(result.status).toBe(200);
  });
});

// --- ed25519 path (RFC 8032 §7.1 test vector 1 key, as the golden gate test) --
const SEED_HEX = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const PUBLIC_HEX = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const PKCS8_PREFIX = '302e020100300506032b657004220420';
const SIGNED_AT = '2026-01-02T03:04:05.000Z';
const NOW = new Date('2026-01-02T03:05:00.000Z');

function privateKey(): KeyObject {
  return createPrivateKey({ key: Buffer.from(PKCS8_PREFIX + SEED_HEX, 'hex'), format: 'der', type: 'pkcs8' });
}

function ed25519Sealed(payload: unknown, id: string): Record<string, unknown> {
  const domain: A2AEnvelope = { id, from: 'peer:hist', kind: 'task.report', payload, createdAt: SIGNED_AT };
  const signature = sign(null, Buffer.from(canonicalJson(domain), 'utf8'), privateKey()).toString('hex');
  return {
    envelope_version: '1.0.0',
    id,
    payload_type: 'recoder.a2a.message',
    payload: domain,
    signature: { algorithm: 'ed25519', key_id: 'peer:hist', signature, signed_at: SIGNED_AT },
  };
}

describe('ed25519 ingress gate wires the history guard', () => {
  function gate(mode: 'enforce' | 'permissive') {
    const envelope = createEnvelopeService({ hmacSecret: SECRET, keyId: 'k', requireSignature: true });
    const inner = createSignedIngressGate(envelope, { requireSigned: true, hmacSecret: SECRET, allowInsecure: false });
    return createEd25519IngressGate({
      inner,
      envelope,
      resolveKey: async (keyId) => (keyId === 'peer:hist' ? PUBLIC_HEX : null),
      mode,
      refuseExternalHmac: false,
    });
  }

  it('DENIES (400) a VERIFIED ed25519 envelope whose payload carries a forged chain', async () => {
    const g = gate('enforce');
    const result = await g.admit(ed25519Sealed({ task: { history: ILLEGAL_HISTORY } }, 'hist_bad_1'), NOW);
    expect(result.admitted).toBe(false);
    expect(result.status).toBe(400);
    expect(result.code).toBe(TASK_HISTORY_INVALID_CODE);
  });

  it('admits a VERIFIED ed25519 envelope with a well-formed chain', async () => {
    const g = gate('enforce');
    const result = await g.admit(ed25519Sealed({ task: { history: VALID_HISTORY } }, 'hist_ok_1'), NOW);
    expect(result.admitted).toBe(true);
    expect(result.signer?.keyId).toBe('peer:hist');
  });

  it('DENIES a forged chain even in PERMISSIVE mode (unknown key, allowed sender)', async () => {
    const envelope = createEnvelopeService({ hmacSecret: SECRET, keyId: 'k', requireSignature: true });
    const inner = createSignedIngressGate(envelope, { requireSigned: true, hmacSecret: SECRET, allowInsecure: false });
    const g = createEd25519IngressGate({
      inner,
      envelope,
      resolveKey: async () => null, // key unresolved → permissive allow path
      mode: 'permissive',
      refuseExternalHmac: false,
    });
    const result = await g.admit(ed25519Sealed({ history: ILLEGAL_HISTORY }, 'hist_bad_2'), NOW);
    expect(result.admitted).toBe(false);
    expect(result.status).toBe(400);
    expect(result.code).toBe(TASK_HISTORY_INVALID_CODE);
  });
});
