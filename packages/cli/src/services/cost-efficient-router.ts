/**
 * Cost-Efficient AI Model Router for Recoder.xyz
 * 
 * Intelligently routes AI requests to the most cost-effective model
 * while maintaining high quality output based on task requirements.
 */

import { Logger } from '../utils/logger';
import { openRouterProvider } from './openrouter-provider';

export interface TaskContext {
  type: 'blockchain' | 'web' | 'mobile' | 'backend' | 'security' | 'devops' | 'general';
  complexity: 'simple' | 'medium' | 'complex';
  priority: 'speed' | 'quality' | 'cost';
  requirements?: string[];
  tokenEstimate?: number;
}

export interface ModelTier {
  name: string;
  models: string[];
  costPerMToken: number;
  specialties: string[];
  availability: 'free' | 'free-tier' | 'paid';
  maxTokens: number;
  qualityScore: number;
}

export interface CostOptimizationConfig {
  maxDailyCost: number;
  preferFreeModels: boolean;
  allowFallbacks: boolean;
  qualityThreshold: number;
  budgetMode: boolean;
}

export class CostEfficientRouter {
  private static instance: CostEfficientRouter;
  private dailyCost: number = 0;
  private requestCount: number = 0;
  private modelUsageStats: Map<string, { count: number, totalCost: number }> = new Map();

  // Model tiers organized by cost efficiency
  private readonly modelTiers: ModelTier[] = [
    // FREE TIER - Ollama Local (No API costs)
    {
      name: 'ollama-local',
      models: ['ollama/llama3.2', 'ollama/codellama', 'ollama/deepseek-coder'],
      costPerMToken: 0,
      specialties: ['coding', 'general', 'privacy'],
      availability: 'free',
      maxTokens: 8192,
      qualityScore: 7.5
    },

    // FREE TIER - Cloud Models with Free Quotas
    {
      name: 'free-cloud',
      models: [
        'deepseek/deepseek-r1',              // FREE with high quality
        'qwen/qwen-2.5-coder-32b-instruct',  // FREE coding specialist
        'google/gemini-2.0-flash-exp',       // Google free tier
        'meta-llama/llama-3.1-8b-instruct'   // Many providers offer free
      ],
      costPerMToken: 0,
      specialties: ['coding', 'reasoning', 'general'],
      availability: 'free-tier',
      maxTokens: 32768,
      qualityScore: 8.5
    },

    // LOW COST - High performance per dollar
    {
      name: 'budget-optimized',
      models: [
        'google/gemini-2.0-flash-exp',       // $0.075/M input
        'meta-llama/llama-3.1-70b-instruct', // $0.50/M
        'mistralai/mistral-nemo',            // $0.30/M
        'groq/llama-3.1-70b-versatile'      // Fast and cheap
      ],
      costPerMToken: 0.30,
      specialties: ['coding', 'general', 'fast-generation'],
      availability: 'paid',
      maxTokens: 131072,
      qualityScore: 8.0
    },

    // PREMIUM - Highest quality for complex tasks
    {
      name: 'premium-quality',
      models: [
        'anthropic/claude-3.5-sonnet',       // $3.00/M - Best reasoning
        'openai/gpt-4o',                     // $2.50/M - Reliable
        'google/gemini-2.0-pro',             // $1.25/M - Good balance
        'mistralai/mistral-large'            // $2.00/M - European option
      ],
      costPerMToken: 2.50,
      specialties: ['complex-reasoning', 'blockchain', 'security', 'architecture'],
      availability: 'paid',
      maxTokens: 200000,
      qualityScore: 9.5
    }
  ];

  private constructor() {
    this.loadDailyUsage();
  }

  public static getInstance(): CostEfficientRouter {
    if (!CostEfficientRouter.instance) {
      CostEfficientRouter.instance = new CostEfficientRouter();
    }
    return CostEfficientRouter.instance;
  }

