interface ModelCapabilities {
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'local';
  contextWindow: number;
  maxTokens: number;
  costPerInputToken: number;
  costPerOutputToken: number;
  averageLatency: number;
  strengths: string[];
  weaknesses: string[];
  supportedFeatures: string[];
}

interface TaskRequirements {
  type: 'code-generation' | 'analysis' | 'explanation' | 'debugging' | 'refactoring' | 'documentation';
  complexity: 'low' | 'medium' | 'high';
  contextSize: number;
  expectedOutputSize: number;
  timeConstraint: 'real-time' | 'standard' | 'batch';
  qualityRequirement: 'basic' | 'production' | 'critical';
}

interface PerformanceMetrics {
  modelName: string;
  taskType: string;
  responseTime: number;
  tokenUsage: {
    input: number;
    output: number;
  };
  quality: {
    accuracy: number;
    relevance: number;
    completeness: number;
  };
  cost: number;
  timestamp: Date;
}

export class PerformanceOptimizer {
  private models: Map<string, ModelCapabilities> = new Map();
  private performanceHistory: PerformanceMetrics[] = [];
  private currentModel: string = 'gpt-4';
  private adaptiveThresholds: {
    latencyThreshold: number;
    costThreshold: number;
    qualityThreshold: number;
  };

  constructor() {
    this.initializeModels();
    this.adaptiveThresholds = {
      latencyThreshold: 5000, // 5 seconds
      costThreshold: 0.10, // $0.10
      qualityThreshold: 0.8 // 80%
    };
    this.loadPerformanceHistory();
  }

  selectOptimalModel(task: TaskRequirements): {
    modelName: string;
    confidence: number;
    reasoning: string[];
    alternatives: Array<{model: string, score: number}>;
  } {
    const candidates = this.evaluateModels(task);
    const bestMatch = candidates[0];
    
    const reasoning = this.generateReasoning(bestMatch.model, task);
    const alternatives = candidates.slice(1, 4);

    return {
      modelName: bestMatch.model,
      confidence: bestMatch.score,
      reasoning,
      alternatives
    };
  }

  recordPerformance(metrics: PerformanceMetrics): void {
    this.performanceHistory.push(metrics);
    this.updateModelCapabilities(metrics);
    this.adjustThresholds();
    
    // Keep only last 1000 records for performance
    if (this.performanceHistory.length > 1000) {
      this.performanceHistory = this.performanceHistory.slice(-1000);
    }
  }

  optimizePrompt(prompt: string, task: TaskRequirements): {
    optimizedPrompt: string;
    tokensSaved: number;
    qualityImpact: number;
  } {
    let optimized = prompt;
    let tokensSaved = 0;
    
    // Remove redundant whitespace
    const beforeTokens = this.estimateTokens(optimized);
    optimized = optimized.replace(/\s+/g, ' ').trim();
    tokensSaved += beforeTokens - this.estimateTokens(optimized);

    // Compress verbose instructions based on task complexity
    if (task.complexity === 'low') {
      optimized = this.compressInstructions(optimized);
      tokensSaved += beforeTokens - this.estimateTokens(optimized);
    }

    // Use task-specific templates
    optimized = this.applyTaskTemplate(optimized, task.type);

    const finalTokens = this.estimateTokens(optimized);
    const totalTokensSaved = beforeTokens - finalTokens;
    const qualityImpact = this.estimateQualityImpact(totalTokensSaved, task);

    return {
      optimizedPrompt: optimized,
      tokensSaved: totalTokensSaved,
      qualityImpact
    };
  }

  predictPerformance(modelName: string, task: TaskRequirements): {
    estimatedLatency: number;
    estimatedCost: number;
    estimatedQuality: number;
    confidence: number;
  } {
    const model = this.models.get(modelName);
    if (!model) {
      throw new Error(`Unknown model: ${modelName}`);
    }

    const historicalData = this.performanceHistory
      .filter(m => m.modelName === modelName && m.taskType === task.type)
      .slice(-50); // Last 50 records

    const estimatedLatency = this.predictLatency(model, task, historicalData);
    const estimatedCost = this.predictCost(model, task);
    const estimatedQuality = this.predictQuality(model, task, historicalData);
    const confidence = Math.min(historicalData.length / 10, 1); // More data = higher confidence

    return {
      estimatedLatency,
      estimatedCost,
      estimatedQuality,
      confidence
    };
  }

