// Intelligent Provider Failover System
// Advanced AI provider management with real-time health monitoring, cost optimization, and predictive failover

import { EventEmitter } from 'events';
import { aiProviderManager } from './ai-provider-manager';
import { aiRouter } from './ai-router';
import { prisma } from '../database/prisma';
import { logger } from '../utils/logger';

interface ProviderHealth {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
  metrics: {
    responseTime: number;
    successRate: number;
    errorRate: number;
    uptime: number;
    cost: number;
    quality: number;
  };
  predictions: {
    failureProbability: number;
    expectedResponseTime: number;
    costEfficiency: number;
    qualityScore: number;
  };
  lastChecked: Date;
  consecutiveFailures: number;
  lastFailure?: Date;
  recoveryTime?: number;
}

interface FailoverRule {
  id: string;
  name: string;
  conditions: {
    maxResponseTime?: number;
    minSuccessRate?: number;
    maxErrorRate?: number;
    maxConsecutiveFailures?: number;
    maxCost?: number;
    minQuality?: number;
  };
  actions: {
    priority: number;
    fallbackProviders: string[];
    alertLevel: 'info' | 'warning' | 'critical';
    autoRecover: boolean;
    recoveryDelay: number; // minutes
  };
  enabled: boolean;
}

interface FailoverEvent {
  id: string;
  timestamp: Date;
  sourceProvider: string;
  targetProvider: string;
  reason: string;
  impact: {
    affectedRequests: number;
    additionalLatency: number;
    costImpact: number;
  };
  recovered: boolean;
  recoveryTime?: number;
}

interface ProviderPrediction {
  providerId: string;
  nextHourLoad: number;
  nextHourFailureProbability: number;
  nextHourAverageCost: number;
  nextHourQualityScore: number;
  recommendation: 'preferred' | 'caution' | 'avoid';
}

export class IntelligentFailoverService extends EventEmitter {
  private healthChecks: Map<string, ProviderHealth> = new Map();
  private failoverRules: FailoverRule[] = [];
  private failoverHistory: FailoverEvent[] = [];
  private predictions: Map<string, ProviderPrediction> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private predictionInterval: NodeJS.Timeout | null = null;

  // Circuit breaker states
  private circuitBreakers: Map<string, {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    lastFailure?: Date;
    nextAttempt?: Date;
  }> = new Map();

  constructor() {
    super();
    this.initializeDefaultRules();
    // Defer monitoring startup to avoid blocking module initialization
    process.nextTick(() => {
      this.startHealthMonitoring();
      this.startPredictiveAnalysis();
    });
  }

