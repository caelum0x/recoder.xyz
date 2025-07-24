/**
 * Enhanced AI Provider Registry for Recoder.xyz
 * 
 * Supports next-generation AI models with intelligent routing based on performance metrics
 */

import { EventEmitter } from 'events';

export interface AIModelPerformance {
  modelId: string;
  provider: string;
  displayName: string;
  tokensProcessed: number;
  marketShare: number;
  costPerToken: number;
  averageResponseTime: number;
  qualityScore: number;
  specialties: string[];
  maxTokens: number;
  supportsStreaming: boolean;
  supportsImages: boolean;
  supportsCode: boolean;
  releaseDate: string;
  tier: 'flagship' | 'premium' | 'balanced' | 'efficient' | 'free';
}

export interface ProviderCapabilities {
  maxConcurrentRequests: number;
  rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
  pricing: {
    inputTokens: number;  // per 1M tokens
    outputTokens: number; // per 1M tokens
  };
  reliability: number; // 0-1 score
  averageLatency: number; // milliseconds
}

export class EnhancedProviderRegistry extends EventEmitter {
  private static instance: EnhancedProviderRegistry;
  private models: Map<string, AIModelPerformance> = new Map();
  private providers: Map<string, ProviderCapabilities> = new Map();
  private performanceHistory: Map<string, number[]> = new Map();

  private constructor() {
    super();
    this.initializeModels();
    this.initializeProviders();
  }

  static getInstance(): EnhancedProviderRegistry {
    if (!EnhancedProviderRegistry.instance) {
      EnhancedProviderRegistry.instance = new EnhancedProviderRegistry();
    }
    return EnhancedProviderRegistry.instance;
  }

