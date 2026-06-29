import { describe, it, expect } from 'vitest';
import type { BeadsClient, BeadsIssue } from '@recoder/beads-adapter';
import type { Artifact, TaskSpec } from '@recoder/agent-os';
import { InMemoryAgentOsRepository } from '../agent-os/repositories/in-memory-agent-os.repository.js';
import { importReadyBeadsTasks, exportTaskToBeads } from './beads-sync.js';

/**
 * Proves docker-backend injects the REAL @recoder/beads-adapter BeadsIssueTracker
 * into the @recoder/agent-os IssueTrackerSyncService and round-trips a task on the
 * PRODUCT path: import upserts canonical TaskSpecs into the agent-os repository,
 * export pushes a canonical task back through the seam. The only faked thing is the
 * `bd` CLI transport (BeadsClient), so the test runs without a `bd` binary.
 */

function makeFakeClient(): {
  client: BeadsClient;
  updates: Array<{ issueId: string; args: string[] }>;
} {
  const readyIssue: BeadsIssue = {
    id: 'rx-501',
    title: 'Validate sandbox auto-wake',
    description: [
      'Ensure sandboxes auto-wake before the conductor steers them.',
      'intent: bug',
      'target_paths: docker-backend/src/conductor/**',
      'verify: pnpm test',
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
      throw new Error('not used');
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

describe('beads-sync product-path integration', () => {
  it('imports ready beads issues and upserts canonical TaskSpecs into the repository', async () => {
    const { client } = makeFakeClient();
    const repository = new InMemoryAgentOsRepository();

    const result = await importReadyBeadsTasks(
      { spaceId: 'space-conductor', repo: 'recoder/recoder.xyz' },
      { client, repository },
    );

    expect(result.imported).toBe(1);
    expect(result.taskIds).toEqual(['rx-501']);

    // The canonical repository now holds the imported task (state of record).
    const tasks = await Promise.resolve(repository.listTasks());
    const task = tasks.find((t) => t.taskId === 'rx-501');
    expect(task).toBeDefined();
    expect(task?.spaceId).toBe('space-conductor');
    expect(task?.repo).toBe('recoder/recoder.xyz');
    expect(task?.intent).toBe('bugfix');
    expect(task?.metadata?.source).toBe('beads');
  });

  it('exports a canonical task back to beads through the seam', async () => {
    const { client, updates } = makeFakeClient();

    const task: TaskSpec = {
      taskId: 'rx-501',
      title: 'Validate sandbox auto-wake',
      intent: 'bugfix',
      goal: 'Ensure sandboxes auto-wake before the conductor steers them.',
      spaceId: 'space-conductor',
      repo: 'recoder/recoder.xyz',
      targetPaths: ['docker-backend/src/conductor/**'],
      forbiddenPaths: ['.env*'],
      acceptanceCriteria: ['Sandboxes wake before steering'],
      verification: { commands: ['pnpm test'], evidenceRequired: ['delivery_summary'] },
      approvalRequired: ['before_pr'],
      artifactRequired: ['summary'],
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

    const result = await exportTaskToBeads({ task, artifacts }, { client });

    expect(result.exported).toBe(true);
    expect(result.tracker).toBe('beads');
    expect(result.externalId).toBe('rx-501');

    // The adapter genuinely drove the (faked) bd transport with the task payload.
    expect(updates.length).toBe(1);
    const description = updates[0].args.find((arg) => arg.startsWith('--description='));
    expect(description).toBeDefined();
    expect(description).toMatch(/intent: bugfix/);
    expect(description).toMatch(/artifact:artifact-summary/);
  });

  it('degrades safely when bd is unavailable (no injected client, bad binary)', async () => {
    // Force an unavailable binary so the probe fails; no client injected → must skip.
    const prev = process.env.CONDUCTOR_BD_BIN;
    process.env.CONDUCTOR_BD_BIN = '/nonexistent/definitely-not-a-real-bd-binary';
    try {
      const result = await importReadyBeadsTasks({ spaceId: 'space-x' });
      expect(result.imported).toBe(0);
      expect(result.taskIds).toEqual([]);
      expect(result.skipped).toBeTruthy();

      const exportResult = await exportTaskToBeads({
        task: {
          taskId: 'rx-x',
          title: 't',
          intent: 'bugfix',
          goal: 'g',
          spaceId: 's',
          repo: 'r',
          targetPaths: [],
          forbiddenPaths: [],
          acceptanceCriteria: [],
          verification: { commands: [], evidenceRequired: [] },
          approvalRequired: [],
          artifactRequired: [],
        },
      });
      expect(exportResult.exported).toBe(false);
      expect(exportResult.skipped).toBeTruthy();
    } finally {
      if (prev === undefined) delete process.env.CONDUCTOR_BD_BIN;
      else process.env.CONDUCTOR_BD_BIN = prev;
    }
  });
});
