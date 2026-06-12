import type {
  Approval,
  Artifact,
  GitHubDeliveryLink,
  PolicyDecision,
  RuntimeEvidence,
  TaskRun,
  TaskSpec,
  WorkSignal,
  WorkSignalReason,
  WorkSignalSeverity,
  WorkSignalSource,
} from '../domain';

export type DetectWorkSignalsInput = {
  tasks: TaskSpec[];
  runs: TaskRun[];
  artifacts: Artifact[];
  approvals: Approval[];
  githubDeliveryLinks: GitHubDeliveryLink[];
  runtimeEvidence: RuntimeEvidence[];
  policyDecisions: PolicyDecision[];
  existingSignals?: WorkSignal[];
  now?: string;
  staleRunHours?: number;
  staleApprovalHours?: number;
  approvedNotMergedHours?: number;
};

const ACTIVE_STATES: TaskRun['state'][] = [
  'created',
  'compiled',
  'routed',
  'claimed',
  'running',
  'needs_input',
  'verifying',
  'waiting_for_approval',
  'approved',
  'delivered',
];

const DEFAULT_STALE_RUN_HOURS = 24;
const DEFAULT_STALE_APPROVAL_HOURS = 24;
const DEFAULT_APPROVED_NOT_MERGED_HOURS = 24;

