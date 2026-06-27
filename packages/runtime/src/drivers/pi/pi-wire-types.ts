/**
 * FUSION of the pi-coding-agent JSONL wire protocol.
 *
 * `@recoder/pi-coding-agent` is not yet published with built declarations and is not on the
 * monorepo tsconfig `paths` map, so its internal types are not type-resolvable from here.
 * Rather than import an unbuilt package (which would break `tsc`), this module OWNS a
 * faithful, structural merge of the exact wire shapes pi emits, fused from:
 *
 *  - `packages/pi-agent-core/src/types.ts`            (`AgentEvent`)
 *  - `packages/pi-coding-agent/src/core/agent-session.ts` (`AgentSessionEvent`)
 *  - `packages/pi-ai/src/types.ts`                    (`Message`, content blocks, `Usage`, `StopReason`)
 *  - `packages/pi-coding-agent/src/core/session-manager.ts` (`SessionHeader`)
 *  - `packages/pi-coding-agent/src/modes/rpc/rpc-types.ts`  (`RpcCommand`, `RpcResponse`)
 *
 * The driver consumes these as plain JSON parsed off the pi CLI's stdout/stdin. Keeping
 * them as structural types (not behavioural imports) is the same fusion discipline used by
 * `drivers/shared/jsonl-*.ts` and `spawn.ts`, which merged pi's plumbing rather than wrapping it.
 */

// ============================================================================
// pi-ai content blocks + message shapes (structural subset we read)
// ============================================================================

export type PiTextContent = { type: 'text'; text: string; textSignature?: string };

export type PiThinkingContent = {
  type: 'thinking';
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
};

export type PiImageContent = { type: 'image'; data: string; mimeType: string };

export type PiToolCallContent = {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  thoughtSignature?: string;
};

export type PiAssistantContent = PiTextContent | PiThinkingContent | PiToolCallContent;

/** pi-ai `StopReason`. */
export type PiStopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';

/** pi-ai `Usage` (folded into our normalized `TokenUsage`). */
export type PiUsage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h?: number;
  reasoning?: number;
  totalTokens: number;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
};

export type PiUserMessage = {
  role: 'user';
  content: string | (PiTextContent | PiImageContent)[];
  timestamp: number;
};

export type PiAssistantMessage = {
  role: 'assistant';
  content: PiAssistantContent[];
  api?: string;
  provider?: string;
  model?: string;
  usage: PiUsage;
  stopReason: PiStopReason;
  errorMessage?: string;
  timestamp: number;
};

export type PiToolResultMessage = {
  role: 'toolResult';
  toolCallId: string;
  toolName: string;
  content: (PiTextContent | PiImageContent)[];
  isError: boolean;
  timestamp: number;
};

export type PiMessage = PiUserMessage | PiAssistantMessage | PiToolResultMessage;

// ============================================================================
// pi-ai streaming event protocol (`AssistantMessageEvent`)
// ============================================================================

export type PiAssistantMessageEvent =
  | { type: 'start'; partial: PiAssistantMessage }
  | { type: 'text_start'; contentIndex: number; partial: PiAssistantMessage }
  | { type: 'text_delta'; contentIndex: number; delta: string; partial: PiAssistantMessage }
  | { type: 'text_end'; contentIndex: number; content: string; partial: PiAssistantMessage }
  | { type: 'thinking_start'; contentIndex: number; partial: PiAssistantMessage }
  | { type: 'thinking_delta'; contentIndex: number; delta: string; partial: PiAssistantMessage }
  | { type: 'thinking_end'; contentIndex: number; content: string; partial: PiAssistantMessage }
  | { type: 'toolcall_start'; contentIndex: number; partial: PiAssistantMessage }
  | { type: 'toolcall_delta'; contentIndex: number; delta: string; partial: PiAssistantMessage }
  | { type: 'toolcall_end'; contentIndex: number; toolCall: PiToolCallContent; partial: PiAssistantMessage }
  | { type: 'done'; reason: 'stop' | 'length' | 'toolUse'; message: PiAssistantMessage }
  | { type: 'error'; reason: 'aborted' | 'error'; error: PiAssistantMessage };

