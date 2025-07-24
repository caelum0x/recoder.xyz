/**
 * Intelligent AI Router for Recoder.xyz
 * 
 * Routes requests to optimal AI providers based on task analysis, performance, cost, and availability
 */

import { EventEmitter } from 'events';
import { providerRegistry, AIModelPerformance } from './enhanced-provider-registry';

export interface RoutingRequest {
  id: string;
  task: {
    type: 'code-generation' | 'security-audit' | 'ui-components' | 'analysis' | 'debugging' | 'documentation';
    complexity: 'simple' | 'moderate' | 'complex' | 'enterprise';
    language?: string;
    framework?: string;
    domain?: string;
  };
  context: {
    project?: string;
    existingCode?: string;
    requirements?: string[];
    constraints?: string[];
  };
  preferences: {
    priority: 'quality' | 'speed' | 'cost' | 'balanced';
    maxCost?: number;
    maxResponseTime?: number;
    requiresStreaming?: boolean;
    requiresImages?: boolean;
  };
  user: {
    id: string;
    tier: 'free' | 'pro' | 'enterprise';
    usage: {
      tokensUsedToday: number;
      requestsToday: number;
      monthlyBudget?: number;
    };
  };
}

export interface RoutingResult {
  selectedModel: AIModelPerformance;
  fallbackModels: AIModelPerformance[];
  reasoning: string;
  estimatedCost: number;
  estimatedResponseTime: number;
  confidence: number;
  routingStrategy: string;
}

export interface RoutingMetrics {
  totalRequests: number;
  successfulRoutes: number;
  averageResponseTime: number;
  totalCost: number;
  modelUsageStats: Map<string, number>;
  fallbackRate: number;
}

export class IntelligentRouter extends EventEmitter {
  private static instance: IntelligentRouter;
  private routingHistory: Map<string, RoutingResult[]> = new Map();
  private performanceMetrics: Map<string, number[]> = new Map();
  private costTracking: Map<string, number> = new Map();
  private routingStrategies: Map<string, RoutingStrategy> = new Map();

  private constructor() {
    super();
    this.initializeRoutingStrategies();
  }

  static getInstance(): IntelligentRouter {
    if (!IntelligentRouter.instance) {
      IntelligentRouter.instance = new IntelligentRouter();
    }
    return IntelligentRouter.instance;
  }

