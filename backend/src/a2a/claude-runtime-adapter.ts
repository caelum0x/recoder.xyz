import type { ApprovalDecision, InstructionBundle } from '@recoder/a2a-sdk';
import type { TaskEnvelope } from '@recoder/shared/a2a';

import { getClaudeConnectorRuntime, type ExecuteTaskInput } from './claude-connector-runtime.service';
import { getTaskLifecycleService } from './task-lifecycle.service';
import type { AgentRuntimeAdapter, RunEvent, RuntimeHandle, RuntimeHealthSnapshot, RuntimeStartInput } from './runtime-adapter';

interface ClaudeRuntimeLike {
  getTools(): Array<{ name: string }>;
  getState(): {
    status: string;
    pid: number | null;
    startedAt: string | null;
    lastActivity: string | null;
  };
  start(): Promise<void>;
  executeTask(input: ExecuteTaskInput): Promise<{
    taskId: string;
    success: boolean;
    resultText?: string;
    error?: string;
    artifacts?: Array<{ key: string; path?: string; content: string }>;
  }>;
  emit?(event: string, payload: unknown): boolean;
}

export class ClaudeRuntimeAdapter implements AgentRuntimeAdapter {
  readonly id = 'claude-runtime-adapter';
  readonly platform = 'claude_code';

  constructor(private readonly runtime: ClaudeRuntimeLike = getClaudeConnectorRuntime()) {}

  async capabilities(): Promise<string[]> {
    return this.runtime.getTools().map((tool) => tool.name);
  }

  async health(): Promise<RuntimeHealthSnapshot> {
    const state = this.runtime.getState();
    const uptime = state.startedAt
      ? Date.now() - new Date(state.startedAt).getTime()
      : null;
    return {
      healthy: state.status === 'running',
      status: state.status,
      pid: state.pid,
      uptime,
    };
  }

  async start(_input?: RuntimeStartInput): Promise<RuntimeHandle> {
    await this.runtime.start();
    return { runtimeId: this.id, platform: this.platform };
  }

  async *sendTask(envelope: TaskEnvelope, bundle: InstructionBundle): AsyncIterable<RunEvent> {
    yield { type: 'started', taskId: envelope.id, platform: this.platform };

    const result = await this.runtime.executeTask({
      taskId: envelope.id,
      prompt: bundle.agent_specific_prompt,
      instructionBundle: bundle,
      requester: {
        id: envelope.requester.agent_id,
        platform: envelope.requester.platform,
        name: envelope.requester.name || envelope.requester.agent_id,
      },
      workspaceId: envelope.workspace_id,
      threadId: envelope.thread_id,
    } satisfies ExecuteTaskInput);

    if (!result.success) {
      yield { type: 'failed', taskId: envelope.id, error: result.error || 'Claude execution failed' };
      return;
    }

    for (const artifact of result.artifacts ?? []) {
      yield {
        type: 'artifact',
        taskId: envelope.id,
        artifact: {
          filename: artifact.path || artifact.key,
          content: artifact.content,
        },
      };
    }

    yield { type: 'completed', taskId: envelope.id, resultText: result.resultText };
  }

  async cancel(taskId: string): Promise<void> {
    getTaskLifecycleService().cancelTask(taskId, 'Cancelled via runtime adapter', this.id);
  }

  async approve(approvalId: string, decision: ApprovalDecision): Promise<void> {
    const taskId = approvalId.includes(':') ? approvalId.split(':')[0] : approvalId;
    if (decision === 'approved') {
      getTaskLifecycleService().startTask(taskId, this.id);
      this.runtime.emit?.('approval:granted', { approvalId, taskId });
      return;
    }
    getTaskLifecycleService().cancelTask(taskId, `Approval ${approvalId} denied`, this.id);
    this.runtime.emit?.('approval:denied', { approvalId, taskId });
  }
}
