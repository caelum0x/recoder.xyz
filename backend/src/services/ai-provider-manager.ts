// AI Provider Manager
// Advanced AI provider orchestration with health monitoring and intelligent routing

import { EventEmitter } from 'events';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';
import { usageTracker } from './usage-tracking';

// AI Provider interfaces
export interface AIProvider {
  id: string;
  name: string;
  type: 'completion' | 'chat' | 'embedding' | 'image' | 'multimodal';
  endpoint: string;
  apiKey?: string;
  models: AIModel[];
  config: ProviderConfig;
  status: ProviderStatus;
  healthCheck: HealthCheckConfig;
  pricing: PricingInfo;
  features: ProviderFeatures;
}

export interface AIModel {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  inputPrice: number; // per 1M tokens
  outputPrice: number; // per 1M tokens
  capabilities: ModelCapability[];
  latencyTier: 'fast' | 'medium' | 'slow';
  qualityTier: 'basic' | 'good' | 'excellent';
}

export interface ProviderConfig {
  timeout: number;
  retryCount: number;
  rateLimits: {
    requestsPerSecond: number;
    tokensPerMinute: number;
    concurrentRequests: number;
  };
  fallbackProviders: string[];
  regions: string[];
  customHeaders: Record<string, string>;
}

export interface ProviderStatus {
  isHealthy: boolean;
  lastHealthCheck: Date;
  responseTime: number; // milliseconds
  errorRate: number; // percentage
  uptime: number; // percentage
  totalRequests: number;
  failedRequests: number;
}

export interface HealthCheckConfig {
  enabled: boolean;
  interval: number; // seconds
  timeout: number; // seconds
  endpoint?: string;
  testPrompt: string;
}

export interface PricingInfo {
  currency: 'USD';
  billingUnit: '1M_tokens' | '1K_tokens' | 'request';
  costMultiplier: number; // multiplier for our pricing
  freeCredits?: number;
  volumeDiscounts: VolumeDiscount[];
}

export interface VolumeDiscount {
  minimumUsage: number;
  discountPercentage: number;
}

export interface ProviderFeatures {
  streaming: boolean;
  functionCalling: boolean;
  imageAnalysis: boolean;
  codeGeneration: boolean;
  multimodal: boolean;
  reasoning: boolean;
  fineTuning: boolean;
  customModels: boolean;
}

type ModelCapability = 
  | 'text-generation'
  | 'code-generation' 
  | 'image-analysis'
  | 'function-calling'
  | 'reasoning'
  | 'multimodal'
  | 'embeddings'
  | 'fine-tuning';

export class AIProviderManager extends EventEmitter {
  private providers: Map<string, AIProvider> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private routingCache: Map<string, string> = new Map(); // cache best provider for task types

  constructor() {
    super();
    this.initializeProviders();
    this.startHealthMonitoring();
  }

