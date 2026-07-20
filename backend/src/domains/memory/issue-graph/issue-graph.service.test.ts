/**
 * issue-graph.service contract tests — the module's `{op, input}` mapping onto
 * the injected engines transport (including `--actor` threading on every write)
 * and the per-verb degrade law: a null port, a truthful `{ok:false}`, or a
 * (contract-violating) throw all yield `[]`/`null`/`false`/`undefined` — never
 * a throw across the facet, never a fabricated result.
 */
import { describe, it, expect } from 'vitest';
import type {
  EngineCall,
  EngineClientPort,
} from '../../engines/ports/engine-client.port.js';
import type { EngineHealth, InvokeResult } from '../../engines/types.js';
import { createIssueGraphService } from './issue-graph.service.js';

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
  child() {
    return silentLogger;
  },
} as never;

/** A fake engine transport that records every `{op, input}` call. */
function fakeEngine(respond: (call: EngineCall<unknown>) => InvokeResult<unknown>): {
  engine: EngineClientPort;
  calls: EngineCall<unknown>[];
} {
  const calls: EngineCall<unknown>[] = [];
  const engine: EngineClientPort = {
    id: 'beads',
    transport: 'cli',
    async start() {},
    async stop() {},
    async invoke(call) {
      calls.push(call);
      return respond(call);
    },
    async health(): Promise<EngineHealth> {
      return {
        engineId: 'beads',
        transport: 'cli',
        status: 'up',
        version: 'bd 1.0.5',
        checkedAt: '2026-07-21T00:00:00Z',
      };
    },
  };
  return { engine, calls };
}

function okEngine(value: unknown = {}) {
  return fakeEngine(() => ({ ok: true, value }));
}

function failEngine(reason = 'bd is not installed on this host') {
  return fakeEngine(() => ({ ok: false, reason }));
}

function throwingEngine(): { engine: EngineClientPort; calls: EngineCall<unknown>[] } {
  const { engine, calls } = okEngine();
  engine.invoke = async () => {
    throw new Error('seam contract violated');
  };
  return { engine, calls };
}

function svcOver(engine: EngineClientPort | null) {
  return createIssueGraphService({ engine, logger: silentLogger });
}

describe('issue-graph op/input mapping (the adapter owns the argv)', () => {
  it('ready → {op:ready}', async () => {
    const { engine, calls } = okEngine([
      { id: 'bd-1', title: 'work', status: 'open', priority: 1, description: 'd', labels: ['x'] },
    ]);
    const issues = await svcOver(engine).ready();
    expect(calls[0]).toMatchObject({ op: 'ready', input: {} });
    expect(issues).toEqual([
      { id: 'bd-1', title: 'work', status: 'open', labels: ['x'], description: 'd', priority: 1 },
    ]);
  });

  it('show → {op:show, input:{id, long}} and unwraps a single object', async () => {
    const { engine, calls } = okEngine({
      id: 'bd-1',
      title: 't',
      description: 'body',
      status: 'open',
      labels: [],
      comments: [{ text: 'note' }],
      dependencies: [{ id: 'bd-0' }],
    });
    const detail = await svcOver(engine).show('bd-1', { long: true });
    expect(calls[0]).toMatchObject({ op: 'show', input: { id: 'bd-1', long: true } });
    expect(detail?.id).toBe('bd-1');
    expect(detail?.comments).toHaveLength(1);
    expect(detail?.dependencies).toHaveLength(1);
  });

  it('search → {op:search, input:{query,label,status,limit}}', async () => {
    const { engine, calls } = okEngine([]);
    await svcOver(engine).search('nginx', { label: 'infra', status: 'open', limit: 3 });
    expect(calls[0]).toMatchObject({
      op: 'search',
      input: { query: 'nginx', label: 'infra', status: 'open', limit: 3 },
    });
  });

  it('blocked → {op:blocked, input:{parent}} and narrows blocked_by', async () => {
    const { engine, calls } = okEngine([
      { id: 'bd-2', title: 'stuck', status: 'open', labels: [], blocked_by: ['bd-1'] },
    ]);
    const blocked = await svcOver(engine).blocked({ parent: 'bd-0' });
    expect(calls[0]).toMatchObject({ op: 'blocked', input: { parent: 'bd-0' } });
    expect(blocked[0]?.blockedBy).toEqual(['bd-1']);
  });

  it('depTree → {op:graph} / depList → {op:deps} / stats → {op:stats}', async () => {
    const { engine, calls } = okEngine({ nodes: [] });
    const svc = svcOver(engine);
    await svc.depTree('bd-1', { direction: 'down', maxDepth: 2 });
    await svc.depList('bd-1', { direction: 'up', type: 'blocks' });
    await svc.stats({ groupBy: 'status', status: 'open' });
    expect(calls[0]).toMatchObject({
      op: 'graph',
      input: { id: 'bd-1', direction: 'down', maxDepth: 2 },
    });
    expect(calls[1]).toMatchObject({
      op: 'deps',
      input: { id: 'bd-1', direction: 'up', type: 'blocks' },
    });
    expect(calls[2]).toMatchObject({ op: 'stats', input: { groupBy: 'status', status: 'open' } });
  });

  it('stale → {op:stale, input:{limit}}', async () => {
    const { engine, calls } = okEngine([]);
    await svcOver(engine).stale({ limit: 5 });
    expect(calls[0]).toMatchObject({ op: 'stale', input: { limit: 5 } });
  });

  it('vcStatus → {op:sync}', async () => {
    const { engine, calls } = okEngine({ clean: true });
    const status = await svcOver(engine).vcStatus();
    expect(calls[0]).toMatchObject({ op: 'sync', input: {} });
    expect(status).toEqual({ clean: true });
  });
});

