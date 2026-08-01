/**
 * A2A signed-envelope REPLAY protection (BE-9.2). Two layers:
 *
 *  1. `createReplayGuard` — the TTL-bounded, in-process seen-cache in isolation:
 *     first sight is remembered, a second sight within the window is a replay,
 *     a distinct jti is fresh, entries expire (by `expires_at` or `maxTtlMs`),
 *     the cache is `clear()`-able, and it is size-capped (never grows unbounded).
 *
 *  2. The ed25519 ingress gate wired to a guard — a cryptographically VERIFIED
 *     envelope is admitted once and its REPLAY is rejected fail-closed (401),
 *     a distinct jti is still admitted, a missing jti is refused (400), and the
 *     trusted shared-HMAC fallthrough is guarded too. The guard is injectable
 *     and clearable so nothing leaks between checks.
 */
import { describe, it, expect } from 'vitest';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { canonicalJson } from '@recoder/a2a-sdk';
import type { A2AEnvelope } from '../types.js';
import { createEnvelopeService } from '../wire/a2a-envelope.service.js';
import { createSignedIngressGate } from '../wire/signed-ingress.gate.js';
import { createEd25519IngressGate, createPeerKeyResolver } from '../wire/ed25519-ingress.gate.js';
import { createReplayGuard, type ReplayGuard } from '../wire/replay-guard.js';

// --- RFC 8032 §7.1 test vector 1 (deterministic ed25519 key) ------------------
const SEED_HEX = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const PUBLIC_HEX = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const PKCS8_PREFIX = '302e020100300506032b657004220420';
const HMAC_SECRET = 'replay-guard-hmac-secret';
const SIGNED_AT = '2026-01-02T03:04:05.000Z';
const NOW = new Date('2026-01-02T03:05:00.000Z');

function privateKey(): KeyObject {
  return createPrivateKey({ key: Buffer.from(PKCS8_PREFIX + SEED_HEX, 'hex'), format: 'der', type: 'pkcs8' });
}

function domainEnvelope(payload: unknown = { n: 1 }): A2AEnvelope {
  return { id: 'a2a_domain_0001', from: 'peer:golden', kind: 'k', payload, createdAt: SIGNED_AT };
}

function signDomain(domain: A2AEnvelope): string {
  return sign(null, Buffer.from(canonicalJson(domain), 'utf8'), privateKey()).toString('hex');
}

function ed25519Envelope(
  domain: A2AEnvelope,
  signature: string,
  overrides: { id?: string; expiresAt?: string } = {},
): Record<string, unknown> {
  return {
    envelope_version: '1.0.0',
    id: overrides.id ?? 'a2a_signed_0001',
    payload_type: 'recoder.a2a.message',
    payload: domain,
    signature: {
      algorithm: 'ed25519',
      key_id: 'peer:golden',
      signature,
      signed_at: SIGNED_AT,
      ...(overrides.expiresAt !== undefined ? { expires_at: overrides.expiresAt } : {}),
    },
  };
}

function buildGate(replayGuard?: ReplayGuard) {
  const envelope = createEnvelopeService({ hmacSecret: HMAC_SECRET, keyId: 'k', requireSignature: true });
  const inner = createSignedIngressGate(envelope, { requireSigned: true, hmacSecret: HMAC_SECRET, allowInsecure: false });
  const gate = createEd25519IngressGate({
    inner,
    envelope,
    mode: 'enforce',
    refuseExternalHmac: true,
    resolveKey: createPeerKeyResolver({ staticKeys: { 'peer:golden': PUBLIC_HEX } }),
    ...(replayGuard ? { replayGuard } : {}),
  });
  return { gate, envelope };
}

