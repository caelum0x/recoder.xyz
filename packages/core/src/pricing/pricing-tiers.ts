/**
 * Tiered Pricing Structure for Recoder.xyz
 * 
 * Implements Free/Pro/Enterprise pricing with usage limits and features
 * Optimized for 65-79% profit margins on $20 Pro plans
 */

export interface PricingTier {
  id: string;
  name: string;
  price: {
    monthly: number;
    yearly: number;
    currency: 'USD';
  };
  limits: {
    monthlyRequests: number;
    monthlyTokens: number;
    costBudget: number;
    concurrentSessions: number;
    contextCacheSize: number; // MB
    reasoningSessions: number;
    agentWorkflows: number;
  };
  features: {
    models: string[];
    agents: string[];
    reasoning: boolean;
    contextCaching: boolean;
    costOptimization: boolean;
    prioritySupport: boolean;
    customIntegrations: boolean;
    teamCollaboration: boolean;
    analytics: boolean;
    apiAccess: boolean;
    whiteLabel: boolean;
    sla: string | null;
  };
  restrictions: {
    modelAccess: 'basic' | 'standard' | 'full';
    responseTime: 'standard' | 'priority' | 'enterprise';
    support: 'community' | 'email' | 'priority' | 'dedicated';
  };
  metadata: {
    popular: boolean;
    targetMargin: number;
    estimatedCost: number;
    description: string;
    cta: string;
  };
}

export interface UsageQuota {
  userId: string;
  tierId: string;
  period: 'monthly' | 'yearly';
  usage: {
    requests: number;
    tokens: number;
    cost: number;
    cacheMisses: number;
    reasoningSessions: number;
    agentWorkflows: number;
  };
  limits: {
    requests: number;
    tokens: number;
    cost: number;
    reasoningSessions: number;
    agentWorkflows: number;
  };
  resetDate: Date;
  overageCharges: number;
}

export interface BillingEvent {
  id: string;
  userId: string;
  type: 'subscription' | 'usage' | 'overage' | 'credit';
  amount: number;
  currency: 'USD';
  description: string;
  metadata: Record<string, any>;
  timestamp: Date;
  processed: boolean;
}

export class PricingManager {
  private tiers: Map<string, PricingTier> = new Map();
  private userQuotas: Map<string, UsageQuota> = new Map();
  private billingEvents: BillingEvent[] = [];

  constructor() {
    this.initializeTiers();
  }