  getOptimizationRecommendations(): Array<{
    type: 'model' | 'prompt' | 'batching' | 'caching';
    description: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
  }> {
    const recommendations = [];
    
    const recentMetrics = this.performanceHistory.slice(-100);
    const avgLatency = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
    const avgCost = recentMetrics.reduce((sum, m) => sum + m.cost, 0) / recentMetrics.length;
    const avgQuality = recentMetrics.reduce((sum, m) => sum + m.quality.accuracy, 0) / recentMetrics.length;

    if (avgLatency > this.adaptiveThresholds.latencyThreshold) {
      recommendations.push({
        type: 'model',
        description: 'Consider switching to faster models for time-sensitive tasks',
        impact: 'high',
        effort: 'low'
      });
    }

    if (avgCost > this.adaptiveThresholds.costThreshold) {
      recommendations.push({
        type: 'prompt',
        description: 'Optimize prompts to reduce token usage',
        impact: 'medium',
        effort: 'medium'
      });
    }

    if (avgQuality < this.adaptiveThresholds.qualityThreshold) {
      recommendations.push({
        type: 'model',
        description: 'Use higher-quality models for critical tasks',
        impact: 'high',
        effort: 'low'
      });
    }

    // Check for batching opportunities
    const frequentTasks = this.analyzeTaskPatterns();
    if (frequentTasks.length > 0) {
      recommendations.push({
        type: 'batching',
        description: 'Batch similar requests to improve efficiency',
        impact: 'medium',
        effort: 'high'
      });
    }

    return recommendations;
  }

  private initializeModels(): void {
    const models: ModelCapabilities[] = [
      {
        name: 'gpt-4',
        provider: 'openai',
        contextWindow: 8192,
        maxTokens: 4096,
        costPerInputToken: 0.03 / 1000,
        costPerOutputToken: 0.06 / 1000,
        averageLatency: 3000,
        strengths: ['reasoning', 'complex tasks', 'code generation'],
        weaknesses: ['cost', 'latency'],
        supportedFeatures: ['code', 'analysis', 'reasoning']
      },
      {
        name: 'gpt-3.5-turbo',
        provider: 'openai',
        contextWindow: 4096,
        maxTokens: 4096,
        costPerInputToken: 0.0015 / 1000,
        costPerOutputToken: 0.002 / 1000,
        averageLatency: 1500,
        strengths: ['speed', 'cost', 'general tasks'],
        weaknesses: ['complex reasoning', 'context window'],
        supportedFeatures: ['code', 'general']
      },
      {
        name: 'claude-3',
        provider: 'anthropic',
        contextWindow: 100000,
        maxTokens: 4096,
        costPerInputToken: 0.015 / 1000,
        costPerOutputToken: 0.075 / 1000,
        averageLatency: 2500,
        strengths: ['large context', 'analysis', 'safety'],
        weaknesses: ['cost for large outputs'],
        supportedFeatures: ['code', 'analysis', 'long-context']
      }
    ];

    models.forEach(model => {
      this.models.set(model.name, model);
    });
  }

  private evaluateModels(task: TaskRequirements): Array<{model: string, score: number}> {
    const scores = [];
    
    for (const [name, model] of this.models.entries()) {
      let score = 0;
      
      // Context window fit
      if (task.contextSize <= model.contextWindow) {
        score += 30;
      } else {
        score -= 50; // Penalty for not fitting
      }
      
      // Task type alignment
      const taskAlignment = this.getTaskAlignment(model, task.type);
      score += taskAlignment * 25;
      
      // Performance requirements
      if (task.timeConstraint === 'real-time' && model.averageLatency < 2000) {
        score += 20;
      }
      
      if (task.qualityRequirement === 'critical' && model.strengths.includes('reasoning')) {
        score += 15;
      }
      
      // Cost efficiency
      const estimatedCost = this.predictCost(model, task);
      if (estimatedCost < 0.05) score += 10;
      else if (estimatedCost > 0.20) score -= 10;
      
      scores.push({ model: name, score: Math.max(0, score) });
    }
    
    return scores.sort((a, b) => b.score - a.score);
  }

  private getTaskAlignment(model: ModelCapabilities, taskType: string): number {
    const alignmentMap: Record<string, Record<string, number>> = {
      'code-generation': {
        'gpt-4': 0.9,
        'gpt-3.5-turbo': 0.7,
        'claude-3': 0.8
      },
      'analysis': {
        'gpt-4': 0.8,
        'gpt-3.5-turbo': 0.6,
        'claude-3': 0.9
      },
      'debugging': {
        'gpt-4': 0.9,
        'gpt-3.5-turbo': 0.6,
        'claude-3': 0.8
      }
    };
    
    return alignmentMap[taskType]?.[model.name] || 0.5;
  }

  private predictLatency(model: ModelCapabilities, task: TaskRequirements, history: PerformanceMetrics[]): number {
    if (history.length > 0) {
      const avgHistorical = history.reduce((sum, m) => sum + m.responseTime, 0) / history.length;
      return avgHistorical;
    }
    
    // Base latency with adjustments
    let latency = model.averageLatency;
    
    // Adjust for context size
    const contextMultiplier = Math.max(1, task.contextSize / 1000);
    latency *= contextMultiplier;
    
    // Adjust for complexity
    if (task.complexity === 'high') latency *= 1.5;
    else if (task.complexity === 'low') latency *= 0.8;
    
    return latency;
  }

