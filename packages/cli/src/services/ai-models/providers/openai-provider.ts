/**
 * OpenAI Model Provider
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

export class OpenAIProvider extends BaseModelProvider {
  private client: AxiosInstance;
  private apiKey: string;
  private organizationId?: string;

  constructor(config: ModelConfiguration) {
    super(config);
    
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    this.apiKey = config.apiKey;
    this.organizationId = config.organizationId;
    
    this.client = axios.create({
      baseURL: config.apiUrl || 'https://api.openai.com/v1',
      timeout: config.timeout || 60000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(this.organizationId && { 'OpenAI-Organization': this.organizationId }),
        ...config.customHeaders
      }
    });
  }

  async initialize(): Promise<void> {
    try {
      // Load available models
      const models = await this.loadOpenAIModels();
      models.forEach(model => this.models.set(model.id, model));
      
      Logger.info('OpenAI provider initialized', { 
        modelCount: models.length,
        models: models.map(m => m.id)
      });
    } catch (error) {
      Logger.error('Failed to initialize OpenAI provider', { error });
      throw error;
    }
  }

  async validateConfig(): Promise<boolean> {
    try {
      const response = await this.client.get('/models');
      return response.status === 200;
    } catch (error) {
      Logger.error('OpenAI config validation failed', { error });
      return false;
    }
  }

  async getAvailableModels(): Promise<ModelMetadata[]> {
    try {
      const response = await this.client.get('/models');
      const openaiModels = response.data.data;
      
      return openaiModels
        .filter((model: any) => this.isSupportedModel(model.id))
        .map((model: any) => this.createModelMetadata(model));
    } catch (error) {
      Logger.error('Failed to fetch OpenAI models', { error });
      return [];
    }
  }

  getProvider(): ModelProvider {
    return ModelProvider.OPENAI;
  }

  async sendRequest(request: ModelRequest): Promise<ModelResponse> {
    this.validateRequest(request);
    
    const startTime = Date.now();
    
    try {
      const payload = this.buildChatCompletionPayload(request);
      const response = await this.client.post('/chat/completions', payload);
      
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
          provider: ModelProvider.OPENAI,
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
      const payload = this.buildChatCompletionPayload(request, true);
      
      const response = await this.client.post('/chat/completions', payload, {
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
              const delta = parsed.choices?.[0]?.delta?.content || '';
              
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

              if (parsed.usage) {
                totalTokens = parsed.usage.total_tokens;
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

  private async loadOpenAIModels(): Promise<ModelMetadata[]> {
    // Define OpenAI models with their capabilities and limits
    const modelDefinitions = [
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        displayName: 'GPT-4o (Latest)',
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
          maxContextLength: 128000,
          maxOutputTokens: 4096,
          requestsPerMinute: 5000,
          costPerInputToken: 0.0025,
          costPerOutputToken: 0.01
        },
        priority: 10
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        displayName: 'GPT-4 Turbo',
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
          maxContextLength: 128000,
          maxOutputTokens: 4096,
          requestsPerMinute: 5000,
          costPerInputToken: 0.01,
          costPerOutputToken: 0.03
        },
        priority: 9
      },
      {
        id: 'o1-preview',
        name: 'o1-preview',
        displayName: 'o1 Preview (Reasoning)',
        type: ModelType.REASONING,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: false,
          debugging: true,
          refactoring: true,
          security: true,
          translation: false,
          planning: true,
          analysis: true,
          chat: true,
          streaming: false,
          functionCalling: false,
          vision: false,
          reasoning: true
        },
        limits: {
          maxContextLength: 128000,
          maxOutputTokens: 32768,
          requestsPerMinute: 20,
          costPerInputToken: 0.015,
          costPerOutputToken: 0.06
        },
        priority: 8
      },
      {
        id: 'o1-mini',
        name: 'o1-mini',
        displayName: 'o1 Mini (Fast Reasoning)',
        type: ModelType.REASONING,
        capabilities: {
          codeGeneration: true,
          codeReview: true,
          documentation: false,
          debugging: true,
          refactoring: true,
          security: true,
          translation: false,
          planning: true,
          analysis: true,
          chat: true,
          streaming: false,
          functionCalling: false,
          vision: false,
          reasoning: true
        },
        limits: {
          maxContextLength: 128000,
          maxOutputTokens: 65536,
          requestsPerMinute: 50,
          costPerInputToken: 0.003,
          costPerOutputToken: 0.012
        },
        priority: 7
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        displayName: 'GPT-3.5 Turbo',
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
          functionCalling: true,
          vision: false,
          reasoning: false
        },
        limits: {
          maxContextLength: 16384,
          maxOutputTokens: 4096,
          requestsPerMinute: 10000,
          costPerInputToken: 0.0005,
          costPerOutputToken: 0.0015
        },
        priority: 5
      }
    ];

    return modelDefinitions.map(def => ({
      id: def.id,
      name: def.name,
      displayName: def.displayName,
      provider: ModelProvider.OPENAI,
      type: def.type,
      version: '1.0',
      description: `OpenAI ${def.displayName} model`,
      capabilities: def.capabilities as ModelCapabilities,
      limits: def.limits as ModelLimits,
      isLocal: false,
      isAvailable: true,
      priority: def.priority,
      tags: ['openai', 'cloud', 'premium'],
      releaseDate: new Date('2024-01-01')
    }));
  }

  private isSupportedModel(modelId: string): boolean {
    const supportedModels = [
      'gpt-4o',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
      'o1-preview',
      'o1-mini'
    ];
    
    return supportedModels.some(model => modelId.startsWith(model));
  }

  private createModelMetadata(openaiModel: any): ModelMetadata {
    // Create metadata from OpenAI API response
    const baseCapabilities: ModelCapabilities = {
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
      functionCalling: true,
      vision: false,
      reasoning: false
    };

    const baseLimits: ModelLimits = {
      maxContextLength: 4096,
      maxOutputTokens: 2048,
      requestsPerMinute: 3500
    };

    return {
      id: openaiModel.id,
      name: openaiModel.id,
      displayName: openaiModel.id,
      provider: ModelProvider.OPENAI,
      type: ModelType.CHAT,
      version: '1.0',
      description: `OpenAI ${openaiModel.id} model`,
      capabilities: baseCapabilities,
      limits: baseLimits,
      isLocal: false,
      isAvailable: true,
      priority: 5,
      tags: ['openai', 'cloud'],
      releaseDate: new Date(openaiModel.created * 1000)
    };
  }

  private buildChatCompletionPayload(request: ModelRequest, stream: boolean = false): any {
    const payload: any = {
      model: request.model,
      messages: request.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        ...(msg.name && { name: msg.name }),
        ...(msg.functionCall && { function_call: msg.functionCall })
      })),
      stream
    };

    const options = request.options;
    if (options.temperature !== undefined) payload.temperature = options.temperature;
    if (options.maxTokens) payload.max_tokens = options.maxTokens;
    if (options.topP !== undefined) payload.top_p = options.topP;
    if (options.frequencyPenalty !== undefined) payload.frequency_penalty = options.frequencyPenalty;
    if (options.presencePenalty !== undefined) payload.presence_penalty = options.presencePenalty;
    if (options.stop) payload.stop = options.stop;

    if (options.functionCalling && options.tools) {
      payload.tools = options.tools;
    }

    if (options.responseFormat === 'json') {
      payload.response_format = { type: 'json_object' };
    }

    return payload;
  }

  private processResponse(data: any, request: ModelRequest, startTime: number): ModelResponse {
    const choice = data.choices[0];
    const usage = data.usage;

    const tokenUsage: TokenUsage = {
      inputTokens: usage?.prompt_tokens || 0,
      outputTokens: usage?.completion_tokens || 0,
      totalTokens: usage?.total_tokens || 0,
      cost: this.calculateCost(usage, request.model)
    };

    const metadata: ResponseMetadata = {
      model: request.model,
      provider: ModelProvider.OPENAI,
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
      content: choice.message.content,
      finishReason: choice.finish_reason,
      usage: tokenUsage,
      metadata,
      functionCalls: choice.message.function_call ? [choice.message.function_call] : undefined
    };
  }

  private createFinalResponse(
    request: ModelRequest, 
    content: string, 
    totalTokens: number, 
    startTime: number
  ): ModelResponse {
    const usage: TokenUsage = {
      inputTokens: Math.floor(totalTokens * 0.7), // Estimate
      outputTokens: Math.floor(totalTokens * 0.3),
      totalTokens,
      cost: this.calculateCost({ total_tokens: totalTokens }, request.model)
    };

    const metadata: ResponseMetadata = {
      model: request.model,
      provider: ModelProvider.OPENAI,
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

    const inputCost = (usage.prompt_tokens || 0) * model.limits.costPerInputToken;
    const outputCost = (usage.completion_tokens || 0) * model.limits.costPerOutputToken;
    
    return inputCost + outputCost;
  }
}