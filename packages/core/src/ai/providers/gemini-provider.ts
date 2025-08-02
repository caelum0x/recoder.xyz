/**
 * Gemini AI Provider for Recoder.xyz
 * 
 * Supports Gemini 2.5 Pro, Gemini 2.5 Flash, and Gemini 2.0 Flash models
 */

import { BaseAIProvider, AIRequest, AIResponse, StreamChunk, ProviderConfig } from './base-provider';

export interface GeminiConfig extends ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.0-flash' | 'gemini-2.5-flash-lite';
} 

export interface GeminiMessage {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
  function_call?: {
    name: string;
    args: Record<string, any>;
  };
  function_response?: {
    name: string;
    response: Record<string, any>;
  };
}

export interface GeminiRequestBody {
  model?: string;
  contents: GeminiMessage[];
  system_instruction?: {
    parts: { text: string }[];
  };
  generation_config?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    max_output_tokens?: number;
    stop_sequences?: string[];
    response_mime_type?: string;
  };
  safety_settings?: GeminiSafetySetting[];
  tools?: GeminiToolConfig[];
}

export interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

export interface GeminiToolConfig {
  function_declarations: GeminiFunctionDeclaration[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface GeminiResponse {
  candidates: GeminiCandidate[];
  usage_metadata?: {
    prompt_token_count: number;
    candidates_token_count: number;
    total_token_count: number;
  };
  model_version?: string;
}

export interface GeminiCandidate {
  content: {
    parts: GeminiPart[];
    role: 'model';
  };
  finish_reason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'LANGUAGE' | 'OTHER';
  index: number;
  safety_ratings?: GeminiSafetyRating[];
}

export interface GeminiSafetyRating {
  category: string;
  probability: string;
}

export interface GeminiStreamResponse {
  candidates?: GeminiCandidate[];
  usage_metadata?: {
    prompt_token_count?: number;
    candidates_token_count?: number;
    total_token_count?: number;
  };
}

export class GeminiProvider extends BaseAIProvider {
  protected config: GeminiConfig;
  private baseUrl: string;

  constructor(config: GeminiConfig) {
    super('google', 'Google Gemini', config);
    this.config = config;
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
  }

  /**
   * Send request to Gemini API
   */
  async sendRequest(request: AIRequest): Promise<AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();

    try {
      const geminiRequest = this.buildGeminiRequest(request);
      const model = request.options.model || this.config.defaultModel || 'gemini-2.5-pro';
      const endpoint = `/models/${model}:generateContent`;
      
      const response = await this.makeAPIRequest(endpoint, geminiRequest);
      const geminiResponse = response as GeminiResponse;

      if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
        throw new Error('No response candidates received from Gemini');
      }

      const candidate = geminiResponse.candidates[0];
      const content = this.extractContent(candidate.content.parts);

      const aiResponse: AIResponse = {
        id: request.id,
        content,
        usage: {
          inputTokens: geminiResponse.usage_metadata?.prompt_token_count || 0,
          outputTokens: geminiResponse.usage_metadata?.candidates_token_count || 0,
          totalTokens: geminiResponse.usage_metadata?.total_token_count || 0,
          cost: this.calculateCost(
            geminiResponse.usage_metadata?.prompt_token_count || 0,
            geminiResponse.usage_metadata?.candidates_token_count || 0
          )
        },
        metadata: {
          model: model,
          provider: this.providerId,
          responseTime: Date.now() - startTime,
          finishReason: this.mapFinishReason(candidate.finish_reason),
          confidence: this.calculateConfidence(candidate),
          toolCalls: this.extractToolCalls(candidate.content.parts),
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
   * Send streaming request to Gemini API
   */
  async* sendStreamingRequest(request: AIRequest): AsyncGenerator<StreamChunk, AIResponse> {
    this.validateRequest(request);
    this.trackRequestStart(request);

    const startTime = Date.now();
    let fullContent = '';
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let finishReason = 'STOP';

    try {
      const geminiRequest = this.buildGeminiRequest(request);
      const model = request.options.model || this.config.defaultModel || 'gemini-2.5-pro';
      const endpoint = `/models/${model}:streamGenerateContent`;
      
      const stream = await this.makeStreamingAPIRequest(endpoint, geminiRequest);

      for await (const chunk of stream) {
        const streamResponse = JSON.parse(chunk) as GeminiStreamResponse;

        if (streamResponse.candidates && streamResponse.candidates.length > 0) {
          const candidate = streamResponse.candidates[0];
          const deltaContent = this.extractContent(candidate.content.parts);

          if (deltaContent) {
            const streamChunk: StreamChunk = {
              id: request.id,
              delta: deltaContent,
              isComplete: false
            };

            fullContent += deltaContent;
            yield streamChunk;
          }

          if (candidate.finish_reason && candidate.finish_reason !== 'STOP') {
            finishReason = candidate.finish_reason;
          }
        }

        if (streamResponse.usage_metadata) {
          totalInputTokens = streamResponse.usage_metadata.prompt_token_count || totalInputTokens;
          totalOutputTokens = streamResponse.usage_metadata.candidates_token_count || totalOutputTokens;
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
          model: model,
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
   * Get available Gemini models
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.makeAPIRequest('/models', null, 'GET');
      return response.models
        .filter((model: any) => model.name.includes('gemini'))
        .map((model: any) => model.name.replace('models/', ''));
    } catch (error) {
      // Return default models if API call fails
      return [
        'gemini-2.5-pro',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-2.5-flash-lite'
      ];
    }
  }

  /**
   * Test Gemini API connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const testRequest: GeminiRequestBody = {
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generation_config: { max_output_tokens: 1 }
      };

      const model = this.config.defaultModel || 'gemini-2.5-pro';
      await this.makeAPIRequest(`/models/${model}:generateContent`, testRequest);
      return true;
    } catch (error) {
      console.error('Gemini connection test failed:', error);
      return false;
    }
  }

  /**
   * Get maximum tokens supported
   */
  protected getMaxTokensSupported(): number {
    const modelLimits: { [key: string]: number } = {
      'gemini-2.5-pro': 1_000_000,
      'gemini-2.5-flash': 1_000_000,
      'gemini-2.0-flash': 32_768,
      'gemini-2.5-flash-lite': 32_768
    };

    const model = this.config.defaultModel || 'gemini-2.5-pro';
    return modelLimits[model] || 1_000_000;
  }

  /**
   * Calculate cost based on Gemini pricing
   */
  protected calculateCost(inputTokens: number, outputTokens: number): number {
    const model = this.config.defaultModel || 'gemini-2.5-pro';
    
    // Gemini pricing per 1M tokens
    const pricingMap: { [key: string]: { input: number; output: number } } = {
      'gemini-2.5-pro': { input: 7.00, output: 21.00 },
      'gemini-2.5-flash': { input: 0.075, output: 0.30 },
      'gemini-2.0-flash': { input: 0.075, output: 0.30 },
      'gemini-2.5-flash-lite': { input: 0.0375, output: 0.15 }
    };

    const pricing = pricingMap[model] || pricingMap['gemini-2.5-pro'];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Build Gemini API request
   */
  private buildGeminiRequest(request: AIRequest): GeminiRequestBody {
    const contents: GeminiMessage[] = [];

    // Add context messages if provided
    if (request.context?.previousMessages) {
      for (const msg of request.context.previousMessages) {
        if (msg.role === 'user') {
          contents.push({
            role: 'user',
            parts: [{ text: msg.content }]
          });
        } else if (msg.role === 'assistant') {
          contents.push({
            role: 'model',
            parts: [{ text: msg.content }]
          });
        }
      }
    }

    // Add current prompt with multimodal capabilities
    contents.push({
      role: 'user',
      parts: [{ text: this.buildEnhancedPrompt(request) }]
    });

    const geminiRequest: GeminiRequestBody = {
      contents,
      generation_config: {
        temperature: request.options.temperature || 0.7,
        max_output_tokens: request.options.maxTokens || 8192,
        top_p: 0.8,
        top_k: 10
      },
      safety_settings: this.getSafetySettings()
    };

    // Add system instruction if provided
    if (request.options.systemPrompt) {
      geminiRequest.system_instruction = {
        parts: [{ text: request.options.systemPrompt }]
      };
    }

    // Add tools if provided
    if (request.options.tools && request.options.tools.length > 0) {
      geminiRequest.tools = [{
        function_declarations: request.options.tools.map(this.convertToolDefinition)
      }];
    }

    return geminiRequest;
  }

  /**
   * Build enhanced prompt leveraging Gemini's strengths
   */
  private buildEnhancedPrompt(request: AIRequest): string {
    let content = request.prompt;

    // For analysis tasks, add structured thinking prompts
    if (request.metadata.taskType === 'analysis' || request.metadata.taskType === 'documentation') {
      content = `ANALYSIS_MODE: Provide comprehensive analysis with:\n1. Overview\n2. Key findings\n3. Recommendations\n4. Implementation details\n\n${content}`;
    }

    // For large codebase tasks, add context structuring
    if (request.context?.codeContext && request.context.codeContext.length > 5000) {
      content = `LARGE_CONTEXT: Analyzing large codebase. Focus on:\n- Architecture patterns\n- Key components\n- Relationships\n- Optimization opportunities\n\n${content}`;
    }

    // Add project context with structure
    if (request.context?.projectContext) {
      content = `## Project Context\n${request.context.projectContext}\n\n## Task\n${content}`;
    }

    // Add code context with structure
    if (request.context?.codeContext) {
      content = `## Current Code Base\n\`\`\`\n${request.context.codeContext}\n\`\`\`\n\n${content}`;
    }

    return content;
  }

  /**
   * Get safety settings for Gemini
   */
  private getSafetySettings(): GeminiSafetySetting[] {
    return [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      }
    ];
  }

  /**
   * Make API request to Gemini
   */
  private async makeAPIRequest(endpoint: string, body: any, method: string = 'POST'): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const queryParams = new URLSearchParams({ key: this.config.apiKey });
    
    const requestOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body && method !== 'GET') {
      requestOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${url}?${queryParams}`, requestOptions);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`Gemini API error: ${response.status} - ${error.error?.message || 'Unknown error'}`);
    }

    return response.json();
  }

  /**
   * Make streaming API request to Gemini
   */
  private async makeStreamingAPIRequest(endpoint: string, body: any): Promise<AsyncGenerator<string, any, any>> {
    const url = `${this.baseUrl}${endpoint}`;
    const queryParams = new URLSearchParams({ 
      key: this.config.apiKey,
      alt: 'sse'
    });

    const response = await fetch(`${url}?${queryParams}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`Gemini API error: ${response.status} - ${error.error?.message || 'Unknown error'}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    // Wrap the streaming logic in an async generator function and return it
    async function* streamGenerator() {
      if (!reader) {
        throw new Error('No response body reader available');
      }
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

    return streamGenerator();
  }

  /**
   * Extract content from Gemini parts
   */
  private extractContent(parts: GeminiPart[]): string {
    return parts
      .filter(part => part.text)
      .map(part => part.text || '')
      .join('');
  }

  /**
   * Extract tool calls from Gemini parts
   */
  private extractToolCalls(parts: GeminiPart[]): any[] {
    return parts
      .filter(part => part.function_call)
      .map(part => ({
        id: `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: part.function_call!.name,
        arguments: part.function_call!.args
      }));
  }

  /**
   * Map Gemini finish reason to standard format
   */
  private mapFinishReason(finishReason: string): AIResponse['metadata']['finishReason'] {
    const mapping: { [key: string]: AIResponse['metadata']['finishReason'] } = {
      'STOP': 'completed',
      'MAX_TOKENS': 'length',
      'SAFETY': 'content_filter',
      'RECITATION': 'content_filter',
      'LANGUAGE': 'error',
      'OTHER': 'error'
    };

    return mapping[finishReason] || 'completed';
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(candidate: GeminiCandidate): number {
    let confidence = 0.87; // Gemini is highly reliable

    if (candidate.finish_reason === 'STOP') {
      confidence += 0.08;
    }

    // Check safety ratings
    if (candidate.safety_ratings) {
      const hasHighRisk = candidate.safety_ratings.some(rating => 
        rating.probability === 'HIGH' || rating.probability === 'MEDIUM'
      );
      if (!hasHighRisk) {
        confidence += 0.05;
      }
    }

    return Math.min(1.0, confidence);
  }

  /**
   * Convert tool definition to Gemini format
   */
  private convertToolDefinition(tool: any): GeminiFunctionDeclaration {
    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required
      }
    };
  }
}

export default GeminiProvider;