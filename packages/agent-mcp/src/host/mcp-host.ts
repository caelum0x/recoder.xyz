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

/**
 * Observe a failure of the (best-effort) audit sink. The audit sink is an
 * observability side-channel — its failure must NEVER change the truthful
 * outcome of a tool call — so a throwing/rejecting sink is contained inside the
 * host. This optional hook lets a consumer notice the dropped audit record
 * (metrics, dead-letter log) without the failure propagating to the caller.
 * The hook itself is also invoked defensively; a throwing hook is swallowed.
 */
export type McpToolAuditErrorSink = (
  error: unknown,
  record: McpToolAuditRecord,
) => void;

export class RecoderMcpHost {
  constructor(
    private readonly executor: McpToolExecutor,
    private readonly audit?: McpToolAuditSink,
    private readonly onAuditError?: McpToolAuditErrorSink,
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

    const auditRecord: McpToolAuditRecord = {
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
    };

    // The audit sink is a best-effort observability side-channel. A throwing or
    // rejecting sink (audit DB down, disk full, network hiccup) must NEVER change
    // the truthful outcome of the tool call: it must not mask a denial reason, and
    // it must not turn a genuinely completed call into a reported failure. Contain
    // the failure here and surface it only through the optional error hook.
    try {
      await this.audit(auditRecord);
    } catch (error) {
      this.reportAuditError(error, auditRecord);
    }
  }

  /** Report a dropped audit record without letting the report itself throw. */
  private reportAuditError(error: unknown, record: McpToolAuditRecord): void {
    if (!this.onAuditError) return;
    try {
      this.onAuditError(error, record);
    } catch {
      // The error hook is itself best-effort; never let it propagate.
    }
  }
}
