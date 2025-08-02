/**
 * Intelligent AI Orchestrator for Recoder.xyz
 * 
 * Implements smart routing algorithms for cost optimization while maintaining quality
 * Target: $12-13 per user costs on $20 plans (65% margin)
 */

import { EventEmitter } from 'events';
import { OpenRouterUnifiedProvider } from './providers/openrouter-unified-provider';
import { AIRequest, AIResponse, ProviderConfig } from './providers/base-provider';

export interface UserUsageProfile {
  userId: string;
  tier: 'free' | 'pro' | 'enterprise';
  monthlyBudget: number;
  currentSpend: number;
  requestCount: number; 
  preferences: {
    prioritizeSpeed: boolean;
    prioritizeCost: boolean;
    allowFallbacks: boolean;
  };
  taskHistory: TaskComplexityProfile[];
}

export interface TaskComplexityProfile {
  taskType: string;
  complexity: 'low' | 'medium' | 'high';
  avgCost: number;
  avgTokens: number;
  successRate: number;
  preferredModel: string;
}

export interface RoutingDecision {
  selectedModel: string;
  fallbackChain: string[];
  costEstimate: number;
  rationale: string;
  riskAssessment: {
    costOverrun: number;
    qualityImpact: number;
    speedImpact: number;
  };
}

export interface CostOptimizationMetrics {
  targetMargin: number;
  currentMargin: number;
  projectedSavings: number;
  recommendations: OptimizationRecommendation[];
}

export interface OptimizationRecommendation {
  type: 'model_switch' | 'context_caching' | 'batch_processing' | 'tier_upgrade';
  description: string;
  potentialSavings: number;
  implementationEffort: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
}

export class IntelligentAIOrchestrator extends EventEmitter {
  private provider: OpenRouterUnifiedProvider;
  private userProfiles: Map<string, UserUsageProfile> = new Map();
  private costTracker: Map<string, number> = new Map();
  private contextCache: Map<string, any> = new Map();

  // Pricing tiers aligned with your plan
  private readonly PRICING_TIERS = {
    free: { monthlyBudget: 0, requestLimit: 2000 },
    pro: { monthlyBudget: 13, requestLimit: -1 }, // Target $13 cost on $20 plan
    enterprise: { monthlyBudget: 35, requestLimit: -1 }
  };

  // Model cost matrix (per 1M tokens)
  private readonly MODEL_COSTS = {
    'meta-llama/llama-3.3-70b-instruct': { input: 0.35, output: 0.40 },
    'qwen/qwen-3-coder-480b': { input: 0.20, output: 0.60 },
    'moonshot/kimi-k2': { input: 0.15, output: 2.50 },
    'deepseek/deepseek-r1': { input: 0.55, output: 2.19 },
    'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 }
  };

  constructor(config: ProviderConfig) {
    super();
    this.provider = new OpenRouterUnifiedProvider({
      ...config,
      defaultFallbacks: true,
      costOptimization: 'balanced'
    });
  }

  /**
   * Main orchestration method with intelligent routing
   */
  async processRequest(request: AIRequest, userId: string): Promise<AIResponse> {
    const userProfile = await this.getUserProfile(userId);
    const routingDecision = await this.determineOptimalRouting(request, userProfile);
    
    // Check budget constraints
    if (!this.checkBudgetConstraints(routingDecision.costEstimate, userProfile)) {
      throw new Error(`Request would exceed monthly budget. Current spend: $${userProfile.currentSpend.toFixed(2)}, Budget: $${userProfile.monthlyBudget}`);
    }

    // Execute request with selected routing
    const response = await this.executeWithRouting(request, routingDecision);
    
    // Update usage tracking
    await this.updateUsageTracking(userId, response, routingDecision);
    
    // Emit events for monitoring
    this.emit('request_completed', {
      userId,
      cost: response.usage.cost,
      model: response.metadata.model,
      tokens: response.usage.totalTokens
    });

    return response;
  }