export class WorkSignalService {
  detect(input: DetectWorkSignalsInput): WorkSignal[] {
    const now = input.now ?? new Date().toISOString();
    const existingById = new Map((input.existingSignals ?? []).map((signal) => [signal.signalId, signal]));
    const tasksById = new Map(input.tasks.map((task) => [task.taskId, task]));
    const artifactsByTask = groupBy(input.artifacts, (artifact) => artifact.taskId);
    const githubLinksByTask = groupBy(input.githubDeliveryLinks, (link) => link.taskId);
    const signals: WorkSignal[] = [];

    for (const task of input.tasks) {
      const taskLinks = githubLinksByTask.get(task.taskId) ?? [];
      if (isHighPriorityTask(task) && task.artifactRequired.includes('pull_request') && taskLinks.length === 0) {
        signals.push(this.merge(existingById, createSignal({
          task,
          source: 'task',
          sourceId: task.taskId,
          reason: 'high_priority_without_pr',
          severity: 'high',
          title: `High-priority task has no PR: ${task.title}`,
          whyItMatters: 'High-priority work with no linked PR is invisible to the delivery loop and cannot be reviewed or merged.',
          recommendedNextAction: 'Create or link the pull request, then attach it as the required task artifact.',
          now,
          metadata: { priority: task.metadata?.priority ?? task.metadata?.urgency },
        })));
      }
    }

    for (const run of input.runs) {
      const task = tasksById.get(run.taskId);
      if (run.state === 'failed') {
        signals.push(this.merge(existingById, createSignal({
          task,
          run,
          source: 'task_run',
          sourceId: run.runId,
          reason: 'run_failed',
          severity: 'high',
          title: `Run failed: ${task?.title ?? run.taskId}`,
          whyItMatters: 'A failed run blocks the task from producing a trustworthy artifact.',
          recommendedNextAction: 'Open the run history, inspect the last failure evidence, and assign a coding or verification agent to repair it.',
          now,
        })));
      }

      if (ACTIVE_STATES.includes(run.state) && hoursBetween(run.updatedAt, now) >= (input.staleRunHours ?? DEFAULT_STALE_RUN_HOURS)) {
        const hours = hoursBetween(run.updatedAt, now);
        signals.push(this.merge(existingById, createSignal({
          task,
          run,
          source: 'task_run',
          sourceId: run.runId,
          reason: 'run_stale',
          severity: hours >= 48 ? 'high' : 'medium',
          title: `Run stale in ${run.state}: ${task?.title ?? run.taskId}`,
          whyItMatters: 'A stale run means the paid-user task timeline is no longer proving forward progress.',
          recommendedNextAction: 'Ask the assigned agent for a status update, transition the run, or reassign the task.',
          now,
          metadata: { staleHours: hours, runState: run.state },
        })));
      }

      if ((run.state === 'delivered' || run.state === 'completed') && task) {
        for (const missingKind of missingRequiredArtifacts(task, artifactsByTask.get(task.taskId) ?? [])) {
          signals.push(this.merge(existingById, createSignal({
            task,
            run,
            source: 'artifact',
            sourceId: `${task.taskId}:${missingKind}`,
            reason: 'missing_required_artifact',
            severity: missingKind === 'pull_request' || missingKind === 'preview' ? 'high' : 'medium',
            title: `Missing ${missingKind} artifact: ${task.title}`,
            whyItMatters: 'The launch loop depends on visible artifacts, not private agent claims.',
            recommendedNextAction: `Attach or generate the required ${missingKind} artifact before closing the task.`,
            now,
            metadata: { missingArtifactKind: missingKind },
          })));
        }
      }
    }

    for (const approval of input.approvals) {
      if ((approval.status === 'pending' || approval.status === 'escalated') && hoursBetween(approval.requestedAt, now) >= (input.staleApprovalHours ?? DEFAULT_STALE_APPROVAL_HOURS)) {
        const task = tasksById.get(approval.taskId);
        signals.push(this.merge(existingById, createSignal({
          task,
          run: approval.runId ? input.runs.find((run) => run.runId === approval.runId) : undefined,
          source: 'approval',
          sourceId: approval.approvalId,
          reason: 'waiting_for_approval',
          severity: approval.status === 'escalated' ? 'high' : 'medium',
          title: `Approval waiting: ${task?.title ?? approval.taskId}`,
          whyItMatters: 'Pending approval pauses agent delivery and blocks the human-in-the-loop control path.',
          recommendedNextAction: 'Route the approval to the responsible human, or reject it with a concrete reason so the agent can continue.',
          now,
          metadata: { approvalStatus: approval.status, requiredAt: approval.requiredAt },
        })));
      }
    }

    for (const link of input.githubDeliveryLinks) {
      const task = tasksById.get(link.taskId);
      if (link.status === 'blocked') {
        signals.push(this.merge(existingById, createSignal({
          task,
          run: link.runId ? input.runs.find((run) => run.runId === link.runId) : undefined,
          source: 'github_delivery',
          sourceId: `${link.linkId}:blocked`,
          reason: 'github_delivery_blocked',
          severity: 'high',
          title: `GitHub delivery blocked: ${task?.title ?? link.taskId}`,
          whyItMatters: 'A blocked delivery link means the PR path cannot progress until the blocker is explicitly cleared.',
          recommendedNextAction: 'Inspect the linked branch or PR, record the blocker, and assign the smallest repair task that can unblock delivery.',
          now,
          metadata: { repository: link.repository, branch: link.branch, pullRequestUrl: link.pullRequestUrl },
        })));
      }

      if (link.status === 'checks_failed' || link.checks.some((check) => check.state === 'failure' || check.state === 'action_required')) {
        signals.push(this.merge(existingById, createSignal({
          task,
          run: link.runId ? input.runs.find((run) => run.runId === link.runId) : undefined,
          source: 'github_delivery',
          sourceId: link.linkId,
          reason: 'github_checks_failed',
          severity: 'high',
          title: `PR checks failing: ${task?.title ?? link.taskId}`,
          whyItMatters: 'A PR with failing checks cannot safely reach approval or merge.',
          recommendedNextAction: 'Send a coding agent to inspect the failing check logs and push a fix to the linked branch.',
          now,
          metadata: { repository: link.repository, branch: link.branch, pullRequestUrl: link.pullRequestUrl },
        })));
      }

      if (link.status === 'review_required' || link.reviews.some((review) => review.state === 'changes_requested')) {
        signals.push(this.merge(existingById, createSignal({
          task,
          run: link.runId ? input.runs.find((run) => run.runId === link.runId) : undefined,
          source: 'github_delivery',
          sourceId: `${link.linkId}:review`,
          reason: 'github_review_changes_requested',
          severity: 'high',
          title: `PR review needs changes: ${task?.title ?? link.taskId}`,
          whyItMatters: 'Requested changes mean the artifact is not accepted and the task remains blocked.',
          recommendedNextAction: 'Compile the review comments into a repair task and assign the implementation agent.',
          now,
          metadata: { repository: link.repository, branch: link.branch, pullRequestUrl: link.pullRequestUrl },
        })));
      }

      const approvedNotMergedHours = hoursBetween(link.updatedAt, now);
      if (isApprovedNotMerged(link) && approvedNotMergedHours >= (input.approvedNotMergedHours ?? DEFAULT_APPROVED_NOT_MERGED_HOURS)) {
        signals.push(this.merge(existingById, createSignal({
          task,
          run: link.runId ? input.runs.find((run) => run.runId === link.runId) : undefined,
          source: 'github_delivery',
          sourceId: `${link.linkId}:approved`,
          reason: 'approved_not_merged',
          severity: approvedNotMergedHours >= 48 ? 'high' : 'medium',
          title: `Approved PR not merged: ${task?.title ?? link.taskId}`,
          whyItMatters: 'An approved PR that sits unmerged keeps completed work out of production and creates stale context for agents.',
          recommendedNextAction: 'Confirm checks are still green, merge if policy allows, or reopen the task with the exact merge blocker.',
          now,
          metadata: {
            staleHours: approvedNotMergedHours,
            repository: link.repository,
            branch: link.branch,
            pullRequestUrl: link.pullRequestUrl,
          },
        })));
      }
    }

    for (const evidence of input.runtimeEvidence) {
      if (evidence.status === 'failed') {
        const task = tasksById.get(evidence.taskId);
        signals.push(this.merge(existingById, createSignal({
          task,
          run: evidence.runId ? input.runs.find((run) => run.runId === evidence.runId) : undefined,
          source: 'runtime_evidence',
          sourceId: evidence.evidenceId,
          reason: 'runtime_evidence_failed',
          severity: evidence.kind === 'verification' || evidence.kind === 'browser_check' ? 'high' : 'medium',
          title: `Runtime evidence failed: ${evidence.title}`,
          whyItMatters: 'Failed runtime evidence makes the task output untrustworthy until it is explained or repaired.',
          recommendedNextAction: 'Open the evidence record, inspect the command or browser check, and rerun after fixing the cause.',
          now,
          metadata: { evidenceKind: evidence.kind, evidenceTitle: evidence.title },
        })));
      }
    }

    for (const decision of input.policyDecisions) {
      if (decision.effect === 'deny' && decision.taskId) {
        const task = tasksById.get(decision.taskId);
        signals.push(this.merge(existingById, createSignal({
          task,
          source: 'policy_decision',
          sourceId: decision.decisionId,
          reason: 'policy_denied',
          severity: 'critical',
          title: `Policy denied ${decision.action}: ${task?.title ?? decision.taskId}`,
          whyItMatters: 'A denied policy action is a hard stop; continuing outside policy would break the audit boundary.',
          recommendedNextAction: 'Review the denied action, adjust the task or policy if appropriate, and re-run through the approved path.',
          now,
          metadata: { action: decision.action, actorAgentId: decision.actorAgentId },
        })));
      }
    }

    return signals.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.detectedAt.localeCompare(b.detectedAt));
  }

  resolve(signal: WorkSignal, input: { resolvedBy: string; resolvedAt?: string }): WorkSignal {
    return {
      ...signal,
      status: 'resolved',
      resolvedBy: input.resolvedBy,
      resolvedAt: input.resolvedAt ?? new Date().toISOString(),
    };
  }

  private merge(existingById: Map<string, WorkSignal>, signal: WorkSignal): WorkSignal {
    const existing = existingById.get(signal.signalId);
    if (!existing) {
      return signal;
    }
    return {
      ...signal,
      status: existing.status,
      resolvedAt: existing.resolvedAt,
      resolvedBy: existing.resolvedBy,
      detectedAt: existing.detectedAt,
      metadata: {
        ...(signal.metadata ?? {}),
        ...(existing.metadata ?? {}),
      },
    };
  }
}

