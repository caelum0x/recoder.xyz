/**
 * `DeviceGrantRepository` — the concrete {@link DeviceGrantStore} over the
 * shared persistence {@link QueryExecutor}.
 *
 * Backs the RFC-8628 CLI device flow (`identity.device_grant`). The raw device
 * code is NEVER stored — only `sha256(deviceCode)` (looked up on the polling
 * path) and the short human `user_code` (unique; looked up on the browser
 * approval path). Status walks `pending → approved → consumed` (single-use) or
 * `→ expired`.
 *
 * Every method binds named `:param` SQL through the executor — no string
 * interpolation, no direct `pg` dependency (ARCHITECTURE §5 persistence seam).
 * State transitions (`approve`/`consume`) are guarded in the `WHERE` clause so
 * they are atomic single-shot transitions: a row only moves `pending→approved`
 * once and `approved→consumed` once, which is what makes the exchange path
 * race-safe.
 */
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { DeviceGrant, DeviceGrantStatus } from '../types.js';
import type { DeviceGrantStore, NewDeviceGrantRecord } from '../ports/device-flow.port.js';

const TABLE = 'identity.device_grant';

/** The transitions that are still "live" (eligible to be expired). */
const LIVE_STATUSES: readonly DeviceGrantStatus[] = ['pending', 'approved'];

export class DeviceGrantRepository implements DeviceGrantStore {
  constructor(
    private readonly executor: QueryExecutor,
    private readonly log: Logger,
  ) {}

  async create(record: NewDeviceGrantRecord): Promise<DeviceGrant> {
    const row = await this.executor.one<QueryRow>(
      `insert into ${TABLE}
         (id, device_code_hash, user_code, status, scopes, client_id, interval_seconds, expires_at)
       values
         (:id, :device_code_hash, :user_code, 'pending', :scopes::jsonb, :client_id, :interval_seconds, :expires_at)
       returning *`,
      {
        id: record.id,
        device_code_hash: record.deviceCodeHash,
        user_code: record.userCode,
        scopes: JSON.stringify(record.scopes ?? []),
        client_id: record.clientId,
        interval_seconds: record.intervalSeconds,
        expires_at: record.expiresAt.toISOString(),
      },
    );
    if (!row) {
      // Should be unreachable (INSERT ... RETURNING always yields a row on success).
      throw new Error('device_grant insert returned no row');
    }
    return mapGrant(row);
  }

  async findByDeviceCodeHash(deviceCodeHash: string): Promise<DeviceGrant | null> {
    const row = await this.executor.one<QueryRow>(
      `select * from ${TABLE} where device_code_hash = :hash order by created_at desc limit 1`,
      { hash: deviceCodeHash },
    );
    return row ? mapGrant(row) : null;
  }

  async findByUserCode(userCode: string): Promise<DeviceGrant | null> {
    const row = await this.executor.one<QueryRow>(
      `select * from ${TABLE} where user_code = :user_code`,
      { user_code: userCode },
    );
    return row ? mapGrant(row) : null;
  }

  async approve(id: string, userId: string): Promise<boolean> {
    // Only a still-pending, unexpired grant can be approved — makes approval a
    // single atomic transition even under concurrent browser submits.
    const count = await this.executor.mutate(
      `update ${TABLE}
         set user_id = :user_id, status = 'approved', approved_at = now()
       where id = :id and status = 'pending' and expires_at > now()`,
      { id, user_id: userId },
    );
    return count > 0;
  }

  async deny(id: string, userId: string): Promise<boolean> {
    // Only a still-pending, unexpired grant can be denied — a single atomic
    // transition so a deny can't race an approve into an inconsistent state.
    const count = await this.executor.mutate(
      `update ${TABLE}
         set user_id = :user_id, status = 'denied', approved_at = now()
       where id = :id and status = 'pending' and expires_at > now()`,
      { id, user_id: userId },
    );
    return count > 0;
  }

  async consume(id: string): Promise<boolean> {
    // Single-use: only an approved grant transitions to consumed, and only once.
    const count = await this.executor.mutate(
      `update ${TABLE} set status = 'consumed' where id = :id and status = 'approved'`,
      { id },
    );
    return count > 0;
  }

  async touchPolled(id: string): Promise<void> {
    try {
      await this.executor.mutate(`update ${TABLE} set last_polled_at = now() where id = :id`, { id });
    } catch (err) {
      // Best-effort: a failed poll-timestamp update must never break polling.
      this.log.warn(
        { err: err instanceof Error ? err.message : String(err), id },
        'device_grant touchPolled failed (ignored)',
      );
    }
  }

  async expireStale(now: Date = new Date()): Promise<number> {
    return this.executor.mutate(
      `update ${TABLE}
         set status = 'expired'
       where expires_at <= :now and status = any(:live::text[])`,
      { now: now.toISOString(), live: LIVE_STATUSES },
    );
  }
}

/** Map a raw `device_grant` row to the {@link DeviceGrant} domain entity. */
function mapGrant(row: QueryRow): DeviceGrant {
  return {
    id: String(row.id),
    deviceCodeHash: String(row.device_code_hash),
    userCode: String(row.user_code),
    userId: row.user_id == null ? null : String(row.user_id),
    status: String(row.status) as DeviceGrantStatus,
    scopes: parseScopes(row.scopes),
    clientId: String(row.client_id),
    intervalSeconds: Number(row.interval_seconds),
    lastPolledAt: toDate(row.last_polled_at),
    approvedAt: toDate(row.approved_at),
    expiresAt: toDate(row.expires_at) ?? new Date(0),
    createdAt: toDate(row.created_at) ?? new Date(),
  };
}

/** jsonb `scopes` arrives as a parsed array (node-postgres) or, defensively, a JSON string. */
function parseScopes(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Construct the repository over the shared executor (RepositoryFactory shape). */
export function createDeviceGrantRepository(executor: QueryExecutor, log: Logger): DeviceGrantRepository {
  return new DeviceGrantRepository(executor, log);
}