  /**
   * Initialize all AI providers with comprehensive configurations
   */
  private async initializeProviders(): Promise<void> {
    const providers: AIProvider[] = [
      // Anthropic Claude - Best for reasoning and complex tasks
      {
        id: 'anthropic',
        name: 'Anthropic Claude',
        type: 'chat',
        endpoint: 'https://api.anthropic.com/v1',
        models: [
          {
            id: 'claude-3-5-sonnet-20241022',
            name: 'Claude 3.5 Sonnet',
            description: 'Most intelligent model for complex reasoning and code',
            contextLength: 200000,
            inputPrice: 3.0,
            outputPrice: 15.0,
            capabilities: ['text-generation', 'code-generation', 'reasoning', 'function-calling'],
            latencyTier: 'medium',
            qualityTier: 'excellent'
          },
          {
            id: 'claude-3-5-haiku-20241022',
            name: 'Claude 3.5 Haiku',
            description: 'Fast and efficient for quick tasks',
            contextLength: 200000,
            inputPrice: 0.8,
            outputPrice: 4.0,
            capabilities: ['text-generation', 'code-generation'],
            latencyTier: 'fast',
            qualityTier: 'good'
          }
        ],
        config: {
          timeout: 60000,
          retryCount: 3,
          rateLimits: {
            requestsPerSecond: 5,
            tokensPerMinute: 100000,
            concurrentRequests: 10
          },
          fallbackProviders: ['gemini', 'groq'],
          regions: ['us-east-1', 'us-west-2'],
          customHeaders: {}
        },
        status: {
          isHealthy: true,
          lastHealthCheck: new Date(),
          responseTime: 2500,
          errorRate: 0.5,
          uptime: 99.9,
          totalRequests: 0,
          failedRequests: 0
        },
        healthCheck: {
          enabled: true,
          interval: 300, // 5 minutes
          timeout: 10000,
          testPrompt: 'Write a simple function to add two numbers.'
        },
        pricing: {
          currency: 'USD',
          billingUnit: '1M_tokens',
          costMultiplier: 1.5, // 50% markup
          volumeDiscounts: [
            { minimumUsage: 1000000, discountPercentage: 10 },
            { minimumUsage: 10000000, discountPercentage: 20 }
          ]
        },
        features: {
          streaming: true,
          functionCalling: true,
          imageAnalysis: true,
          codeGeneration: true,
          multimodal: true,
          reasoning: true,
          fineTuning: false,
          customModels: false
        }
      },

      // Google Gemini - Great for multimodal and large context
      {
        id: 'gemini',
        name: 'Google Gemini',
        type: 'multimodal',
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        models: [
          {
            id: 'gemini-2.0-flash-exp',
            name: 'Gemini 2.0 Flash',
            description: 'Latest multimodal model with enhanced reasoning',
            contextLength: 1000000,
            inputPrice: 0.075,
            outputPrice: 0.3,
            capabilities: ['text-generation', 'code-generation', 'image-analysis', 'multimodal', 'reasoning'],
            latencyTier: 'fast',
            qualityTier: 'excellent'
          },
          {
            id: 'gemini-1.5-pro',
            name: 'Gemini 1.5 Pro',
            description: 'Large context window model for complex tasks',
            contextLength: 2000000,
            inputPrice: 1.25,
            outputPrice: 5.0,
            capabilities: ['text-generation', 'code-generation', 'image-analysis', 'multimodal'],
            latencyTier: 'medium',
            qualityTier: 'excellent'
          }
        ],
        config: {
          timeout: 45000,
          retryCount: 2,
          rateLimits: {
            requestsPerSecond: 10,
            tokensPerMinute: 300000,
            concurrentRequests: 15
          },
          fallbackProviders: ['anthropic', 'groq'],
          regions: ['us-central1', 'europe-west4'],
          customHeaders: {}
        },
        status: {
          isHealthy: true,
          lastHealthCheck: new Date(),
          responseTime: 1800,
          errorRate: 0.3,
          uptime: 99.8,
          totalRequests: 0,
          failedRequests: 0
        },
        healthCheck: {
          enabled: true,
          interval: 300,
          timeout: 8000,
          testPrompt: 'Analyze this image and code snippet together.'
        },
        pricing: {
          currency: 'USD',
          billingUnit: '1M_tokens',
          costMultiplier: 1.3,
          freeCredits: 1000000, // 1M tokens free per month
          volumeDiscounts: [
            { minimumUsage: 5000000, discountPercentage: 15 }
          ]
        },
        features: {
          streaming: true,
          functionCalling: true,
          imageAnalysis: true,
          codeGeneration: true,
          multimodal: true,
          reasoning: true,
          fineTuning: true,
          customModels: true
        }
      },

      // Groq - Ultra fast inference
      {
        id: 'groq',
        name: 'Groq',
        type: 'chat',
        endpoint: 'https://api.groq.com/openai/v1',
        models: [
          {
            id: 'llama-3.1-70b-versatile',
            name: 'Llama 3.1 70B',
            description: 'Fast, versatile model for general tasks',
            contextLength: 131072,
            inputPrice: 0.59,
            outputPrice: 0.79,
            capabilities: ['text-generation', 'code-generation', 'function-calling'],
            latencyTier: 'fast',
            qualityTier: 'good'
          },
          {
            id: 'mixtral-8x7b-32768',
            name: 'Mixtral 8x7B',
            description: 'High-quality mixture of experts model',
            contextLength: 32768,
            inputPrice: 0.24,
            outputPrice: 0.24,
            capabilities: ['text-generation', 'code-generation'],
            latencyTier: 'fast',
            qualityTier: 'good'
          }
        ],
        config: {
          timeout: 30000,
          retryCount: 2,
          rateLimits: {
            requestsPerSecond: 30,
            tokensPerMinute: 600000,
            concurrentRequests: 20
          },
          fallbackProviders: ['deepseek', 'ollama'],
          regions: ['us-west-2'],
          customHeaders: {}
        },
        status: {
          isHealthy: true,
          lastHealthCheck: new Date(),
          responseTime: 800,
          errorRate: 0.2,
          uptime: 99.7,
          totalRequests: 0,
          failedRequests: 0
        },
        healthCheck: {
          enabled: true,
          interval: 180,
          timeout: 5000,
          testPrompt: 'Generate a Python function quickly.'
        },
        pricing: {
          currency: 'USD',
          billingUnit: '1M_tokens',
          costMultiplier: 1.2,
          volumeDiscounts: [
            { minimumUsage: 10000000, discountPercentage: 10 }
          ]
        },
        features: {
          streaming: true,
          functionCalling: true,
          imageAnalysis: false,
          codeGeneration: true,
          multimodal: false,
          reasoning: false,
          fineTuning: false,
          customModels: false
        }
      },

      // DeepSeek - Cost-effective and powerful for coding
      {
        id: 'deepseek',
        name: 'DeepSeek',
        type: 'chat',
        endpoint: 'https://api.deepseek.com/v1',
        models: [
          {
            id: 'deepseek-coder',
            name: 'DeepSeek Coder',
            description: 'Specialized model for code generation and analysis',
            contextLength: 16384,
            inputPrice: 0.14,
            outputPrice: 0.28,
            capabilities: ['code-generation', 'text-generation'],
            latencyTier: 'medium',
            qualityTier: 'excellent'
          }
        ],
        config: {
          timeout: 40000,
          retryCount: 2,
          rateLimits: {
            requestsPerSecond: 20,
            tokensPerMinute: 400000,
            concurrentRequests: 10
          },
          fallbackProviders: ['groq', 'ollama'],
          regions: ['us-west-1'],
          customHeaders: {}
        },
        status: {
          isHealthy: true,
          lastHealthCheck: new Date(),
          responseTime: 1200,
          errorRate: 0.1,
          uptime: 99.5,
          totalRequests: 0,
          failedRequests: 0
        },
        healthCheck: {
          enabled: true,
          interval: 300,
          timeout: 8000,
          testPrompt: 'Write optimized code for sorting an array.'
        },
        pricing: {
          currency: 'USD',
          billingUnit: '1M_tokens',
          costMultiplier: 1.1,
          volumeDiscounts: [
            { minimumUsage: 5000000, discountPercentage: 5 }
          ]
        },
        features: {
          streaming: true,
          functionCalling: false,
          imageAnalysis: false,
          codeGeneration: true,
          multimodal: false,
          reasoning: true,
          fineTuning: true,
          customModels: false
        }
      },

      // Ollama - Local/private deployment option
      {
        id: 'ollama',
        name: 'Ollama',
        type: 'chat',
        endpoint: 'http://localhost:11434/api',
        models: [
          {
            id: 'codellama',
            name: 'Code Llama',
            description: 'Local code generation model',
            contextLength: 16384,
            inputPrice: 0,
            outputPrice: 0,
            capabilities: ['code-generation', 'text-generation'],
            latencyTier: 'medium',
            qualityTier: 'good'
          },
          {
            id: 'llama3.1',
            name: 'Llama 3.1',
            description: 'Local general-purpose model',
            contextLength: 131072,
            inputPrice: 0,
            outputPrice: 0,
            capabilities: ['text-generation', 'code-generation'],
            latencyTier: 'slow',
            qualityTier: 'good'
          }
        ],
        config: {
          timeout: 120000,
          retryCount: 1,
          rateLimits: {
            requestsPerSecond: 2,
            tokensPerMinute: 50000,
            concurrentRequests: 2
          },
          fallbackProviders: ['groq'],
          regions: ['local'],
          customHeaders: {}
        },
        status: {
          isHealthy: false, // Will be checked
          lastHealthCheck: new Date(),
          responseTime: 5000,
          errorRate: 0,
          uptime: 95.0,
          totalRequests: 0,
          failedRequests: 0
        },
        healthCheck: {
          enabled: true,
          interval: 600, // 10 minutes
          timeout: 15000,
          testPrompt: 'Hello, test local connectivity.'
        },
        pricing: {
          currency: 'USD',
          billingUnit: '1M_tokens',
          costMultiplier: 0.1, // Almost free - just compute cost
          volumeDiscounts: []
        },
        features: {
          streaming: true,
          functionCalling: false,
          imageAnalysis: false,
          codeGeneration: true,
          multimodal: false,
          reasoning: false,
          fineTuning: true,
          customModels: true
        }
      }
    ];

    // Register all providers
    for (const provider of providers) {
      this.providers.set(provider.id, provider);
      logger.info(`Registered AI provider: ${provider.name}`, {
        providerId: provider.id,
        modelCount: provider.models.length,
        features: Object.keys(provider.features).filter(key => provider.features[key as keyof ProviderFeatures])
      });
    }

    this.emit('providersInitialized', this.providers.size);
  }

