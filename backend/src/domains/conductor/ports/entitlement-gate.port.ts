/**
 * EntitlementGatePort — the conductor's view of the billing entitlement gate.
 *
 * REUSE: this is the SAME frozen cross-domain seam the billing domain owns
 * (`domains/billing/ports/entitlement.port.ts`). The conductor re-exports it
 * verbatim (type-only — no runtime coupling, no cycle) so the composer names ONE
 * port for the OPTIONAL pre-dispatch quota check it runs before launching a run.
 *
 * The gate is OPTIONAL and set post-construction via
 * `ConductorModule.setEntitlementGate`. When absent the conductor degrades OPEN
 * (no quota gate) — truthfully; when present, `createWorkspace` consults
 * `check(principal, { quota: 'agent_run' })` and refuses over-quota launches.
 */
export type { EntitlementGate } from '../../billing/ports/entitlement.port.js';