  /**
   * Determine optimal routing based on multiple factors
   */
  private async determineOptimalRouting(
    request: AIRequest, 
    userProfile: UserUsageProfile
  ): Promise<RoutingDecision> {
    const taskComplexity = this.assessTaskComplexity(request);
    const budgetRemaining = userProfile.monthlyBudget - userProfile.currentSpend;
    const urgencyFactor = request.options.priority || 'normal';

    // Cost-optimized routing for budget-conscious scenarios
    if (budgetRemaining < 2.0 || userProfile.preferences.prioritizeCost) {
      return this.getCostOptimizedRouting(request, taskComplexity, budgetRemaining);
    }

    // Quality-optimized routing for complex tasks
    if (taskComplexity === 'high' || urgencyFactor === 'high') {
      return this.getQualityOptimizedRouting(request, taskComplexity, budgetRemaining);
    }

    // Balanced routing (default)
    return this.getBalancedRouting(request, taskComplexity, budgetRemaining);
  }

  /**
   * Cost-optimized routing strategy (50-78% cost reduction)
   */
  private getCostOptimizedRouting(
    request: AIRequest, 
    complexity: string, 
    budget: number
  ): RoutingDecision {
    let selectedModel = 'meta-llama/llama-3.3-70b-instruct'; // Most cost-effective
    let fallbackChain = ['qwen/qwen-3-coder-480b'];

    // Check if we can use context caching for 90% savings
    const cacheKey = this.generateCacheKey(request);
    if (this.contextCache.has(cacheKey)) {
      return {
        selectedModel: 'cached_response',
        fallbackChain: [selectedModel],
        costEstimate: 0.001, // Minimal cache cost
        rationale: 'Using cached response for 99% cost savings',
        riskAssessment: {
          costOverrun: 0,
          qualityImpact: 0,
          speedImpact: -50 // Faster from cache
        }
      };
    }

    // For code generation, use Qwen 3 Coder even in cost mode
    if (this.requiresCodeGeneration(request)) {
      selectedModel = 'qwen/qwen-3-coder-480b';
      fallbackChain = ['meta-llama/llama-3.3-70b-instruct'];
    }

    const costEstimate = this.estimateRequestCost(request, selectedModel);

    return {
      selectedModel,
      fallbackChain,
      costEstimate,
      rationale: `Cost-optimized routing: ${complexity} complexity task, $${budget.toFixed(2)} remaining`,
      riskAssessment: {
        costOverrun: 0.1,
        qualityImpact: 0.15, // Slight quality reduction for cost savings
        speedImpact: 0.1
      }
    };
  }

  /**
   * Quality-optimized routing for complex tasks
   */
  private getQualityOptimizedRouting(
    request: AIRequest, 
    complexity: string, 
    budget: number
  ): RoutingDecision {
    let selectedModel = 'anthropic/claude-3.5-sonnet'; // Highest quality
    let fallbackChain = ['deepseek/deepseek-r1', 'moonshot/kimi-k2'];

    // Reasoning tasks -> DeepSeek R1 for transparent thinking
    if (this.requiresReasoning(request)) {
      selectedModel = 'deepseek/deepseek-r1';
      fallbackChain = ['anthropic/claude-3.5-sonnet', 'moonshot/kimi-k2'];
    }

    // Complex code analysis -> Kimi K2 for tool calling
    if (this.requiresComplexAnalysis(request)) {
      selectedModel = 'moonshot/kimi-k2';
      fallbackChain = ['deepseek/deepseek-r1', 'anthropic/claude-3.5-sonnet'];
    }

    const costEstimate = this.estimateRequestCost(request, selectedModel);

    return {
      selectedModel,
      fallbackChain,
      costEstimate,
      rationale: `Quality-optimized routing: ${complexity} complexity requires premium models`,
      riskAssessment: {
        costOverrun: 0.3, // Higher cost for quality
        qualityImpact: -0.2, // Quality improvement
        speedImpact: 0.1
      }
    };
  }