  /**
   * Main routing logic - selects the most cost-efficient model
   */
  async selectOptimalModel(
    context: TaskContext, 
    config: CostOptimizationConfig = this.getDefaultConfig()
  ): Promise<{
    model: string;
    tier: string;
    estimatedCost: number;
    reasoning: string;
  }> {
    const tokenEstimate = context.tokenEstimate || this.estimateTokens(context);
    
    // 1. BUDGET CHECK - Ensure we don't exceed daily limits
    if (config.budgetMode && this.dailyCost >= config.maxDailyCost) {
      return this.selectFreeOnlyModel(context, tokenEstimate);
    }

    // 2. TASK COMPLEXITY ANALYSIS
    const requiredQuality = this.getRequiredQuality(context);
    
    // 3. COST-EFFICIENT TIER SELECTION
    for (const tier of this.modelTiers) {
      // Skip paid models if budget mode and prefer free
      if (config.budgetMode && tier.availability === 'paid') {
        continue;
      }

      // Quality threshold check
      if (tier.qualityScore < requiredQuality && context.priority !== 'cost') {
        continue;
      }

      // Specialty matching
      if (this.isSpecialtyMatch(tier, context)) {
        const model = this.selectBestModelFromTier(tier, context);
        const estimatedCost = this.calculateCost(tokenEstimate, tier.costPerMToken);
        
        // Final budget check
        if (this.dailyCost + estimatedCost <= config.maxDailyCost) {
          return {
            model,
            tier: tier.name,
            estimatedCost,
            reasoning: this.generateReasoningExplanation(tier, context, estimatedCost)
          };
        }
      }
    }

    // 4. FALLBACK - Always return a free model if nothing else works
    return this.selectFreeOnlyModel(context, tokenEstimate);
  }

  /**
   * Smart model selection within a tier based on task specifics
   */
  private selectBestModelFromTier(tier: ModelTier, context: TaskContext): string {
    // Task-specific model preferences
    const taskModelPreferences = {
      'blockchain': ['deepseek/deepseek-r1', 'anthropic/claude-3.5-sonnet'],
      'web': ['qwen/qwen-2.5-coder-32b-instruct', 'meta-llama/llama-3.1-70b-instruct'],
      'mobile': ['qwen/qwen-2.5-coder-32b-instruct', 'google/gemini-2.0-flash-exp'],
      'backend': ['deepseek/deepseek-r1', 'meta-llama/llama-3.1-70b-instruct'],
      'security': ['anthropic/claude-3.5-sonnet', 'deepseek/deepseek-r1'],
      'devops': ['meta-llama/llama-3.1-70b-instruct', 'google/gemini-2.0-flash-exp'],
      'general': ['google/gemini-2.0-flash-exp', 'meta-llama/llama-3.1-8b-instruct']
    };

    const preferredModels = taskModelPreferences[context.type] || [];
    
    // Find first available preferred model in this tier
    for (const preferredModel of preferredModels) {
      if (tier.models.includes(preferredModel)) {
        return preferredModel;
      }
    }

    // Fallback to first model in tier
    return tier.models[0];
  }

  /**
   * Force selection of free-only models
   */
  private selectFreeOnlyModel(context: TaskContext, tokenEstimate: number): {
    model: string;
    tier: string;
    estimatedCost: number;
    reasoning: string;
  } {
    // Prioritize Ollama local if available
    const ollamaTier = this.modelTiers.find(t => t.name === 'ollama-local');
    if (ollamaTier && this.isOllamaAvailable()) {
      return {
        model: this.selectBestModelFromTier(ollamaTier, context),
        tier: 'ollama-local',
        estimatedCost: 0,
        reasoning: 'Selected free local Ollama model to stay within budget constraints.'
      };
    }

    // Fallback to free cloud models
    const freeTier = this.modelTiers.find(t => t.name === 'free-cloud');
    if (freeTier) {
      return {
        model: this.selectBestModelFromTier(freeTier, context),
        tier: 'free-cloud',
        estimatedCost: 0,
        reasoning: 'Selected free cloud model due to budget constraints or cost optimization preference.'
      };
    }

    // Emergency fallback
    return {
      model: 'meta-llama/llama-3.1-8b-instruct',
      tier: 'emergency-fallback',
      estimatedCost: 0,
      reasoning: 'Emergency fallback to prevent service interruption.'
    };
  }

