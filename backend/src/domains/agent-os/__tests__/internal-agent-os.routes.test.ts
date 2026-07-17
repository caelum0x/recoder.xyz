/**
 * `/internal/agent-os/*` ingest edges — INTERNAL_SERVICE_KEY gate + per-edge
 * happy paths + boundary validation. Uses the REAL identity auth middleware
 * (same harness as the identity internal-routes suite) so fail-closed behavior
 * is genuinely exercised, and the real ingest/drain services over the in-memory
 * state-of-record.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RunEvent, RuntimeEvidence, TaskRun } from '@recoder/agent-os';
import { buildInternalAgentOsRouter } from '../routes/internal-agent-os.routes.js';
import { InMemoryAgentOsRepository } from '../adapters/in-memory-agent-os.repository.js';
import { RunEventIngestService } from '../services/run-event-ingest.service.js';
import { OutboxDrainService } from '../services/outbox-drain.service.js';
import type { AgentOsGovernanceGate } from '../adapters/governance-gate.adapter.js';
import type { OutboxPublisherPort } from '../ports/outbox-publisher.port.js';
import { PrincipalService } from '../../identity/principal.service.js';
import { createAuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AuthSessionVerifier } from '../../identity/adapters/better-auth.adapter.js';
import type { ApiKeyValidator } from '../../identity/ports/api-key.port.js';
import type { IdentityConfig } from '../../identity/config.js';

const INTERNAL_KEY = 'internal-service-key-abcdefghijklmnop';

/**
 * Minimal HTTP client over the built-in `http` module — the vitest setup mocks
 * `global.fetch`, so real requests must bypass it (same pattern as the identity
 * internal-routes suite).
 */
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

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

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

const stubAdapter: AuthSessionVerifier = {
  verifyToken: vi.fn(async () => null),
  extractToken: () => null,
};

const apiKeyValidator: ApiKeyValidator = { validate: vi.fn(async () => null) };

function allowGate(): AgentOsGovernanceGate {
  return { guard: async () => ({ allowed: true, effect: 'allow', reason: 'ok', degraded: false }) };
}

function okPublisher(): OutboxPublisherPort & { published: number } {
  const publisher = {
    published: 0,
    async publish(): Promise<void> {
      publisher.published += 1;
    },
    health: () => 'up' as const,
  };
  return publisher;
}

function failingPublisher(): OutboxPublisherPort {
  return {
    publish: async () => {
      throw new Error('transport down');
    },
    health: () => 'down' as const,
  };
}

interface Harness {
  base: string;
  close: () => Promise<void>;
  repo: InMemoryAgentOsRepository;
}

