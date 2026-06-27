/**
 * escalation — turns an "escalate" CoherenceFinding into a WorkSignal.
 *
 * This is the fusion seam between the coordination drift taxonomy (`DriftKind`)
 * and the agent-os WorkSignal vocabulary (`WorkSignalReason`/`WorkSignalSource`
 * + `whyItMatters`/`recommendedNextAction` copy). Each drift kind maps to a
 * coordination-specific reason added to the agent-os WorkSignal contract
 * (`lock_conflict`, `claim_lost`, `duplicate_claim`, `overlapping_locks`,
 * `handoff_stuck`, `dependency_violation`, `presence_stale`).
 *
 * Pure: `(finding, signalId) => WorkSignal`. The impure shell supplies the id.
 */

import type {
  CoherenceFinding,
  DriftKind,
  WorkSignal,
  WorkSignalReason,
  WorkSignalSource,
} from '../domain';
import { buildSignal, deterministicSignalId } from './signal-builder';

type EscalationTemplate = {
  reason: WorkSignalReason;
  source: WorkSignalSource;
  title: string;
  whyItMatters: string;
  recommendedNextAction: string;
};

/**
 * Per-drift escalation copy. The mapping is the contract: each unsafe drift
 * gets a stable reason + human-readable why/what so the WorkSignal is actionable
 * (per the frontend rule: show truthful control-plane state, not "AI is working").
 */
const TEMPLATES: Record<DriftKind, EscalationTemplate> = {
  lock_without_task: {
    reason: 'lock_conflict',
    source: 'work_lock',
    title: 'Work-lock outlives its task',
    whyItMatters:
      'A lock whose task is terminal or missing blocks other agents from a path that no live work needs.',
    recommendedNextAction:
      'Confirm the owning task is truly done, then release the lock so the path is writable again.',
  },
  lock_expired_live_run: {
    reason: 'run_stale',
    source: 'work_lock',
    title: 'Lock expired while a run is still writing',
    whyItMatters:
      'The run lost its write fence: another agent could acquire the same path and the two would collide.',
    recommendedNextAction:
      'Renew or re-acquire the lock for the live run, or stop the run if it should no longer hold the path.',
  },
  claim_without_run: {
    reason: 'claim_lost',
    source: 'task_claim',
    title: 'Task claimed but no live run past the recovery window',
    whyItMatters:
      'A claim with no live run beyond the recovery window pins the task to an agent that is not making progress.',
    recommendedNextAction:
      'Release the stale claim so the task returns to the ready set and can be re-dispatched.',
  },
  run_without_claim: {
    reason: 'claim_lost',
    source: 'task_run',
    title: 'Run alive but its claim is gone',
    whyItMatters:
      'A live run with no claim has no fence token: a second dispatch could double-execute the same task.',
    recommendedNextAction:
      'Re-establish the claim for the live run and verify its fence token, or stop the orphaned run.',
  },
  duplicate_claim: {
    reason: 'duplicate_claim',
    source: 'task_claim',
    title: 'Two live claims on one task',
    whyItMatters:
      'Two agents both believe they own the task — this is duplicate work and a collision risk.',
    recommendedNextAction:
      'Keep the claim with the highest fence token and release the loser; verify only one run remains.',
  },
  stale_presence: {
    reason: 'presence_stale',
    source: 'presence',
    title: 'Agent reported busy but its heartbeat is dead',
    whyItMatters:
      'A busy-but-silent agent holds claims and locks that nothing is actually working.',
    recommendedNextAction:
      'Mark the agent offline and reclaim its work so the tasks return to the ready set.',
  },
  orphan_handoff: {
    reason: 'handoff_stuck',
    source: 'handoff',
    title: 'Handoff has no live target',
    whyItMatters:
      'A handoff whose target is missing or offline is lost work — the receiving agent will never pick it up.',
    recommendedNextAction:
      'Re-route the handoff to a live agent, or fail it explicitly so the source agent can recover.',
  },
  squad_member_drift: {
    reason: 'duplicate_claim',
    source: 'squad',
    title: 'Squad believes a member is busy but it is idle',
    whyItMatters:
      'The squad will not assign new work to a member it thinks is busy, starving the squad of capacity.',
    recommendedNextAction:
      'Reconcile the squad member status to idle so the leader can assign the next task.',
  },
  overlapping_active_locks: {
    reason: 'overlapping_locks',
    source: 'work_lock',
    title: 'Two active exclusive locks overlap the same path',
    whyItMatters:
      'This should be structurally impossible — if it is seen, a writer bypassed the coordination engine and a collision is imminent.',
    recommendedNextAction:
      'Investigate the bypassing writer immediately; release the younger lock and audit the path for conflicting writes.',
  },
  dep_violation: {
    reason: 'dependency_violation',
    source: 'task',
    title: 'Task dispatched before its dependencies were terminal',
    whyItMatters:
      'Work started on top of unfinished upstreams produces inconsistent results that must be redone.',
    recommendedNextAction:
      'Pause or stop the premature run, finish the blocking upstreams, then re-dispatch the task.',
  },
};

/** Build a WorkSignal for an escalating finding (id supplied by the shell). */
export function escalateFinding(finding: CoherenceFinding, signalId: string): WorkSignal {
  const template = TEMPLATES[finding.driftKind];
  const taskId = finding.taskId ?? finding.lockId ?? finding.claimId ?? finding.handoffId ?? 'unknown';
  const sourceId = primarySourceId(finding);
  return buildSignal({
    signalId,
    taskId,
    spaceId: finding.spaceId,
    source: template.source,
    sourceId,
    reason: template.reason,
    severity: finding.severity,
    title: template.title,
    whyItMatters: template.whyItMatters,
    recommendedNextAction: template.recommendedNextAction,
    detectedAt: finding.detectedAt,
    metadata: {
      driftKind: finding.driftKind,
      evidence: finding.evidence,
      lockId: finding.lockId,
      claimId: finding.claimId,
      handoffId: finding.handoffId,
      squadId: finding.squadId,
      agentId: finding.agentId,
    },
  });
}

/**
 * The deterministic id a finding's signal SHOULD have (reason + task + source),
 * so the same drift coalesces across ticks. The shell uses this to dedup against
 * already-open signals before allocating a fresh id.
 */
export function expectedSignalId(finding: CoherenceFinding): string {
  const template = TEMPLATES[finding.driftKind];
  const taskId = finding.taskId ?? finding.lockId ?? finding.claimId ?? finding.handoffId ?? 'unknown';
  return deterministicSignalId(template.reason, taskId, primarySourceId(finding));
}

/** Pick the most specific subject id as the signal's sourceId. */
function primarySourceId(finding: CoherenceFinding): string {
  return (
    finding.lockId ??
    finding.claimId ??
    finding.handoffId ??
    finding.squadId ??
    finding.agentId ??
    finding.taskId ??
    finding.driftKind
  );
}
