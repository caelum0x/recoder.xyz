/**
 * Unified AI Router
 * Smart routing: Local → Hosted Free → Premium APIs
 * Ensures users always get the best available AI assistance
 */

import { EventEmitter } from 'events';
import { ollamaService, OllamaService } from './OllamaService';

export interface AIProvider {
  name: string;
  displayName: string;
  type: 'local' | 'hosted-free' | 'premium';
  cost: number; // cost per 1k tokens (0 for free)
  speed: 'slow' | 'medium' | 'fast' | 'ultra-fast';
  quality: 'good' | 'very-good' | 'excellent' | 'superior';
  specialties: string[];
  availability: 'available' | 'unavailable' | 'limited';
  models: AIModel[];
}

export interface AIModel {
  id: string;
  name: string;
  displayName: string;
  provider: string;
  contextWindow: number;
  maxTokens: number;
  supportsCoding: boolean;
  supportsReasoning: boolean;
  supportsMultimodal: boolean;
  cost: number;
  speed: number; // tokens per second
  quality: number; // 1-10 scale
}

export interface AIRequest {
  prompt: string;
  model?: string;
  provider?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  priority?: 'speed' | 'quality' | 'cost';
  taskType?: 'coding' | 'reasoning' | 'general' | 'multimodal';
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  };
  metadata: {
    responseTime: number;
    quality: number;
    cached: boolean;
  };
}

export class UnifiedAIRouter extends EventEmitter {
  private static instance: UnifiedAIRouter;
  private providers: Map<string, AIProvider> = new Map();
  private models: Map<string, AIModel> = new Map();
  private fallbackChain: string[] = [];
  private userPreferences: {
    preferLocal: boolean;
    maxCostPerRequest: number;
    qualityThreshold: number;
    speedRequirement: 'any' | 'fast' | 'ultra-fast';
  } = {
    preferLocal: true,
    maxCostPerRequest: 0.10, // $0.10 per request
    qualityThreshold: 7,
    speedRequirement: 'any'
  };

  constructor() {
    super();
    this.initializeProviders();
    this.setupFallbackChain();
  }

  static getInstance(): UnifiedAIRouter {
    if (!UnifiedAIRouter.instance) {
      UnifiedAIRouter.instance = new UnifiedAIRouter();
    }
    return UnifiedAIRouter.instance;
  }

  private initializeProviders(): void {
    // Local Providers
    this.addProvider({
      name: 'ollama',
      displayName: 'Ollama (Local)',
      type: 'local',
      cost: 0,
      speed: 'medium',
      quality: 'very-good',
      specialties: ['coding', 'reasoning'],
      availability: 'available',
      models: [
        {
          id: 'codellama:13b-instruct',
          name: 'codellama:13b-instruct',
          displayName: 'CodeLlama 13B',
          provider: 'ollama',
          contextWindow: 4096,
          maxTokens: 2048,
          supportsCoding: true,
          supportsReasoning: true,
          supportsMultimodal: false,
          cost: 0,
          speed: 25, // tokens per second
          quality: 8.5
        },
        {
          id: 'qwen2.5-coder:7b',
          name: 'qwen2.5-coder:7b',
          displayName: 'Qwen2.5 Coder',
          provider: 'ollama',
          contextWindow: 8192,
          maxTokens: 4096,
          supportsCoding: true,
          supportsReasoning: true,
          supportsMultimodal: false,
          cost: 0,
          speed: 35,
          quality: 9.0
        },
        {
          id: 'mistral:7b-instruct',
          name: 'mistral:7b-instruct',
          displayName: 'Mistral 7B',
          provider: 'ollama',
          contextWindow: 8192,
          maxTokens: 4096,
          supportsCoding: true,
          supportsReasoning: true,
          supportsMultimodal: false,
          cost: 0,
          speed: 30,
          quality: 8.0
        }
      ]
    });

    // Hosted Free Providers
    this.addProvider({
      name: 'groq-free',
      displayName: 'Groq (Free Tier)',
      type: 'hosted-free',
      cost: 0,
      speed: 'ultra-fast',
      quality: 'very-good',
      specialties: ['coding', 'general'],
      availability: 'limited',
      models: [
        {
          id: 'llama-3.1-8b-instant',
          name: 'llama-3.1-8b-instant',
          displayName: 'Llama 3.1 8B (Groq)',
          provider: 'groq-free',
          contextWindow: 8192,
          maxTokens: 4096,
          supportsCoding: true,
          supportsReasoning: true,
          supportsMultimodal: false,
          cost: 0,
          speed: 500, // tokens per second (Groq is very fast)
          quality: 8.5
        }
      ]
    });

    // Premium Providers
    this.addProvider({
      name: 'anthropic',
      displayName: 'Claude (Anthropic)',
      type: 'premium',
      cost: 0.015, // per 1k tokens
      speed: 'fast',
      quality: 'superior',
      specialties: ['coding', 'reasoning', 'general'],
      availability: 'available',
      models: [
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'claude-3-5-sonnet-20241022',
          displayName: 'Claude 3.5 Sonnet',
          provider: 'anthropic',
          contextWindow: 200000,
          maxTokens: 8192,
          supportsCoding: true,
          supportsReasoning: true,
          supportsMultimodal: true,
          cost: 0.015,
          speed: 80,
          quality: 9.5
        }
      ]
    });

