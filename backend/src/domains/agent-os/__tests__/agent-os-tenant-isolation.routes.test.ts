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

  it('owner A may transition their own run (a NON-approval move)', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    seedRun(h);

    // A legal non-approval exit from waiting_for_approval — owner keeps control
    // of their own run's lifecycle; only self-APPROVAL is blocked (below).
    const res = await post(h, asUser(TOKEN_A), '/runs/run-A/transition', { to: 'cancelled' });
    expect(res.status).toBe(200);
    expect(h.repo.listRuns().find((r) => r.runId === 'run-A')?.state).toBe('cancelled');
    await h.close();
  });

  it('owner A CANNOT self-approve their run via the raw edge — governance flow only (recoder-magq)', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    seedRun(h); // seeded in waiting_for_approval

    // Even the OWNER cannot mint `approved` here — that would forge an approval
    // with no record. The raw transition edge carries no governance gate, so it
    // refuses the approval outcome (403); the run stays waiting_for_approval.
    const res = await post(h, asUser(TOKEN_A), '/runs/run-A/transition', { to: 'approved' });
    expect(res.status).toBe(403);
    expect(h.repo.listRuns().find((r) => r.runId === 'run-A')?.state).toBe('waiting_for_approval');
    await h.close();
  });

  it('an operator ALSO cannot self-approve via the raw edge (no gate here either)', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    seedRun(h);
    const res = await post(h, asAdminKey, '/runs/run-A/transition', { to: 'approved' });
    expect(res.status).toBe(403);
    await h.close();
  });
});

describe('agent-os tenant isolation — single-record reads (recoder-ctoj)', () => {
  it("user B cannot GET user A's run by id (404 no-oracle); owner A can", async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    h.repo.upsertRun({
      runId: 'run-A', taskId: 'task-A', spaceId: 'space-A', state: 'running',
      updatedAt: '2026-07-01T00:00:00Z',
    });
    expect((await get(h, asUser(TOKEN_B), '/runs/run-A')).status).toBe(404);
    expect((await get(h, asUser(TOKEN_A), '/runs/run-A')).status).toBe(200);
    await h.close();
  });

  it("user B cannot GET user A's task by id (404 no-oracle); owner A can", async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    h.repo.upsertTask({
      taskId: 'task-A', spaceId: 'space-A', title: 't', intent: 'bugfix', goal: 'g',
      targetPaths: [], forbiddenPaths: [], acceptanceCriteria: [],
      verification: { commands: [] }, approvalRequired: [], artifactRequired: [],
    } as unknown as Parameters<typeof h.repo.upsertTask>[0]);
    expect((await get(h, asUser(TOKEN_B), '/tasks/task-A')).status).toBe(404);
    expect((await get(h, asUser(TOKEN_A), '/tasks/task-A')).status).toBe(200);
    await h.close();
  });
});

// — LIST-surface tenant scoping (recoder-ctoj) —
// Seed a full set of A-owned aggregates under space-A/task-A; every list edge
// must exclude them from another tenant (B), include them for owner A, and be
// bypassed by an operator. Resolution is by the record's owning space: direct
// (task/run) or indirect via taskId->task.spaceId (artifact/approval/instruction/
// memory/policy/event). A policy decision with NO taskId has no owner → it is
// visible ONLY to an operator/solo caller, never a tenant list.
const anyRec = <T>(o: unknown): T => o as T;

function seedAOwnedAggregates(h: Harness): void {
  h.repo.upsertTask(anyRec({
    taskId: 'task-A', spaceId: 'space-A', title: 't', intent: 'bugfix', goal: 'g',
    targetPaths: [], forbiddenPaths: [], acceptanceCriteria: [],
    verification: { commands: [] }, approvalRequired: [], artifactRequired: [],
  }));
  h.repo.upsertRun(anyRec({
    runId: 'run-A', taskId: 'task-A', spaceId: 'space-A', state: 'running',
    updatedAt: '2026-07-01T00:00:00Z',
  }));
  h.repo.upsertArtifact(anyRec({
    artifactId: 'art-A', taskId: 'task-A', kind: 'log', uri: 'x',
    createdAt: '2026-07-01T00:00:00Z', createdBy: 'user-A',
  }));
  h.repo.upsertApproval(anyRec({
    approvalId: 'apr-A', taskId: 'task-A', state: 'pending',
  }));
  h.repo.upsertInstructionBundle(anyRec({
    bundleId: 'bun-A', taskId: 'task-A', runtime: 'claude', content: '',
  }));
  h.repo.upsertMemoryItem(anyRec({
    itemId: 'mem-A', scope: 'task', content: 'x',
    evidence: { taskId: 'task-A', artifactId: 'art-A' },
  }));
  h.repo.upsertPolicyDecision(anyRec({
    decisionId: 'pol-A', taskId: 'task-A', action: 'x', allowed: true,
  }));
  // An UNLINKED policy decision (no taskId) — owner-less; operator-only.
  h.repo.upsertPolicyDecision(anyRec({
    decisionId: 'pol-orphan', action: 'y', allowed: false,
  }));
  h.repo.appendEvent(anyRec({
    eventId: 'evt-A', taskId: 'task-A', type: 'run.started',
    at: '2026-07-01T00:00:00Z',
  }));
}

