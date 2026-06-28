/**
 * MCP policy — the pure decision layer, composed from `@recoder/agent-mcp`.
 *
 * interop does NOT re-implement permission logic; it re-exports the upstream
 * pure functions so the host (and the signed-ingress gate) call exactly one
 * canonical decision path:
 *
 *   - `canCallMcpTool`        — registry + agent tool-policy gate (allow/deny).
 *   - `estimateMcpToolRisk`   — low/medium/high heuristic over the tool name.
 *   - `checkMcpToolPermission`— fuses `canCallMcpTool` + agent-policy intent +
 *                               risk into the final decision the host enforces.
 *
 * Re-exporting (not forking) keeps a single source of truth for "may this actor
 * call this tool?" — the rule that policy intent lives in agent-policy and the
 * permission contract lives in agent-mcp, not duplicated here.
 */
export {
  canCallMcpTool,
  estimateMcpToolRisk,
  checkMcpToolPermission,
  type McpToolCallInput,
  type McpToolCallDecision,
  type McpToolRisk,
} from "@recoder/agent-mcp";
