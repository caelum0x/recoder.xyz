/**
 * Budget Manager with Enforcement and Alerts
 * 
 * Comprehensive budget management system with real-time enforcement,
 * proactive alerts, cost optimization recommendations, and intelligent
 * spending control for AI model usage in recoder.xyz.
 */

import { Logger } from '@recoder/shared';
import { EventEmitter } from 'events'; 

export interface BudgetLimit {
  id: string;
  name: string;
  type: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  amount: number;                    // Budget limit in USD
  currency: 'USD' | 'EUR' | 'GBP';
  scope: {
    models?: string[];               // Specific models
    providers?: string[];            // Specific providers
    users?: string[];                // Specific users
    projects?: string[];             // Specific projects
    global?: boolean;                // Global budget
  };
  period: {
    start: Date;
    end: Date;
    recurring: boolean;              // Auto-renew periods
  };
  thresholds: {
    warning: number;                 // % threshold for warnings (e.g., 75%)
    critical: number;                // % threshold for critical alerts (e.g., 90%)
    emergency: number;               // % threshold for emergency actions (e.g., 95%)
  };
  actions: {
    warningActions: BudgetAction[];
    criticalActions: BudgetAction[];
    emergencyActions: BudgetAction[];
    overLimitActions: BudgetAction[];
  };
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetAction {
  type: 'alert' | 'throttle' | 'block' | 'switch_model' | 'notification' | 'webhook';
  config: {
    // Alert actions
    recipients?: string[];
    channels?: string[];
    
    // Throttle actions
    throttleRate?: number;           // Reduce usage by %
    throttleDuration?: number;       // Duration in minutes
    
    // Block actions
    blockDuration?: number;          // Duration in minutes
    allowedModels?: string[];        // Models still allowed
    
    // Switch model actions
    fallbackModel?: string;
    fallbackProvider?: string;
    qualityThreshold?: number;       // Minimum quality to maintain
    
    // Webhook actions
    webhookUrl?: string;
    payload?: Record<string, any>;
  };
}

export interface BudgetAlert {
  id: string;
  budgetId: string;
  type: 'warning' | 'critical' | 'emergency' | 'over_limit';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  currentSpend: number;
  budgetLimit: number;
  utilizationPercentage: number;
  projectedOverrun?: number;
  timeRemaining: number;            // Time remaining in budget period (minutes)
  recommendations: string[];
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface BudgetUsage {
  budgetId: string;
  period: {
    start: Date;
    end: Date;
  };
  currentSpend: number;
  budgetLimit: number;
  utilizationPercentage: number;
  projectedSpend: number;           // Based on current trend
  projectedOverrun: number;         // Amount expected to exceed budget
  breakdown: {
    byModel: Record<string, number>;
    byProvider: Record<string, number>;
    byUser: Record<string, number>;
    byProject: Record<string, number>;
    byDay: Array<{ date: string; amount: number }>;
  };
  efficiency: {
    costPerRequest: number;
    costPerToken: number;
    costPerQualityPoint: number;    // Cost relative to output quality
  };
  recommendations: BudgetRecommendation[];
}

export interface BudgetRecommendation {
  type: 'model_switch' | 'usage_optimization' | 'budget_adjustment' | 'scheduling';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  potentialSavings: number;         // USD per period
  implementation: {
    effort: 'low' | 'medium' | 'high';
    riskLevel: 'low' | 'medium' | 'high';
    steps: string[];
  };
  metrics: {
    currentCost: number;
    projectedCost: number;
    qualityImpact?: number;         // -1 to 1 scale
    performanceImpact?: number;     // -1 to 1 scale
  };
}

export interface BudgetEnforcement {
  budgetId: string;
  enforcementId: string;
  action: BudgetAction;
  trigger: {
    threshold: number;
    currentUtilization: number;
    timestamp: Date;
  };
  status: 'active' | 'expired' | 'overridden';
  startTime: Date;
  endTime?: Date;
  impact: {
    requestsBlocked?: number;
    requestsThrottled?: number;
    modelSwitches?: number;
    costSavings?: number;
  };
}

export class BudgetManager extends EventEmitter {
  private budgets: Map<string, BudgetLimit> = new Map();
  private activeAlerts: Map<string, BudgetAlert> = new Map();
  private enforcements: Map<string, BudgetEnforcement> = new Map();
  private usageCache: Map<string, BudgetUsage> = new Map();
  