  /**
   * Calculate required quality score based on task context
   */
  private getRequiredQuality(context: TaskContext): number {
    let baseQuality = 7.0;

    // Complexity factor
    switch (context.complexity) {
      case 'simple': baseQuality = 6.0; break;
      case 'medium': baseQuality = 7.5; break;
      case 'complex': baseQuality = 8.5; break;
    }

    // Task type factor
    const highQualityTasks = ['blockchain', 'security', 'complex-reasoning'];
    if (highQualityTasks.includes(context.type)) {
      baseQuality += 1.0;
    }

    // Priority factor
    if (context.priority === 'quality') {
      baseQuality += 0.5;
    }

    return Math.min(baseQuality, 10.0);
  }

  /**
   * Check if tier specialties match task requirements
   */
  private isSpecialtyMatch(tier: ModelTier, context: TaskContext): boolean {
    // General models can handle any task
    if (tier.specialties.includes('general')) {
      return true;
    }

    // Check for specific specialty matches
    const taskSpecialtyMap = {
      'blockchain': ['reasoning', 'complex-reasoning'],
      'web': ['coding', 'fast-generation'],
      'mobile': ['coding'],
      'backend': ['coding', 'reasoning'],
      'security': ['reasoning', 'complex-reasoning'],
      'devops': ['coding', 'general'],
      'general': ['general', 'coding']
    };

    const requiredSpecialties = taskSpecialtyMap[context.type] || ['general'];
    return requiredSpecialties.some(specialty => tier.specialties.includes(specialty));
  }

  /**
   * Estimate token usage based on task context
   */
  private estimateTokens(context: TaskContext): number {
    let baseEstimate = 1000;

    // Complexity factor
    switch (context.complexity) {
      case 'simple': baseEstimate = 500; break;
      case 'medium': baseEstimate = 1500; break;
      case 'complex': baseEstimate = 3000; break;
    }

    // Task type factor
    const highTokenTasks = ['blockchain', 'backend', 'security'];
    if (highTokenTasks.includes(context.type)) {
      baseEstimate *= 1.5;
    }

    return Math.round(baseEstimate);
  }

  /**
   * Calculate estimated cost
   */
  private calculateCost(tokens: number, costPerMToken: number): number {
    return (tokens / 1000000) * costPerMToken;
  }

  /**
   * Generate human-readable reasoning for model selection
   */
  private generateReasoningExplanation(tier: ModelTier, context: TaskContext, cost: number): string {
    const reasons = [];

    if (tier.availability === 'free') {
      reasons.push('free model selected for zero cost');
    } else {
      reasons.push(`cost-optimized selection ($${cost.toFixed(4)} estimated)`);
    }

    if (this.isSpecialtyMatch(tier, context)) {
      reasons.push(`specialized for ${context.type} tasks`);
    }

    if (context.priority === 'cost') {
      reasons.push('prioritizing cost efficiency');
    } else if (context.priority === 'quality') {
      reasons.push('prioritizing output quality');
    } else {
      reasons.push('balanced speed and quality');
    }

    return reasons.join(', ');
  }

  /**
   * Track usage and costs
   */
  async trackUsage(model: string, actualCost: number, tokens: { input: number, output: number }): Promise<void> {
    this.dailyCost += actualCost;
    this.requestCount++;

    const stats = this.modelUsageStats.get(model) || { count: 0, totalCost: 0 };
    stats.count++;
    stats.totalCost += actualCost;
    this.modelUsageStats.set(model, stats);

    Logger.info(`💰 Cost tracking: $${actualCost.toFixed(4)} (daily: $${this.dailyCost.toFixed(2)}, requests: ${this.requestCount})`);
    
    this.saveDailyUsage();
  }

