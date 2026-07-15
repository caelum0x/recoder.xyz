/**
 * `PgUsageLedgerRepository` + `PgDeliveryOutcomeRepository` — the durable token/
 * cost ledger + the delivery-outcome audit trail over the persistence
 * `QueryExecutor` (`inference_usage_ledger` / `inference_delivery_outcome`).
 *
 * DEGRADE-SAFE: when the executor is unavailable, appends no-op (returning null)
 * and reads return empty/zero. Parameterized `:param` throughout.
 */
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type {
  DeliveryOutcomeRepository,
  UsageLedgerRepository,
} from '../ports/usage-ledger.port.js';
import type {
  DeliveryOutcomeInput,
  DeliveryOutcomeRecord,
  DeliveryStatus,
  DeliveryTier,
  UsageLedgerInput,
  UsageLedgerRecord,
} from '../types.js';

const LEDGER_COLUMNS = `id, user_id, model, provider, input_tokens, output_tokens,
  total_tokens, cost_micro_usd, tier, inference_id, created_at`;

export class PgUsageLedgerRepository implements UsageLedgerRepository {
  constructor(
    private readonly qe: QueryExecutor,
    private readonly log: Logger,
  ) {}

  isDurable(): boolean {
    return this.qe.isAvailable();
  }

  async append(input: UsageLedgerInput): Promise<UsageLedgerRecord | null> {
    if (!this.qe.isAvailable()) return null;
    try {
      const row = await this.qe.one<QueryRow>(
        `insert into inference_usage_ledger
           (user_id, model, provider, input_tokens, output_tokens, total_tokens,
            cost_micro_usd, tier, inference_id, created_at)
         values
           (:user_id, :model, :provider, :input_tokens, :output_tokens, :total_tokens,
            :cost_micro_usd, :tier, :inference_id, now())
         returning ${LEDGER_COLUMNS}`,
        {
          user_id: input.userId ?? null,
          model: input.model,
          provider: input.provider ?? null,
          input_tokens: input.usage.inputTokens,
          output_tokens: input.usage.outputTokens,
          total_tokens: input.usage.totalTokens,
          cost_micro_usd: input.costMicroUsd,
          tier: input.tier,
          inference_id: input.inferenceId ?? null,
        },
      );
      return row ? mapLedgerRow(row) : null;
    } catch (err) {
      this.log.warn({ err: message(err), model: input.model }, 'usage ledger append failed (ignored)');
      return null;
    }
  }

  async recentForUser(userId: string, limit = 50): Promise<readonly UsageLedgerRecord[]> {
    if (!this.qe.isAvailable()) return [];
    try {
      const rows = await this.qe.read<QueryRow>(
        `select ${LEDGER_COLUMNS} from inference_usage_ledger
          where user_id = :user_id order by created_at desc limit :limit`,
        { user_id: userId, limit: Math.max(1, Math.min(limit, 500)) },
      );
      return rows.map(mapLedgerRow);
    } catch (err) {
      this.log.warn({ err: message(err), userId }, 'usage ledger read failed (returning empty)');
      return [];
    }
  }

  async totalsForUser(
    userId: string,
    sinceIso?: string,
  ): Promise<{
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly costMicroUsd: number;
    readonly calls: number;
  }> {
    const zero = { inputTokens: 0, outputTokens: 0, totalTokens: 0, costMicroUsd: 0, calls: 0 };
    if (!this.qe.isAvailable()) return zero;
    try {
      const params: Record<string, unknown> = { user_id: userId };
      let where = 'where user_id = :user_id';
      if (sinceIso) {
        where += ' and created_at >= :since';
        params.since = sinceIso;
      }
      const row = await this.qe.one<QueryRow>(
        `select
           coalesce(sum(input_tokens),0)  as input_tokens,
           coalesce(sum(output_tokens),0) as output_tokens,
           coalesce(sum(total_tokens),0)  as total_tokens,
           coalesce(sum(cost_micro_usd),0) as cost_micro_usd,
           count(*) as calls
         from inference_usage_ledger ${where}`,
        params,
      );
      if (!row) return zero;
      return {
        inputTokens: Number(row.input_tokens ?? 0),
        outputTokens: Number(row.output_tokens ?? 0),
        totalTokens: Number(row.total_tokens ?? 0),
        costMicroUsd: Number(row.cost_micro_usd ?? 0),
        calls: Number(row.calls ?? 0),
      };
    } catch (err) {
      this.log.warn({ err: message(err), userId }, 'usage ledger totals failed (returning zero)');
      return zero;
    }
  }
}

