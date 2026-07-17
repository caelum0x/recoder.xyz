/**
 * UsageMeterPort — the conductor's view of the billing usage meter.
 *
 * REUSE: the SAME durable ledger writer billing owns
 * (`domains/billing/services/metering.service.ts` → `MeteringService.record`),
 * narrowed to the ONE method the conductor emits through. Type-only imports of
 * `MeterInput`/`IdempotentWrite` keep this a pure seam (no runtime coupling, no
 * cycle) — `billing.metering()` satisfies it structurally.
 *
 * The meter is OPTIONAL and set post-construction via
 * `ConductorModule.setUsageMeter`. When absent the run flow degrades to a truthful
 * NO-OP (no metering); when present a completed/failed run meters one `agent_run`
 * for the owning subject. A metering hiccup NEVER blocks or delays the terminal
 * RunEvent — the emit is fire-and-forget and self-logging.
 */
import type { MeterInput } from '../../billing/services/metering.service.js';
import type { IdempotentWrite } from '../../billing/ports/metering-repo.port.js';

export type { MeterInput } from '../../billing/services/metering.service.js';

/** The narrow usage-meter seam the conductor emits `agent_run` usage through. */
export interface UsageMeterPort {
  /** Record one usage event durably + idempotently (retry with same key = no-op). */
  record(input: MeterInput): Promise<IdempotentWrite>;
}
