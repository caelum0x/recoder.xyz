/**
 * Unified AI Provider Router for Cross-Platform Integration
 * Manages AI providers with health monitoring, cost tracking, and intelligent routing
 */

import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';

export interface AIProvider {
  id: string;
  name: string;
  type: 'anthropic' | 'openai' | 'groq' | 'gemini' | 'ollama' | 'huggingface' | 'custom';
  baseURL: string;
  apiKey?: string;
  models: AIModel[];
  capabilities: AICapability[];
  config: AIProviderConfig;
  status: AIProviderStatus;
  costs: AIProviderCosts;
}

export interface AIModel {
  id: string;
  name: string;
  contextLength: number;
  inputCostPer1k?: number;
  outputCostPer1k?: number;
  capabilities: string[];
  supportedPlatforms: string[];
}

export interface AICapability {
  type: 'text-generation' | 'code-generation' | 'image-analysis' | 'function-calling' | 'streaming';
  supported: boolean;
  limitations?: string[];
}

export interface AIProviderConfig {
  timeout: number;
  retries: number;
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  healthCheck: {
    enabled: boolean;
    interval: number;
    timeout: number;
  };
}

export interface AIProviderStatus {
  status: 'healthy' | 'degraded' | 'offline' | 'error';
  lastChecked: string;
  responseTime: number;
  errorRate: number;
  uptime: number;
  errors: AIProviderError[];
}

export interface AIProviderError {
  timestamp: string;
  type: 'timeout' | 'rate_limit' | 'auth_error' | 'api_error' | 'network_error';
  message: string;
  context?: any;
}

export interface AIProviderCosts {
  totalTokens: number;
  totalCost: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
  lastReset: string;
}

export interface AIRequest {
  id: string;
  provider: string;
  model: string;
  platform: string;
  messages: any[];
  options: AIRequestOptions;
  metadata: AIRequestMetadata;
}

export interface AIRequestOptions {
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  functions?: any[];
  systemPrompt?: string;
}

export interface AIRequestMetadata {
  userId?: string;
  deviceId?: string;
  platform: string;
  timestamp: string;
  requestType: 'chat' | 'completion' | 'embedding' | 'function-call';
}

export interface AIResponse {
  id: string;
  provider: string;
  model: string;
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
  };
  metadata: {
    responseTime: number;
    timestamp: string;
    cached: boolean;
  };
}

export interface RoutingStrategy {
  name: 'round-robin' | 'least-loaded' | 'cost-optimized' | 'quality-optimized' | 'speed-optimized';
  config: any;
}

export class AIProviderRouter extends EventEmitter {
  private providers: Map<string, AIProvider> = new Map();
  private api: AxiosInstance;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private usageTracking: Map<string, AIProviderCosts> = new Map();
  private requestQueue: Map<string, AIRequest[]> = new Map();
  private routingStrategy: RoutingStrategy = { name: 'quality-optimized', config: {} };

  constructor(private config: {
    baseURL?: string;
    healthCheckInterval?: number;
    enableCostTracking?: boolean;
    enableHealthMonitoring?: boolean;
    routingStrategy?: RoutingStrategy;
  } = {}) {
    super();

    this.config = {
      baseURL: 'http://localhost:3001',
      healthCheckInterval: 30000, // 30 seconds
      enableCostTracking: true,
      enableHealthMonitoring: true,
      ...config
    };

    if (this.config.routingStrategy) {
      this.routingStrategy = this.config.routingStrategy;
    }

    this.api = axios.create({
      baseURL: `${this.config.baseURL}/api`,
      timeout: 10000
    });

    this.initializeDefaultProviders();
    this.startHealthMonitoring();
    this.setupEventHandlers();
  }

