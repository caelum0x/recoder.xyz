/**
 * Anthropic Claude Model Provider
 */

import axios, { AxiosInstance } from 'axios';
import { BaseModelProvider } from '../base-provider';
import { Logger } from 'recoder-shared';
import {
  ModelMetadata,
  ModelRequest,
  ModelResponse,
  StreamingResponse,
  ModelProvider,
  ModelType,
  ModelConfiguration,
  TokenUsage,
  ResponseMetadata,
  ModelCapabilities,
  ModelLimits
} from 'recoder-shared/types/ai-models';

export class AnthropicProvider extends BaseModelProvider {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(config: ModelConfiguration) {
    super(config);
    
    if (!config.apiKey) {
      throw new Error('Anthropic API key is required');
    }

    this.apiKey = config.apiKey;
    
    this.client = axios.create({
      baseURL: config.apiUrl || 'https://api.anthropic.com',
      timeout: config.timeout || 60000,
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        ...config.customHeaders
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      // Load Claude models
      const models = await this.loadClaudeModels();
      models.forEach(model => this.models.set(model.id, model));
      
      Logger.info('Anthropic provider initialized', { 
        modelCount: models.length,
        models: models.map(m => m.id)
      });
    } catch (error) {
      Logger.error('Failed to initialize Anthropic provider', { error });
      throw error;
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Test with a simple message
      const response = await this.client.post('/v1/messages', {
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      });
      return response.status === 200;
    } catch (error) {
      Logger.error('Anthropic config validation failed', { error });
      return false;
    }
  }

  async getAvailableModels(): Promise<ModelMetadata[]> {
    // Anthropic doesn't have a models endpoint, so we return our predefined models
    return this.loadClaudeModels();
  }

  getProvider(): ModelProvider {
    return ModelProvider.ANTHROPIC;
  }

  async sendRequest(request: ModelRequest): Promise<ModelResponse> {
    this.validateRequest(request);
    
    const startTime = Date.now();
    
    try {
      const payload = this.buildMessagesPayload(request);
      const response = await this.client.post('/v1/messages', payload);
      
      return this.processResponse(response.data, request, startTime);
    } catch (error) {
      const modelError = this.handleApiError(error, request.model);
      
      return {
        success: false,
        id: request.id,
        model: request.model,
        content: '',
        finishReason: 'error',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        metadata: {
          model: request.model,
          provider: ModelProvider.ANTHROPIC,
          timestamp: new Date(),
          responseTime: Date.now() - startTime,
          requestId: request.id,
          cached: false,
          fallbackUsed: false
        },
        error: modelError
      };
    }
  }

