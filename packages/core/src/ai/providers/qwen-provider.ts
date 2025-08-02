/**
 * Qwen AI Provider for Recoder.xyz
 * 
 * Supports Qwen 3 235B and Qwen 2.5 Coder 32B models
 * Qwen 3 is #9 on leaderboard with 4.71B tokens, excellent for code generation
 */

import { BaseAIProvider, AIRequest, AIResponse, StreamChunk, ProviderConfig } from './base-provider';

export interface QwenConfig extends ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: 'qwen2.5-coder-32b-instruct' | 'qwen-turbo' | 'qwen-plus' | 'qwen-max' | 'qwen2.5-72b-instruct';
}

export interface QwenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string; 
}

export interface QwenRequestBody {
  model: string;
  messages: QwenMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  stop?: string[];
  repetition_penalty?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface QwenResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: QwenChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface QwenChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
  };
  finish_reason: 'stop' | 'length' | 'content_filter' | 'function_call' | null;
}

export interface QwenStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
}

export class QwenProvider extends BaseAIProvider {
  protected config: QwenConfig;
  private baseUrl: string;

  constructor(config: QwenConfig) {
    super('qwen', 'Qwen (Alibaba Cloud)', config);
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://dashscope.aliyuncs.com/api/v1';
  }

  /**
   * Send request to Qwen API
   */
  async sendRequest(request: AIRequest): Promise<AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();

