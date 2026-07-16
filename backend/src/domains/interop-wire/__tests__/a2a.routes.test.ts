/**
 * A2A wire edges — route-level tests over the composed `/api/a2a` router
 * (`buildA2ARoutes`). Proves the interop surface bootstrap mounts:
 *
 *   - GET  /health     → 200 truthful wire status when signing is configured;
 *                        503 in the fail-closed posture (signing required, no
 *                        secret ⇒ ALL ingress rejected ⇒ `down`, never faked up)
 *   - GET  /agent-card → 200 success envelope carrying the local card + methods
 *   - POST /ingress    → an UNSIGNED envelope is rejected in production posture
 *                        (requireSigned) — HTTP non-200, `data.admitted === false`
 *   - POST /ingress    → a correctly-signed envelope is admitted (200)
 *   - POST /rpc        → an unknown method returns a spec JSON-RPC error (HTTP 200)
 *
 * The `/ingress` edge runs the frozen signed-ingress transport: a forged/unsigned
 * envelope is a truthful non-200, never admitted (fail-closed).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildA2ARoutes } from '../routes/a2a.routes.js';
import { createEnvelopeService } from '../wire/a2a-envelope.service.js';
import { createAgentCardService } from '../wire/agent-card.service.js';
import { createSignedIngressGate } from '../wire/signed-ingress.gate.js';
import { createA2AJsonRpcServer } from '../wire/a2a-jsonrpc-server.js';
import { interopWireHealth } from '../health.js';
import type { InteropWireConfig } from '../config.js';
import type { A2ATransport } from '../ports/a2a-transport.port.js';
import type { A2AEnvelope, AgentCard, EgressEnvelope, IngressResult } from '../types.js';

const SECRET = 'wire-route-secret-xyz';

/** Dependency-free HTTP client (the vitest setup mocks `global.fetch`). */
function request(
  base: string,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: init.method ?? 'GET', headers: init.headers ?? {} },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, json: () => (text ? JSON.parse(text) : null) });
        });
      },
    );
    req.on('error', reject);
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

// --- Compose the real wire services (mirrors createInteropWireModule). -----------

const envelope = createEnvelopeService({ hmacSecret: SECRET, keyId: 'k1', requireSignature: true });
const agentCard = createAgentCardService(
  { id: 'test-instance', name: 'recoder-test', capabilities: ['a2a'], version: '1' },
  { fetcher: null },
);
const signedIngress = createSignedIngressGate(envelope, {
  requireSigned: true,
  hmacSecret: SECRET,
  allowInsecure: false,
});
const jsonRpc = createA2AJsonRpcServer(); // no methods registered ⇒ every call is method-not-found

const transport: A2ATransport = {
  async ingressEnvelope<TPayload = unknown>(value: unknown): Promise<IngressResult<TPayload>> {
    return signedIngress.admit<TPayload>(value);
  },
  async egressEnvelope<TPayload = unknown>(env: A2AEnvelope<TPayload>): Promise<EgressEnvelope<TPayload>> {
    const sealed = envelope.sealEnvelope(env);
    return { envelope: env, signature: sealed.signature.signature || undefined, keyId: sealed.signature.key_id };
  },
  async agentCard(): Promise<AgentCard> {
    return agentCard.getLocalAgentCard();
  },
  async resolveRemoteCard(ref: string): Promise<AgentCard | null> {
    return agentCard.resolveRemoteCard(ref);
  },
};

/** The real config-driven truthful health, as `createInteropWireModule` wires it. */
function wireConfig(hmacSecret: string | null): InteropWireConfig {
  return {
    isProduction: true,
    requireSignedIngress: true,
    hmacSecret,
    signingKeyId: 'k1',
    allowInsecureIngress: false,
    signingMode: 'required',
    maxFutureSkewMs: 300_000,
    heartbeatStaleMs: 90_000,
    localCard: { id: 'test-instance', name: 'recoder-test', capabilities: ['a2a'] },
  };
}

function startServer(
  health: () => ReturnType<typeof interopWireHealth> = () =>
    interopWireHealth({ config: wireConfig(SECRET), persistenceAvailable: true }),
): Promise<{ base: string; close: () => Promise<void> }> {
  const router = buildA2ARoutes({ transport, agentCard, jsonRpc, health });
  const app = express();
  app.use('/api/a2a', express.json());
  app.use('/api/a2a', router);
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

describe('a2a wire routes — /api/a2a edge', () => {
  let srv: { base: string; close: () => Promise<void> };
  beforeAll(async () => {
    srv = await startServer();
  });
  afterAll(async () => {
    await srv.close();
  });

  const postJson = (path: string, body: unknown) =>
    request(srv.base, path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('GET /health → 200 truthful wire status (up) + advertised methods', async () => {
    const res = await request(srv.base, '/api/a2a/health');
    expect(res.status).toBe(200);
    const json = res.json() as {
      success: boolean;
      data: { health: { name: string; status: string; degraded: boolean }; methods: unknown[] };
    };
    expect(json.success).toBe(true);
    expect(json.data.health.name).toBe('interop-wire');
    expect(json.data.health.status).toBe('up');
    expect(json.data.health.degraded).toBe(false);
    expect(Array.isArray(json.data.methods)).toBe(true);
  });

  it('GET /agent-card → 200 with the local capability card + advertised methods', async () => {
    const res = await request(srv.base, '/api/a2a/agent-card');
    expect(res.status).toBe(200);
    const json = res.json() as { success: boolean; data: { card: { id: string }; methods: unknown[] } };
    expect(json.success).toBe(true);
    expect(json.data.card.id).toBe('test-instance');
    expect(Array.isArray(json.data.methods)).toBe(true);
  });

  it('POST /ingress with an UNSIGNED envelope → rejected (non-200, not admitted)', async () => {
    const res = await postJson('/api/a2a/ingress', {
      id: 'x',
      from: 'peer',
      kind: 'k',
      payload: {},
      createdAt: new Date().toISOString(),
    });
    expect(res.status).not.toBe(200);
    const json = res.json() as { data: { admitted: boolean } };
    expect(json.data.admitted).toBe(false);
  });

  it('POST /rpc with an unknown method → JSON-RPC error object at HTTP 200', async () => {
    const res = await postJson('/api/a2a/rpc', { jsonrpc: '2.0', id: 1, method: 'does/not/exist', params: {} });
    expect(res.status).toBe(200);
    const json = res.json() as { data: { error?: { code: number } } };
    expect(json.data.error).toBeDefined();
  });
});

describe('a2a wire routes — fail-closed posture (signing required, no secret)', () => {
  let srv: { base: string; close: () => Promise<void> };
  beforeAll(async () => {
    srv = await startServer(() =>
      interopWireHealth({ config: wireConfig(null), persistenceAvailable: true }),
    );
  });
  afterAll(async () => {
    await srv.close();
  });

  it('GET /health → 503 with truthful `down` (never a faked up)', async () => {
    const res = await request(srv.base, '/api/a2a/health');
    expect(res.status).toBe(503);
    const json = res.json() as {
      success: boolean;
      data: { health: { status: string; reason?: string } };
    };
    expect(json.data.health.status).toBe('down');
    expect(json.data.health.reason).toContain('fail-closed');
  });
});