    this.addProvider({
      name: 'groq',
      displayName: 'Groq',
      type: 'premium',
      cost: 0.0001, // very cheap
      speed: 'ultra-fast',
      quality: 'very-good',
      specialties: ['coding', 'general'],
      availability: 'available',
      models: [
        {
          id: 'llama-3.1-70b-versatile',
          name: 'llama-3.1-70b-versatile',
          displayName: 'Llama 3.1 70B (Groq)',
          provider: 'groq',
          contextWindow: 32768,
          maxTokens: 8192,
          supportsCoding: true,
          supportsReasoning: true,
          supportsMultimodal: false,
          cost: 0.0001,
          speed: 300,
          quality: 9.0
        }
      ]
    });

    this.addProvider({
      name: 'openai',
      displayName: 'OpenAI',
      type: 'premium',
      cost: 0.002, // per 1k tokens
      speed: 'fast',
      quality: 'excellent',
      specialties: ['general', 'multimodal'],
      availability: 'available',
      models: [
        {
          id: 'gpt-4o',
          name: 'gpt-4o',
          displayName: 'GPT-4 Optimized',
          provider: 'openai',
          contextWindow: 128000,
          maxTokens: 4096,
          supportsCoding: true,
          supportsReasoning: true,
          supportsMultimodal: true,
          cost: 0.002,
          speed: 60,
          quality: 9.0
        }
      ]
    });