describe('issue-graph writes thread the audit actor', () => {
  it('create carries actor + discoveredFrom and returns the bd id', async () => {
    const { engine, calls } = okEngine({ id: 'bd-9' });
    const created = await svcOver(engine).create(
      { title: 'follow-up', description: 'd', labels: 'infra', discoveredFrom: 'bd-1' },
      'squad-autopilot',
    );
    expect(calls[0]).toMatchObject({
      op: 'create',
      input: {
        title: 'follow-up',
        description: 'd',
        labels: 'infra',
        discoveredFrom: 'bd-1',
        actor: 'squad-autopilot',
      },
    });
    expect(created).toEqual({ id: 'bd-9' });
  });

  it('update / claim / close / note carry {id, actor}', async () => {
    const { engine, calls } = okEngine({});
    const svc = svcOver(engine);
    await svc.update('bd-1', { status: 'in_progress' }, 'conductor:ws1');
    await svc.claim('bd-1', 'conductor:ws1');
    await svc.close('bd-1', 'Completed', 'conductor:ws1');
    await svc.note('bd-1', 'evidence', 'conductor:ws1');
    expect(calls[0]).toMatchObject({
      op: 'update',
      input: { id: 'bd-1', status: 'in_progress', actor: 'conductor:ws1' },
    });
    expect(calls[1]).toMatchObject({ op: 'claim', input: { id: 'bd-1', actor: 'conductor:ws1' } });
    expect(calls[2]).toMatchObject({
      op: 'close',
      input: { id: 'bd-1', reason: 'Completed', actor: 'conductor:ws1' },
    });
    expect(calls[3]).toMatchObject({
      op: 'note',
      input: { id: 'bd-1', text: 'evidence', actor: 'conductor:ws1' },
    });
  });

  it('remember → {op:remember} with scope/discoveredFrom/actor, returns the wisp id', async () => {
    const { engine, calls } = okEngine({ id: 'bd-wisp' });
    const id = await svcOver(engine).remember(
      { title: 'fact', body: 'evidence', scope: 'repo', discoveredFrom: 'bd-1' },
      'agent:1',
    );
    expect(calls[0]).toMatchObject({
      op: 'remember',
      input: { title: 'fact', body: 'evidence', scope: 'repo', discoveredFrom: 'bd-1', actor: 'agent:1' },
    });
    expect(id).toBe('bd-wisp');
  });

  it('promote → {op:promote, input:{id, actor}}', async () => {
    const { engine, calls } = okEngine({});
    const ok = await svcOver(engine).promote('bd-wisp', 'human:u1');
    expect(calls[0]).toMatchObject({ op: 'promote', input: { id: 'bd-wisp', actor: 'human:u1' } });
    expect(ok).toBe(true);
  });

  it('omits the actor key when the caller passes an empty actor', async () => {
    const { engine, calls } = okEngine({});
    await svcOver(engine).claim('bd-1', '  ');
    expect((calls[0]?.input as Record<string, unknown>).actor).toBeUndefined();
  });
});