  async* streamRequest(request: ModelRequest): AsyncGenerator<StreamingResponse, ModelResponse> {
    this.validateRequest(request);
    
    const startTime = Date.now();
    let fullContent = '';
    let totalTokens = 0;
    
    try {
      const payload = this.buildMessagesPayload(request, true);
      
      const response = await this.client.post('/v1/messages', payload, {
        responseType: 'stream'
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              return this.createFinalResponse(request, fullContent, totalTokens, startTime);
            }

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'content_block_delta') {
                const delta = parsed.delta?.text || '';
                
                if (delta) {
                  fullContent += delta;
                  
                  yield {
                    id: request.id,
                    model: request.model,
                    delta,
                    finished: false,
                    metadata: {
                      timestamp: new Date(),
                      requestId: request.id
                    }
                  };
                }
              }

              if (parsed.type === 'message_delta' && parsed.usage) {
                totalTokens = parsed.usage.output_tokens;
              }
            } catch (parseError) {
              Logger.warn('Failed to parse streaming chunk', { data, error: parseError });
            }
          }
        }
      }

      return this.createFinalResponse(request, fullContent, totalTokens, startTime);
    } catch (error) {
      const modelError = this.handleApiError(error, request.model);
      throw new Error(`Streaming failed: ${modelError.message}`);
    }
  }

  private async loadClaudeModels(): Promise<ModelMetadata[]> {
    const modelDefinitions = [
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        displayName: 'Claude 3.5 Sonnet (Latest)',
        type: ModelType.CHAT,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: true,
          debugging: true,
          refactoring: true,
          security: true,
          translation: true,
          planning: true,
          analysis: true,
          chat: true,
          streaming: true,
          functionCalling: true,
          vision: true,
          reasoning: true
        },
        limits: {
          maxContextLength: 200000,
          maxOutputTokens: 8192,
          requestsPerMinute: 1000,
          costPerInputToken: 0.003,
          costPerOutputToken: 0.015
        },
        priority: 10
      },
      {
        id: 'claude-3-opus-20240229',
        name: 'Claude 3 Opus',
        displayName: 'Claude 3 Opus',
        type: ModelType.CHAT,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: true,
          debugging: true,
          refactoring: true,
          security: true,
          translation: true,
          planning: true,
          analysis: true,
          chat: true,
          streaming: true,
          functionCalling: true,
          vision: true,
          reasoning: true
        },
        limits: {
          maxContextLength: 200000,
          maxOutputTokens: 4096,
          requestsPerMinute: 1000,
          costPerInputToken: 0.015,
          costPerOutputToken: 0.075
        },
        priority: 9
      },
      {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude 3 Sonnet',
        displayName: 'Claude 3 Sonnet',
        type: ModelType.CHAT,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: true,
          debugging: true,
          refactoring: true,
          security: true,
          translation: true,
          planning: true,
          analysis: true,
          chat: true,
          streaming: true,
          functionCalling: true,
          vision: true,
          reasoning: true
        },
        limits: {
          maxContextLength: 200000,
          maxOutputTokens: 4096,
          requestsPerMinute: 1000,
          costPerInputToken: 0.003,
          costPerOutputToken: 0.015
        },
        priority: 8
      },
      {
        id: 'claude-3-haiku-20240307',
        name: 'Claude 3 Haiku',
        displayName: 'Claude 3 Haiku (Fast)',
        type: ModelType.CHAT,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: true,
          debugging: true,
          refactoring: true,
          security: false,
          translation: true,
          planning: true,
          analysis: true,
          chat: true,
          streaming: true,
          functionCalling: false,
          vision: true,
          reasoning: false
        },
        limits: {
          maxContextLength: 200000,
          maxOutputTokens: 4096,
          requestsPerMinute: 1000,
          costPerInputToken: 0.00025,
          costPerOutputToken: 0.00125
        },
        priority: 6
      }
    ];

    return modelDefinitions.map(def => ({
      id: def.id,
      name: def.name,
      displayName: def.displayName,
      provider: ModelProvider.ANTHROPIC,
      type: def.type,
      version: '1.0',
      description: `Anthropic ${def.displayName} model`,
      capabilities: def.capabilities as ModelCapabilities,
      limits: def.limits as ModelLimits,
      isLocal: false,
      isAvailable: true,
      priority: def.priority,
      tags: ['anthropic', 'claude', 'cloud', 'premium'],
      releaseDate: new Date('2024-01-01')
    }));
  }

  private buildMessagesPayload(request: ModelRequest, stream: boolean = false): any {
    // Convert messages to Anthropic format
    const messages = request.messages.filter(msg => msg.role !== 'system');
    const systemMessage = request.messages.find(msg => msg.role === 'system');

    const payload: any = {
      model: request.model,
      messages: messages.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      })),
      max_tokens: request.options.maxTokens || 4096,
      stream
    };

    if (systemMessage) {
      payload.system = systemMessage.content;
    }

    const options = request.options;
    if (options.temperature !== undefined) payload.temperature = options.temperature;
    if (options.topP !== undefined) payload.top_p = options.topP;
    if (options.topK !== undefined) payload.top_k = options.topK;
    if (options.stop) payload.stop_sequences = options.stop;

    return payload;
  }

  private processResponse(data: any, request: ModelRequest, startTime: number): ModelResponse {
    const content = data.content?.[0]?.text || '';
    const usage = data.usage;

    const tokenUsage: TokenUsage = {
      inputTokens: usage?.input_tokens || 0,
      outputTokens: usage?.output_tokens || 0,
      totalTokens: (usage?.input_tokens || 0) + (usage?.output_tokens || 0),
      cost: this.calculateCost(usage, request.model)
    };

    const metadata: ResponseMetadata = {
      model: request.model,
      provider: ModelProvider.ANTHROPIC,
      timestamp: new Date(),
      responseTime: Date.now() - startTime,
      requestId: request.id,
      cached: false,
      fallbackUsed: false
    };

    return {
      success: true,
      id: request.id,
      model: request.model,
      content,
      finishReason: data.stop_reason || 'stop',
      usage: tokenUsage,
      metadata
    };
  }

  private createFinalResponse(
    request: ModelRequest, 
    content: string, 
    outputTokens: number, 
    startTime: number
  ): ModelResponse {
    const estimatedInputTokens = this.estimateTokens(request.messages);
    
    const usage: TokenUsage = {
      inputTokens: estimatedInputTokens,
      outputTokens,
      totalTokens: estimatedInputTokens + outputTokens,
      cost: this.calculateCost({ 
        input_tokens: estimatedInputTokens, 
        output_tokens: outputTokens 
      }, request.model)
    };

    const metadata: ResponseMetadata = {
      model: request.model,
      provider: ModelProvider.ANTHROPIC,
      timestamp: new Date(),
      responseTime: Date.now() - startTime,
      requestId: request.id,
      cached: false,
      fallbackUsed: false
    };

    return {
      success: true,
      id: request.id,
      model: request.model,
      content,
      finishReason: 'stop',
      usage,
      metadata
    };
  }

  private calculateCost(usage: any, modelId: string): number {
    if (!usage) return 0;

    const model = this.models.get(modelId);
    if (!model?.limits.costPerInputToken || !model?.limits.costPerOutputToken) {
      return 0;
    }

    const inputCost = (usage.input_tokens || 0) * model.limits.costPerInputToken;
    const outputCost = (usage.output_tokens || 0) * model.limits.costPerOutputToken;
    
    return inputCost + outputCost;
  }
}