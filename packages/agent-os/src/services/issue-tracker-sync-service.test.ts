import assert from 'node:assert/strict';
import test from 'node:test';
import type { BeadsClient, BeadsIssue } from '@recoder/beads-adapter';
import { BeadsIssueTracker } from '@recoder/beads-adapter';
import type { Artifact, TaskSpec } from '../domain';
import { IssueTrackerSyncService } from './issue-tracker-sync-service';

/**
 * This test proves Agent OS can sync its canonical task store with the bd/beads
 * issue tracker through the IssueTrackerPort seam, using the REAL
 * @recoder/beads-adapter implementation (BeadsIssueTracker) — not a stub.
 *
 * The only thing faked is the bd CLI transport (BeadsClient), so the test runs
 * deterministically without a `bd` binary. All translation logic in the adapter
 * (importReadyTasks -> beadsIssueToTaskSpec, exportTask -> taskSpecToBeadsMetadata)
 * runs end-to-end through the Agent OS service.
 */

function createFakeBeadsClient(): {
  client: BeadsClient;
  updates: Array<{ issueId: string; args: string[] }>;
} {
  const readyIssue: BeadsIssue = {
    id: 'rx-101',
    title: 'Harden auth callback validation',
    description: [
      'Validate cross-subdomain auth callbacks before trusting them.',
      'intent: bug',
      'target_paths: app/auth/**',
      'forbidden_paths: .env*, secrets/**',
      'verify: pnpm test, pnpm check-types',
      'artifacts: summary, changed_files',
      'approval_required: before_pr',
    ].join('\n'),
    status: 'open',
    priority: 1,
    issue_type: 'bug',
  };

  const updates: Array<{ issueId: string; args: string[] }> = [];

  const client: BeadsClient = {
    ready() {
      return [readyIssue];
    },
    show(issueId) {
      return issueId === readyIssue.id ? readyIssue : null;
    },
    create() {
      throw new Error('not used in this test');
    },
    update(issueId, args) {
      updates.push({ issueId, args });
      return { ...readyIssue, id: issueId };
    },
    close(issueId) {
      return { ...readyIssue, id: issueId, status: 'closed' };
    },
  };

  return { client, updates };
}

test('IssueTrackerSyncService imports ready beads issues into canonical TaskSpecs', async () => {
  const { client } = createFakeBeadsClient();
  const tracker = new BeadsIssueTracker({ client });
  const service = new IssueTrackerSyncService(tracker);

  const tasks = await service.importReadyTasks({
    spaceId: 'space-1',
    repo: 'recoder/recoder.xyz',
  });

  assert.equal(tasks.length, 1);
  const task = tasks[0];
  assert.equal(task.taskId, 'rx-101');
  assert.equal(task.spaceId, 'space-1');
  assert.equal(task.repo, 'recoder/recoder.xyz');
  assert.equal(task.intent, 'bugfix');
  assert.deepEqual(task.targetPaths, ['app/auth/**']);
  assert.deepEqual(task.verification.commands, ['pnpm test', 'pnpm check-types']);
  assert.deepEqual(task.approvalRequired, ['before_pr']);
  assert.equal(task.metadata?.source, 'beads');
  assert.equal(task.metadata?.beadsIssueId, 'rx-101');
});

test('IssueTrackerSyncService exports a canonical TaskSpec back to beads through the seam', async () => {
  const { client, updates } = createFakeBeadsClient();
  const tracker = new BeadsIssueTracker({ client });
  const service = new IssueTrackerSyncService(tracker);

  const task: TaskSpec = {
    taskId: 'rx-101',
    title: 'Harden auth callback validation',
    intent: 'bugfix',
    goal: 'Validate cross-subdomain auth callbacks before trusting them.',
    spaceId: 'space-1',
    repo: 'recoder/recoder.xyz',
    targetPaths: ['app/auth/**'],
    forbiddenPaths: ['.env*', 'secrets/**'],
    acceptanceCriteria: ['Auth callbacks are validated'],
    verification: { commands: ['pnpm test'], evidenceRequired: ['delivery_summary'] },
    approvalRequired: ['before_pr'],
    artifactRequired: ['summary', 'changed_files'],
  };
  const artifacts: Artifact[] = [
    {
      artifactId: 'artifact-summary',
      taskId: task.taskId,
      runId: 'run-1',
      kind: 'summary',
      mimeType: 'text/markdown',
      public: false,
      createdAt: '2026-06-29T10:00:00.000Z',
      createdBy: 'agent-os',
    },
  ];

  const result = await service.exportTask({ task, artifacts });

  // The Agent OS service returns the external ref produced by the real adapter.
  assert.equal(result.ref.tracker, 'beads');
  assert.equal(result.ref.externalId, 'rx-101');

  // The adapter genuinely drove the (faked) bd transport with the task payload.
  assert.equal(updates.length, 1);
  assert.equal(updates[0].issueId, 'rx-101');
  const description = updates[0].args.find((arg) => arg.startsWith('--description='));
  assert.ok(description, 'expected a --description= update argument');
  assert.match(description!, /intent: bugfix/);
  assert.match(description!, /target_paths: app\/auth\/\*\*/);
  assert.match(description!, /artifact:artifact-summary/);
});
