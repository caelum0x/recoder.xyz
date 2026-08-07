/**
 * Tenant isolation for the `/api/agent-os` space + space-policy edges
 * (recoder-eqsz, P0). Proves:
 *  (a) user B cannot READ or OVERWRITE user A's space (404, no oracle);
 *  (b) user B cannot rewrite A's policy via `PUT /spaces/:id/policy`
 *      (the governance bypass) — 404;
 *  (c) owner A can read / overwrite / re-policy their own space;
 *  (d) an operator (internal service key / `admin` scope) bypasses scoping;
 *  (e) SOLO/desktop mode fails OPEN — a single local owner is never locked out.
 *
 * Uses the REAL identity auth middleware over a stub session verifier, the same
 * harness shape as `agent-os-crud.routes.test.ts`, but with two distinct users,
 * an `admin`-scoped api key, and an internal service key.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildAgentOsRouter } from '../routes/agent-os.routes.js';
import { InMemoryAgentOsRepository } from '../adapters/in-memory-agent-os.repository.js';
import { PrincipalService } from '../../identity/principal.service.js';
import { createAuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AuthSessionVerifier } from '../../identity/adapters/better-auth.adapter.js';
import type { ApiKeyValidator } from '../../identity/ports/api-key.port.js';
import type { IdentityConfig } from '../../identity/config.js';

const INTERNAL_KEY = 'internal-service-key-abcdefghijklmnop';
const TOKEN_A = 'session-token-user-a-000000000000';
const TOKEN_B = 'session-token-user-b-000000000000';
const ADMIN_API_KEY = 'sk_admin_000000000000';

function baseConfig(soloMode: boolean): IdentityConfig {
  return {
    betterAuthSecretPresent: true,
    authDatabaseUrl: 'postgres://x',
    cookieDomain: '.recoder.xyz',
    strictAuth: false,
    internalServiceKey: INTERNAL_KEY,
    internalServiceKeyPresent: true,
    soloMode,
    isProduction: false,
    deviceCodeTtlSeconds: 900,
    devicePollIntervalSeconds: 5,
    apiKeyDefaultTtlDays: null,
    apiKeyPrefixLength: 12,
  };
}

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

/** Resolves user-A / user-B sessions by bearer token. */
const stubAdapter: AuthSessionVerifier = {
  extractToken: ({ bearerToken }) => bearerToken ?? null,
  verifyToken: vi.fn(async (raw: string) => {
    const map: Record<string, string> = { [TOKEN_A]: 'user-A', [TOKEN_B]: 'user-B' };
    const userId = map[raw];
    if (!userId) return null;
    return {
      sessionId: `sess-${userId}`,
      userId,
      email: `${userId}@recoder.xyz`,
      emailVerified: true,
      expiresAt: new Date(Date.now() + 60_000),
    };
  }),
};

/** Validates the `admin`-scoped platform api key. */
const apiKeyValidator: ApiKeyValidator = {
  validate: vi.fn(async (raw: string) =>
    raw === ADMIN_API_KEY
      ? { userId: 'admin-user', scopes: ['read', 'write', 'admin'] }
      : null,
  ),
};

interface Harness {
  base: string;
  close: () => Promise<void>;
  repo: InMemoryAgentOsRepository;
}

