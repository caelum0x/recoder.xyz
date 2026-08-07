/**
 * `KvStoreRepository` — the DB-backed `KvStore` over `core.kv_store`. REPLACES
 * the deleted JSON `loadStore`/`saveStore` + `data/*.json` files.
 *
 * Degrade-safe: when the executor is unavailable (no pool) it transparently
 * falls back to an in-process `Map` so callers keep working within the process
 * lifetime; `isDurable()` reports the truth (false in fallback). TTL is enforced
 * on read (lazy expiry) and swept opportunistically.
 */
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../ports/query-executor.port.js';
import type { KvSetOptions, KvStore } from '../ports/kv-store.port.js';
import type { KvEntry, QueryRow } from '../types.js';

interface FallbackEntry {
  value: unknown;
  expiresAt: number | null;
  version: number;
  updatedAt: string;
}

export class KvStoreRepository implements KvStore {
  /** In-memory fallback used only when the DB path is unavailable. */
  private readonly fallback = new Map<string, Map<string, FallbackEntry>>();

  constructor(
    private readonly executor: QueryExecutor,
    private readonly log: Logger,
  ) {}

  isDurable(): boolean {
    return this.executor.isAvailable();
  }

  async get(namespace: string, key: string): Promise<unknown | null> {
    if (!this.executor.isAvailable()) return this.fallbackGet(namespace, key);
    try {
      const row = await this.executor.one<QueryRow>(
        `select value, expires_at from core.kv_store
         where namespace = :namespace and key = :key`,
        { namespace, key },
      );
      if (!row) return null;
      if (isExpired(row.expires_at)) {
        void this.delete(namespace, key);
        return null;
      }
      return row.value ?? null;
    } catch (err) {
      // The pool is AVAILABLE but the read faulted (transient). Do NOT mask it
      // with the in-memory fallback — that would make a present durable key look
      // absent. Surface the fault so the caller learns the durable read failed.
      this.log.warn({ err: msg(err), namespace, key }, 'kv get failed (durable read error surfaced)');
      throw err;
    }
  }

  async getJson<T>(namespace: string, key: string): Promise<T | null> {
    return (await this.get(namespace, key)) as T | null;
  }

  async set(namespace: string, key: string, value: unknown, options?: KvSetOptions): Promise<void> {
    const expiresSql = options?.ttlMs ? `now() + (:ttl_ms || ' milliseconds')::interval` : 'null';
    if (!this.executor.isAvailable()) {
      this.fallbackSet(namespace, key, value, options);
      return;
    }
    try {
      await this.executor.mutate(
        `insert into core.kv_store (namespace, key, value, expires_at, version, updated_at)
         values (:namespace, :key, :value::jsonb, ${expiresSql}, 1, now())
         on conflict (namespace, key) do update
           set value = excluded.value,
               expires_at = excluded.expires_at,
               version = core.kv_store.version + 1,
               updated_at = now()`,
        {
          namespace,
          key,
          value: JSON.stringify(value ?? null),
          ...(options?.ttlMs ? { ttl_ms: String(options.ttlMs) } : {}),
        },
      );
    } catch (err) {
      // The pool is AVAILABLE but the write faulted (transient). Do NOT swallow
      // it into the in-memory fallback: a durable write (sk_ keys, locks,
      // idempotency markers) would silently become memory-only while isDurable()
      // still reports true. Surface the fault so the caller learns it failed.
      this.log.warn({ err: msg(err), namespace, key }, 'kv set failed (durable write error surfaced)');
      throw err;
    }
  }

  async setJson<T>(namespace: string, key: string, value: T, options?: KvSetOptions): Promise<void> {
    return this.set(namespace, key, value, options);
  }

  async delete(namespace: string, key: string): Promise<void> {
    this.fallback.get(namespace)?.delete(key);
    if (!this.executor.isAvailable()) return;
    try {
      await this.executor.mutate(
        `delete from core.kv_store where namespace = :namespace and key = :key`,
        { namespace, key },
      );
    } catch (err) {
      this.log.warn({ err: msg(err), namespace, key }, 'kv delete failed (ignored)');
    }
  }

  async list(namespace: string): Promise<readonly KvEntry[]> {
    if (!this.executor.isAvailable()) return this.fallbackList(namespace);
    try {
      const rows = await this.executor.read<QueryRow>(
        `select namespace, key, value, expires_at, version, updated_at
         from core.kv_store
         where namespace = :namespace
           and (expires_at is null or expires_at > now())
         order by key`,
        { namespace },
      );
      return rows.map((r) => ({
        namespace: String(r.namespace),
        key: String(r.key),
        value: r.value ?? null,
        expiresAt: r.expires_at ? new Date(r.expires_at as string).toISOString() : null,
        version: Number(r.version ?? 1),
        updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : new Date().toISOString(),
      }));
    } catch (err) {
      this.log.warn({ err: msg(err), namespace }, 'kv list failed');
      // Do NOT mask a transient durable read fault with the (empty) in-memory
      // fallback — that makes present durable keys look ABSENT and callers act on
      // a false empty. The fallback serves ONLY the explicit isAvailable()=false
      // degraded path above; a fault while available is surfaced, mirroring
      // get(). (recoder-6yxg)
      throw err;
    }
  }

  // --- in-memory fallback (degraded mode) ---

  private fallbackGet(namespace: string, key: string): unknown | null {
    const entry = this.fallback.get(namespace)?.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.fallback.get(namespace)?.delete(key);
      return null;
    }
    return entry.value ?? null;
  }

  private fallbackSet(namespace: string, key: string, value: unknown, options?: KvSetOptions): void {
    let ns = this.fallback.get(namespace);
    if (!ns) {
      ns = new Map();
      this.fallback.set(namespace, ns);
    }
    const prior = ns.get(key);
    ns.set(key, {
      value,
      expiresAt: options?.ttlMs ? Date.now() + options.ttlMs : null,
      version: (prior?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    });
  }

  private fallbackList(namespace: string): readonly KvEntry[] {
    const ns = this.fallback.get(namespace);
    if (!ns) return [];
    const now = Date.now();
    const entries: KvEntry[] = [];
    for (const [key, entry] of ns) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) continue;
      entries.push({
        namespace,
        key,
        value: entry.value ?? null,
        expiresAt: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : null,
        version: entry.version,
        updatedAt: entry.updatedAt,
      });
    }
    return entries.sort((a, b) => a.key.localeCompare(b.key));
  }
}

function isExpired(expiresAt: unknown): boolean {
  if (!expiresAt) return false;
  const ts = new Date(expiresAt as string).getTime();
  return Number.isFinite(ts) && ts <= Date.now();
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