    try {
      const qwenRequest = this.buildQwenRequest(request);
      const response = await this.makeAPIRequest('/services/aigc/text-generation/generation', qwenRequest);
      const qwenResponse = response as QwenResponse;

      if (!qwenResponse.choices || qwenResponse.choices.length === 0) {
        throw new Error('No response choices received from Qwen');
      }

      const choice = qwenResponse.choices[0];
      const content = choice.message.content;

      const aiResponse: AIResponse = {
        id: request.id,
        content,
        usage: {
          inputTokens: qwenResponse.usage.prompt_tokens,
          outputTokens: qwenResponse.usage.completion_tokens,
          totalTokens: qwenResponse.usage.total_tokens,
          cost: this.calculateCost(
            qwenResponse.usage.prompt_tokens,
            qwenResponse.usage.completion_tokens
          )
        },
        metadata: {
          model: qwenResponse.model,
          provider: this.providerId,
          responseTime: Date.now() - startTime,
          finishReason: this.mapFinishReason(choice.finish_reason),
          confidence: this.calculateConfidence(choice),
          toolCalls: [],
          cached: false
        }
      };

      this.trackRequestComplete(request, aiResponse);
      return aiResponse;

    } catch (error) {
      this.trackRequestError(request, error as Error);
      throw error;
    }
  }

  /**
   * Send streaming request to Qwen API
   */
  async* sendStreamingRequest(request: AIRequest): AsyncGenerator<StreamChunk, AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();
    let fullContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finishReason: string | null = null;

    try {
      const qwenRequest = this.buildQwenRequest(request, true);
      const stream = await this.makeStreamingAPIRequest('/services/aigc/text-generation/generation', qwenRequest);

      for await (const chunk of stream) {
        if (chunk.startsWith('data:')) {
          const data = chunk.slice(5).trim();
          
          if (data === '[DONE]') {
            break;
          }

          try {
            const streamResponse = JSON.parse(data) as QwenStreamResponse;
            
            if (streamResponse.choices && streamResponse.choices.length > 0) {
              const choice = streamResponse.choices[0];
              
              if (choice.delta.content) {
                const streamChunk: StreamChunk = {
                  id: request.id,
                  delta: choice.delta.content,
                  isComplete: false
                };

                fullContent += choice.delta.content;
                yield streamChunk;
              }

              if (choice.finish_reason) {
                finishReason = choice.finish_reason;
              }
            }
          } catch (parseError) {
            // Skip invalid JSON chunks
            continue;
          }
        }
      }

      // Estimate token usage for final response
      totalInputTokens = Math.ceil(request.prompt.length / 4);
      totalOutputTokens = Math.ceil(fullContent.length / 4);

      const finalResponse: AIResponse = {
        id: request.id,
        content: fullContent,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
          cost: this.calculateCost(totalInputTokens, totalOutputTokens)
        },
        metadata: {
          model: request.options.model || this.config.defaultModel || 'qwen2.5-coder-32b-instruct',
          provider: this.providerId,
          responseTime: Date.now() - startTime,
          finishReason: this.mapFinishReason(finishReason),
          cached: false
        },
        streaming: {
          isComplete: true,
          streamId: request.id
        }
      };

      this.trackRequestComplete(request, finalResponse);
      return finalResponse;

    } catch (error) {
      this.trackRequestError(request, error as Error);
      throw error;
    }
  }

  /**
   * Get available Qwen models
   */
  async getAvailableModels(): Promise<string[]> {
    return [
      'qwen2.5-coder-32b-instruct',  // Specialized for coding
      'qwen-turbo',                   // Fast and efficient
      'qwen-plus',                    // Balanced performance
      'qwen-max',                     // Maximum capabilities
      'qwen2.5-72b-instruct'         // Large instruction-following model
    ];
  }

  /**
   * Test Qwen API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testRequest: QwenRequestBody = {
        model: this.config.defaultModel || 'qwen2.5-coder-32b-instruct',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      };

      await this.makeAPIRequest('/services/aigc/text-generation/generation', testRequest);
      return true;
    } catch (error) {
      console.error('Qwen connection test failed:', error);
      return false;
    }
  }

  /**
   * Get maximum tokens supported
   */
  protected getMaxTokensSupported(): number {
    const modelLimits: { [key: string]: number } = {
      'qwen2.5-coder-32b-instruct': 32768,  // 32K context for coding
      'qwen-turbo': 8192,                   // 8K context
      'qwen-plus': 32768,                   // 32K context
      'qwen-max': 8192,                     // 8K context
      'qwen2.5-72b-instruct': 32768        // 32K context
    };

    const model = this.config.defaultModel || 'qwen2.5-coder-32b-instruct';
    return modelLimits[model] || 32768;
  }

  /**
   * Calculate cost based on Qwen pricing
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const model = this.config.defaultModel || 'qwen2.5-coder-32b-instruct';
    
    // Qwen pricing per 1M tokens (competitive Chinese pricing)
    const pricingMap: { [key: string]: { input: number; output: number } } = {
      'qwen2.5-coder-32b-instruct': { input: 0.50, output: 1.50 },  // Specialized coding model
      'qwen-turbo': { input: 0.30, output: 0.60 },                  // Fast and cheap
      'qwen-plus': { input: 1.00, output: 2.00 },                   // Balanced
      'qwen-max': { input: 3.00, output: 6.00 },                    // Premium
      'qwen2.5-72b-instruct': { input: 2.00, output: 4.00 }         // Large model
    };

    const pricing = pricingMap[model] || pricingMap['qwen2.5-coder-32b-instruct'];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Build Qwen API request
   */
  private buildQwenRequest(request: AIRequest, streaming: boolean = false): QwenRequestBody {
    const messages: QwenMessage[] = [];

    // Add system prompt if provided
    if (request.options.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.options.systemPrompt
      });
    }

    // Add context messages if provided
    if (request.context?.previousMessages) {
      for (const msg of request.context.previousMessages) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      }
    }

    // Add current prompt with coding-specific enhancements
    messages.push({
      role: 'user',
      content: this.buildEnhancedPrompt(request)
    });

    const qwenRequest: QwenRequestBody = {
      model: request.options.model || this.config.defaultModel || 'qwen2.5-coder-32b-instruct',
      messages,
      max_tokens: request.options.maxTokens || 4096,
      temperature: request.options.temperature || 0.7,
      top_p: 0.8,
      top_k: 50,
      stream: streaming,
      repetition_penalty: 1.1
    };

    return qwenRequest;
  }

  /**
   * Build enhanced prompt leveraging Qwen's coding expertise
   */
  private buildEnhancedPrompt(request: AIRequest): string {
    let content = request.prompt;

    // For code generation, emphasize Qwen Coder's strengths
    if (request.metadata.taskType === 'code-generation') {
      const model = request.options.model || this.config.defaultModel || 'qwen2.5-coder-32b-instruct';
      
      if (model.includes('coder')) {
        content = `QWEN_CODER_MODE: You are Qwen2.5-Coder, optimized for code generation. Generate:\n- Production-ready, functional code\n- Proper error handling and validation\n- Clean, maintainable structure\n- Real implementations (no placeholders)\n\n${content}`;
      }
    }

    // For debugging tasks, use systematic approach
    if (request.metadata.taskType === 'debugging') {
      content = `DEBUGGING_ANALYSIS: Perform systematic code analysis:\n1. Code inspection and pattern recognition\n2. Root cause identification\n3. Solution implementation\n4. Testing and validation approach\n\n${content}`;
    }

    // For security tasks, emphasize thoroughness
    if (request.metadata.taskType === 'security-audit') {
      content = `SECURITY_ANALYSIS: Conduct comprehensive security review:\n- Vulnerability identification\n- Attack vector analysis\n- Mitigation strategies\n- Best practice recommendations\n\n${content}`;
    }

    // Add structured context for better understanding
    if (request.context?.projectContext) {
      content = `## Project Overview\n${request.context.projectContext}\n\n## Current Task\n${content}`;
    }

    // Add code context with syntax highlighting hints
    if (request.context?.codeContext) {
      const language = request.metadata.taskType || 'javascript';
      content = `## Code Context\n\`\`\`${language}\n${request.context.codeContext}\n\`\`\`\n\n${content}`;
    }

    return content;
  }

  /**
   * Make API request to Qwen
   */
  private async makeAPIRequest(endpoint: string, body: QwenRequestBody): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-DashScope-SSE': 'disable'
      },
      body: JSON.stringify({
        input: {
          messages: body.messages
        },
        parameters: {
          max_tokens: body.max_tokens,
          temperature: body.temperature,
          top_p: body.top_p,
          top_k: body.top_k,
          repetition_penalty: body.repetition_penalty,
          stop: body.stop
        }
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`Qwen API error: ${response.status} - ${error.message || 'Unknown error'}`);
    }

    const result = await response.json();
    
    // Transform Qwen response format to standard format
    return {
      id: `qwen-${Date.now()}`,
      object: 'chat.completion',
      created: Date.now(),
      model: body.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: result.output?.text || result.output?.choices?.[0]?.message?.content || ''
        },
        finish_reason: result.output?.finish_reason || 'stop'
      }],
      usage: {
        prompt_tokens: result.usage?.input_tokens || 0,
        completion_tokens: result.usage?.output_tokens || 0,
        total_tokens: result.usage?.total_tokens || 0
      }
    };
  }

  /**
   * Make streaming API request to Qwen
   */
  private async *makeStreamingAPIRequest(endpoint: string, body: QwenRequestBody): AsyncGenerator<string, any, any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-DashScope-SSE': 'enable',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        input: {
          messages: body.messages
        },
        parameters: {
          max_tokens: body.max_tokens,
          temperature: body.temperature,
          top_p: body.top_p,
          top_k: body.top_k,
          repetition_penalty: body.repetition_penalty,
          incremental_output: true
        }
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`Qwen API error: ${response.status} - ${error.message || 'Unknown error'}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data:')) {
            yield line;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Map Qwen finish reason to standard format
   */
  private mapFinishReason(finishReason: string | null): AIResponse['metadata']['finishReason'] {
    const mapping: { [key: string]: AIResponse['metadata']['finishReason'] } = {
      'stop': 'completed',
      'length': 'length',
      'content_filter': 'content_filter',
      'function_call': 'tool_calls'
    };

    return finishReason ? (mapping[finishReason] || 'completed') : 'completed';
  }

  /**
   * Calculate confidence score for Qwen responses
   */
  private calculateConfidence(choice: QwenChoice): number {
    let confidence = 0.89; // Qwen is highly capable, especially for coding

    if (choice.finish_reason === 'stop') {
      confidence += 0.06;
    }

    // Check for code quality indicators
    const content = choice.message.content;
    if (content) {
      // Higher confidence for code-related responses
      if (content.includes('```') || content.includes('function') || content.includes('class')) {
        confidence += 0.05;
      }
      
      // Check for completeness
      if (content.length > 100 && !content.includes('I cannot') && !content.includes('I\'m unable')) {
        confidence += 0.05;
      }
    }

    return Math.min(1.0, confidence);
  }
}

export default QwenProvider;