  /**
   * Initialize all supported AI models with latest performance data
   */
  private initializeModels(): void {
    // Tier 1: Flagship Models (Highest Performance)
    this.models.set('claude-sonnet-4', {
      modelId: 'claude-sonnet-4',
      provider: 'anthropic',
      displayName: 'Claude Sonnet 4',
      tokensProcessed: 507_000_000_000, // 507B tokens
      marketShare: 29,
      costPerToken: 0.015, // $15 per 1M tokens
      averageResponseTime: 2500,
      qualityScore: 0.95,
      specialties: ['complex-reasoning', 'security', 'blockchain', 'architecture'],
      maxTokens: 200_000,
      supportsStreaming: true,
      supportsImages: true,
      supportsCode: true,
      releaseDate: '2025-05-01',
      tier: 'flagship'
    });

    this.models.set('claude-opus-4', {
      modelId: 'claude-opus-4',
      provider: 'anthropic',
      displayName: 'Claude Opus 4',
      tokensProcessed: 29_100_000_000, // 29.1B tokens
      marketShare: 19,
      costPerToken: 0.075, // $75 per 1M tokens (premium)
      averageResponseTime: 4000,
      qualityScore: 0.98,
      specialties: ['research', 'complex-analysis', 'enterprise', 'mission-critical'],
      maxTokens: 200_000,
      supportsStreaming: true,
      supportsImages: true,
      supportsCode: true,
      releaseDate: '2025-05-01',
      tier: 'flagship'
    });

    this.models.set('gemini-2.5-pro', {
      modelId: 'gemini-2.5-pro',
      provider: 'google',
      displayName: 'Gemini 2.5 Pro',
      tokensProcessed: 188_000_000_000, // 188B tokens
      marketShare: 12,
      costPerToken: 0.007, // $7 per 1M tokens
      averageResponseTime: 1800,
      qualityScore: 0.92,
      specialties: ['multimodal', 'large-context', 'analysis', 'documentation'],
      maxTokens: 1_000_000,
      supportsStreaming: true,
      supportsImages: true,
      supportsCode: true,
      releaseDate: '2024-05-01',
      tier: 'flagship'
    });

    // Tier 2: Premium Models (High Performance, Better Value)
    this.models.set('gemini-2.5-flash', {
      modelId: 'gemini-2.5-flash',
      provider: 'google',
      displayName: 'Gemini 2.5 Flash',
      tokensProcessed: 314_000_000_000, // 314B tokens
      marketShare: 70,
      costPerToken: 0.0003, // $0.30 per 1M tokens (excellent value)
      averageResponseTime: 400,
      qualityScore: 0.88,
      specialties: ['speed', 'ui-components', 'rapid-prototyping', 'frontend'],
      maxTokens: 1_000_000,
      supportsStreaming: true,
      supportsImages: true,
      supportsCode: true,
      releaseDate: '2024-05-01',
      tier: 'premium'
    });

    this.models.set('grok-4', {
      modelId: 'grok-4',
      provider: 'x-ai',
      displayName: 'Grok 4',
      tokensProcessed: 35_400_000_000, // 35.4B tokens
      marketShare: 20,
      costPerToken: 0.005, // $5 per 1M tokens
      averageResponseTime: 1200,
      qualityScore: 0.89,
      specialties: ['real-time', 'current-events', 'creative', 'problem-solving'],
      maxTokens: 128_000,
      supportsStreaming: true,
      supportsImages: false,
      supportsCode: true,
      releaseDate: '2025-01-01',
      tier: 'premium'
    });

    this.models.set('deepseek-v3', {
      modelId: 'deepseek-v3-0324',
      provider: 'deepseek',
      displayName: 'DeepSeek V3',
      tokensProcessed: 168_000_000_000, // 168B tokens
      marketShare: 8,
      costPerToken: 0.0002, // $0.20 per 1M tokens (exceptional value)
      averageResponseTime: 800,
      qualityScore: 0.86,
      specialties: ['cost-effective', 'mathematics', 'algorithms', 'optimization'],
      maxTokens: 64_000,
      supportsStreaming: true,
      supportsImages: false,
      supportsCode: true,
      releaseDate: '2024-03-24',
      tier: 'balanced'
    });

    // Add Kimi K2 to Tier 2 (Premium Models)
    this.models.set('kimi-k2', {
      modelId: 'moonshot-v1-128k',
      provider: 'moonshot',
      displayName: 'Kimi K2',
      tokensProcessed: 17_400_000_000, // 17.4B tokens (#5 on leaderboard)
      marketShare: 8,
      costPerToken: 0.002, // $2 per 1M tokens (competitive)
      averageResponseTime: 1500,
      qualityScore: 0.88,
      specialties: ['code-generation', 'analysis', 'long-context', 'chinese-language'],
      maxTokens: 128_000,
      supportsStreaming: true,
      supportsImages: false,
      supportsCode: true,
      releaseDate: '2024-11-01',
      tier: 'premium'
    });

    this.models.set('deepseek-r1', {
      modelId: 'deepseek-r1',
      provider: 'deepseek-r1',
      displayName: 'DeepSeek R1 0528',
      tokensProcessed: 6_820_000_000, // 6.82B tokens (#8 on leaderboard)
      marketShare: 4,
      costPerToken: 0.00055, // $0.55 per 1M tokens input (extremely cost-effective)
      averageResponseTime: 2000,
      qualityScore: 0.91,
      specialties: ['reasoning', 'step-by-step', 'cost-effective', 'problem-solving'],
      maxTokens: 65_536,
      supportsStreaming: true,
      supportsImages: false,
      supportsCode: true,
      releaseDate: '2025-05-28',
      tier: 'premium'
    });

    this.models.set('qwen3-235b', {
      modelId: 'qwen2.5-coder-32b-instruct',
      provider: 'qwen',
      displayName: 'Qwen 3 235B A22B 2507',
      tokensProcessed: 4_710_000_000, // 4.71B tokens (#9 on leaderboard)
      marketShare: 3,
      costPerToken: 0.0005, // $0.50 per 1M tokens
      averageResponseTime: 1200,
      qualityScore: 0.89,
      specialties: ['code-generation', 'chinese-language', 'instruction-following', 'efficiency'],
      maxTokens: 32_768,
      supportsStreaming: true,
      supportsImages: false,
      supportsCode: true,
      releaseDate: '2025-07-25',
      tier: 'premium'
    });

    // Tier 3: Balanced Models (Good Performance, Great Value)
    this.models.set('claude-3.7-sonnet', {
      modelId: 'claude-3.7-sonnet',
      provider: 'anthropic',
      displayName: 'Claude 3.7 Sonnet',
      tokensProcessed: 82_000_000_000, // 82B tokens
      marketShare: 32,
      costPerToken: 0.003, // $3 per 1M tokens
      averageResponseTime: 1500,
      qualityScore: 0.85,
      specialties: ['reliable', 'general-purpose', 'balanced', 'production'],
      maxTokens: 200_000,
      supportsStreaming: true,
      supportsImages: true,
      supportsCode: true,
      releaseDate: '2024-02-01',
      tier: 'balanced'
    });

    this.models.set('llama-4-maverick', {
      modelId: 'llama-4-maverick',
      provider: 'meta-llama',
      displayName: 'Llama 4 Maverick',
      tokensProcessed: 28_600_000_000, // 28.6B tokens
      marketShare: 56,
      costPerToken: 0.0001, // $0.10 per 1M tokens (open source pricing)
      averageResponseTime: 600,
      qualityScore: 0.82,
      specialties: ['open-source', 'customizable', 'privacy', 'local-deployment'],
      maxTokens: 128_000,
      supportsStreaming: true,
      supportsImages: false,
      supportsCode: true,
      releaseDate: '2024-12-01',
      tier: 'balanced'
    });

    // Tier 4: Efficient Models (Speed + Cost Optimized)
    this.models.set('gemini-2.0-flash', {
      modelId: 'gemini-2.0-flash',
      provider: 'google',
      displayName: 'Gemini 2.0 Flash',
      tokensProcessed: 264_000_000_000, // 264B tokens
      marketShare: 6,
      costPerToken: 0.0002, // $0.20 per 1M tokens
      averageResponseTime: 300,
      qualityScore: 0.80,
      specialties: ['ultra-fast', 'simple-tasks', 'autocomplete', 'suggestions'],
      maxTokens: 32_000,
      supportsStreaming: true,
      supportsImages: true,
      supportsCode: true,
      releaseDate: '2024-12-01',
      tier: 'efficient'
    });

    this.models.set('qwen-coder-32b', {
      modelId: 'qwen-coder-32b',
      provider: 'alibaba',
      displayName: 'Qwen Coder 32B',
      tokensProcessed: 15_000_000_000, // 15B tokens (estimated)
      marketShare: 3,
      costPerToken: 0.0001, // $0.10 per 1M tokens
      averageResponseTime: 500,
      qualityScore: 0.83,
      specialties: ['code-generation', 'debugging', 'refactoring', 'documentation'],
      maxTokens: 32_000,
      supportsStreaming: true,
      supportsImages: false,
      supportsCode: true,
      releaseDate: '2024-06-01',
      tier: 'efficient'
    });

    // Free Tier Models
    this.models.set('deepseek-v3-free', {
      modelId: 'deepseek-v3-0324-free',
      provider: 'deepseek',
      displayName: 'DeepSeek V3 (Free)',
      tokensProcessed: 218_000_000_000, // 218B tokens
      marketShare: 6,
      costPerToken: 0, // Free tier
      averageResponseTime: 1200,
      qualityScore: 0.86,
      specialties: ['free', 'experimentation', 'learning', 'prototyping'],
      maxTokens: 8000,
      supportsStreaming: true,
      supportsImages: false,
      supportsCode: true,
      releaseDate: '2024-03-24',
      tier: 'free'
    });

    this.models.set('r1-free', {
      modelId: 'r1-free',
      provider: 'deepseek',
      displayName: 'R1 (Free)',
      tokensProcessed: 35_800_000_000, // 35.8B tokens
      marketShare: 6,
      costPerToken: 0, // Free tier
      averageResponseTime: 800,
      qualityScore: 0.78,
      specialties: ['reasoning', 'free', 'education', 'basic-tasks'],
      maxTokens: 8000,
      supportsStreaming: true,
      supportsImages: false,
      supportsCode: true,
      releaseDate: '2024-12-01',
      tier: 'free'
    });
  }

