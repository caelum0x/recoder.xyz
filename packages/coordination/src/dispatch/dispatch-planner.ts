/**
 * dispatch-planner — the pure heart of dispatch: `(DispatchRequest, Snapshot) →
 * DispatchDecision`.
 *
 * Design §5.1 (in order):
 *   1. dependency-resolver — deps terminal? else throw DependencyBlockedError.
 *   2. duplicate-guard      — already claimed? else throw ClaimConflictError.
 *   3. routing-service      — rank candidates → selected agent (or blocked).
 *   4. orchestration        — pattern → plan (slots).
 *   5. compute lock scope from the plan slots → LockReservation[].
 *   6. build DispatchDecision { route, claim, locks[], effects[] }.
 *
 * The decision bundles route + claim + locks so dispatch and lock-claim are
 * decided together (you cannot dispatch a writer without reserving its paths).
 * The effects are committed atomically by the manager via the effect-runner;
 * the planner performs NO IO and only emits intent.
 *
 * Throws typed `CoordinationError`s on a hard block; the engine edge maps them
 * to a `Result` (design §9). The lock CONFLICT check itself happens at commit
 * time in the LockService/store — the planner only computes reservations.
 */

import type {
  DispatchDecision,
  Effect,
  LockReservation,
  OrchestrationPattern,
  RoutingDecision,
  TaskClaim,
} from '../domain';
import { ClaimConflictError } from '../errors/claim-conflict-error';
import { DependencyBlockedError } from '../errors/dependency-blocked-error';
import { ClaimCoordinator } from './claim-coordinator';
import { checkDuplicate } from './duplicate-guard';
import { resolveDependencies } from './dependency-resolver';
import { planOrchestration } from './orchestration/orchestrator';
import type { DispatchSlot } from './orchestration/plan';
import { route, type RouteOptions } from './routing-service';
import type { RoutingRequest } from './routing-request';
import type { DependencyEdge, TaskNode } from '../domain';

/** Everything the planner reads, loaded by the manager (a pure snapshot). */
export type DispatchPlannerInput = {
  routing: RoutingRequest;
  routeOptions?: RouteOptions;
  /** Orchestration pattern (defaults to 'direct'). */
  pattern?: OrchestrationPattern;
  /** Dependency edges of the task. */
  dependencyEdges: DependencyEdge[];
  /** States of the task's upstream dependencies. */
  upstreamStates: TaskNode[];
  /** The current live claim on the task, if any (for the duplicate guard). */
  existingClaim?: TaskClaim;
  /** Max parallel slots (space concurrency cap). */
  maxConcurrency: number;
  /** Pre-generated claim id (IdGeneratorPort, supplied by the manager). */
  claimId: string;
  /** Pre-issued fence token (LeaseFencerPort, supplied by the manager). */
  fenceToken: number;
  /** Idempotency key for the claim. */
  idempotencyKey: string;
  /** Deterministic now (ClockPort). */
  now: string;
  /** Claim lease length (ms). */
  leaseMs: number;
  /** Claim recovery window (ms). */
  recoveryWindowMs: number;
  /** When true, compute the decision but emit no commit effects (dry-run flag). */
  dryRun?: boolean;
};

const coordinator = new ClaimCoordinator();

/** Build lock reservations from the plan slots over the task's scope. */
function reservationsFromSlots(
  slots: DispatchSlot[],
  spaceId: string,
  taskId: string,
  repo?: string,
): LockReservation[] {
  const reservations: LockReservation[] = [];
  for (const slot of slots) {
    for (const pathGlob of slot.pathGlobs) {
      reservations.push({
        spaceId,
        repo,
        pathGlob,
        ownerAgentId: slot.agentId,
        taskId,
        kind: slot.lockKind,
      });
    }
  }
  return reservations;
}

/** Build the commit effects for a dispatch decision (empty on dry-run). */
function buildEffects(
  decision: Omit<DispatchDecision, 'effects'>,
  dryRun: boolean,
): Effect[] {
  if (dryRun) {
    return [];
  }
  const effects: Effect[] = [{ type: 'CommitClaim', claim: decision.claim }];
  effects.push({
    type: 'NotifyAgent',
    agentId: decision.claim.agentId,
    claimId: decision.claim.claimId,
    taskId: decision.taskId,
  });
  return effects;
}

export function planDispatch(input: DispatchPlannerInput): DispatchDecision {
  const task = input.routing.task;
  const spaceId = task.spaceId;
  const taskId = task.taskId;

  // 1. dependency gate ────────────────────────────────────────────────────────
  const resolution = resolveDependencies(taskId, input.dependencyEdges, input.upstreamStates);
  if (!resolution.ready) {
    throw new DependencyBlockedError(taskId, resolution.unmetDependencyTaskIds);
  }

  // 2. duplicate-work gate ─────────────────────────────────────────────────────
  const duplicate = checkDuplicate(input.existingClaim, input.now, input.recoveryWindowMs);
  if (duplicate.duplicate) {
    throw new ClaimConflictError(taskId, duplicate.heldByAgentId, duplicate.existingClaimId);
  }

  // 3. routing ─────────────────────────────────────────────────────────────────
  const routing: RoutingDecision = route(input.routing, input.routeOptions);
  if (routing.blocked || !routing.selectedAgentId) {
    // Blocked route is not an exception — it is a decision with no claim. The
    // manager surfaces it (policy findings / no eligible candidate) without
    // committing anything. We still return a decision so the caller sees why.
    return {
      taskId,
      spaceId,
      pattern: input.pattern ?? 'direct',
      route: routing,
      claim: blockedClaim(input, taskId, spaceId),
      locks: [],
      effects: [],
    };
  }

  // 4. orchestration ───────────────────────────────────────────────────────────
  const pattern = input.pattern ?? 'direct';
  const rankedAgentIds = routing.candidates
    .filter((candidate) => candidate.eligible)
    .map((candidate) => candidate.agentId);
  const plan = planOrchestration(pattern, {
    taskId,
    rankedAgentIds,
    targetPaths: task.targetPaths,
    maxConcurrency: input.maxConcurrency,
    aggregation: undefined,
  });

  // 5. lock reservations from the plan ─────────────────────────────────────────
  const locks = reservationsFromSlots(plan.slots, spaceId, taskId);

  // 6. claim + decision ────────────────────────────────────────────────────────
  const claim = coordinator.buildClaim({
    claimId: input.claimId,
    taskId,
    spaceId,
    agentId: routing.selectedAgentId,
    fenceToken: input.fenceToken,
    idempotencyKey: input.idempotencyKey,
    now: input.now,
    leaseMs: input.leaseMs,
  });

  const partial: Omit<DispatchDecision, 'effects'> = {
    taskId,
    spaceId,
    pattern,
    route: routing,
    claim,
    locks,
  };

  return { ...partial, effects: buildEffects(partial, input.dryRun ?? false) };
}

/** A placeholder claim for a blocked route (never committed; status 'lost'). */
function blockedClaim(input: DispatchPlannerInput, taskId: string, spaceId: string): TaskClaim {
  return {
    claimId: input.claimId,
    taskId,
    spaceId,
    agentId: '',
    status: 'lost',
    claimedAt: input.now,
    leaseUntil: input.now,
    fenceToken: input.fenceToken,
    idempotencyKey: input.idempotencyKey,
  };
}
