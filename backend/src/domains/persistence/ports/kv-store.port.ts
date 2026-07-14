/**
 * `KvStore` — the namespaced key/value contract that REPLACES the deleted JSON
 * `loadStore`/`saveStore`. Backed by `core.kv_store` (JSONB values, per-namespace,
 * optional TTL), it is degrade-safe: with no pool it falls back to an in-memory
 * map and reports the impairment truthfully rather than faking a write.
 *
 * Two surfaces exist:
 *  - the async DB-backed contract below (the canonical port), and
 *  - a SYNC compatibility facade (`kv-compat.ts`) that preserves the exact
 *    `loadStore(name, default) -> object` / `saveStore(name, object)` /
 *    `debouncedSave(name, object, ms)` signatures the legacy consumers used,
 *    implemented as an in-memory cache hydrated from the KvStore with async
 *    write-through.
 */
import type { KvEntry } from '../types.js';

/** Options for a write. */
export interface KvSetOptions {
  /** Time-to-live in milliseconds; the row expires after now()+ttl. */
  readonly ttlMs?: number;
}

/** The async, DB-backed namespaced KV contract. */
export interface KvStore {
  /** Read a raw JSON value, or `null` when absent / expired. */
  get(namespace: string, key: string): Promise<unknown | null>;
  /** Read + parse a typed JSON value, or `null` when absent / expired. */
  getJson<T>(namespace: string, key: string): Promise<T | null>;
  /** Upsert a raw JSON value (optionally with a TTL). */
  set(namespace: string, key: string, value: unknown, options?: KvSetOptions): Promise<void>;
  /** Upsert a typed JSON value (optionally with a TTL). */
  setJson<T>(namespace: string, key: string, value: T, options?: KvSetOptions): Promise<void>;
  /** Delete one entry; resolves whether or not it existed. */
  delete(namespace: string, key: string): Promise<void>;
  /** List all live (non-expired) entries in a namespace. */
  list(namespace: string): Promise<readonly KvEntry[]>;
  /** True when the DB path is available (drives truthful health). */
  isDurable(): boolean;
}