describe('issue-graph memory reads', () => {
  it('recallMemories → {op:recall_memory} and normalizes description → body', async () => {
    const { engine, calls } = okEngine([
      { id: 'bd-m1', title: 'nginx', description: 'conf.d is live', status: 'open', labels: ['memory'] },
    ]);
    const entries = await svcOver(engine).recallMemories('nginx', { scope: 'repo', limit: 5 });
    expect(calls[0]).toMatchObject({
      op: 'recall_memory',
      input: { query: 'nginx', scope: 'repo', limit: 5 },
    });
    expect(entries).toEqual([
      { id: 'bd-m1', title: 'nginx', body: 'conf.d is live', status: 'open', labels: ['memory'] },
    ]);
  });

  it('returns [] fast for an empty query without touching the transport', async () => {
    const { engine, calls } = okEngine([]);
    const entries = await svcOver(engine).recallMemories('   ');
    expect(entries).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('issue-graph durability', () => {
  it('flush → {op:flush, input:{message}} and reports the commit hash', async () => {
    const { engine, calls } = okEngine({ committed: true, hash: 'deadbeef' });
    const result = await svcOver(engine).flush('bd: sweep');
    expect(calls[0]).toMatchObject({ op: 'flush', input: { message: 'bd: sweep' } });
    expect(result).toEqual({ committed: true, hash: 'deadbeef' });
  });

  it('flush surfaces bd\'s truthful "nothing to commit" (never a fake commit)', async () => {
    const { engine } = okEngine({ committed: false, message: 'nothing to commit' });
    const result = await svcOver(engine).flush();
    expect(result.committed).toBe(false);
    expect(result.reason).toMatch(/nothing to commit/i);
  });

  it('gc → {op:gc}; a down transport yields {ran:false, reason}', async () => {
    const { engine, calls } = okEngine({});
    expect(await svcOver(engine).gc()).toEqual({ ran: true });
    expect(calls[0]).toMatchObject({ op: 'gc', input: {} });

    const { engine: downEngine } = failEngine('bd not installed');
    expect(await svcOver(downEngine).gc()).toEqual({ ran: false, reason: 'bd not installed' });
  });

  it('flush / gc thread the maintenance audit actor when the caller supplies one', async () => {
    const { engine, calls } = okEngine({ committed: true });
    const svc = svcOver(engine);
    await svc.flush('bd: sweep', 'memory-maintenance');
    await svc.gc('memory-maintenance');
    expect(calls[0]).toMatchObject({
      op: 'flush',
      input: { message: 'bd: sweep', actor: 'memory-maintenance' },
    });
    expect(calls[1]).toMatchObject({ op: 'gc', input: { actor: 'memory-maintenance' } });
  });
});

describe('issue-graph degrade law', () => {
  it('a null engine degrades every verb (reads []/null, writes false/undefined)', async () => {
    const svc = svcOver(null);
    expect(await svc.health()).toEqual({ available: false, reason: 'beads engine client not wired' });
    expect(await svc.ready()).toEqual([]);
    expect(await svc.show('bd-1')).toBeNull();
    expect(await svc.search('q')).toEqual([]);
    expect(await svc.blocked()).toEqual([]);
    expect(await svc.depTree('bd-1')).toBeNull();
    expect(await svc.depList('bd-1')).toBeNull();
    expect(await svc.stats()).toBeNull();
    expect(await svc.stale()).toEqual([]);
    expect(await svc.create({ title: 't' }, 'a')).toBeNull();
    expect(await svc.update('bd-1', { status: 'open' }, 'a')).toBe(false);
    expect(await svc.claim('bd-1', 'a')).toBe(false);
    expect(await svc.close('bd-1', 'r', 'a')).toBe(false);
    expect(await svc.note('bd-1', 'n', 'a')).toBe(false);
    expect(await svc.remember({ title: 't', body: 'b' }, 'a')).toBeUndefined();
    expect(await svc.recallMemories('q')).toEqual([]);
    expect(await svc.promote('bd-1', 'a')).toBe(false);
    expect(await svc.vcStatus()).toBeNull();
    expect((await svc.flush()).committed).toBe(false);
    expect((await svc.gc()).ran).toBe(false);
  });

  it('a truthful {ok:false} transport degrades without throwing', async () => {
    const { engine } = failEngine();
    const svc = svcOver(engine);
    expect(await svc.ready()).toEqual([]);
    expect(await svc.show('bd-1')).toBeNull();
    expect(await svc.recallMemories('q')).toEqual([]);
    expect(await svc.remember({ title: 't', body: 'b' }, 'a')).toBeUndefined();
    expect(await svc.promote('bd-1', 'a')).toBe(false);
    expect(await svc.note('bd-1', 'n', 'a')).toBe(false);
    const flush = await svc.flush();
    expect(flush.committed).toBe(false);
    expect(flush.reason).toBeTruthy();
  });

  it('even a contract-violating throw never crosses the facet', async () => {
    const { engine } = throwingEngine();
    const svc = svcOver(engine);
    expect(await svc.ready()).toEqual([]);
    expect(await svc.remember({ title: 't', body: 'b' }, 'a')).toBeUndefined();
    expect(await svc.close('bd-1', 'r', 'a')).toBe(false);
    expect((await svc.flush()).committed).toBe(false);
  });

  it('guards invalid input locally (no transport call, degrade value)', async () => {
    const { engine, calls } = okEngine({});
    const svc = svcOver(engine);
    expect(await svc.show('  ')).toBeNull();
    expect(await svc.note('bd-1', '  ', 'a')).toBe(false);
    expect(await svc.remember({ title: '', body: 'b' }, 'a')).toBeUndefined();
    expect(await svc.create({ title: '  ' }, 'a')).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it('health mirrors the engine health truthfully (up → version, down → reason)', async () => {
    const { engine } = okEngine({});
    expect(await svcOver(engine).health()).toEqual({ available: true, version: 'bd 1.0.5' });

    const downEngine: EngineClientPort = {
      ...engine,
      async health(): Promise<EngineHealth> {
        return {
          engineId: 'beads',
          transport: 'cli',
          status: 'down',
          reason: 'bd binary not found',
          checkedAt: '2026-07-21T00:00:00Z',
        };
      },
    };
    expect(await svcOver(downEngine).health()).toEqual({
      available: false,
      reason: 'bd binary not found',
    });
  });
});
