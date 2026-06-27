/**
 * WorkSignal — the truthful-drift signal surfaced to humans/agents.
 *
 * MERGED from `packages/agent-os/src/domain/work-signal.ts` (the full shape with
 * `whyItMatters`, `recommendedNextAction`, `agentHandoffPrompt`, severity,
 * status, source). EXTENDED with coordination-specific reasons
 * (`lock_conflict`, `claim_lost`, `duplicate_claim`, `overlapping_locks`,
 * `handoff_stuck`, `dependency_violation`, `presence_stale`). Existing reasons
 * are preserved so downstream agent-os consumers keep working.
 */

export type WorkSignalSeverity = 'critical' | 'high' | 'medium' | 'low';
export type WorkSignalStatus = 'open' | 'resolved';

export type WorkSignalSource =
  | 'task'
  | 'task_run'
  | 'approval'
  | 'artifact'
  | 'github_delivery'
  | 'policy_decision'
  | 'runtime_evidence'
  | 'work_lock'
  | 'task_claim'
  | 'handoff'
  | 'squad'
  | 'presence'
  | 'coherence';

/** Preserved agent-os reasons + coordination-specific additions. */
export type WorkSignalReason =
  // ── preserved from agent-os ──
  | 'run_stale'
  | 'run_failed'
  | 'waiting_for_approval'
  | 'missing_required_artifact'
  | 'github_checks_failed'
  | 'github_review_changes_requested'
  | 'github_delivery_blocked'
  | 'approved_not_merged'
  | 'high_priority_without_pr'
  | 'policy_denied'
  | 'runtime_evidence_failed'
  // ── added for coordination ──
  | 'lock_conflict'
  | 'claim_lost'
  | 'duplicate_claim'
  | 'overlapping_locks'
  | 'handoff_stuck'
  | 'dependency_violation'
  | 'presence_stale';

export const WORK_SIGNAL_SEVERITIES: readonly WorkSignalSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
] as const;

export const WORK_SIGNAL_STATUSES: readonly WorkSignalStatus[] = ['open', 'resolved'] as const;

export const WORK_SIGNAL_SOURCES: readonly WorkSignalSource[] = [
  'task',
  'task_run',
  'approval',
  'artifact',
  'github_delivery',
  'policy_decision',
  'runtime_evidence',
  'work_lock',
  'task_claim',
  'handoff',
  'squad',
  'presence',
  'coherence',
] as const;

export const COORDINATION_WORK_SIGNAL_REASONS: readonly WorkSignalReason[] = [
  'lock_conflict',
  'claim_lost',
  'duplicate_claim',
  'overlapping_locks',
  'handoff_stuck',
  'dependency_violation',
  'presence_stale',
] as const;

export const WORK_SIGNAL_REASONS: readonly WorkSignalReason[] = [
  'run_stale',
  'run_failed',
  'waiting_for_approval',
  'missing_required_artifact',
  'github_checks_failed',
  'github_review_changes_requested',
  'github_delivery_blocked',
  'approved_not_merged',
  'high_priority_without_pr',
  'policy_denied',
  'runtime_evidence_failed',
  ...COORDINATION_WORK_SIGNAL_REASONS,
] as const;

export type WorkSignal = {
  signalId: string;
  taskId: string;
  runId?: string;
  spaceId?: string;
  source: WorkSignalSource;
  sourceId: string;
  title: string;
  severity: WorkSignalSeverity;
  status: WorkSignalStatus;
  detectedReason: WorkSignalReason;
  whyItMatters: string;
  recommendedNextAction: string;
  agentHandoffPrompt: string;
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  metadata?: Record<string, unknown>;
};
