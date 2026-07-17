/**
 * `/internal/agent-os/memory` edge tests — the worker-to-backend harvest ingest.
 * Uses the REAL identity auth middleware over a stub verifier so the
 * `requireInternal` gate is exercised end-to-end:
 *  - no/invalid `x-internal-service-key` → 401 (fail-closed), harvest never runs;
 *  - a valid key + evidenced body → the harvest lands a candidate wisp;
 *  - a valid key + MISSING evidence → a truthful `{ harvested:false }` (skipped,
 *    never stored) with a 200.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildInternalMemoryRouter } from './internal-memory.routes.js';
import type { HarvestService, HarvestInput, HarvestResult } from '../lifecycle/harvest.js';
import { PrincipalService } from '../../identity/principal.service.js';
import { createAuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AuthSessionVerifier } from '../../identity/adapters/better-auth.adapter.js';
import type { ApiKeyValidator } from '../../identity/ports/api-key.port.js';
import type { IdentityConfig } from '../../identity/config.js';

const INTERNAL_KEY = 'internal-service-key-abcdefghijklmnop';

const identityConfig: IdentityConfig = {
  betterAuthSecretPresent: true,
  authDatabaseUrl: 'postgres://x',
  cookieDomain: '.recoder.xyz',
  strictAuth: false,
  internalServiceKey: INTERNAL_KEY,
  internalServiceKeyPresent: true,
  isProduction: false,
  deviceCodeTtlSeconds: 900,
  devicePollIntervalSeconds: 5,
  apiKeyDefaultTtlDays: null,
  apiKeyPrefixLength: 12,
};

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

const stubAdapter: AuthSessionVerifier = {
  extractToken: ({ bearerToken }) => bearerToken ?? null,
  verifyToken: vi.fn(async () => null),
};
const apiKeyValidator: ApiKeyValidator = { validate: vi.fn(async () => null) };

interface Harness {
  base: string;
  close: () => Promise<void>;
  harvestCalls: HarvestInput[];
}

function buildHarness(): Promise<Harness> {
  const harvestCalls: HarvestInput[] = [];
  const harvest: HarvestService = {
    harvest: async (input: HarvestInput): Promise<HarvestResult> => {
      harvestCalls.push(input);
      if (!input.taskId?.trim() || !input.artifactId?.trim()) {
        return { harvested: false, reason: 'harvest skipped: missing task/artifact evidence' };
      }
      return {
        harvested: true,
        candidate: {
          candidateId: 'mc_1',
          scope: input.scope,
          title: input.title,
          body: input.body,
          status: 'candidate_created',
          evidence: { taskId: input.taskId, artifactId: input.artifactId },
          proposedBy: input.proposedBy,
          proposedAt: '2026-07-15T00:00:00Z',
        },
      };
    },
  };

  const principal = new PrincipalService({
    config: identityConfig,
    logger: silentLogger,
    authSession: stubAdapter,
    apiKeyValidator,
  });
  const middleware = createAuthMiddleware({ verifier: principal, principal, config: identityConfig, logger: silentLogger });

  const app = express();
  app.use(express.json());
  app.use('/internal/agent-os/memory', buildInternalMemoryRouter({ harvest, middleware }));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        harvestCalls,
      });
    });
  });
}

function request(
  base: string,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}/internal/agent-os/memory${path}`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: init.method ?? 'GET',
        headers: init.headers ?? {},
      },
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

const evidencedBody = {
  userId: 'user-1',
  scope: 'repo',
  title: 'a learned gotcha',
  body: 'the box is 16GB, no GPU',
  proposedBy: 'agent:conductor',
  taskId: 'task-1',
  artifactId: 'artifact-1',
};

describe('POST /internal/agent-os/memory/harvest', () => {
  it('rejects a request without the internal service key (fail-closed 401), harvest never runs', async () => {
    const h = await buildHarness();
    try {
      const res = await request(h.base, '/harvest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(evidencedBody),
      });
      expect(res.status).toBe(401);
      expect(h.harvestCalls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('rejects a wrong internal service key (401)', async () => {
    const h = await buildHarness();
    try {
      const res = await request(h.base, '/harvest', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-service-key': 'nope' },
        body: JSON.stringify(evidencedBody),
      });
      expect(res.status).toBe(401);
      expect(h.harvestCalls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('harvests an evidenced fact into a candidate with a valid key', async () => {
    const h = await buildHarness();
    try {
      const res = await request(h.base, '/harvest', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-service-key': INTERNAL_KEY },
        body: JSON.stringify(evidencedBody),
      });
      expect(res.status).toBe(200);
      const data = (res.json() as { data: HarvestResult }).data;
      expect(data.harvested).toBe(true);
      expect(h.harvestCalls).toHaveLength(1);
      expect(h.harvestCalls[0]?.userId).toBe('user-1');
      expect(h.harvestCalls[0]?.taskId).toBe('task-1');
    } finally {
      await h.close();
    }
  });

  it('400s a body missing evidence at the boundary (schema requires taskId + artifactId)', async () => {
    const h = await buildHarness();
    try {
      const { taskId, artifactId, ...noEvidence } = evidencedBody;
      void taskId;
      void artifactId;
      const res = await request(h.base, '/harvest', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-service-key': INTERNAL_KEY },
        body: JSON.stringify(noEvidence),
      });
      expect(res.status).toBe(400);
      // Boundary rejected it before the harvest service ran.
      expect(h.harvestCalls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });
});
