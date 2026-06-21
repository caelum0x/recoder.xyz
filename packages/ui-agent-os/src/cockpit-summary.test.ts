import assert from 'node:assert/strict';
import test from 'node:test';
import type { Artifact, RuntimeEvidence, TaskRun, WorkSignal } from '@recoder/agent-os';
import { buildAgentOsCockpitSummary } from './cockpit-summary';

test('buildAgentOsCockpitSummary projects compact instruction bundle artifact metadata', () => {
  const artifact: Artifact = {
    artifactId: 'artifact_instruction_bundle-1',
    taskId: 'task-1',
    runId: 'run-1',
    kind: 'instruction_bundle',
    mimeType: 'application/json',
    path: '.artifacts/task-1/instruction-bundle.json',
    contentHash: 'sha256:bundle-hash',
    public: false,
    createdAt: '2026-06-13T10:00:00.000Z',
    createdBy: 'codex',
    metadata: {
      bundleId: 'bundle-1',
      runtime: 'codex',
      compilerVersion: 'agent-os-compiler@1',
      sourceCount: 3,
      memoryRefCount: 2,
      approvalGateCount: 1,
    },
  };

  const summary = buildAgentOsCockpitSummary({
    artifacts: [
      artifact,
      {
        ...artifact,
        artifactId: 'artifact_summary_1',
        kind: 'summary',
      },
    ],
    now: '2026-06-13T10:01:00.000Z',
  });

  assert.deepEqual(summary.instructionBundleArtifacts, [
    {
      artifactId: 'artifact_instruction_bundle-1',
      taskId: 'task-1',
      runId: 'run-1',
      bundleId: 'bundle-1',
      path: '.artifacts/task-1/instruction-bundle.json',
      contentHash: 'sha256:bundle-hash',
      createdAt: '2026-06-13T10:00:00.000Z',
      createdBy: 'codex',
      compilerVersion: 'agent-os-compiler@1',
      runtime: 'codex',
      sourceCount: 3,
      memoryRefCount: 2,
      approvalGateCount: 1,
    },
  ]);
});

