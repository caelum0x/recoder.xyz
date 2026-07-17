/**
 * lance.adapter tests — the embedded (no-server) `VectorStorePort`:
 *   1. store/search ROUNDTRIP against a temp data dir (fake in-memory lance
 *      module with real L2 distance — no native addon required in CI),
 *   2. replace semantics (re-upserting an id never duplicates it),
 *   3. ABSENT-LANCE DEGRADE: loader resolves null → every method is a truthful
 *      no-op, `configured` flips false, `probe()` carries the reason,
 *   4. loader priority: napi addon candidate (from the injected native dir) wins
 *      over the SDK; both absent → null. Nothing throws anywhere.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryConfigSchema, type MemoryConfig } from '../config.js';
import { createLanceAdapter } from './lance.adapter.js';
import {
  createLanceModuleLoader,
  type LanceConnection,
  type LanceModule,
  type LanceRow,
  type LanceTable,
} from './lance-napi.client.js';

// ── config helper ────────────────────────────────────────────────────────────

function configWith(overrides: Partial<MemoryConfig>): MemoryConfig {
  return memoryConfigSchema.parse({
    isProduction: false,
    internalServiceKeyPresent: false,
    internalServiceKey: null,
    qdrantUrl: null,
    qdrantApiKeyPresent: false,
    qdrantApiKey: null,
    lanceDataDir: null,
    lanceNativeDir: null,
    mem0Collection: 'recoder_mem0',
    retrievalCollection: 'recoder_retrieval',
    colbertRerankUrl: null,
    mem0SidecarUrl: null,
    embedTensorzeroUrl: null,
    embedTensorzeroApiKeyPresent: false,
    embedTensorzeroApiKey: null,
    embedOpenaiApiKeyPresent: false,
    embedOpenaiApiKey: null,
    embedOpenaiBaseUrl: null,
    embedEndpoint: null,
    embedModel: 'text-embedding-3-small',
    dedupeThreshold: 0.9,
    recallLimit: 8,
    candidateTtlDays: 30,
    ...overrides,
  });
}

// ── fake in-memory lance module (real L2 distance, delete-predicate support) ─

interface FakeLance {
  module: LanceModule;
  connectedUris: string[];
  tables: Map<string, LanceRow[]>;
}

function l2(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - (b[i] ?? 0)) ** 2;
  return Math.sqrt(sum);
}

/** Parse the adapter's only predicate shape: `id_json IN ('...', '...')`. */
function idsFromPredicate(predicate: string): string[] {
  const inner = predicate.replace(/^id_json IN \(/, '').replace(/\)$/, '');
  return inner.split(', ').map((quoted) => quoted.slice(1, -1).replace(/''/g, "'"));
}

function fakeTable(store: Map<string, LanceRow[]>, name: string): LanceTable {
  return {
    async add(rows: LanceRow[]): Promise<void> {
      store.set(name, [...(store.get(name) ?? []), ...rows.map((r) => ({ ...r }))]);
    },
    async delete(predicate: string): Promise<void> {
      const ids = new Set(idsFromPredicate(predicate));
      store.set(name, (store.get(name) ?? []).filter((r) => !ids.has(r.id_json)));
    },
    vectorSearch(vector: number[]) {
      let capped = 0;
      const query = {
        limit(n: number) {
          capped = n;
          return query;
        },
        async toArray(): Promise<Array<LanceRow & { _distance?: number }>> {
          const rows = (store.get(name) ?? [])
            .map((r) => ({ ...r, _distance: l2(vector, r.vector) }))
            .sort((a, b) => a._distance - b._distance);
          return capped > 0 ? rows.slice(0, capped) : rows;
        },
      };
      return query;
    },
  };
}

function fakeLance(): FakeLance {
  const tables = new Map<string, LanceRow[]>();
  const connectedUris: string[] = [];
  const connection: LanceConnection = {
    async tableNames(): Promise<string[]> {
      return [...tables.keys()];
    },
    async openTable(name: string): Promise<LanceTable> {
      if (!tables.has(name)) throw new Error(`table '${name}' not found`);
      return fakeTable(tables, name);
    },
    async createTable(name: string, data: LanceRow[]): Promise<LanceTable> {
      tables.set(name, data.map((r) => ({ ...r })));
      return fakeTable(tables, name);
    },
  };
  return {
    connectedUris,
    tables,
    module: {
      async connect(uri: string): Promise<LanceConnection> {
        connectedUris.push(uri);
        return connection;
      },
    },
  };
}

