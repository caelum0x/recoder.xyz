/**
 * AI Model Performance Rankings
 * Based on latest benchmarks and token capacity
 */

export interface ModelRanking {
  name: string;
  provider: string;
  tokenCapacity: string; // e.g., "594B"
  performanceImprovement: number; // percentage
  isFree: boolean;
  isNew: boolean;
  specialties: string[];
  costEfficiency: number; // 1-10 scale
  codingScore: number; // 1-10 scale for coding tasks
}

export const MODEL_RANKINGS: ModelRanking[] = [
  {
    name: 'claude-sonnet-4',
    provider: 'claude',
    tokenCapacity: '594B',
    performanceImprovement: 28,
    isFree: false,
    isNew: true,
    specialties: ['reasoning', 'complex-logic', 'architecture', 'security'],
    costEfficiency: 7,
    codingScore: 10
  },
  {
    name: 'gemini-2.5-flash',
    provider: 'gemini',
    tokenCapacity: '308B',
    performanceImprovement: 17,
    isFree: true, // Has free tier
    isNew: true,
    specialties: ['multimodal', 'fast-generation', 'analysis'],
    costEfficiency: 9,
    codingScore: 8
  },
  {
    name: 'gemini-2.0-flash',
    provider: 'gemini',
    tokenCapacity: '268B',
    performanceImprovement: 2,
    isFree: true,
    isNew: true,
    specialties: ['multimodal', 'real-time', 'web-search'],
    costEfficiency: 9,
    codingScore: 7
  },
  {
    name: 'deepseek-v3-0324',
    provider: 'deepseek',
    tokenCapacity: '213B',
    performanceImprovement: 7,
    isFree: true,
    isNew: true,
    specialties: ['code-generation', 'reasoning', 'cost-effective'],
    costEfficiency: 10,
    codingScore: 9
  },
  {
    name: 'gemini-2.5-pro',
    provider: 'gemini',
    tokenCapacity: '175B',
    performanceImprovement: 5,
    isFree: false,
    isNew: true,
    specialties: ['complex-tasks', 'long-context', 'analysis'],
    costEfficiency: 6,
    codingScore: 8
  },
  {
    name: 'claude-3.7-sonnet',
    provider: 'claude',
    tokenCapacity: '103B',
    performanceImprovement: 37,
    isFree: false,
    isNew: true,
    specialties: ['reasoning', 'writing', 'analysis'],
    costEfficiency: 6,
    codingScore: 9
  },
  {
    name: 'qwen3-coder',
    provider: 'qwen',
    tokenCapacity: '89.9B',
    performanceImprovement: 0, // New model
    isFree: true,
    isNew: true,
    specialties: ['code-generation', 'debugging', 'optimization'],
    costEfficiency: 10,
    codingScore: 10
  },
  {
    name: 'deepseek-r1-0528',
    provider: 'deepseek',
    tokenCapacity: '74.5B',
    performanceImprovement: 13,
    isFree: true,
    isNew: true,
    specialties: ['reasoning', 'step-by-step', 'problem-solving'],
    costEfficiency: 10,
    codingScore: 8
  },
  {
    name: 'kimi-k2',
    provider: 'kimi',
    tokenCapacity: '45.1B',
    performanceImprovement: 17,
    isFree: false,
    isNew: true,
    specialties: ['analysis', 'long-context', 'chinese-language'],
    costEfficiency: 7,
    codingScore: 7
  },
  {
    name: 'qwen3-235b-instruct',
    provider: 'qwen',
    tokenCapacity: '35.2B',
    performanceImprovement: 11988, // Massive improvement!
    isFree: true,
    isNew: true,
    specialties: ['instruction-following', 'code-generation', 'efficiency'],
    costEfficiency: 10,
    codingScore: 9
  }
];

export class IntelligentModelSelector {
  private rankings: ModelRanking[];

  constructor() {
    this.rankings = MODEL_RANKINGS;
  }

