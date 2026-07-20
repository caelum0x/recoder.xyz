/**
 * `CoordinationAdmissionService` — the DEEP double-assignment admission gate that
 * FIRES in the conductor `createWorkspace` flow, alongside the path-level
 * `WorkLockPort.acquire`. It reads the REAL Multica coordination fabric through
 * {@link CoordinationEnginePort.conflictStatus} (the vendored Go squads server's
 * derived contention view) and, when the SAME issue is already actively held by
 * 2+ agents, DEFERS the launch — asking the squad leader to re-balance via the
 * governance-gated {@link CoordinationEnginePort.requestReroute} write.
 *
 * DEGRADE-TRUTHFUL (non-negotiable): Multica is an OPTIONAL enrichment over the
 * local `squad.service.ts`. When the engine is absent / unreachable / errors,
 * this gate returns `admit:true, gated:false` — it NEVER blocks a run. Only a
 * LIVE, engine-confirmed double-assignment defers a launch.
 */
import type { Logger } from '../../../shared/logger.js';
import type { CoordinationEnginePort } from '../ports/coordination-engine.port.js';
import type {
  CoordinationAdmissionDecision,
  CoordinationAdmissionInput,
  CoordinationAdmissionOptions,
  CoordinationAdmissionPort,
} from '../ports/coordination-admission.port.js';

export interface CoordinationAdmissionServiceDeps {
  /** The Multica coordination introspection seam (conflict/reroute). */
  readonly engine: CoordinationEnginePort;
  readonly logger: Logger;
}

/** Reason recorded on the governance-gated reroute write. */
const REROUTE_REASON = 'double-assignment admission: contended issue deferred at launch';

export class CoordinationAdmissionService implements CoordinationAdmissionPort {
  private readonly engine: CoordinationEnginePort;
  private readonly logger: Logger;

  constructor(deps: CoordinationAdmissionServiceDeps) {
    this.engine = deps.engine;
    this.logger = deps.logger;
  }

  async admitIssue(
    input: CoordinationAdmissionInput,
    options: CoordinationAdmissionOptions = {},
  ): Promise<CoordinationAdmissionDecision> {
    const issueId = input.issueId?.trim();
    // No issue to key on ⇒ nothing to gate (the gate is per-issue contention).
    if (!issueId) {
      return { admit: true, deferred: false, gated: false, reason: 'no issue id — coordination gate skipped' };
    }

    // Read the live contention view. A thrown fault degrades OPEN — a coordination
    // hiccup must never block a launch the resource + policy gates already allow.
    let conflicts;
    try {
      const result = await this.engine.conflictStatus();
      if (!result.available) {
        return {
          admit: true,
          deferred: false,
          gated: false,
          reason: result.reason ?? 'coordination engine unavailable — no double-assignment gate (degrade-open)',
        };
      }
      conflicts = result.conflicts;
    } catch (err) {
      this.logger.warn({ err, issueId }, 'coordination-admission: conflictStatus errored — degrading open');
      return {
        admit: true,
        deferred: false,
        gated: false,
        reason: 'coordination engine errored — no double-assignment gate (degrade-open)',
      };
    }

    const identifier = input.identifier?.trim();
    const conflict = conflicts.find(
      (c) => c.issueId === issueId || (identifier !== undefined && c.identifier === identifier),
    );
    // Engine answered and saw no contention for this issue ⇒ cleared to launch.
    if (!conflict) {
      return { admit: true, deferred: false, gated: true };
    }

    // A LIVE double-assignment: defer this launch. Best-effort, governance-gated
    // reroute asks the squad leader to re-balance the contended issue.
    const reroute = await this.attemptReroute(issueId, options.authorizeReroute);
    const reason =
      `issue ${issueId} is already actively held by ${conflict.contenders.length} agents ` +
      `(${conflict.contenders.map((c) => c.memberId).join(', ')}) — launch deferred to avoid double-assignment`;
    this.logger.info({ issueId, contenders: conflict.contenders.length, rerouted: reroute?.routed }, 'coordination-admission: contended issue deferred');
    return {
      admit: false,
      deferred: true,
      gated: true,
      reason,
      conflict,
      ...(reroute ? { reroute } : {}),
    };
  }

  /**
   * Governance-gated reroute. The WRITE runs ONLY when `authorizeReroute` resolves
   * true — the caller wires that to its governance gate + principal. Absent
   * authorization ⇒ the launch is still deferred but no write is attempted.
   */
  private async attemptReroute(
    issueId: string,
    authorizeReroute?: () => Promise<boolean>,
  ): Promise<CoordinationAdmissionDecision['reroute']> {
    if (!authorizeReroute) return undefined;
    let authorized = false;
    try {
      authorized = await authorizeReroute();
    } catch (err) {
      this.logger.warn({ err, issueId }, 'coordination-admission: reroute authorization errored — treating as denied');
      return { routed: false, reason: 'reroute authorization errored — treated as denied (fail-safe)', issueId };
    }
    if (!authorized) {
      return { routed: false, reason: 'reroute not authorized by governance gate', issueId };
    }
    try {
      return await this.engine.requestReroute({ issueId, reason: REROUTE_REASON });
    } catch (err) {
      this.logger.warn({ err, issueId }, 'coordination-admission: reroute write errored — degrading');
      return { routed: false, reason: `reroute write errored: ${err instanceof Error ? err.message : String(err)}`, issueId };
    }
  }
}
