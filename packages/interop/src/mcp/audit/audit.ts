import {
  createMcpToolCall,
  createMcpToolAuditEvent,
  type McpToolCall,
  type McpToolCallStatus,
  type McpToolAuditEvent,
  type McpToolCallInput,
  type McpToolCallDecision,
} from "@recoder/agent-mcp";

/**
 * MCP audit — owned, immutable tool-call ledger records, composed from
 * `@recoder/agent-mcp`'s audit helpers.
 *
 * Every authorize→execute decision the host makes (denied, needs_approval,
 * completed, failed) produces an immutable `McpToolAuditEvent`. interop reuses
 * the upstream record factories (no forked shapes) and adds a port-shaped sink
 * type so the host can route audit events to the agent-events outbox without
 * coupling the pure engine to any transport.
 */

export {
  createMcpToolCall,
  createMcpToolAuditEvent,
  type McpToolCall,
  type McpToolCallStatus,
  type McpToolAuditEvent,
};

/**
 * Where audit events go. An adapter implements this (e.g. agent-events outbox).
 * The host depends only on this port, never on a concrete sink — fail-safe: a
 * missing sink simply means no durable audit, never a thrown call.
 */
export interface McpAuditSinkPort {
  record(event: McpToolAuditEvent): void | Promise<void>;
}

/**
 * Build the immutable audit event for one tool-call decision in a single step.
 * Pure: same inputs → equal output (modulo the injected `now`).
 */
export function buildToolAuditEvent(input: {
  call: McpToolCallInput;
  decision: McpToolCallDecision;
  status: McpToolCallStatus;
  error?: string;
  now?: string;
}): McpToolAuditEvent {
  const call = createMcpToolCall(input.call, input.now);
  return createMcpToolAuditEvent({
    call,
    decision: input.decision,
    status: input.status,
    error: input.error,
    now: input.now,
  });
}
