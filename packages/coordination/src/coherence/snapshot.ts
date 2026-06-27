/**
 * CoordinationSnapshot — the immutable point-in-time view the reconciler reasons
 * over. It bundles every piece of coordination state (locks, claims, task DAG
 * nodes, squads, presence, open signals, live handoffs) captured at instant `at`.
 *
 * `snapshot-loader.ts` is the ONLY impure producer of this value (it pulls from
 * the store ports). Every `checks/*` invariant is a pure
 * `(CoordinationSnapshot) => CoherenceFinding[]`, so the whole reconciler is
 * unit-testable without a DB, NATS, or wall-clock — per design §2.1 and §4.5.
 */

import type {
  AgentPresence,
  DependencyEdge,
  Handoff,
  TaskClaim,
  TaskNode,
  WorkLock,
  WorkSignal,
} from '../domain';

/**
 * A "live run" projection. Coordination does not fork the agent-os TaskRun; it
 * reads the minimal liveness facts each coherence check needs: which run is
 * alive, on which task, claimed by which agent, last seen when.
 */
export type LiveRun = {
  runId: string;
  taskId: string;
  spaceId: string;
  agentId: string;
  /** Whether the run is currently progressing (not terminal). */
  alive: boolean;
  /** ISO time the run last emitted progress. */
  lastEventAt: string;
};

/**
 * A squad membership liveness projection — what the squad believes a member is
 * doing, paired with whether that member actually holds a live claim. Sourced
 * from the A2A squad model + multica squad assignment.
 */
export type SquadMemberView = {
  squadId: string;
  memberId: string;
  /** The task the squad believes the member is engaged on, if any. */
  believedTaskId?: string;
  /** Whether the squad currently considers the member busy. */
  believedBusy: boolean;
};

/**
 * Immutable snapshot. All arrays are treated as read-only by every check; a
 * check never mutates them — it only derives `CoherenceFinding[]`.
 */
export type CoordinationSnapshot = {
  /** Instant the snapshot was taken (drives every age/expiry computation). */
  at: string;
  locks: readonly WorkLock[];
  claims: readonly TaskClaim[];
  /** Task DAG nodes, keyed implicitly by `taskId`, used to resolve terminal state. */
  tasks: readonly TaskNode[];
  /** `blocks`/`discovered-from`/`related` edges relevant to the snapshot's tasks. */
  depEdges: readonly DependencyEdge[];
  /** Live-run projections used by claim/lock liveness checks. */
  runs: readonly LiveRun[];
  presence: readonly AgentPresence[];
  /** Open (unresolved) handoffs in flight. */
  handoffs: readonly Handoff[];
  squadMembers: readonly SquadMemberView[];
  /** Already-open signals, so the reconciler does not duplicate them. */
  openSignals: readonly WorkSignal[];
  /** Config the checks need (recovery window, heartbeat timeout). */
  config: SnapshotConfig;
};

/** The config slice the coherence checks read (no IO, just values). */
export type SnapshotConfig = {
  /** multica claimResponseRecoveryWindow — protects an in-flight start. */
  claimRecoveryWindowMs: number;
  /** A2A HEARTBEAT_TIMEOUT_MS — presence staleness threshold. */
  heartbeatTimeoutMs: number;
};

/** Build an empty snapshot at `at` with the given config (test/seed convenience). */
export function emptySnapshot(at: string, config: SnapshotConfig): CoordinationSnapshot {
  return {
    at,
    locks: [],
    claims: [],
    tasks: [],
    depEdges: [],
    runs: [],
    presence: [],
    handoffs: [],
    squadMembers: [],
    openSignals: [],
    config,
  };
}

/** Index helpers — pure, allocation-light lookups shared across checks. */
export function taskById(snapshot: CoordinationSnapshot): Map<string, TaskNode> {
  return new Map(snapshot.tasks.map((task) => [task.taskId, task]));
}

/** Live runs grouped by task id (a task may, transiently, have more than one). */
export function liveRunsByTask(snapshot: CoordinationSnapshot): Map<string, LiveRun[]> {
  const grouped = new Map<string, LiveRun[]>();
  for (const run of snapshot.runs) {
    if (!run.alive) {
      continue;
    }
    grouped.set(run.taskId, [...(grouped.get(run.taskId) ?? []), run]);
  }
  return grouped;
}

/** Presence indexed by agent id. */
export function presenceByAgent(snapshot: CoordinationSnapshot): Map<string, AgentPresence> {
  return new Map(snapshot.presence.map((presence) => [presence.agentId, presence]));
}
