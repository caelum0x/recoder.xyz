import type { ApprovalDecision, InstructionBundle } from '@recoder/a2a-sdk';
import type { TaskEnvelope } from '@recoder/shared/a2a';

import { getCodexConnectorRuntime, type CodexExecuteInput } from './codex-connector-runtime.service';
import type { AgentRuntimeAdapter, RunEvent, RuntimeHandle, RuntimeHealthSnapshot, RuntimeStartInput } from './runtime-adapter';

interface CodexRuntimeLike {
  getHealth(): RuntimeHealthSnapshot;
  start(): Promise<void>;
  executeTask(input: CodexExecuteInput): Promise<{
    taskId: string;
    success: boolean;
    resultText?: string;
    error?: string;
    artifacts?: Array<{ filename: string; content: string }>;
  }>;
  cancelTask(taskId: string): Promise<unknown>;
  respondToApproval(approvalId: string, approved: boolean, reason?: string): Promise<unknown>;
}

export class CodexRuntimeAdapter implements AgentRuntimeAdapter {
  readonly id = 'codex-runtime-adapter';
  readonly platform = 'codex';

  constructor(private readonly runtime: CodexRuntimeLike = getCodexConnectorRuntime()) {}

  async capabilities(): Promise<string[]> {
    return ['tasks/send', 'tasks/get', 'tasks/cancel', 'approvals/respond'];
  }

  async health(): Promise<RuntimeHealthSnapshot> {
    return this.runtime.getHealth();
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
    } satisfies CodexExecuteInput);

    if (!result.success) {
      yield { type: 'failed', taskId: envelope.id, error: result.error || 'Codex execution failed' };
      return;
    }

    for (const artifact of result.artifacts ?? []) {
      yield {
        type: 'artifact',
        taskId: envelope.id,
        artifact: {
          filename: artifact.filename,
          content: artifact.content,
        },
      };
    }

    yield { type: 'completed', taskId: envelope.id, resultText: result.resultText };
  }

  async cancel(taskId: string): Promise<void> {
    await this.runtime.cancelTask(taskId);
  }

  async approve(approvalId: string, decision: ApprovalDecision): Promise<void> {
    await this.runtime.respondToApproval(approvalId, decision === 'approved');
  }
}
