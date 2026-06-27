/**
 * dispatch-manager — the impure shell around the pure `dispatch-planner`.
 *
 * Design §5.1: loads a snapshot from the stores, runs the pure planner, then
 * commits the claim + lock reservations atomically and publishes events. It is
 * the ONLY dispatch file that touches ports; the planner stays deterministic.
 *
 * The public boundary NEVER throws (design §9): all paths return
 * `Result<DispatchDecision, CoordinationError>`. A blocked route is an `ok`
 * decision with no claim (the caller inspects `route.blocked`); a hard conflict
 * (dependency/claim) is an `err`.
 *
 * The actual exactly-one-winner guarantee lives in `ClaimStorePort.compareAndSet`
 * (Postgres `FOR UPDATE SKIP LOCKED`, memory CAS). If the CAS loses, the manager
 * maps it to `ClaimConflictError` — two racing dispatches of one task yield
 * exactly one claim.
 */

import type {
  DispatchDecision,
  Effect,
  OrchestrationPattern,
  PresenceStatus,
} from '../domain';
import { asClaimId } from '../domain';
import { ClaimConflictError } from '../errors/claim-conflict-error';
import { CoordinationError } from '../errors/coordination-error';
import { CoordinationErrorCode } from '../errors/error-codes';
import { toCoordinationError } from '../errors/to-result';
import { err, ok, type Result } from '../result';
import type {
  AgentDirectoryPort,
  ClaimStorePort,
  ClockPort,
  DependencyStorePort,
  IdGeneratorPort,
  LeaseFencerPort,
  LockStorePort,
  MetricsPort,
  PolicyGatePort,
  PresenceStorePort,
} from '../ports';
import { hashParts } from '../util/hash';
import { planDispatch } from './dispatch-planner';
import type { RoutableSpace, RoutableTask } from './routing-request';

export type DispatchManagerDeps = {
  agentDirectory: AgentDirectoryPort;
  claimStore: ClaimStorePort;
  lockStore: LockStorePort;
  dependencyStore: DependencyStorePort;
  presenceStore: PresenceStorePort;
  policyGate: PolicyGatePort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  fencer: LeaseFencerPort;
  metrics: MetricsPort;
  config: {
    leaseMs: number;
    recoveryWindowMs: number;
    maxConcurrency: number;
    dispatchDryRun: boolean;
  };
};

export type DispatchTaskRequest = {
  task: RoutableTask;
  space?: RoutableSpace;
  requestedAssigneeAgentId?: string;
  pattern?: OrchestrationPattern;
};

const METRIC_DISPATCH_TOTAL = 'coordination_dispatch_total';
const METRIC_DISPATCH_BLOCKED = 'coordination_dispatch_blocked_total';

export class DispatchManager {
  constructor(private readonly deps: DispatchManagerDeps) {}

  /**
   * Dispatch a task: load snapshot, plan, commit. Returns the decision (which
   * may be a blocked route) or a typed error.
   */
  async dispatch(
    request: DispatchTaskRequest,
  ): Promise<Result<DispatchDecision, CoordinationError>> {
    try {
      return await this.dispatchInner(request);
    } catch (value: unknown) {
      return err(toCoordinationError(value));
    }
  }

