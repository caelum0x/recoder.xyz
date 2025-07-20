interface APIUsage {
  id: string;
  timestamp: Date;
  provider: 'openai' | 'anthropic' | 'google' | 'local';
  model: string;
  endpoint: string;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  cost: {
    input: number;
    output: number;
    total: number;
  };
  responseTime: number;
  userId?: string;
  projectId?: string;
  taskType: string;
}

interface Budget {
  id: string;
  name: string;
  type: 'daily' | 'weekly' | 'monthly' | 'project' | 'user';
  limit: number;
  spent: number;
  remaining: number;
  period: {
    start: Date;
    end: Date;
  };
  alerts: {
    threshold: number; // Percentage of budget
    triggered: boolean;
    lastAlert: Date | null;
  }[];
}

interface CostOptimization {
  suggestion: string;
  potentialSavings: number;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  category: 'model' | 'prompt' | 'caching' | 'batching' | 'scheduling';
}

export class CostTracker {
  private usage: APIUsage[] = [];
  private budgets: Map<string, Budget> = new Map();
  private costRules: Map<string, {inputCost: number, outputCost: number}> = new Map();
  private alerts: Array<{
    id: string;
    type: 'budget' | 'spike' | 'efficiency';
    message: string;
    severity: 'low' | 'medium' | 'high';
    timestamp: Date;
    acknowledged: boolean;
  }> = [];

  constructor() {
    this.initializeCostRules();
    this.loadBudgets();
    this.loadUsageHistory();
  }

  recordUsage(usage: Omit<APIUsage, 'id' | 'timestamp' | 'cost'>): APIUsage {
    const cost = this.calculateCost(usage.provider, usage.model, usage.tokenUsage);
    
    const record: APIUsage = {
      ...usage,
      id: this.generateUsageId(),
      timestamp: new Date(),
      cost
    };

    this.usage.push(record);
    this.updateBudgets(record);
    this.checkAlerts(record);
    this.analyzeSpending();

    // Keep only last 10000 records for performance
    if (this.usage.length > 10000) {
      this.usage = this.usage.slice(-10000);
    }

    return record;
  }

  createBudget(budget: Omit<Budget, 'id' | 'spent' | 'remaining'>): Budget {
    const newBudget: Budget = {
      ...budget,
      id: this.generateBudgetId(),
      spent: 0,
      remaining: budget.limit
    };

    this.budgets.set(newBudget.id, newBudget);
    return newBudget;
  }

  getBudgetStatus(budgetId?: string): Budget[] {
    if (budgetId) {
      const budget = this.budgets.get(budgetId);
      return budget ? [budget] : [];
    }
    
    return Array.from(this.budgets.values())
      .filter(budget => this.isBudgetActive(budget));
  }

  getCostAnalysis(period: {start: Date, end: Date}, groupBy?: 'day' | 'model' | 'user' | 'project'): {
    totalCost: number;
    totalTokens: number;
    averageCostPerToken: number;
    breakdown: Record<string, {cost: number, tokens: number, requests: number}>;
    trends: {period: string, cost: number}[];
  } {
    const filteredUsage = this.usage.filter(u => 
      u.timestamp >= period.start && u.timestamp <= period.end
    );

    const totalCost = filteredUsage.reduce((sum, u) => sum + u.cost.total, 0);
    const totalTokens = filteredUsage.reduce((sum, u) => sum + u.tokenUsage.total, 0);
    
    const breakdown: Record<string, {cost: number, tokens: number, requests: number}> = {};
    const groupingFunction = this.getGroupingFunction(groupBy);

    filteredUsage.forEach(usage => {
      const key = groupingFunction(usage);
      if (!breakdown[key]) {
        breakdown[key] = {cost: 0, tokens: 0, requests: 0};
      }
      breakdown[key].cost += usage.cost.total;
      breakdown[key].tokens += usage.tokenUsage.total;
      breakdown[key].requests += 1;
    });

    const trends = this.calculateTrends(filteredUsage, groupBy);

    return {
      totalCost,
      totalTokens,
      averageCostPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
      breakdown,
      trends
    };
  }