  private predictCost(model: ModelCapabilities, task: TaskRequirements): number {
    const inputCost = task.contextSize * model.costPerInputToken;
    const outputCost = task.expectedOutputSize * model.costPerOutputToken;
    return inputCost + outputCost;
  }

  private predictQuality(model: ModelCapabilities, task: TaskRequirements, history: PerformanceMetrics[]): number {
    if (history.length > 0) {
      return history.reduce((sum, m) => sum + m.quality.accuracy, 0) / history.length;
    }
    
    // Base quality estimate
    const taskAlignment = this.getTaskAlignment(model, task.type);
    return taskAlignment;
  }

  private updateModelCapabilities(metrics: PerformanceMetrics): void {
    const model = this.models.get(metrics.modelName);
    if (model) {
      // Update average latency with exponential moving average
      model.averageLatency = model.averageLatency * 0.9 + metrics.responseTime * 0.1;
    }
  }

  private adjustThresholds(): void {
    const recent = this.performanceHistory.slice(-50);
    if (recent.length < 10) return;
    
    const avgLatency = recent.reduce((sum, m) => sum + m.responseTime, 0) / recent.length;
    const avgCost = recent.reduce((sum, m) => sum + m.cost, 0) / recent.length;
    
    // Adjust thresholds based on recent performance
    this.adaptiveThresholds.latencyThreshold = avgLatency * 1.5;
    this.adaptiveThresholds.costThreshold = avgCost * 2;
  }

  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  private compressInstructions(prompt: string): string {
    // Simple compression - remove examples and verbose explanations
    return prompt
      .replace(/For example[^.]*\./g, '')
      .replace(/\(e\.g\.[^)]*\)/g, '')
      .replace(/Note that[^.]*\./g, '');
  }

  private applyTaskTemplate(prompt: string, taskType: string): string {
    const templates = {
      'code-generation': 'Generate code for: ',
      'debugging': 'Debug this code: ',
      'explanation': 'Explain: ',
      'refactoring': 'Refactor: '
    };
    
    const template = templates[taskType as keyof typeof templates];
    if (template && !prompt.startsWith(template)) {
      return template + prompt;
    }
    
    return prompt;
  }

  private estimateQualityImpact(tokensSaved: number, task: TaskRequirements): number {
    // Estimate quality impact of token optimization
    const compressionRatio = tokensSaved / (tokensSaved + 1000); // Assume 1000 base tokens
    
    if (task.qualityRequirement === 'critical') {
      return -compressionRatio * 0.3; // Higher quality loss for critical tasks
    } else if (task.qualityRequirement === 'basic') {
      return -compressionRatio * 0.1; // Lower quality loss for basic tasks
    }
    
    return -compressionRatio * 0.2;
  }

  private analyzeTaskPatterns(): string[] {
    const taskCounts = new Map<string, number>();
    
    this.performanceHistory.forEach(metric => {
      const count = taskCounts.get(metric.taskType) || 0;
      taskCounts.set(metric.taskType, count + 1);
    });
    
    return Array.from(taskCounts.entries())
      .filter(([_, count]) => count > 10)
      .map(([task, _]) => task);
  }

  private generateReasoning(modelName: string, task: TaskRequirements): string[] {
    const model = this.models.get(modelName)!;
    const reasoning = [];
    
    if (task.contextSize <= model.contextWindow) {
      reasoning.push(`Context fits within ${model.contextWindow} token limit`);
    }
    
    if (model.strengths.some(s => task.type.includes(s))) {
      reasoning.push(`Model excels at ${task.type} tasks`);
    }
    
    if (task.timeConstraint === 'real-time' && model.averageLatency < 2000) {
      reasoning.push('Fast response time for real-time requirements');
    }
    
    const cost = this.predictCost(model, task);
    if (cost < 0.05) {
      reasoning.push('Cost-effective for this task size');
    }
    
    return reasoning;
  }

  private loadPerformanceHistory(): void {
    // Load from persistent storage
  }

  getModelStats(): Record<string, {
    averageLatency: number;
    averageCost: number;
    averageQuality: number;
    usageCount: number;
  }> {
    const stats: Record<string, any> = {};
    
    for (const model of this.models.keys()) {
      const modelMetrics = this.performanceHistory.filter(m => m.modelName === model);
      
      if (modelMetrics.length > 0) {
        stats[model] = {
          averageLatency: modelMetrics.reduce((sum, m) => sum + m.responseTime, 0) / modelMetrics.length,
          averageCost: modelMetrics.reduce((sum, m) => sum + m.cost, 0) / modelMetrics.length,
          averageQuality: modelMetrics.reduce((sum, m) => sum + m.quality.accuracy, 0) / modelMetrics.length,
          usageCount: modelMetrics.length
        };
      }
    }
    
    return stats;
  }
}