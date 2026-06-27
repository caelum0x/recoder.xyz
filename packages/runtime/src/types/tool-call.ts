/**
 * Normalized tool-call / tool-result shape across all CLIs.
 * Drivers map native tool events (claude tool_use, codex patch, pi AgentToolCall,
 * ToolLoopAgent tool parts) into this one shape so policy guards + events stay uniform.
 */
export type ToolCallMode = 'read' | 'write' | 'execute' | 'network' | 'custom';

export type NormalizedToolCall = {
  /** Stable id used to pair a call with its result across the stream. */
  toolCallId: string;
  toolName: string;
  /** Best-effort classification used by policy guards (write/forbidden-path checks). */
  modes: readonly ToolCallMode[];
  /** Raw tool input args (already secret-redacted before emit). */
  input?: Record<string, unknown>;
  /** Paths this call intends to touch, if known (drives forbidden/target-path guards). */
  paths?: readonly string[];
};

export type NormalizedToolResult = {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  output?: unknown;
  errorMessage?: string;
};