// ── roundtrip ────────────────────────────────────────────────────────────────

describe('lance.adapter store/search roundtrip (temp dir)', () => {
  it('ensures a collection, upserts points, and searches nearest-first', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lance-adapter-'));
    const fake = fakeLance();
    const store = createLanceAdapter(configWith({ lanceDataDir: dir }), async () => fake.module);

    expect(store.configured).toBe(true);
    expect(await store.ensureCollection('memories', 3)).toBe(true);
    // The schema seed row must not survive materialization.
    expect(fake.tables.get('memories')).toEqual([]);

    const ok = await store.upsert('memories', [
      { id: 'near', vector: [1, 0, 0], payload: { text: 'closest' } },
      { id: 42, vector: [0, 1, 0], payload: { text: 'mid' } },
      { id: 'far', vector: [0, 0, 9] },
    ]);
    expect(ok).toBe(true);

    const matches = await store.search('memories', [1, 0, 0], 2);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toEqual({ id: 'near', score: 1, payload: { text: 'closest' } });
    expect(matches[1]?.id).toBe(42); // number id survives the JSON roundtrip
    expect(matches[1]?.score).toBeGreaterThan(0);
    expect(matches[1]?.score).toBeLessThan(1);

    // The connection was opened against the temp data dir (the embedded path).
    expect(fake.connectedUris).toEqual([dir]);
  });

  it('re-upserting an existing id replaces it (no duplicates)', async () => {
    const fake = fakeLance();
    const store = createLanceAdapter(configWith({ lanceDataDir: '/tmp/lance-x' }), async () => fake.module);

    await store.upsert('c', [{ id: 'a', vector: [1, 0] }]);
    await store.upsert('c', [{ id: 'a', vector: [0, 1], payload: { v: 2 } }]);

    const matches = await store.search('c', [0, 1], 10);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual({ id: 'a', score: 1, payload: { v: 2 } });
  });

  it('ensureCollection is idempotent and empty upsert is a no-op success', async () => {
    const fake = fakeLance();
    const store = createLanceAdapter(configWith({ lanceDataDir: '/tmp/lance-y' }), async () => fake.module);

    expect(await store.ensureCollection('c', 4)).toBe(true);
    expect(await store.ensureCollection('c', 4)).toBe(true);
    expect(await store.upsert('c', [])).toBe(true);
    expect(await store.search('c', [0, 0, 0, 0], 5)).toEqual([]);
  });

  it('refuses path-unsafe collection names without touching the module', async () => {
    const fake = fakeLance();
    const store = createLanceAdapter(configWith({ lanceDataDir: '/tmp/lance-z' }), async () => fake.module);

    expect(await store.ensureCollection('../evil', 3)).toBe(false);
    expect(await store.upsert('../evil', [{ id: 1, vector: [1] }])).toBe(false);
    expect(await store.search('../evil', [1], 5)).toEqual([]);
    expect(fake.connectedUris).toEqual([]);
  });
});

// ── absent-lance degrade ─────────────────────────────────────────────────────

describe('lance.adapter absent-lance degrade', () => {
  it('no data dir → truthful no-op store', async () => {
    const store = createLanceAdapter(configWith({}), async () => fakeLance().module);
    expect(store.configured).toBe(false);
    expect(await store.ensureCollection('c', 3)).toBe(false);
    expect(await store.upsert('c', [{ id: 'a', vector: [1] }])).toBe(false);
    expect(await store.search('c', [1], 5)).toEqual([]);
    const status = await store.probe();
    expect(status).toEqual({
      configured: false,
      available: false,
      reason: expect.stringContaining('no lance data dir'),
    });
  });

  it('data dir set but no napi addon / SDK → ops no-op and configured flips false', async () => {
    const store = createLanceAdapter(configWith({ lanceDataDir: '/tmp/lance-absent' }), async () => null);

    expect(store.configured).toBe(true); // optimistic until the first load attempt
    expect(await store.upsert('c', [{ id: 'a', vector: [1] }])).toBe(false);
    expect(store.configured).toBe(false); // truthful after the failed load
    expect(await store.ensureCollection('c', 3)).toBe(false);
    expect(await store.search('c', [1], 5)).toEqual([]);

    const status = await store.probe();
    expect(status.configured).toBe(true);
    expect(status.available).toBe(false);
    expect(status.reason).toMatch(/lance napi addon/);
  });

  it('a throwing connect degrades with the truthful reason (never throws)', async () => {
    const store = createLanceAdapter(configWith({ lanceDataDir: '/tmp/lance-broken' }), async () => ({
      connect: async () => {
        throw new Error('dlopen failed: wrong arch');
      },
    }));
    expect(await store.search('c', [1], 5)).toEqual([]);
    const status = await store.probe();
    expect(status.available).toBe(false);
    expect(status.reason).toContain('lance connect failed');
    expect(status.reason).toContain('wrong arch');
  });
});

