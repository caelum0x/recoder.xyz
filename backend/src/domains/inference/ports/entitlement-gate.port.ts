/**
 * EntitlementGatePort — the inference domain's view of the billing entitlement gate.
 *
 * REUSE: the SAME frozen cross-domain seam billing owns
 * (`domains/billing/ports/entitlement.port.ts`), re-exported verbatim (type-only —
 * no runtime coupling, no cycle). Also re-exports `BillingSubject` so the routing
 * service can build the metering subject from the request's `userId`.
 *
 * The gate is OPTIONAL and set post-construction via
 * `InferenceModule.setEntitlementGate`. When absent the ladder degrades OPEN (no
 * token quota); when present the routing service runs a BYOK-aware token-quota
 * check before each completion — the gate itself skips token metering for BYOK
 * subjects and denies (fail-safe) when its metering repo is impaired.
 */
export type { EntitlementGate } from '../../billing/ports/entitlement.port.js';
export type { BillingSubject } from '../../billing/types.js';