  private initializeTiers(): void {
    // Free Tier - Local models only, limited usage
    this.registerTier({
      id: 'free',
      name: 'Free',
      price: {
        monthly: 0,
        yearly: 0,
        currency: 'USD'
      },
      limits: {
        monthlyRequests: 100,
        monthlyTokens: 50000,
        costBudget: 0,
        concurrentSessions: 1,
        contextCacheSize: 10, // 10MB
        reasoningSessions: 5,
        agentWorkflows: 2
      },
      features: {
        models: ['ollama/llama3.2', 'ollama/codellama'],
        agents: ['basic-analysis'],
        reasoning: false,
        contextCaching: true,
        costOptimization: false,
        prioritySupport: false,
        customIntegrations: false,
        teamCollaboration: false,
        analytics: false,
        apiAccess: false,
        whiteLabel: false,
        sla: null
      },
      restrictions: {
        modelAccess: 'basic',
        responseTime: 'standard',
        support: 'community'
      },
      metadata: {
        popular: false,
        targetMargin: 1.0, // 100% margin (no costs)
        estimatedCost: 0,
        description: 'Perfect for getting started with local AI models',
        cta: 'Start Free'
      }
    });

    // Pro Tier - Main tier optimized for 65% margin
    this.registerTier({
      id: 'pro',
      name: 'Pro',
      price: {
        monthly: 20,
        yearly: 200, // 2 months free
        currency: 'USD'
      },
      limits: {
        monthlyRequests: 5000,
        monthlyTokens: 2000000, // 2M tokens
        costBudget: 13.00, // Target $13 cost for 65% margin
        concurrentSessions: 3,
        contextCacheSize: 500, // 500MB
        reasoningSessions: 100,
        agentWorkflows: 50
      },
      features: {
        models: [
          'meta-llama/llama-3.3-70b-instruct',
          'qwen/qwen-3-coder-480b',
          'moonshot/kimi-k2',
          'deepseek/deepseek-r1',
          'anthropic/claude-3.5-sonnet'
        ],
        agents: [
          'code-analysis',
          'research',
          'code-generation',
          'decision-making'
        ],
        reasoning: true,
        contextCaching: true,
        costOptimization: true,
        prioritySupport: true,
        customIntegrations: true,
        teamCollaboration: false,
        analytics: true,
        apiAccess: true,
        whiteLabel: false,
        sla: '99.5% uptime'
      },
      restrictions: {
        modelAccess: 'standard',
        responseTime: 'priority',
        support: 'email'
      },
      metadata: {
        popular: true,
        targetMargin: 0.65, // 65% margin
        estimatedCost: 13.00,
        description: 'Full AI power with all models and advanced features',
        cta: 'Start Pro Trial'
      }
    });

    // Enterprise Tier - Unlimited usage with premium support
    this.registerTier({
      id: 'enterprise',
      name: 'Enterprise',
      price: {
        monthly: 199,
        yearly: 1990, // 2 months free
        currency: 'USD'
      },
      limits: {
        monthlyRequests: -1, // Unlimited
        monthlyTokens: -1, // Unlimited
        costBudget: 150.00, // Much higher budget
        concurrentSessions: 10,
        contextCacheSize: 5000, // 5GB
        reasoningSessions: -1, // Unlimited
        agentWorkflows: -1 // Unlimited
      },
      features: {
        models: [
          'meta-llama/llama-3.3-70b-instruct',
          'qwen/qwen-3-coder-480b',
          'moonshot/kimi-k2',
          'deepseek/deepseek-r1',
          'anthropic/claude-3.5-sonnet',
          'anthropic/claude-3-opus',
          'openai/gpt-4',
          'google/gemini-pro'
        ],
        agents: [
          'code-analysis',
          'research',
          'code-generation',
          'decision-making',
          'repository-analysis',
          'multi-agent-coordinator'
        ],
        reasoning: true,
        contextCaching: true,
        costOptimization: true,
        prioritySupport: true,
        customIntegrations: true,
        teamCollaboration: true,
        analytics: true,
        apiAccess: true,
        whiteLabel: true,
        sla: '99.9% uptime'
      },
      restrictions: {
        modelAccess: 'full',
        responseTime: 'enterprise',
        support: 'dedicated'
      },
      metadata: {
        popular: false,
        targetMargin: 0.75, // 75% margin
        estimatedCost: 150.00,
        description: 'Unlimited AI power for teams with enterprise support',
        cta: 'Contact Sales'
      }
    });

    // Pro+ Tier - Higher usage tier
    this.registerTier({
      id: 'pro-plus',
      name: 'Pro+',
      price: {
        monthly: 49,
        yearly: 490,
        currency: 'USD'
      },
      limits: {
        monthlyRequests: 15000,
        monthlyTokens: 6000000, // 6M tokens
        costBudget: 35.00,
        concurrentSessions: 5,
        contextCacheSize: 1500, // 1.5GB
        reasoningSessions: 300,
        agentWorkflows: 150
      },
      features: {
        models: [
          'meta-llama/llama-3.3-70b-instruct',
          'qwen/qwen-3-coder-480b',
          'moonshot/kimi-k2',
          'deepseek/deepseek-r1',
          'anthropic/claude-3.5-sonnet',
          'anthropic/claude-3-opus'
        ],
        agents: [
          'code-analysis',
          'research',
          'code-generation',
          'decision-making',
          'repository-analysis'
        ],
        reasoning: true,
        contextCaching: true,
        costOptimization: true,
        prioritySupport: true,
        customIntegrations: true,
        teamCollaboration: true,
        analytics: true,
        apiAccess: true,
        whiteLabel: false,
        sla: '99.7% uptime'
      },
      restrictions: {
        modelAccess: 'standard',
        responseTime: 'priority',
        support: 'priority'
      },
      metadata: {
        popular: false,
        targetMargin: 0.71, // 71% margin
        estimatedCost: 35.00,
        description: 'Higher limits for power users and small teams',
        cta: 'Upgrade to Pro+'
      }
    });
  }