  /**
   * Start health monitoring for all providers
   */
  private startHealthMonitoring(): void {
    for (const [providerId, provider] of this.providers) {
      if (provider.healthCheck.enabled) {
        const interval = setInterval(
          () => this.performHealthCheck(providerId),
          provider.healthCheck.interval * 1000
        );
        this.healthCheckIntervals.set(providerId, interval);
      }
    }
    logger.info('Started health monitoring for AI providers');
  }

  /**
   * Perform health check for a specific provider
   */
  private async performHealthCheck(providerId: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    try {
      const startTime = Date.now();
      
      // Perform actual health check (simplified)
      const isHealthy = await this.testProviderHealth(provider);
      const responseTime = Date.now() - startTime;

      // Update provider status
      provider.status.isHealthy = isHealthy;
      provider.status.lastHealthCheck = new Date();
      provider.status.responseTime = responseTime;
      
      // Update database
      await this.updateProviderStatus(providerId, provider.status);

      if (!isHealthy) {
        logger.warn(`Provider ${provider.name} health check failed`, {
          providerId,
          responseTime,
          errorRate: provider.status.errorRate
        });
        this.emit('providerUnhealthy', providerId, provider);
      }

    } catch (error) {
      logger.error(`Health check failed for provider ${provider.name}`, {
        providerId,
        error: error.message
      });

      provider.status.isHealthy = false;
      provider.status.failedRequests++;
    }
  }

