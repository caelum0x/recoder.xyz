// AI Router Service
// Intelligent request routing with fallback and load balancing

import { EventEmitter } from 'events';
import { aiProviderManager, AIProvider } from './ai-provider-manager';
import { aiCostOptimizer } from './ai-cost-optimizer';
import { logger } from '../utils/logger';

interface RoutingRequest {
  userId: string;
  taskType: 'code-generation' | 'text-generation' | 'image-analysis' | 'reasoning' | 'embedding';
  prompt: string;
  context?: {
    language?: string;
    framework?: string;
    complexity?: 'simple' | 'medium' | 'complex';
    urgency?: 'low' | 'medium' | 'high';
  };
  constraints?: {
    maxLatency?: number;
    maxCost?: number;
    qualityRequired?: 'basic' | 'good' | 'excellent';
    privacyRequired?: boolean;
  };
}

interface RoutingResult {
  providerId: string;
  modelId: string;
  estimatedCost: number;
  estimatedLatency: number;
  confidence: number; // 0-1, how confident we are this is the best choice
  fallbackProviders: string[];
  costOptimization?: {
    reasoning: string;
    costSavings: number;
    qualityScore: number;
    alternatives: Array<{
      providerId: string;
      cost: number;
      quality: number;
      reasoning: string;
    }>;
  };
}

interface FailoverAttempt {
  providerId: string;
  error: string;
  timestamp: Date;
  responseTime: number;
}

export class AIRouter extends EventEmitter {
  private routingHistory: Map<string, RoutingResult[]> = new Map();
  private failoverAttempts: Map<string, FailoverAttempt[]> = new Map();

  constructor() {
    super();
  }