  /**
   * Balanced routing strategy (default)
   */
  private getBalancedRouting(
    request: AIRequest, 
    complexity: string, 
    budget: number
  ): RoutingDecision {
    const routingMatrix = {
      'low': {
        model: 'meta-llama/llama-3.3-70b-instruct',
        fallbacks: ['qwen/qwen-3-coder-480b']
      },
      'medium': {
        model: 'qwen/qwen-3-coder-480b',
        fallbacks: ['moonshot/kimi-k2', 'meta-llama/llama-3.3-70b-instruct']
      },
      'high': {
        model: 'deepseek/deepseek-r1',
        fallbacks: ['anthropic/claude-3.5-sonnet', 'moonshot/kimi-k2']
      }
    };

    const routing = routingMatrix[complexity as keyof typeof routingMatrix] || routingMatrix.medium;
    const costEstimate = this.estimateRequestCost(request, routing.model);

    return {
      selectedModel: routing.model,
      fallbackChain: routing.fallbacks,
      costEstimate,
      rationale: `Balanced routing: ${complexity} complexity, optimizing cost vs quality`,
      riskAssessment: {
        costOverrun: 0.15,
        qualityImpact: 0.05,
        speedImpact: 0.1
      }
    };
  }

  /**
   * Execute request with selected routing
   */
  private async executeWithRouting(
    request: AIRequest, 
    routing: RoutingDecision
  ): Promise<AIResponse> {
    // Check for cached response first
    if (routing.selectedModel === 'cached_response') {
      const cacheKey = this.generateCacheKey(request);
      const cachedResponse = this.contextCache.get(cacheKey);
      if (cachedResponse) {
        return {
          ...cachedResponse,
          metadata: {
            ...cachedResponse.metadata,
            cached: true,
            costSavings: 0.99
          }
        };
      }
    }

    // Enhance request with routing information
    const enhancedRequest = {
      ...request,
      options: {
        ...request.options,
        model: routing.selectedModel,
        fallbackModels: routing.fallbackChain
      }
    };

    const response = await this.provider.sendRequest(enhancedRequest);

    // Cache response for future use (if applicable)
    if (this.shouldCacheResponse(request, response)) {
      const cacheKey = this.generateCacheKey(request);
      this.contextCache.set(cacheKey, response);
    }

    return response;
  }

  /**
   * Estimate request cost based on model and prompt
   */
  private estimateRequestCost(request: AIRequest, model: string): number {
    const modelCosts = this.MODEL_COSTS[model as keyof typeof this.MODEL_COSTS];
    if (!modelCosts) return 0.01; // Fallback estimate

    const estimatedInputTokens = Math.ceil(request.prompt.length / 4);
    const estimatedOutputTokens = request.options.maxTokens || 1000;

    const inputCost = (estimatedInputTokens / 1_000_000) * modelCosts.input;
    const outputCost = (estimatedOutputTokens / 1_000_000) * modelCosts.output;

    // Add OpenRouter fee (5.5%)
    return (inputCost + outputCost) * 1.055;
  }

  /**
   * Check budget constraints
   */
  private checkBudgetConstraints(estimatedCost: number, userProfile: UserUsageProfile): boolean {
    const projectedSpend = userProfile.currentSpend + estimatedCost;
    return projectedSpend <= userProfile.monthlyBudget;
  }

  /**
   * Generate cache key for context caching
   */
  private generateCacheKey(request: AIRequest): string {
    const prompt = request.prompt.substring(0, 500); // First 500 chars
    const context = request.context?.projectContext || '';
    return `${prompt}_${context}`.replace(/\s+/g, '_').toLowerCase();
  }

  /**
   * Determine if response should be cached
   */
  private shouldCacheResponse(request: AIRequest, response: AIResponse): boolean {
    // Cache responses for common patterns, documentation, explanations
    const cachablePatterns = ['explain', 'what is', 'how to', 'documentation', 'tutorial'];
    return cachablePatterns.some(pattern => 
      request.prompt.toLowerCase().includes(pattern)
    );
  }

  /**
   * Get or create user profile
   */
  private async getUserProfile(userId: string): Promise<UserUsageProfile> {
    if (!this.userProfiles.has(userId)) {
      const defaultProfile: UserUsageProfile = {
        userId,
        tier: 'pro',
        monthlyBudget: this.PRICING_TIERS.pro.monthlyBudget,
        currentSpend: 0,
        requestCount: 0,
        preferences: {
          prioritizeSpeed: false,
          prioritizeCost: false,
          allowFallbacks: true
        },
        taskHistory: []
      };
      this.userProfiles.set(userId, defaultProfile);
    }
    return this.userProfiles.get(userId)!;
  }

