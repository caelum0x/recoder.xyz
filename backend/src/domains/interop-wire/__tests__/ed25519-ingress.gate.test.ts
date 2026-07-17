/**
 * ed25519 ingress gate: asymmetric envelope verification layered over the
 * frozen HMAC signed-ingress gate. Proves:
 *   - a valid ed25519 signature is admitted (enforce),
 *   - tamper / unknown-key / expired are truthful denies in enforce,
 *   - permissive mode logs-and-allows (marked `unverified`, never "verified"),
 *   - non-ed25519 traffic falls through to the HMAC gate unchanged,
 *   - the rpc-admission middleware chain admits/denies through this gate,
 *   - a GOLDEN VECTOR (RFC 8032 test key 1) stays byte-stable, and
 *   - the config defaults are permissive in solo/dev and enforce in production.
 */
import { describe, it, expect, vi } from 'vitest';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { canonicalJson } from '@recoder/a2a-sdk';
import type { Logger } from '../../../shared/logger.js';
import type { AppConfig } from '../../../shared/app-config.js';
import { sliceInteropWireConfig } from '../config.js';
import type { A2AEnvelope } from '../types.js';
import type { AgentRegistryRepo } from '../ports/agent-registry.repo.js';
import { createEnvelopeService } from '../wire/a2a-envelope.service.js';
import { createSignedIngressGate, type SignedIngressGate } from '../wire/signed-ingress.gate.js';
import { createEd25519IngressGate, createPeerKeyResolver } from '../wire/ed25519-ingress.gate.js';
import { createRpcAdmissionGuard } from '../routes/rpc-admission.middleware.js';

const HMAC_SECRET = 'ed25519-gate-hmac-secret';

// --- Deterministic ed25519 key (RFC 8032 §7.1 test vector 1) ------------------
const SEED_HEX = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const PUBLIC_HEX = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const PKCS8_PREFIX = '302e020100300506032b657004220420';