  private initializeDefaultProviders(): void {
    // Core AI providers with platform-specific configurations
    const defaultProviders: Partial<AIProvider>[] = [
      {
        id: 'anthropic-claude',
        name: 'Anthropic Claude',
        type: 'anthropic',
        baseURL: 'https://api.anthropic.com',
        models: [
          {
            id: 'claude-3-5-sonnet-20241022',
            name: 'Claude 3.5 Sonnet',
            contextLength: 200000,
            inputCostPer1k: 3.00,
            outputCostPer1k: 15.00,
            capabilities: ['text-generation', 'code-generation', 'function-calling'],
            supportedPlatforms: ['cli', 'web', 'mobile', 'desktop', 'extension']
          }
        ],
        capabilities: [
          { type: 'text-generation', supported: true },
          { type: 'code-generation', supported: true },
          { type: 'function-calling', supported: true },
          { type: 'streaming', supported: true }
        ]
      },
      {
        id: 'groq-llama',
        name: 'Groq LLaMA',
        type: 'groq',
        baseURL: 'https://api.groq.com/openai/v1',
        models: [
          {
            id: 'llama3-groq-70b-8192-tool-use-preview',
            name: 'LLaMA 3 70B Tool Use',
            contextLength: 8192,
            inputCostPer1k: 0.89,
            outputCostPer1k: 0.89,
            capabilities: ['text-generation', 'code-generation', 'function-calling'],
            supportedPlatforms: ['cli', 'web', 'mobile', 'desktop', 'extension']
          }
        ],
        capabilities: [
          { type: 'text-generation', supported: true },
          { type: 'code-generation', supported: true },
          { type: 'function-calling', supported: true },
          { type: 'streaming', supported: true }
        ]
      },
      {
        id: 'google-gemini',
        name: 'Google Gemini',
        type: 'gemini',
        baseURL: 'https://generativelanguage.googleapis.com',
        models: [
          {
            id: 'gemini-1.5-pro-latest',
            name: 'Gemini 1.5 Pro',
            contextLength: 2000000,
            inputCostPer1k: 1.25,
            outputCostPer1k: 5.00,
            capabilities: ['text-generation', 'code-generation', 'image-analysis'],
            supportedPlatforms: ['cli', 'web', 'mobile', 'desktop', 'extension']
          }
        ],
        capabilities: [
          { type: 'text-generation', supported: true },
          { type: 'code-generation', supported: true },
          { type: 'image-analysis', supported: true },
          { type: 'streaming', supported: true }
        ]
      },
      {
        id: 'ollama-local',
        name: 'Ollama (Local)',
        type: 'ollama',
        baseURL: 'http://localhost:11434',
        models: [
          {
            id: 'codellama:13b',
            name: 'Code Llama 13B',
            contextLength: 16384,
            inputCostPer1k: 0,
            outputCostPer1k: 0,
            capabilities: ['text-generation', 'code-generation'],
            supportedPlatforms: ['cli', 'desktop']
          }
        ],
        capabilities: [
          { type: 'text-generation', supported: true },
          { type: 'code-generation', supported: true },
          { type: 'streaming', supported: true }
        ]
      }
    ];

    for (const provider of defaultProviders) {
      this.addProvider(this.createProviderWithDefaults(provider));
    }
  }

  private createProviderWithDefaults(partial: Partial<AIProvider>): AIProvider {
    return {
      id: partial.id!,
      name: partial.name!,
      type: partial.type!,
      baseURL: partial.baseURL!,
      apiKey: partial.apiKey,
      models: partial.models || [],
      capabilities: partial.capabilities || [],
      config: {
        timeout: 30000,
        retries: 3,
        rateLimit: {
          requestsPerMinute: 60,
          tokensPerMinute: 100000
        },
        healthCheck: {
          enabled: true,
          interval: 30000,
          timeout: 5000
        },
        ...partial.config
      },
      status: {
        status: 'healthy',
        lastChecked: new Date().toISOString(),
        responseTime: 0,
        errorRate: 0,
        uptime: 100,
        errors: []
      },
      costs: {
        totalTokens: 0,
        totalCost: 0,
        inputTokens: 0,
        outputTokens: 0,
        requestCount: 0,
        lastReset: new Date().toISOString()
      }
    };
  }