// The scoped list edges and how many rows A owns in each (orphan policy excluded).
const LIST_EDGES: Array<{ path: string; ownedByA: number }> = [
  { path: '/tasks', ownedByA: 1 },
  { path: '/runs', ownedByA: 1 },
  { path: '/artifacts', ownedByA: 1 },
  { path: '/approvals', ownedByA: 1 },
  { path: '/instructions', ownedByA: 1 },
  { path: '/memory/items', ownedByA: 1 },
  { path: '/policies', ownedByA: 1 }, // the orphan is NOT owned by A
  { path: '/events', ownedByA: 1 },
];

describe('agent-os tenant isolation — list surface excludes other tenants (recoder-ctoj)', () => {
  it("user B sees NONE of user A's records across every scoped list edge", async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    seedAOwnedAggregates(h);
    for (const edge of LIST_EDGES) {
      const res = await get(h, asUser(TOKEN_B), edge.path);
      expect(res.status).toBe(200);
      expect({ path: edge.path, rows: dataOf<unknown[]>(res) }).toEqual({ path: edge.path, rows: [] });
    }
    await h.close();
  });

  it('owner A sees exactly their own records on every scoped list edge', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    seedAOwnedAggregates(h);
    for (const edge of LIST_EDGES) {
      const res = await get(h, asUser(TOKEN_A), edge.path);
      expect(res.status).toBe(200);
      expect({ path: edge.path, n: dataOf<unknown[]>(res).length })
        .toEqual({ path: edge.path, n: edge.ownedByA });
    }
    await h.close();
  });

  it('an operator (admin key) sees ALL records incl. the owner-less orphan policy', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    seedAOwnedAggregates(h);
    // /policies has the linked + orphan decision → operator sees BOTH (2).
    expect(dataOf<unknown[]>(await get(h, asAdminKey, '/policies')).length).toBe(2);
    expect(dataOf<unknown[]>(await get(h, asAdminKey, '/artifacts')).length).toBe(1);
    await h.close();
  });

  it('solo/desktop mode fails open — anonymous caller sees every list', async () => {
    const h = await buildHarness({ soloMode: true });
    // Solo (seeAll) needs no owner match — seed aggregates directly.
    seedAOwnedAggregates(h);
    expect(dataOf<unknown[]>(await get(h, {}, '/artifacts')).length).toBe(1);
    expect(dataOf<unknown[]>(await get(h, {}, '/tasks')).length).toBe(1);
    await h.close();
  });
});

describe('agent-os tenant isolation — point reads resolve ownership via task (recoder-ctoj)', () => {
  const POINT_READS = ['/artifacts/art-A', '/approvals/apr-A', '/instructions/bun-A', '/policies/pol-A'];

  it("user B cannot GET any of A's task-linked records by id (404); owner A can", async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    seedAOwnedAggregates(h);
    for (const path of POINT_READS) {
      expect({ path, s: (await get(h, asUser(TOKEN_B), path)).status }).toEqual({ path, s: 404 });
      expect({ path, s: (await get(h, asUser(TOKEN_A), path)).status }).toEqual({ path, s: 200 });
    }
    await h.close();
  });
});

describe('agent-os tenant isolation — unownable operator surfaces (recoder-ctoj)', () => {
  it('a tenant sees NO agents (shared registry, no owner link) but an operator does', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    h.repo.upsertAgent(anyRec({ agentId: 'agent-1', kind: 'connector', lastSeenAt: '2026-07-01T00:00:00Z' }));
    // AgentProfile has no tenant/space — fail closed: a tenant sees an empty list + 404.
    expect(dataOf<unknown[]>(await get(h, asUser(TOKEN_A), '/agents'))).toEqual([]);
    expect((await get(h, asUser(TOKEN_A), '/agents/agent-1')).status).toBe(404);
    // An operator sees the shared registry.
    expect(dataOf<unknown[]>(await get(h, asAdminKey, '/agents')).length).toBe(1);
    expect((await get(h, asAdminKey, '/agents/agent-1')).status).toBe(200);
    await h.close();
  });

  it('GET /summary is operator-only — a tenant is refused (403); operator + solo allowed', async () => {
    const h = await buildHarness();
    await seedOwnedSpace(h, TOKEN_A, 'space-A', 'user-A');
    expect((await get(h, asUser(TOKEN_A), '/summary')).status).toBe(403);
    expect((await get(h, asAdminKey, '/summary')).status).toBe(200);
    await h.close();

    const solo = await buildHarness({ soloMode: true });
    expect((await get(solo, {}, '/summary')).status).toBe(200);
    await solo.close();
  });
});