function privateKey(): KeyObject {
  return createPrivateKey({
    key: Buffer.from(PKCS8_PREFIX + SEED_HEX, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
}

function signDomain(domain: A2AEnvelope): string {
  return sign(null, Buffer.from(canonicalJson(domain), 'utf8'), privateKey()).toString('hex');
}

const SIGNED_AT = '2026-01-02T03:04:05.000Z';
const NOW = new Date('2026-01-02T03:05:00.000Z');

function domainEnvelope(payload: unknown = { n: 1, s: 'golden' }): A2AEnvelope {
  return { id: 'a2a_golden_0001', from: 'peer:golden', kind: 'golden.vector', payload, createdAt: SIGNED_AT };
}

function ed25519Envelope(
  domain: unknown,
  signature: string,
  overrides: { keyId?: string; signedAt?: string; expiresAt?: string } = {},
): Record<string, unknown> {
  return {
    envelope_version: '1.0.0',
    id: 'a2a_golden_0001',
    payload_type: 'recoder.a2a.message',
    payload: domain,
    signature: {
      algorithm: 'ed25519',
      key_id: overrides.keyId ?? 'peer:golden',
      signature,
      signed_at: overrides.signedAt ?? SIGNED_AT,
      ...(overrides.expiresAt !== undefined ? { expires_at: overrides.expiresAt } : {}),
    },
  };
}

function fakeLogger(): { logger: Logger; warn: ReturnType<typeof vi.fn> } {
  const warn = vi.fn();
  const logger = { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as Logger;
  return { logger, warn };
}

function buildGate(opts: { mode: 'permissive' | 'enforce'; keys?: Record<string, string>; resolveKey?: (keyId: string) => Promise<string | null> }) {
  const envelope = createEnvelopeService({ hmacSecret: HMAC_SECRET, keyId: 'k', requireSignature: true });
  const inner = createSignedIngressGate(envelope, { requireSigned: true, hmacSecret: HMAC_SECRET, allowInsecure: false });
  const { logger, warn } = fakeLogger();
  const gate = createEd25519IngressGate({
    inner,
    envelope,
    mode: opts.mode,
    resolveKey: opts.resolveKey ?? createPeerKeyResolver({ staticKeys: opts.keys ?? { 'peer:golden': PUBLIC_HEX } }),
    logger,
  });
  return { gate, envelope, warn };
}

describe('ed25519 ingress gate', () => {
  it('GOLDEN VECTOR: the frozen signature + RFC 8032 key admits and stays byte-stable', async () => {
    // Precomputed once over canonicalJson(domainEnvelope()) with the RFC seed.
    const GOLDEN_SIG =
      '3ba07ec08a474c7f1af63452d26819592a0d14b62efd0915dd4d962cf55c0160' +
      '5e4eb7ffc71376bf24fba2c952c3db0839a8c2ecd132f7fdd5fd05d62703f205';
    const GOLDEN_CANON =
      '{"createdAt":"2026-01-02T03:04:05.000Z","from":"peer:golden","id":"a2a_golden_0001",' +
      '"kind":"golden.vector","payload":{"n":1,"s":"golden"}}';
    const domain = domainEnvelope();
    expect(canonicalJson(domain)).toBe(GOLDEN_CANON); // canonicalization is frozen
    expect(signDomain(domain)).toBe(GOLDEN_SIG); // ed25519 is deterministic

    const { gate } = buildGate({ mode: 'enforce' });
    const result = await gate.admit(ed25519Envelope(domain, GOLDEN_SIG), NOW);
    expect(result).toMatchObject({ admitted: true, status: 200, code: 'ingress_admitted' });
    expect(result.payload).toEqual({ n: 1, s: 'golden' });
  });

  it('enforce: admits a freshly-signed envelope and returns the inner domain payload', async () => {
    const domain = domainEnvelope({ hello: 'world' });
    const { gate } = buildGate({ mode: 'enforce' });
    const result = await gate.admit(ed25519Envelope(domain, signDomain(domain)), NOW);
    expect(result.admitted).toBe(true);
    expect(result.payload).toEqual({ hello: 'world' });
  });

  it('enforce: rejects a tampered payload (401 bad signature) — never admits forged input', async () => {
    const domain = domainEnvelope({ v: 1 });
    const signature = signDomain(domain);
    const forged = { ...domain, payload: { v: 2 } };
    const { gate } = buildGate({ mode: 'enforce' });
    const result = await gate.admit(ed25519Envelope(forged, signature), NOW);
    expect(result).toMatchObject({ admitted: false, status: 401, code: 'signed_envelope_bad_signature' });
  });

  it('enforce: rejects an unknown key_id (401) — no trusted key, no admission', async () => {
    const domain = domainEnvelope();
    const { gate } = buildGate({ mode: 'enforce', keys: {} });
    const result = await gate.admit(ed25519Envelope(domain, signDomain(domain)), NOW);
    expect(result).toMatchObject({ admitted: false, status: 401, code: 'signed_envelope_key_unknown' });
  });

  it('enforce: rejects an expired envelope (timing parity with the HMAC path)', async () => {
    const domain = domainEnvelope();
    const { gate } = buildGate({ mode: 'enforce' });
    const result = await gate.admit(
      ed25519Envelope(domain, signDomain(domain), { expiresAt: '2026-01-02T03:04:30.000Z' }),
      NOW,
    );
    expect(result).toMatchObject({ admitted: false, status: 401, code: 'signed_envelope_expired' });
  });

  it('permissive: logs-and-allows a bad signature, truthfully marked unverified', async () => {
    const domain = domainEnvelope({ v: 1 });
    const forged = { ...domain, payload: { v: 2 } };
    const { gate, warn } = buildGate({ mode: 'permissive' });
    const result = await gate.admit(ed25519Envelope(forged, signDomain(domain)), NOW);
    expect(result).toMatchObject({ admitted: true, status: 200, code: 'ingress_admitted_unverified' });
    expect(result.payload).toEqual({ v: 2 });
    expect(result.reason).toContain('unverified');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('permissive: a VALID signature is admitted as verified (no warning)', async () => {
    const domain = domainEnvelope();
    const { gate, warn } = buildGate({ mode: 'permissive' });
    const result = await gate.admit(ed25519Envelope(domain, signDomain(domain)), NOW);
    expect(result).toMatchObject({ admitted: true, code: 'ingress_admitted' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('permissive: a malformed domain payload is still 400 — allow never fabricates shape', async () => {
    const { gate } = buildGate({ mode: 'permissive' });
    const result = await gate.admit(ed25519Envelope({ not: 'a domain envelope' }, 'zz'), NOW);
    expect(result).toMatchObject({ admitted: false, status: 400, code: 'envelope_payload_malformed' });
  });

  it('falls through to the frozen HMAC gate for non-ed25519 traffic (both directions)', async () => {
    const { gate, envelope } = buildGate({ mode: 'enforce' });
    const sealed = envelope.sealEnvelope(envelope.buildEnvelope({ from: 'a', kind: 'k', payload: { ok: true } }));
    await expect(gate.admit(sealed)).resolves.toMatchObject({ admitted: true, payload: { ok: true } });
    await expect(gate.admit({ garbage: true })).resolves.toMatchObject({ admitted: false });
    await expect(gate.admit(null)).resolves.toMatchObject({ admitted: false });
  });
});

describe('peer key resolver', () => {
  function registryWith(publicKey?: string, fail = false): AgentRegistryRepo {
    return {
      get: async (id: string, userId: string) => {
        if (fail) throw new Error('db down');
        if (id !== 'peer:reg' || userId !== 'owner-1') return null;
        return { id, userId, kind: 'remote_a2a', card: { id, name: id, capabilities: [] }, publicKey, status: 'up' };
      },
      upsert: vi.fn(), list: vi.fn(), setStatus: vi.fn(), remove: vi.fn(),
      recordHeartbeat: vi.fn(), lastHeartbeat: vi.fn(),
    } as unknown as AgentRegistryRepo;
  }

  it('static config keys win over the registry', async () => {
    const resolve = createPeerKeyResolver({ staticKeys: { 'peer:reg': 'static-key' }, registry: registryWith('registry-key'), registryOwnerId: 'owner-1' });
    await expect(resolve('peer:reg')).resolves.toBe('static-key');
  });

  it('resolves the registry public_key when no static key matches', async () => {
    const resolve = createPeerKeyResolver({ staticKeys: {}, registry: registryWith(PUBLIC_HEX), registryOwnerId: 'owner-1' });
    await expect(resolve('peer:reg')).resolves.toBe(PUBLIC_HEX);
    await expect(resolve('peer:unknown')).resolves.toBeNull();
  });

  it('a registry fault resolves null (truthful unresolved) → enforce denies key_unknown', async () => {
    const { logger } = fakeLogger();
    const resolve = createPeerKeyResolver({ staticKeys: {}, registry: registryWith(PUBLIC_HEX, true), registryOwnerId: 'owner-1', logger });
    await expect(resolve('peer:reg')).resolves.toBeNull();

    const domain = domainEnvelope();
    const { gate } = buildGate({ mode: 'enforce', resolveKey: resolve });
    const result = await gate.admit(ed25519Envelope(domain, signDomain(domain), { keyId: 'peer:reg' }), NOW);
    expect(result).toMatchObject({ admitted: false, status: 401, code: 'signed_envelope_key_unknown' });
  });

  it('registry resolution is OFF without an owner scope (null ⇒ unresolved)', async () => {
    const resolve = createPeerKeyResolver({ staticKeys: {}, registry: registryWith(PUBLIC_HEX), registryOwnerId: null });
    await expect(resolve('peer:reg')).resolves.toBeNull();
  });
});

describe('rpc-admission chain through the ed25519 gate', () => {
  function invokeGuard(gate: SignedIngressGate, body: unknown): Promise<{ status: number | null; nextBody: unknown | null }> {
    const guard = createRpcAdmissionGuard({ ingress: gate, posture: { requireSigned: true, allowInsecure: false } });
    return new Promise((resolve) => {
      let status: number | null = null;
      const req = { body, path: '/rpc' } as unknown as Parameters<typeof guard>[0];
      const res = {
        status(code: number) { status = code; return this; },
        json() { resolve({ status, nextBody: null }); return this; },
      } as unknown as Parameters<typeof guard>[1];
      guard(req, res, () => resolve({ status: 200, nextBody: (req as { body: unknown }).body }));
    });
  }

  const rpc = { jsonrpc: '2.0', method: 'message/send', id: 1, params: {} };

  it('admits an ed25519-signed envelope wrapping a JSON-RPC call and dispatches ONLY the verified payload', async () => {
    const domain = domainEnvelope(rpc);
    const { gate } = buildGate({ mode: 'enforce' });
    const outcome = await invokeGuard(gate, ed25519Envelope(domain, signDomain(domain)));
    expect(outcome.status).toBe(200);
    expect(outcome.nextBody).toEqual(rpc);
  });

  it('denies a bad ed25519 signature at the rpc edge in enforce mode', async () => {
    const domain = domainEnvelope(rpc);
    const forged = { ...domain, payload: { ...rpc, method: 'message/steal' } };
    const { gate } = buildGate({ mode: 'enforce' });
    const outcome = await invokeGuard(gate, ed25519Envelope(forged, signDomain(domain)));
    expect(outcome.status).not.toBe(200);
    expect(outcome.nextBody).toBeNull();
  });
});

describe('config defaults', () => {
  function appConfig(isProduction: boolean): AppConfig {
    return {
      runtime: { env: isProduction ? 'production' : 'test', isProduction, serviceName: 'recoder-backend', instanceId: 'i1' },
      server: { port: 3001, host: '127.0.0.1', trustProxy: false, shutdownDrainMs: 8_000, bodyLimit: '2mb' },
      database: { url: null, ssl: false, maxPoolSize: 10, minPoolSize: 1, statementTimeoutMs: 0, allowSeed: false, migrationsDir: null },
      auth: { betterAuthSecretPresent: false, authDatabaseUrl: null, cookieDomain: null, strict: false },
      internal: { serviceKeyPresent: true, serviceKey: 'k'.repeat(40) },
      cors: { origins: ['.recoder.xyz'], allowCredentials: true },
      logging: { level: 'info', pretty: false },
      conductor: {
        tmuxBin: null, worktreeRoot: '/tmp/recoder-worktrees', tmuxControlMode: false,
        caps: { maxConcurrentWorkspaces: 10, maxConcurrentPerUser: 5, maxTmuxSessions: 50, minFreeDiskGb: 5, maxWorktreeDiskGb: 50 },
      },
      agentOs: { natsUrl: null, brainEnabled: false, codeGraphEnabled: false, squadsEnabled: true },
      engines: {}, inference: {}, billing: {}, cloud: {}, memory: {}, social: {}, interopWire: {},
    } as AppConfig;
  }

  it('defaults to permissive in solo/dev and enforce in production', () => {
    expect(sliceInteropWireConfig(appConfig(false)).ed25519Mode).toBe('permissive');
    expect(sliceInteropWireConfig(appConfig(true)).ed25519Mode).toBe('enforce');
    expect(sliceInteropWireConfig(appConfig(false)).ed25519PeerKeys).toEqual({});
    expect(sliceInteropWireConfig(appConfig(false)).ed25519RegistryOwnerId).toBeNull();
  });

  it('honors explicit overrides (mode, static keys, registry owner)', () => {
    const cfg = sliceInteropWireConfig(appConfig(false), {
      ed25519Mode: 'enforce',
      ed25519PeerKeys: { 'peer:golden': PUBLIC_HEX },
      ed25519RegistryOwnerId: 'owner-1',
    });
    expect(cfg.ed25519Mode).toBe('enforce');
    expect(cfg.ed25519PeerKeys).toEqual({ 'peer:golden': PUBLIC_HEX });
    expect(cfg.ed25519RegistryOwnerId).toBe('owner-1');
  });
});