  private registerTier(tier: PricingTier): void {
    this.tiers.set(tier.id, tier);
  }

  /**
   * Get all pricing tiers
   */
  getTiers(): PricingTier[] {
    return Array.from(this.tiers.values());
  }

  /**
   * Get specific tier by ID
   */
  getTier(tierId: string): PricingTier | undefined {
    return this.tiers.get(tierId);
  }

  /**
   * Get user's current usage quota
   */
  getUserQuota(userId: string): UsageQuota | undefined {
    return this.userQuotas.get(userId);
  }

  /**
   * Initialize user quota for a tier
   */
  initializeUserQuota(userId: string, tierId: string): UsageQuota {
    const tier = this.tiers.get(tierId);
    if (!tier) {
      throw new Error(`Tier ${tierId} not found`);
    }

    const quota: UsageQuota = {
      userId,
      tierId,
      period: 'monthly',
      usage: {
        requests: 0,
        tokens: 0,
        cost: 0,
        cacheMisses: 0,
        reasoningSessions: 0,
        agentWorkflows: 0
      },
      limits: {
        requests: tier.limits.monthlyRequests,
        tokens: tier.limits.monthlyTokens,
        cost: tier.limits.costBudget,
        reasoningSessions: tier.limits.reasoningSessions,
        agentWorkflows: tier.limits.agentWorkflows
      },
      resetDate: this.getNextResetDate(),
      overageCharges: 0
    };

    this.userQuotas.set(userId, quota);
    return quota;
  }

  /**
   * Check if user can make a request
   */
  canMakeRequest(
    userId: string,
    estimatedCost: number,
    tokens: number
  ): {
    allowed: boolean;
    reason?: string;
    overage?: number;
  } {
    const quota = this.userQuotas.get(userId);
    if (!quota) {
      return { allowed: false, reason: 'No quota found' };
    }

    // Check requests limit
    if (quota.limits.requests > 0 && quota.usage.requests >= quota.limits.requests) {
      return { allowed: false, reason: 'Monthly request limit exceeded' };
    }

    // Check tokens limit
    if (quota.limits.tokens > 0 && quota.usage.tokens + tokens > quota.limits.tokens) {
      const overage = (quota.usage.tokens + tokens) - quota.limits.tokens;
      return { allowed: false, reason: 'Monthly token limit exceeded', overage };
    }

    // Check cost limit
    if (quota.limits.cost > 0 && quota.usage.cost + estimatedCost > quota.limits.cost) {
      const overage = (quota.usage.cost + estimatedCost) - quota.limits.cost;
      return { allowed: false, reason: 'Monthly cost limit exceeded', overage };
    }

    return { allowed: true };
  }

  /**
   * Record usage for a user
   */
  recordUsage(
    userId: string,
    usage: {
      requests?: number;
      tokens?: number;
      cost?: number;
      cached?: boolean;
      reasoningSession?: boolean;
      agentWorkflow?: boolean;
    }
  ): void {
    const quota = this.userQuotas.get(userId);
    if (!quota) return;

    if (usage.requests) quota.usage.requests += usage.requests;
    if (usage.tokens) quota.usage.tokens += usage.tokens;
    if (usage.cost) quota.usage.cost += usage.cost;
    if (usage.cached === false) quota.usage.cacheMisses += 1;
    if (usage.reasoningSession) quota.usage.reasoningSessions += 1;
    if (usage.agentWorkflow) quota.usage.agentWorkflows += 1;

    this.userQuotas.set(userId, quota);

    // Create billing event
    if (usage.cost && usage.cost > 0) {
      this.createBillingEvent({
        userId,
        type: 'usage',
        amount: usage.cost,
        description: `AI usage: ${usage.tokens || 0} tokens`,
        metadata: { usage }
      });
    }
  }

