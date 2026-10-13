import { execFile } from 'node:child_process';
import type { AgentProfile, TaskSpec, WorkLock } from '@recoder/agent-os';
import type { Governance } from '../governance';
import type { GovernanceContext } from '../domain/governance-request';
import { createGovernanceRequest } from '../domain/governance-request';
import type { GovernanceVerdict } from '../domain/governance-verdict';
import type { RiskTier } from '../domain/risk-tier';
import type { FileAuditLog } from '../audit/file-audit-log';

/**
 * command-gate — the seam a runtime adapter (Loom's terminal, a conductor
 * run, a CLI) calls BEFORE it lets an agent's shell command actually run.
 *
 * It is the thing plans/recoder.md next-task #5 calls "CommandPolicy /
 * EffectWorker loopback verdicts + inline approval UI": a command is never
 * executed directly. It is always routed through `Governance.decide()` first
 * ("loopback": the effect-producing worker asks the policy brain for a
 * verdict before it is allowed to act), and every verdict — allow, deny, or
 * needs_approval — is sealed into a durable, append-only audit log before (and
 * after) the command ever touches a shell.
 *
 * Fail-closed guarantees:
 *   - `deny` never executes.
 *   - `needs_approval` never executes until a human decision resolves it
 *     `approved` through the configured `approvalPrompt` (the inline approval
 *     UI seam). No prompt configured -> immediate deny; no silent allow, no
 *     silent hang.
 *   - Every branch (deny / approval requested / approval resolved / executed /
 *     execution failed) is appended to the audit log, not just the allowed
 *     path — the trail must be complete, not just the happy path.
 */

export type CommandExecutionResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

/** Injectable so tests never need to actually spawn a shell. */
export type CommandExecutor = (command: string, cwd?: string) => Promise<CommandExecutionResult>;

/**
 * The inline approval UI seam. Given the command and the verdict that flagged
 * it, return the human's decision. Implementations: a terminal y/n prompt
 * (`createTerminalApprovalPrompt`), a desktop dialog, a Slack/A2A round trip.
 */
export type CommandApprovalPrompt = (details: {
  readonly command: string;
  readonly tier: RiskTier;
  readonly reason: string;
  readonly requestId: string;
}) => Promise<'approved' | 'rejected'>;

export type CommandGateRequest = {
  readonly requestId?: string;
  readonly actor: AgentProfile;
  readonly task?: TaskSpec;
  readonly command: string;
  readonly cwd?: string;
  readonly workLocks?: readonly WorkLock[];
  readonly context?: GovernanceContext;
  /** Identity recorded against the approval request/resolution, e.g. a user id. */
  readonly requestedBy?: string;
};

export type CommandGateStatus = 'executed' | 'denied' | 'execution_failed';

export type CommandGateResult = {
  readonly status: CommandGateStatus;
  readonly verdict: GovernanceVerdict;
  readonly approvalDecision?: 'approved' | 'rejected';
  readonly approvalTimedOut?: boolean;
  readonly execution?: CommandExecutionResult;
  readonly reason: string;
};

const DEFAULT_EXECUTOR: CommandExecutor = (command, cwd) =>
  new Promise((resolve, reject) => {
    execFile(
      '/bin/sh',
      ['-c', command],
      { cwd, timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr, exitCode: 0 });
          return;
        }
        const code = (error as NodeJS.ErrnoException).code;
        if (typeof code === 'number') {
          // A non-zero exit is a normal execution outcome, not a gate fault.
          resolve({ stdout, stderr, exitCode: code });
          return;
        }
        // Spawn-level failure (missing shell, permission denied, timeout, …).
        reject(error);
      },
    );
  });

export type CommandGateOptions = {
  readonly governance: Governance;
  readonly auditLog: FileAuditLog;
  /** Defaults to a real `/bin/sh -c` executor; override in tests. */
  readonly executor?: CommandExecutor;
  /**
   * The inline approval UI. When omitted, any `needs_approval` verdict is
   * denied immediately (fail-closed) rather than silently allowed or hung on
   * a channel that doesn't exist.
   */
  readonly approvalPrompt?: CommandApprovalPrompt;
};

/**
 * CommandGate composes a `Governance` instance, a durable `FileAuditLog`, a
 * (replaceable) command executor, and an (optional) inline approval UI into
 * the single entry point a runtime adapter calls per command: `gate()`.
 */
export class CommandGate {
  private readonly governance: Governance;
  private readonly auditLog: FileAuditLog;
  private readonly executor: CommandExecutor;
  private readonly approvalPrompt?: CommandApprovalPrompt;

  constructor(options: CommandGateOptions) {
    this.governance = options.governance;
    this.auditLog = options.auditLog;
    this.executor = options.executor ?? DEFAULT_EXECUTOR;
    this.approvalPrompt = options.approvalPrompt;
  }

