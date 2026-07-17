/**
 * SquadAutopilotService — the cron→beads→conductor loop. Covers the tick
 * dispatch happy path, the no-ready-work no-op, truthful degrades (no beads /
 * beads down / no conductor), dispatch refusal + retry, re-dispatch dedupe,
 * per-tick dispatch cap, squad fail-closed routing, and late conductor attach.
 */
import { describe, it, expect, vi } from 'vitest';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { SquadConductorPort, SquadDispatchRequest } from '../ports/squad-autopilot.port.js';
import { SquadAutopilotService, type SquadAutopilotDeps } from '../services/squad-autopilot.service.js';
import { SquadService, InMemorySquadStore } from '../services/squad.service.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;
const now = () => '2026-07-17T00:00:00.000Z';

/** A fake beads EngineClientPort whose `ready` op returns the given payload. */
function fakeBeads(ready: () => unknown): EngineClientPort {
  return {
    id: 'beads',
    transport: 'cli',
    start: async () => {},
    stop: async () => {},
    invoke: vi.fn(async (call) => {
      if (call.op !== 'ready') return { ok: false as const, reason: `unexpected op ${call.op}` };
      const payload = ready();
      if (payload instanceof Error) return { ok: false as const, reason: payload.message };
      return { ok: true as const, value: payload };
    }),
    health: async () => ({ engineId: 'beads', transport: 'cli', status: 'up', checkedAt: now() }),
  };
}

/** A conductor seam that records dispatches and launches ws-<n>. */
function fakeConductor(outcome?: { ok: false; reason: string }) {
  const calls: SquadDispatchRequest[] = [];
  let n = 0;
  const port: SquadConductorPort = {
    dispatch: async (req) => {
      calls.push(req);
      if (outcome) return outcome;
      n += 1;
      return { ok: true, workspaceId: `ws-${n}`, runId: `run-${n}` };
    },
  };
  return { port, calls };
}

function autopilot(overrides: Partial<SquadAutopilotDeps> = {}): SquadAutopilotService {
  return new SquadAutopilotService({
    logger: silentLogger,
    intervalMs: 60_000,
    maxDispatchesPerTick: 3,
    now,
    ...overrides,
  });
}

describe('SquadAutopilotService — tick', () => {
  it('dispatches a ready issue as a conductor workspace (happy path)', async () => {
    const beads = fakeBeads(() => [{ id: 'bd-1', title: 'Fix login', description: 'Users cannot log in' }]);
    const conductor = fakeConductor();
    const svc = autopilot({ beads, conductor: conductor.port });

    const result = await svc.tickOnce();

    expect(result.status).toBe('ok');
    expect(result.ready).toBe(1);
    expect(result.dispatched).toBe(1);
    expect(result.failed).toBe(0);
    expect(conductor.calls).toHaveLength(1);
    expect(conductor.calls[0].taskId).toBe('bd-1');
    expect(conductor.calls[0].prompt).toContain('Fix login');
    expect(conductor.calls[0].prompt).toContain('Users cannot log in');

    const board = await svc.board();
    expect(board.entries).toHaveLength(1);
    expect(board.entries[0]).toMatchObject({ issueId: 'bd-1', status: 'dispatched', workspaceId: 'ws-1' });
    expect(board.lastTick).toEqual(result);
  });

  it('is a no-op when there is no ready work', async () => {
    const beads = fakeBeads(() => []);
    const conductor = fakeConductor();
    const svc = autopilot({ beads, conductor: conductor.port });

    const result = await svc.tickOnce();

    expect(result).toMatchObject({ status: 'ok', ready: 0, dispatched: 0, failed: 0, skipped: 0 });
    expect(conductor.calls).toHaveLength(0);
  });

  it('never re-dispatches an issue it already launched', async () => {
    const beads = fakeBeads(() => [{ id: 'bd-1', title: 'Fix login' }]);
    const conductor = fakeConductor();
    const svc = autopilot({ beads, conductor: conductor.port });

    await svc.tickOnce();
    const second = await svc.tickOnce();

    expect(second.dispatched).toBe(0);
    expect(second.skipped).toBe(1);
    expect(conductor.calls).toHaveLength(1);
  });

  it('caps dispatches per tick and leaves the rest for the next pass', async () => {
    const beads = fakeBeads(() => [
      { id: 'bd-1', title: 'One' },
      { id: 'bd-2', title: 'Two' },
    ]);
    const conductor = fakeConductor();
    const svc = autopilot({ beads, conductor: conductor.port, maxDispatchesPerTick: 1 });

    const first = await svc.tickOnce();
    expect(first.dispatched).toBe(1);
    expect(conductor.calls.map((c) => c.taskId)).toEqual(['bd-1']);

    const second = await svc.tickOnce();
    expect(second.dispatched).toBe(1);
    expect(conductor.calls.map((c) => c.taskId)).toEqual(['bd-1', 'bd-2']);
  });

  it('records a refused dispatch as failed (with the reason) and retries next tick', async () => {
    const beads = fakeBeads(() => [{ id: 'bd-1', title: 'Fix login' }]);
    const conductor = fakeConductor({ ok: false, reason: 'governance gate denied workspace.create' });
    const svc = autopilot({ beads, conductor: conductor.port });

    const result = await svc.tickOnce();
    expect(result).toMatchObject({ status: 'ok', dispatched: 0, failed: 1 });
    const board = await svc.board();
    expect(board.entries[0]).toMatchObject({
      issueId: 'bd-1',
      status: 'failed',
      reason: expect.stringContaining('governance gate denied'),
    });

    // The failed issue is still a candidate on the next pass (retry, not dedupe).
    await svc.tickOnce();
    expect(conductor.calls).toHaveLength(2);
  });
});

