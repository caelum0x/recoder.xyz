interface AIUsageCost {
  id: string;
  projectId: string;
  timestamp: Date;
  provider: 'openai' | 'anthropic' | 'google' | 'azure' | 'local' | 'custom';
  model: string;
  operationType: 'generation' | 'analysis' | 'completion' | 'embedding' | 'fine-tuning';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: {
    inputCost: number;
    outputCost: number;
    totalCost: number;
    currency: string;
  };
  requestMetadata: {
    userId?: string;
    sessionId?: string;
    feature: string; // Which part of the system made the request
    requestId: string;
    temperature?: number;
    maxTokens?: number;
    prompt?: string; // Hashed for privacy
  };
  performance: {
    latency: number; // milliseconds
    timeToFirstToken?: number;
    tokensPerSecond?: number;
    success: boolean;
    errorCode?: string;
  };
  context: {
    environment: 'development' | 'staging' | 'production';
    version: string;
    commitHash?: string;
    cacheHit: boolean;
    retryCount: number;
  };
}

interface CostBudget {
  id: string;
  name: string;
  scope: 'project' | 'user' | 'feature' | 'organization';
  scopeId: string;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
  limits: {
    totalCost: number;
    maxCostPerRequest: number;
    maxTokensPerRequest: number;
    maxRequestsPerMinute: number;
    maxRequestsPerHour: number;
    maxRequestsPerDay: number;
  };
  alerts: {
    thresholds: number[]; // Percentage thresholds (e.g., [50, 75, 90, 100])
    channels: ('email' | 'slack' | 'webhook' | 'sms')[];
    recipients: string[];
  };
  currentUsage: {
    totalCost: number;
    totalTokens: number;
    requestCount: number;
    lastUpdated: Date;
  };
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface CostOptimization {
  id: string;
  type: 'model-recommendation' | 'prompt-optimization' | 'caching-opportunity' | 'batch-processing' | 'rate-limiting';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: {
    estimatedSavings: number; // Daily savings
    savingsPercentage: number;
    implementationEffort: 'low' | 'medium' | 'high';
    riskLevel: 'low' | 'medium' | 'high';
  };
  recommendation: {
    action: string;
    details: string[];
    codeExample?: string;
    alternativeModel?: {
      current: string;
      recommended: string;
      costReduction: number;
      performanceImpact: string;
    };
  };
  metrics: {
    affectedRequests: number;
    currentDailyCost: number;
    projectedDailyCost: number;
    implementationTimeEstimate: number; // hours
  };
  status: 'pending' | 'in-progress' | 'implemented' | 'dismissed';
  createdAt: Date;
  implementedAt?: Date;
}

interface UsagePattern {
  pattern: string;
  frequency: number;
  averageCost: number;
  totalCost: number;
  requestCount: number;
  optimization: CostOptimization[];
  examples: Array<{
    requestId: string;
    timestamp: Date;
    cost: number;
    tokens: number;
  }>;
}

interface CostReport {
  id: string;
  generatedAt: Date;
  period: {
    start: Date;
    end: Date;
    type: 'daily' | 'weekly' | 'monthly' | 'custom';
  };
  summary: {
    totalCost: number;
    totalTokens: number;
    totalRequests: number;
    averageCostPerRequest: number;
    averageCostPerToken: number;
    costTrend: 'increasing' | 'decreasing' | 'stable';
    projectedMonthlyCost: number;
  };
  breakdown: {
    byProvider: Record<string, { cost: number; tokens: number; requests: number }>;
    byModel: Record<string, { cost: number; tokens: number; requests: number }>;
    byFeature: Record<string, { cost: number; tokens: number; requests: number }>;
    byUser: Record<string, { cost: number; tokens: number; requests: number }>;
    byEnvironment: Record<string, { cost: number; tokens: number; requests: number }>;
  };
  topExpenses: Array<{
    category: string;
    description: string;
    cost: number;
    percentage: number;
  }>;
  optimizations: CostOptimization[];
  budgetStatus: Array<{
    budgetId: string;
    budgetName: string;
    spent: number;
    limit: number;
    utilization: number;
    status: 'safe' | 'warning' | 'exceeded';
  }>;
}

export class CostOptimizationEngine {
  private costs: Map<string, AIUsageCost[]> = new Map();
  private budgets: Map<string, CostBudget> = new Map();
  private optimizations: Map<string, CostOptimization> = new Map();
  private patterns: Map<string, UsagePattern> = new Map();
  private reports: Map<string, CostReport> = new Map();
  private alertThresholds: Map<string, number> = new Map();