  /**
   * Get usage statistics for a user
   */
  getUsageStats(userId: string): {
    quota: UsageQuota | undefined;
    utilization: {
      requests: number;
      tokens: number;
      cost: number;
      reasoningSessions: number;
      agentWorkflows: number;
    };
    projectedCost: number;
    recommendedTier?: string;
  } {
    const quota = this.userQuotas.get(userId);
    
    if (!quota) {
      return {
        quota: undefined,
        utilization: { requests: 0, tokens: 0, cost: 0, reasoningSessions: 0, agentWorkflows: 0 },
        projectedCost: 0
      };
    }

    const utilization = {
      requests: quota.limits.requests > 0 ? quota.usage.requests / quota.limits.requests : 0,
      tokens: quota.limits.tokens > 0 ? quota.usage.tokens / quota.limits.tokens : 0,
      cost: quota.limits.cost > 0 ? quota.usage.cost / quota.limits.cost : 0,
      reasoningSessions: quota.limits.reasoningSessions > 0 ? 
        quota.usage.reasoningSessions / quota.limits.reasoningSessions : 0,
      agentWorkflows: quota.limits.agentWorkflows > 0 ? 
        quota.usage.agentWorkflows / quota.limits.agentWorkflows : 0
    };

    // Project monthly cost based on current usage
    const daysInMonth = 30;
    const daysSinceReset = Math.floor(
      (Date.now() - (quota.resetDate.getTime() - daysInMonth * 24 * 60 * 60 * 1000)) / 
      (24 * 60 * 60 * 1000)
    );
    const projectedCost = daysSinceReset > 0 ? 
      (quota.usage.cost / daysSinceReset) * daysInMonth : quota.usage.cost;

    // Recommend tier upgrade if consistently hitting limits
    let recommendedTier: string | undefined;
    if (utilization.requests > 0.8 || utilization.tokens > 0.8 || utilization.cost > 0.8) {
      const currentTier = this.tiers.get(quota.tierId);
      if (currentTier?.id === 'free') recommendedTier = 'pro';
      else if (currentTier?.id === 'pro') recommendedTier = 'pro-plus';
      else if (currentTier?.id === 'pro-plus') recommendedTier = 'enterprise';
    }

    return {
      quota,
      utilization,
      projectedCost,
      recommendedTier
    };
  }

  /**
   * Calculate overage charges
   */
  calculateOverage(userId: string): number {
    const quota = this.userQuotas.get(userId);
    if (!quota) return 0;

    let overageCharges = 0;

    // Overage pricing (pay-per-use beyond limits)
    const overagePricing = {
      requests: 0.001, // $0.001 per request
      tokens: 0.000002, // $0.000002 per token ($2 per 1M tokens)
      cost: 1.5 // 50% markup on actual cost
    };

    // Calculate request overage
    if (quota.limits.requests > 0 && quota.usage.requests > quota.limits.requests) {
      const overageRequests = quota.usage.requests - quota.limits.requests;
      overageCharges += overageRequests * overagePricing.requests;
    }

    // Calculate token overage
    if (quota.limits.tokens > 0 && quota.usage.tokens > quota.limits.tokens) {
      const overageTokens = quota.usage.tokens - quota.limits.tokens;
      overageCharges += overageTokens * overagePricing.tokens;
    }

    // Calculate cost overage
    if (quota.limits.cost > 0 && quota.usage.cost > quota.limits.cost) {
      const overageCost = quota.usage.cost - quota.limits.cost;
      overageCharges += overageCost * overagePricing.cost;
    }

    return overageCharges;
  }