function buildHarness(opts: { soloMode?: boolean } = {}): Promise<Harness> {
  const soloMode = opts.soloMode ?? false;
  const repo = new InMemoryAgentOsRepository();
  const config = baseConfig(soloMode);
  const principal = new PrincipalService({
    config,
    logger: silentLogger,
    authSession: stubAdapter,
    apiKeyValidator,
  });
  const middleware = createAuthMiddleware({
    verifier: principal,
    principal,
    config,
    logger: silentLogger,
  });

  const app = express();
  app.use(express.json());
  app.use('/api/agent-os', buildAgentOsRouter({ repository: repo, middleware, soloMode }));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        repo,
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
    const url = new URL(`${base}/api/agent-os${path}`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
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

const json = { 'content-type': 'application/json' };
const asUser = (token: string) => ({ authorization: `Bearer ${token}`, ...json });
const asAdminKey = { 'x-api-key': ADMIN_API_KEY, ...json };
const asInternal = { 'x-internal-service-key': INTERNAL_KEY, ...json };

const dataOf = <T>(res: { json: () => unknown }): T => (res.json() as { data: T }).data;

function spaceBody(spaceId: string, ownerId: string, allowShell = false) {
  return {
    spaceId,
    displayName: `Space ${spaceId}`,
    ownerId, // NOTE: body ownership is ADVERSARIAL — the edge must ignore it.
    repositories: [],
    policy: {
      policyId: `pol-${spaceId}`,
      approvalRequiredFor: [],
      forbiddenPaths: [],
      defaultVerificationCommands: [],
      allowNetworkByDefault: false,
      allowShellByDefault: allowShell,
    },
  };
}

const post = (h: Harness, headers: Record<string, string>, path: string, body: unknown) =>
  request(h.base, path, { method: 'POST', headers, body: JSON.stringify(body) });
const put = (h: Harness, headers: Record<string, string>, path: string, body: unknown) =>
  request(h.base, path, { method: 'PUT', headers, body: JSON.stringify(body) });
const get = (h: Harness, headers: Record<string, string>, path: string) =>
  request(h.base, path, { headers });

/** Seed a space owned by `owner`, created by `owner`'s token. */
async function seedOwnedSpace(h: Harness, token: string, spaceId: string, owner: string) {
  const res = await post(h, asUser(token), '/spaces', spaceBody(spaceId, owner));
  expect(res.status).toBe(200);
}

describe('agent-os tenant isolation — creation stamps the caller as owner', () => {
  it('ignores an adversarial body.ownerId and stamps the authenticated principal', async () => {
    const h = await buildHarness();
    // A creates a space but LIES in the body, claiming user-B owns it.
    const res = await post(h, asUser(TOKEN_A), '/spaces', spaceBody('space-1', 'user-B'));
    expect(res.status).toBe(200);
    expect(dataOf<{ ownerId: string }>(res).ownerId).toBe('user-A');
    expect(h.repo.listSpaces()[0].ownerId).toBe('user-A');
    await h.close();
  });
});

describe('agent-os tenant isolation — cross-tenant reads (a)', () => {
  it('user B cannot GET user A\'s space (404, no oracle) and it is absent from B\'s list', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');

    expect((await get(h, asUser(TOKEN_B), '/spaces/space-A')).status).toBe(404);
    expect(dataOf<unknown[]>(await get(h, asUser(TOKEN_B), '/spaces'))).toEqual([]);
    await h.close();
  });
});

describe('agent-os tenant isolation — cross-tenant overwrite (a)', () => {
  it('user B cannot overwrite user A\'s space via POST /spaces (404)', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');

    const overwrite = await post(h, asUser(TOKEN_B), '/spaces', spaceBody('space-A', 'user-B', true));
    expect(overwrite.status).toBe(404);
    // A's space is untouched — still owned by A, shell still disallowed.
    const stored = h.repo.listSpaces()[0];
    expect(stored.ownerId).toBe('user-A');
    expect(stored.policy.allowShellByDefault).toBe(false);
    await h.close();
  });
});

describe('agent-os tenant isolation — policy bypass (b)', () => {
  it('user B cannot PUT policy on user A\'s space (404) — governance bypass closed', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');

    const attack = await put(h, asUser(TOKEN_B), '/spaces/space-A/policy', {
      policyId: 'pol-A',
      approvalRequiredFor: [], // strip A's approval gates
      forbiddenPaths: [], // clear A's forbidden paths
      defaultVerificationCommands: [],
      allowNetworkByDefault: true,
      allowShellByDefault: true,
    });
    expect(attack.status).toBe(404);
    // A's policy is untouched.
    expect(h.repo.listSpaces()[0].policy.allowShellByDefault).toBe(false);
    await h.close();
  });
});

