/**
 * Intelligent Model Router - Routes requests to optimal models with fallback chains
 */

import { EventEmitter } from 'events';
import { Logger } from 'recoder-shared';
import {
  ModelRequest,
  ModelResponse,
  StreamingResponse,
  ModelMetadata,
  TaskType,
  PrivacyLevel,
  ModelRoutingRule,
  ModelRecommendation,
  ModelProvider,
  ModelSpecialization,
  HybridProcessingConfig,
  RequestContext
} from 'recoder-shared/types/ai-models';
import { BaseModelProvider } from './base-provider';

export interface RouterConfig {
  defaultPrivacyLevel: PrivacyLevel;
  enableHybridProcessing: boolean;
  hybridConfig: HybridProcessingConfig;
  routingRules: ModelRoutingRule[];
  fallbackChains: Record<string, string[]>;
  performanceWeights: {
    speed: number;
    cost: number;
    quality: number;
    availability: number;
  };
}

export interface ModelScore {
  model: string;
  score: number;
  reasoning: string[];
  factors: {
    capability: number;
    performance: number;
    cost: number;
    availability: number;
    privacy: number;
    specialization: number;
  };
}

export class ModelRouter extends EventEmitter {
  private config: RouterConfig;
  private providers: Map<ModelProvider, BaseModelProvider> = new Map();
  private models: Map<string, ModelMetadata> = new Map();
  private modelPerformance: Map<string, PerformanceMetrics> = new Map();
  private requestHistory: RequestHistory[] = [];

  constructor(config: RouterConfig) {
    super();
    this.config = config;
  }

  public addProvider(provider: BaseModelProvider): void {
    const models = provider.getAllModels();
    const providerType = models[0]?.provider;
    
    if (providerType) {
      this.providers.set(providerType, provider);
      models.forEach(model => this.models.set(model.id, model));
      
      Logger.info('Provider added to router', { 
        provider: providerType, 
        modelCount: models.length 
      });
    }
  }