  /**
   * Initialize provider capabilities and constraints
   */
  private initializeProviders(): void {
    this.providers.set('anthropic', {
      maxConcurrentRequests: 100,
      rateLimit: {
        requestsPerMinute: 1000,
        tokensPerMinute: 100_000
      },
      pricing: {
        inputTokens: 3.00,
        outputTokens: 15.00
      },
      reliability: 0.995,
      averageLatency: 2500
    });

    this.providers.set('google', {
      maxConcurrentRequests: 200,
      rateLimit: {
        requestsPerMinute: 2000,
        tokensPerMinute: 500_000
      },
      pricing: {
        inputTokens: 0.125,
        outputTokens: 0.375
      },
      reliability: 0.992,
      averageLatency: 800
    });

    this.providers.set('x-ai', {
      maxConcurrentRequests: 50,
      rateLimit: {
        requestsPerMinute: 500,
        tokensPerMinute: 50_000
      },
      pricing: {
        inputTokens: 5.00,
        outputTokens: 15.00
      },
      reliability: 0.988,
      averageLatency: 1200
    });

    this.providers.set('deepseek', {
      maxConcurrentRequests: 150,
      rateLimit: {
        requestsPerMinute: 1500,
        tokensPerMinute: 200_000
      },
      pricing: {
        inputTokens: 0.14,
        outputTokens: 0.28
      },
      reliability: 0.990,
      averageLatency: 800
    });

    this.providers.set('meta-llama', {
      maxConcurrentRequests: 300,
      rateLimit: {
        requestsPerMinute: 3000,
        tokensPerMinute: 1_000_000
      },
      pricing: {
        inputTokens: 0.10,
        outputTokens: 0.10
      },
      reliability: 0.985,
      averageLatency: 600
    });

    this.providers.set('alibaba', {
      maxConcurrentRequests: 80,
      rateLimit: {
        requestsPerMinute: 800,
        tokensPerMinute: 80_000
      },
      pricing: {
        inputTokens: 0.10,
        outputTokens: 0.10
      },
      reliability: 0.982,
      averageLatency: 500
    });
  }