describe('SquadAutopilotService — truthful degrade', () => {
  it('degrades (dispatching nothing) when the beads seam is not wired', async () => {
    const conductor = fakeConductor();
    const svc = autopilot({ conductor: conductor.port });

    const result = await svc.tickOnce();

    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('beads engine client not wired');
    expect(result.dispatched).toBe(0);
    expect(conductor.calls).toHaveLength(0);
  });

  it('degrades with the CLI reason when bd itself is down', async () => {
    const beads = fakeBeads(() => new Error('bd (beads) is not installed on this host'));
    const conductor = fakeConductor();
    const svc = autopilot({ beads, conductor: conductor.port });

    const result = await svc.tickOnce();

    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('bd (beads) is not installed');
    expect(conductor.calls).toHaveLength(0);
  });

  it('degrades when the conductor seam is not wired, then recovers on late attach', async () => {
    const beads = fakeBeads(() => [{ id: 'bd-1', title: 'Fix login' }]);
    const svc = autopilot({ beads });

    const before = await svc.tickOnce();
    expect(before.status).toBe('degraded');
    expect(before.reason).toContain('conductor dispatch seam not wired');
    expect(before.dispatched).toBe(0);

    const conductor = fakeConductor();
    svc.attachConductor(conductor.port);
    const after = await svc.tickOnce();
    expect(after.status).toBe('ok');
    expect(after.dispatched).toBe(1);
  });

  it('degrades on an unrecognized bd ready payload instead of guessing work', async () => {
    const beads = fakeBeads(() => 'not json at all');
    const conductor = fakeConductor();
    const svc = autopilot({ beads, conductor: conductor.port });

    const result = await svc.tickOnce();
    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('unrecognized payload');
    expect(conductor.calls).toHaveLength(0);
  });

  it('board reports missing seams truthfully', async () => {
    const svc = autopilot();
    const board = await svc.board();
    expect(board.beads.wired).toBe(false);
    expect(board.conductor.wired).toBe(false);
    expect(board.running).toBe(false);
    expect(svc.seams()).toEqual({ beadsWired: false, conductorWired: false });
  });
});

describe('SquadAutopilotService — squad routing', () => {
  async function squadWith(eligible: boolean): Promise<SquadService> {
    const squads = new SquadService({ store: new InMemorySquadStore(), isEligible: () => eligible });
    await squads.createSquad({ squadId: 'sq-1', spaceId: 'sp-1', displayName: 'Alpha', leaderAgentId: 'lead', routingStrategy: 'leader' });
    await squads.addMember({ squadId: 'sq-1', agentId: 'lead', role: 'leader', weight: 1 });
    return squads;
  }

  it('routes each dispatch through the configured squad', async () => {
    const beads = fakeBeads(() => [{ id: 'bd-1', title: 'Fix login' }]);
    const conductor = fakeConductor();
    const svc = autopilot({ beads, conductor: conductor.port, squads: await squadWith(true), squadId: 'sq-1' });

    const result = await svc.tickOnce();
    expect(result.dispatched).toBe(1);
    expect(conductor.calls[0].routedAgentId).toBe('lead');
  });

  it('skips (fail-closed) when the squad has no eligible member', async () => {
    const beads = fakeBeads(() => [{ id: 'bd-1', title: 'Fix login' }]);
    const conductor = fakeConductor();
    const svc = autopilot({ beads, conductor: conductor.port, squads: await squadWith(false), squadId: 'sq-1' });

    const result = await svc.tickOnce();
    expect(result).toMatchObject({ status: 'ok', dispatched: 0, skipped: 1 });
    expect(conductor.calls).toHaveLength(0);
    const board = await svc.board();
    expect(board.entries[0]).toMatchObject({ issueId: 'bd-1', status: 'skipped' });
    expect(board.entries[0].reason).toContain('failed closed');
  });
});