  getOptimizationSuggestions(): CostOptimization[] {
    const suggestions: CostOptimization[] = [];
    
    // Analyze model usage patterns
    const modelAnalysis = this.analyzeModelUsage();
    suggestions.push(...modelAnalysis);

    // Analyze prompt efficiency
    const promptAnalysis = this.analyzePromptEfficiency();
    suggestions.push(...promptAnalysis);

    // Analyze timing patterns
    const timingAnalysis = this.analyzeTimingPatterns();
    suggestions.push(...timingAnalysis);

    // Analyze token usage patterns
    const tokenAnalysis = this.analyzeTokenUsage();
    suggestions.push(...tokenAnalysis);

    return suggestions.sort((a, b) => b.potentialSavings - a.potentialSavings);
  }

  predictMonthlySpend(): {
    current: number;
    projected: number;
    confidence: number;
    breakdown: Record<string, number>;
  } {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysInMonth = monthEnd.getDate();
    const daysPassed = now.getDate();
    
    const currentMonthUsage = this.usage.filter(u => 
      u.timestamp >= monthStart && u.timestamp <= now
    );
    
    const currentSpend = currentMonthUsage.reduce((sum, u) => sum + u.cost.total, 0);
    const dailyAverage = currentSpend / daysPassed;
    const projectedSpend = dailyAverage * daysInMonth;
    
    // Calculate confidence based on data availability
    const confidence = Math.min(daysPassed / 7, 1); // More confident after a week
    
    // Breakdown by model
    const breakdown: Record<string, number> = {};
    currentMonthUsage.forEach(usage => {
      const key = usage.model;
      breakdown[key] = (breakdown[key] || 0) + usage.cost.total;
    });

    return {
      current: currentSpend,
      projected: projectedSpend,
      confidence,
      breakdown
    };
  }

