import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  Approval,
  Artifact,
  GitHubDeliveryLink,
  InstructionBundle,
  RunEvent,
  RuntimeEvidence,
  TaskRun,
  TaskSpec,
  WorkSignal,
} from '../domain';
import { RunHistoryService } from './run-history-service';

test('RunHistoryService builds one paid-user delivery timeline from control-plane records', () => {
  const task: TaskSpec = {
    taskId: 'task-paid-user-delivery',
    title: 'Deliver paid-user task',
    intent: 'feature_delivery',
    goal: 'Ship a verified change through PR and preview.',
    spaceId: 'space-1',
    repo: 'recoder/recoder.xyz',
    targetPaths: ['app'],
    forbiddenPaths: [],
    acceptanceCriteria: ['Preview works', 'PR is ready for approval'],
    verification: { commands: ['pnpm test'] },
    approvalRequired: ['before_pr'],
    artifactRequired: ['pull_request', 'preview', 'verification'],
  };
  const run: TaskRun = {
    runId: 'run-1',
    taskId: task.taskId,
    spaceId: task.spaceId,
    state: 'waiting_for_approval',
    assigneeAgentId: 'codex',
    instructionBundleId: 'bundle-1',
    updatedAt: '2026-06-13T10:09:00.000Z',
  };
  const events: RunEvent[] = [
    {
      eventId: 'event-started',
      type: 'started',
      taskId: task.taskId,
      runId: run.runId,
      agentId: 'codex',
      message: 'Runtime session started',
      createdAt: '2026-06-13T10:01:00.000Z',
    },
  ];
  const artifacts: Artifact[] = [
    {
      artifactId: 'artifact-pr',
      taskId: task.taskId,
      runId: run.runId,
      kind: 'pull_request',
      mimeType: 'application/json',
      public: true,
      createdAt: '2026-06-13T10:06:00.000Z',
      createdBy: 'github-webhook',
      metadata: {
        url: 'https://github.com/recoder/recoder.xyz/pull/42',
        number: 42,
        repository: 'recoder/recoder.xyz',
      },
    },
    {
      artifactId: 'artifact-preview',
      taskId: task.taskId,
      runId: run.runId,
      kind: 'preview',
      mimeType: 'application/json',
      public: false,
      createdAt: '2026-06-13T10:07:00.000Z',
      createdBy: 'recoder-preview',
      metadata: {
        url: 'https://preview.recoder.xyz/task-paid-user-delivery',
      },
    },
  ];
  const runtimeEvidence: RuntimeEvidence[] = [
    {
      evidenceId: 'evidence-verification',
      taskId: task.taskId,
      runId: run.runId,
      kind: 'verification',
      status: 'passed',
      title: 'Verification passed',
      summary: 'pnpm test passed',
      source: {
        runtimeId: 'codex',
        sandboxId: 'sandbox-1',
        sessionId: 'session-1',
        command: 'pnpm test',
      },
      artifactIds: [],
      observedAt: '2026-06-13T10:05:00.000Z',
    },
  ];
  const approvals: Approval[] = [
    {
      approvalId: 'approval-before-pr',
      taskId: task.taskId,
      runId: run.runId,
      status: 'pending',
      reason: 'Human approval required before merge.',
      requestedBy: 'agent-os',
      requestedAt: '2026-06-13T10:08:00.000Z',
      requiredAt: 'before_pr',
    },
  ];
  const instructionBundles: InstructionBundle[] = [
    {
      bundleId: 'bundle-1',
      taskId: task.taskId,
      agentId: 'codex',
      runtime: 'codex',
      sharedGoal: task.goal,
      acceptanceCriteria: task.acceptanceCriteria,
      verificationCommands: task.verification.commands,
      forbiddenActions: [],
      approvalGateIds: ['approval-before-pr'],
      memoryRefIds: [],
      sourceRefs: [{ path: 'AGENTS.md', sha256: 'sha256:agents' }],
      compilerVersion: 'agent-os-compiler@1',
      compiledAt: '2026-06-13T10:00:00.000Z',
      renderedPrompt: 'compiled prompt',
    },
  ];
  const githubDeliveryLinks: GitHubDeliveryLink[] = [
    {
      linkId: 'github-delivery-1',
      taskId: task.taskId,
      runId: run.runId,
      spaceId: task.spaceId,
      repository: 'recoder/recoder.xyz',
      branch: 'recoder/task-paid-user-delivery',
      pullRequestArtifactId: 'artifact-pr',
      pullRequestUrl: 'https://github.com/recoder/recoder.xyz/pull/42',
      pullRequestNumber: 42,
      previewArtifactIds: ['artifact-preview'],
      checks: [{ name: 'test', state: 'success' }],
      reviews: [],
      status: 'ready_for_approval',
      createdAt: '2026-06-13T10:02:00.000Z',
      updatedAt: '2026-06-13T10:08:30.000Z',
      createdBy: 'agent-os',
    },
  ];

  const workSignals: WorkSignal[] = [
    {
      signalId: 'signal-waiting-approval',
      taskId: task.taskId,
      runId: run.runId,
      spaceId: task.spaceId,
      source: 'task_run',
      sourceId: run.runId,
      title: 'Run is waiting for human approval',
      severity: 'high',
      status: 'open',
      detectedReason: 'waiting_for_approval',
      whyItMatters: 'Delivery is blocked until a human approves before the PR merges.',
      recommendedNextAction: 'Review and approve approval-before-pr.',
      agentHandoffPrompt: 'Approve or reject the pending before_pr gate for run-1.',
      detectedAt: '2026-06-13T10:08:30.000Z',
    },
  ];

  const history = new RunHistoryService().build({
    run,
    task,
    events,
    artifacts,
    runtimeEvidence,
    approvals,
    instructionBundles,
    githubDeliveryLinks,
    workSignals,
  });

  assert.equal(history.counts.instructionBundles, 1);
  assert.equal(history.counts.runtimeEvidence, 1);
  assert.equal(history.counts.artifacts, 2);
  assert.equal(history.counts.githubDeliveryLinks, 1);
  assert.equal(history.counts.approvals, 1);
  assert.equal(history.counts.workSignals, 1);
  assert.deepEqual(history.latest.waitingApprovalIds, ['approval-before-pr']);
  assert.deepEqual(history.latest.previewArtifactIds, ['artifact-preview']);
  assert.deepEqual(history.latest.pullRequestArtifactIds, ['artifact-pr']);
  assert.deepEqual(history.latest.runtimeEvidenceIds, ['evidence-verification']);
  assert.deepEqual(history.latest.githubDeliveryLinkIds, ['github-delivery-1']);
  assert.deepEqual(history.latest.openWorkSignalIds, ['signal-waiting-approval']);
  assert.deepEqual(
    new Set(history.items.map((item) => item.kind)),
    new Set([
      'instruction_bundle',
      'run_event',
      'runtime_evidence',
      'artifact',
      'approval',
      'github_delivery_link',
      'run_state',
      'work_signal',
    ]),
  );
  assert.equal(
    history.items.find((item) => item.kind === 'github_delivery_link')?.severity,
    'success',
  );
  assert.equal(
    history.items.find((item) => item.kind === 'approval')?.severity,
    'warning',
  );
  const workSignalItem = history.items.find((item) => item.kind === 'work_signal');
  assert.equal(workSignalItem?.severity, 'warning');
  assert.equal(workSignalItem?.data?.agentHandoffPrompt, 'Approve or reject the pending before_pr gate for run-1.');
});