  /**
   * Get tier recommendations based on usage patterns
   */
  getTierRecommendations(userId: string): Array<{
    tierId: string;
    tier: PricingTier;
    fit: number; // 0-1 score
    reason: string;
    savings?: number;
  }> {
    const stats = this.getUsageStats(userId);
    const recommendations: Array<{
      tierId: string;
      tier: PricingTier;
      fit: number;
      reason: string;
      savings?: number;
    }> = [];

    const tiers = this.getTiers();
    
    tiers.forEach(tier => {
      if (!stats.quota || tier.id === stats.quota.tierId) return;

      let fit = 0;
      let reason = '';
      let savings: number | undefined;

      // Calculate how well this tier fits the user's usage
      const requestsFit = tier.limits.monthlyRequests === -1 ? 1 : 
        Math.min(1, tier.limits.monthlyRequests / Math.max(stats.quota.usage.requests, 1));
      
      const tokensFit = tier.limits.monthlyTokens === -1 ? 1 :
        Math.min(1, tier.limits.monthlyTokens / Math.max(stats.quota.usage.tokens, 1));
      
      const costFit = tier.limits.costBudget === -1 ? 1 :
        Math.min(1, tier.limits.costBudget / Math.max(stats.quota.usage.cost, 0.01));

      fit = (requestsFit + tokensFit + costFit) / 3;

      // Determine reason and savings
      const currentTier = this.tiers.get(stats.quota.tierId);
      if (!currentTier) return;

      if (tier.price.monthly > currentTier.price.monthly) {
        if (fit > 0.8) {
          reason = 'Upgrade recommended for better limits and features';
          const overage = this.calculateOverage(userId);
          if (overage > 0) {
            savings = overage - (tier.price.monthly - currentTier.price.monthly);
          }
        } else {
          reason = 'Upgrade provides room for growth';
        }
      } else if (tier.price.monthly < currentTier.price.monthly) {
        if (stats.utilization.requests < 0.5 && stats.utilization.tokens < 0.5) {
          reason = 'Downgrade to save money on unused capacity';
          savings = currentTier.price.monthly - tier.price.monthly;
        } else {
          reason = 'Current usage may exceed this tier\'s limits';
          fit *= 0.5; // Penalize downgrades that don't fit
        }
      }

      if (fit > 0.2) { // Only recommend tiers with reasonable fit
        recommendations.push({
          tierId: tier.id,
          tier,
          fit,
          reason,
          savings
        });
      }
    });

    return recommendations.sort((a, b) => b.fit - a.fit);
  }

  /**
   * Create a billing event
   */
  private createBillingEvent(event: Omit<BillingEvent, 'id' | 'timestamp' | 'processed' | 'currency'>): void {
    const billingEvent: BillingEvent = {
      id: `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      currency: 'USD',
      timestamp: new Date(),
      processed: false,
      ...event
    };

    this.billingEvents.push(billingEvent);
  }

  /**
   * Get next quota reset date
   */
  private getNextResetDate(): Date {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
  }

  /**
   * Reset user quota (called monthly)
   */
  resetUserQuota(userId: string): void {
    const quota = this.userQuotas.get(userId);
    if (!quota) return;

    // Calculate and charge any overage
    const overage = this.calculateOverage(userId);
    if (overage > 0) {
      this.createBillingEvent({
        userId,
        type: 'overage',
        amount: overage,
        description: `Monthly overage charges`,
        metadata: { quota: { ...quota } }
      });
    }

    // Reset usage
    quota.usage = {
      requests: 0,
      tokens: 0,
      cost: 0,
      cacheMisses: 0,
      reasoningSessions: 0,
      agentWorkflows: 0
    };
    quota.resetDate = this.getNextResetDate();
    quota.overageCharges = 0;

    this.userQuotas.set(userId, quota);
  }

  /**
   * Get billing events for a user
   */
  getBillingEvents(userId: string, limit: number = 50): BillingEvent[] {
    return this.billingEvents
      .filter(event => event.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
}

export default PricingManager;