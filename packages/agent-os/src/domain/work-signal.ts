export type WorkSignalSeverity = 'critical' | 'high' | 'medium' | 'low';
export type WorkSignalStatus = 'open' | 'resolved';
export type WorkSignalSource =
  | 'task'
  | 'task_run'
  | 'approval'
  | 'artifact'
  | 'github_delivery'
  | 'policy_decision'
  | 'runtime_evidence';

export type WorkSignalReason =
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
  | 'runtime_evidence_failed';

export const WORK_SIGNAL_SEVERITIES: readonly WorkSignalSeverity[] = [
  'critical',
  'high',
  'medium',
  'low',
] as const;

export const WORK_SIGNAL_STATUSES: readonly WorkSignalStatus[] = [
  'open',
  'resolved',
] as const;

export const WORK_SIGNAL_SOURCES: readonly WorkSignalSource[] = [
  'task',
  'task_run',
  'approval',
  'artifact',
  'github_delivery',
  'policy_decision',
  'runtime_evidence',
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
