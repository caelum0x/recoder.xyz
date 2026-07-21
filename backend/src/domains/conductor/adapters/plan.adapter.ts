/**
 * `plan.adapter.ts` — the thin conductor adapter that satisfies the
 * conductor-owned {@link ConductorPlanPort} by delegating to the engines-owned
 * `PalBrainService` facet (`planLaunch()`). This is the fusion seam: the launch
 * planning BRAIN lives once, behind the facet in the engines domain, and the
 * conductor consumes it here — WITHOUT a direct `@recoder/pal` import.
 *
 * `PalLaunchPlan` and {@link ConductorPlanDecision} are member-identical: the
 * facet's pal-engine-typed `risk` string assigns STRUCTURALLY to the
 * conductor-local `'low'|'medium'|'high'` union, so a plain spread carries the
 * plan across the domain boundary with no cast and no pal type leaking in.
 *
 * `planLaunch` is a PURE in-proc verb (no sidecar I/O): it never throws and
 * returns a conservative `source:'default'` plan on any internal fault, so the
 * conductor launch path is never blocked by a pal fault.
 */
import type { PalBrainService } from '../../engines/ports/pal-brain.port.js';
import type { ConductorPlanPort } from '../ports/plan.port.js';

/**
 * Build the conductor launch planner over the engines pal facet. Injected by
 * bootstrap as `createConductorPlanAdapter(engines.pal())`.
 */
export function createConductorPlanAdapter(pal: PalBrainService): ConductorPlanPort {
  return {
    plan: (input) => ({ ...pal.planLaunch(input) }),
  };
}
