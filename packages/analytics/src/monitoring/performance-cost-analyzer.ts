/**
 * Performance vs Cost Analysis System
 * 
 * Advanced analytics for comparing model performance against cost,
 * optimizing value delivery, and providing intelligent recommendations
 * for cost-effective AI model selection in recoder.xyz.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events';
import { ModelHealthMetrics } from './model-tracker';
import { CostMetrics } from './cost-tracker';
import { LatencyMetrics } from './latency-monitor';

export interface PerformanceCostMetrics {
  modelName: string;
  provider: string;
  period: {
    start: Date;
    end: Date;
    duration: string; // e.g., '24h', '7d', '30d'
  };
  performance: {
    quality: number;           // Overall quality score (0-1)
    latency: number;          // Average latency (ms)
    reliability: number;      // Uptime percentage (0-1)
    throughput: number;       // Tokens per second
    errorRate: number;        // Error rate (0-1)
  };
  cost: {
    totalCost: number;        // Total cost in period (USD)
    costPerToken: number;     // Cost per token
    costPerRequest: number;   // Cost per request
    costPerSecond: number;    // Cost per second of processing
  };
  efficiency: {
    valueScore: number;       // Overall value score (0-100)
    costEfficiencyRating: string; // 'excellent', 'good', 'fair', 'poor'
    performancePerDollar: number; // Performance units per dollar
    qualityPerDollar: number;     // Quality points per dollar
    speedPerDollar: number;       // Tokens per second per dollar
  };
  roi: {
    returnOnInvestment: number;   // ROI percentage
    valueCreated: number;         // Estimated value created (USD)
    paybackPeriod: number;        // Days to break even
    netPresentValue: number;      // NPV over analysis period
  };
  ranking: {
    overallRank: number;          // 1 = best value
    performanceRank: number;      // 1 = best performance
    costRank: number;             // 1 = lowest cost
    efficiencyRank: number;       // 1 = most efficient
  };
  trends: {
    valueImprovement: 'improving' | 'stable' | 'declining';
    costTrend: 'decreasing' | 'stable' | 'increasing';
    performanceTrend: 'improving' | 'stable' | 'declining';
    efficiencyTrend: 'improving' | 'stable' | 'declining';
  };
}

export interface ValueOptimizationRecommendation {
  id: string;
  type: 'model_switch' | 'workload_optimization' | 'cost_reduction' | 'performance_boost';
  priority: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;           // 0-1 confidence in recommendation
  title: string;
  description: string;
  currentModel: string;
  recommendedModel?: string;
  impact: {
    costSavings: number;        // USD savings per period
    performanceChange: number;  // % change in performance (-100 to +100)
    qualityChange: number;      // % change in quality (-100 to +100)
    latencyChange: number;      // % change in latency (-100 to +100)
    reliabilityChange: number;  // % change in reliability (-100 to +100)
  };
  implementation: {
    effort: 'trivial' | 'low' | 'medium' | 'high' | 'complex';
    timeToImplement: number;    // Hours
    riskLevel: 'low' | 'medium' | 'high';
    prerequisites: string[];
    steps: string[];
  };
  tradeoffs: {
    pros: string[];
    cons: string[];
    risks: string[];
  };
  metrics: {
    currentValueScore: number;
    projectedValueScore: number;
    valueImprovement: number;   // % improvement in value score
  };
}

export interface ModelComparison {
  comparisonId: string;
  timestamp: Date;
  taskType: string;
  models: Array<{
    modelName: string;
    provider: string;
    metrics: PerformanceCostMetrics;
    suitabilityScore: number;   // 0-100 how suitable for this task
  }>;
  winner: {
    overall: string;            // Best overall value
    performance: string;        // Best performance
    cost: string;              // Lowest cost
    efficiency: string;         // Most efficient
  };
  insights: {
    keyFindings: string[];
    surprises: string[];       // Unexpected results
    caveats: string[];         // Important limitations
  };
  recommendations: ValueOptimizationRecommendation[];
}

export interface CostOptimizationScenario {
  scenarioId: string;
  name: string;
  description: string;
  targetBudgetReduction: number; // % reduction target
  constraints: {
    minQualityThreshold: number;     // Minimum acceptable quality (0-1)
    maxLatencyIncrease: number;      // Maximum acceptable latency increase %
    minReliabilityThreshold: number; // Minimum acceptable reliability (0-1)
    excludedModels: string[];        // Models to exclude from consideration
    requiredCapabilities: string[];  // Required model capabilities
  };
  optimizations: Array<{
    description: string;
    models: string[];               // Models to switch to
    expectedSavings: number;        // USD savings
    qualityImpact: number;          // % quality change
    performanceImpact: number;      // % performance change
    implementationComplexity: 'low' | 'medium' | 'high';
  }>;
  results: {
    totalSavings: number;           // Total USD savings
    budgetReductionAchieved: number; // % budget reduction achieved
    averageQualityChange: number;    // % average quality change
    averagePerformanceChange: number; // % average performance change
    feasibilityScore: number;        // 0-100 how feasible this scenario is
  };
}

export interface TaskTypeAnalysis {
  taskType: string;
  description: string;
  volume: {
    requestsPerDay: number;
    tokensPerDay: number;
    costPerDay: number;
  };
  requirements: {
    minQuality: number;         // Minimum quality threshold
    maxLatency: number;         // Maximum acceptable latency (ms)
    minReliability: number;     // Minimum reliability requirement
    securityLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  modelSuitability: Array<{
    modelName: string;
    suitabilityScore: number;   // 0-100
    reasoning: string[];
    pros: string[];
    cons: string[];
  }>;
  currentOptimalModel: string;
  alternativeModels: string[];
  costOptimizationPotential: number; // % potential savings
}

export class PerformanceCostAnalyzer extends EventEmitter {
  private performanceMetrics: Map<string, PerformanceCostMetrics> = new Map();
  private comparisons: Map<string, ModelComparison> = new Map();
  private optimizationScenarios: Map<string, CostOptimizationScenario> = new Map();
  private taskAnalyses: Map<string, TaskTypeAnalysis> = new Map();
  
  private config = {
    analysisWindow: 86400000,        // 24 hours
    minDataPoints: 100,              // Minimum requests for analysis
    valueScoreWeights: {
      quality: 0.4,                  // 40% weight on quality
      cost: 0.3,                     // 30% weight on cost efficiency
      performance: 0.2,              // 20% weight on performance
      reliability: 0.1               // 10% weight on reliability
    },
    benchmarkUpdateInterval: 3600000, // Update benchmarks every hour
  };

  private benchmarkTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.initializeTaskTypes();
  }

  private initializeTaskTypes(): void {
    const defaultTaskTypes: TaskTypeAnalysis[] = [
      {
        taskType: 'code_generation',
        description: 'Generating production-ready code',
        volume: { requestsPerDay: 500, tokensPerDay: 100000, costPerDay: 50 },
        requirements: {
          minQuality: 0.85,
          maxLatency: 5000,
          minReliability: 0.95,
          securityLevel: 'high'
        },
        modelSuitability: [
          {
            modelName: 'deepseek-v3',
            suitabilityScore: 95,
            reasoning: ['Excellent code quality', 'Fast inference', 'Cost-effective'],
            pros: ['Best-in-class coding', 'Low cost', 'High throughput'],
            cons: ['Limited to coding tasks', 'Newer model with less history']
          },
          {
            modelName: 'claude-sonnet-4',
            suitabilityScore: 90,
            reasoning: ['Superior reasoning', 'Excellent security', 'High reliability'],
            pros: ['Best reasoning ability', 'Proven reliability', 'Security focused'],
            cons: ['Higher cost', 'Slower inference']
          }
        ],
        currentOptimalModel: 'deepseek-v3',
        alternativeModels: ['claude-sonnet-4', 'gpt-4o', 'groq-llama3-70b'],
        costOptimizationPotential: 35
      },
      {
        taskType: 'creative_writing',
        description: 'Creative content and documentation',
        volume: { requestsPerDay: 200, tokensPerDay: 80000, costPerDay: 25 },
        requirements: {
          minQuality: 0.8,
          maxLatency: 8000,
          minReliability: 0.9,
          securityLevel: 'medium'
        },
        modelSuitability: [
          {
            modelName: 'claude-sonnet-4',
            suitabilityScore: 95,
            reasoning: ['Excellent creativity', 'Nuanced understanding', 'High quality output'],
            pros: ['Superior creativity', 'Natural language', 'Context awareness'],
            cons: ['Higher cost', 'Slower speed']
          },
          {
            modelName: 'gpt-4o',
            suitabilityScore: 85,
            reasoning: ['Good creativity', 'Fast response', 'Reliable'],
            pros: ['Good balance', 'Fast inference', 'Well-tested'],
            cons: ['Less nuanced', 'Higher cost than alternatives']
          }
        ],
        currentOptimalModel: 'claude-sonnet-4',
        alternativeModels: ['gpt-4o', 'groq-llama3-70b', 'gemini-2.5-pro'],
        costOptimizationPotential: 20
      },
      {
        taskType: 'data_analysis',
        description: 'Analyzing and interpreting data',
        volume: { requestsPerDay: 150, tokensPerDay: 60000, costPerDay: 20 },
        requirements: {
          minQuality: 0.9,
          maxLatency: 10000,
          minReliability: 0.95,
          securityLevel: 'high'
        },
        modelSuitability: [
          {
            modelName: 'claude-sonnet-4',
            suitabilityScore: 95,
            reasoning: ['Superior analytical reasoning', 'Accurate interpretations', 'Reliable'],
            pros: ['Best reasoning', 'High accuracy', 'Detailed analysis'],
            cons: ['Higher cost', 'Slower processing']
          },
          {
            modelName: 'gemini-2.5-pro',
            suitabilityScore: 85,
            reasoning: ['Good analytical capabilities', 'Cost-effective', 'Fast processing'],
            pros: ['Good value', 'Fast inference', 'Reliable'],
            cons: ['Less sophisticated reasoning', 'Occasional inaccuracies']
          }
        ],
        currentOptimalModel: 'claude-sonnet-4',
        alternativeModels: ['gemini-2.5-pro', 'gpt-4-turbo', 'groq-llama3-70b'],
        costOptimizationPotential: 30
      }
    ];

    defaultTaskTypes.forEach(task => {
      this.taskAnalyses.set(task.taskType, task);
    });

    Logger.info(`Initialized analysis for ${defaultTaskTypes.length} task types`);
  }

  /**
   * Start performance-cost analysis system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Performance-cost analyzer is already running');
      return;
    }

    Logger.info('Starting performance-cost analysis...');

    // Start benchmark updates
    this.benchmarkTimer = setInterval(() => {
      this.updateBenchmarks();
    }, this.config.benchmarkUpdateInterval);

    this.isRunning = true;
    this.emit('analyzerStarted');

    // Perform initial analysis
    await this.performInitialAnalysis();

    Logger.info('Performance-cost analyzer started successfully');
  }

  /**
   * Stop performance-cost analysis system
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping performance-cost analysis...');

    if (this.benchmarkTimer) {
      clearInterval(this.benchmarkTimer);
      this.benchmarkTimer = null;
    }

    this.isRunning = false;
    this.emit('analyzerStopped');

    Logger.info('Performance-cost analyzer stopped');
  }

  /**
   * Analyze performance vs cost for a specific model
   */
  async analyzeModelPerformanceCost(
    modelName: string,
    period: string = '24h'
  ): Promise<PerformanceCostMetrics> {
    const cacheKey = `${modelName}_${period}`;
    const cached = this.performanceMetrics.get(cacheKey);
    
    // Return cached if recent (within 5 minutes)
    if (cached && Date.now() - cached.period.end.getTime() < 300000) {
      return cached;
    }

    // Gather metrics from various monitoring systems
    const healthMetrics = await this.getModelHealthMetrics(modelName);
    const costMetrics = await this.getCostMetrics(modelName, period);
    const latencyMetrics = await this.getLatencyMetrics(modelName, period);

    // Calculate performance metrics
    const performance = {
      quality: healthMetrics.qualityScore,
      latency: healthMetrics.avgLatency,
      reliability: healthMetrics.availability,
      throughput: healthMetrics.throughput,
      errorRate: healthMetrics.errorRate
    };

    // Calculate cost metrics
    const cost = {
      totalCost: costMetrics.totalCost,
      costPerToken: costMetrics.currentRate,
      costPerRequest: costMetrics.averageCostPerRequest,
      costPerSecond: this.calculateCostPerSecond(costMetrics, performance)
    };

    // Calculate efficiency metrics
    const efficiency = this.calculateEfficiencyMetrics(performance, cost);

    // Calculate ROI metrics
    const roi = this.calculateROIMetrics(performance, cost, period);

    // Analyze trends
    const trends = await this.analyzeTrends(modelName, period);

    const metrics: PerformanceCostMetrics = {
      modelName,
      provider: healthMetrics.provider,
      period: {
        start: new Date(Date.now() - this.parsePeriodMs(period)),
        end: new Date(),
        duration: period
      },
      performance,
      cost,
      efficiency,
      roi,
      ranking: { overallRank: 0, performanceRank: 0, costRank: 0, efficiencyRank: 0 },
      trends
    };

    // Cache the result
    this.performanceMetrics.set(cacheKey, metrics);

    Logger.debug(`Analyzed performance-cost for ${modelName}: Value Score ${efficiency.valueScore.toFixed(1)}`);
    return metrics;
  }

  /**
   * Compare multiple models for value optimization
   */
  async compareModelsForTask(
    taskType: string,
    modelNames: string[],
    period: string = '24h'
  ): Promise<ModelComparison> {
    const comparisonId = `comparison_${taskType}_${Date.now()}`;
    
    // Analyze each model
    const modelAnalyses = await Promise.all(
      modelNames.map(async (modelName) => {
        const metrics = await this.analyzeModelPerformanceCost(modelName, period);
        const suitabilityScore = this.calculateTaskSuitability(modelName, taskType);
        
        return {
          modelName,
          provider: metrics.provider,
          metrics,
          suitabilityScore
        };
      })
    );

    // Rank models
    const rankedModels = this.rankModels(modelAnalyses);

    // Determine winners
    const winner = {
      overall: rankedModels.sort((a, b) => b.metrics.efficiency.valueScore - a.metrics.efficiency.valueScore)[0].modelName,
      performance: rankedModels.sort((a, b) => this.calculatePerformanceScore(b.metrics) - this.calculatePerformanceScore(a.metrics))[0].modelName,
      cost: rankedModels.sort((a, b) => a.metrics.cost.totalCost - b.metrics.cost.totalCost)[0].modelName,
      efficiency: rankedModels.sort((a, b) => b.metrics.efficiency.performancePerDollar - a.metrics.efficiency.performancePerDollar)[0].modelName
    };

    // Generate insights
    const insights = this.generateComparisonInsights(rankedModels, taskType);

    // Generate recommendations
    const recommendations = await this.generateValueOptimizationRecommendations(rankedModels, taskType);

    const comparison: ModelComparison = {
      comparisonId,
      timestamp: new Date(),
      taskType,
      models: rankedModels,
      winner,
      insights,
      recommendations
    };

    this.comparisons.set(comparisonId, comparison);
    this.emit('modelComparison', comparison);

    Logger.info(`Compared ${modelNames.length} models for ${taskType}: Winner = ${winner.overall}`);
    return comparison;
  }

  /**
   * Generate cost optimization scenarios
   */
  async generateOptimizationScenarios(
    targetBudgetReduction: number,
    constraints?: {
      minQualityThreshold?: number;
      maxLatencyIncrease?: number;
      minReliabilityThreshold?: number;
      excludedModels?: string[];
    }
  ): Promise<CostOptimizationScenario[]> {
    const scenarios: CostOptimizationScenario[] = [];
    
    // Conservative scenario (10-20% reduction)
    const conservativeScenario = await this.generateOptimizationScenario(
      'conservative',
      'Conservative Cost Optimization',
      'Low-risk optimizations with minimal quality impact',
      Math.min(targetBudgetReduction, 20),
      {
        minQualityThreshold: constraints?.minQualityThreshold || 0.9,
        maxLatencyIncrease: constraints?.maxLatencyIncrease || 10,
        minReliabilityThreshold: constraints?.minReliabilityThreshold || 0.95,
        excludedModels: constraints?.excludedModels || [],
        requiredCapabilities: ['production_ready', 'reliable']
      }
    );
    scenarios.push(conservativeScenario);

    // Moderate scenario (20-40% reduction)
    if (targetBudgetReduction > 20) {
      const moderateScenario = await this.generateOptimizationScenario(
        'moderate',
        'Moderate Cost Optimization',
        'Balanced approach with acceptable quality tradeoffs',
        Math.min(targetBudgetReduction, 40),
        {
          minQualityThreshold: constraints?.minQualityThreshold || 0.8,
          maxLatencyIncrease: constraints?.maxLatencyIncrease || 25,
          minReliabilityThreshold: constraints?.minReliabilityThreshold || 0.9,
          excludedModels: constraints?.excludedModels || [],
          requiredCapabilities: ['production_ready']
        }
      );
      scenarios.push(moderateScenario);
    }

    // Aggressive scenario (40%+ reduction)
    if (targetBudgetReduction > 40) {
      const aggressiveScenario = await this.generateOptimizationScenario(
        'aggressive',
        'Aggressive Cost Optimization',
        'Maximum cost reduction with quality compromises',
        targetBudgetReduction,
        {
          minQualityThreshold: constraints?.minQualityThreshold || 0.7,
          maxLatencyIncrease: constraints?.maxLatencyIncrease || 50,
          minReliabilityThreshold: constraints?.minReliabilityThreshold || 0.85,
          excludedModels: constraints?.excludedModels || [],
          requiredCapabilities: []
        }
      );
      scenarios.push(aggressiveScenario);
    }

    return scenarios.sort((a, b) => b.results.feasibilityScore - a.results.feasibilityScore);
  }

  /**
   * Get value optimization recommendations
   */
  async getValueOptimizationRecommendations(
    modelName?: string,
    taskType?: string
  ): Promise<ValueOptimizationRecommendation[]> {
    const recommendations: ValueOptimizationRecommendation[] = [];

    if (modelName) {
      // Get recommendations for specific model
      const modelRecommendations = await this.getModelSpecificRecommendations(modelName, taskType);
      recommendations.push(...modelRecommendations);
    } else {
      // Get general recommendations across all models
      const generalRecommendations = await this.getGeneralOptimizationRecommendations();
      recommendations.push(...generalRecommendations);
    }

    // Sort by potential value improvement
    return recommendations.sort((a, b) => b.metrics.valueImprovement - a.metrics.valueImprovement);
  }

  /**
   * Get task-specific analysis and recommendations
   */
  getTaskTypeAnalysis(taskType: string): TaskTypeAnalysis | null {
    return this.taskAnalyses.get(taskType) || null;
  }

  /**
   * Update task type requirements and optimal models
   */
  async updateTaskTypeAnalysis(taskType: string, updates: Partial<TaskTypeAnalysis>): Promise<void> {
    const existing = this.taskAnalyses.get(taskType);
    if (!existing) {
      throw new Error(`Task type ${taskType} not found`);
    }

    const updated = { ...existing, ...updates };
    this.taskAnalyses.set(taskType, updated);

    // Re-analyze model suitability
    await this.reanalyzeTaskSuitability(taskType);

    Logger.info(`Updated analysis for task type: ${taskType}`);
  }

  // Private helper methods

  private async performInitialAnalysis(): Promise<void> {
    Logger.info('Performing initial performance-cost analysis...');
    
    // Analyze all known models
    const modelNames = [
      'claude-sonnet-4', 'claude-haiku-3', 'gpt-4-turbo', 'gpt-4o',
      'gemini-2.5-pro', 'mistral-large-2407', 'deepseek-v3', 'llama-3.3-70b'
    ];

    const analysisPromises = modelNames.map(modelName => 
      this.analyzeModelPerformanceCost(modelName, '24h').catch(error => {
        Logger.warn(`Failed to analyze ${modelName}:`, error);
        return null;
      })
    );

    const results = await Promise.all(analysisPromises);
    const validResults = results.filter(r => r !== null);

    Logger.info(`Completed initial analysis for ${validResults.length} models`);
  }

  private async updateBenchmarks(): Promise<void> {
    try {
      // Update performance benchmarks for all models
      const modelNames = Array.from(this.performanceMetrics.keys()).map(key => key.split('_')[0]);
      const uniqueModels = [...new Set(modelNames)];

      for (const modelName of uniqueModels) {
        await this.analyzeModelPerformanceCost(modelName, '1h');
      }

      Logger.debug('Updated performance-cost benchmarks');
    } catch (error) {
      Logger.error('Failed to update benchmarks:', error);
    }
  }

  private calculateEfficiencyMetrics(
    performance: PerformanceCostMetrics['performance'],
    cost: PerformanceCostMetrics['cost']
  ): PerformanceCostMetrics['efficiency'] {
    // Calculate value score using weighted formula
    const qualityScore = performance.quality * 100;
    const latencyScore = Math.max(0, 100 - (performance.latency / 100));
    const reliabilityScore = performance.reliability * 100;
    const costScore = Math.max(0, 100 - (cost.costPerToken * 100000)); // Scale cost per token

    const valueScore = (
      qualityScore * this.config.valueScoreWeights.quality +
      costScore * this.config.valueScoreWeights.cost +
      latencyScore * this.config.valueScoreWeights.performance +
      reliabilityScore * this.config.valueScoreWeights.reliability
    );

    // Calculate efficiency ratings
    const performancePerDollar = (qualityScore * latencyScore) / (cost.totalCost || 1);
    const qualityPerDollar = performance.quality / (cost.costPerToken || 0.001);
    const speedPerDollar = performance.throughput / (cost.costPerToken || 0.001);

    let costEfficiencyRating: string;
    if (valueScore >= 85) costEfficiencyRating = 'excellent';
    else if (valueScore >= 70) costEfficiencyRating = 'good';
    else if (valueScore >= 55) costEfficiencyRating = 'fair';
    else costEfficiencyRating = 'poor';

    return {
      valueScore: Math.round(valueScore),
      costEfficiencyRating,
      performancePerDollar,
      qualityPerDollar,
      speedPerDollar
    };
  }

  private calculateROIMetrics(
    performance: PerformanceCostMetrics['performance'],
    cost: PerformanceCostMetrics['cost'],
    period: string
  ): PerformanceCostMetrics['roi'] {
    // Estimate value created based on quality and throughput
    const estimatedValuePerToken = 0.01; // $0.01 value per quality token
    const qualityTokens = performance.throughput * performance.quality * this.parsePeriodMs(period) / 1000;
    const valueCreated = qualityTokens * estimatedValuePerToken;

    const returnOnInvestment = cost.totalCost > 0 ? 
      ((valueCreated - cost.totalCost) / cost.totalCost) * 100 : 0;

    const paybackPeriod = valueCreated > cost.totalCost ? 1 : 
      cost.totalCost / (valueCreated / this.parsePeriodMs(period) * 86400000); // Days

    const netPresentValue = valueCreated - cost.totalCost;

    return {
      returnOnInvestment,
      valueCreated,
      paybackPeriod,
      netPresentValue
    };
  }

  private calculateCostPerSecond(
    costMetrics: any,
    performance: PerformanceCostMetrics['performance']
  ): number {
    const avgLatencySeconds = performance.latency / 1000;
    return costMetrics.averageCostPerRequest / Math.max(avgLatencySeconds, 0.1);
  }

  private async analyzeTrends(modelName: string, period: string): Promise<PerformanceCostMetrics['trends']> {
    // This would analyze historical data to determine trends
    // For now, return simulated trends
    return {
      valueImprovement: 'stable',
      costTrend: 'stable',
      performanceTrend: 'improving',
      efficiencyTrend: 'improving'
    };
  }

  private calculateTaskSuitability(modelName: string, taskType: string): number {
    const taskAnalysis = this.taskAnalyses.get(taskType);
    if (!taskAnalysis) return 50; // Default neutral score

    const modelSuitability = taskAnalysis.modelSuitability.find(
      m => m.modelName === modelName
    );

    return modelSuitability?.suitabilityScore || 50;
  }

  private rankModels(models: ModelComparison['models']): ModelComparison['models'] {
    // Sort by overall value score
    const sortedByValue = [...models].sort((a, b) => 
      b.metrics.efficiency.valueScore - a.metrics.efficiency.valueScore
    );

    // Assign ranks
    sortedByValue.forEach((model, index) => {
      model.metrics.ranking.overallRank = index + 1;
    });

    // Sort by performance and assign performance ranks
    const sortedByPerformance = [...models].sort((a, b) => 
      this.calculatePerformanceScore(b.metrics) - this.calculatePerformanceScore(a.metrics)
    );
    sortedByPerformance.forEach((model, index) => {
      const originalModel = models.find(m => m.modelName === model.modelName);
      if (originalModel) originalModel.metrics.ranking.performanceRank = index + 1;
    });

    // Sort by cost and assign cost ranks (lower cost = better rank)
    const sortedByCost = [...models].sort((a, b) => 
      a.metrics.cost.totalCost - b.metrics.cost.totalCost
    );
    sortedByCost.forEach((model, index) => {
      const originalModel = models.find(m => m.modelName === model.modelName);
      if (originalModel) originalModel.metrics.ranking.costRank = index + 1;
    });

    // Sort by efficiency and assign efficiency ranks
    const sortedByEfficiency = [...models].sort((a, b) => 
      b.metrics.efficiency.performancePerDollar - a.metrics.efficiency.performancePerDollar
    );
    sortedByEfficiency.forEach((model, index) => {
      const originalModel = models.find(m => m.modelName === model.modelName);
      if (originalModel) originalModel.metrics.ranking.efficiencyRank = index + 1;
    });

    return sortedByValue;
  }

  private calculatePerformanceScore(metrics: PerformanceCostMetrics): number {
    return (
      metrics.performance.quality * 40 +
      (100 - Math.min(metrics.performance.latency / 100, 100)) * 30 +
      metrics.performance.reliability * 100 * 20 +
      Math.min(metrics.performance.throughput / 10, 100) * 10
    );
  }

  private generateComparisonInsights(
    models: ModelComparison['models'],
    taskType: string
  ): ModelComparison['insights'] {
    const keyFindings: string[] = [];
    const surprises: string[] = [];
    const caveats: string[] = [];

    // Analyze cost vs performance spread
    const costRange = Math.max(...models.map(m => m.metrics.cost.totalCost)) - 
                     Math.min(...models.map(m => m.metrics.cost.totalCost));
    const qualityRange = Math.max(...models.map(m => m.metrics.performance.quality)) - 
                        Math.min(...models.map(m => m.metrics.performance.quality));

    if (costRange > 100) {
      keyFindings.push(`Significant cost variation: $${costRange.toFixed(2)} difference between cheapest and most expensive models`);
    }

    if (qualityRange > 0.2) {
      keyFindings.push(`Notable quality differences: ${(qualityRange * 100).toFixed(1)}% quality spread across models`);
    }

    // Find best value model
    const bestValue = models.reduce((best, current) => 
      current.metrics.efficiency.valueScore > best.metrics.efficiency.valueScore ? current : best
    );
    keyFindings.push(`${bestValue.modelName} provides the best overall value for ${taskType} tasks`);

    // Identify surprises (high-performing low-cost or vice versa)
    const cheapestModel = models.reduce((cheapest, current) => 
      current.metrics.cost.totalCost < cheapest.metrics.cost.totalCost ? current : cheapest
    );
    
    if (cheapestModel.metrics.performance.quality > 0.8) {
      surprises.push(`${cheapestModel.modelName} offers surprisingly high quality (${(cheapestModel.metrics.performance.quality * 100).toFixed(1)}%) at the lowest cost`);
    }

    // Add caveats
    caveats.push('Performance metrics are based on recent historical data and may vary');
    caveats.push('Cost projections assume current usage patterns and pricing');
    
    if (models.some(m => m.metrics.period.duration === '24h')) {
      caveats.push('Analysis based on 24-hour window - longer-term trends may differ');
    }

    return { keyFindings, surprises, caveats };
  }

  private async generateValueOptimizationRecommendations(
    models: ModelComparison['models'],
    taskType: string
  ): Promise<ValueOptimizationRecommendation[]> {
    const recommendations: ValueOptimizationRecommendation[] = [];
    
    const currentBest = models[0]; // Already sorted by value score
    const cheapest = models.reduce((cheapest, current) => 
      current.metrics.cost.totalCost < cheapest.metrics.cost.totalCost ? current : cheapest
    );

    // Recommend switching to cheaper alternative if quality difference is minimal
    if (cheapest.modelName !== currentBest.modelName) {
      const qualityDiff = (currentBest.metrics.performance.quality - cheapest.metrics.performance.quality) * 100;
      const costSavings = currentBest.metrics.cost.totalCost - cheapest.metrics.cost.totalCost;

      if (qualityDiff < 10 && costSavings > 5) { // Less than 10% quality loss, more than $5 savings
        recommendations.push({
          id: `switch_to_${cheapest.modelName}_${Date.now()}`,
          type: 'model_switch',
          priority: costSavings > 20 ? 'high' : 'medium',
          confidence: 0.8,
          title: `Switch to ${cheapest.modelName} for cost optimization`,
          description: `Switch from ${currentBest.modelName} to ${cheapest.modelName} for ${taskType} tasks to reduce costs with minimal quality impact`,
          currentModel: currentBest.modelName,
          recommendedModel: cheapest.modelName,
          impact: {
            costSavings,
            performanceChange: this.calculatePerformanceChange(currentBest.metrics, cheapest.metrics),
            qualityChange: -qualityDiff,
            latencyChange: this.calculateLatencyChange(currentBest.metrics, cheapest.metrics),
            reliabilityChange: (cheapest.metrics.performance.reliability - currentBest.metrics.performance.reliability) * 100
          },
          implementation: {
            effort: 'low',
            timeToImplement: 2,
            riskLevel: 'low',
            prerequisites: ['Test with sample workload', 'Monitor quality metrics'],
            steps: [
              'Update model configuration',
              'Deploy to staging environment',
              'Run quality validation tests',
              'Gradually roll out to production',
              'Monitor performance and cost metrics'
            ]
          },
          tradeoffs: {
            pros: [
              `Save $${costSavings.toFixed(2)} per analysis period`,
              'Maintain acceptable quality levels',
              'Potentially faster response times'
            ],
            cons: [
              qualityDiff > 5 ? `${qualityDiff.toFixed(1)}% reduction in quality` : 'Minimal quality impact',
              'Need to monitor for quality regressions'
            ],
            risks: [
              'Quality may degrade for complex tasks',
              'May need fallback to premium model for critical tasks'
            ]
          },
          metrics: {
            currentValueScore: currentBest.metrics.efficiency.valueScore,
            projectedValueScore: cheapest.metrics.efficiency.valueScore,
            valueImprovement: ((cheapest.metrics.efficiency.valueScore - currentBest.metrics.efficiency.valueScore) / currentBest.metrics.efficiency.valueScore) * 100
          }
        });
      }
    }

    return recommendations;
  }

  private calculatePerformanceChange(current: PerformanceCostMetrics, alternative: PerformanceCostMetrics): number {
    const currentScore = this.calculatePerformanceScore(current);
    const alternativeScore = this.calculatePerformanceScore(alternative);
    return ((alternativeScore - currentScore) / currentScore) * 100;
  }

  private calculateLatencyChange(current: PerformanceCostMetrics, alternative: PerformanceCostMetrics): number {
    return ((alternative.performance.latency - current.performance.latency) / current.performance.latency) * 100;
  }

  private async generateOptimizationScenario(
    scenarioId: string,
    name: string,
    description: string,
    targetBudgetReduction: number,
    constraints: CostOptimizationScenario['constraints']
  ): Promise<CostOptimizationScenario> {
    const optimizations: CostOptimizationScenario['optimizations'] = [];
    
    // Analyze each task type for optimization opportunities
    for (const [taskType, analysis] of this.taskAnalyses) {
      const taskOptimization = await this.optimizeTaskType(
        taskType,
        analysis,
        targetBudgetReduction,
        constraints
      );
      
      if (taskOptimization) {
        optimizations.push(taskOptimization);
      }
    }

    // Calculate total impact
    const totalSavings = optimizations.reduce((sum, opt) => sum + opt.expectedSavings, 0);
    const currentCost = Array.from(this.taskAnalyses.values())
      .reduce((sum, task) => sum + task.volume.costPerDay, 0);
    
    const budgetReductionAchieved = currentCost > 0 ? (totalSavings / currentCost) * 100 : 0;
    const averageQualityChange = optimizations.length > 0 ?
      optimizations.reduce((sum, opt) => sum + opt.qualityImpact, 0) / optimizations.length : 0;
    const averagePerformanceChange = optimizations.length > 0 ?
      optimizations.reduce((sum, opt) => sum + opt.performanceImpact, 0) / optimizations.length : 0;

    // Calculate feasibility score
    const feasibilityScore = this.calculateFeasibilityScore(
      budgetReductionAchieved,
      targetBudgetReduction,
      averageQualityChange,
      constraints
    );

    return {
      scenarioId,
      name,
      description,
      targetBudgetReduction,
      constraints,
      optimizations,
      results: {
        totalSavings,
        budgetReductionAchieved,
        averageQualityChange,
        averagePerformanceChange,
        feasibilityScore
      }
    };
  }

  private async optimizeTaskType(
    taskType: string,
    analysis: TaskTypeAnalysis,
    targetReduction: number,
    constraints: CostOptimizationScenario['constraints']
  ): Promise<CostOptimizationScenario['optimizations'][0] | null> {
    // Find suitable alternative models
    const suitableModels = analysis.modelSuitability
      .filter(model => 
        !constraints.excludedModels.includes(model.modelName) &&
        model.suitabilityScore >= 70 && // Minimum suitability
        model.modelName !== analysis.currentOptimalModel
      )
      .sort((a, b) => b.suitabilityScore - a.suitabilityScore);

    if (suitableModels.length === 0) {
      return null; // No suitable alternatives
    }

    const bestAlternative = suitableModels[0];
    
    // Estimate cost savings (simplified calculation)
    const currentDailyCost = analysis.volume.costPerDay;
    const estimatedSavings = currentDailyCost * (targetReduction / 100) * 0.5; // Conservative estimate
    
    // Estimate quality and performance impact
    const qualityImpact = (bestAlternative.suitabilityScore - 90) / 10; // % change
    const performanceImpact = qualityImpact * 0.5; // Assume performance correlates with quality

    return {
      description: `Switch ${taskType} tasks from ${analysis.currentOptimalModel} to ${bestAlternative.modelName}`,
      models: [bestAlternative.modelName],
      expectedSavings: estimatedSavings,
      qualityImpact,
      performanceImpact,
      implementationComplexity: estimatedSavings > currentDailyCost * 0.3 ? 'medium' : 'low'
    };
  }

  private calculateFeasibilityScore(
    achievedReduction: number,
    targetReduction: number,
    qualityImpact: number,
    constraints: CostOptimizationScenario['constraints']
  ): number {
    let score = 100;

    // Penalize if target not met
    if (achievedReduction < targetReduction) {
      score -= (targetReduction - achievedReduction) * 2;
    }

    // Penalize quality degradation beyond acceptable limits
    if (qualityImpact < 0) {
      const qualityPenalty = Math.abs(qualityImpact) * 5;
      score -= qualityPenalty;
    }

    // Bonus for exceeding constraints
    if (qualityImpact > -(100 - constraints.minQualityThreshold * 100)) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  private async getModelSpecificRecommendations(
    modelName: string,
    taskType?: string
  ): Promise<ValueOptimizationRecommendation[]> {
    const recommendations: ValueOptimizationRecommendation[] = [];
    
    const metrics = await this.analyzeModelPerformanceCost(modelName, '24h');
    
    // Check if model is underperforming for its cost
    if (metrics.efficiency.valueScore < 60) {
      recommendations.push({
        id: `underperform_${modelName}_${Date.now()}`,
        type: 'model_switch',
        priority: 'high',
        confidence: 0.9,
        title: `${modelName} is underperforming for its cost`,
        description: `Consider switching to a more cost-effective alternative`,
        currentModel: modelName,
        impact: {
          costSavings: metrics.cost.totalCost * 0.3, // Estimated 30% savings
          performanceChange: 5, // Slight improvement expected
          qualityChange: -5, // Slight quality reduction acceptable
          latencyChange: -10, // Faster alternative
          reliabilityChange: 0
        },
        implementation: {
          effort: 'medium',
          timeToImplement: 4,
          riskLevel: 'medium',
          prerequisites: ['Identify suitable alternatives', 'Quality validation testing'],
          steps: [
            'Benchmark alternative models',
            'Conduct A/B testing',
            'Gradual migration plan',
            'Monitor quality metrics'
          ]
        },
        tradeoffs: {
          pros: ['Significant cost savings', 'Potentially better performance'],
          cons: ['Some quality reduction', 'Migration effort required'],
          risks: ['Quality regression', 'Integration challenges']
        },
        metrics: {
          currentValueScore: metrics.efficiency.valueScore,
          projectedValueScore: 75, // Target improvement
          valueImprovement: ((75 - metrics.efficiency.valueScore) / metrics.efficiency.valueScore) * 100
        }
      });
    }

    return recommendations;
  }

  private async getGeneralOptimizationRecommendations(): Promise<ValueOptimizationRecommendation[]> {
    // This would analyze all models and task types for general optimization opportunities
    return [];
  }

  private async reanalyzeTaskSuitability(taskType: string): Promise<void> {
    // Re-calculate model suitability scores for the updated task requirements
    Logger.debug(`Re-analyzing suitability for task type: ${taskType}`);
  }

  private parsePeriodMs(period: string): number {
    const match = period.match(/^(\d+)([mhd])$/);
    if (!match) return 86400000; // Default 24 hours

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 86400000;
    }
  }

  // Mock data methods (to be replaced with actual monitoring system integration)
  private async getModelHealthMetrics(modelName: string): Promise<ModelHealthMetrics> {
    // This would integrate with the actual ModelTracker
    return {
      modelName,
      provider: this.getProviderFromModel(modelName),
      availability: 0.99,
      avgLatency: 2500,
      errorRate: 0.02,
      costPerToken: 0.000003,
      qualityScore: 0.85,
      throughput: 50,
      lastUpdated: new Date(),
      trends: {
        latency: 'stable',
        cost: 'stable',
        quality: 'improving'
      }
    };
  }

  private async getCostMetrics(modelName: string, period: string): Promise<CostMetrics> {
    // This would integrate with the actual CostTracker
    return {
      modelName,
      provider: this.getProviderFromModel(modelName),
      currentRate: 0.000003,
      totalCost: 25.50,
      requestCount: 1000,
      tokenCount: 50000,
      averageCostPerRequest: 0.0255,
      costTrend: 'stable',
      timeframe: period,
      lastUpdated: new Date()
    };
  }

  private async getLatencyMetrics(modelName: string, period: string): Promise<LatencyMetrics> {
    // This would integrate with the actual LatencyMonitor
    return {
      p50: 2000,
      p95: 4500,
      p99: 8000,
      avg: 2500,
      min: 800,
      max: 12000,
      trend: 'stable',
      sampleCount: 1000,
      timeframe: period,
      timestamp: new Date()
    };
  }

  private getProviderFromModel(modelName: string): string {
    if (modelName.includes('claude')) return 'anthropic';
    if (modelName.includes('gpt')) return 'openai';
    if (modelName.includes('gemini')) return 'google';
    if (modelName.includes('mistral')) return 'mistral';
    if (modelName.includes('deepseek')) return 'deepseek';
    if (modelName.includes('llama')) return 'ollama';
    return 'unknown';
  }
}

// Export singleton instance
export const performanceCostAnalyzer = new PerformanceCostAnalyzer();