  /**
   * Update usage tracking after request
   */
  private async updateUsageTracking(
    userId: string, 
    response: AIResponse, 
    routing: RoutingDecision
  ): Promise<void> {
    const userProfile = this.userProfiles.get(userId)!;
    
    userProfile.currentSpend += response.usage.cost || 0;
    userProfile.requestCount += 1;

    // Update task history for learning
    const taskProfile: TaskComplexityProfile = {
      taskType: response.metadata.model || 'unknown',
      complexity: this.assessComplexityFromResponse(response),
      avgCost: response.usage.cost || 0,
      avgTokens: response.usage.totalTokens,
      successRate: response.metadata.confidence || 0.8,
      preferredModel: routing.selectedModel
    };

    userProfile.taskHistory.push(taskProfile);

    // Keep only last 100 tasks for efficiency
    if (userProfile.taskHistory.length > 100) {
      userProfile.taskHistory.shift();
    }

    this.userProfiles.set(userId, userProfile);
  }

  /**
   * Generate cost optimization recommendations
   */
  public generateCostOptimizationReport(userId: string): CostOptimizationMetrics {
    const userProfile = this.userProfiles.get(userId);
    if (!userProfile) {
      throw new Error('User profile not found');
    }

    const targetMargin = 0.65; // 65% margin target ($13 cost on $20 plan)
    const currentMargin = 1 - (userProfile.currentSpend / 20); // Assuming $20 plan
    const recommendations: OptimizationRecommendation[] = [];

    // Analyze spending patterns
    if (currentMargin < targetMargin) {
      recommendations.push({
        type: 'model_switch',
        description: 'Switch to Qwen 3 Coder for code generation tasks (60% cost reduction)',
        potentialSavings: userProfile.currentSpend * 0.6,
        implementationEffort: 'low',
        riskLevel: 'low'
      });

      recommendations.push({
        type: 'context_caching',
        description: 'Enable aggressive context caching for repeated queries (90% savings)',
        potentialSavings: userProfile.currentSpend * 0.4,
        implementationEffort: 'medium',
        riskLevel: 'low'
      });
    }

    if (userProfile.requestCount > 3000) {
      recommendations.push({
        type: 'tier_upgrade',
        description: 'Consider enterprise tier for better cost efficiency at scale',
        potentialSavings: 0,
        implementationEffort: 'low',
        riskLevel: 'low'
      });
    }

    const projectedSavings = recommendations.reduce((sum, rec) => sum + rec.potentialSavings, 0);

    return {
      targetMargin,
      currentMargin,
      projectedSavings,
      recommendations
    };
  }

  /**
   * Helper methods for task assessment
   */
  private assessTaskComplexity(request: AIRequest): string {
    const prompt = request.prompt.toLowerCase();
    const length = request.prompt.length;

    if (length > 5000 || 
        prompt.includes('architecture') || 
        prompt.includes('design pattern') ||
        prompt.includes('security audit')) {
      return 'high';
    }

    if (length > 1500 || 
        prompt.includes('debug') || 
        prompt.includes('refactor') ||
        prompt.includes('analyze')) {
      return 'medium';
    }

    return 'low';
  }

  private requiresReasoning(request: AIRequest): boolean {
    const indicators = ['why', 'how', 'explain', 'reasoning', 'step-by-step', 'analyze'];
    return indicators.some(indicator => request.prompt.toLowerCase().includes(indicator));
  }

  private requiresCodeGeneration(request: AIRequest): boolean {
    const indicators = ['function', 'class', 'method', 'code', 'implement', 'create'];
    return indicators.some(indicator => request.prompt.toLowerCase().includes(indicator));
  }

  private requiresComplexAnalysis(request: AIRequest): boolean {
    const indicators = ['analyze', 'review', 'audit', 'optimize', 'architecture'];
    return indicators.some(indicator => request.prompt.toLowerCase().includes(indicator));
  }

  private assessComplexityFromResponse(response: AIResponse): 'low' | 'medium' | 'high' {
    const tokenCount = response.usage.totalTokens;
    if (tokenCount > 3000) return 'high';
    if (tokenCount > 1000) return 'medium';
    return 'low';
  }
}

export default IntelligentAIOrchestrator;