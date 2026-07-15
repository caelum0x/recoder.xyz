import { describe, it, expect, beforeEach } from 'vitest';
import type { RunEvent, TaskRun } from '@recoder/agent-os';
import { RunEventIngestService } from '../services/run-event-ingest.service.js';
import { InMemoryAgentOsRepository } from '../adapters/in-memory-agent-os.repository.js';
import type { AgentOsGovernanceGate, AgentOsGateDecision } from '../adapters/governance-gate.adapter.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

function allowGate(): AgentOsGovernanceGate {
  return { guard: async () => ({ allowed: true, effect: 'allow', reason: 'ok', degraded: false }) };
}
function denyGate(): AgentOsGovernanceGate {
  return {
    guard: async (): Promise<AgentOsGateDecision> => ({
      allowed: false,
      effect: 'deny',
      reason: 'policy denied',
      degraded: false,
    }),
  };
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

function event(partial: Partial<RunEvent> & Pick<RunEvent, 'eventId' | 'type'>): RunEvent {
  return {
    taskId: 'task-1',
    runId: 'run-1',
    createdAt: '2026-01-02T00:00:00.000Z',
    ...partial,
  };
}

const now = () => '2026-03-01T00:00:00.000Z';

describe('RunEventIngestService — the frozen ingest invariant', () => {
  let repo: InMemoryAgentOsRepository;

  beforeEach(() => {
    repo = new InMemoryAgentOsRepository();
  });

  it('applies a legal transition: mutates state, appends the log, enqueues outbox, notifies', async () => {
    seedRun(repo, 'created');
    const svc = new RunEventIngestService({ repository: repo, gate: allowGate(), logger: silentLogger, now });
    const seen: string[] = [];
    svc.subscribe((_env, result) => {
      seen.push(result.eventId);
    });

    const result = await svc.ingest(event({ eventId: 'e1', type: 'state_transition', state: 'compiled' }), 'conductor');

    expect(result.accepted).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.stateChanged).toBe(true);
    expect(result.previousState).toBe('created');
    expect(result.currentState).toBe('compiled');
    expect(result.outboxId).toBeDefined();
    expect(repo.listRuns()[0].state).toBe('compiled');
    expect(repo.listEvents()).toHaveLength(1);
    // subscriber fires async (fire-and-forget) — allow a microtask flush
    await Promise.resolve();
    expect(seen).toEqual(['e1']);
  });

  it('is idempotent by eventId: a replay mutates nothing and is not re-delivered', async () => {
    seedRun(repo, 'created');
    const svc = new RunEventIngestService({ repository: repo, gate: allowGate(), logger: silentLogger, now });
    let deliveries = 0;
    svc.subscribe(() => {
      deliveries += 1;
    });

    const first = await svc.ingest(event({ eventId: 'e1', type: 'state_transition', state: 'compiled' }));
    const replay = await svc.ingest(event({ eventId: 'e1', type: 'state_transition', state: 'compiled' }));

    expect(first.duplicate).toBe(false);
    expect(replay.accepted).toBe(true);
    expect(replay.duplicate).toBe(true);
    expect(replay.stateChanged).toBe(false);
    expect(repo.listEvents()).toHaveLength(1); // no double append
    await Promise.resolve();
    expect(deliveries).toBe(1); // replay NOT re-delivered
  });

  it('returns an unknown_run rejection (never throws) for a missing run', async () => {
    const svc = new RunEventIngestService({ repository: repo, gate: allowGate(), logger: silentLogger, now });
    const result = await svc.ingest(event({ eventId: 'e1', type: 'state_transition', state: 'compiled', runId: 'ghost' }));
    expect(result.accepted).toBe(false);
    expect(result.rejection?.reason).toBe('unknown_run');
    expect(repo.listEvents()).toHaveLength(0);
  });

  it('returns an illegal_transition rejection and mutates nothing', async () => {
    seedRun(repo, 'created');
    const svc = new RunEventIngestService({ repository: repo, gate: allowGate(), logger: silentLogger, now });
    const result = await svc.ingest(event({ eventId: 'e1', type: 'started' })); // created → running is illegal
    expect(result.accepted).toBe(false);
    expect(result.rejection?.reason).toBe('illegal_transition');
    expect(result.rejection?.from).toBe('created');
    expect(result.rejection?.to).toBe('running');
    expect(repo.listRuns()[0].state).toBe('created');
    expect(repo.listEvents()).toHaveLength(0);
  });

  it('returns a gate_denied rejection when the governance gate denies the write', async () => {
    seedRun(repo, 'created');
    const svc = new RunEventIngestService({ repository: repo, gate: denyGate(), logger: silentLogger, now });
    const result = await svc.ingest(event({ eventId: 'e1', type: 'state_transition', state: 'compiled' }));
    expect(result.accepted).toBe(false);
    expect(result.rejection?.reason).toBe('gate_denied');
    expect(repo.listRuns()[0].state).toBe('created'); // nothing mutated
    expect(repo.listEvents()).toHaveLength(0);
  });

  it('accepts an evidence-only log event without a state change', async () => {
    seedRun(repo, 'compiled');
    const svc = new RunEventIngestService({ repository: repo, gate: allowGate(), logger: silentLogger, now });
    const result = await svc.ingest(event({ eventId: 'e1', type: 'log', message: 'hi' }));
    expect(result.accepted).toBe(true);
    expect(result.stateChanged).toBe(false);
    expect(repo.listEvents()).toHaveLength(1);
  });

  it('ingestBatch applies in order and a per-event rejection does not abort the batch', async () => {
    seedRun(repo, 'created');
    const svc = new RunEventIngestService({ repository: repo, gate: allowGate(), logger: silentLogger, now });
    const results = await svc.ingestBatch([
      event({ eventId: 'e1', type: 'state_transition', state: 'compiled' }), // ok
      event({ eventId: 'e2', type: 'state_transition', state: 'running' }), // compiled → running illegal
      event({ eventId: 'e3', type: 'state_transition', state: 'routed' }), // compiled → routed ok
    ]);
    expect(results.map((r) => r.accepted)).toEqual([true, false, true]);
    expect(results[1].rejection?.reason).toBe('illegal_transition');
    expect(repo.listRuns()[0].state).toBe('routed');
  });
});
