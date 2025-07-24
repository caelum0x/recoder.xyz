/**
 * Claude AI Provider for Recoder.xyz
 * 
 * Supports Claude Sonnet 4, Claude Opus 4, and Claude 3.7 Sonnet models
 */

import { BaseAIProvider, AIRequest, AIResponse, StreamChunk, ProviderConfig } from './base-provider';

export interface ClaudeConfig extends ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: 'claude-sonnet-4' | 'claude-opus-4' | 'claude-3.7-sonnet' | 'claude-3.5-haiku';
  anthropicVersion?: string;
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | ClaudeContent[];
}

export interface ClaudeContent {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface ClaudeRequestBody {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
  stream?: boolean;
  tools?: ClaudeToolDefinition[];
}

export interface ClaudeToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ClaudeResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: ClaudeContentBlock[];
  model: string;
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use';
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ClaudeContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, any>;
}

export interface ClaudeStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  message?: Partial<ClaudeResponse>;
  content_block?: ClaudeContentBlock;
  delta?: {
    type: 'text_delta' | 'input_json_delta';
    text?: string;
    partial_json?: string;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export class ClaudeProvider extends BaseAIProvider {
  private config: ClaudeConfig;
  private baseUrl: string;

  constructor(config: ClaudeConfig) {
    super('anthropic', 'Claude AI', config);
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
  }

  /**
   * Send request to Claude API
   */
  async sendRequest(request: AIRequest): Promise<AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();

    try {
      const claudeRequest = this.buildClaudeRequest(request);
      const response = await this.makeAPIRequest('/v1/messages', claudeRequest);
      const claudeResponse = response as ClaudeResponse;

      const aiResponse: AIResponse = {
        id: claudeResponse.id,
        content: this.extractContent(claudeResponse.content),
        usage: {
          inputTokens: claudeResponse.usage.input_tokens,
          outputTokens: claudeResponse.usage.output_tokens,
          totalTokens: claudeResponse.usage.input_tokens + claudeResponse.usage.output_tokens,
          cost: this.calculateCost(claudeResponse.usage.input_tokens, claudeResponse.usage.output_tokens)
        },
        metadata: {
          model: claudeResponse.model,
          provider: this.providerId,
          responseTime: Date.now() - startTime,
          finishReason: this.mapStopReason(claudeResponse.stop_reason),
          confidence: this.calculateConfidence(claudeResponse),
          toolCalls: this.extractToolCalls(claudeResponse.content)
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
   * Send streaming request to Claude API
   */
  async* sendStreamingRequest(request: AIRequest): AsyncGenerator<StreamChunk, AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();
    let fullContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      const claudeRequest = this.buildClaudeRequest(request, true);
      const stream = await this.makeStreamingAPIRequest('/v1/messages', claudeRequest);

      for await (const chunk of stream) {
        const event = JSON.parse(chunk) as ClaudeStreamEvent;

        if (event.type === 'content_block_delta' && event.delta?.text) {
          const streamChunk: StreamChunk = {
            id: request.id,
            delta: event.delta.text,
            isComplete: false
          };

          fullContent += event.delta.text;
          yield streamChunk;
        }

        if (event.type === 'message_start' && event.message?.usage) {
          totalInputTokens = event.message.usage.input_tokens;
        }

        if (event.type === 'message_delta' && event.usage?.output_tokens) {
          totalOutputTokens = event.usage.output_tokens;
        }

        if (event.type === 'message_stop') {
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
              model: request.options.model || this.config.defaultModel || 'claude-sonnet-4',
              provider: this.providerId,
              responseTime: Date.now() - startTime,
              finishReason: 'completed'
            },
            streaming: {
              isComplete: true,
              streamId: request.id
            }
          };

          this.trackRequestComplete(request, finalResponse);
          return finalResponse;
        }
      }

    } catch (error) {
      this.trackRequestError(request, error as Error);
      throw error;
    }

    throw new Error('Stream ended unexpectedly');
  }

  /**
   * Get available Claude models
   */
  async getAvailableModels(): Promise<string[]> {
    return [
      'claude-sonnet-4',
      'claude-opus-4', 
      'claude-3.7-sonnet',
      'claude-3.5-haiku'
    ];
  }

  /**
   * Test Claude API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testRequest: ClaudeRequestBody = {
        model: this.config.defaultModel || 'claude-sonnet-4',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }]
      };

      await this.makeAPIRequest('/v1/messages', testRequest);
      return true;
    } catch (error) {
      console.error('Claude connection test failed:', error);
      return false;
    }
  }

  /**
   * Get maximum tokens supported
   */
  protected getMaxTokensSupported(): number {
    const modelLimits: { [key: string]: number } = {
      'claude-sonnet-4': 200_000,
      'claude-opus-4': 200_000,
      'claude-3.7-sonnet': 200_000,
      'claude-3.5-haiku': 200_000
    };

    const model = this.config.defaultModel || 'claude-sonnet-4';
    return modelLimits[model] || 200_000;
  }

  /**
   * Calculate cost based on Claude pricing
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    // Claude Sonnet 4 pricing (example - would use actual pricing)
    const inputCostPer1M = 3.00; // $3 per 1M input tokens
    const outputCostPer1M = 15.00; // $15 per 1M output tokens

    const inputCost = (inputTokens / 1_000_000) * inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * outputCostPer1M;

    return inputCost + outputCost;
  }

  /**
   * Build Claude API request
   */
  private buildClaudeRequest(request: AIRequest, streaming: boolean = false): ClaudeRequestBody {
    const messages: ClaudeMessage[] = [];

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

    // Add current prompt
    messages.push({
      role: 'user',
      content: this.buildPromptContent(request)
    });

    const claudeRequest: ClaudeRequestBody = {
      model: request.options.model || this.config.defaultModel || 'claude-sonnet-4',
      max_tokens: request.options.maxTokens || 4096,
      messages,
      temperature: request.options.temperature || 0.7,
      stream: streaming
    };

    // Add system prompt if provided
    if (request.options.systemPrompt) {
      claudeRequest.system = request.options.systemPrompt;
    }

    // Add tools if provided
    if (request.options.tools) {
      claudeRequest.tools = request.options.tools.map(this.convertToolDefinition);
    }

    return claudeRequest;
  }

  /**
   * Build prompt content with context
   */
  private buildPromptContent(request: AIRequest): string {
    let content = request.prompt;

    // Add project context
    if (request.context?.projectContext) {
      content = `Project Context:\n${request.context.projectContext}\n\n${content}`;
    }

    // Add code context
    if (request.context?.codeContext) {
      content = `Code Context:\n\`\`\`\n${request.context.codeContext}\n\`\`\`\n\n${content}`;
    }

    return content;
  }

  /**
   * Make API request to Claude
   */
  private async makeAPIRequest(endpoint: string, body: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.config.anthropicVersion || '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    // Parse rate limit headers
    this.parseRateLimitHeaders(this.extractHeaders(response));

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Claude API error: ${response.status} - ${error.error?.message || error.error}`);
    }

    return response.json();
  }

  /**
   * Make streaming API request to Claude
   */
  private async makeStreamingAPIRequest(endpoint: string, body: any): AsyncGenerator<string> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': this.config.anthropicVersion || '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(`Claude API error: ${response.status} - ${error.error?.message || error.error}`);
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
   * Extract content from Claude response
   */
  private extractContent(contentBlocks: ClaudeContentBlock[]): string {
    return contentBlocks
      .filter(block => block.type === 'text')
      .map(block => block.text || '')
      .join('');
  }

  /**
   * Extract tool calls from Claude response
   */
  private extractToolCalls(contentBlocks: ClaudeContentBlock[]): any[] {
    return contentBlocks
      .filter(block => block.type === 'tool_use')
      .map(block => ({
        id: block.id,
        name: block.name,
        arguments: block.input || {}
      }));
  }

  /**
   * Map Claude stop reason to standard format
   */
  private mapStopReason(stopReason: string): AIResponse['metadata']['finishReason'] {
    const mapping: { [key: string]: AIResponse['metadata']['finishReason'] } = {
      'end_turn': 'completed',
      'max_tokens': 'length',
      'stop_sequence': 'completed',
      'tool_use': 'tool_calls'
    };

    return mapping[stopReason] || 'completed';
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(response: ClaudeResponse): number {
    // Base confidence on content length and completion
    let confidence = 0.8;

    if (response.stop_reason === 'end_turn') {
      confidence += 0.1;
    }

    if (response.content.length > 0) {
      confidence += 0.1;
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Convert tool definition to Claude format
   */
  private convertToolDefinition(tool: any): ClaudeToolDefinition {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required
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

export default ClaudeProvider;