  /**
   * Decide, (maybe) get human approval, (maybe) execute — and append every
   * step to the durable audit log. Never throws on a policy outcome: a deny
   * is a normal `CommandGateResult`, not an exception. Only a programming
   * error or an execution-layer fault propagates.
   */
  async gate(request: CommandGateRequest): Promise<CommandGateResult> {
    const requestedBy = request.requestedBy ?? request.actor.agentId;
    const govRequest = createGovernanceRequest({
      requestId: request.requestId,
      actor: request.actor,
      task: request.task,
      action: 'command.run',
      target: { command: request.command },
      workLocks: request.workLocks,
      context: { ...request.context, bashInput: request.command },
    });

    const verdict = await this.governance.decide(govRequest);

    this.auditLog.append({
      timestamp: verdict.createdAt,
      actor: request.actor.agentId,
      action: 'decision.made',
      detail: `command.run tier=${verdict.tier} -> ${verdict.effect}: ${verdict.reason} :: ${redact(request.command)}`,
      outcome: verdict.effect === 'allow' ? 'allow' : verdict.effect === 'deny' ? 'deny' : 'needs_approval',
      runId: request.task?.taskId,
      metadata: { command: redact(request.command), tier: verdict.tier },
    });

    if (verdict.effect === 'deny') {
      return { status: 'denied', verdict, reason: verdict.reason };
    }

    if (verdict.effect === 'needs_approval') {
      const approvalOutcome = await this.resolveApproval(request, verdict, requestedBy);
      if (approvalOutcome.decision !== 'approved') {
        return {
          status: 'denied',
          verdict,
          approvalDecision: approvalOutcome.decision,
          approvalTimedOut: approvalOutcome.timedOut,
          reason: approvalOutcome.reason,
        };
      }
      return this.execute(request, verdict, approvalOutcome.decision, approvalOutcome.timedOut);
    }

    // effect === 'allow'
    return this.execute(request, verdict);
  }

  private async resolveApproval(
    request: CommandGateRequest,
    verdict: GovernanceVerdict,
    requestedBy: string,
  ): Promise<{ decision: 'approved' | 'rejected'; timedOut: boolean; reason: string }> {
    if (!this.approvalPrompt) {
      const reason = `No approval channel configured; failing closed on a needs_approval command: ${verdict.reason}`;
      this.auditLog.append({
        timestamp: new Date().toISOString(),
        actor: request.actor.agentId,
        action: 'approval.resolved',
        detail: reason,
        outcome: 'deny',
        runId: request.task?.taskId,
      });
      return { decision: 'rejected', timedOut: false, reason };
    }

    const { approval, awaited } = this.governance.requestApproval({
      taskId: request.task?.taskId ?? verdict.requestId,
      runId: request.task?.taskId,
      reason: verdict.reason,
      requestedBy,
      tier: verdict.tier,
      requiredAt: 'before_execution',
      target: { command: redact(request.command) },
    });

    this.auditLog.append({
      timestamp: new Date().toISOString(),
      actor: requestedBy,
      action: 'approval.requested',
      detail: `Approval ${approval.approvalId} requested for tier '${verdict.tier}': ${verdict.reason}`,
      outcome: 'needs_approval',
      runId: request.task?.taskId,
      metadata: { approvalId: approval.approvalId },
    });

    // Feed the human decision back into the governance approval gateway. This
    // is the "loopback": the prompt (inline UI) resolves independently of the
    // gate's own await below, and the gateway's own fail-closed timeout still
    // applies if the prompt never resolves.
    void this.approvalPrompt({
      command: request.command,
      tier: verdict.tier,
      reason: verdict.reason,
      requestId: verdict.requestId,
    }).then(
      (decision) => {
        try {
          this.governance.resolveApproval(approval.approvalId, decision, requestedBy);
        } catch {
          // Already resolved (e.g. timed out first) — nothing to do.
        }
      },
      () => {
        try {
          this.governance.resolveApproval(approval.approvalId, 'rejected', requestedBy, 'Approval prompt failed.');
        } catch {
          // Already resolved.
        }
      },
    );

    const result = await awaited;

    this.auditLog.append({
      timestamp: result.approval.decidedAt ?? new Date().toISOString(),
      actor: result.approval.decidedBy ?? requestedBy,
      action: 'approval.resolved',
      detail: `Approval ${approval.approvalId} -> ${result.decision}${result.timedOut ? ' (timed out, fail-closed)' : ''}`,
      outcome: result.decision === 'approved' ? 'allow' : 'deny',
      runId: request.task?.taskId,
      metadata: { approvalId: approval.approvalId, timedOut: result.timedOut },
    });

    return {
      decision: result.decision,
      timedOut: result.timedOut,
      reason: result.decision === 'approved'
        ? `Approved by ${result.approval.decidedBy ?? 'unknown'}.`
        : `Rejected${result.timedOut ? ' (approval timed out)' : ` by ${result.approval.decidedBy ?? 'unknown'}`}.`,
    };
  }

  private async execute(
    request: CommandGateRequest,
    verdict: GovernanceVerdict,
    approvalDecision?: 'approved' | 'rejected',
    approvalTimedOut?: boolean,
  ): Promise<CommandGateResult> {
    try {
      const execution = await this.executor(request.command, request.cwd);
      this.auditLog.append({
        timestamp: new Date().toISOString(),
        actor: request.actor.agentId,
        action: 'tool.invoked',
        detail: `Executed command (exit ${execution.exitCode}): ${redact(request.command)}`,
        outcome: execution.exitCode === 0 ? 'success' : 'failure',
        runId: request.task?.taskId,
        metadata: { exitCode: execution.exitCode },
      });
      return {
        status: 'executed',
        verdict,
        approvalDecision,
        approvalTimedOut,
        execution,
        reason: verdict.reason,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.auditLog.append({
        timestamp: new Date().toISOString(),
        actor: request.actor.agentId,
        action: 'tool.invoked',
        detail: `Command execution threw before producing an exit code: ${message}`,
        outcome: 'failure',
        runId: request.task?.taskId,
      });
      return {
        status: 'execution_failed',
        verdict,
        approvalDecision,
        approvalTimedOut,
        reason: message,
      };
    }
  }
}

/**
 * Best-effort redaction so an audited command never carries an obvious secret
 * verbatim into the durable log. This is a defense-in-depth belt, not the only
 * control — callers must still avoid passing raw secrets as command text.
 */
function redact(command: string): string {
  return command.replace(/(--?[a-zA-Z0-9_-]*(token|key|secret|password|pass)[a-zA-Z0-9_-]*[=\s]+)(\S+)/gi, '$1[REDACTED]');
}
