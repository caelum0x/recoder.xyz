/**
 * `ColbertLoopbackAdapter` — degrade-safe contract + the real `/rerank` wire
 * parsing. No real spawn (scripted supervisor); fetch stubbed so no network.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { ColbertLoopbackAdapter } from './colbert-loopback.adapter.js';
import { FakeSupervisor, silentLog, stubFetch } from './test-support.js';
import { up } from '../../types.js';
import type { DaemonAdapterConfig } from './daemon-adapter-base.js';

const enabled: DaemonAdapterConfig = {
  enabled: true,
  externalUrl: null,
  binOverride: null,
  listenAddr: '127.0.0.1:8893',
};

afterEach(() => vi.restoreAllMocks());

describe('ColbertLoopbackAdapter (degrade-safe)', () => {
  it('reports down health when the supervisor has no binding', async () => {
    const adapter = new ColbertLoopbackAdapter(new FakeSupervisor(), enabled, silentLog);
    const health = await adapter.health();
    expect(health.status).toBe('down');
    expect(health.engineId).toBe('colbert');
    expect(health.reason).toBeTruthy();
  });

  it('reports down "disabled" when disabled, without touching the supervisor', async () => {
    const sup = new FakeSupervisor();
    const adapter = new ColbertLoopbackAdapter(sup, { ...enabled, enabled: false }, silentLog);
    const health = await adapter.health();
    expect(health.status).toBe('down');
    expect(health.reason).toBe('disabled');
    await adapter.start();
    expect(sup.ensureStartedCalls).toBe(0);
  });

  it('invoke degrades to {ok:false} when the daemon cannot bind', async () => {
    const adapter = new ColbertLoopbackAdapter(new FakeSupervisor(), enabled, silentLog);
    const res = await adapter.invoke({ op: 'rerank', input: { query: 'q', passages: ['a', 'b'] } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('engine_down');
  });

  it('start/stop never throw and stop delegates to the supervisor', async () => {
    const sup = new FakeSupervisor();
    const adapter = new ColbertLoopbackAdapter(sup, enabled, silentLog);
    await expect(adapter.start()).resolves.toBeUndefined();
    await expect(adapter.stop()).resolves.toBeUndefined();
    expect(sup.stopped).toContain('colbert');
  });
});

describe('ColbertLoopbackAdapter (real /rerank wire)', () => {
  const bound = new FakeSupervisor({
    handle: { engineId: 'colbert', mode: 'spawned', baseUrl: 'http://127.0.0.1:8893' },
    health: up('colbert', 'daemon'),
  });

  it('reorders passages by the returned permutation', async () => {
    stubFetch(200, { results: [{ index: 1, score: 9.2 }, { index: 0, score: 3.1 }] });
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({ op: 'rerank', input: { query: 'q', passages: ['a', 'b'] } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const value = res.value as { available: boolean; order: number[]; passages: string[] };
      expect(value.available).toBe(true);
      expect(value.order).toEqual([1, 0]);
      expect(value.passages).toEqual(['b', 'a']);
    }
  });

  it('degrades to identity order on a malformed permutation', async () => {
    stubFetch(200, { results: [{ index: 5, score: 1 }] }); // out-of-range for 2 passages
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({ op: 'rerank', input: { query: 'q', passages: ['a', 'b'] } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const value = res.value as { available: boolean; order: number[] };
      expect(value.available).toBe(false);
      expect(value.order).toEqual([0, 1]);
    }
  });

  it('degrades to identity order on a 503 (deps absent)', async () => {
    stubFetch(503, { error: 'rerank unavailable' });
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({ op: 'rerank', input: { query: 'q', passages: ['a', 'b'] } });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.value as { available: boolean }).available).toBe(false);
  });

  it('rejects an unknown op truthfully', async () => {
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({ op: 'nope', input: { query: 'q', passages: [] } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('unknown_op');
  });
});

describe('ColbertLoopbackAdapter (index management + batch)', () => {
  const bound = new FakeSupervisor({
    handle: { engineId: 'colbert', mode: 'spawned', baseUrl: 'http://127.0.0.1:8893' },
    health: up('colbert', 'daemon'),
  });

  it('rerank.batch folds per-query results back onto input items by query_index', async () => {
    stubFetch(200, {
      results: [
        { query_index: 1, results: [{ index: 0, score: 5 }, { index: 1, score: 1 }] },
        { query_index: 0, results: [{ index: 1, score: 9 }, { index: 0, score: 2 }] },
      ],
    });
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({
      op: 'rerank.batch',
      input: {
        batch: [
          { query: 'q0', passages: ['a', 'b'] },
          { query: 'q1', passages: ['c', 'd'] },
        ],
      },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const value = res.value as {
        available: boolean;
        results: { order: number[]; passages: string[] }[];
      };
      expect(value.available).toBe(true);
      // query 0 uses query_index:0 → order [1,0] → ['b','a']
      expect(value.results[0].order).toEqual([1, 0]);
      expect(value.results[0].passages).toEqual(['b', 'a']);
      // query 1 uses query_index:1 → order [0,1] → ['c','d']
      expect(value.results[1].order).toEqual([0, 1]);
      expect(value.results[1].passages).toEqual(['c', 'd']);
    }
  });

  it('rerank.batch degrades every item to identity order on a 503', async () => {
    stubFetch(503, { error: 'rerank unavailable' });
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({
      op: 'rerank.batch',
      input: { batch: [{ query: 'q', passages: ['a', 'b'] }] },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const value = res.value as { available: boolean; results: { order: number[] }[] };
      expect(value.available).toBe(false);
      expect(value.results[0].order).toEqual([0, 1]);
    }
  });

  it('rerank.batch degrades a malformed item to identity without failing the batch', async () => {
    stubFetch(200, { results: [{ query_index: 0, results: [{ index: 9, score: 1 }] }] });
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({
      op: 'rerank.batch',
      input: { batch: [{ query: 'q', passages: ['a', 'b'] }] },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const value = res.value as { available: boolean; results: { order: number[] }[] };
      expect(value.available).toBe(true);
      expect(value.results[0].order).toEqual([0, 1]);
    }
  });

  it('collections.list normalizes the wire summary into typed fields', async () => {
    stubFetch(200, {
      index_root: '/idx',
      collections: [{ name: 'docs', documents: 3, embeddings: 42, partitions: 8, chunks: 1, bytes: 900 }],
      reason: null,
    });
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({ op: 'collections.list', input: {} });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const value = res.value as {
        indexRoot: string;
        collections: { name: string; documents: number; bytes: number }[];
      };
      expect(value.indexRoot).toBe('/idx');
      expect(value.collections[0]).toMatchObject({ name: 'docs', documents: 3, bytes: 900 });
    }
  });

  it('collections.create validates input before any HTTP call', async () => {
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({
      op: 'collections.create',
      input: { name: 'docs', passages: [] },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
  });

  it('collections.create surfaces a 503 truthfully (deps absent)', async () => {
    stubFetch(503, { error: 'index build unavailable' });
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({
      op: 'collections.create',
      input: { name: 'docs', passages: ['a', 'b'] },
    });
    expect(res.ok).toBe(false);
  });

  it('collections.stats returns the sidecar body on success', async () => {
    stubFetch(200, { name: 'docs', documents: 3, embeddings: 42, exists: true });
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({ op: 'collections.stats', input: { name: 'docs' } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value).toMatchObject({ name: 'docs', exists: true });
  });

  it('collections.drop maps a 404 into a truthful failure', async () => {
    stubFetch(404, { error: 'collection not found: docs' });
    const adapter = new ColbertLoopbackAdapter(bound, enabled, silentLog);
    const res = await adapter.invoke({ op: 'collections.drop', input: { name: 'docs' } });
    expect(res.ok).toBe(false);
  });
});
