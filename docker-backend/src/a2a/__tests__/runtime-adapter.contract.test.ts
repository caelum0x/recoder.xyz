import { describe, expect, it, vi } from 'vitest';
import {
  ApprovalGateStatusEnum,
  ApprovalRequirementAtEnum,
  createInstructionBundle,
} from '@recoder/a2a-sdk';
import { createTaskEnvelope } from '@recoder/shared/a2a';

import { ClaudeRuntimeAdapter } from '../claude-runtime-adapter';
import { CodexRuntimeAdapter } from '../codex-runtime-adapter';

function makeEnvelope() {
  return createTaskEnvelope({
    id: 'task-1',
    workspace_id: 'ws-1',
    thread_id: 'thread-1',
    trace_id: 'trace-1',
    requester: { agent_id: 'requester', platform: 'recoder_pm' },
    assignee: { agent_id: 'assignee', platform: 'codex' },
    connector: { connector_id: 'codex-cli', platform: 'codex', protocol: 'jsonrpc' },
    payload: { kind: 'text', text: 'raw prompt' },
  });
}

function makeBundle() {
  return createInstructionBundle({
    shared_goal: 'Fix the bug',
    agent_specific_prompt: 'Use AGENTS.md and fix the bug.',
    system_context_refs: [{ ref_id: 'AGENTS.md', kind: 'agents_md', path: 'AGENTS.md' }],
    acceptance_criteria: ['Bug fixed'],
    verification_commands: ['pnpm test'],
    forbidden_actions: ['Do not edit secrets'],
    approval_gates: [
      {
        approval_id: 'approval-1',
        title: 'Push approval',
        status: ApprovalGateStatusEnum.Pending,
        required_at: ApprovalRequirementAtEnum.BeforePush,
        reason: 'Push approval required',
      },
    ],
    memory_used: [],
    provenance: {
      compiler_version: '0.1.0',
      source_files: [{ path: 'AGENTS.md', sha: 'abc' }],
    },
  });
}

describe('runtime adapter contract', () => {
  it('streams Claude runtime execution through the adapter contract', async () => {
    const runtime = {
      getTools: vi.fn(() => [{ name: 'Task', description: 'Execute task', inputSchema: {} }]),
      getState: vi.fn(() => ({ status: 'running', pid: 1, startedAt: new Date().toISOString(), lastActivity: new Date().toISOString() })),
      start: vi.fn(async () => undefined),
      executeTask: vi.fn(async () => ({
        taskId: 'task-1',
        success: true,
        resultText: 'done',
        artifacts: [{ key: 'report', artifact_type: 'file', mime_type: 'text/plain', content: 'ok', path: 'report.txt' }],
      })),
      emit: vi.fn(() => true),
    };

    const adapter = new ClaudeRuntimeAdapter(runtime as any);
    const events = [];
    for await (const event of adapter.sendTask(makeEnvelope(), makeBundle())) {
      events.push(event);
    }

    expect(runtime.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Use AGENTS.md and fix the bug.',
        instructionBundle: expect.objectContaining({ shared_goal: 'Fix the bug' }),
      }),
    );
    expect(events.map((event) => event.type)).toEqual(['started', 'artifact', 'completed']);
  });

  it('streams Codex runtime execution through the adapter contract', async () => {
    const runtime = {
      getHealth: vi.fn(() => ({ healthy: true, status: 'running', pid: 2, uptime: 200 })),
      start: vi.fn(async () => undefined),
      executeTask: vi.fn(async () => ({
        taskId: 'task-1',
        success: true,
        resultText: 'done',
        artifacts: [{ filename: 'patch.diff', content: 'diff --git' }],
      })),
      cancelTask: vi.fn(async () => ({ cancelled: true })),
      respondToApproval: vi.fn(async () => ({ ok: true })),
    };

    const adapter = new CodexRuntimeAdapter(runtime as any);
    const events = [];
    for await (const event of adapter.sendTask(makeEnvelope(), makeBundle())) {
      events.push(event);
    }

    expect(runtime.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Use AGENTS.md and fix the bug.',
        instructionBundle: expect.objectContaining({ shared_goal: 'Fix the bug' }),
      }),
    );
    expect(events.map((event) => event.type)).toEqual(['started', 'artifact', 'completed']);
  });
});