describe('agent-os tenant isolation — owner allowed (c)', () => {
  it('owner A can GET, overwrite, and re-policy their own space', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');

    expect((await get(h, asUser(TOKEN_A), '/spaces/space-A')).status).toBe(200);
    expect(dataOf<Array<{ spaceId: string }>>(await get(h, asUser(TOKEN_A), '/spaces'))).toHaveLength(1);

    const repolicy = await put(h, asUser(TOKEN_A), '/spaces/space-A/policy', {
      policyId: 'pol-A',
      approvalRequiredFor: ['before_push'],
      forbiddenPaths: ['secrets/**'],
      defaultVerificationCommands: [],
      allowNetworkByDefault: false,
      allowShellByDefault: true,
    });
    expect(repolicy.status).toBe(200);
    expect(h.repo.listSpaces()[0].policy.allowShellByDefault).toBe(true);
    await h.close();
  });
});

describe('agent-os tenant isolation — operator bypass (d)', () => {
  it('an admin-scoped api key can read + re-policy another tenant\'s space', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');

    expect((await get(h, asAdminKey, '/spaces/space-A')).status).toBe(200);
    expect(dataOf<unknown[]>(await get(h, asAdminKey, '/spaces'))).toHaveLength(1);
    const repolicy = await put(h, asAdminKey, '/spaces/space-A/policy', {
      policyId: 'pol-A',
      approvalRequiredFor: [],
      forbiddenPaths: [],
      defaultVerificationCommands: [],
      allowNetworkByDefault: false,
      allowShellByDefault: true,
    });
    expect(repolicy.status).toBe(200);
    // Operator overwrite PRESERVES the tenant owner (no hijack).
    expect(h.repo.listSpaces()[0].ownerId).toBe('user-A');
    await h.close();
  });

  it('an internal service caller bypasses tenant scoping', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    expect((await get(h, asInternal, '/spaces/space-A')).status).toBe(200);
    expect(
      (await put(h, asInternal, '/spaces/space-A/policy', spaceBody('space-A', 'x').policy)).status,
    ).toBe(200);
    await h.close();
  });
});

describe('agent-os tenant isolation — solo/desktop fails open (e)', () => {
  it('a single local (anonymous) caller reads + re-policies any space in solo mode', async () => {
    const h = await buildHarness({ soloMode: true });
    // Solo write: no bearer token → authenticateMutating promotes the solo owner.
    expect((await post(h, json, '/spaces', spaceBody('space-solo', 'ignored'))).status).toBe(200);
    // Solo read: anonymous fallback still sees the space (not locked out).
    expect((await get(h, {}, '/spaces/space-solo')).status).toBe(200);
    expect(dataOf<unknown[]>(await get(h, {}, '/spaces'))).toHaveLength(1);
    // Solo policy rewrite works.
    expect(
      (await put(h, json, '/spaces/space-solo/policy', spaceBody('space-solo', 'x').policy)).status,
    ).toBe(200);
    await h.close();
  });
});

describe('agent-os tenant isolation — run transition (recoder-yb5r)', () => {
  const seedRun = (h: Harness) =>
    h.repo.upsertRun({
      runId: 'run-A',
      taskId: 'task-A',
      spaceId: 'space-A',
      state: 'waiting_for_approval',
      updatedAt: '2026-07-01T00:00:00Z',
    });

  it("user B cannot transition (forge-approve) a run in user A's space (404, no oracle)", async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    seedRun(h);

    const res = await post(h, asUser(TOKEN_B), '/runs/run-A/transition', { to: 'approved' });
    expect(res.status).toBe(404);
    // The victim's run is untouched — no forged approval.
    expect(h.repo.listRuns().find((r) => r.runId === 'run-A')?.state).toBe('waiting_for_approval');
    await h.close();
  });

  it('owner A may transition their own run', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    seedRun(h);

    const res = await post(h, asUser(TOKEN_A), '/runs/run-A/transition', { to: 'approved' });
    expect(res.status).toBe(200);
    expect(h.repo.listRuns().find((r) => r.runId === 'run-A')?.state).toBe('approved');
    await h.close();
  });
});
