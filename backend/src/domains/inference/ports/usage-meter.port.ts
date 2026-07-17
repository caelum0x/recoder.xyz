/**
 * UsageMeterPort — the inference domain's view of the billing usage meter.
 *
 * REUSE: the SAME durable ledger writer billing owns
 * (`domains/billing/services/metering.service.ts` → `MeteringService.record`),
 * narrowed to the ONE method the routing service emits through. Type-only imports
 * keep this a pure seam (no runtime coupling, no cycle) — `billing.metering()`
 * satisfies it structurally.
 *
 * The meter is OPTIONAL and set post-construction via
 * `InferenceModule.setUsageMeter`. When absent the ladder degrades to a truthful
 * NO-OP (no token metering); when present each routed completion meters its
 * `token` quantity (prompt + completion) for the request's subject. A metering
 * hiccup NEVER blocks or fails delivery — the emit is fire-and-forget.
 */
import type { MeterInput } from '../../billing/services/metering.service.js';
import type { IdempotentWrite } from '../../billing/ports/metering-repo.port.js';

export type { MeterInput } from '../../billing/services/metering.service.js';

/** The narrow usage-meter seam the routing service emits `token` usage through. */
export interface UsageMeterPort {
  /** Record one usage event durably + idempotently (retry with same key = no-op). */
  record(input: MeterInput): Promise<IdempotentWrite>;
}