  /**
   * Test provider health with a simple request
   */
  private async testProviderHealth(provider: AIProvider): Promise<boolean> {
    // This would implement actual health check logic
    // For now, simulate based on provider type
    if (provider.id === 'ollama') {
      // Check if local Ollama server is running
      try {
        const response = await fetch(`${provider.endpoint}/version`, { 
          timeout: provider.healthCheck.timeout 
        });
        return response.ok;
      } catch {
        return false;
      }
    }

    return true; // Other providers assumed healthy for demo
  }

  /**
   * Update provider status in database
   */
  private async updateProviderStatus(providerId: string, status: ProviderStatus): Promise<void> {
    try {
      await prisma.aIProviderStatus.upsert({
        where: { provider: providerId },
        update: {
          status: status.isHealthy ? 'healthy' : 'degraded',
          responseTime: status.responseTime,
          errorRate: status.errorRate,
          uptime: status.uptime,
          lastCheckAt: status.lastHealthCheck
        },
        create: {
          provider: providerId,
          status: status.isHealthy ? 'healthy' : 'degraded',
          responseTime: status.responseTime,
          errorRate: status.errorRate,
          uptime: status.uptime,
          lastCheckAt: status.lastHealthCheck
        }
      });
    } catch (error) {
      logger.error('Failed to update provider status in database', {
        providerId,
        error: error.message
      });
    }
  }

