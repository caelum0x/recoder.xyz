/**
 * `PgApiKeyStore` — the DB-backed {@link ApiKeyStore} over
 * `identity.platform_api_key` (migration `0003_identity_keys.sql`). This is the
 * ONLY place the `sk_` key feature touches Postgres; the {@link ApiKeyService}
 * depends on the {@link ApiKeyStore} port, never on this class or `pg`.
 *
 * Security invariants upheld here:
 *  - The raw key is NEVER persisted — only `key_hash` (sha256(pepper||raw)) + an
 *    indexed `key_prefix` reach a column. Hashing happens in the service; the
 *    store receives an already-hashed {@link NewApiKeyRecord}.
 *  - Every query is parameterized `:param` SQL through the persistence
 *    {@link QueryExecutor} (no string interpolation, no RLS — app-layer scoping
 *    via `WHERE user_id = :user_id`).
 *  - `revoke`/`touchLastUsed` are best-effort and never throw into the hot
 *    validation path.
 */
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { ApiKeyStore, NewApiKeyRecord } from '../ports/api-key.port.js';
import type { PlatformApiKey } from '../types.js';

const TABLE = 'identity.platform_api_key';

export class PgApiKeyStore implements ApiKeyStore {
  constructor(
    private readonly executor: QueryExecutor,
    private readonly log: Logger,
  ) {}

  /** True when the underlying pool is connectable (drives truthful health). */
  isAvailable(): boolean {
    return this.executor.isAvailable();
  }

  async insert(record: NewApiKeyRecord): Promise<PlatformApiKey> {
    const row = await this.executor.one<QueryRow>(
      `insert into ${TABLE}
         (id, user_id, org_id, name, key_prefix, key_hash, scopes, expires_at, created_at)
       values
         (:id, :user_id, :org_id, :name, :key_prefix, :key_hash, :scopes::jsonb, :expires_at, now())
       returning *`,
      {
        id: record.id,
        user_id: record.userId,
        org_id: record.orgId ?? null,
        name: record.name,
        key_prefix: record.keyPrefix,
        key_hash: record.keyHash,
        scopes: JSON.stringify([...record.scopes]),
        expires_at: record.expiresAt ?? null,
      },
    );
    if (!row) {
      // A returning-less insert is an infra fault, not an auth failure — surface it.
      throw new Error('platform_api_key insert returned no row');
    }
    return mapRow(row);
  }

  async findByPrefix(keyPrefix: string): Promise<readonly PlatformApiKey[]> {
    const rows = await this.executor.read<QueryRow>(
      `select * from ${TABLE}
       where key_prefix = :key_prefix and revoked_at is null`,
      { key_prefix: keyPrefix },
    );
    return rows.map(mapRow);
  }

  async listForUser(userId: string): Promise<readonly PlatformApiKey[]> {
    const rows = await this.executor.read<QueryRow>(
      `select * from ${TABLE}
       where user_id = :user_id
       order by created_at desc`,
      { user_id: userId },
    );
    return rows.map(mapRow);
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    // Owner-scoped + idempotent: only an un-revoked row owned by the caller flips.
    const count = await this.executor.mutate(
      `update ${TABLE}
         set revoked_at = now()
       where id = :id and user_id = :user_id and revoked_at is null`,
      { id, user_id: userId },
    );
    return count > 0;
  }

  async touchLastUsed(id: string): Promise<void> {
    // Best-effort: a failed touch must never fail a validation. Swallow + log.
    try {
      await this.executor.mutate(
        `update ${TABLE} set last_used_at = now() where id = :id`,
        { id },
      );
    } catch (err) {
      this.log.warn({ err: msg(err), id }, 'api-key touchLastUsed failed (ignored)');
    }
  }
}

/** Map a raw `identity.platform_api_key` row to the domain entity. */
function mapRow(row: QueryRow): PlatformApiKey {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    ...(row.org_id != null ? { orgId: String(row.org_id) } : {}),
    name: String(row.name),
    keyPrefix: String(row.key_prefix),
    keyHash: String(row.key_hash),
    scopes: parseScopes(row.scopes),
    lastUsedAt: toDate(row.last_used_at),
    expiresAt: toDate(row.expires_at),
    revokedAt: toDate(row.revoked_at),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

/** jsonb `scopes` comes back as a parsed array from pg, or a string in some drivers. */
function parseScopes(raw: unknown): readonly string[] {
  if (Array.isArray(raw)) return raw.map((s) => String(s));
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((s) => String(s)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toDate(raw: unknown): Date | null {
  if (raw == null) return null;
  if (raw instanceof Date) return raw;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