  /**
   * Get optimal model for specific task
   */
  getOptimalModel(criteria: {
    task: 'code-generation' | 'security' | 'ui-components' | 'analysis' | 'general';
    priority: 'quality' | 'speed' | 'cost' | 'balanced';
    maxCost?: number;
    requiresStreaming?: boolean;
    requiresImages?: boolean;
    estimatedTokens?: number;
  }): AIModelPerformance | null {
    const candidates = Array.from(this.models.values())
      .filter(model => {
        // Filter by capabilities
        if (criteria.requiresStreaming && !model.supportsStreaming) return false;
        if (criteria.requiresImages && !model.supportsImages) return false;
        if (criteria.maxCost && model.costPerToken > criteria.maxCost) return false;
        
        // Filter by task specialty
        if (criteria.task === 'security' && !model.specialties.includes('security')) {
          return model.tier === 'flagship'; // Flagship models can handle security
        }
        
        return true;
      });

    if (candidates.length === 0) return null;

    // Score models based on priority
    const scoredModels = candidates.map(model => {
      let score = 0;
      
      switch (criteria.priority) {
        case 'quality':
          score = model.qualityScore * 0.7 + (1 - model.costPerToken / 0.1) * 0.3;
          break;
        case 'speed':
          score = (1 - model.averageResponseTime / 5000) * 0.8 + model.qualityScore * 0.2;
          break;
        case 'cost':
          score = (1 - model.costPerToken / 0.1) * 0.9 + model.qualityScore * 0.1;
          break;
        case 'balanced':
          score = model.qualityScore * 0.4 + 
                 (1 - model.averageResponseTime / 5000) * 0.3 + 
                 (1 - model.costPerToken / 0.1) * 0.3;
          break;
      }

      // Boost score for task specialty
      if (model.specialties.some(specialty => 
        this.getTaskSpecialties(criteria.task).includes(specialty)
      )) {
        score += 0.1;
      }

      return { model, score };
    });

    // Sort by score and return best match
    scoredModels.sort((a, b) => b.score - a.score);
    return scoredModels[0]?.model || null;
  }

