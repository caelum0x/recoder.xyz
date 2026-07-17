/**
 * lance.adapter — the EMBEDDED (no-server) `VectorStorePort` over the Lance napi
 * surface. This is the default vector store when `QDRANT_URL` is absent: vectors
 * live in a local data dir (`config.lanceDataDir`), loaded in-process via
 * `lance-napi.client.ts` (napi addon → `@lancedb/lancedb` SDK → null).
 *
 * DEGRADE CONTRACT (mirrors qdrant.adapter):
 *   - no `lanceDataDir` → `configured === false`, every method a truthful no-op
 *     (`ensureCollection`/`upsert` → false, `search` → []).
 *   - data dir set but neither the napi addon nor the SDK is provisioned → the
 *     first operation records the truthful reason, `configured` flips to false,
 *     and every method no-ops. `probe()` surfaces the reason for health.
 *   - EVERY method catches its own errors → safe fallback. Nothing throws,
 *     nothing fakes success.
 *
 * Mapping: one port "collection" = one Lance table; rows carry the JSON-encoded
 * point id + payload. Lance returns L2 `_distance`; we surface a bounded
 * similarity `score = 1 / (1 + distance)` so larger is better, like Qdrant.
 */
import type { VectorDistance, VectorMatch, VectorPoint, VectorStorePort } from '../ports/vector-store.port.js';
import type { MemoryConfig } from '../config.js';
import {
  createLanceModuleLoader,
  type LanceConnection,
  type LanceModuleLoader,
  type LanceRow,
  type LanceTable,
} from './lance-napi.client.js';

/** Truthful readiness snapshot for health (never secrets, never a faked up). */
export interface LanceStoreStatus {
  /** True when a data dir is configured (the store is supposed to serve). */
  readonly configured: boolean;
  /** True only when the lance module loaded AND the data dir connected. */
  readonly available: boolean;
  /** Truthful reason when unavailable; `null` when serving. */
  readonly reason: string | null;
}

/** The embedded store: the domain port + a truthful async probe for health. */
export interface LanceVectorStore extends VectorStorePort {
  readonly backend: 'lance';
  /** Force a load/connect attempt and report truthful readiness. */
  probe(): Promise<LanceStoreStatus>;
}

/** Table names become filesystem paths — refuse anything path-unsafe. */
const SAFE_COLLECTION = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** Seed id used to materialize a table schema for `ensureCollection`. */
const SCHEMA_SEED_ID = '__lance_schema_seed__';

function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function idPredicate(idJsons: readonly string[]): string {
  const list = idJsons.map((id) => `'${escapeSqlLiteral(id)}'`).join(', ');
  return `id_json IN (${list})`;
}

function toRow(point: VectorPoint): LanceRow {
  return {
    id_json: JSON.stringify(point.id),
    vector: [...point.vector],
    payload_json: JSON.stringify(point.payload ?? {}),
  };
}

function parseId(idJson: string): string | number | null {
  try {
    const parsed: unknown = JSON.parse(idJson);
    return typeof parsed === 'string' || typeof parsed === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function parsePayload(payloadJson: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(payloadJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      return Object.keys(record).length > 0 ? record : undefined;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Build the embedded Lance adapter from the memory config. `loader` is the test
 * seam; the default lazily loads the napi addon / SDK via `lance-napi.client`.
 */
export function createLanceAdapter(config: MemoryConfig, loader?: LanceModuleLoader): LanceVectorStore {
  const dataDir = config.lanceDataDir?.trim() || null;
  const loadModule = loader ?? createLanceModuleLoader({ nativeDir: config.lanceNativeDir });

  let connection: LanceConnection | null = null;
  let failReason: string | null = null;
  let connectPromise: Promise<LanceConnection | null> | null = null;

  async function connect(): Promise<LanceConnection | null> {
    if (!dataDir) return null;
    if (connection) return connection;
    if (failReason) return null;
    if (!connectPromise) {
      connectPromise = (async () => {
        const mod = await loadModule();
        if (!mod) {
          failReason =
            'lance napi addon (lance_npm_bindings.node) not built and @lancedb/lancedb not installed — embedded vector store unavailable';
          return null;
        }
        try {
          connection = await mod.connect(dataDir);
          return connection;
        } catch (err) {
          failReason = `lance connect failed: ${err instanceof Error ? err.message : String(err)}`;
          return null;
        }
      })();
    }
    return connectPromise;
  }

  /** Open `name` if it exists; `null` when absent (never throws). */
  async function openIfExists(conn: LanceConnection, name: string): Promise<LanceTable | null> {
    const names = await conn.tableNames();
    if (!names.includes(name)) return null;
    return conn.openTable(name);
  }

  return {
    backend: 'lance',

    /**
     * True while the store is supposed to serve: a data dir is configured and no
     * load attempt has truthfully failed yet (flips false after the first one).
     */
    get configured(): boolean {
      return Boolean(dataDir) && failReason === null;
    },

    async ensureCollection(name: string, dim: number, _distance?: VectorDistance): Promise<boolean> {
      if (!SAFE_COLLECTION.test(name) || !Number.isInteger(dim) || dim <= 0) return false;
      const conn = await connect();
      if (!conn) return false;
      try {
        if (await openIfExists(conn, name)) return true;
        // Lance infers schema from data: materialize with a seed row, then drop it.
        const seed: LanceRow = {
          id_json: JSON.stringify(SCHEMA_SEED_ID),
          vector: new Array<number>(dim).fill(0),
          payload_json: '{}',
        };
        const table = await conn.createTable(name, [seed]);
        await table.delete(idPredicate([seed.id_json]));
        return true;
      } catch {
        return false;
      }
    },

    async upsert(name: string, points: VectorPoint[]): Promise<boolean> {
      if (!SAFE_COLLECTION.test(name)) return false;
      const conn = await connect();
      if (!conn) return false;
      if (!Array.isArray(points) || points.length === 0) return true;
      try {
        const rows = points.map(toRow);
        const existing = await openIfExists(conn, name);
        if (!existing) {
          await conn.createTable(name, rows);
          return true;
        }
        // Replace semantics: delete the ids being written, then add.
        await existing.delete(idPredicate([...new Set(rows.map((r) => r.id_json))]));
        await existing.add(rows);
        return true;
      } catch {
        return false;
      }
    },

    async search(name: string, vector: number[], topK: number): Promise<VectorMatch[]> {
      if (!SAFE_COLLECTION.test(name)) return [];
      if (!Array.isArray(vector) || vector.length === 0) return [];
      const conn = await connect();
      if (!conn) return [];
      try {
        const table = await openIfExists(conn, name);
        if (!table) return [];
        const limit = topK > 0 ? topK : 10;
        const rows = await table.vectorSearch([...vector]).limit(limit).toArray();
        const matches: VectorMatch[] = [];
        for (const row of rows.slice(0, limit)) {
          const id = parseId(row.id_json);
          if (id === null) continue; // malformed row — skip, never fabricate
          const distance = typeof row._distance === 'number' ? Math.max(0, row._distance) : 0;
          const payload = parsePayload(row.payload_json);
          matches.push({ id, score: 1 / (1 + distance), ...(payload ? { payload } : {}) });
        }
        return matches;
      } catch {
        return [];
      }
    },

    async probe(): Promise<LanceStoreStatus> {
      if (!dataDir) {
        return {
          configured: false,
          available: false,
          reason: 'no lance data dir configured (LANCE_DATA_DIR unset and QDRANT_URL absent)',
        };
      }
      const conn = await connect();
      return { configured: true, available: Boolean(conn), reason: failReason };
    },
  };
}
