/**
 * `/api/agent-os` CRUD edge table — self-gating (reads allow the non-strict
 * anonymous fallback, writes demand a real principal), boundary validation,
 * frozen-contract composition (run create/transition via `@recoder/agent-os`),
 * truthful 404s and 503s. Uses the REAL identity auth middleware over a stub
 * session verifier (same harness as the internal-routes suite).
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TaskRun, TaskSpec } from '@recoder/agent-os';
import { buildAgentOsRouter } from '../routes/agent-os.routes.js';
import { InMemoryAgentOsRepository } from '../adapters/in-memory-agent-os.repository.js';
import type { AgentOsRepositoryPort } from '../ports/agent-os-repository.port.js';
import { PrincipalService } from '../../identity/principal.service.js';
import { createAuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AuthSessionVerifier } from '../../identity/adapters/better-auth.adapter.js';
import type { ApiKeyValidator } from '../../identity/ports/api-key.port.js';
import type { IdentityConfig } from '../../identity/config.js';

const SESSION_TOKEN = 'session-token-abcdefghijklmnop';

const identityConfig: IdentityConfig = {
  betterAuthSecretPresent: true,
  authDatabaseUrl: 'postgres://x',
  cookieDomain: '.recoder.xyz',
  strictAuth: false,
  internalServiceKey: 'internal-service-key-abcdefghijklmnop',
  internalServiceKeyPresent: true,
  isProduction: false,
  deviceCodeTtlSeconds: 900,
  devicePollIntervalSeconds: 5,
  apiKeyDefaultTtlDays: null,
  apiKeyPrefixLength: 12,
};

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

/** Resolves a real session ONLY for the known bearer token. */
const stubAdapter: AuthSessionVerifier = {
  extractToken: ({ bearerToken }) => bearerToken ?? null,
  verifyToken: vi.fn(async (raw: string) =>
    raw === SESSION_TOKEN
      ? {
          sessionId: 'sess-1',
          userId: 'user-1',
          email: 'user@recoder.xyz',
          emailVerified: true,
          expiresAt: new Date(Date.now() + 60_000),
        }
      : null,
  ),
};

const apiKeyValidator: ApiKeyValidator = { validate: vi.fn(async () => null) };

interface Harness {
  base: string;
  close: () => Promise<void>;
  repo: InMemoryAgentOsRepository;
}

