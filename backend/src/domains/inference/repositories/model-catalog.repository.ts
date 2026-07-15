/**
 * `PgModelCatalogRepository` — the routable model registry over the persistence
 * `QueryExecutor` (`inference_model_catalog`). Backs config generation, cost
 * accounting, and `GET /inference/models`.
 *
 * DEGRADE-SAFE: when the executor is unavailable, writes no-op and reads return
 * empty (the caller falls back to the config default model). Parameterized `:param`.
 */
import type { Logger } from '../../../shared/logger.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { QueryRow } from '../../persistence/types.js';
import type { ModelCatalogRepository, ModelCatalogUpsert } from '../ports/model-catalog.port.js';
import type { ModelCatalogEntry } from '../types.js';

const COLUMNS = `model_id, provider, display_name, context_window,
  input_micro_usd_per_mtok, output_micro_usd_per_mtok, supports_streaming, enabled, updated_at`;

export class PgModelCatalogRepository implements ModelCatalogRepository {
  constructor(
    private readonly qe: QueryExecutor,
    private readonly log: Logger,
  ) {}

  isDurable(): boolean {
    return this.qe.isAvailable();
  }

  async list(options?: { readonly enabledOnly?: boolean }): Promise<readonly ModelCatalogEntry[]> {
    if (!this.qe.isAvailable()) return [];
    try {
      const where = options?.enabledOnly ? ' where enabled = true' : '';
      const rows = await this.qe.read<QueryRow>(
        `select ${COLUMNS} from inference_model_catalog${where} order by provider asc, model_id asc`,
      );
      return rows.map(mapRow);
    } catch (err) {
      this.log.warn({ err: message(err) }, 'model catalog list failed (returning empty)');
      return [];
    }
  }

  async get(modelId: string): Promise<ModelCatalogEntry | null> {
    if (!this.qe.isAvailable()) return null;
    try {
      const row = await this.qe.one<QueryRow>(
        `select ${COLUMNS} from inference_model_catalog where model_id = :model_id`,
        { model_id: modelId },
      );
      return row ? mapRow(row) : null;
    } catch (err) {
      this.log.warn({ err: message(err), modelId }, 'model catalog get failed');
      return null;
    }
  }

  async upsert(entry: ModelCatalogUpsert): Promise<ModelCatalogEntry | null> {
    if (!this.qe.isAvailable()) return null;
    try {
      const row = await this.qe.one<QueryRow>(
        `insert into inference_model_catalog
           (model_id, provider, display_name, context_window,
            input_micro_usd_per_mtok, output_micro_usd_per_mtok, supports_streaming, enabled, updated_at)
         values
           (:model_id, :provider, :display_name, :context_window,
            :input_price, :output_price, :supports_streaming, :enabled, now())
         on conflict (model_id) do update
           set provider = excluded.provider,
               display_name = excluded.display_name,
               context_window = excluded.context_window,
               input_micro_usd_per_mtok = excluded.input_micro_usd_per_mtok,
               output_micro_usd_per_mtok = excluded.output_micro_usd_per_mtok,
               supports_streaming = excluded.supports_streaming,
               enabled = excluded.enabled,
               updated_at = now()
         returning ${COLUMNS}`,
        {
          model_id: entry.modelId,
          provider: entry.provider,
          display_name: entry.displayName,
          context_window: entry.contextWindow ?? 0,
          input_price: entry.inputMicroUsdPerMTok ?? 0,
          output_price: entry.outputMicroUsdPerMTok ?? 0,
          supports_streaming: entry.supportsStreaming ?? true,
          enabled: entry.enabled ?? true,
        },
      );
      return row ? mapRow(row) : null;
    } catch (err) {
      this.log.warn({ err: message(err), modelId: entry.modelId }, 'model catalog upsert failed');
      return null;
    }
  }

  async setEnabled(modelId: string, enabled: boolean): Promise<boolean> {
    if (!this.qe.isAvailable()) return false;
    try {
      const affected = await this.qe.mutate(
        `update inference_model_catalog set enabled = :enabled, updated_at = now() where model_id = :model_id`,
        { model_id: modelId, enabled },
      );
      return affected > 0;
    } catch (err) {
      this.log.warn({ err: message(err), modelId }, 'model catalog setEnabled failed');
      return false;
    }
  }
}

function mapRow(row: QueryRow): ModelCatalogEntry {
  return {
    modelId: String(row.model_id),
    provider: String(row.provider),
    displayName: String(row.display_name),
    contextWindow: Number(row.context_window ?? 0),
    inputMicroUsdPerMTok: Number(row.input_micro_usd_per_mtok ?? 0),
    outputMicroUsdPerMTok: Number(row.output_micro_usd_per_mtok ?? 0),
    supportsStreaming: Boolean(row.supports_streaming),
    enabled: Boolean(row.enabled),
    updatedAt: toIso(row.updated_at),
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
