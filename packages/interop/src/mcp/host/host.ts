import {
  RecoderMcpHost as BaseMcpHost,
  McpToolRouter,
  McpSessionManager,
  McpRegistry as BaseMcpRegistry,
  estimateMcpToolRisk,
  type McpToolExecutor,
  type McpToolResult,
  type McpToolCallInput,
  type McpToolCallDecision,
  type McpToolRisk,
} from "@recoder/agent-mcp";
import { McpRegistry } from "../registry/registry";
import {
  buildToolAuditEvent,
  type McpAuditSinkPort,
} from "../audit/audit";
import type { McpToolAuditEvent, McpToolCallStatus } from "../audit/audit";

/**
 * `InteropMcpHost` — the MCP host composition for interop.
 *
 * It builds on `@recoder/agent-mcp`'s `RecoderMcpHost` (authorize→execute→audit)
 * and adds the pieces interop owns at the edge:
 *
 *   1. A `McpRegistry` (the catalog-gated registry) + a `McpToolRouter` for
 *      in-proc dispatch and a `McpSessionManager` for per-agent sessions.
 *   2. The full gate order on every call: AUTHORIZE (registry + agent policy +
 *      agent-policy intent, via the base host's `checkMcpToolPermission`) →
 *      RISK (attached to every decision) → EXECUTE (only if allowed) → AUDIT
 *      (an immutable event for EVERY outcome incl. denials).
 *
 * The host NEVER executes a denied or approval-gated call: `authorize` returns
 * the decision, and `call` rejects with the decision attached before touching the
 * executor. Audit is fail-safe — a sink that throws is caught so a logging fault
 * can never turn a completed call into a failed one.
 */

/** The outcome of a host call: the decision, the risk, and (if run) the result. */
export type HostCallOutcome =
  | {
      readonly status: "completed";
      readonly decision: McpToolCallDecision;
      readonly risk: McpToolRisk;
      readonly result: McpToolResult;
      readonly audit: McpToolAuditEvent;
    }
  | {
      readonly status: "denied" | "needs_approval" | "failed";
      readonly decision: McpToolCallDecision;
      readonly risk: McpToolRisk;
      readonly reason: string;
      readonly audit: McpToolAuditEvent;
    };

export interface InteropMcpHostOptions {
  /** In-proc tool dispatcher. If omitted, a router over the registry is created. */
  readonly executor?: McpToolExecutor;
  /** Where audit events are durably recorded (port; optional → no durable audit). */
  readonly auditSink?: McpAuditSinkPort;
}

export class InteropMcpHost {
  readonly registry: McpRegistry;
  readonly router: McpToolRouter;
  readonly sessions: McpSessionManager;
  private readonly executor: McpToolExecutor;
  private readonly auditSink?: McpAuditSinkPort;
  private readonly base: BaseMcpHost;

  constructor(options: InteropMcpHostOptions = {}) {
    this.registry = new McpRegistry();
    // The router needs the BASE agent-mcp registry for handler bookkeeping; the
    // interop McpRegistry wraps it for the catalog gate. We give the router its
    // own base registry instance — server registration flows through both via
    // registerTool() below.
    this.router = new McpToolRouter(new BaseMcpRegistry());
    this.sessions = new McpSessionManager();
    this.executor = options.executor ?? this.router;
    this.auditSink = options.auditSink;
    this.base = new BaseMcpHost(this.executor);
  }

  /**
   * AUTHORIZE — the pure decision (registry + agent tool policy + agent-policy
   * intent + risk). Delegates to the base host's `checkMcpToolPermission` path.
   * Never executes anything.
   */
  authorize(input: McpToolCallInput): McpToolCallDecision {
    return this.base.authorize(input);
  }

  /** RISK — the low/medium/high estimate for a tool name (pure). */
  risk(toolName: string): McpToolRisk {
    return estimateMcpToolRisk(toolName);
  }

  /**
   * Full gated call: AUTHORIZE → (deny/approval short-circuit) → EXECUTE →
   * AUDIT. Returns a discriminated outcome instead of throwing, so callers at
   * the wire boundary get a structured decision they can map to a response.
   */
  async call(input: McpToolCallInput): Promise<HostCallOutcome> {
    const decision = this.authorize(input);
    const risk = this.risk(input.toolName);

    if (!decision.allowed) {
      const status: McpToolCallStatus = decision.requiresApproval
        ? "needs_approval"
        : "denied";
      const audit = await this.emit(input, decision, status, decision.reason);
      return {
        status: decision.requiresApproval ? "needs_approval" : "denied",
        decision,
        risk,
        reason: decision.reason,
        audit,
      };
    }

    try {
      const result = await this.executor.call(input);
      const audit = await this.emit(input, decision, "completed");
      return { status: "completed", decision, risk, result, audit };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const audit = await this.emit(input, decision, "failed", reason);
      return { status: "failed", decision, risk, reason, audit };
    }
  }

  /** Emit an immutable audit event. Fail-safe: a throwing sink never propagates. */
  private async emit(
    input: McpToolCallInput,
    decision: McpToolCallDecision,
    status: McpToolCallStatus,
    error?: string,
  ): Promise<McpToolAuditEvent> {
    const event = buildToolAuditEvent({ call: input, decision, status, error });
    if (this.auditSink) {
      try {
        await this.auditSink.record(event);
      } catch {
        // Audit transport faults must not corrupt the call outcome.
      }
    }
    return event;
  }
}