  /**
   * Route request to optimal AI model
   */
  async routeRequest(request: RoutingRequest): Promise<RoutingResult> {
    try {
      // Analyze task requirements
      const taskAnalysis = this.analyzeTask(request);
      
      // Get candidate models
      const candidates = await this.getCandidateModels(request, taskAnalysis);
      
      // Select optimal model using strategy
      const routingStrategy = this.selectRoutingStrategy(request);
      const selectedModel = await routingStrategy.selectModel(candidates, request);
      
      // Generate fallback options
      const fallbackModels = await this.generateFallbackOptions(selectedModel, candidates);
      
      // Calculate estimates
      const estimatedCost = this.estimateCost(selectedModel, request);
      const estimatedResponseTime = this.estimateResponseTime(selectedModel, request);
      
      // Build result
      const result: RoutingResult = {
        selectedModel,
        fallbackModels,
        reasoning: this.generateReasoning(selectedModel, request, taskAnalysis),
        estimatedCost,
        estimatedResponseTime,
        confidence: this.calculateConfidence(selectedModel, request),
        routingStrategy: routingStrategy.name
      };

      // Track routing decision
      this.trackRoutingDecision(request, result);
      
      // Emit routing event
      this.emit('request:routed', { request, result });
      
      return result;
      
    } catch (error) {
      this.emit('routing:error', { request, error });
      throw new Error(`Routing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze task to determine requirements
   */
  private analyzeTask(request: RoutingRequest): TaskAnalysis {
    const { task, context, preferences } = request;
    
    const analysis: TaskAnalysis = {
      complexity: this.assessComplexity(task, context),
      tokenEstimate: this.estimateTokens(task, context),
      specialRequirements: this.identifySpecialRequirements(task, context),
      urgency: this.assessUrgency(preferences),
      riskLevel: this.assessRiskLevel(task, context)
    };

    // Domain-specific analysis
    if (task.type === 'security-audit') {
      analysis.specialRequirements.push('security-expertise', 'vulnerability-detection');
      analysis.riskLevel = 'high';
    }

    if (task.complexity === 'enterprise') {
      analysis.specialRequirements.push('high-reliability', 'detailed-documentation');
    }

    if (task.language === 'solidity' || task.domain === 'blockchain') {
      analysis.specialRequirements.push('blockchain-knowledge', 'smart-contracts');
    }

    return analysis;
  }

  /**
   * Get candidate models based on requirements
   */
  private async getCandidateModels(
    request: RoutingRequest, 
    analysis: TaskAnalysis
  ): Promise<AIModelPerformance[]> {
    const allModels = Array.from(providerRegistry.getAllModels().values()).flat();
    
    const candidates = [];
    
    for (const model of allModels) {
      // Check user tier restrictions
      if (!this.checkUserTierAccess(model, request.user.tier)) continue;
      
      // Check budget constraints
      if (request.preferences.maxCost && model.costPerToken > request.preferences.maxCost) continue;
      
      // Check response time requirements
      if (request.preferences.maxResponseTime && model.averageResponseTime > request.preferences.maxResponseTime) continue;
      
      // Check capability requirements
      if (request.preferences.requiresStreaming && !model.supportsStreaming) continue;
      if (request.preferences.requiresImages && !model.supportsImages) continue;
      
      // Check token requirements
      if (analysis.tokenEstimate > model.maxTokens) continue;
      
      // Check availability
      const availability = await providerRegistry.getModelAvailability(model.modelId);
      if (!availability.available) continue;
      
      // Check specialty match
      const specialtyMatch = this.calculateSpecialtyMatch(model, analysis.specialRequirements);
      if (specialtyMatch < 0.3) continue; // Minimum specialty match threshold
      
      candidates.push(model);
    }

    return candidates.sort((a, b) => b.qualityScore - a.qualityScore);
  }

  /**
   * Initialize routing strategies
   */
  private initializeRoutingStrategies(): void {
    // Quality-first strategy
    this.routingStrategies.set('quality-first', {
      name: 'quality-first',
      selectModel: async (candidates, request) => {
        return candidates
          .filter(m => m.tier === 'flagship' || m.tier === 'premium')
          .sort((a, b) => b.qualityScore - a.qualityScore)[0] || candidates[0];
      }
    });

    // Speed-first strategy
    this.routingStrategies.set('speed-first', {
      name: 'speed-first',
      selectModel: async (candidates, request) => {
        return candidates
          .sort((a, b) => a.averageResponseTime - b.averageResponseTime)[0];
      }
    });

    // Cost-optimized strategy
    this.routingStrategies.set('cost-optimized', {
      name: 'cost-optimized',
      selectModel: async (candidates, request) => {
        return candidates
          .filter(m => m.tier !== 'flagship')
          .sort((a, b) => a.costPerToken - b.costPerToken)[0] || candidates[0];
      }
    });

    // Balanced strategy
    this.routingStrategies.set('balanced', {
      name: 'balanced',
      selectModel: async (candidates, request) => {
        const scored = candidates.map(model => ({
          model,
          score: this.calculateBalancedScore(model, request)
        }));
        
        scored.sort((a, b) => b.score - a.score);
        return scored[0]?.model || candidates[0];
      }
    });

    // Task-specific strategy
    this.routingStrategies.set('task-specific', {
      name: 'task-specific',
      selectModel: async (candidates, request) => {
        const taskOptimal = this.getTaskOptimalModel(candidates, request.task.type);
        return taskOptimal || candidates[0];
      }
    });

    // Adaptive strategy (learns from history)
    this.routingStrategies.set('adaptive', {
      name: 'adaptive',
      selectModel: async (candidates, request) => {
        const historicalPerformance = this.getHistoricalPerformance(candidates, request);
        return historicalPerformance.bestPerformer || candidates[0];
      }
    });
  }

  /**
   * Select routing strategy based on request characteristics
   */
  private selectRoutingStrategy(request: RoutingRequest): RoutingStrategy {
    const { task, preferences, user } = request;

    // Enterprise users get adaptive strategy
    if (user.tier === 'enterprise') {
      return this.routingStrategies.get('adaptive')!;
    }

    // Security tasks always use quality-first
    if (task.type === 'security-audit' || task.complexity === 'enterprise') {
      return this.routingStrategies.get('quality-first')!;
    }

    // Match strategy to preference
    switch (preferences.priority) {
      case 'quality':
        return this.routingStrategies.get('quality-first')!;
      case 'speed':
        return this.routingStrategies.get('speed-first')!;
      case 'cost':
        return this.routingStrategies.get('cost-optimized')!;
      case 'balanced':
      default:
        return this.routingStrategies.get('balanced')!;
    }
  }

  /**
   * Generate fallback options
   */
  private async generateFallbackOptions(
    selectedModel: AIModelPerformance,
    candidates: AIModelPerformance[]
  ): Promise<AIModelPerformance[]> {
    return candidates
      .filter(model => model.modelId !== selectedModel.modelId)
      .slice(0, 3); // Top 3 alternatives
  }

  /**
   * Calculate balanced score for model selection
   */
  private calculateBalancedScore(model: AIModelPerformance, request: RoutingRequest): number {
    const qualityWeight = 0.4;
    const speedWeight = 0.3;
    const costWeight = 0.2;
    const specialtyWeight = 0.1;

    const qualityScore = model.qualityScore;
    const speedScore = 1 - (model.averageResponseTime / 5000); // Normalize to 0-1
    const costScore = 1 - (model.costPerToken / 0.1); // Normalize to 0-1
    const specialtyScore = this.calculateSpecialtyMatch(model, this.identifySpecialRequirements(request.task, request.context));

    return (qualityScore * qualityWeight) +
           (Math.max(0, speedScore) * speedWeight) +
           (Math.max(0, costScore) * costWeight) +
           (specialtyScore * specialtyWeight);
  }

  /**
   * Calculate specialty match score
   */
  private calculateSpecialtyMatch(model: AIModelPerformance, requirements: string[]): number {
    if (requirements.length === 0) return 0.5; // Neutral score

    const matches = requirements.filter(req => 
      model.specialties.some(specialty => 
        specialty.includes(req) || req.includes(specialty)
      )
    ).length;

    return matches / requirements.length;
  }

  /**
   * Get task-optimal model
   */
  private getTaskOptimalModel(candidates: AIModelPerformance[], taskType: string): AIModelPerformance | null {
    const taskModelMap: { [key: string]: string[] } = {
      'security-audit': ['claude-sonnet-4', 'claude-opus-4'],
      'ui-components': ['gemini-2.5-flash', 'gemini-2.0-flash'],
      'code-generation': ['claude-sonnet-4', 'deepseek-v3', 'qwen-coder-32b'],
      'analysis': ['gemini-2.5-pro', 'claude-opus-4'],
      'debugging': ['claude-sonnet-4', 'deepseek-v3'],
      'documentation': ['gemini-2.5-pro', 'claude-3.7-sonnet']
    };

    const preferredModels = taskModelMap[taskType] || [];
    
    for (const preferredModelId of preferredModels) {
      const model = candidates.find(c => c.modelId === preferredModelId);
      if (model) return model;
    }

    return null;
  }

  /**
   * Track routing decision for learning
   */
  private trackRoutingDecision(request: RoutingRequest, result: RoutingResult): void {
    const key = `${request.user.id}:${request.task.type}`;
    
    if (!this.routingHistory.has(key)) {
      this.routingHistory.set(key, []);
    }
    
    this.routingHistory.get(key)!.push(result);
    
    // Keep only last 100 decisions per user/task combination
    const history = this.routingHistory.get(key)!;
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  /**
   * Get historical performance data
   */
  private getHistoricalPerformance(candidates: AIModelPerformance[], request: RoutingRequest): {
    bestPerformer: AIModelPerformance | null;
    averageScores: Map<string, number>;
  } {
    const key = `${request.user.id}:${request.task.type}`;
    const history = this.routingHistory.get(key) || [];

    const scores = new Map<string, number[]>();
    
    // Calculate average performance scores from history
    for (const result of history) {
      const modelId = result.selectedModel.modelId;
      if (!scores.has(modelId)) {
        scores.set(modelId, []);
      }
      scores.get(modelId)!.push(result.confidence);
    }

    const averageScores = new Map<string, number>();
    let bestScore = 0;
    let bestPerformer: AIModelPerformance | null = null;

    for (const [modelId, scoreList] of scores) {
      const average = scoreList.reduce((a, b) => a + b, 0) / scoreList.length;
      averageScores.set(modelId, average);
      
      if (average > bestScore) {
        bestScore = average;
        bestPerformer = candidates.find(c => c.modelId === modelId) || null;
      }
    }

    return { bestPerformer, averageScores };
  }

  // Helper methods
  private checkUserTierAccess(model: AIModelPerformance, userTier: string): boolean {
    if (userTier === 'enterprise') return true;
    if (userTier === 'pro' && model.tier !== 'flagship') return true;
    if (userTier === 'free' && (model.tier === 'free' || model.tier === 'efficient')) return true;
    return false;
  }

  private assessComplexity(task: any, context: any): 'simple' | 'moderate' | 'complex' | 'enterprise' {
    if (task.complexity) return task.complexity;
    
    let complexity = 0;
    
    if (context.existingCode && context.existingCode.length > 10000) complexity += 2;
    if (context.requirements && context.requirements.length > 5) complexity += 1;
    if (task.type === 'security-audit') complexity += 2;
    if (task.domain === 'blockchain' || task.domain === 'enterprise') complexity += 1;
    
    if (complexity >= 4) return 'enterprise';
    if (complexity >= 3) return 'complex';
    if (complexity >= 1) return 'moderate';
    return 'simple';
  }

  private estimateTokens(task: any, context: any): number {
    let tokens = 1000; // Base estimate
    
    if (context.existingCode) tokens += Math.floor(context.existingCode.length / 4);
    if (context.requirements) tokens += context.requirements.length * 50;
    if (task.complexity === 'enterprise') tokens *= 2;
    
    return Math.min(tokens, 200000); // Cap at 200k tokens
  }

  private identifySpecialRequirements(task: any, context: any): string[] {
    const requirements: string[] = [];
    
    if (task.type === 'security-audit') requirements.push('security', 'vulnerability-detection');
    if (task.type === 'ui-components') requirements.push('frontend', 'rapid-prototyping');
    if (task.language === 'solidity') requirements.push('blockchain', 'smart-contracts');
    if (task.framework === 'react') requirements.push('ui-components', 'frontend');
    if (task.domain === 'fintech') requirements.push('security', 'compliance');
    
    return requirements;
  }

  private assessUrgency(preferences: any): 'low' | 'medium' | 'high' {
    if (preferences.maxResponseTime && preferences.maxResponseTime < 1000) return 'high';
    if (preferences.priority === 'speed') return 'high';
    return 'medium';
  }

  private assessRiskLevel(task: any, context: any): 'low' | 'medium' | 'high' {
    if (task.type === 'security-audit') return 'high';
    if (task.complexity === 'enterprise') return 'high';
    if (task.domain === 'fintech' || task.domain === 'healthcare') return 'high';
    return 'medium';
  }

  private estimateCost(model: AIModelPerformance, request: RoutingRequest): number {
    const tokenEstimate = this.estimateTokens(request.task, request.context);
    return tokenEstimate * model.costPerToken;
  }

  private estimateResponseTime(model: AIModelPerformance, request: RoutingRequest): number {
    const baseTime = model.averageResponseTime;
    const complexity = request.task.complexity;
    
    const multipliers = {
      'simple': 0.8,
      'moderate': 1.0,
      'complex': 1.5,
      'enterprise': 2.0
    };
    
    return baseTime * (multipliers[complexity] || 1.0);
  }

  private calculateConfidence(model: AIModelPerformance, request: RoutingRequest): number {
    let confidence = model.qualityScore;
    
    // Boost confidence for specialty matches
    const specialtyMatch = this.calculateSpecialtyMatch(
      model, 
      this.identifySpecialRequirements(request.task, request.context)
    );
    
    confidence += specialtyMatch * 0.1;
    
    // Reduce confidence for mismatched user tier
    if (!this.checkUserTierAccess(model, request.user.tier)) {
      confidence *= 0.5;
    }
    
    return Math.min(1.0, confidence);
  }

  private generateReasoning(
    model: AIModelPerformance, 
    request: RoutingRequest, 
    analysis: TaskAnalysis
  ): string {
    const reasons = [];
    
    reasons.push(`Selected ${model.displayName} for ${request.task.type} task`);
    
    if (model.specialties.some(s => analysis.specialRequirements.includes(s))) {
      reasons.push(`Model specializes in required areas: ${model.specialties.join(', ')}`);
    }
    
    if (request.preferences.priority === 'quality' && model.tier === 'flagship') {
      reasons.push('Flagship model chosen for quality priority');
    }
    
    if (request.preferences.priority === 'speed' && model.averageResponseTime < 1000) {
      reasons.push('Fast response time matches speed priority');
    }
    
    if (request.preferences.priority === 'cost' && model.costPerToken < 0.001) {
      reasons.push('Low cost model selected for budget optimization');
    }
    
    return reasons.join('. ');
  }
}

// Interfaces
interface TaskAnalysis {
  complexity: 'simple' | 'moderate' | 'complex' | 'enterprise';
  tokenEstimate: number;
  specialRequirements: string[];
  urgency: 'low' | 'medium' | 'high';
  riskLevel: 'low' | 'medium' | 'high';
}

interface RoutingStrategy {
  name: string;
  selectModel: (candidates: AIModelPerformance[], request: RoutingRequest) => Promise<AIModelPerformance>;
}

// Export singleton instance
export const intelligentRouter = IntelligentRouter.getInstance();

export default IntelligentRouter;