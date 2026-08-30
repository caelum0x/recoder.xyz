/**
 * Embedded SQLite implementation of the canonical KvStore. It shares the
 * installed desktop's state-of-record file, making every existing KV consumer
 * (remote sessions, governed skill trust/evidence, idempotency, compatibility
 * stores) restart-survivable without requiring Postgres.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import type { Logger } from '../../../shared/logger.js';
import type { KvSetOptions, KvStore } from '../ports/kv-store.port.js';
import type { KvEntry } from '../types.js';

interface ValueRow {
  value: string;
  expires_at: number | null;
}

interface ListRow extends ValueRow {
  namespace: string;
  key: string;
  version: number;
  updated_at: number;
}

export type SqliteKvStore = KvStore & { close(): void };

export function createSqliteKvStore(path: string): SqliteKvStore {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(
    `create table if not exists core_kv_store (
       namespace text not null,
       key text not null,
       value text not null,
       expires_at integer,
       version integer not null default 1,
       updated_at integer not null,
       primary key (namespace, key)
     );
     create index if not exists core_kv_store_expiry on core_kv_store(expires_at);`,
  );

  const remove = db.prepare(`delete from core_kv_store where namespace = ? and key = ?`);

  async function get(namespace: string, key: string): Promise<unknown | null> {
    const row = db.prepare<[string, string], ValueRow>(
      `select value, expires_at from core_kv_store where namespace = ? and key = ?`,
    ).get(namespace, key);
    if (!row) return null;
    if (row.expires_at != null && row.expires_at <= Date.now()) {
      remove.run(namespace, key);
      return null;
    }
    return JSON.parse(row.value) as unknown;
  }

  async function set(
    namespace: string,
    key: string,
    value: unknown,
    options?: KvSetOptions,
  ): Promise<void> {
    const now = Date.now();
    const expiresAt = options?.ttlMs != null ? now + options.ttlMs : null;
    db.prepare(
      `insert into core_kv_store (namespace, key, value, expires_at, version, updated_at)
       values (?, ?, ?, ?, 1, ?)
       on conflict(namespace, key) do update set
         value = excluded.value,
         expires_at = excluded.expires_at,
         version = core_kv_store.version + 1,
         updated_at = excluded.updated_at`,
    ).run(namespace, key, JSON.stringify(value ?? null), expiresAt, now);
  }

  return {
    get,
    async getJson<T>(namespace: string, key: string): Promise<T | null> {
      return await get(namespace, key) as T | null;
    },
    set,
    async setJson<T>(namespace: string, key: string, value: T, options?: KvSetOptions) {
      await set(namespace, key, value, options);
    },
    async delete(namespace: string, key: string) {
      remove.run(namespace, key);
    },
    async list(namespace: string): Promise<readonly KvEntry[]> {
      const now = Date.now();
      db.prepare(`delete from core_kv_store where expires_at is not null and expires_at <= ?`).run(now);
      return db.prepare<[string], ListRow>(
        `select namespace, key, value, expires_at, version, updated_at
           from core_kv_store
          where namespace = ?
          order by key`,
      ).all(namespace).map(row => ({
        namespace: row.namespace,
        key: row.key,
        value: JSON.parse(row.value) as unknown,
        expiresAt: row.expires_at == null ? null : new Date(row.expires_at).toISOString(),
        version: row.version,
        updatedAt: new Date(row.updated_at).toISOString(),
      }));
    },
    isDurable: () => true,
    close() {
      if (db.open) db.close();
    },
  };
}

export function tryCreateSqliteKvStore(path: string, logger: Logger): SqliteKvStore | null {
  try {
    return createSqliteKvStore(path);
  } catch (error) {
    logger.warn(
      { path, error: error instanceof Error ? error.message : String(error) },
      'embedded SQLite KV failed to open — falling back to the configured database path',
    );
    return null;
  }
}
