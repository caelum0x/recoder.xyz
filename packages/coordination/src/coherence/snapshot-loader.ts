/**
 * snapshot-loader — the ONLY impure producer of a CoordinationSnapshot.
 *
 * It pulls current state from the store ports (locks, claims, presence, signals,
 * task DAG) and assembles an immutable snapshot at the clock's `iso()` instant.
 * Per design §4.5 / §5.3, everything downstream (every check, the reconciler) is
 * pure over this value, so the impurity is isolated here.
 *
 * Runs and squad-member views are read through optional projection ports: the
 * pure coherence model needs liveness facts (which run is alive, what a squad
 * believes about a member) that the core store ports do not expose directly.
 * Adapters supply them; when absent, those arrays are empty and the dependent
 * checks simply find nothing.
 */

import type { CoordinationConfig } from '../config/coordination-config';
import type {
  ClockPort,
  DependencyStorePort,
  LockStorePort,
  PresenceStorePort,
  SignalSinkPort,
} from '../ports';
import type { CoordinationSnapshot, LiveRun, SquadMemberView } from './snapshot';

/** Optional projection ports for liveness facts not on the core store ports. */
export interface RunProjectionPort {
  /** Live runs across the given spaces (or all when omitted). */
  liveRuns(spaceIds?: string[]): Promise<LiveRun[]>;
}

export interface SquadMemberViewPort {
  /** What each squad currently believes about its members. */
  memberViews(): Promise<SquadMemberView[]>;
}

export type SnapshotLoaderDeps = {
  clock: ClockPort;
  lockStore: LockStorePort;
  claimStore: ClaimSnapshotPort;
  dependencyStore: DependencyStorePort;
  presenceStore: PresenceStorePort;
  signalSink: SignalSinkPort;
  config: CoordinationConfig;
  /** Optional: live-run projection. Empty runs when not provided. */
  runProjection?: RunProjectionPort;
  /** Optional: squad-member belief projection. Empty when not provided. */
  squadProjection?: SquadMemberViewPort;
};

/**
 * The claim-read shape the snapshot loader needs. ClaimStorePort is per-task
 * (compare-and-set oriented); listing all live claims for a reconcile tick is a
 * distinct read capability that adapters expose here.
 */
export interface ClaimSnapshotPort {
  /** All currently-recorded claims across the given spaces (or all). */
  listClaims(spaceIds?: string[]): Promise<import('../domain').TaskClaim[]>;
}

/**
 * Load a snapshot for the given spaces. When `spaceIds` is omitted the adapters
 * decide their own scope (typically all active spaces).
 */
export async function loadSnapshot(
  deps: SnapshotLoaderDeps,
  spaceIds?: string[],
): Promise<CoordinationSnapshot> {
  const at = deps.clock.iso();

  const [locks, claims, presence, openSignals, runs, squadMembers] = await Promise.all([
    listLocks(deps.lockStore, spaceIds),
    deps.claimStore.listClaims(spaceIds),
    deps.presenceStore.list(),
    listOpenSignals(deps.signalSink, spaceIds),
    deps.runProjection ? deps.runProjection.liveRuns(spaceIds) : Promise.resolve([]),
    deps.squadProjection ? deps.squadProjection.memberViews() : Promise.resolve([]),
  ]);

  const { tasks, depEdges } = await loadTaskGraph(deps.dependencyStore, spaceIds);

  return {
    at,
    locks,
    claims,
    tasks,
    depEdges,
    runs,
    presence,
    handoffs: [],
    squadMembers,
    openSignals,
    config: {
      claimRecoveryWindowMs: deps.config.claim.recoveryWindowMs,
      heartbeatTimeoutMs: deps.config.presence.heartbeatTimeoutMs,
    },
  };
}

async function listLocks(
  lockStore: LockStorePort,
  spaceIds?: string[],
): Promise<import('../domain').WorkLock[]> {
  if (!spaceIds || spaceIds.length === 0) {
    return lockStore.list({ spaceId: '*' });
  }
  const perSpace = await Promise.all(spaceIds.map((spaceId) => lockStore.list({ spaceId })));
  return perSpace.flat();
}

async function listOpenSignals(
  signalSink: SignalSinkPort,
  spaceIds?: string[],
): Promise<import('../domain').WorkSignal[]> {
  if (!spaceIds || spaceIds.length === 0) {
    return signalSink.listOpen();
  }
  const perSpace = await Promise.all(spaceIds.map((spaceId) => signalSink.listOpen(spaceId)));
  return perSpace.flat();
}

async function loadTaskGraph(
  dependencyStore: DependencyStorePort,
  spaceIds?: string[],
): Promise<{
  tasks: import('../domain').TaskNode[];
  depEdges: import('../domain').DependencyEdge[];
}> {
  if (!spaceIds || spaceIds.length === 0) {
    return { tasks: [], depEdges: [] };
  }

  const candidatesPerSpace = await Promise.all(
    spaceIds.map((spaceId) => dependencyStore.candidateTasks(spaceId)),
  );
  const candidates = candidatesPerSpace.flat();

  const depEdgesNested = await Promise.all(
    candidates.map((task) => dependencyStore.dependenciesOf(task.taskId)),
  );
  const depEdges = depEdgesNested.flat();

  // Resolve upstream task states the candidate set may not include, so
  // `dep-violation` can judge whether a blocking upstream is terminal.
  const knownTaskIds = new Set(candidates.map((task) => task.taskId));
  const upstreamIds = [
    ...new Set(
      depEdges
        .map((edge) => edge.dependsOnTaskId)
        .filter((taskId) => !knownTaskIds.has(taskId)),
    ),
  ];
  const upstreamStates =
    upstreamIds.length > 0 ? await dependencyStore.taskStates(upstreamIds) : [];

  return { tasks: [...candidates, ...upstreamStates], depEdges };
}
