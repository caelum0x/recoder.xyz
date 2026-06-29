/**
 * Conductor planner — thin re-export of the @recoder/pal seam.
 *
 * The reusable in-process seam now lives in `./pal-plan.ts`, which both the
 * advisory `POST /workspaces/plan` route AND the REAL workspace-create path
 * (workspace-service) import. This module is kept as a stable re-export so the
 * existing callers/tests that import from `./conductor-planner.js` are unchanged.
 *
 * See `./pal-plan.ts` for the planner translation + the create-path defaulter
 * (`computePalDefaults`).
 */
export {
  planConductorRun,
  effectiveRuntimeId,
  computePalDefaults,
  type ConductorPlan,
  type PalDefaults,
  type PalPlanAnnotation,
} from './pal-plan.js';