    // Update models map
    this.providers.forEach(provider => {
      provider.models.forEach(model => {
        this.models.set(model.id, model);
      });
    });
  }

  private addProvider(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  private setupFallbackChain(): void {
    // Smart fallback chain based on user preferences and availability
    this.fallbackChain = [
      'ollama', // Try local first (free)
      'groq-free', // Then hosted free
      'groq', // Then premium fast and cheap
      'anthropic', // Then premium high quality
      'openai' // Finally OpenAI as backup
    ];
  }

  /**
   * Route AI request to the best available provider
   */
  async routeRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    
    // Find best model for the request
    const selectedModel = await this.selectOptimalModel(request);
    if (!selectedModel) {
      throw new Error('No suitable AI model available for this request');
    }

    this.emit('route-selected', {
      model: selectedModel.id,
      provider: selectedModel.provider,
      taskType: request.taskType,
      priority: request.priority
    });

    try {
      // Route to the appropriate provider
      const response = await this.executeRequest(selectedModel, request);
      
      // Calculate usage and metadata
      const responseTime = Date.now() - startTime;
      const usage = this.calculateUsage(request.prompt, response.content, selectedModel);
      
      return {
        content: response.content,
        model: selectedModel.id,
        provider: selectedModel.provider,
        usage,
        metadata: {
          responseTime,
          quality: selectedModel.quality,
          cached: false
        }
      };
    } catch (error) {
      // Try fallback if primary fails
      return await this.tryFallback(request, selectedModel, error);
    }
  }

  private async selectOptimalModel(request: AIRequest): Promise<AIModel | null> {
    // If specific model requested, try to use it
    if (request.model) {
      const model = this.models.get(request.model);
      if (model && await this.isModelAvailable(model)) {
        return model;
      }
    }

    // If specific provider requested, find best model in that provider
    if (request.provider) {
      const provider = this.providers.get(request.provider);
      if (provider) {
        return await this.findBestModelInProvider(provider, request);
      }
    }

    // Smart selection based on request characteristics
    const candidates = await this.getAvailableModels();
    
    // Filter by task requirements
    let filtered = candidates.filter(model => {
      if (request.taskType === 'coding' && !model.supportsCoding) return false;
      if (request.taskType === 'multimodal' && !model.supportsMultimodal) return false;
      return true;
    });

    // Filter by user preferences
    filtered = filtered.filter(model => {
      const estimatedCost = this.estimateRequestCost(request.prompt, model);
      if (estimatedCost > this.userPreferences.maxCostPerRequest) return false;
      if (model.quality < this.userPreferences.qualityThreshold) return false;
      return true;
    });

    // Sort by routing preference
    return this.rankModels(filtered, request)[0] || null;
  }

  private async isModelAvailable(model: AIModel): Promise<boolean> {
    switch (model.provider) {
      case 'ollama':
        return await this.isOllamaModelAvailable(model.id);
      case 'groq-free':
      case 'groq':
        return await this.isGroqAvailable();
      case 'anthropic':
        return await this.isAnthropicAvailable();
      case 'openai':
        return await this.isOpenAIAvailable();
      default:
        return false;
    }
  }

  private async isOllamaModelAvailable(modelId: string): Promise<boolean> {
    try {
      const installedModels = await ollamaService.getInstalledModels();
      return installedModels.some(model => model.name === modelId);
    } catch (error) {
      return false;
    }
  }

  private async isGroqAvailable(): Promise<boolean> {
    return !!process.env.GROQ_API_KEY;
  }

  private async isAnthropicAvailable(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  private async isOpenAIAvailable(): Promise<boolean> {
    return !!process.env.OPENAI_API_KEY;
  }

  private async getAvailableModels(): Promise<AIModel[]> {
    const available: AIModel[] = [];
    
    for (const model of this.models.values()) {
      if (await this.isModelAvailable(model)) {
        available.push(model);
      }
    }
    
    return available;
  }

  private rankModels(models: AIModel[], request: AIRequest): AIModel[] {
    return models.sort((a, b) => {
      // Priority-based scoring
      let scoreA = 0;
      let scoreB = 0;

      switch (request.priority) {
        case 'cost':
          scoreA += (10 - a.cost * 1000); // Lower cost = higher score
          scoreB += (10 - b.cost * 1000);
          break;
        case 'speed':
          scoreA += a.speed / 10;
          scoreB += b.speed / 10;
          break;
        case 'quality':
        default:
          scoreA += a.quality;
          scoreB += b.quality;
          break;
      }

      // Bonus for local models if preferred
      if (this.userPreferences.preferLocal) {
        if (a.cost === 0) scoreA += 5;
        if (b.cost === 0) scoreB += 5;
      }

      // Task-specific bonuses
      if (request.taskType === 'coding') {
        if (a.supportsCoding) scoreA += 2;
        if (b.supportsCoding) scoreB += 2;
      }

      return scoreB - scoreA; // Higher score first
    });
  }

  private async executeRequest(model: AIModel, request: AIRequest): Promise<{content: string}> {
    switch (model.provider) {
      case 'ollama':
        return await this.executeOllamaRequest(model, request);
      case 'groq-free':
      case 'groq':
        return await this.executeGroqRequest(model, request);
      case 'anthropic':
        return await this.executeAnthropicRequest(model, request);
      case 'openai':
        return await this.executeOpenAIRequest(model, request);
      default:
        throw new Error(`Unsupported provider: ${model.provider}`);
    }
  }

  private async executeOllamaRequest(model: AIModel, request: AIRequest): Promise<{content: string}> {
    const content = await ollamaService.generate(
      model.id,
      request.prompt,
      {
        temperature: request.temperature || 0.7,
        max_tokens: request.maxTokens || 2048
      }
    );
    
    return { content };
  }

  private async executeGroqRequest(model: AIModel, request: AIRequest): Promise<{content: string}> {
    // Groq API implementation would go here
    // For now, return a placeholder
    throw new Error('Groq integration not yet implemented');
  }

  private async executeAnthropicRequest(model: AIModel, request: AIRequest): Promise<{content: string}> {
    // Anthropic API implementation would go here
    // For now, return a placeholder
    throw new Error('Anthropic integration not yet implemented');
  }

  private async executeOpenAIRequest(model: AIModel, request: AIRequest): Promise<{content: string}> {
    // OpenAI API implementation would go here
    // For now, return a placeholder
    throw new Error('OpenAI integration not yet implemented');
  }

  private async tryFallback(
    request: AIRequest, 
    failedModel: AIModel, 
    error: Error
  ): Promise<AIResponse> {
    this.emit('fallback-triggered', {
      failedModel: failedModel.id,
      error: error.message
    });

    // Remove failed model from consideration
    const remainingModels = Array.from(this.models.values())
      .filter(model => model.id !== failedModel.id);

    if (remainingModels.length === 0) {
      throw new Error(`All AI providers failed. Last error: ${error.message}`);
    }

    // Try next best model
    const fallbackRequest = { ...request, model: undefined };
    return await this.routeRequest(fallbackRequest);
  }

  private calculateUsage(prompt: string, response: string, model: AIModel): any {
    // Rough token estimation (more precise calculation would use actual tokenizer)
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(response.length / 4);
    const totalTokens = promptTokens + completionTokens;
    const cost = (totalTokens / 1000) * model.cost;

    return {
      promptTokens,
      completionTokens,
      totalTokens,
      cost
    };
  }

  private estimateRequestCost(prompt: string, model: AIModel): number {
    const estimatedTokens = Math.ceil(prompt.length / 4) + 500; // estimated response
    return (estimatedTokens / 1000) * model.cost;
  }

  private async findBestModelInProvider(provider: AIProvider, request: AIRequest): Promise<AIModel | null> {
    const availableModels = [];
    
    for (const model of provider.models) {
      if (await this.isModelAvailable(model)) {
        availableModels.push(model);
      }
    }

    return this.rankModels(availableModels, request)[0] || null;
  }

  /**
   * Get router status and recommendations
   */
  async getRouterStatus(): Promise<{
    availableProviders: number;
    availableModels: number;
    recommendations: string[];
    cost: {
      localModels: number;
      freeModels: number;
      paidModels: number;
    };
  }> {
    const availableModels = await this.getAvailableModels();
    const localModels = availableModels.filter(m => m.cost === 0 && m.provider === 'ollama');
    const freeModels = availableModels.filter(m => m.cost === 0 && m.provider !== 'ollama');
    const paidModels = availableModels.filter(m => m.cost > 0);

    const recommendations = [];
    
    if (localModels.length === 0) {
      recommendations.push('Install local models for free AI assistance');
    }
    
    if (freeModels.length === 0 && paidModels.length === 0) {
      recommendations.push('Add API keys for hosted AI providers');
    }
    
    if (availableModels.length < 3) {
      recommendations.push('Configure more AI providers for better reliability');
    }

    return {
      availableProviders: new Set(availableModels.map(m => m.provider)).size,
      availableModels: availableModels.length,
      recommendations,
      cost: {
        localModels: localModels.length,
        freeModels: freeModels.length,
        paidModels: paidModels.length
      }
    };
  }

  /**
   * Update user preferences
   */
  updatePreferences(preferences: Partial<typeof this.userPreferences>): void {
    this.userPreferences = { ...this.userPreferences, ...preferences };
    this.emit('preferences-updated', this.userPreferences);
  }

  /**
   * Get all available providers
   */
  getProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all available models
   */
  async getAllModels(): Promise<AIModel[]> {
    return await this.getAvailableModels();
  }
}

// Export singleton instance
export const unifiedAIRouter = UnifiedAIRouter.getInstance();