test('buildAgentOsCockpitSummary projects paid-user delivery evidence cards', () => {
  const evidence: RuntimeEvidence = {
    evidenceId: 'evidence-runtime-1',
    taskId: 'task-1',
    runId: 'run-1',
    kind: 'verification',
    status: 'passed',
    title: 'Runtime verification passed',
    summary: 'pnpm test passed',
    source: {
      runtimeId: 'codex:codex',
      adapterId: 'codex',
      sandboxId: 'sandbox-1',
      sessionId: 'session-1',
      command: 'pnpm test',
    },
    artifactIds: ['artifact-verification-1'],
    observedAt: '2026-06-13T10:02:00.000Z',
  };
  const pullRequest: Artifact = {
    artifactId: 'artifact-pr-1',
    taskId: 'task-1',
    runId: 'run-1',
    kind: 'pull_request',
    mimeType: 'application/json',
    public: false,
    createdAt: '2026-06-13T10:03:00.000Z',
    createdBy: 'codex',
    metadata: {
      url: 'https://github.com/recoder/recoder.xyz/pull/42',
      repository: 'recoder/recoder.xyz',
      branch: 'verify/paid-loop',
      number: 42,
    },
  };
  const preview: Artifact = {
    ...pullRequest,
    artifactId: 'artifact-preview-1',
    kind: 'preview',
    metadata: {
      url: 'https://preview.recoder.xyz/task-1',
      provider: 'recoder-preview',
      environment: 'verification',
    },
  };
  const verification: Artifact = {
    ...pullRequest,
    artifactId: 'artifact-verification-1',
    kind: 'verification',
    metadata: {
      passed: true,
    },
  };

  const summary = buildAgentOsCockpitSummary({
    runtimeEvidence: [evidence],
    artifacts: [pullRequest, preview, verification],
    now: '2026-06-13T10:04:00.000Z',
  });

  assert.deepEqual(summary.runtimeEvidence, [
    {
      evidenceId: 'evidence-runtime-1',
      taskId: 'task-1',
      runId: 'run-1',
      kind: 'verification',
      status: 'passed',
      title: 'Runtime verification passed',
      summary: 'pnpm test passed',
      observedAt: '2026-06-13T10:02:00.000Z',
      runtimeId: 'codex:codex',
      adapterId: 'codex',
      sandboxId: 'sandbox-1',
      sessionId: 'session-1',
      command: 'pnpm test',
      url: undefined,
      artifactIds: ['artifact-verification-1'],
    },
  ]);
  assert.deepEqual(summary.deliveryArtifacts, [
    {
      artifactId: 'artifact-pr-1',
      taskId: 'task-1',
      runId: 'run-1',
      kind: 'pull_request',
      url: 'https://github.com/recoder/recoder.xyz/pull/42',
      title: undefined,
      repository: 'recoder/recoder.xyz',
      branch: 'verify/paid-loop',
      number: 42,
      provider: undefined,
      environment: undefined,
      passed: undefined,
      createdAt: '2026-06-13T10:03:00.000Z',
      createdBy: 'codex',
    },

    {
      artifactId: 'artifact-preview-1',
      taskId: 'task-1',
      runId: 'run-1',
      kind: 'preview',
      url: 'https://preview.recoder.xyz/task-1',
      title: undefined,
      repository: undefined,
      branch: undefined,
      number: undefined,
      provider: 'recoder-preview',
      environment: 'verification',
      passed: undefined,
      createdAt: '2026-06-13T10:03:00.000Z',
      createdBy: 'codex',
    },
    {
      artifactId: 'artifact-verification-1',
      taskId: 'task-1',
      runId: 'run-1',
      kind: 'verification',
      url: undefined,
      title: undefined,
      repository: undefined,
      branch: undefined,
      number: undefined,
      provider: undefined,
      environment: undefined,
      passed: true,
      createdAt: '2026-06-13T10:03:00.000Z',
      createdBy: 'codex',
    },
  ]);
});

test('buildAgentOsCockpitSummary surfaces handoff work signals and flags runs that carry them', () => {
  const run: TaskRun = {
    runId: 'run-1',
    taskId: 'task-1',
    spaceId: 'space-1',
    state: 'waiting_for_approval',
    assigneeAgentId: 'codex',
    updatedAt: '2026-06-13T10:08:00.000Z',
  };
  const signal: WorkSignal = {
    signalId: 'signal-1',
    taskId: 'task-1',
    runId: 'run-1',
    source: 'task_run',
    sourceId: 'run-1',
    title: 'Run is waiting for human approval',
    severity: 'high',
    status: 'open',
    detectedReason: 'waiting_for_approval',
    whyItMatters: 'Delivery is blocked until a human approves before the PR merges.',
    recommendedNextAction: 'Review and approve the pending gate.',
    agentHandoffPrompt: 'Approve or reject the pending before_pr gate for run-1.',
    detectedAt: '2026-06-13T10:08:30.000Z',
  };

  const summary = buildAgentOsCockpitSummary({
    runs: [run],
    workSignals: [signal],
    now: '2026-06-13T10:09:00.000Z',
  });

  assert.equal(summary.runs[0]?.openWorkSignalCount, 1);
  assert.deepEqual(summary.workSignals, [
    {
      signalId: 'signal-1',
      taskId: 'task-1',
      runId: 'run-1',
      title: 'Run is waiting for human approval',
      severity: 'high',
      status: 'open',
      detectedReason: 'waiting_for_approval',
      source: 'task_run',
      whyItMatters: 'Delivery is blocked until a human approves before the PR merges.',
      recommendedNextAction: 'Review and approve the pending gate.',
      agentHandoffPrompt: 'Approve or reject the pending before_pr gate for run-1.',
      detectedAt: '2026-06-13T10:08:30.000Z',
    },
  ]);
});