// ── loader priority (napi addon → SDK → null) ────────────────────────────────

describe('createLanceModuleLoader', () => {
  it('loads the napi addon from the injected native dir and wraps its sync surface', async () => {
    const tables = new Map<string, LanceRow[]>();
    const requested: string[] = [];
    const loader = createLanceModuleLoader({
      nativeDir: '/native/dir',
      requireImpl: (id: string) => {
        requested.push(id);
        if (id !== join('/native/dir', 'lance_npm_bindings.node')) throw new Error('MODULE_NOT_FOUND');
        return {
          connect: (uri: string) => ({
            tableNames: () => [...tables.keys()],
            openTable: (name: string) =>
              tables.has(name)
                ? {
                    add: (rowsJson: string) => {
                      tables.set(name, [...(tables.get(name) ?? []), ...(JSON.parse(rowsJson) as LanceRow[])]);
                    },
                    delete: () => undefined,
                    vectorSearchToArray: (_vectorJson: string, limit: number) =>
                      JSON.stringify(
                        (tables.get(name) ?? []).slice(0, limit > 0 ? limit : undefined).map((r) => ({
                          ...r,
                          _distance: 0,
                        })),
                      ),
                  }
                : null,
            createTable: (name: string, dataJson: string) => {
              tables.set(name, JSON.parse(dataJson) as LanceRow[]);
              return {
                add: () => undefined,
                delete: () => undefined,
                vectorSearchToArray: () => '[]',
                countRows: () => 0,
              };
            },
          }),
        };
      },
    });

    const mod = await loader();
    expect(mod).not.toBeNull();
    const conn = await mod!.connect('/tmp/data');
    await conn.createTable('t', [{ id_json: '"a"', vector: [1], payload_json: '{}' }]);
    const rows = await (await conn.openTable('t')).vectorSearch([1]).limit(5).toArray();
    expect(rows).toEqual([{ id_json: '"a"', vector: [1], payload_json: '{}', _distance: 0 }]);
    expect(requested[0]).toBe(join('/native/dir', 'lance_npm_bindings.node'));
  });

  it('falls back to the @lancedb/lancedb SDK when the addon is absent', async () => {
    const connected: string[] = [];
    const loader = createLanceModuleLoader({
      nativeDir: '/native/dir',
      requireImpl: (id: string) => {
        if (id !== '@lancedb/lancedb') throw new Error('MODULE_NOT_FOUND');
        return {
          connect: async (uri: string) => {
            connected.push(uri);
            return {
              tableNames: async () => [],
              openTable: async () => {
                throw new Error('none');
              },
              createTable: async () => {
                throw new Error('none');
              },
            };
          },
        };
      },
    });

    const mod = await loader();
    expect(mod).not.toBeNull();
    await mod!.connect('/tmp/sdk-data');
    expect(connected).toEqual(['/tmp/sdk-data']);
  });

  it('resolves null (memoized) when neither surface is provisioned', async () => {
    let calls = 0;
    const loader = createLanceModuleLoader({
      requireImpl: () => {
        calls += 1;
        throw new Error('MODULE_NOT_FOUND');
      },
    });
    expect(await loader()).toBeNull();
    const callsAfterFirst = calls;
    expect(await loader()).toBeNull();
    expect(calls).toBe(callsAfterFirst); // memoized — the require walk runs once
  });
});