// ============================================================================
// pi-agent-core `AgentEvent` + pi-coding-agent `AgentSessionEvent`
// ============================================================================

/** The session header pi emits as the first JSONL line in `--mode json`. */
export type PiSessionHeader = {
  type: 'session';
  version?: number;
  id: string;
  timestamp: string;
  cwd: string;
  parentSession?: string;
};

/** Core agent loop events from pi-agent-core. */
export type PiAgentEvent =
  | { type: 'agent_start' }
  | { type: 'agent_end'; messages: PiMessage[] }
  | { type: 'turn_start' }
  | { type: 'turn_end'; message: PiMessage; toolResults: PiToolResultMessage[] }
  | { type: 'message_start'; message: PiMessage }
  | { type: 'message_update'; message: PiMessage; assistantMessageEvent: PiAssistantMessageEvent }
  | { type: 'message_end'; message: PiMessage }
  | { type: 'tool_execution_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_execution_update'; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
  | { type: 'tool_execution_end'; toolCallId: string; toolName: string; result: unknown; isError: boolean };

/**
 * Session-mode events emitted by `session.subscribe` in print/json mode. `agent_end` is
 * overridden to carry the final `messages` snapshot + `willRetry`.
 */
export type PiAgentSessionEvent =
  | Exclude<PiAgentEvent, { type: 'agent_end' }>
  | { type: 'agent_end'; messages: PiMessage[]; willRetry: boolean }
  | { type: 'queue_update'; steering: readonly string[]; followUp: readonly string[] }
  | { type: 'compaction_start'; reason: 'manual' | 'threshold' | 'overflow' }
  | { type: 'session_info_changed'; name: string | undefined }
  | { type: 'thinking_level_changed'; level: string }
  | {
      type: 'compaction_end';
      reason: 'manual' | 'threshold' | 'overflow';
      result: unknown;
      aborted: boolean;
      willRetry: boolean;
      errorMessage?: string;
    }
  | { type: 'auto_retry_start'; attempt: number; maxAttempts: number; delayMs: number; errorMessage: string }
  | { type: 'auto_retry_end'; success: boolean; attempt: number; finalError?: string };

/** Any JSONL line pi writes on stdout in json/print mode. */
export type PiStdoutLine = PiSessionHeader | PiAgentSessionEvent | PiRpcResponse;

// ============================================================================
// RPC protocol (rpc-types.ts) — the subset the driver drives
// ============================================================================

/** Outbound RPC command body (id added by the client). */
export type PiRpcCommandBody =
  | { type: 'prompt'; message: string; streamingBehavior?: 'steer' | 'followUp' }
  | { type: 'steer'; message: string }
  | { type: 'follow_up'; message: string }
  | { type: 'abort' }
  | { type: 'get_state' }
  | { type: 'compact'; customInstructions?: string }
  | { type: 'set_auto_compaction'; enabled: boolean }
  | { type: 'get_last_assistant_text' };

export type PiRpcCommand = PiRpcCommandBody & { id: string };

/** Inbound RPC response (correlated by `id`). Events without `id` are `PiAgentSessionEvent`. */
export type PiRpcResponse =
  | { type: 'response'; id?: string; command: string; success: true; data?: unknown }
  | { type: 'response'; id?: string; command: string; success: false; error: string };

export function isRpcResponse(line: unknown): line is PiRpcResponse {
  return typeof line === 'object' && line !== null && (line as { type?: unknown }).type === 'response';
}

export function isSessionHeader(line: unknown): line is PiSessionHeader {
  return typeof line === 'object' && line !== null && (line as { type?: unknown }).type === 'session';
}
