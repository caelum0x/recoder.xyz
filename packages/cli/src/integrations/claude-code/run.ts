/**
 * Claude Code integration runner (stub implementation)
 */

export interface ClaudeCodeRunResult {
  success?: boolean
  output?: string
  error?: string
  type?: 'system' | 'assistant' | 'result'
  subtype?: 'init' | 'message'
  apiKeySource?: string
  total_cost_usd?: number
  message?: {
    content: Array<{ type: string; text?: string; thinking?: string }>
    stop_reason: string | null
    usage?: {
      input_tokens: number
      output_tokens: number  
      cache_creation_input_tokens?: number
      cache_read_input_tokens?: number
    }
  }
}

export interface ClaudeCodeRunOptions {
  systemPrompt: string
  messages: any[]
  path?: string
  modelId: string
  maxOutputTokens?: number
}

export async function* runClaudeCode(options: ClaudeCodeRunOptions): AsyncGenerator<string | ClaudeCodeRunResult> {
  // This is a stub implementation
  // The actual Claude Code integration would be implemented here
  console.warn('Claude Code integration is not fully implemented')
  
  yield 'Claude Code integration is not available in this build. ';
  yield 'This is a stub implementation for build compatibility.';
  
  return {
    success: false,
    error: 'Claude Code integration is not available in this build'
  }
}

export function isClaudeCodeAvailable(): boolean {
  return false
}