  constructor() {
    this.initializeDefaultBudgets();
    this.loadHistoricalData();
  }

  async recordAIUsage(usage: Omit<AIUsageCost, 'id' | 'timestamp'>): Promise<AIUsageCost> {
    const costRecord: AIUsageCost = {
      ...usage,
      id: this.generateUsageId(),
      timestamp: new Date()
    };

    // Store the usage record
    const projectCosts = this.costs.get(usage.projectId) || [];
    projectCosts.push(costRecord);
    this.costs.set(usage.projectId, projectCosts);

    // Update budget usage
    await this.updateBudgetUsage(costRecord);

    // Check for budget alerts
    await this.checkBudgetAlerts(usage.projectId);

    // Analyze for optimization opportunities
    await this.analyzeOptimizationOpportunities(costRecord);

    // Update usage patterns
    await this.updateUsagePatterns(costRecord);

    return costRecord;
  }

  async createBudget(budget: Omit<CostBudget, 'id' | 'currentUsage' | 'createdAt' | 'updatedAt'>): Promise<CostBudget> {
    const newBudget: CostBudget = {
      ...budget,
      id: this.generateBudgetId(),
      currentUsage: {
        totalCost: 0,
        totalTokens: 0,
        requestCount: 0,
        lastUpdated: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.budgets.set(newBudget.id, newBudget);
    return newBudget;
  }

  async updateBudget(budgetId: string, updates: Partial<CostBudget>): Promise<CostBudget> {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    const updatedBudget = {
      ...budget,
      ...updates,
      id: budgetId, // Preserve ID
      updatedAt: new Date()
    };

    this.budgets.set(budgetId, updatedBudget);
    return updatedBudget;
  }

  async getBudgetStatus(budgetId: string): Promise<{
    budget: CostBudget;
    utilization: number;
    remaining: number;
    projectedOverage: number;
    timeRemaining: number; // days
    status: 'safe' | 'warning' | 'critical' | 'exceeded';
    recommendations: string[];
  }> {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    const utilization = (budget.currentUsage.totalCost / budget.limits.totalCost) * 100;
    const remaining = budget.limits.totalCost - budget.currentUsage.totalCost;
    
    // Calculate time remaining in current period
    const now = new Date();
    const periodStart = this.getPeriodStart(budget.period, now);
    const periodEnd = this.getPeriodEnd(budget.period, now);
    const totalPeriodDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.ceil((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
    const timeRemaining = totalPeriodDays - elapsedDays;

    // Project overage
    const dailyBurnRate = budget.currentUsage.totalCost / Math.max(1, elapsedDays);
    const projectedTotalCost = dailyBurnRate * totalPeriodDays;
    const projectedOverage = Math.max(0, projectedTotalCost - budget.limits.totalCost);

    // Determine status
    let status: 'safe' | 'warning' | 'critical' | 'exceeded';
    if (utilization >= 100) status = 'exceeded';
    else if (utilization >= 90 || projectedOverage > 0) status = 'critical';
    else if (utilization >= 75) status = 'warning';
    else status = 'safe';

    const recommendations = this.generateBudgetRecommendations(budget, utilization, projectedOverage);

    return {
      budget,
      utilization,
      remaining,
      projectedOverage,
      timeRemaining,
      status,
      recommendations
    };
  }

  async getCostAnalysis(projectId: string, options: {
    startDate?: Date;
    endDate?: Date;
    groupBy?: 'hour' | 'day' | 'week' | 'month';
    includeOptimizations?: boolean;
  }): Promise<{
    totalCost: number;
    breakdown: Record<string, number>;
    trends: Array<{
      period: string;
      cost: number;
      tokens: number;
      requests: number;
    }>;
    topModels: Array<{
      model: string;
      cost: number;
      usage: number;
      efficiency: number;
    }>;
    optimizationOpportunities: CostOptimization[];
    projections: {
      nextWeek: number;
      nextMonth: number;
      nextQuarter: number;
    };
  }> {
    const projectCosts = this.costs.get(projectId) || [];
    const startDate = options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = options.endDate || new Date();
    
    const filteredCosts = projectCosts.filter(cost => 
      cost.timestamp >= startDate && cost.timestamp <= endDate
    );

    const totalCost = filteredCosts.reduce((sum, cost) => sum + cost.cost.totalCost, 0);

    // Breakdown by various dimensions
    const breakdown = {
      byModel: this.groupCostsBy(filteredCosts, 'model'),
      byProvider: this.groupCostsBy(filteredCosts, 'provider'),
      byFeature: this.groupCostsBy(filteredCosts, cost => cost.requestMetadata.feature),
      byOperation: this.groupCostsBy(filteredCosts, 'operationType')
    };

    // Generate trends
    const trends = this.generateCostTrends(filteredCosts, options.groupBy || 'day');

    // Top models by cost
    const topModels = this.getTopModelsByMetric(filteredCosts, 'cost');

    // Get optimization opportunities
    const optimizationOpportunities = options.includeOptimizations 
      ? Array.from(this.optimizations.values()).filter(opt => 
          opt.status === 'pending' && opt.metrics.affectedRequests > 0
        )
      : [];

    // Generate projections
    const projections = this.generateCostProjections(filteredCosts);

    return {
      totalCost,
      breakdown,
      trends,
      topModels,
      optimizationOpportunities,
      projections
    };
  }

  async identifyOptimizations(projectId: string): Promise<CostOptimization[]> {
    const projectCosts = this.costs.get(projectId) || [];
    const recentCosts = projectCosts.filter(cost => 
      cost.timestamp >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    const optimizations: CostOptimization[] = [];

    // Model switching opportunities
    const modelOptimizations = await this.analyzeModelOptimizations(recentCosts);
    optimizations.push(...modelOptimizations);

    // Caching opportunities
    const cachingOptimizations = await this.analyzeCachingOpportunities(recentCosts);
    optimizations.push(...cachingOptimizations);

    // Prompt optimization opportunities
    const promptOptimizations = await this.analyzePromptOptimizations(recentCosts);
    optimizations.push(...promptOptimizations);

    // Batch processing opportunities
    const batchOptimizations = await this.analyzeBatchProcessingOpportunities(recentCosts);
    optimizations.push(...batchOptimizations);

    // Store optimizations
    optimizations.forEach(opt => this.optimizations.set(opt.id, opt));

    return optimizations.sort((a, b) => b.impact.estimatedSavings - a.impact.estimatedSavings);
  }

  async generateCostReport(projectId: string, period: CostReport['period']): Promise<CostReport> {
    const projectCosts = this.costs.get(projectId) || [];
    const filteredCosts = projectCosts.filter(cost => 
      cost.timestamp >= period.start && cost.timestamp <= period.end
    );

    const summary = this.calculateCostSummary(filteredCosts);
    const breakdown = this.calculateCostBreakdown(filteredCosts);
    const topExpenses = this.calculateTopExpenses(filteredCosts);
    const optimizations = await this.identifyOptimizations(projectId);
    const budgetStatus = this.calculateBudgetStatus(projectId);

    const report: CostReport = {
      id: this.generateReportId(),
      generatedAt: new Date(),
      period,
      summary,
      breakdown,
      topExpenses,
      optimizations: optimizations.slice(0, 10), // Top 10
      budgetStatus
    };

    this.reports.set(report.id, report);
    return report;
  }

  async getUsagePatterns(projectId: string): Promise<UsagePattern[]> {
    const projectCosts = this.costs.get(projectId) || [];
    const patterns = new Map<string, UsagePattern>();

    // Analyze patterns by feature + model combination
    projectCosts.forEach(cost => {
      const patternKey = `${cost.requestMetadata.feature}:${cost.model}`;
      
      if (!patterns.has(patternKey)) {
        patterns.set(patternKey, {
          pattern: patternKey,
          frequency: 0,
          averageCost: 0,
          totalCost: 0,
          requestCount: 0,
          optimization: [],
          examples: []
        });
      }

      const pattern = patterns.get(patternKey)!;
      pattern.frequency++;
      pattern.totalCost += cost.cost.totalCost;
      pattern.requestCount++;
      pattern.averageCost = pattern.totalCost / pattern.requestCount;
      
      if (pattern.examples.length < 5) {
        pattern.examples.push({
          requestId: cost.requestMetadata.requestId,
          timestamp: cost.timestamp,
          cost: cost.cost.totalCost,
          tokens: cost.totalTokens
        });
      }
    });

    // Generate optimizations for each pattern
    for (const pattern of patterns.values()) {
      pattern.optimization = await this.generatePatternOptimizations(pattern, projectCosts);
    }

    return Array.from(patterns.values())
      .sort((a, b) => b.totalCost - a.totalCost);
  }

  async implementOptimization(optimizationId: string): Promise<{
    success: boolean;
    message: string;
    estimatedSavings: number;
  }> {
    const optimization = this.optimizations.get(optimizationId);
    if (!optimization) {
      throw new Error(`Optimization ${optimizationId} not found`);
    }

    // Update status
    optimization.status = 'implemented';
    optimization.implementedAt = new Date();

    this.optimizations.set(optimizationId, optimization);

    return {
      success: true,
      message: `Successfully implemented ${optimization.title}`,
      estimatedSavings: optimization.impact.estimatedSavings
    };
  }

  private async updateBudgetUsage(cost: AIUsageCost): Promise<void> {
    for (const [budgetId, budget] of this.budgets) {
      if (this.isCostApplicableToBudget(cost, budget)) {
        budget.currentUsage.totalCost += cost.cost.totalCost;
        budget.currentUsage.totalTokens += cost.totalTokens;
        budget.currentUsage.requestCount++;
        budget.currentUsage.lastUpdated = new Date();
      }
    }
  }

  private async checkBudgetAlerts(projectId: string): Promise<void> {
    for (const [budgetId, budget] of this.budgets) {
      if (budget.scopeId === projectId && budget.active) {
        const utilization = (budget.currentUsage.totalCost / budget.limits.totalCost) * 100;
        
        for (const threshold of budget.alerts.thresholds) {
          if (utilization >= threshold && !this.alertThresholds.has(`${budgetId}_${threshold}`)) {
            await this.sendBudgetAlert(budget, threshold, utilization);
            this.alertThresholds.set(`${budgetId}_${threshold}`, utilization);
          }
        }
      }
    }
  }

  private async analyzeOptimizationOpportunities(cost: AIUsageCost): Promise<void> {
    // Check for expensive single requests
    if (cost.cost.totalCost > 1.0) { // More than $1
      const optimization: CostOptimization = {
        id: this.generateOptimizationId(),
        type: 'model-recommendation',
        severity: 'high',
        title: 'High-cost request detected',
        description: `Request ${cost.requestMetadata.requestId} cost $${cost.cost.totalCost.toFixed(2)}`,
        impact: {
          estimatedSavings: cost.cost.totalCost * 0.3, // 30% potential savings
          savingsPercentage: 30,
          implementationEffort: 'medium',
          riskLevel: 'low'
        },
        recommendation: {
          action: 'Consider using a more cost-effective model',
          details: [
            'Analyze if a smaller model could achieve similar results',
            'Implement prompt optimization to reduce token usage',
            'Consider caching similar requests'
          ]
        },
        metrics: {
          affectedRequests: 1,
          currentDailyCost: cost.cost.totalCost,
          projectedDailyCost: cost.cost.totalCost * 0.7,
          implementationTimeEstimate: 4
        },
        status: 'pending',
        createdAt: new Date()
      };

      this.optimizations.set(optimization.id, optimization);
    }
  }

  private async updateUsagePatterns(cost: AIUsageCost): Promise<void> {
    const patternKey = `${cost.requestMetadata.feature}:${cost.model}`;
    
    if (!this.patterns.has(patternKey)) {
      this.patterns.set(patternKey, {
        pattern: patternKey,
        frequency: 0,
        averageCost: 0,
        totalCost: 0,
        requestCount: 0,
        optimization: [],
        examples: []
      });
    }

    const pattern = this.patterns.get(patternKey)!;
    pattern.frequency++;
    pattern.totalCost += cost.cost.totalCost;
    pattern.requestCount++;
    pattern.averageCost = pattern.totalCost / pattern.requestCount;
  }

  private async analyzeModelOptimizations(costs: AIUsageCost[]): Promise<CostOptimization[]> {
    const optimizations: CostOptimization[] = [];
    const modelUsage = new Map<string, { cost: number; tokens: number; requests: number }>();

    // Group by model
    costs.forEach(cost => {
      const existing = modelUsage.get(cost.model) || { cost: 0, tokens: 0, requests: 0 };
      existing.cost += cost.cost.totalCost;
      existing.tokens += cost.totalTokens;
      existing.requests++;
      modelUsage.set(cost.model, existing);
    });

    // Look for expensive models with potential alternatives
    for (const [model, usage] of modelUsage) {
      if (usage.cost > 50 && usage.requests > 10) { // Significant usage
        const alternatives = this.getModelAlternatives(model);
        
        if (alternatives.length > 0) {
          const bestAlternative = alternatives[0];
          const potentialSavings = usage.cost * (1 - bestAlternative.costRatio);
          
          if (potentialSavings > 10) { // At least $10 savings
            optimizations.push({
              id: this.generateOptimizationId(),
              type: 'model-recommendation',
              severity: potentialSavings > 100 ? 'high' : 'medium',
              title: `Switch from ${model} to ${bestAlternative.name}`,
              description: `Could save $${potentialSavings.toFixed(2)} daily by switching models`,
              impact: {
                estimatedSavings: potentialSavings,
                savingsPercentage: Math.round((1 - bestAlternative.costRatio) * 100),
                implementationEffort: 'medium',
                riskLevel: 'medium'
              },
              recommendation: {
                action: `Replace ${model} with ${bestAlternative.name}`,
                details: [
                  `Test ${bestAlternative.name} with current prompts`,
                  'Compare output quality and latency',
                  'Implement gradual rollout',
                  'Monitor performance metrics'
                ],
                alternativeModel: {
                  current: model,
                  recommended: bestAlternative.name,
                  costReduction: Math.round((1 - bestAlternative.costRatio) * 100),
                  performanceImpact: bestAlternative.performanceImpact
                }
              },
              metrics: {
                affectedRequests: usage.requests,
                currentDailyCost: usage.cost,
                projectedDailyCost: usage.cost * bestAlternative.costRatio,
                implementationTimeEstimate: 8
              },
              status: 'pending',
              createdAt: new Date()
            });
          }
        }
      }
    }

    return optimizations;
  }

  private async analyzeCachingOpportunities(costs: AIUsageCost[]): Promise<CostOptimization[]> {
    const optimizations: CostOptimization[] = [];
    const promptHashes = new Map<string, { count: number; totalCost: number }>();

    // Group by prompt hash (similar requests)
    costs.forEach(cost => {
      if (cost.requestMetadata.prompt) {
        const existing = promptHashes.get(cost.requestMetadata.prompt) || { count: 0, totalCost: 0 };
        existing.count++;
        existing.totalCost += cost.cost.totalCost;
        promptHashes.set(cost.requestMetadata.prompt, existing);
      }
    });

    // Find repeated requests that could benefit from caching
    for (const [promptHash, usage] of promptHashes) {
      if (usage.count > 5 && usage.totalCost > 20) { // Repeated and expensive
        const savingsFromCaching = usage.totalCost * 0.8; // 80% could be saved with caching
        
        optimizations.push({
          id: this.generateOptimizationId(),
          type: 'caching-opportunity',
          severity: savingsFromCaching > 100 ? 'high' : 'medium',
          title: 'Implement response caching',
          description: `Detected ${usage.count} similar requests with potential savings of $${savingsFromCaching.toFixed(2)}`,
          impact: {
            estimatedSavings: savingsFromCaching,
            savingsPercentage: 80,
            implementationEffort: 'medium',
            riskLevel: 'low'
          },
          recommendation: {
            action: 'Implement intelligent caching for similar requests',
            details: [
              'Implement request deduplication',
              'Cache responses for similar prompts',
              'Set appropriate TTL for cached responses',
              'Monitor cache hit rates'
            ]
          },
          metrics: {
            affectedRequests: usage.count,
            currentDailyCost: usage.totalCost,
            projectedDailyCost: usage.totalCost * 0.2,
            implementationTimeEstimate: 12
          },
          status: 'pending',
          createdAt: new Date()
        });
      }
    }

    return optimizations;
  }

  private async analyzePromptOptimizations(costs: AIUsageCost[]): Promise<CostOptimization[]> {
    const optimizations: CostOptimization[] = [];
    
    // Find requests with high token usage
    const highTokenRequests = costs.filter(cost => cost.inputTokens > 2000);
    
    if (highTokenRequests.length > 10) {
      const totalCost = highTokenRequests.reduce((sum, cost) => sum + cost.cost.totalCost, 0);
      const potentialSavings = totalCost * 0.4; // 40% savings from prompt optimization
      
      optimizations.push({
        id: this.generateOptimizationId(),
        type: 'prompt-optimization',
        severity: potentialSavings > 50 ? 'high' : 'medium',
        title: 'Optimize prompts to reduce token usage',
        description: `${highTokenRequests.length} requests with high token usage detected`,
        impact: {
          estimatedSavings: potentialSavings,
          savingsPercentage: 40,
          implementationEffort: 'high',
          riskLevel: 'medium'
        },
        recommendation: {
          action: 'Optimize prompts to be more concise and effective',
          details: [
            'Review and shorten verbose prompts',
            'Remove unnecessary context and examples',
            'Use more efficient prompt structures',
            'Implement prompt templates for common use cases'
          ]
        },
        metrics: {
          affectedRequests: highTokenRequests.length,
          currentDailyCost: totalCost,
          projectedDailyCost: totalCost * 0.6,
          implementationTimeEstimate: 16
        },
        status: 'pending',
        createdAt: new Date()
      });
    }

    return optimizations;
  }

  private async analyzeBatchProcessingOpportunities(costs: AIUsageCost[]): Promise<CostOptimization[]> {
    const optimizations: CostOptimization[] = [];
    
    // Group requests by time windows to identify batch opportunities
    const timeWindows = new Map<string, AIUsageCost[]>();
    
    costs.forEach(cost => {
      const timeWindow = new Date(Math.floor(cost.timestamp.getTime() / (5 * 60 * 1000)) * 5 * 60 * 1000).toISOString();
      if (!timeWindows.has(timeWindow)) {
        timeWindows.set(timeWindow, []);
      }
      timeWindows.get(timeWindow)!.push(cost);
    });

    // Find time windows with many small requests
    for (const [timeWindow, windowCosts] of timeWindows) {
      if (windowCosts.length > 20 && windowCosts.every(cost => cost.inputTokens < 500)) {
        const totalCost = windowCosts.reduce((sum, cost) => sum + cost.cost.totalCost, 0);
        const potentialSavings = totalCost * 0.3; // 30% savings from batching
        
        optimizations.push({
          id: this.generateOptimizationId(),
          type: 'batch-processing',
          severity: 'medium',
          title: 'Implement batch processing for small requests',
          description: `${windowCosts.length} small requests in 5-minute window could be batched`,
          impact: {
            estimatedSavings: potentialSavings,
            savingsPercentage: 30,
            implementationEffort: 'high',
            riskLevel: 'medium'
          },
          recommendation: {
            action: 'Implement request batching for similar operations',
            details: [
              'Queue small requests for batch processing',
              'Implement intelligent batching logic',
              'Balance latency vs cost savings',
              'Monitor batch processing efficiency'
            ]
          },
          metrics: {
            affectedRequests: windowCosts.length,
            currentDailyCost: totalCost,
            projectedDailyCost: totalCost * 0.7,
            implementationTimeEstimate: 20
          },
          status: 'pending',
          createdAt: new Date()
        });
        break; // Only suggest one batch optimization
      }
    }

    return optimizations;
  }

  private groupCostsBy<T>(costs: AIUsageCost[], keyFn: string | ((cost: AIUsageCost) => T)): Record<string, number> {
    const groups: Record<string, number> = {};
    
    costs.forEach(cost => {
      let key: string;
      if (typeof keyFn === 'string') {
        key = (cost as any)[keyFn];
      } else {
        key = String(keyFn(cost));
      }
      
      groups[key] = (groups[key] || 0) + cost.cost.totalCost;
    });
    
    return groups;
  }

  private generateCostTrends(costs: AIUsageCost[], groupBy: string): Array<{
    period: string;
    cost: number;
    tokens: number;
    requests: number;
  }> {
    const trends: Map<string, { cost: number; tokens: number; requests: number }> = new Map();
    
    costs.forEach(cost => {
      let period: string;
      const date = cost.timestamp;
      
      switch (groupBy) {
        case 'hour':
          period = date.toISOString().substring(0, 13);
          break;
        case 'day':
          period = date.toISOString().substring(0, 10);
          break;
        case 'week':
          const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
          period = weekStart.toISOString().substring(0, 10);
          break;
        case 'month':
          period = date.toISOString().substring(0, 7);
          break;
        default:
          period = date.toISOString().substring(0, 10);
      }
      
      const existing = trends.get(period) || { cost: 0, tokens: 0, requests: 0 };
      existing.cost += cost.cost.totalCost;
      existing.tokens += cost.totalTokens;
      existing.requests++;
      trends.set(period, existing);
    });
    
    return Array.from(trends.entries())
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period));
  }

  private getTopModelsByMetric(costs: AIUsageCost[], metric: 'cost' | 'usage' | 'efficiency'): Array<{
    model: string;
    cost: number;
    usage: number;
    efficiency: number;
  }> {
    const modelStats = new Map<string, { cost: number; tokens: number; requests: number; latency: number }>();
    
    costs.forEach(cost => {
      const existing = modelStats.get(cost.model) || { cost: 0, tokens: 0, requests: 0, latency: 0 };
      existing.cost += cost.cost.totalCost;
      existing.tokens += cost.totalTokens;
      existing.requests++;
      existing.latency += cost.performance.latency;
      modelStats.set(cost.model, existing);
    });
    
    return Array.from(modelStats.entries())
      .map(([model, stats]) => ({
        model,
        cost: stats.cost,
        usage: stats.tokens,
        efficiency: stats.tokens / (stats.latency / stats.requests) // tokens per ms
      }))
      .sort((a, b) => {
        switch (metric) {
          case 'cost': return b.cost - a.cost;
          case 'usage': return b.usage - a.usage;
          case 'efficiency': return b.efficiency - a.efficiency;
          default: return b.cost - a.cost;
        }
      })
      .slice(0, 10);
  }

  private generateCostProjections(costs: AIUsageCost[]): {
    nextWeek: number;
    nextMonth: number;
    nextQuarter: number;
  } {
    if (costs.length === 0) {
      return { nextWeek: 0, nextMonth: 0, nextQuarter: 0 };
    }
    
    // Calculate average daily cost from recent data
    const recentCosts = costs.slice(-7); // Last 7 records
    const averageCost = recentCosts.reduce((sum, cost) => sum + cost.cost.totalCost, 0) / recentCosts.length;
    
    return {
      nextWeek: averageCost * 7,
      nextMonth: averageCost * 30,
      nextQuarter: averageCost * 90
    };
  }

  private calculateCostSummary(costs: AIUsageCost[]): CostReport['summary'] {
    const totalCost = costs.reduce((sum, cost) => sum + cost.cost.totalCost, 0);
    const totalTokens = costs.reduce((sum, cost) => sum + cost.totalTokens, 0);
    const totalRequests = costs.length;
    
    const averageCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;
    const averageCostPerToken = totalTokens > 0 ? totalCost / totalTokens : 0;
    
    // Calculate trend (simplified)
    const firstHalf = costs.slice(0, Math.floor(costs.length / 2));
    const secondHalf = costs.slice(Math.floor(costs.length / 2));
    
    const firstHalfCost = firstHalf.reduce((sum, cost) => sum + cost.cost.totalCost, 0);
    const secondHalfCost = secondHalf.reduce((sum, cost) => sum + cost.cost.totalCost, 0);
    
    let costTrend: 'increasing' | 'decreasing' | 'stable';
    if (secondHalfCost > firstHalfCost * 1.1) costTrend = 'increasing';
    else if (secondHalfCost < firstHalfCost * 0.9) costTrend = 'decreasing';
    else costTrend = 'stable';
    
    const projectedMonthlyCost = totalCost * (30 / Math.max(1, costs.length));
    
    return {
      totalCost,
      totalTokens,
      totalRequests,
      averageCostPerRequest,
      averageCostPerToken,
      costTrend,
      projectedMonthlyCost
    };
  }

  private calculateCostBreakdown(costs: AIUsageCost[]): CostReport['breakdown'] {
    return {
      byProvider: this.groupCostsBy(costs, 'provider'),
      byModel: this.groupCostsBy(costs, 'model'),
      byFeature: this.groupCostsBy(costs, cost => cost.requestMetadata.feature),
      byUser: this.groupCostsBy(costs, cost => cost.requestMetadata.userId || 'unknown'),
      byEnvironment: this.groupCostsBy(costs, cost => cost.context.environment)
    };
  }

  private calculateTopExpenses(costs: AIUsageCost[]): CostReport['topExpenses'] {
    const expenses = new Map<string, number>();
    const totalCost = costs.reduce((sum, cost) => sum + cost.cost.totalCost, 0);
    
    costs.forEach(cost => {
      const category = `${cost.provider}:${cost.model}`;
      expenses.set(category, (expenses.get(category) || 0) + cost.cost.totalCost);
    });
    
    return Array.from(expenses.entries())
      .map(([category, cost]) => ({
        category,
        description: `${category} usage`,
        cost,
        percentage: (cost / totalCost) * 100
      }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);
  }

  private calculateBudgetStatus(projectId: string): CostReport['budgetStatus'] {
    const budgetStatus: CostReport['budgetStatus'] = [];
    
    for (const [budgetId, budget] of this.budgets) {
      if (budget.scopeId === projectId) {
        const utilization = (budget.currentUsage.totalCost / budget.limits.totalCost) * 100;
        let status: 'safe' | 'warning' | 'exceeded';
        
        if (utilization >= 100) status = 'exceeded';
        else if (utilization >= 75) status = 'warning';
        else status = 'safe';
        
        budgetStatus.push({
          budgetId,
          budgetName: budget.name,
          spent: budget.currentUsage.totalCost,
          limit: budget.limits.totalCost,
          utilization,
          status
        });
      }
    }
    
    return budgetStatus;
  }

  private async generatePatternOptimizations(pattern: UsagePattern, allCosts: AIUsageCost[]): Promise<CostOptimization[]> {
    const optimizations: CostOptimization[] = [];
    
    // High-frequency, high-cost patterns are prime optimization targets
    if (pattern.frequency > 100 && pattern.averageCost > 0.1) {
      optimizations.push({
        id: this.generateOptimizationId(),
        type: 'model-recommendation',
        severity: 'medium',
        title: `Optimize high-frequency pattern: ${pattern.pattern}`,
        description: `Pattern occurs ${pattern.frequency} times with average cost $${pattern.averageCost.toFixed(3)}`,
        impact: {
          estimatedSavings: pattern.totalCost * 0.25,
          savingsPercentage: 25,
          implementationEffort: 'medium',
          riskLevel: 'low'
        },
        recommendation: {
          action: 'Optimize this common usage pattern',
          details: [
            'Consider more efficient models for this use case',
            'Implement result caching',
            'Optimize prompts for this pattern'
          ]
        },
        metrics: {
          affectedRequests: pattern.requestCount,
          currentDailyCost: pattern.totalCost,
          projectedDailyCost: pattern.totalCost * 0.75,
          implementationTimeEstimate: 6
        },
        status: 'pending',
        createdAt: new Date()
      });
    }
    
    return optimizations;
  }

  private getModelAlternatives(model: string): Array<{
    name: string;
    costRatio: number;
    performanceImpact: string;
  }> {
    // Mock implementation - would use real model pricing data
    const alternatives: Record<string, Array<{ name: string; costRatio: number; performanceImpact: string }>> = {
      'gpt-4': [
        { name: 'gpt-3.5-turbo', costRatio: 0.1, performanceImpact: 'Slightly reduced quality' },
        { name: 'claude-3-haiku', costRatio: 0.2, performanceImpact: 'Similar quality, faster' }
      ],
      'claude-3-opus': [
        { name: 'claude-3-sonnet', costRatio: 0.2, performanceImpact: 'Slightly reduced quality' },
        { name: 'claude-3-haiku', costRatio: 0.05, performanceImpact: 'Reduced quality, much faster' }
      ]
    };
    
    return alternatives[model] || [];
  }

  private isCostApplicableToBudget(cost: AIUsageCost, budget: CostBudget): boolean {
    switch (budget.scope) {
      case 'project':
        return cost.projectId === budget.scopeId;
      case 'user':
        return cost.requestMetadata.userId === budget.scopeId;
      case 'feature':
        return cost.requestMetadata.feature === budget.scopeId;
      case 'organization':
        return true; // All costs apply to organization budget
      default:
        return false;
    }
  }

  private getPeriodStart(period: CostBudget['period'], date: Date): Date {
    const start = new Date(date);
    
    switch (period) {
      case 'daily':
        start.setHours(0, 0, 0, 0);
        break;
      case 'weekly':
        start.setDate(start.getDate() - start.getDay());
        start.setHours(0, 0, 0, 0);
        break;
      case 'monthly':
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'quarterly':
        start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
        start.setHours(0, 0, 0, 0);
        break;
      case 'annually':
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
        break;
    }
    
    return start;
  }

  private getPeriodEnd(period: CostBudget['period'], date: Date): Date {
    const end = new Date(date);
    
    switch (period) {
      case 'daily':
        end.setHours(23, 59, 59, 999);
        break;
      case 'weekly':
        end.setDate(end.getDate() + (6 - end.getDay()));
        end.setHours(23, 59, 59, 999);
        break;
      case 'monthly':
        end.setMonth(end.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'quarterly':
        end.setMonth(Math.floor(end.getMonth() / 3) * 3 + 3, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'annually':
        end.setFullYear(end.getFullYear() + 1, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
    }
    
    return end;
  }

  private generateBudgetRecommendations(budget: CostBudget, utilization: number, projectedOverage: number): string[] {
    const recommendations: string[] = [];
    
    if (utilization >= 90) {
      recommendations.push('Consider increasing budget limit or implementing cost controls');
    }
    
    if (projectedOverage > 0) {
      recommendations.push(`Projected to exceed budget by $${projectedOverage.toFixed(2)}`);
      recommendations.push('Review and implement available cost optimizations');
    }
    
    if (utilization >= 75) {
      recommendations.push('Monitor usage closely and consider optimization strategies');
    }
    
    return recommendations;
  }

  private async sendBudgetAlert(budget: CostBudget, threshold: number, utilization: number): Promise<void> {
    console.log(`Budget Alert: ${budget.name} is ${utilization.toFixed(1)}% utilized (threshold: ${threshold}%)`);
    // In real implementation, would send actual notifications
  }

  private initializeDefaultBudgets(): void {
    // Initialize with some default budgets
  }

  private loadHistoricalData(): void {
    // Load historical cost data from storage
  }

  private generateUsageId(): string {
    return `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBudgetId(): string {
    return `budget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateOptimizationId(): string {
    return `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export {
  type AIUsageCost,
  type CostBudget,
  type CostOptimization,
  type UsagePattern,
  type CostReport
};