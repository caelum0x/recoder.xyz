/**
 * `CoordinationAdmissionPort` — the DOUBLE-ASSIGNMENT admission gate over the
 * Multica coordination fabric ({@link CoordinationEnginePort.conflictStatus}).
 *
 * This is a DIFFERENT axis from the path-level {@link WorkLockPort}: the work-lock
 * prevents two workspaces from holding overlapping WRITE SCOPE in the same
 * (space, repo); this gate prevents two agents from actively working the SAME
 * ISSUE (a contended assignment Multica already sees as `working` under 2+
 * members). The conductor consults BOTH before a launch:
 *
 *   admit(resource governor) → coordination admission(this) → work-lock → launch
 *
 * SEMANTICS:
 *   - Engine ABSENT / unreachable / errored ⇒ `admit:true, gated:false` (degrade
 *     OPEN — an optional enrichment layer NEVER blocks a run; the local
 *     `squad.service.ts` stays authoritative).
 *   - Engine present, NO live double-assignment for the issue ⇒ `admit:true,
 *     gated:true` (the gate ran and cleared the launch).
 *   - Engine present, the issue is ALREADY actively held by 2+ agents ⇒
 *     `admit:false, deferred:true` — the launch is SKIPPED/DEFERRED with a
 *     truthful reason naming the contenders, and (when authorized) a
 *     governance-gated {@link CoordinationEnginePort.requestReroute} asks the
 *     squad leader to re-balance.
 *
 * The reroute WRITE is governance-gated by the CALLER: `admitIssue` performs it
 * ONLY when `authorizeReroute()` resolves true (the conductor wires this to its
 * governance gate + the launching principal), never on its own authority.
 */
import type { CoordinationConflict, RerouteResult } from './coordination-engine.port.js';

/** What issue a launch is about to work (the unit the gate keys on). */
export interface CoordinationAdmissionInput {
  /** The canonical issue id the workspace/run is about to work. */
  readonly issueId: string;
  /** Optional human identifier (e.g. `rec-123`) matched too, when present. */
  readonly identifier?: string;
}

/** Per-call options — the governance-gated reroute authorization seam. */
export interface CoordinationAdmissionOptions {
  /**
   * Governance-gated reroute authorization. Invoked ONLY when a live
   * double-assignment is detected. Resolves `true` iff the governance gate
   * ALLOWS the reroute write for this principal; `false`/absent ⇒ the launch is
   * still deferred but no reroute write is attempted. NEVER throws to the gate —
   * a fault resolves `false` (fail-safe: no unauthorized write).
   */
  readonly authorizeReroute?: () => Promise<boolean>;
}

/** The gate's decision for one launch. */
export interface CoordinationAdmissionDecision {
  /** `true` ⇒ proceed with launch; `false` ⇒ skip/defer (contended issue). */
  readonly admit: boolean;
  /** `true` ⇒ a live double-assignment was detected and the launch was deferred. */
  readonly deferred: boolean;
  /** `true` iff the coordination engine actually answered (degrade-truthful). */
  readonly gated: boolean;
  /** Truthful reason — why the launch was cleared, deferred, or the gate skipped. */
  readonly reason?: string;
  /** The contended assignment, when `deferred`. */
  readonly conflict?: CoordinationConflict;
  /** Outcome of the governance-gated reroute write, when one was attempted. */
  readonly reroute?: RerouteResult;
}

/** The admission-gate seam the conductor consults before a launch. */
export interface CoordinationAdmissionPort {
  admitIssue(
    input: CoordinationAdmissionInput,
    options?: CoordinationAdmissionOptions,
  ): Promise<CoordinationAdmissionDecision>;
}
