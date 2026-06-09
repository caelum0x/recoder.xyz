import type { McpToolCallDecision, McpToolCallInput } from '../permissions';
import { checkMcpToolPermission } from '../policy/permission-check';

export type McpToolResult = {
  content: unknown;
  metadata?: Record<string, unknown>;
};

export interface McpToolExecutor {
  call(input: McpToolCallInput): Promise<McpToolResult>;
}

export type McpToolAuditRecord = {
  callId: string;
  serverId: string;
  toolName: string;
  actorAgentId: string;
  taskId?: string;
  decision: McpToolCallDecision;
  status: 'denied' | 'needs_approval' | 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  error?: string;
};

export type McpToolAuditSink = (record: McpToolAuditRecord) => void | Promise<void>;

export class RecoderMcpHost {
  constructor(
    private readonly executor: McpToolExecutor,
    private readonly audit?: McpToolAuditSink,
  ) {}

  authorize(input: McpToolCallInput): McpToolCallDecision {
    return checkMcpToolPermission(input);
  }

  async call(input: McpToolCallInput): Promise<McpToolResult> {
    const callId = `mcp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const startedAt = new Date().toISOString();
    const decision = this.authorize(input);
    if (!decision.allowed) {
      await this.emitAudit(input, decision, {
        callId,
        startedAt,
        status: decision.requiresApproval ? 'needs_approval' : 'denied',
        error: decision.reason,
      });
      throw new Error(decision.reason);
    }
    try {
      const result = await this.executor.call(input);
      await this.emitAudit(input, decision, {
        callId,
        startedAt,
        status: 'completed',
      });
      return result;
    } catch (error) {
      await this.emitAudit(input, decision, {
        callId,
        startedAt,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async emitAudit(
    input: McpToolCallInput,
    decision: McpToolCallDecision,
    record: Pick<McpToolAuditRecord, 'callId' | 'startedAt' | 'status' | 'error'>,
  ): Promise<void> {
    if (!this.audit) return;

    await this.audit({
      callId: record.callId,
      serverId: input.server.serverId,
      toolName: input.toolName,
      actorAgentId: input.actor.agentId,
      taskId: input.task?.taskId,
      decision,
      status: record.status,
      startedAt: record.startedAt,
      completedAt: new Date().toISOString(),
      error: record.error,
    });
  }
}