function buildHarness(repositoryOverride?: AgentOsRepositoryPort): Promise<Harness> {
  const repo = new InMemoryAgentOsRepository();
  const principal = new PrincipalService({
    config: identityConfig,
    logger: silentLogger,
    authSession: stubAdapter,
    apiKeyValidator,
  });
  const middleware = createAuthMiddleware({
    verifier: principal,
    principal,
    config: identityConfig,
    logger: silentLogger,
  });

  const app = express();
  app.use(express.json());
  app.use(
    '/api/agent-os',
    buildAgentOsRouter({ repository: repositoryOverride ?? repo, middleware }),
  );

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

/** Raw `http` client (the vitest setup mocks global fetch). */
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

const asUser = { authorization: `Bearer ${SESSION_TOKEN}`, 'content-type': 'application/json' };

const get = (h: Harness, path: string) => request(h.base, path);
const send = (h: Harness, method: string, path: string, body: unknown) =>
  request(h.base, path, { method, headers: asUser, body: JSON.stringify(body) });

const dataOf = <T>(res: { json: () => unknown }): T => (res.json() as { data: T }).data;

const spaceBody = {
  spaceId: 'space-1',
  displayName: 'Space One',
  ownerId: 'user-1',
  repositories: [],
  policy: {
    policyId: 'pol-1',
    approvalRequiredFor: [],
    forbiddenPaths: [],
    defaultVerificationCommands: [],
    allowNetworkByDefault: false,
    allowShellByDefault: false,
  },
};

const taskBody = {
  taskId: 'task-1',
  title: 'Fix it',
  intent: 'bugfix',
  goal: 'green tests',
  spaceId: 'space-1',
  verification: { commands: ['pnpm test'] },
};

function seedTask(repo: InMemoryAgentOsRepository): TaskSpec {
  const task: TaskSpec = {
    taskId: 'task-1',
    title: 'Fix it',
    intent: 'bugfix',
    goal: 'green tests',
    spaceId: 'space-1',
    targetPaths: [],
    forbiddenPaths: [],
    acceptanceCriteria: [],
    verification: { commands: [] },
    approvalRequired: [],
    artifactRequired: [],
  };
  repo.upsertTask(task);
  return task;
}

function seedRun(repo: InMemoryAgentOsRepository, state: TaskRun['state'] = 'created'): TaskRun {
  const run: TaskRun = {
    runId: 'run-1',
    taskId: 'task-1',
    spaceId: 'space-1',
    state,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  repo.upsertRun(run);
  return run;
}

describe('CRUD edges — gating', () => {
  it('rejects writes without a real principal (401) and leaves state untouched', async () => {
    const h = await buildHarness();
    const res = await request(h.base, '/spaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(spaceBody),
    });
    expect(res.status).toBe(401);
    expect(h.repo.listSpaces()).toHaveLength(0);
    await h.close();
  });

  it('serves reads via the non-strict anonymous fallback', async () => {
    const h = await buildHarness();
    for (const path of [
      '/spaces', '/agents', '/approvals', '/artifacts', '/runtime-evidence',
      '/memory/items', '/memory/candidates', '/instructions', '/policies', '/events',
    ]) {
      const res = await get(h, path);
      expect(res.status, path).toBe(200);
      expect(dataOf(res)).toEqual([]);
    }
    await h.close();
  });
});

describe('CRUD edges — spaces', () => {
  it('creates, reads, and updates a space policy', async () => {
    const h = await buildHarness();
    expect((await send(h, 'POST', '/spaces', spaceBody)).status).toBe(200);

    // Reads are now tenant-scoped (recoder-eqsz): a created space is visible to
    // its OWNER, not to the anonymous fallback — authenticate the read.
    const got = await request(h.base, '/spaces/space-1', { headers: asUser });
    expect(got.status).toBe(200);
    expect(dataOf<{ spaceId: string; createdAt: string }>(got).spaceId).toBe('space-1');
    expect(dataOf<{ createdAt: string }>(got).createdAt).toBeTruthy();

    const put = await send(h, 'PUT', '/spaces/space-1/policy', {
      ...spaceBody.policy,
      allowShellByDefault: true,
    });
    expect(put.status).toBe(200);
    expect(h.repo.listSpaces()[0].policy.allowShellByDefault).toBe(true);
    await h.close();
  });

  it('404s a policy PUT on an unknown space; 400s a malformed space', async () => {
    const h = await buildHarness();
    expect((await send(h, 'PUT', '/spaces/nope/policy', spaceBody.policy)).status).toBe(404);
    expect((await send(h, 'POST', '/spaces', { spaceId: 'x' })).status).toBe(400);
    await h.close();
  });
});

describe('CRUD edges — tasks + runs (frozen contracts composed)', () => {
  it('creates a task then a run in `created` via TaskService', async () => {
    const h = await buildHarness();
    expect((await send(h, 'POST', '/tasks', taskBody)).status).toBe(200);
    const created = await send(h, 'POST', '/runs', { taskId: 'task-1', runId: 'run-1' });
    expect(created.status).toBe(200);
    const run = dataOf<TaskRun>(created);
    expect(run).toMatchObject({ runId: 'run-1', taskId: 'task-1', spaceId: 'space-1', state: 'created' });
    expect((await get(h, '/runs/run-1')).status).toBe(200);
    await h.close();
  });

  it('404s run creation for an unknown task', async () => {
    const h = await buildHarness();
    expect((await send(h, 'POST', '/runs', { taskId: 'nope' })).status).toBe(404);
    await h.close();
  });

  it('applies a LEGAL transition and rejects an ILLEGAL one via the package table', async () => {
    const h = await buildHarness();
    // The run's space must be owned by the caller — transition is owner-scoped (recoder-yb5r).
    expect((await send(h, 'POST', '/spaces', spaceBody)).status).toBe(200);
    seedTask(h.repo);
    seedRun(h.repo, 'created');

    const legal = await send(h, 'POST', '/runs/run-1/transition', { to: 'compiled' });
    expect(legal.status).toBe(200);
    expect(dataOf<TaskRun>(legal).state).toBe('compiled');
    expect(h.repo.listRuns()[0].state).toBe('compiled');

    const illegal = await send(h, 'POST', '/runs/run-1/transition', { to: 'completed' });
    expect(illegal.status).toBe(400);
    expect(h.repo.listRuns()[0].state).toBe('compiled'); // untouched
    await h.close();
  });

  it('400s an unknown transition target at the boundary', async () => {
    const h = await buildHarness();
    seedRun(h.repo);
    expect((await send(h, 'POST', '/runs/run-1/transition', { to: 'warp' })).status).toBe(400);
    await h.close();
  });

  it('reads a task by id and 404s a missing one', async () => {
    const h = await buildHarness();
    seedTask(h.repo);
    expect((await get(h, '/tasks/task-1')).status).toBe(200);
    expect((await get(h, '/tasks/none')).status).toBe(404);
    await h.close();
  });
});

describe('CRUD edges — artifacts + memory candidates', () => {
  it('creates an artifact, defaulting id/createdAt/createdBy from the principal', async () => {
    const h = await buildHarness();
    const res = await send(h, 'POST', '/artifacts', {
      taskId: 'task-1',
      kind: 'summary',
      mimeType: 'text/markdown',
    });
    expect(res.status).toBe(200);
    const artifact = dataOf<{ artifactId: string; createdBy: string; public: boolean }>(res);
    expect(artifact.artifactId).toBeTruthy();
    expect(artifact.createdBy).toBe('user-1');
    expect(artifact.public).toBe(false);
    expect((await get(h, `/artifacts/${artifact.artifactId}`)).status).toBe(200);
    await h.close();
  });

  it('requires evidence on a memory candidate and pins status to candidate_created', async () => {
    const h = await buildHarness();
    expect(
      (await send(h, 'POST', '/memory/candidates', { scope: 'space', title: 't', body: 'b' })).status,
    ).toBe(400);

    const res = await send(h, 'POST', '/memory/candidates', {
      scope: 'space',
      title: 'gotcha',
      body: 'the fact',
      evidence: { taskId: 'task-1', artifactId: 'art-1' },
    });
    expect(res.status).toBe(200);
    const cand = dataOf<{ status: string; proposedBy: string }>(res);
    expect(cand.status).toBe('candidate_created');
    expect(cand.proposedBy).toBe('user-1');
    await h.close();
  });
});

describe('CRUD edges — events + truthful degrade', () => {
  it('filters GET /events by taskId and runId', async () => {
    const h = await buildHarness();
    h.repo.appendEvent({ eventId: 'e1', type: 'log', taskId: 'task-1', runId: 'run-1', createdAt: 'now' });
    h.repo.appendEvent({ eventId: 'e2', type: 'log', taskId: 'task-2', runId: 'run-2', createdAt: 'now' });

    expect(dataOf<unknown[]>(await get(h, '/events'))).toHaveLength(2);
    const filtered = dataOf<Array<{ eventId: string }>>(await get(h, '/events?taskId=task-1'));
    expect(filtered.map((e) => e.eventId)).toEqual(['e1']);
    const byRun = dataOf<Array<{ eventId: string }>>(await get(h, '/events?runId=run-2'));
    expect(byRun.map((e) => e.eventId)).toEqual(['e2']);
    await h.close();
  });

  it('surfaces a repository fault as a truthful 503, never a fake success', async () => {
    const failing = new Proxy({} as AgentOsRepositoryPort, {
      get: () => () => {
        throw new Error('state-of-record unavailable');
      },
    });
    const h = await buildHarness(failing);
    const read = await get(h, '/spaces');
    expect(read.status).toBe(503);
    const write = await send(h, 'POST', '/spaces', spaceBody);
    expect(write.status).toBe(503);
    await h.close();
  });
});
