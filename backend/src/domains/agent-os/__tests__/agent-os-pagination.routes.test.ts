/**
 * `/api/agent-os` LIST pagination — the previously-unbounded state-of-record
 * read edges (`GET /runs`, `GET /tasks`) now take `?limit=` / `?offset=` with
 * fail-fast validation, thread a REAL bound into the repository (never a
 * fetch-all-then-slice), and return the array envelope + `meta {total,limit,
 * offset}`. Backward compatible: absent params ⇒ first page (capped default).
 *
 * Uses the same real-identity-over-stub-verifier harness as the CRUD suite.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { TaskRun, TaskSpec } from '@recoder/agent-os';
import { buildAgentOsRouter } from '../routes/agent-os.routes.js';
import { InMemoryAgentOsRepository } from '../adapters/in-memory-agent-os.repository.js';
import { PostgresAgentOsRepository } from '../adapters/postgres-agent-os.repository.js';
import type { QueryExecutor, QueryParams } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import { PrincipalService } from '../../identity/principal.service.js';
import { createAuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AuthSessionVerifier } from '../../identity/adapters/better-auth.adapter.js';
import type { ApiKeyValidator } from '../../identity/ports/api-key.port.js';
import type { IdentityConfig } from '../../identity/config.js';

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

const stubAdapter: AuthSessionVerifier = {
  extractToken: ({ bearerToken }) => bearerToken ?? null,
  verifyToken: vi.fn(async () => null),
};

const apiKeyValidator: ApiKeyValidator = { validate: vi.fn(async () => null) };

interface Harness {
  base: string;
  close: () => Promise<void>;
  repo: InMemoryAgentOsRepository;
}

function buildHarness(): Promise<Harness> {
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
  app.use('/api/agent-os', buildAgentOsRouter({ repository: repo, middleware }));

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

/** Raw `http` GET (the vitest setup mocks global fetch). */
function get(base: string, path: string): Promise<{ status: number; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}/api/agent-os${path}`);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'GET' },
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
    req.end();
  });
}

const bodyOf = (res: { json: () => unknown }) =>
  res.json() as { data: unknown[]; meta?: { total?: number; limit: number; offset: number } };

function seedRun(repo: InMemoryAgentOsRepository, runId: string): TaskRun {
  const run: TaskRun = {
    runId,
    taskId: 'task-1',
    spaceId: 'space-1',
    state: 'created',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  repo.upsertRun(run);
  return run;
}

function seedTask(repo: InMemoryAgentOsRepository, taskId: string): TaskSpec {
  const task: TaskSpec = {
    taskId,
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

describe('agent-os list pagination — GET /runs', () => {
  it('caps the returned count at ?limit= and reports meta', async () => {
    const h = await buildHarness();
    for (const id of ['run-1', 'run-2', 'run-3', 'run-4', 'run-5']) seedRun(h.repo, id);

    const res = await get(h.base, '/runs?limit=2');
    expect(res.status).toBe(200);
    const body = bodyOf(res);
    expect(body.data).toHaveLength(2);
    expect(body.meta).toMatchObject({ total: 5, limit: 2, offset: 0 });
    await h.close();
  });

  it('skips with ?offset= (real bound, in insertion order)', async () => {
    const h = await buildHarness();
    for (const id of ['run-1', 'run-2', 'run-3', 'run-4', 'run-5']) seedRun(h.repo, id);

    const res = await get(h.base, '/runs?limit=2&offset=2');
    expect(res.status).toBe(200);
    const body = bodyOf(res);
    expect((body.data as Array<{ runId: string }>).map((r) => r.runId)).toEqual(['run-3', 'run-4']);
    expect(body.meta).toMatchObject({ total: 5, limit: 2, offset: 2 });
    await h.close();
  });

  it('applies the default cap when params are absent (backward compatible)', async () => {
    const h = await buildHarness();
    for (let i = 0; i < 60; i += 1) seedRun(h.repo, `run-${i}`);

    const res = await get(h.base, '/runs');
    expect(res.status).toBe(200);
    const body = bodyOf(res);
    expect(body.data).toHaveLength(50); // default limit
    expect(body.meta).toMatchObject({ total: 60, limit: 50, offset: 0 });
    await h.close();
  });

  it('threads the bound into the repository (not a fetch-all-then-slice)', async () => {
    const h = await buildHarness();
    for (const id of ['run-1', 'run-2', 'run-3']) seedRun(h.repo, id);
    const pageSpy = vi.spyOn(h.repo, 'listRunsPage');
    const listSpy = vi.spyOn(h.repo, 'listRuns');

    await get(h.base, '/runs?limit=1&offset=1');
    expect(pageSpy).toHaveBeenCalledWith({ limit: 1, offset: 1 });
    expect(listSpy).not.toHaveBeenCalled();
    await h.close();
  });

  it.each([
    ['?limit=0', 'zero limit'],
    ['?limit=201', 'over max'],
    ['?limit=abc', 'non-numeric limit'],
    ['?offset=-1', 'negative offset'],
    ['?limit=1.5', 'non-integer limit'],
  ])('400s VALIDATION_ERROR on %s', async (query) => {
    const h = await buildHarness();
    const res = await get(h.base, `/runs${query}`);
    expect(res.status).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
    await h.close();
  });
});

describe('agent-os list pagination — GET /tasks', () => {
  it('caps + defaults on the tasks edge too', async () => {
    const h = await buildHarness();
    for (let i = 0; i < 3; i += 1) seedTask(h.repo, `task-${i}`);

    const capped = await get(h.base, '/tasks?limit=1');
    expect(capped.status).toBe(200);
    expect(bodyOf(capped).data).toHaveLength(1);
    expect(bodyOf(capped).meta).toMatchObject({ total: 3, limit: 1, offset: 0 });

    const dflt = await get(h.base, '/tasks');
    expect(bodyOf(dflt).data).toHaveLength(3);
    expect(bodyOf(dflt).meta).toMatchObject({ total: 3, limit: 50, offset: 0 });
    await h.close();
  });

  it('400s VALIDATION_ERROR on an invalid tasks bound', async () => {
    const h = await buildHarness();
    const res = await get(h.base, '/tasks?offset=-5');
    expect(res.status).toBe(400);
    await h.close();
  });
});

/** A recording executor so we can prove the postgres driver emits real SQL LIMIT/OFFSET. */
class RecordingExecutor implements QueryExecutor {
  readonly reads: Array<{ sql: string; params?: QueryParams }> = [];
  readonly ones: Array<{ sql: string; params?: QueryParams }> = [];

  async execute<T extends QueryRow = QueryRow>(): Promise<readonly T[]> {
    return [];
  }
  async read<T extends QueryRow = QueryRow>(sql: string, params?: QueryParams): Promise<readonly T[]> {
    this.reads.push({ sql, params });
    return [] as unknown as T[];
  }
  async one<T extends QueryRow = QueryRow>(sql: string, params?: QueryParams): Promise<T | null> {
    this.ones.push({ sql, params });
    return { count: 7 } as unknown as T;
  }
  async mutate(): Promise<number> {
    return 1;
  }
  withTransaction<T>(fn: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    return fn(this);
  }
  isAvailable(): boolean {
    return true;
  }
}

describe('postgres driver — real SQL LIMIT/OFFSET', () => {
  it('threads limit/offset into the paged read and issues a count', async () => {
    const executor = new RecordingExecutor();
    const repo = new PostgresAgentOsRepository(executor);

    const page = await repo.listRunsPage({ limit: 10, offset: 20 });

    const paged = executor.reads.find((r) => /limit\s+:limit\s+offset\s+:offset/i.test(r.sql));
    expect(paged, 'paginated read SQL').toBeDefined();
    expect(paged?.params).toMatchObject({ limit: 10, offset: 20, aggregate: 'run' });

    const counted = executor.ones.find((r) => /count\(\*\)/i.test(r.sql));
    expect(counted, 'count SQL').toBeDefined();

    expect(page).toEqual({ items: [], total: 7, limit: 10, offset: 20 });
  });
});
