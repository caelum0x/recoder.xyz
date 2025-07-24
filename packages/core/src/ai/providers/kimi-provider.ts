/**
 * Kimi K2 AI Provider for Recoder.xyz
 * 
 * Supports Kimi K2 (Moonshot AI) - currently #5 on leaderboard with 17.4B tokens
 * Excellent for code generation and analysis tasks
 */

import { BaseAIProvider, AIRequest, AIResponse, StreamChunk, ProviderConfig } from './base-provider';

export interface KimiConfig extends ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: 'moonshot-v1-8k' | 'moonshot-v1-32k' | 'moonshot-v1-128k';
}

export interface KimiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface KimiRequestBody {
  model: string;
  messages: KimiMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
}

export interface KimiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: KimiChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface KimiChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
  };
  finish_reason: 'stop' | 'length' | 'content_filter' | null;
}

export interface KimiStreamResponse {
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

export class KimiProvider extends BaseAIProvider {
  private config: KimiConfig;
  private baseUrl: string;

  constructor(config: KimiConfig) {
    super('moonshot', 'Kimi K2 (Moonshot AI)', config);
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.moonshot.cn/v1';
  }

  /**
   * Send request to Kimi API
   */
  async sendRequest(request: AIRequest): Promise<AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();

    try {
      const kimiRequest = this.buildKimiRequest(request);
      const response = await this.makeAPIRequest('/chat/completions', kimiRequest);
      const kimiResponse = response as KimiResponse;

      if (!kimiResponse.choices || kimiResponse.choices.length === 0) {
        throw new Error('No response choices received from Kimi');
      }

      const choice = kimiResponse.choices[0];
      const content = choice.message.content;

      const aiResponse: AIResponse = {
        id: request.id,
        content,
        usage: {
          inputTokens: kimiResponse.usage.prompt_tokens,
          outputTokens: kimiResponse.usage.completion_tokens,
          totalTokens: kimiResponse.usage.total_tokens,
          cost: this.calculateCost(
            kimiResponse.usage.prompt_tokens,
            kimiResponse.usage.completion_tokens
          )
        },
        metadata: {
          model: kimiResponse.model,
          provider: this.providerId,
          responseTime: Date.now() - startTime,
          finishReason: this.mapFinishReason(choice.finish_reason),
          confidence: this.calculateConfidence(choice),
          toolCalls: []
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
   * Send streaming request to Kimi API
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
      const kimiRequest = this.buildKimiRequest(request, true);
      const stream = await this.makeStreamingAPIRequest('/chat/completions', kimiRequest);

      for await (const chunk of stream) {
        if (chunk.startsWith('data: ')) {
          const data = chunk.slice(6);
          
          if (data === '[DONE]') {
            break;
          }

          try {
            const streamResponse = JSON.parse(data) as KimiStreamResponse;
            
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

      // Estimate token usage for final response (Kimi doesn't provide usage in streaming)
      totalInputTokens = Math.ceil(request.prompt.length / 4); // Rough estimation
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
          model: request.options.model || this.config.defaultModel || 'moonshot-v1-8k',
          provider: this.providerId,
          responseTime: Date.now() - startTime,
          finishReason: this.mapFinishReason(finishReason)
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
   * Get available Kimi models
   */
  async getAvailableModels(): Promise<string[]> {
    return [
      'moonshot-v1-8k',    // 8K context
      'moonshot-v1-32k',   // 32K context  
      'moonshot-v1-128k'   // 128K context
    ];
  }

  /**
   * Test Kimi API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testRequest: KimiRequestBody = {
        model: this.config.defaultModel || 'moonshot-v1-8k',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      };

      await this.makeAPIRequest('/chat/completions', testRequest);
      return true;
    } catch (error) {
      console.error('Kimi connection test failed:', error);
      return false;
    }
  }

  /**
   * Get maximum tokens supported
   */
  protected getMaxTokensSupported(): number {
    const modelLimits: { [key: string]: number } = {
      'moonshot-v1-8k': 8000,
      'moonshot-v1-32k': 32000,
      'moonshot-v1-128k': 128000
    };

    const model = this.config.defaultModel || 'moonshot-v1-8k';
    return modelLimits[model] || 8000;
  }

  /**
   * Calculate cost based on Kimi pricing
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const model = this.config.defaultModel || 'moonshot-v1-8k';
    
    // Kimi pricing per 1M tokens (estimated based on market position)
    const pricingMap: { [key: string]: { input: number; output: number } } = {
      'moonshot-v1-8k': { input: 1.00, output: 2.00 },    // Competitive pricing
      'moonshot-v1-32k': { input: 2.00, output: 4.00 },   // Higher for larger context
      'moonshot-v1-128k': { input: 8.00, output: 16.00 }  // Premium for 128K context
    };

    const pricing = pricingMap[model] || pricingMap['moonshot-v1-8k'];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Build Kimi API request
   */
  private buildKimiRequest(request: AIRequest, streaming: boolean = false): KimiRequestBody {
    const messages: KimiMessage[] = [];

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

    // Add current prompt with code-specific enhancements
    messages.push({
      role: 'user',
      content: this.buildEnhancedPrompt(request)
    });

    const kimiRequest: KimiRequestBody = {
      model: request.options.model || this.config.defaultModel || 'moonshot-v1-8k',
      messages,
      max_tokens: request.options.maxTokens || 4096,
      temperature: request.options.temperature || 0.7,
      top_p: 0.9,
      stream: streaming
    };

    return kimiRequest;
  }

  /**
   * Build enhanced prompt leveraging Kimi's coding strengths
   */
  private buildEnhancedPrompt(request: AIRequest): string {
    let content = request.prompt;

    // For code generation tasks, add Kimi-specific optimizations
    if (request.metadata.taskType === 'code-generation') {
      content = `CODE_GENERATION_MODE: Generate production-ready, functional code with:\n- Real implementations (no mocks or TODOs)\n- Proper error handling\n- Input validation\n- Security best practices\n\n${content}`;
    }

    // For debugging tasks, leverage Kimi's analytical strengths
    if (request.metadata.taskType === 'debugging') {
      content = `DEBUGGING_MODE: Analyze the code systematically:\n1. Identify the root cause\n2. Explain the issue clearly\n3. Provide working solution\n4. Suggest prevention measures\n\n${content}`;
    }

    // Add project context with structure for better understanding
    if (request.context?.projectContext) {
      content = `## Project Context\n${request.context.projectContext}\n\n## Task\n${content}`;
    }

    // Add code context with proper formatting
    if (request.context?.codeContext) {
      content = `## Existing Code\n\`\`\`\n${request.context.codeContext}\n\`\`\`\n\n${content}`;
    }

    return content;
  }

  /**
   * Make API request to Kimi
   */
  private async makeAPIRequest(endpoint: string, body: KimiRequestBody): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`Kimi API error: ${response.status} - ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
  }

  /**
   * Make streaming API request to Kimi
   */
  private async makeStreamingAPIRequest(endpoint: string, body: KimiRequestBody): AsyncGenerator<string> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`Kimi API error: ${response.status} - ${error.error?.message || 'Unknown error'}`);
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
          if (line.trim()) {
            yield line;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Map Kimi finish reason to standard format
   */
  private mapFinishReason(finishReason: string | null): AIResponse['metadata']['finishReason'] {
    const mapping: { [key: string]: AIResponse['metadata']['finishReason'] } = {
      'stop': 'completed',
      'length': 'length',
      'content_filter': 'content_filter'
    };

    return finishReason ? (mapping[finishReason] || 'completed') : 'completed';
  }

  /**
   * Calculate confidence score for Kimi responses
   */
  private calculateConfidence(choice: KimiChoice): number {
    let confidence = 0.88; // Kimi K2 is highly reliable (#5 on leaderboard)

    if (choice.finish_reason === 'stop') {
      confidence += 0.07;
    }

    // Check content quality indicators
    const content = choice.message.content;
    if (content && content.length > 50 && !content.includes('I cannot') && !content.includes('I\'m sorry')) {
      confidence += 0.05;
    }

    return Math.min(1.0, confidence);
  }
}

export default KimiProvider;