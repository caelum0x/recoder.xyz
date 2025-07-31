/**
 * Claude Code integration runner (stub implementation for router)
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
  cacheBreakpoints?: boolean
}

export async function* runClaudeCode(options: ClaudeCodeRunOptions): AsyncGenerator<string | ClaudeCodeRunResult> {
  // This is a stub implementation for the router
  // In a real implementation, this would integrate with Claude Code CLI
  yield "Claude Code integration is not available in router mode";
  
  return {
    success: false,
    error: "Claude Code integration not implemented in router",
    type: 'system'
  };
}