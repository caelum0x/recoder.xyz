/**
 * Tests for the memory recall FUSION — the logic that used to be inlined in
 * conductor/bundle.ts. Proves (with mocked engines, no real bd/mem0/colbert):
 *   1. it fuses beads ∪ mem0 ∪ agent-os and tags provenance.
 *   2. it dedupes identical text across stores.
 *   3. it colbert-reranks the WHOLE fused set (not just mem0).
 *   4. it uses the beads SQL fast-path, falling back to the CLI when SQL is down.
 *   5. every source is degrade-safe (a throwing/absent source contributes nothing).
 */
import { describe, it, expect, vi } from 'vitest';
import type { MemoryStore } from '@recoder/agent-memory';
import type { MemoryItem } from '@recoder/agent-os';
import { fuseRecall, type RecallEngines } from './recall.js';
import type { MemoryEntry } from '../../conductor/beads-memory.js';

function entry(id: string, title: string, description = '', labels: string[] = ['memory']): MemoryEntry {
  return { id, title, description, status: 'open', labels };
}

function makeStore(items: MemoryItem[]): MemoryStore {
  return {
    async createCandidate(c) {
      return c;
    },
    async listCandidates() {
      return [];
    },
    async upsertMemory(i) {
      return i;
    },
    async search() {
      return items;
    },
  };
}

function item(memoryId: string, title: string, body: string): MemoryItem {
  return {
    memoryId,
    scope: 'repo',
    title,
    body,
    status: 'active',
    evidence: { taskId: 't1', artifactId: 'art1' },
    createdAt: '2026-01-01T00:00:00Z',
    acceptedBy: 'reviewer',
  };
}

function baseEngines(over: Partial<RecallEngines> = {}): RecallEngines {
  return {
    queryMemories: async () => undefined,
    recallMemories: () => [],
    mem0Search: async () => ({ available: false, results: [] }),
    colbertRerank: async (_q, passages) => ({ available: false, order: passages.map((_, i) => i) }),
    ...over,
  };
}

describe('fuseRecall: fusion + provenance', () => {
  it('fuses all three stores and tags each row with its store', async () => {
    const engines = baseEngines({
      queryMemories: async () => [entry('b1', 'Deploy landmine', 'swap file needed')],
      mem0Search: async () => ({ available: true, results: [{ id: 'm1', memory: 'User prefers manual deploy', score: 0.9 }] }),
      agentOsStore: makeStore([item('a1', 'Reviewed rule', 'always fail safe')]),
    });
    const out = await fuseRecall('deploy', undefined, { userId: 'u1', limit: 10 }, engines);
    expect(out.map((m) => m.store).sort()).toEqual(['agent-os', 'beads', 'mem0']);
    expect(out.find((m) => m.store === 'beads')?.id).toBe('b1');
    expect(out.find((m) => m.store === 'mem0')?.score).toBe(0.9);
    expect(out.find((m) => m.store === 'agent-os')?.id).toBe('a1');
  });

  it('dedupes identical text across stores (first occurrence wins)', async () => {
    const engines = baseEngines({
      queryMemories: async () => [entry('b1', 'Same fact', 'body')],
      agentOsStore: makeStore([item('a1', 'Same fact', 'body')]),
    });
    const out = await fuseRecall('same', undefined, { limit: 10 }, engines);
    expect(out).toHaveLength(1);
    expect(out[0].store).toBe('beads');
  });
});

describe('fuseRecall: colbert rerank over the whole set', () => {
  it('reorders the fused list by the colbert order', async () => {
    const engines = baseEngines({
      queryMemories: async () => [entry('b1', 'first'), entry('b2', 'second')],
      colbertRerank: async () => ({ available: true, order: [1, 0] }),
    });
    const out = await fuseRecall('q', undefined, {}, engines);
    expect(out.map((m) => m.id)).toEqual(['b2', 'b1']);
  });

  it('keeps original order when colbert is down', async () => {
    const engines = baseEngines({
      queryMemories: async () => [entry('b1', 'first'), entry('b2', 'second')],
    });
    const out = await fuseRecall('q', undefined, {}, engines);
    expect(out.map((m) => m.id)).toEqual(['b1', 'b2']);
  });
});

describe('fuseRecall: beads SQL fast-path + CLI fallback', () => {
  it('uses the SQL fast-path and does NOT call the CLI when SQL answers', async () => {
    const recallMemories = vi.fn(() => [entry('c1', 'cli')]);
    const engines = baseEngines({ queryMemories: async () => [entry('b1', 'sql')], recallMemories });
    const out = await fuseRecall('q', undefined, {}, engines);
    expect(recallMemories).not.toHaveBeenCalled();
    expect(out[0].id).toBe('b1');
  });

  it('falls back to the CLI when the SQL fast-path is unavailable (undefined)', async () => {
    const recallMemories = vi.fn(() => [entry('c1', 'cli')]);
    const engines = baseEngines({ queryMemories: async () => undefined, recallMemories });
    const out = await fuseRecall('q', undefined, {}, engines);
    expect(recallMemories).toHaveBeenCalled();
    expect(out[0].id).toBe('c1');
  });

  it('passes the scope value through to the beads query', async () => {
    const queryMemories = vi.fn(async () => []);
    await fuseRecall('q', { kind: 'repo', value: 'myrepo' }, {}, baseEngines({ queryMemories }));
    expect(queryMemories).toHaveBeenCalledWith('q', { scope: 'myrepo', limit: 5 });
  });
});

describe('fuseRecall: degrade-safe', () => {
  it('returns [] for an empty query without touching any engine', async () => {
    const queryMemories = vi.fn(async () => []);
    const out = await fuseRecall('   ', undefined, {}, baseEngines({ queryMemories }));
    expect(out).toEqual([]);
    expect(queryMemories).not.toHaveBeenCalled();
  });

  it('a throwing source contributes nothing; other stores still fuse', async () => {
    const engines = baseEngines({
      queryMemories: async () => {
        throw new Error('bd exploded');
      },
      mem0Search: async () => ({ available: true, results: [{ id: 'm1', memory: 'still here' }] }),
    });
    const out = await fuseRecall('q', undefined, { userId: 'u1' }, engines);
    expect(out.map((m) => m.store)).toEqual(['mem0']);
  });

  it('does not query mem0 when there is no userId', async () => {
    const mem0Search = vi.fn(async () => ({ available: true, results: [] }));
    await fuseRecall('q', undefined, {}, baseEngines({ mem0Search }));
    expect(mem0Search).not.toHaveBeenCalled();
  });

  it('skips mem0 rows when mem0 reports unavailable', async () => {
    const engines = baseEngines({
      mem0Search: async () => ({ available: false, results: [{ id: 'm1', memory: 'ignored' }] }),
      queryMemories: async () => [entry('b1', 'kept')],
    });
    const out = await fuseRecall('q', undefined, { userId: 'u1' }, engines);
    expect(out.map((m) => m.store)).toEqual(['beads']);
  });
});