function createSignal(input: {
  task?: TaskSpec;
  run?: TaskRun;
  source: WorkSignalSource;
  sourceId: string;
  reason: WorkSignalReason;
  severity: WorkSignalSeverity;
  title: string;
  whyItMatters: string;
  recommendedNextAction: string;
  now: string;
  metadata?: Record<string, unknown>;
}): WorkSignal {
  const taskId = input.task?.taskId ?? input.run?.taskId ?? input.sourceId;
  const signalId = `signal_${input.reason}_${taskId}_${slug(input.sourceId)}`;
  return {
    signalId,
    taskId,
    runId: input.run?.runId,
    spaceId: input.task?.spaceId ?? input.run?.spaceId,
    source: input.source,
    sourceId: input.sourceId,
    title: input.title,
    severity: input.severity,
    status: 'open',
    detectedReason: input.reason,
    whyItMatters: input.whyItMatters,
    recommendedNextAction: input.recommendedNextAction,
    agentHandoffPrompt: buildHandoffPrompt(input.title, input.whyItMatters, input.recommendedNextAction),
    detectedAt: input.now,
    metadata: {
      generatedBy: 'work_signal_service',
      ...(input.metadata ?? {}),
    },
  };
}

function missingRequiredArtifacts(task: TaskSpec, artifacts: Artifact[]): string[] {
  const presentKinds = new Set(artifacts.map((artifact) => artifact.kind));
  return task.artifactRequired.filter((kind) => !presentKinds.has(kind as Artifact['kind']));
}

function isHighPriorityTask(task: TaskSpec): boolean {
  const priority = task.metadata?.priority ?? task.metadata?.urgency;
  return priority === 'critical' || priority === 'high' || priority === 'p0' || priority === 'p1';
}

function isApprovedNotMerged(link: GitHubDeliveryLink): boolean {
  if (link.status === 'merged' || link.status === 'closed' || link.status === 'blocked') {
    return false;
  }
  return link.status === 'ready_for_approval' || link.reviews.some((review) => review.state === 'approved');
}

function hoursBetween(from: string, to: string): number {
  const fromTime = Date.parse(from);
  const toTime = Date.parse(to);
  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) {
    return 0;
  }
  return Math.floor((toTime - fromTime) / (60 * 60 * 1000));
}

function groupBy<T>(values: T[], getKey: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = getKey(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

function severityRank(severity: WorkSignalSeverity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[severity];
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'unknown';
}

function buildHandoffPrompt(title: string, whyItMatters: string, recommendedNextAction: string): string {
  return [
    'A Recoder work signal needs attention.',
    '',
    `Signal: ${title}`,
    `Why it matters: ${whyItMatters}`,
    `Recommended next action: ${recommendedNextAction}`,
    '',
    'Inspect the linked task/run/artifacts first. Do not claim completion until the signal condition is cleared or explicitly resolved by a human.',
  ].join('\n');
}
