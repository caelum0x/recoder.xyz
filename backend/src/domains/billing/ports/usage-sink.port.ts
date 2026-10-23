/**
 * `UsageSinkPort` — a SECONDARY, best-effort usage-forwarding seam, deliberately
 * separate from the frozen {@link BillingProviderPort} (Phase 9 MoR contract).
 *
 * `BillingProviderPort` is the single Merchant-of-Record seam: checkout,
 * subscription lifecycle, webhook verification, AND `emitUsage` all bundled
 * into one port selected by `BILLING_PROVIDER`. A usage-metering ROLLUP service
 * like Railyard Mint is not a merchant of record — it never issues a checkout
 * or owns a subscription — so it must never be eligible for `BILLING_PROVIDER`
 * selection. Giving it its own narrow port keeps that boundary enforced by the
 * type system, not by convention.
 *
 * A `UsageSinkPort` is purely additive: {@link MeteringService} (see
 * `services/metering.service.ts`) fans the SAME flushed {@link MeterEvent}
 * batch out to zero or more sinks, alongside (never instead of) the active MoR
 * provider's own `emitUsage`. A sink failure is logged and never affects the
 * primary provider's flush/mark-flushed decision — see `metering.service.ts`
 * `forwardToSinks`.
 */
import type { ComponentHealth } from '../../../shared/health-types.js';
import type { MeterEvent } from '../types.js';

export interface UsageSinkPort {
  /** Stable sink id for logging/health (e.g. `railyard-mint`). */
  readonly name: string;

  /**
   * Forward a batch of already-durably-recorded usage events. MUST fail safe:
   * an unconfigured sink or a push error rejects (so the caller can log it)
   * but must NEVER throw synchronously in a way that blocks the primary flush,
   * and must NEVER duplicate a side effect it already completed (callers may
   * retry the same batch — the sink should treat `idempotencyKey` as the dedupe
   * key on its own ingest side, same contract as the MoR `emitUsage`).
   */
  emitUsage(events: readonly MeterEvent[]): Promise<void>;

  /** Truthful readiness — `configured:false` when no base URL / key is set. */
  health(): Promise<ComponentHealth>;
}