  /**
   * Get all models sorted by performance tier
   */
  getAllModels(): Map<string, AIModelPerformance[]> {
    const modelsByTier = new Map<string, AIModelPerformance[]>();
    
    for (const model of this.models.values()) {
      if (!modelsByTier.has(model.tier)) {
        modelsByTier.set(model.tier, []);
      }
      modelsByTier.get(model.tier)!.push(model);
    }

    // Sort each tier by quality score
    for (const [tier, models] of modelsByTier) {
      models.sort((a, b) => b.qualityScore - a.qualityScore);
    }

    return modelsByTier;
  }

  /**
   * Get provider capabilities
   */
  getProviderCapabilities(providerId: string): ProviderCapabilities | null {
    return this.providers.get(providerId) || null;
  }

  /**
   * Update model performance metrics
   */
  updateModelPerformance(modelId: string, metrics: {
    responseTime?: number;
    qualityScore?: number;
    reliability?: number;
  }): void {
    const model = this.models.get(modelId);
    if (!model) return;

    if (metrics.responseTime) {
      model.averageResponseTime = metrics.responseTime;
    }
    if (metrics.qualityScore) {
      model.qualityScore = metrics.qualityScore;
    }

    this.emit('model:performance-updated', { modelId, metrics });
  }

  /**
   * Get cost estimate for request
   */
  getCostEstimate(modelId: string, inputTokens: number, outputTokens: number): number {
    const model = this.models.get(modelId);
    if (!model) return 0;

    const provider = this.providers.get(model.provider);
    if (!provider) return 0;

    const inputCost = (inputTokens / 1_000_000) * provider.pricing.inputTokens;
    const outputCost = (outputTokens / 1_000_000) * provider.pricing.outputTokens;
    
    return inputCost + outputCost;
  }

  /**
   * Get real-time model availability
   */
  async getModelAvailability(modelId: string): Promise<{
    available: boolean;
    waitTime?: number;
    queuePosition?: number;
  }> {
    const model = this.models.get(modelId);
    if (!model) return { available: false };

    const provider = this.providers.get(model.provider);
    if (!provider) return { available: false };

    // Simulate real-time availability check
    // In production, this would make actual API calls
    const isAvailable = Math.random() > 0.05; // 95% availability
    
    return {
      available: isAvailable,
      waitTime: isAvailable ? 0 : Math.floor(Math.random() * 30000), // 0-30 seconds
      queuePosition: isAvailable ? 0 : Math.floor(Math.random() * 10) + 1
    };
  }

  private getTaskSpecialties(task: string): string[] {
    const specialtyMap: { [key: string]: string[] } = {
      'code-generation': ['code', 'algorithms', 'debugging', 'refactoring'],
      'security': ['security', 'blockchain', 'architecture', 'mission-critical'],
      'ui-components': ['ui-components', 'frontend', 'rapid-prototyping', 'speed'],
      'analysis': ['analysis', 'large-context', 'research', 'documentation'],
      'general': ['general-purpose', 'balanced', 'reliable', 'production']
    };

    return specialtyMap[task] || [];
  }
}

// Export singleton instance
export const providerRegistry = EnhancedProviderRegistry.getInstance();

export default EnhancedProviderRegistry;