  /**
   * Get the best provider for a specific task
   */
  public getBestProvider(criteria: {
    capability: ModelCapability;
    maxLatency?: number;
    maxCost?: number;
    preferredQuality?: 'basic' | 'good' | 'excellent';
    userId?: string;
  }): AIProvider | null {
    const cacheKey = `${criteria.capability}_${criteria.maxLatency}_${criteria.maxCost}_${criteria.preferredQuality}`;
    
    // Check cache first
    if (this.routingCache.has(cacheKey)) {
      const cachedProviderId = this.routingCache.get(cacheKey);
      const cachedProvider = this.providers.get(cachedProviderId!);
      if (cachedProvider?.status.isHealthy) {
        return cachedProvider;
      }
    }

    // Find best provider based on criteria
    const candidates = Array.from(this.providers.values())
      .filter(provider => {
        // Must be healthy
        if (!provider.status.isHealthy) return false;
        
        // Must have required capability
        const hasCapability = provider.models.some(model => 
          model.capabilities.includes(criteria.capability)
        );
        if (!hasCapability) return false;

        // Check latency requirement
        if (criteria.maxLatency) {
          const avgLatency = provider.status.responseTime;
          if (avgLatency > criteria.maxLatency) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by quality, cost, and latency
        const qualityScore = (provider: AIProvider) => {
          const bestModel = provider.models
            .filter(model => model.capabilities.includes(criteria.capability))
            .sort((x, y) => {
              const qualityOrder = { 'basic': 1, 'good': 2, 'excellent': 3 };
              return qualityOrder[y.qualityTier] - qualityOrder[x.qualityTier];
            })[0];
          
          const qualityOrder = { 'basic': 1, 'good': 2, 'excellent': 3 };
          return qualityOrder[bestModel?.qualityTier || 'basic'];
        };

        const costScore = (provider: AIProvider) => {
          const bestModel = provider.models
            .filter(model => model.capabilities.includes(criteria.capability))[0];
          return bestModel ? bestModel.inputPrice + bestModel.outputPrice : Infinity;
        };

        const aQuality = qualityScore(a);
        const bQuality = qualityScore(b);
        
        if (aQuality !== bQuality) {
          return bQuality - aQuality; // Higher quality first
        }

        return costScore(a) - costScore(b); // Lower cost first
      });

    const bestProvider = candidates[0] || null;
    
    // Cache result
    if (bestProvider) {
      this.routingCache.set(cacheKey, bestProvider.id);
    }

    return bestProvider;
  }

  /**
   * Get provider by ID
   */
  public getProvider(providerId: string): AIProvider | null {
    return this.providers.get(providerId) || null;
  }

  /**
   * Get all providers
   */
  public getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get provider statistics
   */
  public getProviderStats(providerId: string): ProviderStatus | null {
    const provider = this.providers.get(providerId);
    return provider?.status || null;
  }

  /**
   * Track usage for a provider
   */
  public async trackProviderUsage(providerId: string, usage: {
    userId: string;
    modelId: string;
    tokensUsed: number;
    cost: number;
    success: boolean;
  }): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    // Update provider statistics
    provider.status.totalRequests++;
    if (!usage.success) {
      provider.status.failedRequests++;
    }
    provider.status.errorRate = (provider.status.failedRequests / provider.status.totalRequests) * 100;

    // Track usage for billing
    await usageTracker.trackUsage({
      userId: usage.userId,
      aiProvider: providerId,
      feature: 'ai-completion',
      tokensUsed: usage.tokensUsed,
      requestsMade: 1,
      model: usage.modelId,
      metadata: { cost: usage.cost, success: usage.success }
    });

    this.emit('usageTracked', { providerId, usage });
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    // Clear all health check intervals
    for (const interval of this.healthCheckIntervals.values()) {
      clearInterval(interval);
    }
    this.healthCheckIntervals.clear();
    this.routingCache.clear();
  }
}

// Export singleton instance
export const aiProviderManager = new AIProviderManager();