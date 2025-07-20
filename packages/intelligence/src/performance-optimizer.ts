/**
 * Performance Optimizer
 * Intelligent model selection and performance optimization for AI operations
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';
import { Logger } from '@recoder/shared';
import { v4 as uuidv4 } from 'uuid';
import * as statistics from 'simple-statistics';

export interface ModelCapabilities {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'aws' | 'local' | 'custom';
  type: 'chat' | 'completion' | 'embedding' | 'image' | 'audio' | 'multimodal';
  context_length: number;
  max_tokens: number;
  supports_streaming: boolean;
  supports_function_calling: boolean;
  supports_vision: boolean;
  supports_code: boolean;
  languages: string[];
  specializations: ModelSpecialization[];
  pricing: ModelPricing;
  performance: ModelPerformance;
  availability: ModelAvailability;
  quality_scores: QualityScores;
}

export interface ModelSpecialization {
  domain: 'code' | 'text' | 'math' | 'reasoning' | 'creative' | 'analysis' | 'conversation';
  proficiency: 'basic' | 'good' | 'excellent' | 'expert';
  confidence: number; // 0-1
  benchmark_scores?: Record<string, number>;
}

export interface ModelPricing {
  input_cost_per_token: number;
  output_cost_per_token: number;
  image_cost?: number;
  audio_cost?: number;
  currency: 'USD' | 'EUR' | 'GBP';
  billing_model: 'per_token' | 'per_request' | 'subscription' | 'usage_tier';
}

export interface ModelPerformance {
  average_latency: number; // milliseconds
  p95_latency: number;
  p99_latency: number;
  throughput: number; // tokens per second
  reliability: number; // 0-1 (uptime percentage)
  consistency: number; // 0-1 (output consistency)
  last_measured: number;
  sample_size: number;
}

export interface ModelAvailability {
  regions: string[];
  rate_limits: {
    requests_per_minute: number;
    tokens_per_minute: number;
    daily_quota?: number;
  };
  maintenance_windows: string[];
  status: 'active' | 'deprecated' | 'beta' | 'limited' | 'offline';
}

export interface QualityScores {
  code_quality: number; // 0-1
  accuracy: number; // 0-1
  helpfulness: number; // 0-1
  safety: number; // 0-1
  instruction_following: number; // 0-1
  creativity: number; // 0-1
  reasoning: number; // 0-1
  last_evaluated: number;
}

export interface TaskRequirements {
  task_type: 'code_generation' | 'code_review' | 'debugging' | 'explanation' | 'refactoring' | 'testing' | 'documentation' | 'conversation';
  complexity: 'simple' | 'medium' | 'complex' | 'expert';
  language?: string;
  domain?: string;
  quality_threshold: number; // 0-1
  latency_requirement: 'low' | 'medium' | 'high' | 'real_time';
  cost_sensitivity: 'low' | 'medium' | 'high';
  context_size: number;
  expected_output_size: number;
  requires_streaming: boolean;
  requires_function_calling: boolean;
  requires_vision: boolean;
  safety_critical: boolean;
}

export interface OptimizationContext {
  user_id: string;
  project_id: string;
  session_id: string;
  user_preferences: UserPreferences;
  project_constraints: ProjectConstraints;
  current_usage: UsageStatistics;
  time_of_day: number;
  historical_performance: PerformanceHistory[];
}

export interface UserPreferences {
  preferred_models: string[];
  quality_over_speed: boolean;
  cost_conscious: boolean;
  experimental_models: boolean;
  privacy_level: 'low' | 'medium' | 'high';
  response_style: 'concise' | 'detailed' | 'conversational';
}

export interface ProjectConstraints {
  budget_limit?: number;
  latency_sla?: number;
  quality_minimum: number;
  allowed_providers: string[];
  prohibited_models: string[];
  data_locality_requirements: string[];
  compliance_requirements: string[];
}

export interface UsageStatistics {
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  error_rate: number;
  average_latency: number;
  model_usage: Record<string, number>;
  daily_usage: number;
  monthly_usage: number;
}

export interface PerformanceHistory {
  model_id: string;
  task_type: string;
  timestamp: number;
  latency: number;
  quality_score: number;
  cost: number;
  success: boolean;
  error_type?: string;
  user_satisfaction?: number;
}

export interface ModelRecommendation {
  model_id: string;
  confidence: number; // 0-1
  expected_performance: {
    latency: number;
    quality: number;
    cost: number;
    success_probability: number;
  };
  reasoning: string[];
  alternatives: AlternativeModel[];
  optimization_suggestions: OptimizationSuggestion[];
}

export interface AlternativeModel {
  model_id: string;
  trade_offs: string[];
  performance_difference: {
    latency_delta: number;
    quality_delta: number;
    cost_delta: number;
  };
}

export interface OptimizationSuggestion {
  type: 'temperature' | 'max_tokens' | 'prompt' | 'caching' | 'batching' | 'fallback';
  description: string;
  impact: 'low' | 'medium' | 'high';
  implementation: string;
}

export interface PerformanceInsight {
  type: 'model_degradation' | 'cost_spike' | 'latency_increase' | 'quality_drop' | 'usage_pattern';
  severity: 'info' | 'warning' | 'critical';
  description: string;
  affected_models: string[];
  recommendation: string;
  data: Record<string, any>;
  timestamp: number;
}

export interface OptimizationConfig {
  enabled: boolean;
  learning_rate: number;
  min_samples_for_recommendation: number;
  performance_window_hours: number;
  auto_fallback: boolean;
  cost_optimization: boolean;
  quality_optimization: boolean;
  latency_optimization: boolean;
  experimental_features: boolean;
  monitoring_interval: number; // minutes
}

export class PerformanceOptimizer extends EventEmitter {
  private readonly logger = new Logger('PerformanceOptimizer');
  private readonly config: OptimizationConfig;
  private readonly models = new Map<string, ModelCapabilities>();
  private readonly performanceHistory: PerformanceHistory[] = [];
  private readonly optimizationCache = new Map<string, ModelRecommendation>();
  private monitoringTimer?: NodeJS.Timeout;

  constructor(config?: Partial<OptimizationConfig>) {
    super();
    
    this.config = {
      enabled: true,
      learning_rate: 0.1,
      min_samples_for_recommendation: 10,
      performance_window_hours: 24,
      auto_fallback: true,
      cost_optimization: true,
      quality_optimization: true,
      latency_optimization: true,
      experimental_features: false,
      monitoring_interval: 15, // 15 minutes
      ...config,
    };

    this.loadModelCapabilities();
    this.loadPerformanceHistory();
    this.startPerformanceMonitoring();
  }

  /**
   * Get optimal model recommendation for a task
   */
  async recommendModel(requirements: TaskRequirements, context: OptimizationContext): Promise<ModelRecommendation> {
    const cacheKey = this.generateCacheKey(requirements, context);
    const cached = this.optimizationCache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    const recommendation = await this.generateRecommendation(requirements, context);
    
    // Cache the recommendation
    this.optimizationCache.set(cacheKey, recommendation);
    
    this.emit('recommendationGenerated', { requirements, context, recommendation });
    
    return recommendation;
  }

  /**
   * Record performance data for continuous learning
   */
  async recordPerformance(data: Omit<PerformanceHistory, 'timestamp'>): Promise<void> {
    const performance: PerformanceHistory = {
      ...data,
      timestamp: Date.now(),
    };

    this.performanceHistory.push(performance);

    // Keep only recent history
    const cutoff = Date.now() - (this.config.performance_window_hours * 60 * 60 * 1000);
    const recentHistory = this.performanceHistory.filter(p => p.timestamp > cutoff);
    this.performanceHistory.length = 0;
    this.performanceHistory.push(...recentHistory);

    // Update model performance metrics
    await this.updateModelPerformance(performance);

    // Clear related cache entries
    this.clearRelatedCache(performance.model_id, performance.task_type);

    this.emit('performanceRecorded', performance);
  }

  /**
   * Get performance insights and recommendations
   */
  async getPerformanceInsights(context: OptimizationContext): Promise<PerformanceInsight[]> {
    const insights: PerformanceInsight[] = [];

    // Analyze recent performance trends
    const recentHistory = this.getRecentHistory(24); // Last 24 hours

    // Check for model degradation
    const degradationInsights = await this.detectModelDegradation(recentHistory);
    insights.push(...degradationInsights);

    // Check for cost spikes
    const costInsights = await this.detectCostSpikes(recentHistory, context);
    insights.push(...costInsights);

    // Check for latency issues
    const latencyInsights = await this.detectLatencyIssues(recentHistory);
    insights.push(...latencyInsights);

    // Check for quality drops
    const qualityInsights = await this.detectQualityDrops(recentHistory);
    insights.push(...qualityInsights);

    // Analyze usage patterns
    const usageInsights = await this.analyzeUsagePatterns(recentHistory, context);
    insights.push(...usageInsights);

    return insights.sort((a, b) => {
      const severityOrder = { critical: 3, warning: 2, info: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Get model performance comparison
   */
  async compareModels(modelIds: string[], taskType?: string): Promise<{
    models: ModelPerformanceComparison[];
    recommendations: string[];
  }> {
    const comparisons: ModelPerformanceComparison[] = [];

    for (const modelId of modelIds) {
      const model = this.models.get(modelId);
      if (!model) continue;

      const history = this.performanceHistory.filter(h => 
        h.model_id === modelId && (!taskType || h.task_type === taskType)
      );

      if (history.length > 0) {
        const avgLatency = statistics.mean(history.map(h => h.latency));
        const avgQuality = statistics.mean(history.map(h => h.quality_score));
        const avgCost = statistics.mean(history.map(h => h.cost));
        const successRate = history.filter(h => h.success).length / history.length;

        comparisons.push({
          model_id: modelId,
          model_name: model.name,
          performance: {
            average_latency: avgLatency,
            average_quality: avgQuality,
            average_cost: avgCost,
            success_rate: successRate,
            sample_size: history.length,
          },
          strengths: this.identifyModelStrengths(model, history),
          weaknesses: this.identifyModelWeaknesses(model, history),
          best_use_cases: this.identifyBestUseCases(model, history),
        });
      }
    }

    // Sort by overall performance score
    comparisons.sort((a, b) => {
      const scoreA = this.calculateOverallScore(a.performance);
      const scoreB = this.calculateOverallScore(b.performance);
      return scoreB - scoreA;
    });

    const recommendations = this.generateComparisonRecommendations(comparisons);

    return { models: comparisons, recommendations };
  }

  /**
   * Optimize existing model configuration
   */
  async optimizeConfiguration(
    modelId: string,
    currentConfig: ModelConfiguration,
    requirements: TaskRequirements
  ): Promise<{
    optimized_config: ModelConfiguration;
    expected_improvements: ConfigurationImprovements;
    confidence: number;
  }> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const history = this.performanceHistory.filter(h => h.model_id === modelId);
    const optimizedConfig = { ...currentConfig };
    const improvements: ConfigurationImprovements = {
      latency_improvement: 0,
      quality_improvement: 0,
      cost_reduction: 0,
    };

    // Optimize temperature
    const tempOptimization = this.optimizeTemperature(history, requirements, currentConfig.temperature);
    if (tempOptimization.confidence > 0.7) {
      optimizedConfig.temperature = tempOptimization.value;
      improvements.quality_improvement += tempOptimization.expected_improvement;
    }

    // Optimize max tokens
    const tokensOptimization = this.optimizeMaxTokens(history, requirements, currentConfig.max_tokens);
    if (tokensOptimization.confidence > 0.7) {
      optimizedConfig.max_tokens = tokensOptimization.value;
      improvements.cost_reduction += tokensOptimization.expected_cost_reduction;
      improvements.latency_improvement += tokensOptimization.expected_latency_improvement;
    }

    // Optimize other parameters
    if (currentConfig.top_p !== undefined) {
      const topPOptimization = this.optimizeTopP(history, requirements, currentConfig.top_p);
      if (topPOptimization.confidence > 0.7) {
        optimizedConfig.top_p = topPOptimization.value;
        improvements.quality_improvement += topPOptimization.expected_improvement;
      }
    }

    const overallConfidence = this.calculateOptimizationConfidence(history.length, requirements.complexity);

    return {
      optimized_config: optimizedConfig,
      expected_improvements: improvements,
      confidence: overallConfidence,
    };
  }

  /**
   * Get real-time optimization suggestions
   */
  async getRealtimeOptimizations(context: OptimizationContext): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Check current usage patterns
    if (context.current_usage.error_rate > 0.1) {
      suggestions.push({
        type: 'fallback',
        description: 'High error rate detected, consider implementing fallback models',
        impact: 'high',
        implementation: 'Add fallback model configuration with automatic retry logic',
      });
    }

    if (context.current_usage.average_latency > 5000) {
      suggestions.push({
        type: 'caching',
        description: 'High latency detected, implement response caching',
        impact: 'high',
        implementation: 'Cache common responses with TTL-based invalidation',
      });
    }

    // Check cost patterns
    const recentCost = this.calculateRecentCost(1); // Last hour
    if (recentCost > context.project_constraints.budget_limit! * 0.1) { // 10% of daily budget in 1 hour
      suggestions.push({
        type: 'max_tokens',
        description: 'High cost rate detected, optimize token usage',
        impact: 'medium',
        implementation: 'Reduce max_tokens parameter and implement smart truncation',
      });
    }

    // Check quality patterns
    const recentQuality = this.calculateAverageQuality(context.user_id, 6); // Last 6 hours
    if (recentQuality < context.project_constraints.quality_minimum) {
      suggestions.push({
        type: 'temperature',
        description: 'Quality below threshold, adjust model parameters',
        impact: 'medium',
        implementation: 'Lower temperature for more consistent outputs',
      });
    }

    return suggestions;
  }

  /**
   * Predict model performance for a given task
   */
  async predictPerformance(modelId: string, requirements: TaskRequirements): Promise<{
    latency: { min: number; max: number; expected: number };
    quality: { min: number; max: number; expected: number };
    cost: { min: number; max: number; expected: number };
    confidence: number;
  }> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const relevantHistory = this.performanceHistory.filter(h => 
      h.model_id === modelId && 
      h.task_type === requirements.task_type
    );

    if (relevantHistory.length < this.config.min_samples_for_recommendation) {
      // Use model baseline performance
      return {
        latency: {
          min: model.performance.average_latency * 0.8,
          max: model.performance.p95_latency,
          expected: model.performance.average_latency,
        },
        quality: {
          min: 0.6,
          max: 0.95,
          expected: model.quality_scores.accuracy,
        },
        cost: this.estimateCost(model, requirements),
        confidence: 0.5,
      };
    }

    // Calculate statistics from historical data
    const latencies = relevantHistory.map(h => h.latency);
    const qualities = relevantHistory.map(h => h.quality_score);
    const costs = relevantHistory.map(h => h.cost);

    return {
      latency: {
        min: Math.min(...latencies),
        max: Math.max(...latencies),
        expected: statistics.mean(latencies),
      },
      quality: {
        min: Math.min(...qualities),
        max: Math.max(...qualities),
        expected: statistics.mean(qualities),
      },
      cost: {
        min: Math.min(...costs),
        max: Math.max(...costs),
        expected: statistics.mean(costs),
      },
      confidence: Math.min(relevantHistory.length / 100, 0.95),
    };
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats(): {
    total_recommendations: number;
    cache_hit_rate: number;
    average_confidence: number;
    top_models: { model_id: string; usage_count: number }[];
    performance_trends: PerformanceTrend[];
  } {
    const totalRecommendations = this.optimizationCache.size;
    const cacheHitRate = 0.85; // Placeholder - would track actual cache hits

    const confidenceScores = Array.from(this.optimizationCache.values()).map(r => r.confidence);
    const averageConfidence = confidenceScores.length > 0 ? statistics.mean(confidenceScores) : 0;

    // Count model usage
    const modelUsage = new Map<string, number>();
    this.performanceHistory.forEach(h => {
      modelUsage.set(h.model_id, (modelUsage.get(h.model_id) || 0) + 1);
    });

    const topModels = Array.from(modelUsage.entries())
      .map(([model_id, usage_count]) => ({ model_id, usage_count }))
      .sort((a, b) => b.usage_count - a.usage_count)
      .slice(0, 5);

    const performanceTrends = this.calculatePerformanceTrends();

    return {
      total_recommendations: totalRecommendations,
      cache_hit_rate: cacheHitRate,
      average_confidence: averageConfidence,
      top_models: topModels,
      performance_trends: performanceTrends,
    };
  }

  /**
   * Private helper methods
   */
  private async generateRecommendation(requirements: TaskRequirements, context: OptimizationContext): Promise<ModelRecommendation> {
    const candidateModels = this.filterCandidateModels(requirements, context);
    const scoredModels = await this.scoreModels(candidateModels, requirements, context);
    
    if (scoredModels.length === 0) {
      throw new Error('No suitable models found for the given requirements');
    }

    const bestModel = scoredModels[0];
    const alternatives = scoredModels.slice(1, 4).map(model => this.createAlternative(model, bestModel));
    const suggestions = await this.generateOptimizationSuggestions(bestModel.model_id, requirements);

    return {
      model_id: bestModel.model_id,
      confidence: bestModel.score,
      expected_performance: bestModel.expected_performance,
      reasoning: bestModel.reasoning,
      alternatives,
      optimization_suggestions: suggestions,
    };
  }

  private filterCandidateModels(requirements: TaskRequirements, context: OptimizationContext): ModelCapabilities[] {
    return Array.from(this.models.values()).filter(model => {
      // Check availability
      if (model.availability.status !== 'active') return false;

      // Check provider constraints
      if (context.project_constraints.allowed_providers.length > 0 &&
          !context.project_constraints.allowed_providers.includes(model.provider)) {
        return false;
      }

      // Check prohibited models
      if (context.project_constraints.prohibited_models.includes(model.id)) {
        return false;
      }

      // Check context length
      if (requirements.context_size > model.context_length) return false;

      // Check capabilities
      if (requirements.requires_function_calling && !model.supports_function_calling) return false;
      if (requirements.requires_vision && !model.supports_vision) return false;
      if (requirements.requires_streaming && !model.supports_streaming) return false;

      // Check specialization
      const relevantSpecialization = model.specializations.find(s => 
        this.isRelevantSpecialization(s, requirements)
      );
      if (!relevantSpecialization) return false;

      return true;
    });
  }

  private async scoreModels(models: ModelCapabilities[], requirements: TaskRequirements, context: OptimizationContext): Promise<ScoredModel[]> {
    const scoredModels: ScoredModel[] = [];

    for (const model of models) {
      const score = await this.calculateModelScore(model, requirements, context);
      const performance = await this.predictPerformance(model.id, requirements);
      
      scoredModels.push({
        model_id: model.id,
        score: score.overall,
        expected_performance: {
          latency: performance.latency.expected,
          quality: performance.quality.expected,
          cost: performance.cost.expected,
          success_probability: model.performance.reliability,
        },
        reasoning: score.reasoning,
      });
    }

    return scoredModels.sort((a, b) => b.score - a.score);
  }

  private async calculateModelScore(model: ModelCapabilities, requirements: TaskRequirements, context: OptimizationContext): Promise<{
    overall: number;
    reasoning: string[];
  }> {
    const reasoning: string[] = [];
    let score = 0;

    // Quality score (40% weight)
    const qualityScore = this.calculateQualityScore(model, requirements);
    score += qualityScore * 0.4;
    if (qualityScore > 0.8) reasoning.push('High quality ratings for this task type');

    // Performance score (25% weight)
    const performanceScore = this.calculatePerformanceScore(model, requirements);
    score += performanceScore * 0.25;
    if (performanceScore > 0.8) reasoning.push('Excellent performance characteristics');

    // Cost score (20% weight)
    const costScore = this.calculateCostScore(model, requirements, context);
    score += costScore * 0.2;
    if (costScore > 0.8) reasoning.push('Cost-effective for your usage pattern');

    // Specialization score (10% weight)
    const specializationScore = this.calculateSpecializationScore(model, requirements);
    score += specializationScore * 0.1;
    if (specializationScore > 0.8) reasoning.push('Specialized for this domain');

    // Historical performance (5% weight)
    const historicalScore = this.calculateHistoricalScore(model.id, requirements, context);
    score += historicalScore * 0.05;
    if (historicalScore > 0.8) reasoning.push('Strong historical performance');

    return { overall: Math.min(score, 1.0), reasoning };
  }

  private calculateQualityScore(model: ModelCapabilities, requirements: TaskRequirements): number {
    const relevantScore = this.getRelevantQualityScore(model.quality_scores, requirements.task_type);
    
    // Adjust for complexity
    const complexityMultiplier = {
      simple: 1.0,
      medium: 0.95,
      complex: 0.9,
      expert: 0.85,
    };

    return relevantScore * complexityMultiplier[requirements.complexity];
  }

  private calculatePerformanceScore(model: ModelCapabilities, requirements: TaskRequirements): number {
    let score = 0;

    // Latency score
    const latencyRequirement = {
      real_time: 500,
      high: 1000,
      medium: 3000,
      low: 10000,
    }[requirements.latency_requirement];

    if (model.performance.average_latency <= latencyRequirement) {
      score += 0.4;
    } else {
      score += 0.4 * (latencyRequirement / model.performance.average_latency);
    }

    // Reliability score
    score += model.performance.reliability * 0.3;

    // Throughput score
    const expectedTokens = requirements.expected_output_size;
    const timeToComplete = expectedTokens / model.performance.throughput;
    
    if (timeToComplete <= 10) { // 10 seconds
      score += 0.3;
    } else {
      score += 0.3 * (10 / timeToComplete);
    }

    return Math.min(score, 1.0);
  }

  private calculateCostScore(model: ModelCapabilities, requirements: TaskRequirements, context: OptimizationContext): number {
    const estimatedCost = this.estimateCost(model, requirements).expected;
    
    // Calculate cost score based on sensitivity
    const costSensitivity = {
      low: { threshold: 1.0, penalty: 0.1 },
      medium: { threshold: 0.5, penalty: 0.3 },
      high: { threshold: 0.1, penalty: 0.7 },
    }[requirements.cost_sensitivity];

    if (estimatedCost <= costSensitivity.threshold) {
      return 1.0;
    } else {
      return Math.max(0, 1.0 - (estimatedCost - costSensitivity.threshold) * costSensitivity.penalty);
    }
  }

  private calculateSpecializationScore(model: ModelCapabilities, requirements: TaskRequirements): number {
    const relevantSpecs = model.specializations.filter(s => 
      this.isRelevantSpecialization(s, requirements)
    );

    if (relevantSpecs.length === 0) return 0.5;

    const avgProficiency = relevantSpecs.reduce((sum, spec) => {
      const proficiencyScore = { basic: 0.3, good: 0.6, excellent: 0.8, expert: 1.0 }[spec.proficiency];
      return sum + proficiencyScore * spec.confidence;
    }, 0) / relevantSpecs.length;

    return avgProficiency;
  }

  private calculateHistoricalScore(modelId: string, requirements: TaskRequirements, context: OptimizationContext): number {
    const relevantHistory = this.performanceHistory.filter(h => 
      h.model_id === modelId && 
      h.task_type === requirements.task_type
    );

    if (relevantHistory.length < 5) return 0.5; // Neutral score for insufficient data

    const successRate = relevantHistory.filter(h => h.success).length / relevantHistory.length;
    const avgQuality = statistics.mean(relevantHistory.map(h => h.quality_score));
    const avgSatisfaction = relevantHistory
      .filter(h => h.user_satisfaction !== undefined)
      .map(h => h.user_satisfaction!)
      .reduce((sum, rating) => sum + rating, 0) / relevantHistory.length || 0.7;

    return (successRate * 0.4 + avgQuality * 0.4 + avgSatisfaction * 0.2);
  }

  private isRelevantSpecialization(spec: ModelSpecialization, requirements: TaskRequirements): boolean {
    const taskToDomainMap: Record<string, string[]> = {
      code_generation: ['code'],
      code_review: ['code', 'analysis'],
      debugging: ['code', 'reasoning'],
      explanation: ['text', 'reasoning'],
      refactoring: ['code', 'analysis'],
      testing: ['code'],
      documentation: ['text', 'code'],
      conversation: ['conversation', 'text'],
    };

    const relevantDomains = taskToDomainMap[requirements.task_type] || [];
    return relevantDomains.includes(spec.domain);
  }

  private getRelevantQualityScore(scores: QualityScores, taskType: string): number {
    const taskToScoreMap: Record<string, keyof QualityScores> = {
      code_generation: 'code_quality',
      code_review: 'accuracy',
      debugging: 'reasoning',
      explanation: 'helpfulness',
      refactoring: 'code_quality',
      testing: 'accuracy',
      documentation: 'helpfulness',
      conversation: 'helpfulness',
    };

    const relevantScore = taskToScoreMap[taskType];
    return relevantScore ? scores[relevantScore] : scores.accuracy;
  }

  private estimateCost(model: ModelCapabilities, requirements: TaskRequirements): {
    min: number;
    max: number;
    expected: number;
  } {
    const inputTokens = requirements.context_size;
    const outputTokens = requirements.expected_output_size;

    const inputCost = inputTokens * model.pricing.input_cost_per_token;
    const outputCost = outputTokens * model.pricing.output_cost_per_token;
    const totalCost = inputCost + outputCost;

    return {
      min: totalCost * 0.8,
      max: totalCost * 1.2,
      expected: totalCost,
    };
  }

  private createAlternative(model: ScoredModel, bestModel: ScoredModel): AlternativeModel {
    const latencyDelta = model.expected_performance.latency - bestModel.expected_performance.latency;
    const qualityDelta = model.expected_performance.quality - bestModel.expected_performance.quality;
    const costDelta = model.expected_performance.cost - bestModel.expected_performance.cost;

    const tradeOffs: string[] = [];
    
    if (latencyDelta > 1000) tradeOffs.push('Higher latency');
    if (qualityDelta < -0.1) tradeOffs.push('Lower quality');
    if (costDelta > 0.01) tradeOffs.push('Higher cost');
    
    if (latencyDelta < -500) tradeOffs.push('Faster response');
    if (qualityDelta > 0.05) tradeOffs.push('Better quality');
    if (costDelta < -0.005) tradeOffs.push('Lower cost');

    return {
      model_id: model.model_id,
      trade_offs: tradeOffs,
      performance_difference: {
        latency_delta: latencyDelta,
        quality_delta: qualityDelta,
        cost_delta: costDelta,
      },
    };
  }

  private async generateOptimizationSuggestions(modelId: string, requirements: TaskRequirements): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Temperature optimization
    if (requirements.task_type === 'code_generation') {
      suggestions.push({
        type: 'temperature',
        description: 'Use lower temperature (0.1-0.3) for more consistent code generation',
        impact: 'medium',
        implementation: 'Set temperature parameter to 0.2',
      });
    }

    // Token optimization
    suggestions.push({
      type: 'max_tokens',
      description: 'Optimize max_tokens based on expected output length',
      impact: 'low',
      implementation: `Set max_tokens to ${Math.ceil(requirements.expected_output_size * 1.2)}`,
    });

    // Caching suggestion
    if (requirements.task_type === 'explanation' || requirements.task_type === 'documentation') {
      suggestions.push({
        type: 'caching',
        description: 'Cache similar explanations to reduce costs',
        impact: 'medium',
        implementation: 'Implement semantic similarity caching for repeated queries',
      });
    }

    return suggestions;
  }

  private generateCacheKey(requirements: TaskRequirements, context: OptimizationContext): string {
    const keyComponents = [
      requirements.task_type,
      requirements.complexity,
      requirements.language || 'none',
      requirements.latency_requirement,
      requirements.cost_sensitivity,
      context.user_preferences.quality_over_speed ? 'quality' : 'speed',
      context.user_preferences.cost_conscious ? 'cost_conscious' : 'cost_flexible',
    ];

    return keyComponents.join('|');
  }

  private isCacheValid(recommendation: ModelRecommendation): boolean {
    // Cache is valid for 1 hour
    return Date.now() - (recommendation as any).timestamp < 60 * 60 * 1000;
  }

  private clearRelatedCache(modelId: string, taskType: string): void {
    const keysToDelete: string[] = [];
    
    for (const [key, recommendation] of this.optimizationCache.entries()) {
      if (key.includes(taskType) && recommendation.model_id === modelId) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.optimizationCache.delete(key));
  }

  private async updateModelPerformance(performance: PerformanceHistory): Promise<void> {
    const model = this.models.get(performance.model_id);
    if (!model) return;

    const recentPerformance = this.performanceHistory
      .filter(h => h.model_id === performance.model_id)
      .slice(-100); // Last 100 samples

    if (recentPerformance.length >= 10) {
      const latencies = recentPerformance.map(h => h.latency);
      const successRate = recentPerformance.filter(h => h.success).length / recentPerformance.length;
      
      model.performance.average_latency = statistics.mean(latencies);
      model.performance.p95_latency = statistics.quantile(latencies, 0.95);
      model.performance.p99_latency = statistics.quantile(latencies, 0.99);
      model.performance.reliability = successRate;
      model.performance.last_measured = Date.now();
      model.performance.sample_size = recentPerformance.length;
    }
  }

  private getRecentHistory(hours: number): PerformanceHistory[] {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return this.performanceHistory.filter(h => h.timestamp > cutoff);
  }

  private async detectModelDegradation(history: PerformanceHistory[]): Promise<PerformanceInsight[]> {
    const insights: PerformanceInsight[] = [];
    const modelGroups = new Map<string, PerformanceHistory[]>();

    // Group by model
    history.forEach(h => {
      if (!modelGroups.has(h.model_id)) {
        modelGroups.set(h.model_id, []);
      }
      modelGroups.get(h.model_id)!.push(h);
    });

    for (const [modelId, modelHistory] of modelGroups.entries()) {
      if (modelHistory.length < 20) continue;

      const recentHalf = modelHistory.slice(-Math.floor(modelHistory.length / 2));
      const olderHalf = modelHistory.slice(0, Math.floor(modelHistory.length / 2));

      const recentQuality = statistics.mean(recentHalf.map(h => h.quality_score));
      const olderQuality = statistics.mean(olderHalf.map(h => h.quality_score));

      if (recentQuality < olderQuality * 0.9) { // 10% degradation
        insights.push({
          type: 'model_degradation',
          severity: 'warning',
          description: `Model ${modelId} showing quality degradation`,
          affected_models: [modelId],
          recommendation: 'Consider switching to alternative model or investigating cause',
          data: { recent_quality: recentQuality, previous_quality: olderQuality },
          timestamp: Date.now(),
        });
      }
    }

    return insights;
  }

  private async detectCostSpikes(history: PerformanceHistory[], context: OptimizationContext): Promise<PerformanceInsight[]> {
    const insights: PerformanceInsight[] = [];
    
    if (history.length < 10) return insights;

    const costs = history.map(h => h.cost);
    const avgCost = statistics.mean(costs);
    const recentCosts = costs.slice(-5);
    const recentAvgCost = statistics.mean(recentCosts);

    if (recentAvgCost > avgCost * 1.5) { // 50% increase
      insights.push({
        type: 'cost_spike',
        severity: 'warning',
        description: 'Significant cost increase detected in recent requests',
        affected_models: [...new Set(history.slice(-5).map(h => h.model_id))],
        recommendation: 'Review model selection and optimize token usage',
        data: { recent_avg: recentAvgCost, overall_avg: avgCost },
        timestamp: Date.now(),
      });
    }

    return insights;
  }

  private async detectLatencyIssues(history: PerformanceHistory[]): Promise<PerformanceInsight[]> {
    const insights: PerformanceInsight[] = [];
    
    if (history.length < 10) return insights;

    const latencies = history.map(h => h.latency);
    const p95Latency = statistics.quantile(latencies, 0.95);
    const recentLatencies = latencies.slice(-5);
    const recentAvgLatency = statistics.mean(recentLatencies);

    if (recentAvgLatency > p95Latency) {
      insights.push({
        type: 'latency_increase',
        severity: 'warning',
        description: 'Recent requests showing higher than normal latency',
        affected_models: [...new Set(history.slice(-5).map(h => h.model_id))],
        recommendation: 'Check model availability and consider load balancing',
        data: { recent_avg: recentAvgLatency, p95_threshold: p95Latency },
        timestamp: Date.now(),
      });
    }

    return insights;
  }

  private async detectQualityDrops(history: PerformanceHistory[]): Promise<PerformanceInsight[]> {
    const insights: PerformanceInsight[] = [];
    
    if (history.length < 10) return insights;

    const qualities = history.map(h => h.quality_score);
    const avgQuality = statistics.mean(qualities);
    const recentQualities = qualities.slice(-5);
    const recentAvgQuality = statistics.mean(recentQualities);

    if (recentAvgQuality < avgQuality * 0.85) { // 15% drop
      insights.push({
        type: 'quality_drop',
        severity: 'warning',
        description: 'Recent outputs showing lower quality scores',
        affected_models: [...new Set(history.slice(-5).map(h => h.model_id))],
        recommendation: 'Review prompts and model parameters for quality optimization',
        data: { recent_avg: recentAvgQuality, overall_avg: avgQuality },
        timestamp: Date.now(),
      });
    }

    return insights;
  }

  private async analyzeUsagePatterns(history: PerformanceHistory[], context: OptimizationContext): Promise<PerformanceInsight[]> {
    const insights: PerformanceInsight[] = [];

    // Analyze model distribution
    const modelUsage = new Map<string, number>();
    history.forEach(h => {
      modelUsage.set(h.model_id, (modelUsage.get(h.model_id) || 0) + 1);
    });

    const totalRequests = history.length;
    const dominantModel = Array.from(modelUsage.entries())
      .sort(([,a], [,b]) => b - a)[0];

    if (dominantModel && dominantModel[1] / totalRequests > 0.8) {
      insights.push({
        type: 'usage_pattern',
        severity: 'info',
        description: `High concentration of requests on model ${dominantModel[0]}`,
        affected_models: [dominantModel[0]],
        recommendation: 'Consider load balancing across multiple models for better resilience',
        data: { usage_percentage: (dominantModel[1] / totalRequests) * 100 },
        timestamp: Date.now(),
      });
    }

    return insights;
  }

  private identifyModelStrengths(model: ModelCapabilities, history: PerformanceHistory[]): string[] {
    const strengths: string[] = [];

    const avgLatency = statistics.mean(history.map(h => h.latency));
    const avgQuality = statistics.mean(history.map(h => h.quality_score));
    const successRate = history.filter(h => h.success).length / history.length;

    if (avgLatency < 2000) strengths.push('Fast response times');
    if (avgQuality > 0.8) strengths.push('High quality outputs');
    if (successRate > 0.95) strengths.push('Very reliable');
    if (model.supports_function_calling) strengths.push('Function calling support');
    if (model.supports_vision) strengths.push('Vision capabilities');

    return strengths;
  }

  private identifyModelWeaknesses(model: ModelCapabilities, history: PerformanceHistory[]): string[] {
    const weaknesses: string[] = [];

    const avgLatency = statistics.mean(history.map(h => h.latency));
    const avgQuality = statistics.mean(history.map(h => h.quality_score));
    const successRate = history.filter(h => h.success).length / history.length;

    if (avgLatency > 5000) weaknesses.push('Slow response times');
    if (avgQuality < 0.6) weaknesses.push('Inconsistent quality');
    if (successRate < 0.9) weaknesses.push('Reliability issues');
    if (model.context_length < 8000) weaknesses.push('Limited context length');

    return weaknesses;
  }

  private identifyBestUseCases(model: ModelCapabilities, history: PerformanceHistory[]): string[] {
    const useCases: string[] = [];

    const taskPerformance = new Map<string, number>();
    history.forEach(h => {
      if (!taskPerformance.has(h.task_type)) {
        taskPerformance.set(h.task_type, 0);
      }
      taskPerformance.set(h.task_type, taskPerformance.get(h.task_type)! + h.quality_score);
    });

    // Normalize by count
    for (const [task, total] of taskPerformance.entries()) {
      const count = history.filter(h => h.task_type === task).length;
      taskPerformance.set(task, total / count);
    }

    const sortedTasks = Array.from(taskPerformance.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);

    return sortedTasks.map(([task]) => task);
  }

  private calculateOverallScore(performance: ModelPerformanceMetrics): number {
    return (
      (1 - performance.average_latency / 10000) * 0.3 + // Normalize latency (10s max)
      performance.average_quality * 0.4 +
      (1 - performance.average_cost / 1.0) * 0.2 + // Normalize cost ($1 max)
      performance.success_rate * 0.1
    );
  }

  private generateComparisonRecommendations(comparisons: ModelPerformanceComparison[]): string[] {
    const recommendations: string[] = [];

    if (comparisons.length === 0) {
      return ['No models to compare'];
    }

    const best = comparisons[0];
    recommendations.push(`${best.model_name} shows the best overall performance`);

    const fastestModel = comparisons.reduce((min, current) => 
      current.performance.average_latency < min.performance.average_latency ? current : min
    );
    
    if (fastestModel.model_id !== best.model_id) {
      recommendations.push(`${fastestModel.model_name} offers the fastest response times`);
    }

    const cheapestModel = comparisons.reduce((min, current) => 
      current.performance.average_cost < min.performance.average_cost ? current : min
    );
    
    if (cheapestModel.model_id !== best.model_id) {
      recommendations.push(`${cheapestModel.model_name} provides the most cost-effective option`);
    }

    return recommendations;
  }

  private optimizeTemperature(history: PerformanceHistory[], requirements: TaskRequirements, currentTemp: number): {
    value: number;
    confidence: number;
    expected_improvement: number;
  } {
    // This would include more sophisticated optimization
    const optimalTemp = requirements.task_type === 'code_generation' ? 0.2 : 0.7;
    
    return {
      value: optimalTemp,
      confidence: 0.8,
      expected_improvement: Math.abs(currentTemp - optimalTemp) * 0.1,
    };
  }

  private optimizeMaxTokens(history: PerformanceHistory[], requirements: TaskRequirements, currentTokens: number): {
    value: number;
    confidence: number;
    expected_cost_reduction: number;
    expected_latency_improvement: number;
  } {
    const optimalTokens = Math.ceil(requirements.expected_output_size * 1.2);
    const reduction = Math.max(0, currentTokens - optimalTokens);
    
    return {
      value: optimalTokens,
      confidence: 0.9,
      expected_cost_reduction: reduction * 0.001, // Rough estimate
      expected_latency_improvement: reduction * 10, // ms per token
    };
  }

  private optimizeTopP(history: PerformanceHistory[], requirements: TaskRequirements, currentTopP: number): {
    value: number;
    confidence: number;
    expected_improvement: number;
  } {
    const optimalTopP = requirements.task_type === 'code_generation' ? 0.9 : 0.95;
    
    return {
      value: optimalTopP,
      confidence: 0.7,
      expected_improvement: Math.abs(currentTopP - optimalTopP) * 0.05,
    };
  }

  private calculateOptimizationConfidence(sampleSize: number, complexity: string): number {
    const baseSampleSize = { simple: 10, medium: 20, complex: 30, expert: 50 }[complexity];
    return Math.min(sampleSize / baseSampleSize, 0.95);
  }

  private calculateRecentCost(hours: number): number {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const recentHistory = this.performanceHistory.filter(h => h.timestamp > cutoff);
    return recentHistory.reduce((sum, h) => sum + h.cost, 0);
  }

  private calculateAverageQuality(userId: string, hours: number): number {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const userHistory = this.performanceHistory.filter(h => h.timestamp > cutoff);
    
    if (userHistory.length === 0) return 0.8; // Default
    
    return statistics.mean(userHistory.map(h => h.quality_score));
  }

  private calculatePerformanceTrends(): PerformanceTrend[] {
    // This would calculate actual trends from historical data
    return [
      { metric: 'latency', trend: 'stable', change_percentage: 2.1 },
      { metric: 'quality', trend: 'increasing', change_percentage: 5.3 },
      { metric: 'cost', trend: 'decreasing', change_percentage: -8.7 },
    ];
  }

  private startPerformanceMonitoring(): void {
    if (this.config.monitoring_interval > 0) {
      this.monitoringTimer = setInterval(() => {
        this.performMonitoringCycle();
      }, this.config.monitoring_interval * 60 * 1000);
    }
  }

  private async performMonitoringCycle(): Promise<void> {
    try {
      // Update model availability
      await this.updateModelAvailability();
      
      // Clean old performance data
      this.cleanOldPerformanceData();
      
      // Update cached recommendations
      this.refreshRecommendationCache();
      
      this.emit('monitoringCycleComplete');
    } catch (error) {
      this.logger.error('Monitoring cycle failed:', error);
    }
  }

  private async updateModelAvailability(): Promise<void> {
    // This would check actual model availability
    for (const model of this.models.values()) {
      // Placeholder - would make actual API calls
      model.availability.status = 'active';
    }
  }

  private cleanOldPerformanceData(): void {
    const cutoff = Date.now() - (this.config.performance_window_hours * 60 * 60 * 1000);
    const validHistory = this.performanceHistory.filter(h => h.timestamp > cutoff);
    
    this.performanceHistory.length = 0;
    this.performanceHistory.push(...validHistory);
  }

  private refreshRecommendationCache(): void {
    // Remove old cache entries
    for (const [key, recommendation] of this.optimizationCache.entries()) {
      if (!this.isCacheValid(recommendation)) {
        this.optimizationCache.delete(key);
      }
    }
  }

  private async loadModelCapabilities(): Promise<void> {
    // Load model capabilities from configuration or API
    const defaultModels: ModelCapabilities[] = [
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        type: 'chat',
        context_length: 128000,
        max_tokens: 4096,
        supports_streaming: true,
        supports_function_calling: true,
        supports_vision: true,
        supports_code: true,
        languages: ['javascript', 'python', 'java', 'typescript', 'go', 'rust'],
        specializations: [
          { domain: 'code', proficiency: 'excellent', confidence: 0.95 },
          { domain: 'reasoning', proficiency: 'expert', confidence: 0.9 },
          { domain: 'text', proficiency: 'excellent', confidence: 0.9 },
        ],
        pricing: {
          input_cost_per_token: 0.00001,
          output_cost_per_token: 0.00003,
          currency: 'USD',
          billing_model: 'per_token',
        },
        performance: {
          average_latency: 2000,
          p95_latency: 5000,
          p99_latency: 8000,
          throughput: 100,
          reliability: 0.99,
          consistency: 0.95,
          last_measured: Date.now(),
          sample_size: 1000,
        },
        availability: {
          regions: ['us', 'eu'],
          rate_limits: {
            requests_per_minute: 500,
            tokens_per_minute: 150000,
          },
          maintenance_windows: [],
          status: 'active',
        },
        quality_scores: {
          code_quality: 0.92,
          accuracy: 0.88,
          helpfulness: 0.90,
          safety: 0.95,
          instruction_following: 0.93,
          creativity: 0.87,
          reasoning: 0.91,
          last_evaluated: Date.now(),
        },
      },
      // Add more models here...
    ];

    defaultModels.forEach(model => {
      this.models.set(model.id, model);
    });

    this.logger.info(`Loaded ${this.models.size} model capabilities`);
  }

  private async loadPerformanceHistory(): Promise<void> {
    try {
      const historyPath = './performance-history.json';
      const content = await fs.readFile(historyPath, 'utf8');
      const history: PerformanceHistory[] = JSON.parse(content);
      
      this.performanceHistory.push(...history);
      this.logger.info(`Loaded ${history.length} performance records`);
    } catch (error) {
      this.logger.info('No existing performance history found, starting fresh');
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    this.removeAllListeners();
    this.models.clear();
    this.performanceHistory.length = 0;
    this.optimizationCache.clear();
  }
}

// Additional type definitions
interface ScoredModel {
  model_id: string;
  score: number;
  expected_performance: {
    latency: number;
    quality: number;
    cost: number;
    success_probability: number;
  };
  reasoning: string[];
}

interface ModelConfiguration {
  temperature: number;
  max_tokens: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

interface ConfigurationImprovements {
  latency_improvement: number;
  quality_improvement: number;
  cost_reduction: number;
}

interface ModelPerformanceComparison {
  model_id: string;
  model_name: string;
  performance: ModelPerformanceMetrics;
  strengths: string[];
  weaknesses: string[];
  best_use_cases: string[];
}

interface ModelPerformanceMetrics {
  average_latency: number;
  average_quality: number;
  average_cost: number;
  success_rate: number;
  sample_size: number;
}

interface PerformanceTrend {
  metric: string;
  trend: 'increasing' | 'decreasing' | 'stable';
  change_percentage: number;
}