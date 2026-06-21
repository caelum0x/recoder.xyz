import { describe, expect, it } from 'vitest';
import type { TaskEnvelope } from '@recoder/shared/a2a';
import { TASK_ENVELOPE_VERSION, TaskStateEnum } from '@recoder/shared/a2a';
import { mapTaskEvidenceToRuntimeEvidenceInput } from './a2a-event-bridge';

function task(overrides: Partial<TaskEnvelope> = {}): TaskEnvelope {
  return {
    envelope_version: TASK_ENVELOPE_VERSION,
    id: 'task_runtime_1',
    workspace_id: 'workspace_1',
    thread_id: 'thread_1',
    trace_id: 'trace_1',
    state: TaskStateEnum.Completed,
    requester: {
      agent_id: 'user_1',
      platform: 'recoder_app',
    },
    assignee: {
      agent_id: 'agent_codex',
      platform: 'codex',
    },
    connector: {
      platform: 'codex',
      protocol: 'jsonrpc',
      connector_id: 'connector_codex',
    },
    payload: {
      kind: 'text',
      text: 'Implement task',
    },
    created_at: '2026-06-13T10:00:00.000Z',
    updated_at: '2026-06-13T10:05:00.000Z',
    ...overrides,
  };
}

describe('mapTaskEvidenceToRuntimeEvidenceInput', () => {
  it('projects runtime git metadata into git status evidence', () => {
    const input = mapTaskEvidenceToRuntimeEvidenceInput(task(), {
      kind: 'runtime',
      label: 'Git state (feature/a)',
      ref: 'git:feature/a',
      metadata: {
        gitStatus: ' M src/server.ts',
        gitBranch: 'feature/a',
        cloneUrl: 'https://github.com/example/repo.git',
        runtimeType: 'sandbox',
        sandboxId: 'sandbox_1',
      },
    });

    expect(input).toMatchObject({
      taskId: 'task_runtime_1',
      kind: 'git_status',
      status: 'observed',
      title: 'Git state (feature/a)',
      summary: ' M src/server.ts',
      source: {
        runtimeId: 'sandbox',
        adapterId: 'connector_codex',
        sandboxId: 'sandbox_1',
      },
      observedAt: '2026-06-13T10:05:00.000Z',
    });
    expect(input?.evidenceId).toMatch(/^evidence_a2a_[a-f0-9]{24}$/);
    expect(input?.metadata).toMatchObject({
      workspaceId: 'workspace_1',
      threadId: 'thread_1',
      traceId: 'trace_1',
      agentId: 'agent_codex',
      connectorId: 'connector_codex',
      a2aEvidenceKind: 'runtime',
      a2aEvidenceRef: 'git:feature/a',
    });
  });

  it('projects stderr logs into failed stderr evidence for failed tasks', () => {
    const input = mapTaskEvidenceToRuntimeEvidenceInput(task({ state: TaskStateEnum.Failed }), {
      kind: 'log',
      label: 'stderr',
      ref: 'stderr',
      metadata: {
        stream: 'stderr',
        excerpt: 'permission denied',
        lineCount: 1,
      },
    });

    expect(input).toMatchObject({
      kind: 'stderr',
      status: 'failed',
      summary: 'permission denied',
      source: {
        runtimeId: 'codex',
        adapterId: 'connector_codex',
      },
    });
  });

  it('projects previews and artifact references', () => {
    const preview = mapTaskEvidenceToRuntimeEvidenceInput(task(), {
      kind: 'preview',
      label: 'Preview URL',
      ref: 'https://preview.example.com',
      metadata: {
        source: 'preview-proxy',
      },
    });
    const artifact = mapTaskEvidenceToRuntimeEvidenceInput(task(), {
      kind: 'artifact',
      label: 'runtime.log',
      ref: 'artifact_log_1',
      metadata: {
        artifactType: 'log',
      },
    });

    expect(preview).toMatchObject({
      kind: 'preview_link',
      source: {
        url: 'https://preview.example.com',
      },
    });
    expect(artifact).toMatchObject({
      kind: 'stdout',
      artifactIds: ['artifact_log_1'],
    });
  });
});