  /**
   * Route request to the best AI provider with cost optimization
   */
  public async routeRequest(request: RoutingRequest): Promise<RoutingResult> {
    logger.info('Routing AI request with cost optimization', {
      userId: request.userId,
      taskType: request.taskType,
      complexity: request.context?.complexity
    });

    try {
      // Get cost-optimized routing recommendation
      const costOptimizationRequest = {
        userId: request.userId,
        prompt: request.prompt,
        taskType: request.taskType,
        complexity: request.context?.complexity,
        maxCost: request.constraints?.maxCost,
        userTier: await this.getUserTier(request.userId)
      };

      const costDecision = await aiCostOptimizer.optimizeRouting(costOptimizationRequest);
      
      // Use cost-optimized provider if available
      let selectedProvider = aiProviderManager.getProvider(costDecision.selectedProvider);
      
      if (!selectedProvider) {
        // Fallback to original routing logic
        const capability = this.mapTaskToCapability(request.taskType);
        const criteria = this.buildRoutingCriteria(request, capability);
        selectedProvider = aiProviderManager.getBestProvider(criteria);
      }
      
      if (!selectedProvider) {
        throw new Error('No suitable AI provider available');
      }

      // Select best model for this task
      const model = this.selectBestModel(selectedProvider, request);
      
      // Calculate estimates with cost optimization
      const estimates = this.calculateEstimatesWithOptimization(selectedProvider, model, request, costDecision);
      
      // Get fallback providers from cost optimization
      const fallbackProviders = this.getFallbackProvidersOptimized(selectedProvider, request, costDecision);

      const result: RoutingResult = {
        providerId: selectedProvider.id,
        modelId: model.id,
        estimatedCost: costDecision.expectedCost,
        estimatedLatency: estimates.latency,
        confidence: estimates.confidence * costDecision.qualityScore,
        fallbackProviders: fallbackProviders.map(p => p.id),
        costOptimization: {
          reasoning: costDecision.reasoning,
          costSavings: costDecision.costSavings,
          qualityScore: costDecision.qualityScore,
          alternatives: costDecision.alternativeOptions
        }
      };

      // Store routing decision for learning
      this.storeRoutingHistory(request.userId, result);

      // Track cost optimization decision
      this.emit('costOptimizedRouting', {
        request,
        result,
        costDecision,
        costSavings: costDecision.costSavings
      });

      this.emit('requestRouted', { request, result });

      return result;

    } catch (error) {
      logger.error('Failed to route AI request with cost optimization', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.userId,
        taskType: request.taskType
      });
      
      // Fallback to basic routing without cost optimization
      return this.basicRoutingFallback(request);
    }
  }

  /**
   * Handle provider failure and attempt failover
   */
  public async handleFailover(
    originalRequest: RoutingRequest,
    originalResult: RoutingResult,
    error: string
  ): Promise<RoutingResult> {
    logger.warn('Attempting AI provider failover', {
      failedProvider: originalResult.providerId,
      error,
      userId: originalRequest.userId
    });

    // Record failover attempt
    const attempt: FailoverAttempt = {
      providerId: originalResult.providerId,
      error,
      timestamp: new Date(),
      responseTime: 0 // Will be updated
    };
    
    const userAttempts = this.failoverAttempts.get(originalRequest.userId) || [];
    userAttempts.push(attempt);
    this.failoverAttempts.set(originalRequest.userId, userAttempts);

    // Try fallback providers in order
    for (const fallbackProviderId of originalResult.fallbackProviders) {
      try {
        const fallbackProvider = aiProviderManager.getProvider(fallbackProviderId);
        
        if (!fallbackProvider || !fallbackProvider.status.isHealthy) {
          continue;
        }

        // Create new routing result for fallback
        const model = this.selectBestModel(fallbackProvider, originalRequest);
        const estimates = this.calculateEstimates(fallbackProvider, model, originalRequest);
        
        const fallbackResult: RoutingResult = {
          providerId: fallbackProvider.id,
          modelId: model.id,
          estimatedCost: estimates.cost,
          estimatedLatency: estimates.latency,
          confidence: estimates.confidence * 0.8, // Reduced confidence for fallback
          fallbackProviders: originalResult.fallbackProviders.filter(id => id !== fallbackProviderId)
        };

        logger.info('Failover successful', {
          originalProvider: originalResult.providerId,
          fallbackProvider: fallbackProvider.id,
          userId: originalRequest.userId
        });

        this.emit('failoverSuccess', { originalResult, fallbackResult, error });

        return fallbackResult;

      } catch (fallbackError) {
        logger.warn('Fallback provider also failed', {
          provider: fallbackProviderId,
          error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
          userId: originalRequest.userId
        });
        continue;
      }
    }

    // If all fallbacks failed, throw error
    throw new Error('All AI providers failed, no fallback available');
  }

  /**
   * Get routing recommendations for different scenarios
   */
  public getRoutingRecommendations(userId: string): {
    recommendations: Array<{
      scenario: string;
      provider: string;
      model: string;
      reasoning: string;
    }>;
    userPreferences: {
      mostUsedProvider: string;
      averageCost: number;
      preferredQuality: 'basic' | 'good' | 'excellent';
    };
  } {
    const userHistory = this.routingHistory.get(userId) || [];
    
    // Analyze user patterns
    const providerCounts = userHistory.reduce((acc, result) => {
      acc[result.providerId] = (acc[result.providerId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const mostUsedProvider = Object.entries(providerCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'anthropic';

    const averageCost = userHistory.reduce((sum, result) => sum + result.estimatedCost, 0) / 
                      (userHistory.length || 1);

    const recommendations = [
      {
        scenario: 'Complex Code Generation',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        reasoning: 'Best reasoning capabilities for complex programming tasks'
      },
      {
        scenario: 'Quick Prototyping',
        provider: 'groq',
        model: 'llama-3.1-70b-versatile',
        reasoning: 'Fastest response times for rapid iteration'
      },
      {
        scenario: 'Cost-Effective Development',
        provider: 'deepseek',
        model: 'deepseek-coder',
        reasoning: 'Excellent code quality at lower cost'
      },
      {
        scenario: 'Multimodal Analysis',
        provider: 'gemini',
        model: 'gemini-2.0-flash-exp',
        reasoning: 'Superior image and multimodal capabilities'
      },
      {
        scenario: 'Private/Local Development',
        provider: 'ollama',
        model: 'codellama',
        reasoning: 'Runs locally for maximum privacy'
      }
    ];

    return {
      recommendations,
      userPreferences: {
        mostUsedProvider,
        averageCost,
        preferredQuality: averageCost > 0.01 ? 'excellent' : averageCost > 0.005 ? 'good' : 'basic'
      }
    };
  }

  /**
   * Map task type to model capability
   */
  private mapTaskToCapability(taskType: string): any {
    const mapping = {
      'code-generation': 'code-generation',
      'text-generation': 'text-generation', 
      'image-analysis': 'image-analysis',
      'reasoning': 'reasoning',
      'embedding': 'embeddings'
    };

    return mapping[taskType as keyof typeof mapping] || 'text-generation';
  }

  /**
   * Build routing criteria from request
   */
  private buildRoutingCriteria(request: RoutingRequest, capability: any): any {
    const criteria: any = {
      capability,
      userId: request.userId
    };

    // Map urgency to latency requirements
    if (request.context?.urgency) {
      const latencyLimits = {
        high: 2000,   // 2 seconds
        medium: 10000, // 10 seconds  
        low: 30000    // 30 seconds
      };
      criteria.maxLatency = latencyLimits[request.context.urgency];
    }

    // Map constraints
    if (request.constraints) {
      if (request.constraints.maxLatency) {
        criteria.maxLatency = request.constraints.maxLatency;
      }
      if (request.constraints.maxCost) {
        criteria.maxCost = request.constraints.maxCost;
      }
      if (request.constraints.qualityRequired) {
        criteria.preferredQuality = request.constraints.qualityRequired;
      }
    }

    return criteria;
  }

  /**
   * Select best model from provider for specific request
   */
  private selectBestModel(provider: AIProvider, request: RoutingRequest): any {
    const capability = this.mapTaskToCapability(request.taskType);
    
    const suitableModels = provider.models.filter(model => 
      model.capabilities.includes(capability)
    );

    if (suitableModels.length === 0) {
      return provider.models[0]; // Fallback to first model
    }

    // Sort by quality, then by cost efficiency
    const sortedModels = suitableModels.sort((a, b) => {
      const qualityOrder = { 'basic': 1, 'good': 2, 'excellent': 3 };
      const aQuality = qualityOrder[a.qualityTier];
      const bQuality = qualityOrder[b.qualityTier];

      if (aQuality !== bQuality) {
        return bQuality - aQuality; // Higher quality first
      }

      // For same quality, prefer lower cost
      const aCost = a.inputPrice + a.outputPrice;
      const bCost = b.inputPrice + b.outputPrice;
      return aCost - bCost;
    });

    return sortedModels[0];
  }

  /**
   * Calculate cost and latency estimates
   */
  private calculateEstimates(provider: AIProvider, model: any, request: RoutingRequest): {
    cost: number;
    latency: number;
    confidence: number;
  } {
    // Rough token estimation based on prompt length
    const estimatedTokens = Math.max(100, request.prompt.length / 4); // ~4 chars per token
    const outputTokens = Math.min(estimatedTokens * 0.5, 2000); // Conservative output estimate

    // Calculate cost
    const inputCost = (model.inputPrice * estimatedTokens) / 1000000;
    const outputCost = (model.outputPrice * outputTokens) / 1000000;
    const totalCost = (inputCost + outputCost) * provider.pricing.costMultiplier;

    // Estimate latency based on provider status and model tier
    const baseLatency = provider.status.responseTime;
    const modelMultiplier = {
      'fast': 0.8,
      'medium': 1.0, 
      'slow': 1.5
    }[model.latencyTier] || 1.0;

    const estimatedLatency = baseLatency * modelMultiplier;

    // Calculate confidence based on provider health and historical performance
    let confidence = 0.8; // Base confidence
    
    if (provider.status.errorRate < 1) confidence += 0.1;
    if (provider.status.uptime > 99) confidence += 0.1;
    if (provider.status.responseTime < 2000) confidence += 0.1;

    confidence = Math.min(1.0, confidence);

    return {
      cost: totalCost,
      latency: estimatedLatency,
      confidence
    };
  }

  /**
   * Get fallback providers for given provider
   */
  private getFallbackProviders(provider: AIProvider, request: RoutingRequest): AIProvider[] {
    const capability = this.mapTaskToCapability(request.taskType);
    
    return provider.config.fallbackProviders
      .map(id => aiProviderManager.getProvider(id))
      .filter((p): p is AIProvider => {
        if (!p || !p.status.isHealthy) return false;
        return p.models.some(model => model.capabilities.includes(capability));
      });
  }

  /**
   * Store routing decision for machine learning
   */
  private storeRoutingHistory(userId: string, result: RoutingResult): void {
    const userHistory = this.routingHistory.get(userId) || [];
    userHistory.push(result);
    
    // Keep only last 100 decisions per user
    if (userHistory.length > 100) {
      userHistory.shift();
    }
    
    this.routingHistory.set(userId, userHistory);
  }

  /**
   * Get user tier for cost optimization
   */
  private async getUserTier(userId: string): Promise<'free' | 'pro' | 'enterprise'> {
    // Mock implementation - in practice, query user subscription
    return 'pro';
  }

  /**
   * Calculate estimates with cost optimization
   */
  private calculateEstimatesWithOptimization(
    provider: AIProvider, 
    model: any, 
    request: RoutingRequest, 
    costDecision: any
  ): { cost: number; latency: number; confidence: number } {
    
    const baseEstimates = this.calculateEstimates(provider, model, request);
    
    return {
      cost: costDecision.expectedCost,
      latency: baseEstimates.latency,
      confidence: baseEstimates.confidence * costDecision.qualityScore
    };
  }

  /**
   * Get fallback providers optimized for cost
   */
  private getFallbackProvidersOptimized(
    provider: AIProvider, 
    request: RoutingRequest, 
    costDecision: any
  ): AIProvider[] {
    
    // Use alternatives from cost optimization
    const alternativeIds = costDecision.alternativeOptions.map((alt: any) => alt.providerId);
    
    return alternativeIds
      .map((id: string) => aiProviderManager.getProvider(id))
      .filter((p): p is AIProvider => p !== null && p.status.isHealthy);
  }

  /**
   * Basic routing fallback without cost optimization
   */
  private async basicRoutingFallback(request: RoutingRequest): Promise<RoutingResult> {
    logger.info('Using basic routing fallback', { userId: request.userId });

    const capability = this.mapTaskToCapability(request.taskType);
    const criteria = this.buildRoutingCriteria(request, capability);
    const provider = aiProviderManager.getBestProvider(criteria);
    
    if (!provider) {
      throw new Error('No suitable AI provider available');
    }

    const model = this.selectBestModel(provider, request);
    const estimates = this.calculateEstimates(provider, model, request);
    const fallbackProviders = this.getFallbackProviders(provider, request);

    return {
      providerId: provider.id,
      modelId: model.id,
      estimatedCost: estimates.cost,
      estimatedLatency: estimates.latency,
      confidence: estimates.confidence,
      fallbackProviders: fallbackProviders.map(p => p.id)
    };
  }

  /**
   * Get routing analytics
   */
  public getAnalytics(): {
    totalRequests: number;
    providerDistribution: Record<string, number>;
    averageLatency: number;
    failoverRate: number;
    costEfficiency: number;
  } {
    const allHistory = Array.from(this.routingHistory.values()).flat();
    const totalRequests = allHistory.length;

    const providerDistribution = allHistory.reduce((acc, result) => {
      acc[result.providerId] = (acc[result.providerId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const averageLatency = allHistory.reduce((sum, result) => sum + result.estimatedLatency, 0) / 
                          (totalRequests || 1);

    const allFailovers = Array.from(this.failoverAttempts.values()).flat();
    const failoverRate = (allFailovers.length / totalRequests) * 100;

    const averageCost = allHistory.reduce((sum, result) => sum + result.estimatedCost, 0) / 
                      (totalRequests || 1);

    return {
      totalRequests,
      providerDistribution,
      averageLatency,
      failoverRate,
      costEfficiency: averageCost
    };
  }
}

// Export singleton instance
export const aiRouter = new AIRouter();