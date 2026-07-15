/**
 * Social HTTP edges — route-level trust-boundary + shape tests over the composed
 * `/api/social` router (`buildSocialRoutes`). Proves the surface bootstrap mounts:
 *
 *   - GET  /connectors           → 200 success envelope (per-connector status read)
 *   - GET  /health               → 200 success envelope (live channel health)
 *   - POST /webhooks/:channel     → 401 on a bad HMAC signature (hostile-by-default)
 *   - POST /webhooks/:channel     → 401 when the signing secret is unconfigured
 *   - POST /webhooks/:unknown     → 404 (channel does not accept webhooks)
 *
 * The webhook edge is UNAUTHENTICATED by session but verifies the channel signature
 * over the RAW body — the app mounts `express.raw()` on the `/webhooks` path exactly
 * as bootstrap must, so `req.body` is the exact bytes the HMAC is computed over.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express, { type RequestHandler } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildSocialRoutes } from '../routes/social.routes.js';
import type { SocialRepository } from '../ports/social-repository.port.js';
import type { ConnectorSecretsPort } from '../ports/connector-secrets.port.js';
import type { ChannelAdapterRegistry } from '../adapters/channel-adapter-registry.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';

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

// --- Fakes: pass-through auth + read-only repository + null-secret resolver. -----

const testPrincipal = { userId: 'tester', isAnonymous: false } as unknown as Principal;

/** A middleware that always attaches a fixed principal (routes only use these two). */
const passAuth: RequestHandler = (req, _res, next) => {
  req.principal = testPrincipal;
  next();
};
const fakeMiddleware = { authenticate: passAuth, authenticateMutating: passAuth } as unknown as AuthMiddleware;

const fakeRepository = {
  listConnectors: vi.fn(async () => [
    { id: 'conn_line', channel: 'line', enabled: true, status: 'down' },
  ]),
  listBindings: vi.fn(async () => []),
} as unknown as SocialRepository;

const fakeChannels = {
  statuses: vi.fn(async () => []),
  get: vi.fn(async () => null),
  send: vi.fn(async () => ({ delivered: false, messageIds: [] })),
} as unknown as ChannelAdapterRegistry;

/** Secret resolver whose behavior is swapped per-test via this holder. */
let secretValue: string | null = 'line-channel-secret';
const fakeSecrets: ConnectorSecretsPort = { resolve: async () => secretValue };

const onVerifiedWebhook = vi.fn(async () => undefined);

function startServer(): Promise<{ base: string; close: () => Promise<void> }> {
  const router = buildSocialRoutes({
    repository: fakeRepository,
    secrets: fakeSecrets,
    channels: fakeChannels,
    middleware: fakeMiddleware,
    health: async () => ({ status: 'degraded', detail: 'no live channels configured' }),
    onVerifiedWebhook,
  });
  const app = express();
  // Bootstrap mounts an all-types raw body parser on the webhook path so the HMAC
  // verifies over the exact received bytes; the JSON parser skips it (req._body set).
  app.use('/api/social/webhooks', express.raw({ type: () => true }));
  app.use('/api/social', express.json());
  app.use('/api/social', router);
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

describe('social routes — /api/social edge', () => {
  let srv: { base: string; close: () => Promise<void> };
  beforeAll(async () => {
    srv = await startServer();
  });
  afterAll(async () => {
    await srv.close();
  });

  it('GET /connectors → 200 success envelope with the connector read model', async () => {
    const res = await request(srv.base, '/api/social/connectors');
    expect(res.status).toBe(200);
    const json = res.json() as { success: boolean; data: { connectors: unknown[] } };
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data.connectors)).toBe(true);
    expect(json.data.connectors).toHaveLength(1);
  });

  it('GET /health → 200 success envelope carrying live channel health', async () => {
    const res = await request(srv.base, '/api/social/health');
    expect(res.status).toBe(200);
    const json = res.json() as { success: boolean; data: { health: { status: string } } };
    expect(json.success).toBe(true);
    expect(json.data.health.status).toBe('degraded');
  });

  it('POST /webhooks/line with a bad signature → 401 (never trusts a byte)', async () => {
    secretValue = 'line-channel-secret';
    const res = await request(srv.base, '/api/social/webhooks/line', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-line-signature': 'not-a-valid-signature' },
      body: JSON.stringify({ events: [{ type: 'message' }] }),
    });
    expect(res.status).toBe(401);
    expect(onVerifiedWebhook).not.toHaveBeenCalled();
  });

  it('POST /webhooks/slack with no configured secret → 401 (cannot verify)', async () => {
    secretValue = null;
    const res = await request(srv.base, '/api/social/webhooks/slack', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-slack-signature': 'v0=abc', 'x-slack-request-timestamp': '123' },
      body: '{}',
    });
    expect(res.status).toBe(401);
    secretValue = 'line-channel-secret';
  });

  it('POST /webhooks/telegram → 404 (channel does not accept webhooks)', async () => {
    const res = await request(srv.base, '/api/social/webhooks/telegram', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });
});
