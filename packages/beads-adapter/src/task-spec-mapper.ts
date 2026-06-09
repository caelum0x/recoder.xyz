import type { TaskIntent, TaskSpec } from '@recoder/agent-os';
import { parseBeadsTaskMetadata, type BeadsIssue } from './beads-parser';

const ISSUE_TYPE_TO_INTENT: Record<string, TaskIntent> = {
  bug: 'bugfix',
  feature: 'feature_delivery',
  task: 'platform_hardening',
  chore: 'platform_hardening',
  epic: 'custom',
  review: 'code_review',
  test: 'test_generation',
  docs: 'documentation',
  research: 'research',
};

function normalizeIntent(issue: BeadsIssue, metadataIntent?: string): TaskIntent {
  const requested = metadataIntent ?? issue.issue_type ?? 'task';
  return ISSUE_TYPE_TO_INTENT[requested] ?? (requested as TaskIntent);
}

export type BeadsToTaskSpecInput = {
  issue: BeadsIssue;
  repo?: string;
  spaceId: string;
  defaultTargetPaths?: string[];
  defaultForbiddenPaths?: string[];
};

export function beadsIssueToTaskSpec(input: BeadsToTaskSpecInput): TaskSpec {
  const metadata = parseBeadsTaskMetadata(input.issue);
  const description = input.issue.description?.trim();

  return {
    taskId: input.issue.id,
    title: input.issue.title,
    intent: normalizeIntent(input.issue, metadata.intent),
    goal: description || input.issue.title,
    spaceId: input.spaceId,
    repo: input.repo,
    branchPolicy: 'create_worktree_branch',
    targetPaths: metadata.targetPaths.length > 0
      ? metadata.targetPaths
      : input.defaultTargetPaths ?? ['**/*'],
    forbiddenPaths: metadata.forbiddenPaths.length > 0
      ? metadata.forbiddenPaths
      : input.defaultForbiddenPaths ?? ['.env*', 'secrets/**'],
    acceptanceCriteria: [input.issue.title],
    verification: {
      commands: metadata.verify,
      evidenceRequired: ['delivery_summary'],
    },
    approvalRequired: metadata.approvalRequired,
    artifactRequired: metadata.requiredArtifacts.length > 0
      ? metadata.requiredArtifacts
      : ['summary', 'changed_files'],
    metadata: {
      source: 'beads',
      beadsIssueId: input.issue.id,
      beadsStatus: input.issue.status,
      beadsPriority: input.issue.priority,
      runtimeHint: metadata.runtimeHint,
      reviewRuntime: metadata.reviewRuntime,
      risk: metadata.risk,
      dependsOn: metadata.dependsOn,
    },
  };
}

export function taskSpecToBeadsMetadata(task: TaskSpec): string {
  return [
    `intent: ${task.intent}`,
    `target_paths: ${task.targetPaths.join(', ')}`,
    `forbidden_paths: ${task.forbiddenPaths.join(', ')}`,
    `verify: ${task.verification.commands.join(', ')}`,
    `artifacts: ${task.artifactRequired.join(', ')}`,
    `approval_required: ${task.approvalRequired.join(', ')}`,
  ].join('\n');
}
