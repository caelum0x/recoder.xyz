/**
 * `PUT /inference/keys/:provider` — the GOVERNED BYOK key-store route. Proves:
 *
 *   - governance gate `allow` → the key is stored via the resolver and the
 *     response carries metadata ONLY (the submitted key never appears anywhere
 *     in the response envelope — redaction law)
 *   - gate `deny` / `needs_approval` → truthful 403, resolver untouched
 *   - gate unwired → fail-CLOSED 503 (never an ungoverned secret write)
 *   - resolver store failure (vault down) → truthful 503 with the reason
 *   - malformed body/provider → 400 with a FIXED message (no key echo)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import express, { type RequestHandler } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildInferenceRouter, type InferenceRoutesDeps } from './inference.routes.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { ByokKeyResolver, InferenceKeyWriteGate } from '../ports/byok-resolver.port.js';
import type { GateVerdict } from '../../governance/types.js';

const SECRET_KEY = 'sk-live-put-me-in-the-vault-42';

function request(
  base: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; text: string; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const payload = init.body === undefined ? undefined : JSON.stringify(init.body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: init.method ?? 'GET',
        headers: payload === undefined ? {} : { 'content-type': 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, text, json: () => (text ? JSON.parse(text) : null) });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

const testPrincipal = { userId: 'tester', isAnonymous: false, scopes: [], kind: 'session' } as unknown as Principal;
const passAuth: RequestHandler = (req, _res, next) => {
  req.principal = testPrincipal;
  next();
};
const fakeMiddleware = { authenticate: passAuth, authenticateMutating: passAuth } as unknown as AuthMiddleware;

function verdict(effect: GateVerdict['effect']): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect,
    tier: 'high',
    reason: effect === 'allow' ? 'ok' : 'secret writes are restricted',
    degraded: false,
    engine: 'ts',
    createdAt: new Date().toISOString(),
  };
}

function fakeResolver(): ByokKeyResolver {
  return {
    enabled: () => true,
    resolve: vi.fn(async () => null),
    store: vi.fn(async () => ({
      stored: true as const,
      ref: 'inference/byok/openai',
      record: {
        userId: 'tester',
        provider: 'openai',
        keyVersion: 1,
        vaultRef: 'inference/byok/openai',
        lastUsedAt: null,
        createdAt: '2026-07-17T00:00:00.000Z',
        rotatedAt: null,
      },
    })),
    remove: vi.fn(async () => true),
    markUsed: vi.fn(),
  };
}

let openServer: http.Server | null = null;
afterEach(() => new Promise<void>((r) => (openServer ? openServer.close(() => r()) : r())));

async function serve(
  resolver: ByokKeyResolver,
  gate: InferenceKeyWriteGate | undefined,
): Promise<string> {
  const deps = {
    gateway: {},
    routing: {},
    catalog: {},
    ledger: {},
    providerKeys: {},
    keyCache: { invalidate: vi.fn() },
    resolver,
    getGate: () => gate,
    mw: fakeMiddleware,
  } as unknown as InferenceRoutesDeps;
  const app = express();
  app.use(express.json());
  app.use(buildInferenceRouter(deps));
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      openServer = server;
      resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    });
  });
}

describe('PUT /inference/keys/:provider', () => {
  it('stores the key when the gate allows and returns metadata only (no key echo)', async () => {
    const resolver = fakeResolver();
    const gate: InferenceKeyWriteGate = { decide: vi.fn(async () => verdict('allow')) };
    const base = await serve(resolver, gate);

    const res = await request(base, '/inference/keys/openai', { method: 'PUT', body: { key: SECRET_KEY } });

    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { provider: 'openai', stored: true, key: { provider: 'openai', vaultRef: 'inference/byok/openai' } },
    });
    expect(res.text).not.toContain(SECRET_KEY); // redaction law: never echoed
    expect(resolver.store).toHaveBeenCalledWith('tester', 'openai', SECRET_KEY);
    expect(gate.decide).toHaveBeenCalledWith(
      'inference.key.write',
      testPrincipal,
      expect.objectContaining({ metadata: { provider: 'openai' } }),
    );
  });

  it('returns a truthful 403 on deny and needs_approval without touching the resolver', async () => {
    for (const effect of ['deny', 'needs_approval'] as const) {
      const resolver = fakeResolver();
      const base = await serve(resolver, { decide: async () => verdict(effect) });
      const res = await request(base, '/inference/keys/openai', { method: 'PUT', body: { key: SECRET_KEY } });
      expect(res.status).toBe(403);
      expect(res.json()).toMatchObject({ success: false, error: { code: 'AUTHZ_PROJECT_ACCESS_DENIED' } });
      expect(res.text).not.toContain(SECRET_KEY);
      expect(resolver.store).not.toHaveBeenCalled();
      await new Promise<void>((r) => (openServer ? openServer.close(() => r()) : r()));
      openServer = null;
    }
  });

  it('fails CLOSED with a 503 when the governance gate is not wired', async () => {
    const resolver = fakeResolver();
    const base = await serve(resolver, undefined);
    const res = await request(base, '/inference/keys/openai', { method: 'PUT', body: { key: SECRET_KEY } });
    expect(res.status).toBe(503);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(resolver.store).not.toHaveBeenCalled();
  });

  it('surfaces a truthful 503 when the resolver store fails (vault down)', async () => {
    const resolver = fakeResolver();
    (resolver.store as ReturnType<typeof vi.fn>).mockResolvedValue({
      stored: false,
      reason: 'BYOK key store failed: vault master key absent',
    });
    const base = await serve(resolver, { decide: async () => verdict('allow') });
    const res = await request(base, '/inference/keys/openai', { method: 'PUT', body: { key: SECRET_KEY } });
    expect(res.status).toBe(503);
    const body = res.json() as { error: { message: string } };
    expect(body.error.message).toContain('vault master key absent');
    expect(res.text).not.toContain(SECRET_KEY);
  });

  it('rejects a too-short key with a FIXED 400 message that never echoes the value', async () => {
    const resolver = fakeResolver();
    const base = await serve(resolver, { decide: async () => verdict('allow') });
    const res = await request(base, '/inference/keys/openai', { method: 'PUT', body: { key: 'shorty' } });
    expect(res.status).toBe(400);
    expect(res.text).not.toContain('shorty');
    expect((res.json() as { error: { message: string } }).error.message).toBe('key must be at least 8 characters');
    expect(resolver.store).not.toHaveBeenCalled();
  });

  it('rejects an invalid provider segment with a 400', async () => {
    const base = await serve(fakeResolver(), { decide: async () => verdict('allow') });
    const res = await request(base, `/inference/keys/${encodeURIComponent('bad provider!')}`, {
      method: 'PUT',
      body: { key: SECRET_KEY },
    });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /inference/keys/:provider (resolver-backed)', () => {
  it('removes via the resolver (secret + metadata + cache) and reports truthfully', async () => {
    const resolver = fakeResolver();
    const base = await serve(resolver, undefined);
    const res = await request(base, '/inference/keys/openai', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { provider: 'openai', deleted: true } });
    expect(resolver.remove).toHaveBeenCalledWith('tester', 'openai');
  });

  it('returns 404 when nothing was removed', async () => {
    const resolver = fakeResolver();
    (resolver.remove as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const base = await serve(resolver, undefined);
    const res = await request(base, '/inference/keys/openai', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});
