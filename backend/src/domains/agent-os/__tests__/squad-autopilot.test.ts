/**
 * SquadAutopilotService — the cron→beads→conductor loop, now consumed through
 * the typed {@link SquadIssuePort} (the memory-owned issue-graph module facet,
 * late-bound like the conductor seam). Covers the tick dispatch happy path,
 * the no-ready-work no-op, truthful degrades (seam unattached / issue graph
 * down / no conductor / a defensively-caught port throw), dispatch refusal +
 * retry, re-dispatch dedupe, per-tick dispatch cap, and late attach of BOTH
 * seams. The squad-routing block covers the SEEDED path end-to-end: a real
 * `route()` fires (leader-first, weighted fallback when the leader is
 * ineligible) and the routed agent reaches both the conductor dispatch and the
 * board audit row; the unseeded pass-through leaves the dispatch flat (route()
 * never called); a squadId set over an unseeded store fails closed with a
 * truthful "squad not found" skip (the pre-fusion footgun, now covered).
 */
import { describe, it, expect, vi } from 'vitest';
import type {
  SquadIssuePort,
  SquadIssueDetail,
  SquadReadyIssue,
  SquadStaleIssue,
} from '../ports/squad-issue.port.js';
import type { SquadConductorPort, SquadDispatchRequest } from '../ports/squad-autopilot.port.js';
import { SquadAutopilotService, type SquadAutopilotDeps } from '../services/squad-autopilot.service.js';
import { SquadService, InMemorySquadStore } from '../services/squad.service.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;
const now = () => '2026-07-17T00:00:00.000Z';

interface FakeIssueGraphOptions {
  /** The typed ready pull. Throw from here to exercise the defensive catch. */
  readonly ready?: () => readonly SquadReadyIssue[];
  /** The per-issue `bd show --long` lineage read; omitted ⇒ `null` (degrade). */
  readonly show?: (id: string) => SquadIssueDetail | null;
  /** The truthful liveness probe; defaults to available. */
  readonly health?: () => { available: boolean; reason?: string };
  /** The `bd stale` board read; omitted ⇒ `[]` (the facet's degrade value). */
  readonly stale?: () => readonly SquadStaleIssue[];
}

/**
 * A fake {@link SquadIssuePort} — the SAME shape bootstrap attaches over
 * `memory.issueGraph()`. Its degrade law mirrors the facet: reads resolve
 * typed values / `[]` / `null`, `health()` carries the truthful reason.
 */
