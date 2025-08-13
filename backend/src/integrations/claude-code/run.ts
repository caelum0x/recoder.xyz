/**
 * Claude Code integration runner for backend
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
  apiKey?: string
  baseUrl?: string
}

export async function* runClaudeCode(options: ClaudeCodeRunOptions): AsyncGenerator<string | ClaudeCodeRunResult> {
  try {
    // Import Anthropic SDK for direct integration
    const { Anthropic } = await import("@anthropic-ai/sdk");
    
    if (!options.apiKey) {
      yield {
        success: false,
        error: 'API key is required for Claude Code integration'
      };
      return;
    }

    const client = new Anthropic({
      apiKey: options.apiKey,
      baseURL: options.baseUrl
    });

    yield 'Initializing Claude Code session...\n';
    
    yield {
      type: 'system',
      subtype: 'init',
      output: 'Claude Code integration initialized'
    };

    // Prepare messages for Claude
    const claudeMessages = options.messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : 
        Array.isArray(msg.content) ? 
          msg.content.filter(block => block.type === 'text').map(block => block.text).join('\n') :
          String(msg.content)
    }));

    try {
      // Call Claude API
      const response = await (client as any).messages?.create({
        model: options.modelId || 'claude-3-sonnet-20240229',
        max_tokens: options.maxOutputTokens || 4096,
        system: options.systemPrompt,
        messages: claudeMessages,
        stream: false
      });

      if (response) {
        const textContent = response.content?.find((block: any) => block.type === 'text');
        const output = textContent?.text || 'No response generated';
        
        yield output;
        
        yield {
          success: true,
          type: 'assistant',
          output,
          total_cost_usd: calculateCost(response.usage),
          message: {
            content: response.content || [{ type: 'text', text: output }],
            stop_reason: response.stop_reason,
            usage: response.usage
          }
        };
      } else {
        throw new Error('No response from Claude API');
      }
    } catch (apiError: any) {
      console.error('Claude API error:', apiError);
      yield {
        success: false,
        error: `Claude API error: ${apiError.message || 'Unknown error'}`,
        type: 'system'
      };
    }

  } catch (error: any) {
    console.error('Claude Code integration error:', error);
    yield {
      success: false,
      error: `Integration error: ${error.message || 'Unknown error'}`
    };
  }
}

export function isClaudeCodeAvailable(): boolean {
  // Check if we have the necessary dependencies
  try {
    require.resolve('@anthropic-ai/sdk');
    return true;
  } catch {
    return false;
  }
}

function calculateCost(usage: any): number {
  if (!usage) return 0;
  
  // Rough cost calculation for Claude 3 Sonnet
  const inputCostPer1M = 3.0; // $3 per 1M input tokens
  const outputCostPer1M = 15.0; // $15 per 1M output tokens
  
  const inputCost = (usage.input_tokens || 0) / 1_000_000 * inputCostPer1M;
  const outputCost = (usage.output_tokens || 0) / 1_000_000 * outputCostPer1M;
  
  return inputCost + outputCost;
}
