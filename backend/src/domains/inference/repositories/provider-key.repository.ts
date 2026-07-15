/**
 * `PgProviderKeyRepository` — BYOK provider-key METADATA over the persistence
 * `QueryExecutor` (`inference_provider_keys`). No ciphertext is stored here; only
 * presence, `vault_ref`, and `key_version` for rotation + routing audit.
 *
 * DEGRADE-SAFE: when the executor is unavailable, writes no-op and reads return
 * empty. All SQL is parameterized `:param` (never interpolated).
 */
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { ProviderKeyRepository } from '../ports/provider-keys.port.js';
import type { ProviderKeyRecord } from '../types.js';

export class PgProviderKeyRepository implements ProviderKeyRepository {
  constructor(
    private readonly qe: QueryExecutor,
    private readonly log: Logger,
  ) {}

  isDurable(): boolean {
    return this.qe.isAvailable();
  }

  async listForUser(userId: string): Promise<readonly ProviderKeyRecord[]> {
    if (!this.qe.isAvailable()) return [];
    try {
      const rows = await this.qe.read<QueryRow>(
        `select user_id, provider, key_version, vault_ref, last_used_at, created_at, rotated_at
           from inference_provider_keys
          where user_id = :user_id
          order by provider asc`,
        { user_id: userId },
      );
      return rows.map(mapRow);
    } catch (err) {
      this.log.warn({ err: message(err), userId }, 'provider key list failed (returning empty)');
      return [];
    }
  }

  async get(userId: string, provider: string): Promise<ProviderKeyRecord | null> {
    if (!this.qe.isAvailable()) return null;
    try {
      const row = await this.qe.one<QueryRow>(
        `select user_id, provider, key_version, vault_ref, last_used_at, created_at, rotated_at
           from inference_provider_keys
          where user_id = :user_id and provider = :provider`,
        { user_id: userId, provider },
      );
      return row ? mapRow(row) : null;
    } catch (err) {
      this.log.warn({ err: message(err), userId, provider }, 'provider key get failed');
      return null;
    }
  }

  async upsert(input: {
    readonly userId: string;
    readonly provider: string;
    readonly vaultRef?: string | null;
  }): Promise<ProviderKeyRecord | null> {
    if (!this.qe.isAvailable()) return null;
    try {
      const row = await this.qe.one<QueryRow>(
        `insert into inference_provider_keys (user_id, provider, vault_ref, created_at)
           values (:user_id, :provider, :vault_ref, now())
         on conflict (user_id, provider) do update
           set vault_ref = excluded.vault_ref
         returning user_id, provider, key_version, vault_ref, last_used_at, created_at, rotated_at`,
        { user_id: input.userId, provider: input.provider, vault_ref: input.vaultRef ?? null },
      );
      return row ? mapRow(row) : null;
    } catch (err) {
      this.log.warn({ err: message(err), userId: input.userId, provider: input.provider }, 'provider key upsert failed');
      return null;
    }
  }

  async rotate(userId: string, provider: string): Promise<ProviderKeyRecord | null> {
    if (!this.qe.isAvailable()) return null;
    try {
      const row = await this.qe.one<QueryRow>(
        `update inference_provider_keys
            set key_version = key_version + 1, rotated_at = now()
          where user_id = :user_id and provider = :provider
        returning user_id, provider, key_version, vault_ref, last_used_at, created_at, rotated_at`,
        { user_id: userId, provider },
      );
      return row ? mapRow(row) : null;
    } catch (err) {
      this.log.warn({ err: message(err), userId, provider }, 'provider key rotate failed');
      return null;
    }
  }

  async markUsed(userId: string, provider: string): Promise<void> {
    if (!this.qe.isAvailable()) return;
    try {
      await this.qe.mutate(
        `update inference_provider_keys set last_used_at = now()
          where user_id = :user_id and provider = :provider`,
        { user_id: userId, provider },
      );
    } catch (err) {
      this.log.warn({ err: message(err), userId, provider }, 'provider key markUsed failed (ignored)');
    }
  }

  async delete(userId: string, provider: string): Promise<boolean> {
    if (!this.qe.isAvailable()) return false;
    try {
      const affected = await this.qe.mutate(
        `delete from inference_provider_keys where user_id = :user_id and provider = :provider`,
        { user_id: userId, provider },
      );
      return affected > 0;
    } catch (err) {
      this.log.warn({ err: message(err), userId, provider }, 'provider key delete failed');
      return false;
    }
  }
}

function mapRow(row: QueryRow): ProviderKeyRecord {
  return {
    userId: String(row.user_id),
    provider: String(row.provider),
    keyVersion: Number(row.key_version ?? 1),
    vaultRef: row.vault_ref === null || row.vault_ref === undefined ? null : String(row.vault_ref),
    lastUsedAt: toIsoOrNull(row.last_used_at),
    createdAt: toIso(row.created_at),
    rotatedAt: toIsoOrNull(row.rotated_at),
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toIso(value);
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