function fakeIssueGraph(opts: FakeIssueGraphOptions = {}) {
  const showCalls: Array<{ id: string; long: boolean }> = [];
  const port: SquadIssuePort = {
    health: async () => opts.health?.() ?? { available: true },
    ready: async () => opts.ready?.() ?? [],
    show: async (id, o) => {
      showCalls.push({ id, long: o.long });
      return opts.show?.(id) ?? null;
    },
    stale: async () => opts.stale?.() ?? [],
  };
  return { port, showCalls };
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
    const graph = fakeIssueGraph({
      ready: () => [{ id: 'bd-1', title: 'Fix login', description: 'Users cannot log in' }],
    });
    const conductor = fakeConductor();
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port });

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

  it('weaves the issue-graph lineage + notes (bd show) into the launch prompt', async () => {
    // The port's `SquadIssueDetail` shape: the accumulated NOTE evidence
    // (comments) + the dependency lineage prior agents wrote onto this very
    // issue, passed through raw off `bd show --long`.
    const show = (id: string): SquadIssueDetail => ({
      id,
      title: 'Fix login',
      description: 'Users cannot log in',
      comments: [
        { id: 1, author: 'agent-a', text: 'evidence: the session cookie is dropped on subdomain' },
        { id: 2, author: 'agent-b', text: 'gotcha: Better Auth verify path is HTTP-delegated' },
      ],
      dependencies: [
        { id: 'bd-0', title: 'Auth spine', status: 'closed', dependency_type: 'discovered-from' },
        { id: 'bd-9', title: 'Cookie domain', status: 'open', dependency_type: 'blocked-by' },
      ],
    });
    const graph = fakeIssueGraph({
      ready: () => [{ id: 'bd-1', title: 'Fix login', description: 'Users cannot log in' }],
      show,
    });
    const conductor = fakeConductor();
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port });

    const result = await svc.tickOnce();
    expect(result.dispatched).toBe(1);

    // The fusion FIRED: the lineage read hit the port for the issue before dispatch…
    expect(graph.showCalls).toEqual([{ id: 'bd-1', long: true }]);

    // …and its evidence + lineage are woven into the dispatched prompt.
    const prompt = conductor.calls[0].prompt;
    expect(prompt).toContain('Fix login');
    expect(prompt).toContain('Shared memory from the beads issue graph');
    expect(prompt).toContain('the session cookie is dropped on subdomain');
    expect(prompt).toContain('[agent-b]');
    expect(prompt).toContain('discovered-from bd-0');
    expect(prompt).toContain('blocked-by bd-9');
  });

  it('dispatches without a lineage block when the show read degrades (never blocks the run)', async () => {
    // No `show` stub ⇒ the port's lineage read resolves `null` (the facet's
    // truthful degrade); the dispatch still fires on the flat title+description.
    const graph = fakeIssueGraph({
      ready: () => [{ id: 'bd-1', title: 'Fix login', description: 'Users cannot log in' }],
    });
    const conductor = fakeConductor();
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port });

    const result = await svc.tickOnce();
    expect(result.dispatched).toBe(1);
    const prompt = conductor.calls[0].prompt;
    expect(prompt).toContain('Fix login');
    expect(prompt).toContain('Users cannot log in');
    expect(prompt).not.toContain('Shared memory from the beads issue graph');
  });

  it('is a no-op when there is no ready work (a live graph, just empty)', async () => {
    const graph = fakeIssueGraph({ ready: () => [] });
    const conductor = fakeConductor();
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port });

    const result = await svc.tickOnce();

    expect(result).toMatchObject({ status: 'ok', ready: 0, dispatched: 0, failed: 0, skipped: 0 });
    expect(conductor.calls).toHaveLength(0);
  });

  it('never re-dispatches an issue it already launched', async () => {
    const graph = fakeIssueGraph({ ready: () => [{ id: 'bd-1', title: 'Fix login' }] });
    const conductor = fakeConductor();
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port });

    await svc.tickOnce();
    const second = await svc.tickOnce();

    expect(second.dispatched).toBe(0);
    expect(second.skipped).toBe(1);
    expect(conductor.calls).toHaveLength(1);
  });

  it('caps dispatches per tick and leaves the rest for the next pass', async () => {
    const graph = fakeIssueGraph({
      ready: () => [
        { id: 'bd-1', title: 'One' },
        { id: 'bd-2', title: 'Two' },
      ],
    });
    const conductor = fakeConductor();
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port, maxDispatchesPerTick: 1 });

    const first = await svc.tickOnce();
    expect(first.dispatched).toBe(1);
    expect(conductor.calls.map((c) => c.taskId)).toEqual(['bd-1']);

    const second = await svc.tickOnce();
    expect(second.dispatched).toBe(1);
    expect(conductor.calls.map((c) => c.taskId)).toEqual(['bd-1', 'bd-2']);
  });

  it('records a refused dispatch as failed (with the reason) and retries next tick', async () => {
    const graph = fakeIssueGraph({ ready: () => [{ id: 'bd-1', title: 'Fix login' }] });
    const conductor = fakeConductor({ ok: false, reason: 'governance gate denied workspace.create' });
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port });

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
  it('degrades (dispatching nothing) when the issue-graph seam is not attached', async () => {
    const conductor = fakeConductor();
    const svc = autopilot({ conductor: conductor.port });

    const result = await svc.tickOnce();

    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('issue-graph seam not attached');
    expect(result.dispatched).toBe(0);
    expect(conductor.calls).toHaveLength(0);
  });

  it('degrades with the truthful health reason when the issue graph itself is down', async () => {
    // The facet's degrade law: a down `bd` reads as an EMPTY pull, and the
    // health probe carries the truthful reason — never guessed work.
    const graph = fakeIssueGraph({
      ready: () => [],
      health: () => ({ available: false, reason: 'bd (beads) is not installed on this host' }),
    });
    const conductor = fakeConductor();
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port });

    const result = await svc.tickOnce();

    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('bd (beads) is not installed');
    expect(conductor.calls).toHaveLength(0);
  });

  it('recovers when the issue-graph seam is attached late (mirrors the conductor attach)', async () => {
    const conductor = fakeConductor();
    const svc = autopilot({ conductor: conductor.port });

    const before = await svc.tickOnce();
    expect(before.status).toBe('degraded');
    expect(before.reason).toContain('issue-graph seam not attached');

    svc.attachIssueGraph(fakeIssueGraph({ ready: () => [{ id: 'bd-1', title: 'Fix login' }] }).port);
    const after = await svc.tickOnce();
    expect(after.status).toBe('ok');
    expect(after.dispatched).toBe(1);
  });

  it('degrades when the conductor seam is not wired, then recovers on late attach', async () => {
    const graph = fakeIssueGraph({ ready: () => [{ id: 'bd-1', title: 'Fix login' }] });
    const svc = autopilot({ issueGraph: graph.port });

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

  it('degrades on a (contract-violating) port throw instead of crashing the loop', async () => {
    const graph = fakeIssueGraph({
      ready: () => {
        throw new Error('issue-graph facet bug');
      },
    });
    const conductor = fakeConductor();
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port });

    const result = await svc.tickOnce();
    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('issue-graph facet bug');
    expect(conductor.calls).toHaveLength(0);
  });

  it('board reports missing seams truthfully', async () => {
    const svc = autopilot();
    const board = await svc.board();
    expect(board.beads.wired).toBe(false);
    expect(board.conductor.wired).toBe(false);
    expect(board.running).toBe(false);
    // Unattached seam ⇒ no stale read is even possible; the board says so via
    // `beads.wired:false` and serves an empty (never fabricated) section.
    expect(board.staleIssues).toEqual([]);
    expect(svc.seams()).toEqual({ beadsWired: false, conductorWired: false });
  });

  it('board surfaces the attached seam health truthfully (up / down with reason)', async () => {
    const up = autopilot({ issueGraph: fakeIssueGraph().port });
    expect((await up.board()).beads).toEqual({ wired: true, status: 'up' });

    const down = autopilot({
      issueGraph: fakeIssueGraph({ health: () => ({ available: false, reason: 'bd down' }) }).port,
    });
    expect((await down.board()).beads).toEqual({ wired: true, status: 'down', reason: 'bd down' });
  });

  it('board surfaces stalled in-flight work (`bd stale`) as explicit control-plane state', async () => {
    const stale: SquadStaleIssue[] = [
      { id: 'bd-7', title: 'Stuck migration', status: 'in_progress' },
      { id: 'bd-8', title: 'Silent worktree', status: 'in_progress' },
    ];
    const svc = autopilot({ issueGraph: fakeIssueGraph({ stale: () => stale }).port });

    const board = await svc.board();
    expect(board.staleIssues).toEqual(stale);
  });

  it('board serves without the stale section on a (contract-violating) port throw', async () => {
    const graph = fakeIssueGraph();
    graph.port.stale = async () => {
      throw new Error('stale read bug');
    };
    const svc = autopilot({ issueGraph: graph.port });

    const board = await svc.board();
    expect(board.beads).toEqual({ wired: true, status: 'up' });
    expect(board.staleIssues).toEqual([]);
  });
});

