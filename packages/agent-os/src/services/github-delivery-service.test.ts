import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Artifact, GitHubDeliveryLink, TaskSpec } from '../domain';
import { GitHubDeliveryService } from './github-delivery-service';

const now = '2026-06-13T10:00:00.000Z';

function baseTask(): TaskSpec {
  return {
    taskId: 'task-1',
    spaceId: 'space-1',
    title: 'Deliver feature',
    goal: 'Ship the feature',
    createdBy: 'user-1',
    createdAt: now,
    updatedAt: now,
    status: 'ready',
    repo: 'recoder/recoder.xyz',
  } as TaskSpec;
}

function prArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    artifactId: 'artifact-pr',
    taskId: 'task-1',
    kind: 'pull_request',
    createdAt: now,
    createdBy: 'agent-os',
    metadata: { url: 'https://github.com/recoder/recoder.xyz/pull/42', number: 42 },
    ...overrides,
  } as Artifact;
}

function previewArtifact(): Artifact {
  return {
    artifactId: 'artifact-preview',
    taskId: 'task-1',
    kind: 'preview',
    createdAt: now,
    createdBy: 'agent-os',
    metadata: { url: 'https://preview.recoder.xyz/task-1' },
  } as Artifact;
}

function linkWithPrAndPreview(): GitHubDeliveryLink {
  const service = new GitHubDeliveryService();
  const base = service.createLink({ task: baseTask(), createdBy: 'agent-os', now });
  const withPr = service.attachPullRequest(base, prArtifact(), now);
  return service.attachPreview(withPr, previewArtifact(), now);
}

test('deriveStatus does not imply ready_for_approval when no checks have reported', () => {
  const link = linkWithPrAndPreview();
  // PR and preview exist, but no CI checks have been synced. Readiness must not
  // be inferred without check evidence.
  assert.equal(link.checks.length, 0);
  assert.equal(link.status, 'checks_pending');
});

test('deriveStatus reaches ready_for_approval only with real passing check evidence', () => {
  const service = new GitHubDeliveryService();
  const link = service.syncChecks(linkWithPrAndPreview(), [{ name: 'test', state: 'success' }], now);
  assert.equal(link.status, 'ready_for_approval');
});

test('deriveStatus surfaces checks_failed over any success inference', () => {
  const service = new GitHubDeliveryService();
  const link = service.syncChecks(linkWithPrAndPreview(), [{ name: 'test', state: 'failure' }], now);
  assert.equal(link.status, 'checks_failed');
});

test('deriveStatus reports pr_open when a PR exists without a preview or checks', () => {
  const service = new GitHubDeliveryService();
  const base = service.createLink({ task: baseTask(), createdBy: 'agent-os', now });
  const link = service.attachPullRequest(base, prArtifact(), now);
  assert.equal(link.previewArtifactIds.length, 0);
  assert.equal(link.status, 'pr_open');
});