  getAlerts(): typeof this.alerts {
    return this.alerts.filter(alert => !alert.acknowledged);
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  private calculateCost(provider: string, model: string, tokenUsage: APIUsage['tokenUsage']): APIUsage['cost'] {
    const key = `${provider}_${model}`;
    const rates = this.costRules.get(key);
    
    if (!rates) {
      console.warn(`No cost rules found for ${key}`);
      return {input: 0, output: 0, total: 0};
    }

    const inputCost = tokenUsage.input * rates.inputCost;
    const outputCost = tokenUsage.output * rates.outputCost;
    const total = inputCost + outputCost;

    return {input: inputCost, output: outputCost, total};
  }

  private updateBudgets(usage: APIUsage): void {
    for (const budget of this.budgets.values()) {
      if (this.isBudgetApplicable(budget, usage)) {
        budget.spent += usage.cost.total;
        budget.remaining = Math.max(0, budget.limit - budget.spent);
        
        // Check budget alerts
        budget.alerts.forEach(alert => {
          const thresholdAmount = budget.limit * (alert.threshold / 100);
          if (budget.spent >= thresholdAmount && !alert.triggered) {
            alert.triggered = true;
            alert.lastAlert = new Date();
            this.createAlert('budget', `Budget "${budget.name}" is ${alert.threshold}% spent`, 'medium');
          }
        });
      }
    }
  }

  private checkAlerts(usage: APIUsage): void {
    // Check for cost spikes
    const recentUsage = this.usage.slice(-10);
    const avgCost = recentUsage.reduce((sum, u) => sum + u.cost.total, 0) / recentUsage.length;
    
    if (usage.cost.total > avgCost * 3) {
      this.createAlert('spike', `High cost detected: $${usage.cost.total.toFixed(4)} (3x average)`, 'high');
    }

    // Check for efficiency issues
    const avgTokensPerDollar = recentUsage.reduce((sum, u) => sum + (u.tokenUsage.total / u.cost.total), 0) / recentUsage.length;
    const currentTokensPerDollar = usage.tokenUsage.total / usage.cost.total;
    
    if (currentTokensPerDollar < avgTokensPerDollar * 0.5) {
      this.createAlert('efficiency', 'Low token efficiency detected', 'medium');
    }
  }

  private analyzeSpending(): void {
    const last24Hours = this.usage.filter(u => 
      Date.now() - u.timestamp.getTime() < 24 * 60 * 60 * 1000
    );
    
    const totalCost = last24Hours.reduce((sum, u) => sum + u.cost.total, 0);
    
    // Alert if daily spending exceeds $50
    if (totalCost > 50) {
      this.createAlert('budget', `High daily spending: $${totalCost.toFixed(2)}`, 'high');
    }
  }

  private analyzeModelUsage(): CostOptimization[] {
    const suggestions: CostOptimization[] = [];
    const modelUsage = new Map<string, {cost: number, count: number, avgTokens: number}>();

    this.usage.forEach(usage => {
      const key = usage.model;
      const existing = modelUsage.get(key) || {cost: 0, count: 0, avgTokens: 0};
      existing.cost += usage.cost.total;
      existing.count += 1;
      existing.avgTokens = ((existing.avgTokens * (existing.count - 1)) + usage.tokenUsage.total) / existing.count;
      modelUsage.set(key, existing);
    });

    // Suggest cheaper models for simple tasks
    for (const [model, stats] of modelUsage.entries()) {
      if (model.includes('gpt-4') && stats.avgTokens < 500) {
        const potentialSavings = stats.cost * 0.9; // Assume 90% savings with GPT-3.5
        suggestions.push({
          suggestion: `Consider using GPT-3.5-turbo for simple tasks currently using ${model}`,
          potentialSavings,
          effort: 'low',
          impact: 'high',
          category: 'model'
        });
      }
    }

    return suggestions;
  }

  private analyzePromptEfficiency(): CostOptimization[] {
    const suggestions: CostOptimization[] = [];
    
    // Analyze input/output token ratios
    const avgInputRatio = this.usage.reduce((sum, u) => sum + (u.tokenUsage.input / u.tokenUsage.total), 0) / this.usage.length;
    
    if (avgInputRatio > 0.8) {
      suggestions.push({
        suggestion: 'Optimize prompts to reduce input token usage',
        potentialSavings: this.usage.reduce((sum, u) => sum + u.cost.input, 0) * 0.3,
        effort: 'medium',
        impact: 'medium',
        category: 'prompt'
      });
    }

    return suggestions;
  }

  private analyzeTimingPatterns(): CostOptimization[] {
    const suggestions: CostOptimization[] = [];
    
    // Analyze usage patterns by hour
    const hourlyUsage = new Map<number, number>();
    this.usage.forEach(usage => {
      const hour = usage.timestamp.getHours();
      hourlyUsage.set(hour, (hourlyUsage.get(hour) || 0) + usage.cost.total);
    });

    // Suggest batching for off-peak hours
    const peakHours = Array.from(hourlyUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([hour]) => hour);

    if (peakHours.length > 0) {
      suggestions.push({
        suggestion: 'Consider batching non-urgent requests for off-peak hours',
        potentialSavings: Array.from(hourlyUsage.values()).reduce((sum, cost) => sum + cost, 0) * 0.1,
        effort: 'high',
        impact: 'low',
        category: 'scheduling'
      });
    }

    return suggestions;
  }

  private analyzeTokenUsage(): CostOptimization[] {
    const suggestions: CostOptimization[] = [];
    
    // Analyze token efficiency
    const avgCostPerToken = this.usage.reduce((sum, u) => sum + (u.cost.total / u.tokenUsage.total), 0) / this.usage.length;
    const inefficientUsage = this.usage.filter(u => (u.cost.total / u.tokenUsage.total) > avgCostPerToken * 1.5);

    if (inefficientUsage.length > this.usage.length * 0.2) {
      suggestions.push({
        suggestion: 'Implement token usage monitoring and optimization',
        potentialSavings: inefficientUsage.reduce((sum, u) => sum + u.cost.total, 0) * 0.3,
        effort: 'medium',
        impact: 'medium',
        category: 'prompt'
      });
    }

    return suggestions;
  }

  private calculateTrends(usage: APIUsage[], groupBy?: string): {period: string, cost: number}[] {
    const trends: {period: string, cost: number}[] = [];
    
    if (!groupBy || groupBy === 'day') {
      const dailyUsage = new Map<string, number>();
      usage.forEach(u => {
        const day = u.timestamp.toISOString().split('T')[0];
        dailyUsage.set(day, (dailyUsage.get(day) || 0) + u.cost.total);
      });
      
      for (const [day, cost] of dailyUsage.entries()) {
        trends.push({period: day, cost});
      }
    }

    return trends.sort((a, b) => a.period.localeCompare(b.period));
  }

  private getGroupingFunction(groupBy?: string): (usage: APIUsage) => string {
    switch (groupBy) {
      case 'model':
        return (usage) => usage.model;
      case 'user':
        return (usage) => usage.userId || 'unknown';
      case 'project':
        return (usage) => usage.projectId || 'unknown';
      case 'day':
        return (usage) => usage.timestamp.toISOString().split('T')[0];
      default:
        return (usage) => usage.model;
    }
  }

  private isBudgetActive(budget: Budget): boolean {
    const now = new Date();
    return now >= budget.period.start && now <= budget.period.end;
  }

  private isBudgetApplicable(budget: Budget, usage: APIUsage): boolean {
    if (!this.isBudgetActive(budget)) return false;

    switch (budget.type) {
      case 'user':
        return budget.name === usage.userId;
      case 'project':
        return budget.name === usage.projectId;
      default:
        return true;
    }
  }

  private createAlert(type: typeof this.alerts[0]['type'], message: string, severity: typeof this.alerts[0]['severity']): void {
    this.alerts.push({
      id: this.generateAlertId(),
      type,
      message,
      severity,
      timestamp: new Date(),
      acknowledged: false
    });

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100);
    }
  }

  private initializeCostRules(): void {
    // OpenAI pricing (per 1000 tokens)
    this.costRules.set('openai_gpt-4', {inputCost: 0.03, outputCost: 0.06});
    this.costRules.set('openai_gpt-3.5-turbo', {inputCost: 0.0015, outputCost: 0.002});
    
    // Anthropic pricing
    this.costRules.set('anthropic_claude-3-opus', {inputCost: 0.015, outputCost: 0.075});
    this.costRules.set('anthropic_claude-3-sonnet', {inputCost: 0.003, outputCost: 0.015});
    
    // Google pricing
    this.costRules.set('google_gemini-pro', {inputCost: 0.00025, outputCost: 0.0005});
  }

  private generateUsageId(): string {
    return `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateBudgetId(): string {
    return `budget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadBudgets(): void {
    // Load from persistent storage
  }

  private loadUsageHistory(): void {
    // Load from persistent storage
  }

  exportData(format: 'csv' | 'json', period?: {start: Date, end: Date}): string {
    let data = this.usage;
    
    if (period) {
      data = data.filter(u => u.timestamp >= period.start && u.timestamp <= period.end);
    }

    if (format === 'csv') {
      const headers = ['timestamp', 'provider', 'model', 'input_tokens', 'output_tokens', 'total_cost'];
      const rows = data.map(u => [
        u.timestamp.toISOString(),
        u.provider,
        u.model,
        u.tokenUsage.input,
        u.tokenUsage.output,
        u.cost.total
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    } else {
      return JSON.stringify(data, null, 2);
    }
  }
}