/**
 * `CoordinationEnginePort` — the read-mostly seam the agent-os control plane uses
 * to introspect cross-agent COORDINATION state out of the Multica engine
 * (`apps/desktop/server/engines/multica`, a Go squads/leader-routing server that
 * needs PG15). Multica groups agents under a squad leader for stable work
 * routing and tracks which agent is actively running which issue — that surface
 * IS the coordination fabric the control plane wants to introspect:
 *
 *   - {@link CoordinationEnginePort.routingStatus}     — squad routing introspection
 *     (which squads exist, their leader, member counts). "Where would work route?"
 *   - {@link CoordinationEnginePort.coordinationStatus} — work-lock / coordination status
 *     (per squad member: working ⇒ holds an active-task lock, idle ⇒ available,
 *     unstable/offline ⇒ not routable). "Who is busy right now?"
 *   - {@link CoordinationEnginePort.conflictStatus}     — conflict-detection status
 *     (the SAME issue actively held by two or more agents ⇒ a contended assignment
 *     the coordinator should re-balance). "Is anyone stepping on each other?"
 *   - {@link CoordinationEnginePort.requestReroute}     — the ONE governed WRITE:
 *     ask the squad leader to re-evaluate routing for a contended issue.
 *
 * DEGRADE-SAFE (CRITICAL): Multica is an OPTIONAL enrichment layer over the local
 * `squad.service.ts` — never the source of truth. Every read returns
 * `{ available: false, reason }` (never throws, never fakes data) when the engine
 * is absent (no `MULTICA_URL` / binary down / needs-PG15 not provisioned). The
 * write returns `{ routed: false, reason }` on the same conditions.
 */

/** How the coordination engine was reached (truthful — never guessed). */
export type CoordinationEngineMode = 'external' | 'unconfigured';

/** One squad's leader-routing configuration (routing introspection). */
export interface SquadRoutingEntry {
  readonly squadId: string;
  readonly name: string;
  /** The agent id work routes THROUGH for this squad (its stable leader). */
  readonly leaderId: string;
  readonly memberCount: number;
}

export interface CoordinationRoutingResult {
  /** True iff the squad list was actually read from a live Multica engine. */
  readonly available: boolean;
  readonly mode: CoordinationEngineMode;
  /** Human-readable reason when `available === false` (never a faked list). */
  readonly reason?: string;
  readonly squads: readonly SquadRoutingEntry[];
}

/** A squad member's derived availability = its coordination/work-lock state. */
export type MemberLockStatus = 'working' | 'idle' | 'unstable' | 'offline' | 'unknown';

/** One member's coordination state: `working` ⇒ holds an active-task lock. */
export interface SquadMemberLock {
  readonly squadId: string;
  readonly memberId: string;
  readonly memberType: string;
  readonly status: MemberLockStatus;
  /** Issue ids this member is actively running (the "locks" it currently holds). */
  readonly activeIssueIds: readonly string[];
  readonly lastActiveAt?: string;
}

export interface CoordinationStatusResult {
  readonly available: boolean;
  readonly mode: CoordinationEngineMode;
  readonly reason?: string;
  /** Per-member work-lock view across every squad. */
  readonly locks: readonly SquadMemberLock[];
  /** Count of members currently holding a work-lock (status === 'working'). */
  readonly workingCount: number;
  /** Count of members available to take work (status === 'idle'). */
  readonly idleCount: number;
}

/** A contended assignment: one issue actively held by 2+ agents. */
export interface CoordinationConflict {
  readonly issueId: string;
  readonly identifier?: string;
  /** The members concurrently running this issue (the contenders). */
  readonly contenders: readonly { readonly squadId: string; readonly memberId: string }[];
}

export interface CoordinationConflictResult {
  readonly available: boolean;
  readonly mode: CoordinationEngineMode;
  readonly reason?: string;
  readonly conflicts: readonly CoordinationConflict[];
}

/** Input for the governed reroute write. */
export interface RerouteRequest {
  /** The contended issue whose squad leader should re-evaluate routing. */
  readonly issueId: string;
  /** Optional sanitized reason recorded with the request. */
  readonly reason?: string;
}

export interface RerouteResult {
  /** True iff Multica accepted the re-evaluation request. */
  readonly routed: boolean;
  /** Reason the write did not route (engine down / rejected) — never faked. */
  readonly reason?: string;
  readonly issueId?: string;
}

/**
 * The coordination introspection seam. The default implementation
 * ({@link import('../adapters/multica-coordination.adapter.js').MulticaCoordinationAdapter})
 * talks to the Multica loopback; tests inject a fake.
 */
export interface CoordinationEnginePort {
  routingStatus(): Promise<CoordinationRoutingResult>;
  coordinationStatus(): Promise<CoordinationStatusResult>;
  conflictStatus(): Promise<CoordinationConflictResult>;
  /** The governed write — callers gate this through the governance gate first. */
  requestReroute(req: RerouteRequest): Promise<RerouteResult>;
}