  private config = {
    checkInterval: 60000,            // Check budgets every minute
    usageCacheExpiry: 300000,        // Cache usage data for 5 minutes
    alertCooldown: 3600000,          // 1 hour cooldown between same alerts
    enforcementTimeout: 86400000,    // 24 hours max enforcement
    projectionWindow: 86400000,      // 24 hours for spending projection
  };

  private monitoringTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor() {
    super();
    this.initializeDefaultBudgets();
  }

  private initializeDefaultBudgets(): void {
    const defaultBudgets: BudgetLimit[] = [
      {
        id: 'monthly_global',
        name: 'Global Monthly Budget',
        type: 'monthly',
        amount: 10000,
        currency: 'USD',
        scope: { global: true },
        period: {
          start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
          recurring: true
        },
        thresholds: {
          warning: 75,
          critical: 90,
          emergency: 95
        },
        actions: {
          warningActions: [
            {
              type: 'alert',
              config: {
                recipients: ['admin@recoder.xyz'],
                channels: ['slack_alerts']
              }
            }
          ],
          criticalActions: [
            {
              type: 'alert',
              config: {
                recipients: ['admin@recoder.xyz', 'finance@recoder.xyz'],
                channels: ['slack_alerts', 'email_oncall']
              }
            },
            {
              type: 'throttle',
              config: {
                throttleRate: 25,
                throttleDuration: 60
              }
            }
          ],
          emergencyActions: [
            {
              type: 'switch_model',
              config: {
                fallbackModel: 'groq-llama3-8b',
                qualityThreshold: 0.7
              }
            }
          ],
          overLimitActions: [
            {
              type: 'block',
              config: {
                blockDuration: 60,
                allowedModels: ['groq-llama3-8b', 'ollama-local']
              }
            }
          ]
        },
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'daily_claude',
        name: 'Daily Claude Budget',
        type: 'daily',
        amount: 500,
        currency: 'USD',
        scope: { providers: ['anthropic'] },
        period: {
          start: new Date(),
          end: new Date(Date.now() + 86400000),
          recurring: true
        },
        thresholds: {
          warning: 70,
          critical: 85,
          emergency: 95
        },
        actions: {
          warningActions: [
            {
              type: 'notification',
              config: {
                recipients: ['ops@recoder.xyz']
              }
            }
          ],
          criticalActions: [
            {
              type: 'switch_model',
              config: {
                fallbackModel: 'groq-llama3-70b',
                fallbackProvider: 'groq'
              }
            }
          ],
          emergencyActions: [
            {
              type: 'throttle',
              config: {
                throttleRate: 50,
                throttleDuration: 120
              }
            }
          ],
          overLimitActions: [
            {
              type: 'block',
              config: {
                blockDuration: 1440,
                allowedModels: ['groq-llama3-8b']
              }
            }
          ]
        },
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    defaultBudgets.forEach(budget => {
      this.budgets.set(budget.id, budget);
    });

    Logger.info(`Initialized ${defaultBudgets.length} default budget limits`);
  }

  /**
   * Start budget monitoring and enforcement
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      Logger.warn('Budget manager is already running');
      return;
    }

    Logger.info('Starting budget monitoring and enforcement...');

    // Start budget monitoring timer
    this.monitoringTimer = setInterval(() => {
      this.monitorBudgets();
    }, this.config.checkInterval);

    this.isRunning = true;
    this.emit('budgetMonitoringStarted');

    Logger.info('Budget manager started successfully');
  }

  /**
   * Stop budget monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    Logger.info('Stopping budget monitoring...');

    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }

    this.isRunning = false;
    this.emit('budgetMonitoringStopped');

    Logger.info('Budget manager stopped');
  }

  /**
   * Set budget limits
   */
  async setBudgetLimits(budget: BudgetLimit): Promise<void> {
    this.budgets.set(budget.id, { ...budget, updatedAt: new Date() });
    
    // Clear cached usage data for this budget
    this.usageCache.delete(budget.id);
    
    this.emit('budgetLimitSet', budget);
    Logger.info(`Set budget limit: ${budget.name} - $${budget.amount} ${budget.type}`);
  }

  /**
   * Get budget limits
   */
  getBudgetLimits(): BudgetLimit[] {
    return Array.from(this.budgets.values());
  }

  /**
   * Check budget health for all budgets
   */
  async checkBudgetHealth(): Promise<{
    overall: 'healthy' | 'warning' | 'critical' | 'emergency' | 'over_limit';
    budgets: Array<{ budget: BudgetLimit; usage: BudgetUsage; health: string }>;
    activeAlerts: BudgetAlert[];
    recommendations: BudgetRecommendation[];
  }> {
    const budgetHealth: Array<{ budget: BudgetLimit; usage: BudgetUsage; health: string }> = [];
    let overallHealth: 'healthy' | 'warning' | 'critical' | 'emergency' | 'over_limit' = 'healthy';
    const allRecommendations: BudgetRecommendation[] = [];

    for (const budget of this.budgets.values()) {
      if (!budget.enabled) continue;

      const usage = await this.getBudgetUsage(budget.id);
      let health = 'healthy';

      if (usage.utilizationPercentage >= budget.thresholds.emergency) {
        health = 'emergency';
      } else if (usage.utilizationPercentage >= budget.thresholds.critical) {
        health = 'critical';
      } else if (usage.utilizationPercentage >= budget.thresholds.warning) {
        health = 'warning';
      }

      if (usage.currentSpend > budget.amount) {
        health = 'over_limit';
      }

      budgetHealth.push({ budget, usage, health });
      allRecommendations.push(...usage.recommendations);

      // Update overall health (worst case)
      if (health === 'over_limit' || overallHealth === 'over_limit') {
        overallHealth = 'over_limit';
      } else if (health === 'emergency' && overallHealth !== 'over_limit' as any) {
        overallHealth = 'emergency';
      } else if (health === 'critical' && !['over_limit', 'emergency'].includes(overallHealth)) {
        overallHealth = 'critical';
      } else if (health === 'warning' && overallHealth === 'healthy') {
        overallHealth = 'warning';
      }
    }

    return {
      overall: overallHealth,
      budgets: budgetHealth,
      activeAlerts: Array.from(this.activeAlerts.values()),
      recommendations: this.deduplicateRecommendations(allRecommendations)
    };
  }

  /**
   * Get budget usage for a specific budget
   */
  async getBudgetUsage(budgetId: string): Promise<BudgetUsage> {
    // Check cache first
    const cached = this.usageCache.get(budgetId);
    if (cached && Date.now() - cached.period.start.getTime() < this.config.usageCacheExpiry) {
      return cached;
    }

    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    // This would integrate with the advanced cost monitor
    // For now, simulating usage data
    const currentSpend = this.simulateCurrentSpend(budget);
    const utilizationPercentage = (currentSpend / budget.amount) * 100;
    const projectedSpend = this.projectSpending(currentSpend, budget);
    const projectedOverrun = Math.max(0, projectedSpend - budget.amount);

    const usage: BudgetUsage = {
      budgetId,
      period: budget.period,
      currentSpend,
      budgetLimit: budget.amount,
      utilizationPercentage,
      projectedSpend,
      projectedOverrun,
      breakdown: this.generateUsageBreakdown(budget, currentSpend),
      efficiency: this.calculateEfficiencyMetrics(budget, currentSpend),
      recommendations: this.generateBudgetRecommendations(budget, currentSpend, projectedSpend)
    };

    // Cache the result
    this.usageCache.set(budgetId, usage);

    return usage;
  }

  /**
   * Enforce budget limits (called by cost tracking system)
   */
  async enforceBudgetLimits(
    usage: { budgetId: string; currentSpend: number; utilizationPercentage: number }
  ): Promise<BudgetEnforcement[]> {
    const budget = this.budgets.get(usage.budgetId);
    if (!budget || !budget.enabled) {
      return [];
    }

    const enforcements: BudgetEnforcement[] = [];
    const now = new Date();

    // Determine which threshold has been crossed
    let triggeredActions: BudgetAction[] = [];
    let thresholdType: 'warning' | 'critical' | 'emergency' | 'over_limit' = 'warning';

    if (usage.currentSpend > budget.amount) {
      triggeredActions = budget.actions.overLimitActions;
      thresholdType = 'over_limit';
    } else if (usage.utilizationPercentage >= budget.thresholds.emergency) {
      triggeredActions = budget.actions.emergencyActions;
      thresholdType = 'emergency';
    } else if (usage.utilizationPercentage >= budget.thresholds.critical) {
      triggeredActions = budget.actions.criticalActions;
      thresholdType = 'critical';
    } else if (usage.utilizationPercentage >= budget.thresholds.warning) {
      triggeredActions = budget.actions.warningActions;
      thresholdType = 'warning';
    }

    // Generate alert
    await this.createBudgetAlert(budget, usage, thresholdType);

    // Execute enforcement actions
    for (const action of triggeredActions) {
      const enforcementId = `enforcement_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const enforcement: BudgetEnforcement = {
        budgetId: usage.budgetId,
        enforcementId,
        action,
        trigger: {
          threshold: this.getThresholdValue(budget, thresholdType),
          currentUtilization: usage.utilizationPercentage,
          timestamp: now
        },
        status: 'active',
        startTime: now,
        impact: {
          requestsBlocked: 0,
          requestsThrottled: 0,
          modelSwitches: 0,
          costSavings: 0
        }
      };

      // Set end time for temporary actions
      if (action.type === 'throttle' && action.config.throttleDuration) {
        enforcement.endTime = new Date(now.getTime() + action.config.throttleDuration * 60000);
      } else if (action.type === 'block' && action.config.blockDuration) {
        enforcement.endTime = new Date(now.getTime() + action.config.blockDuration * 60000);
      }

      this.enforcements.set(enforcementId, enforcement);
      enforcements.push(enforcement);

      // Execute the action
      await this.executeEnforcementAction(enforcement);
    }

    return enforcements;
  }

  /**
   * Suggest cost optimizations
   */
  async suggestCostOptimizations(budgetId: string): Promise<BudgetRecommendation[]> {
    const budget = this.budgets.get(budgetId);
    if (!budget) {
      throw new Error(`Budget ${budgetId} not found`);
    }

    const usage = await this.getBudgetUsage(budgetId);
    return this.generateAdvancedRecommendations(budget, usage);
  }

  /**
   * Get active budget alerts
   */
  getActiveAlerts(): BudgetAlert[] {
    return Array.from(this.activeAlerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Acknowledge budget alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }

    alert.acknowledged = true;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    this.emit('alertAcknowledged', alert);
    Logger.info(`Budget alert ${alertId} acknowledged by ${acknowledgedBy}`);
  }

  /**
   * Check if request should be blocked/throttled
   */
  async checkRequestAllowed(request: {
    model: string;
    provider: string;
    user?: string;
    project?: string;
  }): Promise<{
    allowed: boolean;
    reason?: string;
    alternativeModel?: string;
    throttleDelay?: number;
  }> {
    // Check all active enforcements
    for (const enforcement of this.enforcements.values()) {
      if (enforcement.status !== 'active') continue;
      if (enforcement.endTime && new Date() > enforcement.endTime) {
        enforcement.status = 'expired';
        continue;
      }

      const budget = this.budgets.get(enforcement.budgetId);
      if (!budget || !this.requestMatchesBudgetScope(request, budget)) {
        continue;
      }

      switch (enforcement.action.type) {
        case 'block':
          const allowedModels = enforcement.action.config.allowedModels;
          if (!allowedModels || !allowedModels.includes(request.model)) {
            return {
              allowed: false,
              reason: `Request blocked due to budget enforcement on ${budget.name}`,
              alternativeModel: allowedModels?.[0]
            };
          }
          break;

        case 'throttle':
          // Implement throttling logic
          const throttleRate = enforcement.action.config.throttleRate || 0;
          const throttleDelay = Math.random() < (throttleRate / 100) ? 
            1000 + Math.random() * 4000 : 0; // 1-5 second delay
          
          if (throttleDelay > 0) {
            enforcement.impact.requestsThrottled = (enforcement.impact.requestsThrottled || 0) + 1;
            return {
              allowed: true,
              reason: `Request throttled due to budget enforcement on ${budget.name}`,
              throttleDelay
            };
          }
          break;

        case 'switch_model':
          const fallbackModel = enforcement.action.config.fallbackModel;
          const fallbackProvider = enforcement.action.config.fallbackProvider;
          
          if (fallbackModel && request.model !== fallbackModel) {
            enforcement.impact.modelSwitches = (enforcement.impact.modelSwitches || 0) + 1;
            return {
              allowed: true,
              reason: `Model switched due to budget enforcement on ${budget.name}`,
              alternativeModel: fallbackModel
            };
          }
          break;
      }
    }

    return { allowed: true };
  }

  // Private helper methods

  private async monitorBudgets(): Promise<void> {
    for (const budget of this.budgets.values()) {
      if (!budget.enabled) continue;

      try {
        const usage = await this.getBudgetUsage(budget.id);
        
        // Check if enforcement is needed
        if (usage.utilizationPercentage >= budget.thresholds.warning) {
          await this.enforceBudgetLimits({
            budgetId: budget.id,
            currentSpend: usage.currentSpend,
            utilizationPercentage: usage.utilizationPercentage
          });
        }
      } catch (error) {
        Logger.error(`Error monitoring budget ${budget.id}:`, error);
      }
    }
  }

  private simulateCurrentSpend(budget: BudgetLimit): number {
    // This would be replaced with actual cost tracking integration
    const baseSpend = budget.amount * 0.45; // 45% of budget used on average
    const variance = (Math.random() - 0.5) * 0.4; // ±20% variance
    return Math.max(0, baseSpend * (1 + variance));
  }

  private projectSpending(currentSpend: number, budget: BudgetLimit): number {
    const now = new Date();
    const periodStart = budget.period.start;
    const periodEnd = budget.period.end;
    
    const totalPeriodMs = periodEnd.getTime() - periodStart.getTime();
    const elapsedMs = now.getTime() - periodStart.getTime();
    const remainingMs = periodEnd.getTime() - now.getTime();
    
    if (elapsedMs <= 0) return currentSpend;
    if (remainingMs <= 0) return currentSpend;
    
    // Linear projection based on current rate
    const currentRate = currentSpend / elapsedMs;
    return currentSpend + (currentRate * remainingMs);
  }

  private generateUsageBreakdown(budget: BudgetLimit, currentSpend: number): BudgetUsage['breakdown'] {
    // This would integrate with actual usage tracking
    return {
      byModel: {
        'claude-3-sonnet': currentSpend * 0.4,
        'groq-llama3-70b': currentSpend * 0.3,
        'gemini-pro': currentSpend * 0.2,
        'ollama-local': currentSpend * 0.1
      },
      byProvider: {
        'anthropic': currentSpend * 0.4,
        'groq': currentSpend * 0.3,
        'google': currentSpend * 0.2,
        'ollama': currentSpend * 0.1
      },
      byUser: {
        'system': currentSpend * 0.6,
        'user1': currentSpend * 0.25,
        'user2': currentSpend * 0.15
      },
      byProject: {
        'main_app': currentSpend * 0.7,
        'testing': currentSpend * 0.2,
        'research': currentSpend * 0.1
      },
      byDay: this.generateDailyBreakdown(currentSpend, budget)
    };
  }

  private generateDailyBreakdown(currentSpend: number, budget: BudgetLimit): Array<{ date: string; amount: number }> {
    const breakdown: Array<{ date: string; amount: number }> = [];
    const now = new Date();
    const periodStart = budget.period.start;
    
    for (let d = new Date(periodStart); d <= now; d.setDate(d.getDate() + 1)) {
      const dailyAmount = (currentSpend / 7) * (0.8 + Math.random() * 0.4); // Simulate daily variance
      breakdown.push({
        date: d.toISOString().split('T')[0],
        amount: dailyAmount
      });
    }
    
    return breakdown;
  }

  private calculateEfficiencyMetrics(budget: BudgetLimit, currentSpend: number): BudgetUsage['efficiency'] {
    // This would integrate with actual performance metrics
    return {
      costPerRequest: currentSpend / 1000, // Assume 1000 requests
      costPerToken: currentSpend / 50000,  // Assume 50k tokens
      costPerQualityPoint: currentSpend / 850 // Assume 85% average quality
    };
  }

  private generateBudgetRecommendations(
    budget: BudgetLimit, 
    currentSpend: number, 
    projectedSpend: number
  ): BudgetRecommendation[] {
    const recommendations: BudgetRecommendation[] = [];
    
    if (projectedSpend > budget.amount) {
      recommendations.push({
        type: 'model_switch',
        priority: 'high',
        title: 'Switch to more cost-effective models',
        description: 'Consider using Groq or Ollama models for non-critical tasks',
        potentialSavings: (projectedSpend - budget.amount) * 0.6,
        implementation: {
          effort: 'medium',
          riskLevel: 'low',
          steps: [
            'Identify non-critical use cases',
            'Configure model routing rules',
            'Monitor quality metrics',
            'Gradually increase usage'
          ]
        },
        metrics: {
          currentCost: currentSpend,
          projectedCost: projectedSpend * 0.7,
          qualityImpact: -0.1,
          performanceImpact: 0.1
        }
      });
    }
    
    return recommendations;
  }

  private generateAdvancedRecommendations(budget: BudgetLimit, usage: BudgetUsage): BudgetRecommendation[] {
    const recommendations: BudgetRecommendation[] = [...usage.recommendations];
    
    // Add more sophisticated recommendations based on usage patterns
    if (usage.breakdown.byModel['claude-3-sonnet'] > usage.currentSpend * 0.5) {
      recommendations.push({
        type: 'usage_optimization',
        priority: 'medium',
        title: 'Optimize Claude usage patterns',
        description: 'High Claude usage detected. Consider prompt optimization and caching.',
        potentialSavings: usage.currentSpend * 0.15,
        implementation: {
          effort: 'low',
          riskLevel: 'low',
          steps: [
            'Implement response caching',
            'Optimize prompt templates',
            'Use smaller models for simple tasks'
          ]
        },
        metrics: {
          currentCost: usage.breakdown.byModel['claude-3-sonnet'],
          projectedCost: usage.breakdown.byModel['claude-3-sonnet'] * 0.85,
          qualityImpact: 0,
          performanceImpact: 0.05
        }
      });
    }
    
    return recommendations;
  }

  private async createBudgetAlert(
    budget: BudgetLimit,
    usage: { currentSpend: number; utilizationPercentage: number },
    type: 'warning' | 'critical' | 'emergency' | 'over_limit'
  ): Promise<void> {
    const alertId = `alert_${budget.id}_${type}_${Date.now()}`;
    
    // Check cooldown
    const existingAlert = Array.from(this.activeAlerts.values()).find(
      alert => alert.budgetId === budget.id && 
               alert.type === type && 
               !alert.resolved &&
               Date.now() - alert.timestamp.getTime() < this.config.alertCooldown
    );
    
    if (existingAlert) {
      return; // Skip duplicate alert within cooldown period
    }

    const timeRemaining = budget.period.end.getTime() - Date.now();
    const projectedOverrun = usage.currentSpend > budget.amount ? 
      usage.currentSpend - budget.amount : 0;

    const alert: BudgetAlert = {
      id: alertId,
      budgetId: budget.id,
      type,
      severity: this.mapAlertSeverity(type),
      title: `Budget ${type.replace('_', ' ')} - ${budget.name}`,
      message: this.generateAlertMessage(budget, usage, type),
      currentSpend: usage.currentSpend,
      budgetLimit: budget.amount,
      utilizationPercentage: usage.utilizationPercentage,
      projectedOverrun,
      timeRemaining: Math.max(0, timeRemaining / 60000), // Convert to minutes
      recommendations: await this.getAlertRecommendations(budget, usage, type),
      timestamp: new Date(),
      acknowledged: false,
      resolved: false
    };

    this.activeAlerts.set(alertId, alert);
    this.emit('budgetAlert', alert);
    
    Logger.warn(`Budget alert created: ${alert.title} - ${usage.utilizationPercentage.toFixed(1)}% utilized`);
  }

  private mapAlertSeverity(type: 'warning' | 'critical' | 'emergency' | 'over_limit'): 'low' | 'medium' | 'high' | 'critical' {
    switch (type) {
      case 'warning': return 'medium';
      case 'critical': return 'high';
      case 'emergency': return 'critical';
      case 'over_limit': return 'critical';
    }
  }

  private generateAlertMessage(
    budget: BudgetLimit,
    usage: { currentSpend: number; utilizationPercentage: number },
    type: string
  ): string {
    const messages = {
      warning: `Budget utilization has reached ${usage.utilizationPercentage.toFixed(1)}% ($${usage.currentSpend.toFixed(2)} of $${budget.amount}).`,
      critical: `Critical budget threshold exceeded at ${usage.utilizationPercentage.toFixed(1)}% utilization. Immediate attention required.`,
      emergency: `Emergency budget threshold reached! ${usage.utilizationPercentage.toFixed(1)}% of budget consumed. Automatic cost controls activated.`,
      over_limit: `Budget limit exceeded! Current spend: $${usage.currentSpend.toFixed(2)}, Budget: $${budget.amount}. Immediate action required.`
    };
    
    return messages[type] || `Budget alert: ${usage.utilizationPercentage.toFixed(1)}% utilized`;
  }

  private async getAlertRecommendations(
    budget: BudgetLimit,
    usage: { currentSpend: number; utilizationPercentage: number },
    type: string
  ): Promise<string[]> {
    const recommendations: string[] = [];
    
    if (type === 'warning') {
      recommendations.push('Monitor spending closely over the next 24 hours');
      recommendations.push('Consider switching to more cost-effective models for non-critical tasks');
    } else if (type === 'critical') {
      recommendations.push('Implement immediate cost controls');
      recommendations.push('Review and pause non-essential AI usage');
      recommendations.push('Switch to lower-cost model alternatives');
    } else if (type === 'emergency' || type === 'over_limit') {
      recommendations.push('Activate emergency cost controls immediately');
      recommendations.push('Block high-cost model usage temporarily');
      recommendations.push('Review and approve all AI requests manually');
      recommendations.push('Contact finance team for budget adjustment');
    }
    
    return recommendations;
  }

  private getThresholdValue(budget: BudgetLimit, type: 'warning' | 'critical' | 'emergency' | 'over_limit'): number {
    switch (type) {
      case 'warning': return budget.thresholds.warning;
      case 'critical': return budget.thresholds.critical;
      case 'emergency': return budget.thresholds.emergency;
      case 'over_limit': return 100;
    }
  }

  private async executeEnforcementAction(enforcement: BudgetEnforcement): Promise<void> {
    try {
      switch (enforcement.action.type) {
        case 'alert':
          await this.executeAlertAction(enforcement);
          break;
        case 'webhook':
          await this.executeWebhookAction(enforcement);
          break;
        // Block, throttle, and switch_model are handled in checkRequestAllowed
      }
    } catch (error) {
      Logger.error(`Failed to execute enforcement action ${enforcement.action.type}:`, error);
    }
  }

  private async executeAlertAction(enforcement: BudgetEnforcement): Promise<void> {
    const config = enforcement.action.config;
    Logger.info(`Would send budget enforcement alert to ${config.recipients?.join(', ')}`);
  }

  private async executeWebhookAction(enforcement: BudgetEnforcement): Promise<void> {
    const config = enforcement.action.config;
    Logger.info(`Would call webhook ${config.webhookUrl} for budget enforcement`);
  }

  private requestMatchesBudgetScope(
    request: { model: string; provider: string; user?: string; project?: string },
    budget: BudgetLimit
  ): boolean {
    const scope = budget.scope;
    
    if (scope.global) return true;
    
    if (scope.models && !scope.models.includes(request.model)) return false;
    if (scope.providers && !scope.providers.includes(request.provider)) return false;
    if (scope.users && request.user && !scope.users.includes(request.user)) return false;
    if (scope.projects && request.project && !scope.projects.includes(request.project)) return false;
    
    return true;
  }

  private deduplicateRecommendations(recommendations: BudgetRecommendation[]): BudgetRecommendation[] {
    const seen = new Set<string>();
    return recommendations.filter(rec => {
      const key = `${rec.type}_${rec.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

// Export singleton instance
export const budgetManager = new BudgetManager();