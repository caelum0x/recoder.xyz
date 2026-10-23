/**
 * `createRailyardMintSink` — forwards the SAME metering events Recoder already
 * emits at the conductor + inference call sites (run started/finished, tokens,
 * $-spend — see `services/metering.service.ts`) to Railyard Mint, Railyard's
 * hosted usage-metering ledger, for usage-based invoicing and cross-product
 * rollup (ARCHITECTURE.md §5.3: "Mint becomes the metered-usage ledger; the
 * MoR provider stays the checkout MoR").
 *
 * This is a {@link UsageSinkPort}, NOT a {@link BillingProviderPort} — it never
 * participates in `BILLING_PROVIDER` selection, never issues a checkout, and
 * never owns subscription state. It is a pure additional emit target wired
 * into `MeteringService`'s existing flush loop (`extraSinks`); removing it
 * changes nothing about the existing MoR checkout/webhook/reconcile path.
 *
 * Degrade-safe like every adapter in this domain: no base URL/API key ⇒
 * `health()` reports `configured:false` / `down`, and `emitUsage` resolves
 * immediately as a no-op (never throws into the flush loop, never fabricates
 * a push that didn't happen).
 */
import { degraded, healthy, unhealthy, type ComponentHealth } from '../../../../shared/health-types.js';
import type { Logger } from '../../../../shared/logger.js';
import type { MeterEvent } from '../../types.js';
import type { UsageSinkPort } from '../../ports/usage-sink.port.js';
import { providerFetch } from '../../adapters/shared.js';

const COMPONENT_NAME = 'billing.railyard_mint';
const DEFAULT_TIMEOUT_MS = 15_000;

export interface RailyardMintSinkConfig {
  /** Railyard Mint's ingest base URL. `null`/empty ⇒ unconfigured (degrade-safe no-op). */
  readonly baseUrl: string | null;
  /** Railyard Mint API key. `null`/empty ⇒ unconfigured (degrade-safe no-op). */
  readonly apiKey: string | null;
  /** Logical product id Mint uses to attribute usage in its cross-product rollup. */
  readonly productId?: string;
}

export interface RailyardMintSinkDeps {
  readonly config: RailyardMintSinkConfig;
  readonly logger?: Logger;
}

/** Wire shape Mint's usage-ingest endpoint expects — a thin, documented mapping from `MeterEvent`. */
interface RailyardMintUsageEvent {
  readonly product_id?: string;
  readonly subject_id: string;
  readonly kind: string;
  readonly quantity: number;
  readonly idempotency_key: string;
  readonly occurred_at: string;
}

function toWireEvent(e: MeterEvent, productId: string | undefined): RailyardMintUsageEvent {
  return {
    ...(productId ? { product_id: productId } : {}),
    subject_id: e.subjectId,
    kind: e.kind,
    quantity: e.quantity,
    idempotency_key: e.idempotencyKey,
    occurred_at: e.timestamp,
  };
}

function isConfigured(cfg: RailyardMintSinkConfig): boolean {
  return Boolean(cfg.baseUrl && cfg.baseUrl.length > 0 && cfg.apiKey && cfg.apiKey.length > 0);
}

export function createRailyardMintSink(deps: RailyardMintSinkDeps): UsageSinkPort {
  const { config, logger } = deps;

  async function emitUsage(events: readonly MeterEvent[]): Promise<void> {
    if (events.length === 0) return;
    if (!isConfigured(config)) {
      // Unconfigured ⇒ truthful no-op. Never a fabricated push.
      logger?.debug?.({ count: events.length }, 'railyard-mint: unconfigured — usage batch not forwarded');
      return;
    }
    const baseUrl = config.baseUrl!.replace(/\/+$/, '');
    await providerFetch<unknown>({
      baseUrl,
      apiKey: config.apiKey!,
      method: 'POST',
      path: '/v1/usage/events',
      body: { events: events.map((e) => toWireEvent(e, config.productId)) },
      authScheme: 'bearer',
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
  }

  async function health(): Promise<ComponentHealth> {
    if (!isConfigured(config)) {
      return degraded(COMPONENT_NAME, 'RAILYARD_MINT_BASE_URL / RAILYARD_MINT_API_KEY not configured — usage is recorded durably but not forwarded to Mint');
    }
    const baseUrl = config.baseUrl!.replace(/\/+$/, '');
    try {
      await providerFetch<unknown>({
        baseUrl,
        apiKey: config.apiKey!,
        method: 'GET',
        path: '/v1/health',
        authScheme: 'bearer',
        timeoutMs: 5_000,
      });
      return healthy(COMPONENT_NAME);
    } catch (error) {
      return unhealthy(COMPONENT_NAME, error instanceof Error ? error.message : 'railyard mint health probe failed');
    }
  }

  return { name: 'railyard-mint', emitUsage, health };
}
