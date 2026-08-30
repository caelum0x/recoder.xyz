import { describe, expect, it } from 'vitest';
import type { Artifact, GitHubDeliveryLink, TaskRun, TaskSpec, Workspace } from '@recoder/agent-os';
import { attachPullRequestEvidence } from './pr-delivery-evidence.service.js';

function harness() {
  const artifacts: Artifact[] = [];
  const links: GitHubDeliveryLink[] = [];
  const task = { taskId: 'task-1', spaceId: 'space-1', repo: 'recoder/recoder' } as TaskSpec;
  const run = { runId: 'run-1', taskId: task.taskId, spaceId: task.spaceId, updatedAt: '2026-08-30T10:00:00Z' } as TaskRun;
  const workspace = {
    workspaceId: 'ws-1', taskId: task.taskId, spaceId: task.spaceId, runId: run.runId, branch: 'feat/history',
  } as Workspace;
  return {
    artifacts,
    links,
    workspace,
    store: {
      listTasks: () => [task],
      listRuns: () => [run],
      listGitHubDeliveryLinks: () => links,
      upsertArtifact: (artifact: Artifact) => {
        artifacts.splice(0, artifacts.length, artifact);
        return artifact;
      },
      upsertGitHubDeliveryLink: (link: GitHubDeliveryLink) => {
        links.splice(0, links.length, link);
        return link;
      },
    },
  };
}

describe('attachPullRequestEvidence', () => {
  it('persists a run-linked PR artifact and delivery link idempotently', async () => {
    const h = harness();
    const input = {
      store: h.store, workspace: h.workspace, url: 'https://github.com/recoder/recoder/pull/42',
      base: 'main', title: 'Ship history', createdBy: 'user-1', now: '2026-08-30T10:01:00Z',
    };
    const first = await attachPullRequestEvidence(input);
    const second = await attachPullRequestEvidence(input);
    expect(first).toMatchObject({ attached: true, artifactId: 'artifact_pr_ws-1_42' });
    expect(second).toEqual(first);
    expect(h.artifacts).toHaveLength(1);
    expect(h.artifacts[0]).toMatchObject({ taskId: 'task-1', runId: 'run-1', kind: 'pull_request' });
    expect(h.links).toHaveLength(1);
    expect(h.links[0]).toMatchObject({
      taskId: 'task-1', runId: 'run-1', pullRequestArtifactId: 'artifact_pr_ws-1_42', status: 'pr_open',
    });
  });

  it('degrades truthfully when the canonical task is absent', async () => {
    const h = harness();
    const result = await attachPullRequestEvidence({
      store: { ...h.store, listTasks: () => [] }, workspace: h.workspace,
      url: 'https://github.com/recoder/recoder/pull/42', base: 'main', title: 'Ship history', createdBy: 'user-1',
    });
    expect(result).toEqual({ attached: false, reason: 'task not found: task-1' });
  });

  it('refuses to attach across a task/workspace space boundary', async () => {
    const h = harness();
    const result = await attachPullRequestEvidence({
      store: {
        ...h.store,
        listTasks: () => [{ ...h.store.listTasks()[0], spaceId: 'space-foreign' }],
      },
      workspace: h.workspace,
      url: 'https://github.com/recoder/recoder/pull/42',
      base: 'main',
      title: 'Ship history',
      createdBy: 'user-1',
    });
    expect(result).toEqual({ attached: false, reason: 'task space does not match workspace: task-1' });
    expect(h.artifacts).toEqual([]);
    expect(h.links).toEqual([]);
  });

  it('refuses a stale workspace run id instead of creating task-wide PR evidence', async () => {
    const h = harness();
    const result = await attachPullRequestEvidence({
      store: { ...h.store, listRuns: () => [] },
      workspace: h.workspace,
      url: 'https://github.com/recoder/recoder/pull/42',
      base: 'main',
      title: 'Ship history',
      createdBy: 'user-1',
    });
    expect(result).toEqual({ attached: false, reason: 'run not found for workspace: run-1' });
    expect(h.artifacts).toEqual([]);
    expect(h.links).toEqual([]);
  });
});
