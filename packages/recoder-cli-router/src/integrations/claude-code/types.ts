/**
 * Types for Claude Code CLI integration.
 *
 * These mirror the JSON-line messages emitted by `claude --print --output-format json`.
 */

export interface ClaudeCodeMessageUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export interface ClaudeCodeMessageContent {
  type: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
}

export interface ClaudeCodeAssistantMessage {
  id: string
  type: "message"
  role: "assistant"
  model: string
  content: ClaudeCodeMessageContent[]
  stop_reason: string | null
  stop_sequence: string | null
  usage: ClaudeCodeMessageUsage
}

export interface ClaudeCodeSystemInit {
  type: "system"
  subtype: "init"
  session_id: string
  tools: unknown[]
  mcp_servers: unknown[]
  apiKeySource?: string
}

export interface ClaudeCodeAssistant {
  type: "assistant"
  message: ClaudeCodeAssistantMessage
  session_id: string
}

export interface ClaudeCodeResult {
  type: "result"
  subtype: string
  result: string
  total_cost_usd: number
  is_error: boolean
  duration_ms: number
  duration_api_ms: number
  num_turns: number
  session_id: string
}

export type ClaudeCodeMessage = ClaudeCodeSystemInit | ClaudeCodeAssistant | ClaudeCodeResult