function buildHarness(opts: {
  publisher?: OutboxPublisherPort;
  configOverride?: Partial<IdentityConfig>;
} = {}): Promise<Harness> {
  const repo = new InMemoryAgentOsRepository();
  const cfg = { ...identityConfig, ...(opts.configOverride ?? {}) };
  const principal = new PrincipalService({
    config: cfg,
    logger: silentLogger,
    authSession: stubAdapter,
    apiKeyValidator,
  });
  const middleware = createAuthMiddleware({
    verifier: principal,
    principal,
    config: cfg,
    logger: silentLogger,
  });
  const runEventBus = new RunEventIngestService({ repository: repo, gate: allowGate(), logger: silentLogger });
  const drain = new OutboxDrainService({
    repository: repo,
    publisher: opts.publisher ?? okPublisher(),
    logger: silentLogger,
    intervalMs: 60_000,
    batchSize: 10,
  });

  const app = express();
  app.use(express.json());
  app.use('/internal/agent-os', buildInternalAgentOsRouter({ repository: repo, runEventBus, drain, middleware }));

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

function runEvent(partial: Partial<RunEvent> & Pick<RunEvent, 'eventId' | 'type'>): RunEvent {
  return {
    taskId: 'task-1',
    runId: 'run-1',
    createdAt: '2026-01-02T00:00:00.000Z',
    ...partial,
  };
}

const post = (
  harness: Harness,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: () => unknown }> =>
  request(harness.base, `/internal/agent-os${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

const withKey = { 'x-internal-service-key': INTERNAL_KEY };

const EDGES = ['/events', '/runs/run-1/steps', '/runtime-evidence', '/outbox/drain'] as const;

describe('internal-agent-os routes — INTERNAL_SERVICE_KEY gate', () => {
  it('rejects every edge with 401 when no key is presented', async () => {
    const harness = await buildHarness();
    for (const edge of EDGES) {
      const res = await post(harness, edge, {});
      expect(res.status, edge).toBe(401);
    }
    await harness.close();
  });

  it('rejects every edge with 401 on a wrong key', async () => {
    const harness = await buildHarness();
    for (const edge of EDGES) {
      const res = await post(harness, edge, {}, { 'x-internal-service-key': 'nope' });
      expect(res.status, edge).toBe(401);
    }
    await harness.close();
  });

  it('fails closed with 503 on every edge when the gate is not configured', async () => {
    const harness = await buildHarness({
      configOverride: { internalServiceKey: null, internalServiceKeyPresent: false },
    });
    for (const edge of EDGES) {
      const res = await post(harness, edge, {}, withKey);
      expect(res.status, edge).toBe(503);
    }
    await harness.close();
  });
});

describe('POST /internal/agent-os/events — RunEvent ingest', () => {
  it('ingests a single event and returns the ingest result', async () => {
    const harness = await buildHarness();
    seedRun(harness.repo, 'created');
    const res = await post(
      harness,
      '/events',
      { event: runEvent({ eventId: 'e1', type: 'state_transition', state: 'compiled' }) },
      withKey,
    );
    expect(res.status).toBe(200);
    const json = res.json() as { data: { accepted: boolean; stateChanged: boolean; currentState: string } };
    expect(json.data.accepted).toBe(true);
    expect(json.data.stateChanged).toBe(true);
    expect(json.data.currentState).toBe('compiled');
    expect(harness.repo.listEvents()).toHaveLength(1);
    await harness.close();
  });

  it('ingests a batch and returns index-aligned results', async () => {
    const harness = await buildHarness();
    seedRun(harness.repo, 'created');
    const res = await post(
      harness,
      '/events',
      {
        events: [
          runEvent({ eventId: 'e1', type: 'log', message: 'hello' }),
          runEvent({ eventId: 'e2', type: 'log', message: 'world' }),
        ],
        source: 'engine',
      },
      withKey,
    );
    expect(res.status).toBe(200);
    const json = res.json() as { data: Array<{ eventId: string; accepted: boolean }> };
    expect(json.data.map((r) => r.eventId)).toEqual(['e1', 'e2']);
    expect(json.data.every((r) => r.accepted)).toBe(true);
    await harness.close();
  });

  it('400s a body carrying neither `event` nor `events`', async () => {
    const harness = await buildHarness();
    const res = await post(harness, '/events', { source: 'engine' }, withKey);
    expect(res.status).toBe(400);
    await harness.close();
  });

  it('400s a malformed event (missing eventId) at the boundary', async () => {
    const harness = await buildHarness();
    const res = await post(
      harness,
      '/events',
      { event: { type: 'log', taskId: 'task-1', createdAt: '2026-01-02T00:00:00.000Z' } },
      withKey,
    );
    expect(res.status).toBe(400);
    await harness.close();
  });
});

describe('POST /internal/agent-os/runs/:runId/steps — step append', () => {
  it('appends steps scoped to the path run (runId injected from the param)', async () => {
    const harness = await buildHarness();
    seedRun(harness.repo, 'created');
    const res = await post(
      harness,
      '/runs/run-1/steps',
      {
        steps: [
          { eventId: 's1', type: 'log', taskId: 'task-1', message: 'step one', createdAt: '2026-01-02T00:00:00.000Z' },
          { eventId: 's2', type: 'state_transition', taskId: 'task-1', state: 'compiled', createdAt: '2026-01-02T00:00:01.000Z' },
        ],
      },
      withKey,
    );
    expect(res.status).toBe(200);
    const json = res.json() as { data: { runId: string; results: Array<{ accepted: boolean; runId?: string }> } };
    expect(json.data.runId).toBe('run-1');
    expect(json.data.results).toHaveLength(2);
    expect(json.data.results.every((r) => r.accepted)).toBe(true);
    expect(json.data.results.every((r) => r.runId === 'run-1')).toBe(true);
    // Applied to state-of-record: event log carries both, the transition landed.
    expect(harness.repo.listEvents().map((e) => e.eventId)).toEqual(['s1', 's2']);
    expect(harness.repo.listRuns()[0].state).toBe('compiled');
    await harness.close();
  });

  it('surfaces a domain rejection (unknown run) as a structured result, not a throw', async () => {
    const harness = await buildHarness();
    // No run seeded — the ingest service rejects with `unknown_run`.
    const res = await post(
      harness,
      '/runs/run-9/steps',
      { steps: [{ eventId: 's1', type: 'log', taskId: 'task-1', createdAt: '2026-01-02T00:00:00.000Z' }] },
      withKey,
    );
    expect(res.status).toBe(200);
    const json = res.json() as { data: { results: Array<{ accepted: boolean; rejection?: { reason: string } }> } };
    expect(json.data.results[0].accepted).toBe(false);
    expect(json.data.results[0].rejection?.reason).toBe('unknown_run');
    await harness.close();
  });

  it('400s a step that names a different run than the path', async () => {
    const harness = await buildHarness();
    seedRun(harness.repo);
    const res = await post(
      harness,
      '/runs/run-1/steps',
      { steps: [{ eventId: 's1', type: 'log', taskId: 'task-1', runId: 'run-2', createdAt: '2026-01-02T00:00:00.000Z' }] },
      withKey,
    );
    expect(res.status).toBe(400);
    expect(harness.repo.listEvents()).toHaveLength(0);
    await harness.close();
  });

  it('400s a malformed body (steps missing / empty)', async () => {
    const harness = await buildHarness();
    expect((await post(harness, '/runs/run-1/steps', {}, withKey)).status).toBe(400);
    expect((await post(harness, '/runs/run-1/steps', { steps: [] }, withKey)).status).toBe(400);
    await harness.close();
  });
});

describe('POST /internal/agent-os/runtime-evidence — evidence attach', () => {
  it('attaches evidence with defaults normalized by RuntimeEvidenceService', async () => {
    const harness = await buildHarness();
    const res = await post(harness, '/runtime-evidence', { taskId: 'task-1', kind: 'git_status' }, withKey);
    expect(res.status).toBe(200);
    const json = res.json() as { data: { evidence: RuntimeEvidence } };
    expect(json.data.evidence.evidenceId).toBeTruthy();
    expect(json.data.evidence.status).toBe('observed');
    expect(json.data.evidence.title).toBe('Git Status');
    expect(harness.repo.listRuntimeEvidence()).toHaveLength(1);
    await harness.close();
  });

  it('round-trips a full evidence payload against a known run', async () => {
    const harness = await buildHarness();
    seedRun(harness.repo);
    const res = await post(
      harness,
      '/runtime-evidence',
      {
        evidenceId: 'ev-1',
        taskId: 'task-1',
        runId: 'run-1',
        kind: 'verification',
        status: 'passed',
        title: 'vitest run',
        summary: '42 passed',
        source: { command: 'pnpm exec vitest run' },
        artifactIds: ['art-1'],
        observedAt: '2026-01-03T00:00:00.000Z',
        metadata: { exitCode: 0 },
      },
      withKey,
    );
    expect(res.status).toBe(200);
    const stored = harness.repo.listRuntimeEvidence()[0];
    expect(stored.evidenceId).toBe('ev-1');
    expect(stored.runId).toBe('run-1');
    expect(stored.status).toBe('passed');
    expect(stored.artifactIds).toEqual(['art-1']);
    await harness.close();
  });

  it('404s evidence naming an unknown run (never a silent attach)', async () => {
    const harness = await buildHarness();
    const res = await post(
      harness,
      '/runtime-evidence',
      { taskId: 'task-1', runId: 'run-missing', kind: 'stdout' },
      withKey,
    );
    expect(res.status).toBe(404);
    expect(harness.repo.listRuntimeEvidence()).toHaveLength(0);
    await harness.close();
  });

  it('400s a malformed payload (unknown kind / missing taskId)', async () => {
    const harness = await buildHarness();
    expect((await post(harness, '/runtime-evidence', { taskId: 'task-1', kind: 'vibes' }, withKey)).status).toBe(400);
    expect((await post(harness, '/runtime-evidence', { kind: 'stdout' }, withKey)).status).toBe(400);
    await harness.close();
  });
});

describe('POST /internal/agent-os/outbox/drain — manual drain trigger', () => {
  it('drains pending outbox records and reports truthful stats', async () => {
    const publisher = okPublisher();
    const harness = await buildHarness({ publisher });
    seedRun(harness.repo, 'created');
    // A state_transition ingest enqueues one pending outbox record.
    await post(
      harness,
      '/events',
      { event: runEvent({ eventId: 'e1', type: 'state_transition', state: 'compiled' }) },
      withKey,
    );
    expect(harness.repo.listOutbox().filter((r) => r.status === 'pending')).toHaveLength(1);

    const res = await post(harness, '/outbox/drain', {}, withKey);
    expect(res.status).toBe(200);
    const json = res.json() as { data: { attempted: number; published: number; failed: number; remainingPending: number } };
    expect(json.data.attempted).toBe(1);
    expect(json.data.published).toBe(1);
    expect(json.data.remainingPending).toBe(0);
    expect(publisher.published).toBe(1);
    expect(harness.repo.listOutbox()[0].status).toBe('published');
    await harness.close();
  });

  it('reports failures truthfully and leaves records pending (never lost)', async () => {
    const harness = await buildHarness({ publisher: failingPublisher() });
    seedRun(harness.repo, 'created');
    await post(
      harness,
      '/events',
      { event: runEvent({ eventId: 'e1', type: 'state_transition', state: 'compiled' }) },
      withKey,
    );

    const res = await post(harness, '/outbox/drain', {}, withKey);
    expect(res.status).toBe(200);
    const json = res.json() as { data: { published: number; failed: number; remainingPending: number } };
    expect(json.data.published).toBe(0);
    expect(json.data.failed).toBe(1);
    expect(json.data.remainingPending).toBe(1);
    expect(harness.repo.listOutbox()[0].status).toBe('pending');
    await harness.close();
  });
});