describe('SquadAutopilotService — squad routing', () => {
  async function squadWith(eligible: boolean): Promise<SquadService> {
    const squads = new SquadService({ store: new InMemorySquadStore(), isEligible: () => eligible });
    await squads.createSquad({ squadId: 'sq-1', spaceId: 'sp-1', displayName: 'Alpha', leaderAgentId: 'lead', routingStrategy: 'leader' });
    await squads.addMember({ squadId: 'sq-1', agentId: 'lead', role: 'leader', weight: 1 });
    return squads;
  }

  it('routes each dispatch through the configured (seeded) squad', async () => {
    const graph = fakeIssueGraph({ ready: () => [{ id: 'bd-1', title: 'Fix login' }] });
    const conductor = fakeConductor();
    // A SEEDED squad (the store the bootstrap seed populates) injected under a
    // set squadId: `routeThroughSquad` now finds it and `route()` fires for real.
    const squads = await squadWith(true);
    const routeSpy = vi.spyOn(squads, 'route');
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port, squads, squadId: 'sq-1' });

    const result = await svc.tickOnce();
    expect(result.dispatched).toBe(1);
    // route() genuinely fired against the seeded squad for this exact issue…
    expect(routeSpy).toHaveBeenCalledWith('sq-1', 'bd-1');
    // …selected the leader AND the dispatch carried it to the conductor.
    expect(conductor.calls[0].routedAgentId).toBe('lead');
    // …and the routed agent is recorded on the board audit trail (the same
    // routedAgentId bootstrap threads onto the workspace record).
    const board = await svc.board();
    expect(board.entries[0]).toMatchObject({ issueId: 'bd-1', status: 'dispatched', routedAgentId: 'lead' });
  });

  it('routes to the highest-weight eligible member when the leader is ineligible', async () => {
    // Leader 'lead' offline ⇒ leader-first misses ⇒ weighted fallback picks the
    // highest-weight eligible member (deterministic), and it reaches the conductor.
    const squads = new SquadService({
      store: new InMemorySquadStore(),
      isEligible: (id) => id !== 'lead',
    });
    await squads.createSquad({ squadId: 'sq-1', spaceId: 'sp-1', displayName: 'Alpha', leaderAgentId: 'lead', routingStrategy: 'leader' });
    await squads.addMember({ squadId: 'sq-1', agentId: 'lead', role: 'leader', weight: 1 });
    await squads.addMember({ squadId: 'sq-1', agentId: 'worker-hi', role: 'member', weight: 5 });
    await squads.addMember({ squadId: 'sq-1', agentId: 'worker-lo', role: 'member', weight: 2 });
    const graph = fakeIssueGraph({ ready: () => [{ id: 'bd-1', title: 'Fix login' }] });
    const conductor = fakeConductor();
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port, squads, squadId: 'sq-1' });

    const result = await svc.tickOnce();
    expect(result.dispatched).toBe(1);
    expect(conductor.calls[0].routedAgentId).toBe('worker-hi');
    const board = await svc.board();
    expect(board.entries[0]).toMatchObject({ issueId: 'bd-1', status: 'dispatched', routedAgentId: 'worker-hi' });
  });

  it('never touches squad routing when unseeded — flat pass-through dispatch (byte-identical)', async () => {
    // Squads enabled but NO squadId (the default `squadSeed:null` runtime state):
    // `routeThroughSquad` short-circuits, `route()` is never called, and the
    // dispatch is the flat, un-routed launch — byte-identical to pre-fusion.
    const graph = fakeIssueGraph({ ready: () => [{ id: 'bd-1', title: 'Fix login' }] });
    const conductor = fakeConductor();
    const squads = await squadWith(true);
    const routeSpy = vi.spyOn(squads, 'route');
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port, squads });

    const result = await svc.tickOnce();
    expect(result.dispatched).toBe(1);
    expect(routeSpy).not.toHaveBeenCalled();
    expect(conductor.calls[0].routedAgentId).toBeUndefined();
    const board = await svc.board();
    expect(board.entries[0]).toMatchObject({ issueId: 'bd-1', status: 'dispatched' });
    expect(board.entries[0].routedAgentId).toBeUndefined();
  });

  it('skips with a truthful reason when squadId is set but the store was never seeded (the pre-fix footgun)', async () => {
    // The dark-wiring bug this fusion closes: a bare RECODER_SQUAD_ID over an
    // EMPTY store makes `route()` fail closed with "squad not found" and SKIP
    // every dispatch. Now covered — the skip is truthful, never a faked launch.
    const graph = fakeIssueGraph({ ready: () => [{ id: 'bd-1', title: 'Fix login' }] });
    const conductor = fakeConductor();
    const squads = new SquadService({ store: new InMemorySquadStore() });
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port, squads, squadId: 'sq-unseeded' });

    const result = await svc.tickOnce();
    expect(result).toMatchObject({ status: 'ok', dispatched: 0, skipped: 1 });
    expect(conductor.calls).toHaveLength(0);
    const board = await svc.board();
    expect(board.entries[0]).toMatchObject({ issueId: 'bd-1', status: 'skipped' });
    expect(board.entries[0].reason).toContain('squad not found');
  });

  it('skips (fail-closed) when the squad has no eligible member', async () => {
    const graph = fakeIssueGraph({ ready: () => [{ id: 'bd-1', title: 'Fix login' }] });
    const conductor = fakeConductor();
    const svc = autopilot({ issueGraph: graph.port, conductor: conductor.port, squads: await squadWith(false), squadId: 'sq-1' });

    const result = await svc.tickOnce();
    expect(result).toMatchObject({ status: 'ok', dispatched: 0, skipped: 1 });
    expect(conductor.calls).toHaveLength(0);
    const board = await svc.board();
    expect(board.entries[0]).toMatchObject({ issueId: 'bd-1', status: 'skipped' });
    expect(board.entries[0].reason).toContain('failed closed');
  });
});
