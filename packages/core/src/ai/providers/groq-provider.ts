/**
 * Groq AI Provider for Recoder.xyz
 * 
 * Ultra-fast inference for rapid prototyping and UI component generation
 */

import { BaseAIProvider, AIRequest, AIResponse, StreamChunk, ProviderConfig } from './base-provider';

export interface GroqConfig extends ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: 'llama-3.3-70b-versatile' | 'llama-3.1-70b-versatile' | 'llama-3.1-8b-instant' | 'gemma2-9b-it';
}

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqRequestBody {
  model: string;
  messages: GroqMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
  stream?: boolean;
  tools?: GroqToolDefinition[];
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
}

export interface GroqToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

export interface GroqResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: GroqChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;
}

export interface GroqChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    tool_calls?: GroqToolCall[];
  };
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}

export interface GroqToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface GroqStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      tool_calls?: Partial<GroqToolCall>[];
    };
    finish_reason?: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class GroqProvider extends BaseAIProvider {
  private config: GroqConfig;
  private baseUrl: string;

  constructor(config: GroqConfig) {
    super('groq', 'Groq', config);
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.groq.com/openai/v1';
  }

  /**
   * Send request to Groq API
   */
  async sendRequest(request: AIRequest): Promise<AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();

    try {
      const groqRequest = this.buildGroqRequest(request);
      const response = await this.makeAPIRequest('/chat/completions', groqRequest);
      const groqResponse = response as GroqResponse;

      if (!groqResponse.choices || groqResponse.choices.length === 0) {
        throw new Error('No response choices received from Groq');
      }

      const choice = groqResponse.choices[0];
      const aiResponse: AIResponse = {
        id: groqResponse.id,
        content: choice.message.content || '',
        usage: {
          inputTokens: groqResponse.usage.prompt_tokens,
          outputTokens: groqResponse.usage.completion_tokens,
          totalTokens: groqResponse.usage.total_tokens,
          cost: this.calculateCost(groqResponse.usage.prompt_tokens, groqResponse.usage.completion_tokens)
        },
        metadata: {
          model: groqResponse.model,
          provider: this.providerId,
          responseTime: Date.now() - startTime,
          finishReason: this.mapFinishReason(choice.finish_reason),
          confidence: this.calculateConfidence(choice),
          toolCalls: this.extractToolCalls(choice.message.tool_calls || [])
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
   * Send streaming request to Groq API
   */
  async* sendStreamingRequest(request: AIRequest): AsyncGenerator<StreamChunk, AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();
    let fullContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finishReason: string = 'stop';

    try {
      const groqRequest = this.buildGroqRequest(request, true);
      const stream = await this.makeStreamingAPIRequest('/chat/completions', groqRequest);

      for await (const chunk of stream) {
        const streamChunk = JSON.parse(chunk) as GroqStreamChunk;

        if (streamChunk.choices && streamChunk.choices.length > 0) {
          const choice = streamChunk.choices[0];

          if (choice.delta.content) {
            const streamResult: StreamChunk = {
              id: request.id,
              delta: choice.delta.content,
              isComplete: false
            };

            fullContent += choice.delta.content;
            yield streamResult;
          }

          if (choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
        }

        if (streamChunk.usage) {
          totalInputTokens = streamChunk.usage.prompt_tokens;
          totalOutputTokens = streamChunk.usage.completion_tokens;
        }
      }

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
          model: request.options.model || this.config.defaultModel || 'llama-3.3-70b-versatile',
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
   * Get available Groq models
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.makeAPIRequest('/models', null, 'GET');
      return response.data.map((model: any) => model.id);
    } catch (error) {
      // Return default models if API call fails
      return [
        'llama-3.3-70b-versatile',
        'llama-3.1-70b-versatile',
        'llama-3.1-8b-instant',
        'gemma2-9b-it'
      ];
    }
  }

  /**
   * Test Groq API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testRequest: GroqRequestBody = {
        model: this.config.defaultModel || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      };

      await this.makeAPIRequest('/chat/completions', testRequest);
      return true;
    } catch (error) {
      console.error('Groq connection test failed:', error);
      return false;
    }
  }

  /**
   * Get maximum tokens supported
   */
  protected getMaxTokensSupported(): number {
    const modelLimits: { [key: string]: number } = {
      'llama-3.3-70b-versatile': 32_768,
      'llama-3.1-70b-versatile': 32_768,
      'llama-3.1-8b-instant': 32_768,
      'gemma2-9b-it': 8_192
    };

    const model = this.config.defaultModel || 'llama-3.3-70b-versatile';
    return modelLimits[model] || 32_768;
  }

  /**
   * Calculate cost based on Groq pricing (very low cost)
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    // Groq pricing (example - very competitive rates)
    const inputCostPer1M = 0.27; // $0.27 per 1M input tokens
    const outputCostPer1M = 0.27; // $0.27 per 1M output tokens

    const inputCost = (inputTokens / 1_000_000) * inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * outputCostPer1M;

    return inputCost + outputCost;
  }

  /**
   * Build Groq API request
   */
  private buildGroqRequest(request: AIRequest, streaming: boolean = false): GroqRequestBody {
    const messages: GroqMessage[] = [];

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
        if (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      }
    }

    // Add current prompt with enhanced context for speed optimization
    messages.push({
      role: 'user',
      content: this.buildOptimizedPrompt(request)
    });

    const groqRequest: GroqRequestBody = {
      model: request.options.model || this.config.defaultModel || 'llama-3.3-70b-versatile',
      messages,
      max_tokens: request.options.maxTokens || 4096,
      temperature: request.options.temperature || 0.7,
      stream: streaming
    };

    // Add tools if provided
    if (request.options.tools && request.options.tools.length > 0) {
      groqRequest.tools = request.options.tools.map(this.convertToolDefinition);
      groqRequest.tool_choice = 'auto';
    }

    return groqRequest;
  }

  /**
   * Build optimized prompt for Groq's fast inference
   */
  private buildOptimizedPrompt(request: AIRequest): string {
    let content = request.prompt;

    // For UI components and rapid prototyping, add speed-optimized instructions
    if (request.metadata.taskType === 'ui-components' || request.metadata.taskType === 'rapid-prototyping') {
      content = `FAST_MODE: Generate concise, production-ready code. Focus on:\n- Clean component structure\n- Minimal dependencies\n- TypeScript ready\n- Responsive design\n\n${content}`;
    }

    // Add project context (optimized for speed)
    if (request.context?.projectContext) {
      const truncatedContext = request.context.projectContext.length > 2000 
        ? request.context.projectContext.substring(0, 2000) + '...'
        : request.context.projectContext;
      content = `Context: ${truncatedContext}\n\n${content}`;
    }

    // Add code context (optimized for speed)
    if (request.context?.codeContext) {
      const truncatedCode = request.context.codeContext.length > 3000
        ? request.context.codeContext.substring(0, 3000) + '...'
        : request.context.codeContext;
      content = `Current Code:\n\`\`\`\n${truncatedCode}\n\`\`\`\n\n${content}`;
    }

    return content;
  }

  /**
   * Make API request to Groq
   */
  private async makeAPIRequest(endpoint: string, body: any, method: string = 'POST'): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const requestOptions: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    if (body && method !== 'GET') {
      requestOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, requestOptions);

    // Parse rate limit headers
    this.parseRateLimitHeaders(this.extractHeaders(response));

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`Groq API error: ${response.status} - ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
  }

  /**
   * Make streaming API request to Groq
   */
  private async makeStreamingAPIRequest(endpoint: string, body: any): AsyncGenerator<string> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`Groq API error: ${response.status} - ${error.error?.message || 'Unknown error'}`);
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
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') return;
            yield data;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Extract tool calls from Groq response
   */
  private extractToolCalls(toolCalls: GroqToolCall[]): any[] {
    return toolCalls.map(call => ({
      id: call.id,
      name: call.function.name,
      arguments: JSON.parse(call.function.arguments || '{}')
    }));
  }

  /**
   * Map Groq finish reason to standard format
   */
  private mapFinishReason(finishReason: string): AIResponse['metadata']['finishReason'] {
    const mapping: { [key: string]: AIResponse['metadata']['finishReason'] } = {
      'stop': 'completed',
      'length': 'length',
      'tool_calls': 'tool_calls',
      'content_filter': 'content_filter'
    };

    return mapping[finishReason] || 'completed';
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(choice: GroqChoice): number {
    let confidence = 0.85; // Groq is fast and reliable

    if (choice.finish_reason === 'stop') {
      confidence += 0.1;
    }

    if (choice.message.content && choice.message.content.length > 50) {
      confidence += 0.05;
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Convert tool definition to Groq format
   */
  private convertToolDefinition(tool: any): GroqToolDefinition {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: tool.parameters.properties,
          required: tool.parameters.required
        }
      }
    };
  }

  /**
   * Extract headers from response for rate limiting
   */
  private extractHeaders(response: Response): Record<string, string> {
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    return headers;
  }
}

export default GroqProvider;