describe('createReplayGuard (TTL-bounded seen-cache)', () => {
  it('remembers first sight and rejects a second presentation of the same jti', () => {
    const guard = createReplayGuard();
    expect(guard.remember('jti-1', { nowMs: 1000 })).toBe(true);
    expect(guard.remember('jti-1', { nowMs: 1000 })).toBe(false); // replay
    expect(guard.size()).toBe(1);
  });

  it('admits a distinct jti', () => {
    const guard = createReplayGuard();
    expect(guard.remember('jti-a', { nowMs: 1000 })).toBe(true);
    expect(guard.remember('jti-b', { nowMs: 1000 })).toBe(true);
    expect(guard.size()).toBe(2);
  });

  it('clear() drops all entries so a jti is fresh again', () => {
    const guard = createReplayGuard();
    expect(guard.remember('jti-1', { nowMs: 1000 })).toBe(true);
    guard.clear();
    expect(guard.size()).toBe(0);
    expect(guard.remember('jti-1', { nowMs: 1000 })).toBe(true);
  });

  it('expires an entry after maxTtlMs when no expires_at is supplied', () => {
    const guard = createReplayGuard({ maxTtlMs: 100 });
    expect(guard.remember('jti-1', { nowMs: 1000 })).toBe(true);
    expect(guard.remember('jti-1', { nowMs: 1050 })).toBe(false); // still live (< 1100)
    expect(guard.remember('jti-1', { nowMs: 1200 })).toBe(true); // expired (> 1100), re-admitted
  });

  it('rejects a replay for the full validity window when expires_at is supplied', () => {
    const guard = createReplayGuard({ maxTtlMs: 1 });
    expect(guard.remember('jti-1', { nowMs: 1000, expiresAtMs: 5000 })).toBe(true);
    // Past maxTtlMs but still within expires_at ⇒ still a replay (window honored).
    expect(guard.remember('jti-1', { nowMs: 4000, expiresAtMs: 5000 })).toBe(false);
    // Past expires_at ⇒ entry gone, fresh again.
    expect(guard.remember('jti-1', { nowMs: 6000, expiresAtMs: 5000 })).toBe(true);
  });

  it('is size-capped (oldest-first eviction) — a jti flood never grows it unbounded', () => {
    const guard = createReplayGuard({ maxEntries: 2, maxTtlMs: 1_000_000 });
    guard.remember('a', { nowMs: 1000 });
    guard.remember('b', { nowMs: 1000 });
    guard.remember('c', { nowMs: 1000 });
    expect(guard.size()).toBe(2); // 'a' (oldest) evicted
    expect(guard.remember('a', { nowMs: 1000 })).toBe(true); // evicted ⇒ fresh again
  });
});

describe('ed25519 ingress gate — replay protection', () => {
  it('admits a verified envelope once and REJECTS its replay (401 fail-closed)', async () => {
    const domain = domainEnvelope({ hello: 'world' });
    const value = ed25519Envelope(domain, signDomain(domain));
    const { gate } = buildGate();
    const first = await gate.admit(value, NOW);
    expect(first).toMatchObject({ admitted: true, status: 200, code: 'ingress_admitted' });
    const second = await gate.admit(value, NOW);
    expect(second).toMatchObject({ admitted: false, status: 401, code: 'signed_envelope_replayed' });
  });

  it('still admits a DISTINCT jti carrying the same verified payload', async () => {
    const domain = domainEnvelope({ hello: 'world' });
    const signature = signDomain(domain); // signature is over the domain payload, not the jti
    const { gate } = buildGate();
    const a = await gate.admit(ed25519Envelope(domain, signature, { id: 'jti-A' }), NOW);
    const b = await gate.admit(ed25519Envelope(domain, signature, { id: 'jti-B' }), NOW);
    expect(a.admitted).toBe(true);
    expect(b.admitted).toBe(true);
  });

  it('refuses a verified envelope with a missing jti (400 fail-closed)', async () => {
    const domain = domainEnvelope();
    const value = ed25519Envelope(domain, signDomain(domain), { id: '' });
    const { gate } = buildGate();
    const result = await gate.admit(value, NOW);
    expect(result).toMatchObject({ admitted: false, status: 400, code: 'signed_envelope_missing_jti' });
  });

  it('uses the INJECTED guard and clearing it re-admits the same envelope', async () => {
    const guard = createReplayGuard();
    const domain = domainEnvelope();
    const value = ed25519Envelope(domain, signDomain(domain));
    const { gate } = buildGate(guard);
    expect((await gate.admit(value, NOW)).admitted).toBe(true);
    expect((await gate.admit(value, NOW)).admitted).toBe(false); // replay
    guard.clear();
    expect((await gate.admit(value, NOW)).admitted).toBe(true); // fresh after clear
  });

  it('replay-guards the trusted shared-HMAC fallthrough path too', async () => {
    const { gate, envelope } = buildGate();
    const sealed = envelope.sealEnvelope(envelope.buildEnvelope({ from: 'svc:internal', kind: 'k', payload: { ok: true } }));
    const first = await gate.admit(sealed, undefined, { trusted: true });
    expect(first).toMatchObject({ admitted: true, payload: { ok: true } });
    const second = await gate.admit(sealed, undefined, { trusted: true });
    expect(second).toMatchObject({ admitted: false, status: 401, code: 'signed_envelope_replayed' });
  });
});