  private async dispatchInner(
    request: DispatchTaskRequest,
  ): Promise<Result<DispatchDecision, CoordinationError>> {
    const { task } = request;
    const now = this.deps.clock.iso();

    // ── policy gate (deny is terminal) ─────────────────────────────────────────
    const policy = await this.deps.policyGate.evaluate({
      action: 'dispatch_task',
      spaceId: task.spaceId,
      taskId: task.taskId,
    });
    if (!policy.allowed) {
      this.deps.metrics.increment(METRIC_DISPATCH_BLOCKED, { reason: 'policy_denied' });
      return err(
        new CoordinationError(
          CoordinationErrorCode.POLICY_DENIED,
          policy.reason ?? 'dispatch denied by policy',
          { taskId: task.taskId, spaceId: task.spaceId },
        ),
      );
    }

    // ── load snapshot ──────────────────────────────────────────────────────────
    const [agents, dependencyEdges, existingClaim, presenceList] = await Promise.all([
      this.deps.agentDirectory.listForSpace(task.spaceId),
      this.deps.dependencyStore.dependenciesOf(task.taskId),
      this.deps.claimStore.getByTask(task.taskId),
      this.deps.presenceStore.list(),
    ]);
    const upstreamIds = dependencyEdges
      .filter((edge) => edge.kind === 'blocks')
      .map((edge) => edge.dependsOnTaskId);
    const upstreamStates =
      upstreamIds.length > 0 ? await this.deps.dependencyStore.taskStates(upstreamIds) : [];

    const presenceByAgentId: Record<string, PresenceStatus> = {};
    for (const presence of presenceList) {
      presenceByAgentId[presence.agentId] = presence.status;
    }

    // ── plan (pure) ──────────────────────────────────────────────────────────────
    const fenceToken = await this.deps.fencer.issue(this.fenceScopeKey(task));
    const claimId = this.deps.ids.claimId();
    const decision = planDispatch({
      routing: {
        task,
        agents,
        space: request.space,
        requestedAssigneeAgentId: request.requestedAssigneeAgentId,
      },
      routeOptions: { presenceByAgentId },
      pattern: request.pattern,
      dependencyEdges,
      upstreamStates,
      existingClaim,
      maxConcurrency: this.deps.config.maxConcurrency,
      claimId,
      fenceToken,
      idempotencyKey: this.idempotencyKey(task, now),
      now,
      leaseMs: this.deps.config.leaseMs,
      recoveryWindowMs: this.deps.config.recoveryWindowMs,
      dryRun: this.deps.config.dispatchDryRun,
    });

    // ── blocked route → ok decision, no commit ───────────────────────────────────
    if (decision.route.blocked || !decision.route.selectedAgentId) {
      this.deps.metrics.increment(METRIC_DISPATCH_BLOCKED, { reason: 'no_eligible_agent' });
      return ok(decision);
    }

    // ── dry-run → ok decision, no commit ─────────────────────────────────────────
    if (this.deps.config.dispatchDryRun) {
      return ok(decision);
    }

    // ── commit: claim CAS first (exactly-one-winner) ─────────────────────────────
    const committed = await this.deps.claimStore.compareAndSet(decision.claim);
    if (!committed) {
      // Another dispatch won the race; re-read to name the holder.
      const holder = await this.deps.claimStore.getByTask(task.taskId);
      this.deps.metrics.increment(METRIC_DISPATCH_BLOCKED, { reason: 'claim_lost' });
      return err(
        new ClaimConflictError(
          task.taskId,
          holder?.agentId ?? 'unknown',
          holder?.claimId ?? asClaimId('unknown'),
        ),
      );
    }

    // ── commit: lock reservations (CAS per scope) ────────────────────────────────
    await this.commitLocks(decision, now);

    this.deps.metrics.increment(METRIC_DISPATCH_TOTAL, { pattern: decision.pattern });
    return ok({ ...decision, claim: committed });
  }

  private async commitLocks(decision: DispatchDecision, now: string): Promise<void> {
    for (const reservation of decision.locks) {
      await this.deps.lockStore.put({
        lockId: this.deps.ids.lockId(),
        spaceId: reservation.spaceId,
        repo: reservation.repo,
        pathGlob: reservation.pathGlob,
        ownerAgentId: reservation.ownerAgentId,
        taskId: reservation.taskId,
        acquiredAt: now,
        expiresAt: now,
        fenceToken: decision.claim.fenceToken,
        kind: reservation.kind,
      });
    }
  }

  /** Effects the engine effect-runner would interpret for this decision. */
  effectsFor(decision: DispatchDecision): Effect[] {
    return decision.effects;
  }

  private fenceScopeKey(task: RoutableTask): string {
    return hashParts([task.spaceId, task.targetPaths.join(',')]);
  }

  private idempotencyKey(task: RoutableTask, now: string): string {
    return hashParts([task.spaceId, task.taskId, now]);
  }
}