  /**
   * Get cost optimization recommendations
   */
  getCostOptimizationRecommendations(): {
    totalSavings: number;
    recommendations: string[];
    freeModelUsage: number;
  } {
    const recommendations = [];
    let potentialSavings = 0;
    
    const freeUsage = Array.from(this.modelUsageStats.entries())
      .filter(([model]) => this.isFreeModel(model))
      .reduce((sum, [, stats]) => sum + stats.count, 0);
    
    const freeUsagePercent = (freeUsage / this.requestCount) * 100;

    if (freeUsagePercent < 70) {
      recommendations.push(`Increase free model usage from ${freeUsagePercent.toFixed(1)}% to 70%+ for maximum savings`);
      potentialSavings += this.dailyCost * 0.3;
    }

    if (this.dailyCost > 5.00) {
      recommendations.push('Consider enabling budget mode to cap daily spending');
    }

    const expensiveModels = Array.from(this.modelUsageStats.entries())
      .filter(([, stats]) => stats.totalCost / stats.count > 0.01)
      .sort((a, b) => b[1].totalCost - a[1].totalCost);

    if (expensiveModels.length > 0) {
      recommendations.push(`Review usage of expensive models: ${expensiveModels.slice(0, 3).map(([model]) => model).join(', ')}`);
    }

    return {
      totalSavings: potentialSavings,
      recommendations,
      freeModelUsage: freeUsagePercent
    };
  }

  /**
   * Default cost optimization configuration
   */
  private getDefaultConfig(): CostOptimizationConfig {
    return {
      maxDailyCost: parseFloat(process.env.RECODER_MAX_DAILY_COST || '10.00'),
      preferFreeModels: process.env.RECODER_PREFER_FREE_MODELS !== 'false',
      allowFallbacks: process.env.RECODER_ALLOW_FALLBACKS !== 'false',
      qualityThreshold: parseFloat(process.env.RECODER_QUALITY_THRESHOLD || '7.5'),
      budgetMode: process.env.RECODER_BUDGET_MODE === 'true'
    };
  }

  /**
   * Check if Ollama is available locally
   */
  private isOllamaAvailable(): boolean {
    // This would check if Ollama service is running
    // For now, return based on environment variable
    return process.env.OLLAMA_BASE_URL !== undefined;
  }

  /**
   * Check if model is free
   */
  private isFreeModel(model: string): boolean {
    return this.modelTiers
      .filter(tier => tier.availability === 'free' || tier.availability === 'free-tier')
      .some(tier => tier.models.includes(model));
  }

  /**
   * Persistence methods for daily usage tracking
   */
  private loadDailyUsage(): void {
    try {
      const today = new Date().toDateString();
      const stored = process.env.RECODER_DAILY_USAGE;
      if (stored) {
        const data = JSON.parse(stored);
        if (data.date === today) {
          this.dailyCost = data.cost || 0;
          this.requestCount = data.requests || 0;
        }
      }
    } catch (error) {
      Logger.warn('Failed to load daily usage data', '');
    }
  }

  private saveDailyUsage(): void {
    try {
      const today = new Date().toDateString();
      const data = {
        date: today,
        cost: this.dailyCost,
        requests: this.requestCount
      };
      // In a real implementation, this would be saved to a persistent store
      process.env.RECODER_DAILY_USAGE = JSON.stringify(data);
    } catch (error) {
      Logger.warn('Failed to save daily usage data', '');
    }
  }

  /**
   * Reset daily counters (called at midnight)
   */
  resetDailyCounters(): void {
    this.dailyCost = 0;
    this.requestCount = 0;
    this.modelUsageStats.clear();
    Logger.info('🔄 Daily cost counters reset');
  }

  /**
   * Get current usage statistics
   */
  getUsageStats(): {
    dailyCost: number;
    requestCount: number;
    averageCostPerRequest: number;
    modelBreakdown: Array<{ model: string; usage: number; cost: number }>;
  } {
    const modelBreakdown = Array.from(this.modelUsageStats.entries())
      .map(([model, stats]) => ({
        model,
        usage: stats.count,
        cost: stats.totalCost
      }))
      .sort((a, b) => b.usage - a.usage);

    return {
      dailyCost: this.dailyCost,
      requestCount: this.requestCount,
      averageCostPerRequest: this.requestCount > 0 ? this.dailyCost / this.requestCount : 0,
      modelBreakdown
    };
  }
}

// Export singleton instance
export const costEfficientRouter = CostEfficientRouter.getInstance();