  /**
   * Get best model for a specific task type
   */
  getBestModelForTask(
    taskType: 'coding' | 'reasoning' | 'analysis' | 'general',
    preferences: {
      prioritizePerformance?: boolean;
      prioritizeCost?: boolean;
      preferFreeModels?: boolean;
      useLatestModels?: boolean;
    } = {}
  ): ModelRanking[] {
    let candidates = [...this.rankings];

    // Filter by free models if preferred
    if (preferences.preferFreeModels) {
      candidates = candidates.filter(model => model.isFree);
    }

    // Filter by new models if preferred
    if (preferences.useLatestModels) {
      candidates = candidates.filter(model => model.isNew);
    }

    // Score and sort based on task type and preferences
    const scoredCandidates = candidates.map(model => ({
      ...model,
      score: this.calculateScore(model, taskType, preferences)
    }));

    return scoredCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 5); // Return top 5
  }

  /**
   * Calculate score for a model based on task and preferences
   */
  private calculateScore(
    model: ModelRanking,
    taskType: 'coding' | 'reasoning' | 'analysis' | 'general',
    preferences: any
  ): number {
    let score = 0;

    // Base score from coding ability for coding tasks
    if (taskType === 'coding') {
      score += model.codingScore * 10;
    }

    // Performance improvement bonus
    score += model.performanceImprovement * 0.1;

    // Cost efficiency bonus
    if (preferences.prioritizeCost) {
      score += model.costEfficiency * 5;
    }

    // Performance bonus
    if (preferences.prioritizePerformance) {
      score += parseInt(model.tokenCapacity) * 0.001;
    }

    // Free model bonus
    if (model.isFree && preferences.preferFreeModels) {
      score += 20;
    }

    // New model bonus
    if (model.isNew && preferences.useLatestModels) {
      score += 15;
    }

    // Specialty matching bonus
    const taskSpecialties = {
      coding: ['code-generation', 'debugging', 'optimization'],
      reasoning: ['reasoning', 'step-by-step', 'problem-solving', 'complex-logic'],
      analysis: ['analysis', 'multimodal', 'long-context'],
      general: ['instruction-following', 'efficiency', 'fast-generation']
    };

    const relevantSpecialties = taskSpecialties[taskType] || [];
    const specialtyMatches = model.specialties.filter(s => 
      relevantSpecialties.includes(s)
    ).length;
    
    score += specialtyMatches * 8;

    return score;
  }

  /**
   * Get recommended provider configuration
   */
  getRecommendedConfig(preferences: any = {}): any {
    const codingModels = this.getBestModelForTask('coding', preferences);
    const reasoningModels = this.getBestModelForTask('reasoning', preferences);
    
    return {
      primary: codingModels[0],
      fallbacks: codingModels.slice(1, 3),
      reasoning: reasoningModels[0],
      freeOptions: this.rankings.filter(m => m.isFree).slice(0, 3),
      newModels: this.rankings.filter(m => m.isNew).slice(0, 5)
    };
  }

  /**
   * Get cost-optimized model selection
   */
  getCostOptimizedModels(): ModelRanking[] {
    return this.rankings
      .filter(model => model.isFree || model.costEfficiency >= 8)
      .sort((a, b) => b.costEfficiency - a.costEfficiency)
      .slice(0, 5);
  }

  /**
   * Get performance-optimized model selection
   */
  getPerformanceOptimizedModels(): ModelRanking[] {
    return this.rankings
      .sort((a, b) => {
        const aTokens = parseInt(a.tokenCapacity);
        const bTokens = parseInt(b.tokenCapacity);
        return bTokens - aTokens;
      })
      .slice(0, 5);
  }

  /**
   * Get free models for API key-less usage
   */
  getFreeModels(): ModelRanking[] {
    return this.rankings
      .filter(model => model.isFree)
      .sort((a, b) => b.codingScore - a.codingScore);
  }

  /**
   * Get provider diversity recommendations
   */
  getProviderDiversity(): { [provider: string]: ModelRanking[] } {
    const providerModels: { [provider: string]: ModelRanking[] } = {};
    
    for (const model of this.rankings) {
      if (!providerModels[model.provider]) {
        providerModels[model.provider] = [];
      }
      providerModels[model.provider].push(model);
    }

    // Sort models within each provider by score
    for (const provider in providerModels) {
      providerModels[provider].sort((a, b) => b.codingScore - a.codingScore);
    }

    return providerModels;
  }
}

// Export singleton instance
export const modelSelector = new IntelligentModelSelector();
export default modelSelector;