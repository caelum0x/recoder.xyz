/**
 * query-bus — the single validated read entry to the engine (design §4.6).
 *
 * Every query is zod-parsed (`querySchema`) before execution. Queries are
 * side-effect-free reads composed over the store ports + the pure read helpers
 * (`computeReadySet`). Like the command-bus, the boundary never throws: results
 * come back as `Result`.
 */

import type { WorkLock, WorkSignal } from '../domain';
import { computeReadySet, type ReadyTask } from '../dispatch/ready-set';
import { CoordinationError, CoordinationErrorCode } from '../errors';
import { err, ok, type Result } from '../result';
import type { LockManager } from '../locks';
import type {
  ClaimStorePort,
  DependencyStorePort,
  SignalSinkPort,
} from '../ports';
import type { ClaimSnapshotPort } from '../coherence/snapshot-loader';
import { querySchema, type CoordinationQuery } from './queries';

export type QueryBusDeps = {
  lockManager: LockManager;
  dependencyStore: DependencyStorePort;
  /** Per-task claim read (live claim for a candidate). */
  claimStore: ClaimStorePort;
  /** Bulk claim read for the ready-set / drift computation. */
  claimSnapshot: ClaimSnapshotPort;
  signalSink: SignalSinkPort;
};

export type QueryResult =
  | { kind: 'ActiveLocks'; locks: WorkLock[] }
  | { kind: 'ReadySet'; tasks: ReadyTask[] }
  | { kind: 'DriftReport'; openSignals: WorkSignal[] };

export class QueryBus {
  constructor(private readonly deps: QueryBusDeps) {}

  async execute(input: unknown): Promise<Result<QueryResult, CoordinationError>> {
    const parsed = querySchema.safeParse(input);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return err(
        new CoordinationError(
          CoordinationErrorCode.INVALID_COMMAND,
          `Invalid coordination query: ${detail}`,
        ),
      );
    }
    try {
      return ok(await this.run(parsed.data));
    } catch (error: unknown) {
      return err(
        error instanceof CoordinationError
          ? error
          : new CoordinationError(
              CoordinationErrorCode.INTERNAL,
              error instanceof Error ? error.message : 'query failed',
            ),
      );
    }
  }

  private async run(query: CoordinationQuery): Promise<QueryResult> {
    switch (query.kind) {
      case 'ActiveLocks': {
        const locks = await this.deps.lockManager.listActive({
          spaceId: query.spaceId,
          ...(query.repo ? { repo: query.repo } : {}),
        });
        return { kind: 'ActiveLocks', locks };
      }
      case 'ReadySet': {
        const candidates = await this.deps.dependencyStore.candidateTasks(query.spaceId);
        const edgesNested = await Promise.all(
          candidates.map((task) => this.deps.dependencyStore.dependenciesOf(task.taskId)),
        );
        const edges = edgesNested.flat();
        const upstreamIds = [...new Set(edges.map((edge) => edge.dependsOnTaskId))];
        const upstreamStates =
          upstreamIds.length > 0 ? await this.deps.dependencyStore.taskStates(upstreamIds) : [];
        const liveClaims = await this.deps.claimSnapshot.listClaims([query.spaceId]);
        const tasks = computeReadySet({ candidates, edges, upstreamStates, liveClaims });
        return { kind: 'ReadySet', tasks };
      }
      case 'DriftReport': {
        const spaceIds = query.spaceIds;
        if (!spaceIds || spaceIds.length === 0) {
          return { kind: 'DriftReport', openSignals: await this.deps.signalSink.listOpen() };
        }
        const perSpace = await Promise.all(
          spaceIds.map((spaceId) => this.deps.signalSink.listOpen(spaceId)),
        );
        return { kind: 'DriftReport', openSignals: perSpace.flat() };
      }
    }
  }
}
