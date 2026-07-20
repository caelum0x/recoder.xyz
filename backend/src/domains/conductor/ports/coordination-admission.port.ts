/**
 * CoordinationAdmissionPort — the DOUBLE-ASSIGNMENT admission seam.
 *
 * REUSE: re-exports the agent-os `CoordinationAdmissionPort` verbatim so the
 * conductor and the coordination fabric name ONE contract (mirrors how
 * `governance-gate.port.ts` re-exports the governance gate). The conductor
 * consults this gate in `createWorkspace` — alongside the path-level
 * {@link WorkLockPort} — to skip/defer a launch for an issue already actively
 * held by 2+ agents (a contention Multica sees as `working` under 2+ members).
 *
 * DEGRADE-SAFE by contract: when the coordination engine (Multica) is absent the
 * gate returns `admit:true, gated:false` — it NEVER blocks a run; the local
 * squad service stays authoritative. Only a LIVE, engine-confirmed
 * double-assignment defers a launch.
 */
export type {
  CoordinationAdmissionPort,
  CoordinationAdmissionInput,
  CoordinationAdmissionOptions,
  CoordinationAdmissionDecision,
} from '../../agent-os/ports/coordination-admission.port.js';
