/**
 * coherence barrel — the SHARED-STATE COHERENCE module.
 *
 * Fuses the parts the three sources only partially had into one reconciler:
 *  - agent-os `WorkSignal` (whyItMatters/recommendedNextAction/agentHandoffPrompt)
 *    → `signal-builder` + `escalation`,
 *  - multica `squad_no_action` + `claimResponseRecoveryWindow`
 *    → `checks/squad-member-drift` + `checks/claim-without-run`,
 *  - A2A heartbeat-tracker timeout
 *    → `checks/stale-presence`.
 *
 * The reconciler runs every pure `checks/*` invariant over a CoordinationSnapshot,
 * auto-heals provably-safe drift, and escalates the rest as WorkSignals.
 */

// Snapshot + loader
export type {
  CoordinationSnapshot,
  SnapshotConfig,
  LiveRun,
  SquadMemberView,
} from './snapshot';
export {
  emptySnapshot,
  taskById,
  liveRunsByTask,
  presenceByAgent,
} from './snapshot';
export {
  loadSnapshot,
  type SnapshotLoaderDeps,
  type ClaimSnapshotPort,
  type RunProjectionPort,
  type SquadMemberViewPort,
} from './snapshot-loader';

// Checks
export {
  ALL_CHECKS,
  runAllChecks,
  type CoherenceCheck,
  type NamedCheck,
  checkClaimWithoutRun,
  checkDepViolation,
  checkDuplicateClaim,
  checkLockExpiredLiveRun,
  checkLockWithoutTask,
  checkOrphanHandoff,
  checkOverlappingActiveLocks,
  checkRunWithoutClaim,
  checkSquadMemberDrift,
  checkStalePresence,
} from './checks';

// Heal + escalation
export {
  buildHealEffects,
  healEffectsFor,
  isHealable,
} from './heal-actions';
export {
  escalateFinding,
  expectedSignalId,
} from './escalation';
export {
  buildSignal,
  buildHandoffPrompt,
  deterministicSignalId,
  slug,
  type BuildSignalInput,
} from './signal-builder';

// Pure reconcile core
export {
  reconcile,
  summarizeFindings,
  type ReconcileDeps,
  type ReconcileResult,
} from './reconciler';

// Impure shell + scheduling
export { Reconciler, type ReconcilerDeps } from './reconciler-service';
export {
  createIntervalScheduler,
  type ReconcileTrigger,
  type SchedulerHandle,
  type IntervalSchedulerOptions,
} from './reconcile-scheduler';
export {
  applyCoherenceEffect,
  applyCoherenceEffects,
  type CoherenceEffectPorts,
} from './coherence-effects';