  // Provider Management
  addProvider(provider: AIProvider): void {
    this.providers.set(provider.id, provider);
    this.usageTracking.set(provider.id, provider.costs);
    this.requestQueue.set(provider.id, []);
    
    this.emit('providerAdded', provider);
    console.log(`Added AI provider: ${provider.name} (${provider.id})`);
  }

  removeProvider(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) return false;

    this.providers.delete(providerId);
    this.usageTracking.delete(providerId);
    this.requestQueue.delete(providerId);
    
    this.emit('providerRemoved', provider);
    return true;
  }

  getProvider(providerId: string): AIProvider | undefined {
    return this.providers.get(providerId);
  }

  getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  getHealthyProviders(): AIProvider[] {
    return this.getAllProviders().filter(p => p.status.status === 'healthy');
  }

  // Model Management
  getAvailableModels(platform?: string): AIModel[] {
    const models: AIModel[] = [];
    
    for (const provider of this.providers.values()) {
      for (const model of provider.models) {
        if (!platform || model.supportedPlatforms.includes(platform)) {
          models.push(model);
        }
      }
    }
    
    return models;
  }

  getBestModelFor(task: string, platform: string, constraints?: {
    maxCost?: number;
    maxResponseTime?: number;
    requiresCapability?: string[];
  }): { provider: AIProvider; model: AIModel } | null {
    const healthyProviders = this.getHealthyProviders();
    let bestMatch: { provider: AIProvider; model: AIModel; score: number } | null = null;

    for (const provider of healthyProviders) {
      for (const model of provider.models) {
        if (!model.supportedPlatforms.includes(platform)) continue;

        // Check constraints
        if (constraints) {
          if (constraints.maxCost && model.outputCostPer1k && model.outputCostPer1k > constraints.maxCost) continue;
          if (constraints.maxResponseTime && provider.status.responseTime > constraints.maxResponseTime) continue;
          if (constraints.requiresCapability) {
            const hasAllCapabilities = constraints.requiresCapability.every(cap => 
              model.capabilities.includes(cap)
            );
            if (!hasAllCapabilities) continue;
          }
        }

        // Calculate score based on routing strategy
        const score = this.calculateModelScore(provider, model, task);
        
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { provider, model, score };
        }
      }
    }

    return bestMatch ? { provider: bestMatch.provider, model: bestMatch.model } : null;
  }

  private calculateModelScore(provider: AIProvider, model: AIModel, task: string): number {
    let score = 0;

    switch (this.routingStrategy.name) {
      case 'cost-optimized':
        score = 1000 - (model.outputCostPer1k || 0);
        break;
      case 'speed-optimized':
        score = 1000 - provider.status.responseTime;
        break;
      case 'quality-optimized':
        // Prefer Claude for complex tasks, Groq for speed, Gemini for multimodal
        if (provider.type === 'anthropic' && (task.includes('complex') || task.includes('reasoning'))) {
          score += 500;
        } else if (provider.type === 'groq' && task.includes('fast')) {
          score += 400;
        } else if (provider.type === 'gemini' && task.includes('image')) {
          score += 450;
        }
        score += model.contextLength / 1000; // Prefer larger context
        break;
      case 'least-loaded':
        const queue = this.requestQueue.get(provider.id) || [];
        score = 1000 - queue.length;
        break;
      case 'round-robin':
        score = Math.random() * 1000; // Random for round-robin effect
        break;
    }

    // Apply provider health multiplier
    const healthMultiplier = provider.status.status === 'healthy' ? 1.0 : 
                            provider.status.status === 'degraded' ? 0.7 : 0.0;
    score *= healthMultiplier;

    return score;
  }

  // Request Routing
  async routeRequest(request: AIRequest): Promise<AIResponse> {
    const match = this.getBestModelFor(
      request.options.systemPrompt || 'general',
      request.platform,
      {
        requiresCapability: request.options.functions ? ['function-calling'] : undefined
      }
    );

    if (!match) {
      throw new Error('No suitable AI provider available');
    }

    const { provider, model } = match;
    
    // Add to queue
    const queue = this.requestQueue.get(provider.id) || [];
    queue.push(request);
    this.requestQueue.set(provider.id, queue);

    try {
      const response = await this.executeRequest(provider, model, request);
      
      // Update usage tracking
      if (this.config.enableCostTracking) {
        this.updateUsageTracking(provider.id, response.usage);
      }

      this.emit('requestCompleted', { provider, model, request, response });
      return response;

    } finally {
      // Remove from queue
      const updatedQueue = queue.filter(r => r.id !== request.id);
      this.requestQueue.set(provider.id, updatedQueue);
    }
  }

  private async executeRequest(provider: AIProvider, model: AIModel, request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const requestId = request.id;

    try {
      // This would normally make the actual API call to the provider
      // For now, simulate the response structure
      const simulatedResponse = {
        id: requestId,
        provider: provider.id,
        model: model.id,
        content: `Simulated response from ${provider.name} ${model.name}`,
        usage: {
          inputTokens: Math.floor(Math.random() * 1000) + 500,
          outputTokens: Math.floor(Math.random() * 500) + 100,
          totalTokens: 0,
          cost: 0
        },
        metadata: {
          responseTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          cached: false
        }
      };

      simulatedResponse.usage.totalTokens = simulatedResponse.usage.inputTokens + simulatedResponse.usage.outputTokens;
      simulatedResponse.usage.cost = this.calculateCost(model, simulatedResponse.usage);

      return simulatedResponse;

    } catch (error: any) {
      this.handleProviderError(provider.id, {
        timestamp: new Date().toISOString(),
        type: 'api_error',
        message: error.message,
        context: { request: request.id }
      });
      throw error;
    }
  }

  private calculateCost(model: AIModel, usage: { inputTokens: number; outputTokens: number }): number {
    const inputCost = (usage.inputTokens / 1000) * (model.inputCostPer1k || 0);
    const outputCost = (usage.outputTokens / 1000) * (model.outputCostPer1k || 0);
    return inputCost + outputCost;
  }

  // Health Monitoring
  private startHealthMonitoring(): void {
    if (!this.config.enableHealthMonitoring || this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);

    console.log(`Started AI provider health monitoring (${this.config.healthCheckInterval}ms interval)`);
  }

  private async performHealthChecks(): Promise<void> {
    const providers = Array.from(this.providers.values());
    
    const healthCheckPromises = providers.map(async (provider) => {
      if (!provider.config.healthCheck.enabled) return;

      try {
        const startTime = Date.now();
        const isHealthy = await this.checkProviderHealth(provider);
        const responseTime = Date.now() - startTime;

        const newStatus: AIProviderStatus = {
          ...provider.status,
          status: isHealthy ? 'healthy' : 'error',
          lastChecked: new Date().toISOString(),
          responseTime,
          uptime: isHealthy ? Math.min(provider.status.uptime + 1, 100) : Math.max(provider.status.uptime - 5, 0)
        };

        provider.status = newStatus;
        this.emit('providerHealthUpdated', { providerId: provider.id, status: newStatus });

      } catch (error: any) {
        this.handleProviderError(provider.id, {
          timestamp: new Date().toISOString(),
          type: 'network_error',
          message: error.message
        });
      }
    });

    await Promise.allSettled(healthCheckPromises);
  }

  private async checkProviderHealth(provider: AIProvider): Promise<boolean> {
    try {
      // Simple ping test - in real implementation, this would call the provider's health endpoint
      const response = await axios.get(`${provider.baseURL}/health`, {
        timeout: provider.config.healthCheck.timeout,
        headers: provider.apiKey ? { 'Authorization': `Bearer ${provider.apiKey}` } : {}
      });
      
      return response.status === 200;
    } catch (error) {
      // Most providers don't have health endpoints, so we simulate health based on recent usage
      return provider.status.errorRate < 50; // Healthy if error rate is below 50%
    }
  }

  private handleProviderError(providerId: string, error: AIProviderError): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    provider.status.errors.push(error);
    
    // Keep only last 10 errors
    if (provider.status.errors.length > 10) {
      provider.status.errors = provider.status.errors.slice(-10);
    }

    // Calculate error rate
    const recentErrors = provider.status.errors.filter(e => 
      Date.now() - new Date(e.timestamp).getTime() < 300000 // Last 5 minutes
    );
    provider.status.errorRate = (recentErrors.length / 10) * 100; // Rough calculation

    // Update status based on error rate
    if (provider.status.errorRate > 75) {
      provider.status.status = 'offline';
    } else if (provider.status.errorRate > 25) {
      provider.status.status = 'degraded';
    }

    this.emit('providerError', { providerId, error });
  }

  // Usage Tracking
  private updateUsageTracking(providerId: string, usage: { inputTokens: number; outputTokens: number; cost: number }): void {
    const costs = this.usageTracking.get(providerId);
    if (!costs) return;

    costs.inputTokens += usage.inputTokens;
    costs.outputTokens += usage.outputTokens;
    costs.totalTokens += usage.inputTokens + usage.outputTokens;
    costs.totalCost += usage.cost;
    costs.requestCount += 1;

    this.usageTracking.set(providerId, costs);

    // Update provider costs
    const provider = this.providers.get(providerId);
    if (provider) {
      provider.costs = { ...costs };
    }
  }

  // Analytics and Reporting
  getProviderAnalytics(timeframe: 'hour' | 'day' | 'week' | 'month' = 'day'): any {
    const providers = Array.from(this.providers.values());
    
    return {
      summary: {
        totalProviders: providers.length,
        healthyProviders: providers.filter(p => p.status.status === 'healthy').length,
        totalRequests: providers.reduce((sum, p) => sum + p.costs.requestCount, 0),
        totalCost: providers.reduce((sum, p) => sum + p.costs.totalCost, 0),
        totalTokens: providers.reduce((sum, p) => sum + p.costs.totalTokens, 0)
      },
      providers: providers.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status.status,
        responseTime: p.status.responseTime,
        uptime: p.status.uptime,
        costs: p.costs,
        queueLength: this.requestQueue.get(p.id)?.length || 0
      })),
      timestamp: new Date().toISOString()
    };
  }

  getRecommendation(task: 'coding' | 'chat' | 'analysis' | 'multimodal', priority: 'speed' | 'cost' | 'quality' = 'quality'): {
    provider: AIProvider;
    model: AIModel;
    reason: string;
  } | null {
    // Set routing strategy based on priority
    const oldStrategy = this.routingStrategy;
    this.routingStrategy = {
      name: priority === 'speed' ? 'speed-optimized' : 
            priority === 'cost' ? 'cost-optimized' : 'quality-optimized',
      config: {}
    };

    const match = this.getBestModelFor(task, 'web'); // Use web as default platform
    
    // Restore original strategy
    this.routingStrategy = oldStrategy;

    if (!match) return null;

    let reason = `Best ${priority} option for ${task}`;
    if (priority === 'quality' && match.provider.type === 'anthropic') {
      reason = 'Claude excels at complex reasoning and code generation';
    } else if (priority === 'speed' && match.provider.type === 'groq') {
      reason = 'Groq provides fastest inference with high quality results';
    } else if (task === 'multimodal' && match.provider.type === 'gemini') {
      reason = 'Gemini offers superior multimodal capabilities';
    }

    return {
      provider: match.provider,
      model: match.model,
      reason
    };
  }

  // Cleanup
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.providers.clear();
    this.usageTracking.clear();
    this.requestQueue.clear();
    this.removeAllListeners();
  }

  // Event handlers setup
  private setupEventHandlers(): void {
    this.on('providerError', ({ providerId, error }) => {
      console.error(`Provider ${providerId} error:`, error.message);
    });

    this.on('providerHealthUpdated', ({ providerId, status }) => {
      if (status.status !== 'healthy') {
        console.warn(`Provider ${providerId} status: ${status.status}`);
      }
    });
  }

  // Getters for status
  get isHealthy(): boolean {
    return this.getHealthyProviders().length > 0;
  }

  get totalProviders(): number {
    return this.providers.size;
  }

  get routingMode(): string {
    return this.routingStrategy.name;
  }
}

export default AIProviderRouter;