  public async routeRequest(request: ModelRequest): Promise<ModelResponse> {
    const startTime = Date.now();
    
    try {
      // Apply routing rules
      const targetModels = await this.selectModels(request);
      
      if (targetModels.length === 0) {
        throw new Error('No suitable models found for request');
      }

      // Try primary model first
      const primaryModel = targetModels[0];
      const provider = this.getProviderForModel(primaryModel);
      
      if (!provider) {
        throw new Error(`No provider found for model ${primaryModel}`);
      }

      try {
        const response = await provider.sendRequest({
          ...request,
          model: primaryModel
        });

        // Record successful request
        this.recordRequest(request, response, primaryModel, false);
        
        this.emit('request-routed', {
          requestId: request.id,
          selectedModel: primaryModel,
          fallbackUsed: false,
          responseTime: Date.now() - startTime
        });

        return response;
      } catch (error) {
        Logger.warn('Primary model failed, trying fallbacks', { 
          primaryModel, 
          error: error instanceof Error ? error.message : String(error)
        });

        // Try fallback models
        for (let i = 1; i < targetModels.length; i++) {
          const fallbackModel = targetModels[i];
          const fallbackProvider = this.getProviderForModel(fallbackModel);
          
          if (!fallbackProvider) continue;

          try {
            const response = await fallbackProvider.sendRequest({
              ...request,
              model: fallbackModel
            });

            // Mark as fallback used
            response.metadata.fallbackUsed = true;
            response.metadata.originalModel = primaryModel;

            // Record fallback request
            this.recordRequest(request, response, fallbackModel, true);
            
            this.emit('request-routed', {
              requestId: request.id,
              selectedModel: fallbackModel,
              fallbackUsed: true,
              originalModel: primaryModel,
              responseTime: Date.now() - startTime
            });

            return response;
          } catch (fallbackError) {
            Logger.warn('Fallback model failed', { 
              fallbackModel, 
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            });
          }
        }

        throw new Error('All models failed to process request');
      }
    } catch (error) {
      Logger.error('Request routing failed', { 
        requestId: request.id, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  public async* streamRequest(request: ModelRequest): AsyncGenerator<StreamingResponse, ModelResponse> {
    const targetModels = await this.selectModels(request);
    
    if (targetModels.length === 0) {
      throw new Error('No suitable models found for request');
    }

    const primaryModel = targetModels[0];
    const provider = this.getProviderForModel(primaryModel);
    
    if (!provider) {
      throw new Error(`No provider found for model ${primaryModel}`);
    }

    try {
      const stream = provider.streamRequest({
        ...request,
        model: primaryModel
      });

      let finalResult: ModelResponse | undefined;
      
      for await (const chunk of stream) {
        if ('finished' in chunk && chunk.finished) {
          // This is the final result, not a streaming chunk
          finalResult = chunk as any as ModelResponse;
          break;
        }
        yield chunk;
      }

      // Return the final result or create a default one
      return finalResult || {
        success: true,
        id: request.id,
        model: primaryModel,
        content: '',
        finishReason: 'stop',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        metadata: {
          model: primaryModel,
          provider: provider.getProvider(),
          timestamp: new Date(),
          responseTime: 0,
          requestId: request.id,
          cached: false,
          fallbackUsed: false
        }
      };
    } catch (error) {
      // For streaming, we don't implement fallbacks as it's complex
      // Future enhancement could buffer and retry
      throw error;
    }
  }

  public async selectModels(request: ModelRequest): Promise<string[]> {
    // Apply routing rules first
    const ruleResult = this.applyRoutingRules(request);
    if (ruleResult) {
      return ruleResult;
    }

    // Score all available models
    const scores = await this.scoreModels(request);
    
    // Apply cost-optimized routing for profit maximization
    const costOptimizedScores = this.applyCostOptimization(scores, request);
    
    // Sort by optimized score and return top candidates
    const sortedModels = costOptimizedScores
      .sort((a, b) => b.score - a.score)
      .slice(0, 5) // Top 5 candidates
      .map(s => s.model);

    Logger.debug('Model selection completed with cost optimization', {
      requestId: request.id,
      task: request.context?.task,
      selectedModels: sortedModels,
      scores: costOptimizedScores.slice(0, 3),
      costOptimizationApplied: true
    });

    return sortedModels;
  }

  /**
   * Apply cost optimization to maximize 79% profit margin
   */
  private applyCostOptimization(scores: ModelScore[], request: ModelRequest): ModelScore[] {
    return scores.map(score => {
      const model = this.models.get(score.model);
      if (!model) return score;

      // Boost score for cost-efficient models
      let costBoost = 0;
      
      if (model.isLocal) {
        costBoost = 0.3; // Significant boost for free local models
        score.reasoning.push('Cost optimization: Local model preferred');
      } else {
        const inputCost = model.limits.costPerInputToken || 0;
        const outputCost = model.limits.costPerOutputToken || 0;
        const avgCost = (inputCost + outputCost) / 2;
        
        if (avgCost <= 0.0002) {
          costBoost = 0.2; // High boost for DeepSeek-level pricing
          score.reasoning.push('Cost optimization: DeepSeek pricing tier');
        } else if (avgCost < 0.001) {
          costBoost = 0.1; // Medium boost for very cost effective
          score.reasoning.push('Cost optimization: Cost-effective tier');
        } else if (avgCost > 0.03) {
          costBoost = -0.2; // Penalty for expensive models
          score.reasoning.push('Cost optimization: Premium pricing penalty');
        }
      }

      // Apply task-specific cost optimization
      const taskType = request.context?.task;
      if (taskType === 'code_generation' && !model.isLocal) {
        const inputCost = model.limits.costPerInputToken || 0;
        const outputCost = model.limits.costPerOutputToken || 0;
        const avgCost = (inputCost + outputCost) / 2;
        
        if (avgCost <= 0.0002) {
          costBoost += 0.1; // Extra boost for cheap coding models
          score.reasoning.push('Cost optimization: Efficient for code generation');
        }
      }

      // Update score with cost optimization
      const optimizedScore = Math.min(1.0, Math.max(0.0, score.score + costBoost));
      
      return {
        ...score,
        score: optimizedScore,
        factors: {
          ...score.factors,
          cost: score.factors.cost + costBoost
        }
      };
    });
  }

  public async getModelRecommendation(request: ModelRequest): Promise<ModelRecommendation> {
    const scores = await this.scoreModels(request);
    const topScore = scores[0];
    
    if (!topScore) {
      throw new Error('No suitable models found');
    }

    const alternatives = scores.slice(1, 4).map(score => ({
      model: score.model,
      score: score.score,
      reason: score.reasoning.join(', ')
    }));

    const model = this.models.get(topScore.model)!;
    const performance = this.modelPerformance.get(topScore.model);

    return {
      model: topScore.model,
      confidence: topScore.score,
      reasoning: topScore.reasoning.join('. '),
      alternatives,
      estimated: {
        responseTime: performance?.averageResponseTime || 5000,
        cost: this.estimateCost(request, model),
        quality: topScore.factors.capability
      }
    };
  }

  private async scoreModels(request: ModelRequest): Promise<ModelScore[]> {
    const availableModels = Array.from(this.models.values())
      .filter(model => model.isAvailable);

    const scores: ModelScore[] = [];

    for (const model of availableModels) {
      const score = await this.scoreModel(model, request);
      scores.push(score);
    }

    return scores.filter(score => score.score > 0);
  }

  private async scoreModel(model: ModelMetadata, request: ModelRequest): Promise<ModelScore> {
    const context = request.context!;
    const reasoning: string[] = [];
    
    // Base capability score
    const capabilityScore = this.scoreCapability(model, context.task, reasoning);
    
    // Privacy compliance score
    const privacyScore = this.scorePrivacy(model, context.privacyLevel, reasoning);
    
    // Performance score
    const performanceScore = this.scorePerformance(model, reasoning);
    
    // Cost efficiency score
    const costScore = this.scoreCost(model, reasoning);
    
    // Availability score
    const availabilityScore = this.scoreAvailability(model, reasoning);
    
    // Specialization score
    const specializationScore = this.scoreSpecialization(model, context, reasoning);

    // Calculate weighted final score
    const weights = this.config.performanceWeights;
    const finalScore = (
      capabilityScore * 0.3 +
      privacyScore * 0.2 +
      performanceScore * weights.speed * 0.2 +
      costScore * weights.cost * 0.15 +
      availabilityScore * weights.availability * 0.1 +
      specializationScore * 0.05
    );

    return {
      model: model.id,
      score: Math.max(0, Math.min(1, finalScore)),
      reasoning,
      factors: {
        capability: capabilityScore,
        performance: performanceScore,
        cost: costScore,
        availability: availabilityScore,
        privacy: privacyScore,
        specialization: specializationScore
      }
    };
  }

  private scoreCapability(model: ModelMetadata, task: TaskType, reasoning: string[]): number {
    const capabilities = model.capabilities;
    
    switch (task) {
      case TaskType.CODE_GENERATION:
        if (capabilities.codeGeneration) {
          reasoning.push('Excellent for code generation');
          return 1.0;
        }
        return 0.0;
        
      case TaskType.CODE_REVIEW:
        if (capabilities.codeReview) {
          reasoning.push('Supports code review');
          return 1.0;
        }
        return 0.0;
        
      case TaskType.DEBUGGING:
        if (capabilities.debugging) {
          reasoning.push('Good debugging capabilities');
          return 1.0;
        }
        return 0.0;
        
      case TaskType.SECURITY_ANALYSIS:
        if (capabilities.security) {
          reasoning.push('Security analysis capable');
          return 1.0;
        }
        reasoning.push('Limited security analysis');
        return 0.3;
        
      case TaskType.DOCUMENTATION:
        if (capabilities.documentation) {
          reasoning.push('Good for documentation');
          return 1.0;
        }
        reasoning.push('Basic documentation support');
        return 0.5;
        
      case TaskType.CHAT:
        if (capabilities.chat) {
          reasoning.push('Chat optimized');
          return 1.0;
        }
        return 0.7;
        
      default:
        return 0.5;
    }
  }

  private scorePrivacy(model: ModelMetadata, privacyLevel: PrivacyLevel, reasoning: string[]): number {
    switch (privacyLevel) {
      case PrivacyLevel.RESTRICTED:
        if (model.isLocal) {
          reasoning.push('Local model meets restricted privacy');
          return 1.0;
        }
        reasoning.push('Cloud model not suitable for restricted data');
        return 0.0;
        
      case PrivacyLevel.CONFIDENTIAL:
        if (model.isLocal) {
          reasoning.push('Local model provides confidentiality');
          return 1.0;
        }
        reasoning.push('Cloud model requires privacy consideration');
        return 0.1;
        
      case PrivacyLevel.INTERNAL:
        if (model.isLocal) {
          reasoning.push('Local model preferred for internal use');
          return 1.0;
        }
        reasoning.push('Cloud model acceptable for internal use');
        return 0.7;
        
      case PrivacyLevel.PUBLIC:
        reasoning.push('Privacy requirements met');
        return 1.0;
        
      default:
        return 0.5;
    }
  }

  private scorePerformance(model: ModelMetadata, reasoning: string[]): number {
    const performance = this.modelPerformance.get(model.id);
    
    if (!performance) {
      reasoning.push('No performance data available');
      return 0.5;
    }

    // Score based on response time (lower is better)
    const responseTimeScore = Math.max(0, 1 - (performance.averageResponseTime / 30000)); // 30s max
    
    // Score based on success rate
    const reliabilityScore = performance.successRate;
    
    const finalScore = (responseTimeScore * 0.6 + reliabilityScore * 0.4);
    
    if (finalScore > 0.8) {
      reasoning.push('Excellent performance');
    } else if (finalScore > 0.6) {
      reasoning.push('Good performance');
    } else {
      reasoning.push('Average performance');
    }
    
    return finalScore;
  }

  private scoreCost(model: ModelMetadata, reasoning: string[]): number {
    if (model.isLocal) {
      reasoning.push('Free local model - maximum profit margin');
      return 1.0;
    }

    const inputCost = model.limits.costPerInputToken || 0;
    const outputCost = model.limits.costPerOutputToken || 0;
    
    // Cost-optimized scoring for 79% profit margin target
    // DeepSeek R1 pricing: ~$0.0002/1K tokens (27x cheaper than OpenAI o1)
    const avgCost = (inputCost + outputCost) / 2;
    
    if (avgCost === 0) {
      reasoning.push('Free model - maximum profit');
      return 1.0;
    } else if (avgCost <= 0.0002) {
      reasoning.push('DeepSeek-level pricing - optimal for 79% margin');
      return 0.95;
    } else if (avgCost < 0.001) {
      reasoning.push('Very cost effective - good profit margin');
      return 0.9;
    } else if (avgCost < 0.01) {
      reasoning.push('Cost effective - acceptable margin');
      return 0.7;
    } else if (avgCost < 0.03) {
      reasoning.push('Higher cost - reduced margin');
      return 0.4;
    } else {
      reasoning.push('Premium pricing - use sparingly');
      return 0.2;
    }
  }

  private scoreAvailability(model: ModelMetadata, reasoning: string[]): number {
    if (!model.isAvailable) {
      reasoning.push('Model not available');
      return 0.0;
    }

    const provider = this.getProviderForModel(model.id);
    if (!provider) {
      reasoning.push('Provider not available');
      return 0.0;
    }

    // Check provider health
    const health = provider.getModelHealth(model.id);
    if (health) {
      reasoning.push(`Model health: ${Math.round(health.availability * 100)}%`);
      return health.availability;
    }

    reasoning.push('Model available');
    return 1.0;
  }

  private scoreSpecialization(model: ModelMetadata, context: RequestContext, reasoning: string[]): number {
    if (!model.specializations || !context.language) {
      return 0.5;
    }

    const languageSpecializations = {
      'javascript': ModelSpecialization.JAVASCRIPT,
      'typescript': ModelSpecialization.TYPESCRIPT,
      'python': ModelSpecialization.PYTHON,
      'java': ModelSpecialization.JAVA,
      'rust': ModelSpecialization.RUST,
      'go': ModelSpecialization.GO,
      'cpp': ModelSpecialization.CPP,
      'c++': ModelSpecialization.CPP,
      'csharp': ModelSpecialization.CSHARP,
      'c#': ModelSpecialization.CSHARP,
      'php': ModelSpecialization.PHP,
      'ruby': ModelSpecialization.RUBY,
      'swift': ModelSpecialization.SWIFT,
      'kotlin': ModelSpecialization.KOTLIN,
      'solidity': ModelSpecialization.SOLIDITY
    };

    const targetSpecialization = languageSpecializations[context.language.toLowerCase() as keyof typeof languageSpecializations];
    
    if (targetSpecialization && model.specializations.includes(targetSpecialization)) {
      reasoning.push(`Specialized for ${context.language}`);
      return 1.0;
    }

    return 0.5;
  }

  private applyRoutingRules(request: ModelRequest): string[] | null {
    const context = request.context!;
    
    // Sort rules by priority
    const sortedRules = this.config.routingRules
      .filter(rule => rule.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.matchesCondition(rule.condition, context)) {
        Logger.debug('Routing rule matched', { 
          ruleId: rule.id, 
          ruleName: rule.name 
        });
        
        return rule.action.models;
      }
    }

    return null;
  }

  private matchesCondition(condition: any, context: RequestContext): boolean {
    // Check task type
    if (condition.task && !condition.task.includes(context.task)) {
      return false;
    }

    // Check privacy level
    if (condition.privacyLevel && !condition.privacyLevel.includes(context.privacyLevel)) {
      return false;
    }

    // Check language
    if (condition.language && context.language && !condition.language.includes(context.language)) {
      return false;
    }

    // Check token count
    if (condition.tokenCount) {
      const estimatedTokens = this.estimateRequestTokens(context);
      if (condition.tokenCount.min && estimatedTokens < condition.tokenCount.min) {
        return false;
      }
      if (condition.tokenCount.max && estimatedTokens > condition.tokenCount.max) {
        return false;
      }
    }

    return true;
  }

  private getProviderForModel(modelId: string): BaseModelProvider | undefined {
    const model = this.models.get(modelId);
    if (!model) return undefined;
    
    return this.providers.get(model.provider);
  }

  private estimateRequestTokens(context: RequestContext): number {
    // Simple estimation - would be more sophisticated in practice
    return 1000; // Default estimate
  }

  private estimateCost(request: ModelRequest, model: ModelMetadata): number {
    if (model.isLocal) return 0;
    
    const estimatedTokens = this.estimateTokens(request.messages);
    const inputCost = (model.limits.costPerInputToken || 0) * estimatedTokens;
    const outputCost = (model.limits.costPerOutputToken || 0) * (request.options.maxTokens || 1000);
    
    return inputCost + outputCost;
  }

  private estimateTokens(messages: any[]): number {
    return messages.reduce((total, msg) => total + Math.ceil(msg.content.length / 4), 0);
  }

  private recordRequest(
    request: ModelRequest,
    response: ModelResponse,
    modelUsed: string,
    fallbackUsed: boolean
  ): void {
    const historyEntry: RequestHistory = {
      requestId: request.id,
      timestamp: new Date(),
      task: request.context?.task || TaskType.CHAT,
      modelUsed,
      fallbackUsed,
      responseTime: response.metadata.responseTime,
      tokenUsage: response.usage,
      success: !response.error
    };

    this.requestHistory.push(historyEntry);
    
    // Update model performance metrics
    this.updatePerformanceMetrics(modelUsed, historyEntry);
    
    // Keep only last 1000 requests
    if (this.requestHistory.length > 1000) {
      this.requestHistory = this.requestHistory.slice(-1000);
    }
  }

  private updatePerformanceMetrics(modelId: string, request: RequestHistory): void {
    const current = this.modelPerformance.get(modelId) || {
      requestCount: 0,
      successCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      successRate: 0
    };

    current.requestCount++;
    if (request.success) {
      current.successCount++;
    }
    current.totalResponseTime += request.responseTime;
    current.averageResponseTime = current.totalResponseTime / current.requestCount;
    current.successRate = current.successCount / current.requestCount;

    this.modelPerformance.set(modelId, current);
  }

  public getPerformanceMetrics(modelId?: string): PerformanceMetrics | Map<string, PerformanceMetrics> | undefined {
    if (modelId) {
      return this.modelPerformance.get(modelId);
    }
    return this.modelPerformance;
  }

  public getRequestHistory(limit: number = 100): RequestHistory[] {
    return this.requestHistory.slice(-limit);
  }
}

interface PerformanceMetrics {
  requestCount: number;
  successCount: number;
  totalResponseTime: number;
  averageResponseTime: number;
  successRate: number;
}

interface RequestHistory {
  requestId: string;
  timestamp: Date;
  task: TaskType;
  modelUsed: string;
  fallbackUsed: boolean;
  responseTime: number;
  tokenUsage: any;
  success: boolean;
}