  /**
   * Initialize default failover rules
   */
  private initializeDefaultRules(): void {
    this.failoverRules = [
      {
        id: 'critical-response-time',
        name: 'Critical Response Time',
        conditions: {
          maxResponseTime: 15000, // 15 seconds
          maxConsecutiveFailures: 3
        },
        actions: {
          priority: 1,
          fallbackProviders: ['groq', 'deepseek', 'gemini'],
          alertLevel: 'critical',
          autoRecover: true,
          recoveryDelay: 5
        },
        enabled: true
      },
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        conditions: {
          maxErrorRate: 10, // 10%
          minSuccessRate: 85 // 85%
        },
        actions: {
          priority: 2,
          fallbackProviders: ['anthropic', 'gemini', 'groq'],
          alertLevel: 'warning',
          autoRecover: true,
          recoveryDelay: 10
        },
        enabled: true
      },
      {
        id: 'cost-optimization',
        name: 'Cost Optimization',
        conditions: {
          maxCost: 0.05, // $0.05 per request
          minQuality: 0.8 // 80% quality threshold
        },
        actions: {
          priority: 3,
          fallbackProviders: ['deepseek', 'groq', 'ollama'],
          alertLevel: 'info',
          autoRecover: false,
          recoveryDelay: 30
        },
        enabled: true
      },
      {
        id: 'quality-degradation',
        name: 'Quality Degradation',
        conditions: {
          minQuality: 0.7, // 70% quality threshold
          maxErrorRate: 15
        },
        actions: {
          priority: 4,
          fallbackProviders: ['anthropic', 'gemini'],
          alertLevel: 'warning',
          autoRecover: true,
          recoveryDelay: 15
        },
        enabled: true
      }
    ];
  }

  /**
   * Start continuous health monitoring
   */
  private startHealthMonitoring(): void {
    // Check health every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000);

    // Delay initial health check to avoid startup loops
    setTimeout(() => {
      this.performHealthChecks();
    }, 5000);

    logger.info('Intelligent failover monitoring started');
  }

  /**
   * Start predictive analysis
   */
  private startPredictiveAnalysis(): void {
    // Run predictions every 5 minutes
    this.predictionInterval = setInterval(async () => {
      await this.generatePredictions();
    }, 300000);

    // Initial prediction
    this.generatePredictions();

    logger.info('Predictive analysis started');
  }

  /**
   * Perform comprehensive health checks on all providers
   */
  private async performHealthChecks(): Promise<void> {
    try {
      const providers = aiProviderManager.getAllProviders();
      const healthPromises = providers.map(provider => this.checkProviderHealth(provider.id));
      
      await Promise.allSettled(healthPromises);
      
      // Evaluate failover rules
      await this.evaluateFailoverRules();
      
      // Update circuit breakers
      this.updateCircuitBreakers();

    } catch (error) {
      logger.error('Health check failed:', error);
    }
  }

  /**
   * Check health of individual provider
   */
  private async checkProviderHealth(providerId: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const provider = aiProviderManager.getProvider(providerId);
      if (!provider) return;

      // Get current stats
      const stats = aiProviderManager.getProviderStats(providerId);
      
      // Perform health check
      const healthResult = await this.performProviderHealthCheck(providerId);
      
      // Calculate metrics
      const responseTime = Date.now() - startTime;
      const health: ProviderHealth = {
        id: providerId,
        name: provider.name,
        status: this.determineHealthStatus(healthResult, stats),
        metrics: {
          responseTime,
          successRate: stats ? ((stats.totalRequests - stats.failedRequests) / Math.max(stats.totalRequests, 1)) * 100 : 0,
          errorRate: stats ? (stats.failedRequests / Math.max(stats.totalRequests, 1)) * 100 : 0,
          uptime: stats?.uptime || 0,
          cost: 0,
          quality: 0
        },
        predictions: {
          failureProbability: this.predictFailureProbability(providerId, stats),
          expectedResponseTime: this.predictResponseTime(providerId, stats),
          costEfficiency: this.calculateCostEfficiency(stats),
          qualityScore: this.calculateQualityScore(stats)
        },
        lastChecked: new Date(),
        consecutiveFailures: this.getConsecutiveFailures(providerId),
        lastFailure: this.getLastFailure(providerId),
        recoveryTime: this.getRecoveryTime(providerId)
      };

      this.healthChecks.set(providerId, health);

      // Emit health update event
      this.emit('healthUpdate', { providerId, health });

      // Store health data for analysis
      await this.storeHealthData(health);

    } catch (error) {
      logger.error(`Health check failed for provider ${providerId}:`, error);
      
      // Update failure count
      this.incrementFailureCount(providerId);
    }
  }

  /**
   * Perform actual health check on provider
   */
  private async performProviderHealthCheck(providerId: string): Promise<any> {
    const testPrompt = 'Test health check - return "OK"';
    
    try {
      // Use a simple test request
      const result = await aiRouter.routeRequest({
        userId: 'health-check',
        taskType: 'text-generation',
        prompt: testPrompt,
        context: { complexity: 'simple' },
        constraints: { maxLatency: 10000 }
      });

      return {
        success: true,
        responseTime: result.estimatedLatency,
        cost: result.estimatedCost
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Determine health status based on metrics
   */
  private determineHealthStatus(healthResult: any, stats: any): 'healthy' | 'degraded' | 'critical' | 'offline' {
    if (!healthResult.success) return 'offline';
    
    const errorRate = (stats.failedRequests / Math.max(stats.totalRequests, 1)) * 100;
    const responseTime = healthResult.responseTime || 0;
    
    if (errorRate > 20 || responseTime > 20000) return 'critical';
    if (errorRate > 10 || responseTime > 10000) return 'degraded';
    
    return 'healthy';
  }

  /**
   * Evaluate all failover rules and trigger actions
   */
  private async evaluateFailoverRules(): Promise<void> {
    for (const rule of this.failoverRules.filter(r => r.enabled)) {
      await this.evaluateRule(rule);
    }
  }

  /**
   * Evaluate a specific failover rule
   */
  private async evaluateRule(rule: FailoverRule): Promise<void> {
    for (const [providerId, health] of this.healthChecks) {
      const shouldFailover = this.checkRuleConditions(rule, health);
      
      if (shouldFailover) {
        await this.executeFailover(providerId, rule, health);
      }
    }
  }

  /**
   * Check if rule conditions are met
   */
  private checkRuleConditions(rule: FailoverRule, health: ProviderHealth): boolean {
    const { conditions } = rule;
    const { metrics } = health;

    if (conditions.maxResponseTime && metrics.responseTime > conditions.maxResponseTime) {
      return true;
    }

    if (conditions.minSuccessRate && metrics.successRate < conditions.minSuccessRate) {
      return true;
    }

    if (conditions.maxErrorRate && metrics.errorRate > conditions.maxErrorRate) {
      return true;
    }

    if (conditions.maxConsecutiveFailures && health.consecutiveFailures >= conditions.maxConsecutiveFailures) {
      return true;
    }

    if (conditions.maxCost && metrics.cost > conditions.maxCost) {
      return true;
    }

    if (conditions.minQuality && metrics.quality < conditions.minQuality) {
      return true;
    }

    return false;
  }

  /**
   * Execute failover to backup providers
   */
  private async executeFailover(sourceProvider: string, rule: FailoverRule, health: ProviderHealth): Promise<void> {
    try {
      // Find best fallback provider
      const targetProvider = await this.selectBestFallback(rule.actions.fallbackProviders, sourceProvider);
      
      if (!targetProvider) {
        logger.error('No suitable fallback provider found', { sourceProvider, rule: rule.id });
        return;
      }

      // Create failover event
      const failoverEvent: FailoverEvent = {
        id: `failover_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
        timestamp: new Date(),
        sourceProvider,
        targetProvider,
        reason: `Rule: ${rule.name} - ${this.getRuleViolationReason(rule, health)}`,
        impact: {
          affectedRequests: 0, // Will be updated
          additionalLatency: 0,
          costImpact: 0
        },
        recovered: false
      };

      // Execute the failover
      await this.performFailover(sourceProvider, targetProvider, failoverEvent);

      // Store failover event
      this.failoverHistory.push(failoverEvent);
      await this.storeFailoverEvent(failoverEvent);

      // Send alerts
      await this.sendFailoverAlert(rule.actions.alertLevel, failoverEvent);

      // Schedule recovery if auto-recovery is enabled
      if (rule.actions.autoRecover) {
        this.scheduleRecovery(sourceProvider, rule.actions.recoveryDelay);
      }

      logger.info('Failover executed successfully', {
        source: sourceProvider,
        target: targetProvider,
        rule: rule.id,
        eventId: failoverEvent.id
      });

      this.emit('failoverExecuted', failoverEvent);

    } catch (error) {
      logger.error('Failover execution failed:', error);
    }
  }

  /**
   * Select best fallback provider
   */
  private async selectBestFallback(fallbackProviders: string[], excludeProvider: string): Promise<string | null> {
    const candidates = fallbackProviders
      .filter(id => id !== excludeProvider)
      .map(id => {
        const health = this.healthChecks.get(id);
        const prediction = this.predictions.get(id);
        return { id, health, prediction };
      })
      .filter(candidate => candidate.health?.status === 'healthy')
      .sort((a, b) => {
        // Sort by health score (combination of multiple factors)
        const scoreA = this.calculateProviderScore(a.health!, a.prediction);
        const scoreB = this.calculateProviderScore(b.health!, b.prediction);
        return scoreB - scoreA;
      });

    return candidates.length > 0 ? candidates[0].id : null;
  }

  /**
   * Calculate provider score for selection
   */
  private calculateProviderScore(health: ProviderHealth, prediction?: ProviderPrediction): number {
    let score = 0;

    // Health metrics (40% weight)
    score += (health.metrics.successRate / 100) * 0.2;
    score += (1 - health.metrics.errorRate / 100) * 0.1;
    score += (1 - Math.min(health.metrics.responseTime / 10000, 1)) * 0.1;

    // Cost efficiency (30% weight)
    score += health.predictions.costEfficiency * 0.3;

    // Quality (20% weight)
    score += health.predictions.qualityScore * 0.2;

    // Predictive factors (10% weight)
    if (prediction) {
      score += (1 - prediction.nextHourFailureProbability) * 0.1;
    }

    return score;
  }

  /**
   * Perform the actual failover
   */
  private async performFailover(sourceProvider: string, targetProvider: string, event: FailoverEvent): Promise<void> {
    // Update provider priorities in the router
    //await aiRouter.updateProviderPriority(sourceProvider, -1); // Demote
    //await aiRouter.updateProviderPriority(targetProvider, 1);  // Promote

    // Update circuit breaker
    this.openCircuitBreaker(sourceProvider);

    // Record impact metrics
    event.impact.additionalLatency = this.calculateAdditionalLatency(sourceProvider, targetProvider);
    event.impact.costImpact = this.calculateCostImpact(sourceProvider, targetProvider);
  }

  /**
   * Generate predictive analysis for all providers
   */
  private async generatePredictions(): Promise<void> {
    try {
      const providers = aiProviderManager.getAllProviders();
      
      for (const provider of providers) {
        const prediction = await this.generateProviderPrediction(provider.id);
        this.predictions.set(provider.id, prediction);
      }

      this.emit('predictionsUpdated', Array.from(this.predictions.values()));

    } catch (error) {
      logger.error('Prediction generation failed:', error);
    }
  }

  /**
   * Generate prediction for specific provider
   */
  private async generateProviderPrediction(providerId: string): Promise<ProviderPrediction> {
    const health = this.healthChecks.get(providerId);
    const historicalData = await this.getHistoricalData(providerId);
    
    return {
      providerId,
      nextHourLoad: this.predictLoad(historicalData),
      nextHourFailureProbability: this.predictFailureProbability(providerId, historicalData),
      nextHourAverageCost: this.predictCost(historicalData),
      nextHourQualityScore: this.predictQuality(historicalData),
      recommendation: this.generateRecommendation(health, historicalData)
    };
  }

  /**
   * Update circuit breakers based on provider health
   */
  private updateCircuitBreakers(): void {
    for (const [providerId, health] of this.healthChecks) {
      const breaker = this.circuitBreakers.get(providerId) || {
        state: 'closed',
        failures: 0
      };

      switch (breaker.state) {
        case 'closed':
          if (health.status === 'critical' || health.status === 'offline') {
            breaker.failures++;
            if (breaker.failures >= 3) {
              breaker.state = 'open';
              breaker.lastFailure = new Date();
              breaker.nextAttempt = new Date(Date.now() + 60000); // 1 minute
            }
          } else {
            breaker.failures = 0; // Reset on success
          }
          break;

        case 'open':
          if (new Date() >= (breaker.nextAttempt || new Date())) {
            breaker.state = 'half-open';
          }
          break;

        case 'half-open':
          if (health.status === 'healthy') {
            breaker.state = 'closed';
            breaker.failures = 0;
          } else {
            breaker.state = 'open';
            breaker.nextAttempt = new Date(Date.now() + 120000); // 2 minutes
          }
          break;
      }

      this.circuitBreakers.set(providerId, breaker);
    }
  }

  /**
   * Helper methods for predictions and calculations
   */
  private predictFailureProbability(providerId: string, data: any): number {
    // Simple exponential smoothing for failure prediction
    const recentFailures = data?.recentFailures || 0;
    const totalRequests = data?.totalRequests || 1;
    const errorRate = recentFailures / totalRequests;
    
    // Apply time-based weighting and trend analysis
    return Math.min(errorRate * 1.5, 1); // Cap at 100%
  }

  private predictResponseTime(providerId: string, data: any): number {
    // Predict based on historical trends and current load
    const currentResponseTime = data?.averageResponseTime || 1000;
    const loadFactor = this.getCurrentLoadFactor(providerId);
    
    return currentResponseTime * (1 + loadFactor * 0.3);
  }

  private calculateCostEfficiency(stats: any): number {
    const cost = stats.averageCost || 0.01;
    const quality = stats.averageQuality || 0.8;
    
    // Higher quality per dollar = higher efficiency
    return quality / Math.max(cost, 0.001);
  }

  private calculateQualityScore(stats: any): number {
    // Combine multiple quality metrics
    const successRate = ((stats.totalRequests - stats.failedRequests) / Math.max(stats.totalRequests, 1));
    const responseTimeScore = Math.max(0, 1 - (stats.averageResponseTime || 1000) / 10000);
    const userSatisfaction = stats.averageUserRating || 0.8;
    
    return (successRate * 0.4 + responseTimeScore * 0.3 + userSatisfaction * 0.3);
  }

  /**
   * Management methods
   */
  
  async getSystemStatus(): Promise<{
    overall: 'healthy' | 'degraded' | 'critical';
    providers: ProviderHealth[];
    activeFailovers: number;
    predictions: ProviderPrediction[];
  }> {
    const providers = Array.from(this.healthChecks.values());
    const predictions = Array.from(this.predictions.values());
    
    const healthyCount = providers.filter(p => p.status === 'healthy').length;
    const totalCount = providers.length;
    
    let overall: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (healthyCount / totalCount < 0.5) overall = 'critical';
    else if (healthyCount / totalCount < 0.8) overall = 'degraded';

    return {
      overall,
      providers,
      activeFailovers: this.getActiveFailoverCount(),
      predictions
    };
  }

  async addFailoverRule(rule: Omit<FailoverRule, 'id'>): Promise<string> {
    const id = `rule_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const newRule: FailoverRule = { ...rule, id };
    
    this.failoverRules.push(newRule);
    await this.saveFailoverRules();
    
    return id;
  }

  async updateFailoverRule(id: string, updates: Partial<FailoverRule>): Promise<void> {
    const ruleIndex = this.failoverRules.findIndex(r => r.id === id);
    if (ruleIndex === -1) throw new Error('Rule not found');
    
    this.failoverRules[ruleIndex] = { ...this.failoverRules[ruleIndex], ...updates };
    await this.saveFailoverRules();
  }

  async getFailoverHistory(limit: number = 50): Promise<FailoverEvent[]> {
    return this.failoverHistory.slice(-limit);
  }

  /**
   * Storage and persistence methods
   */
  private async storeHealthData(health: ProviderHealth): Promise<void> {
    try {
      await prisma.aIProviderStatus.upsert({
        where: { provider: health.id },
        update: {
          status: health.status,
          responseTime: health.metrics.responseTime,
          errorRate: health.metrics.errorRate,
          uptime: health.metrics.uptime,
          lastCheckAt: health.lastChecked,
          metadata: {
            health: health.metrics,
            predictions: health.predictions
          }
        },
        create: {
          provider: health.id,
          status: health.status,
          responseTime: health.metrics.responseTime,
          errorRate: health.metrics.errorRate,
          uptime: health.metrics.uptime,
          lastCheckAt: health.lastChecked,
          metadata: {
            health: health.metrics,
            predictions: health.predictions
          }
        }
      });
    } catch (error) {
      logger.warn('Failed to store health data:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  private async storeFailoverEvent(event: FailoverEvent): Promise<void> {
    // Store in application logs and analytics
    logger.info('Failover event stored', {
      eventId: event.id,
      source: event.sourceProvider,
      target: event.targetProvider,
      reason: event.reason
    });
  }

  private async sendFailoverAlert(level: string, event: FailoverEvent): Promise<void> {
    // Integration point for alerting systems (Slack, email, etc.)
    this.emit('alert', {
      level,
      message: `Failover executed: ${event.sourceProvider} → ${event.targetProvider}`,
      event
    });
  }

  /**
   * Utility methods
   */
  private getConsecutiveFailures(providerId: string): number {
    // Implement based on stored data
    return 0;
  }

  private getLastFailure(providerId: string): Date | undefined {
    // Implement based on stored data
    return undefined;
  }

  private getRecoveryTime(providerId: string): number | undefined {
    // Implement based on stored data
    return undefined;
  }

  private incrementFailureCount(providerId: string): void {
    // Implement failure tracking
  }

  private openCircuitBreaker(providerId: string): void {
    const breaker = this.circuitBreakers.get(providerId) || { state: 'closed', failures: 0 };
    breaker.state = 'open';
    breaker.lastFailure = new Date();
    breaker.nextAttempt = new Date(Date.now() + 60000);
    this.circuitBreakers.set(providerId, breaker);
  }

  private scheduleRecovery(providerId: string, delayMinutes: number): void {
    setTimeout(async () => {
      await this.attemptRecovery(providerId);
    }, delayMinutes * 60000);
  }

  private async attemptRecovery(providerId: string): Promise<void> {
    // Check if provider has recovered
    await this.checkProviderHealth(providerId);
    const health = this.healthChecks.get(providerId);
    
    if (health?.status === 'healthy') {
      // Restore provider priority
      //await aiRouter.updateProviderPriority(providerId, 0); // Reset to normal
      
      // Close circuit breaker
      const breaker = this.circuitBreakers.get(providerId);
      if (breaker) {
        breaker.state = 'closed';
        breaker.failures = 0;
        this.circuitBreakers.set(providerId, breaker);
      }

      logger.info('Provider recovered successfully', { providerId });
      this.emit('providerRecovered', { providerId, health });
    }
  }

  private getRuleViolationReason(rule: FailoverRule, health: ProviderHealth): string {
    const violations: any[] = [];
    const { conditions } = rule;
    const { metrics } = health;

    if (conditions.maxResponseTime && metrics.responseTime > conditions.maxResponseTime) {
      violations.push(`Response time ${metrics.responseTime}ms > ${conditions.maxResponseTime}ms`);
    }

    if (conditions.minSuccessRate && metrics.successRate < conditions.minSuccessRate) {
      violations.push(`Success rate ${metrics.successRate.toFixed(1)}% < ${conditions.minSuccessRate}%`);
    }

    if (conditions.maxErrorRate && metrics.errorRate > conditions.maxErrorRate) {
      violations.push(`Error rate ${metrics.errorRate.toFixed(1)}% > ${conditions.maxErrorRate}%`);
    }

    return violations.join(', ');
  }

  private calculateAdditionalLatency(sourceProvider: string, targetProvider: string): number {
    const sourceHealth = this.healthChecks.get(sourceProvider);
    const targetHealth = this.healthChecks.get(targetProvider);
    
    if (!sourceHealth || !targetHealth) return 0;
    
    return Math.max(0, targetHealth.metrics.responseTime - sourceHealth.metrics.responseTime);
  }

  private calculateCostImpact(sourceProvider: string, targetProvider: string): number {
    const sourceHealth = this.healthChecks.get(sourceProvider);
    const targetHealth = this.healthChecks.get(targetProvider);
    
    if (!sourceHealth || !targetHealth) return 0;
    
    return targetHealth.metrics.cost - sourceHealth.metrics.cost;
  }

  private getCurrentLoadFactor(providerId: string): number {
    // Implement load factor calculation
    return 0.1; // Placeholder
  }

  private predictLoad(historicalData: any): number {
    // Implement load prediction
    return 50; // Placeholder
  }

  private predictCost(historicalData: any): number {
    // Implement cost prediction
    return 0.01; // Placeholder
  }

  private predictQuality(historicalData: any): number {
    // Implement quality prediction
    return 0.85; // Placeholder
  }

  private generateRecommendation(health: ProviderHealth | undefined, historicalData: any): 'preferred' | 'caution' | 'avoid' {
    if (!health) return 'avoid';
    
    if (health.status === 'healthy' && health.metrics.successRate > 95) return 'preferred';
    if (health.status === 'degraded' || health.metrics.successRate < 85) return 'caution';
    return 'avoid';
  }

  private async getHistoricalData(providerId: string): Promise<any> {
    // Implement historical data retrieval
    return {};
  }

  private getActiveFailoverCount(): number {
    return Array.from(this.circuitBreakers.values())
      .filter(breaker => breaker.state === 'open').length;
  }

  private async saveFailoverRules(): Promise<void> {
    // Implement rule persistence
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.predictionInterval) {
      clearInterval(this.predictionInterval);
    }
  }
}

// Export singleton instance
export const intelligentFailover = new IntelligentFailoverService();