const OUTCOME_COLUMNS = `id, user_id, model, tier, routed, streamed, token_granular,
  latency_ms, status, reason, created_at`;

export class PgDeliveryOutcomeRepository implements DeliveryOutcomeRepository {
  constructor(
    private readonly qe: QueryExecutor,
    private readonly log: Logger,
  ) {}

  isDurable(): boolean {
    return this.qe.isAvailable();
  }

  async append(input: DeliveryOutcomeInput): Promise<DeliveryOutcomeRecord | null> {
    if (!this.qe.isAvailable()) return null;
    try {
      const row = await this.qe.one<QueryRow>(
        `insert into inference_delivery_outcome
           (user_id, model, tier, routed, streamed, token_granular, latency_ms, status, reason, created_at)
         values
           (:user_id, :model, :tier, :routed, :streamed, :token_granular, :latency_ms, :status, :reason, now())
         returning ${OUTCOME_COLUMNS}`,
        {
          user_id: input.userId ?? null,
          model: input.model,
          tier: input.tier,
          routed: input.routed,
          streamed: input.streamed ?? false,
          token_granular: input.tokenGranular ?? false,
          latency_ms: input.latencyMs ?? null,
          status: input.status,
          reason: input.reason ?? null,
        },
      );
      return row ? mapOutcomeRow(row) : null;
    } catch (err) {
      this.log.warn({ err: message(err), model: input.model }, 'delivery outcome append failed (ignored)');
      return null;
    }
  }

  async recentForUser(userId: string, limit = 50): Promise<readonly DeliveryOutcomeRecord[]> {
    if (!this.qe.isAvailable()) return [];
    try {
      const rows = await this.qe.read<QueryRow>(
        `select ${OUTCOME_COLUMNS} from inference_delivery_outcome
          where user_id = :user_id order by created_at desc limit :limit`,
        { user_id: userId, limit: Math.max(1, Math.min(limit, 500)) },
      );
      return rows.map(mapOutcomeRow);
    } catch (err) {
      this.log.warn({ err: message(err), userId }, 'delivery outcome read failed (returning empty)');
      return [];
    }
  }
}

function mapLedgerRow(row: QueryRow): UsageLedgerRecord {
  return {
    id: String(row.id),
    userId: row.user_id === null || row.user_id === undefined ? null : String(row.user_id),
    model: String(row.model),
    provider: row.provider === null || row.provider === undefined ? null : String(row.provider),
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    totalTokens: Number(row.total_tokens ?? 0),
    costMicroUsd: Number(row.cost_micro_usd ?? 0),
    tier: row.tier as DeliveryTier,
    inferenceId: row.inference_id === null || row.inference_id === undefined ? null : String(row.inference_id),
    createdAt: toIso(row.created_at),
  };
}

function mapOutcomeRow(row: QueryRow): DeliveryOutcomeRecord {
  return {
    id: String(row.id),
    userId: row.user_id === null || row.user_id === undefined ? null : String(row.user_id),
    model: String(row.model),
    tier: row.tier as DeliveryTier,
    routed: Boolean(row.routed),
    streamed: Boolean(row.streamed),
    tokenGranular: Boolean(row.token_granular),
    latencyMs: row.latency_ms === null || row.latency_ms === undefined ? null : Number(row.latency_ms),
    status: row.status as DeliveryStatus,
    reason: row.reason === null || row.reason === undefined ? null : String(row.reason),
    createdAt: toIso(row.created_at),
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
