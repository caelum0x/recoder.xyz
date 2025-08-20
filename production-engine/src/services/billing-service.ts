/**
 * Commercial Billing Service for Production Engine
 * Handles usage tracking, pricing, subscription management, and monetization
 */

import { logger } from '../utils/logger';

export interface PricingTier {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  limits: {
    requestsPerMonth: number;
    tokensPerMonth: number;
    maxProjectsSize: number; // in MB
    concurrentRequests: number;
    premiumModels: boolean;
    prioritySupport: boolean;
    advancedSecurity: boolean;
    complianceFeatures: boolean;
    customIntegrations: boolean;
  };
  features: string[];
}

export interface UsageRecord {
  id: string;
  userId: string;
  organizationId?: string;
  timestamp: Date;
  requestType: 'code-generation' | 'validation' | 'analysis' | 'deployment';
  model: string;
  provider: string;
  projectType: string;
  tokensUsed: number;
  cost: number;
  latency: number;
  success: boolean;
  metadata: {
    projectSize: number;
    complexity: string;
    features: string[];
    outputFiles: number;
  };
}

export interface UserSubscription {
  userId: string;
  organizationId?: string;
  tierId: string;
  status: 'active' | 'trial' | 'suspended' | 'cancelled' | 'expired';
  startDate: Date;
  endDate: Date;
  trialEndsAt?: Date;
  usage: {
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    requestsUsed: number;
    tokensUsed: number;
    totalCost: number;
  };
  billing: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    nextBillingDate: Date;
    lastPaymentDate?: Date;
    paymentMethod: string;
  };
}

export interface BillingInvoice {
  id: string;
  userId: string;
  organizationId?: string;
  period: { start: Date; end: Date };
  subscription: {
    tierId: string;
    amount: number;
  };
  usage: {
    overageRequests: number;
    overageTokens: number;
    overageAmount: number;
  };
  totalAmount: number;
  status: 'pending' | 'paid' | 'overdue' | 'failed';
  dueDate: Date;
  paidAt?: Date;
}

export interface EnterpriseQuote {
  id: string;
  organizationId: string;
  requirements: {
    estimatedRequestsPerMonth: number;
    estimatedTokensPerMonth: number;
    teamSize: number;
    deploymentType: 'cloud' | 'on-premise' | 'hybrid';
    complianceNeeds: string[];
    integrationRequirements: string[];
    supportLevel: 'standard' | 'priority' | 'dedicated';
  };
  pricing: {
    basePrice: number;
    volumeDiscount: number;
    customFeatures: number;
    support: number;
    totalMonthly: number;
    totalYearly: number;
  };
  status: 'draft' | 'sent' | 'negotiating' | 'accepted' | 'expired';
  validUntil: Date;
}

export class BillingService {
  private usageRecords: Map<string, UsageRecord[]> = new Map();
  private subscriptions: Map<string, UserSubscription> = new Map();
  private invoices: Map<string, BillingInvoice[]> = new Map();
  private enterpriseQuotes: Map<string, EnterpriseQuote> = new Map();

  // Pricing tiers configuration
  private readonly PRICING_TIERS: PricingTier[] = [
    {
      id: 'free',
      name: 'Free',
      description: 'Perfect for learning and small personal projects',
      monthlyPrice: 0,
      yearlyPrice: 0,
      limits: {
        requestsPerMonth: 100,
        tokensPerMonth: 50000,
        maxProjectsSize: 10, // 10MB
        concurrentRequests: 1,
        premiumModels: false,
        prioritySupport: false,
        advancedSecurity: false,
        complianceFeatures: false,
        customIntegrations: false
      },
      features: [
        'Basic code generation',
        'Standard models only',
        'Community support',
        '10MB project limit',
        'Public GitHub repos only'
      ]
    },
    {
      id: 'pro',
      name: 'Professional',
      description: 'For professional developers and small teams',
      monthlyPrice: 29,
      yearlyPrice: 290, // 2 months free
      limits: {
        requestsPerMonth: 2000,
        tokensPerMonth: 1000000,
        maxProjectsSize: 100, // 100MB
        concurrentRequests: 5,
        premiumModels: true,
        prioritySupport: false,
        advancedSecurity: true,
        complianceFeatures: false,
        customIntegrations: false
      },
      features: [
        'All premium AI models',
        'Advanced code analysis',
        'Security scanning',
        'Private repositories',
        'Priority model access',
        'Extended context windows',
        'Email support'
      ]
    },
    {
      id: 'business',
      name: 'Business',
      description: 'For growing teams and businesses',
      monthlyPrice: 99,
      yearlyPrice: 990, // 2 months free
      limits: {
        requestsPerMonth: 10000,
        tokensPerMonth: 5000000,
        maxProjectsSize: 500, // 500MB
        concurrentRequests: 20,
        premiumModels: true,
        prioritySupport: true,
        advancedSecurity: true,
        complianceFeatures: true,
        customIntegrations: true
      },
      features: [
        'Everything in Professional',
        'SOC 2 compliance features',
        'Team collaboration',
        'Advanced analytics',
        'Custom integrations',
        'Priority support',
        'Dedicated account manager',
        'Usage analytics dashboard'
      ]
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'For large organizations with custom needs',
      monthlyPrice: 499,
      yearlyPrice: 4990, // 2 months free
      limits: {
        requestsPerMonth: 100000,
        tokensPerMonth: 50000000,
        maxProjectsSize: 10000, // 10GB
        concurrentRequests: 100,
        premiumModels: true,
        prioritySupport: true,
        advancedSecurity: true,
        complianceFeatures: true,
        customIntegrations: true
      },
      features: [
        'Everything in Business',
        'Unlimited projects',
        'On-premise deployment',
        'Custom AI model fine-tuning',
        'Advanced compliance reporting',
        'Dedicated infrastructure',
        '24/7 phone support',
        'Custom contract terms',
        'Volume discounts available'
      ]
    }
  ];

  constructor() {
    this.initializeBillingSystem();
  }

  private initializeBillingSystem(): void {
    logger.info('💰 Initializing commercial billing system...');
    
    // Load existing data (in production, this would be from database)
    this.loadBillingData();
    
    // Setup billing cycle processing
    this.setupBillingCycles();
    
    logger.info('✅ Commercial billing system initialized');
  }

  private loadBillingData(): void {
    // In production, load from database
    // For now, initialize empty collections
    logger.info('📊 Loading billing data...');
  }

  private setupBillingCycles(): void {
    // Setup automated billing cycle processing
    setInterval(() => {
      this.processBillingCycles();
    }, 24 * 60 * 60 * 1000); // Daily check
  }

  /**
   * Get available pricing tiers
   */
  getPricingTiers(): PricingTier[] {
    return this.PRICING_TIERS;
  }

  /**
   * Get pricing tier by ID
   */
  getPricingTier(tierId: string): PricingTier | null {
    return this.PRICING_TIERS.find(tier => tier.id === tierId) || null;
  }

  /**
   * Track usage for billing
   */
  async trackUsage(record: Omit<UsageRecord, 'id' | 'timestamp'>): Promise<void> {
    const usageRecord: UsageRecord = {
      id: this.generateId(),
      timestamp: new Date(),
      ...record
    };

    // Store usage record
    if (!this.usageRecords.has(record.userId)) {
      this.usageRecords.set(record.userId, []);
    }
    this.usageRecords.get(record.userId)!.push(usageRecord);

    // Update subscription usage
    await this.updateSubscriptionUsage(record.userId, usageRecord);

    logger.debug(`📊 Usage tracked for user ${record.userId}: ${record.tokensUsed} tokens`);
  }

  /**
   * Check if user can make a request based on their limits
   */
  async checkUsageLimit(
    userId: string, 
    requestType: string, 
    estimatedTokens: number
  ): Promise<{
    allowed: boolean;
    reason?: string;
    subscription: UserSubscription | null;
    usage: {
      requestsUsed: number;
      tokensUsed: number;
      requestsRemaining: number;
      tokensRemaining: number;
    };
  }> {
    const subscription = this.subscriptions.get(userId);
    
    if (!subscription) {
      return {
        allowed: false,
        reason: 'No active subscription found',
        subscription: null,
        usage: {
          requestsUsed: 0,
          tokensUsed: 0,
          requestsRemaining: 0,
          tokensRemaining: 0
        }
      };
    }

    const tier = this.getPricingTier(subscription.tierId);
    if (!tier) {
      return {
        allowed: false,
        reason: 'Invalid subscription tier',
        subscription,
        usage: {
          requestsUsed: 0,
          tokensUsed: 0,
          requestsRemaining: 0,
          tokensRemaining: 0
        }
      };
    }

    const usage = subscription.usage;
    const requestsRemaining = Math.max(0, tier.limits.requestsPerMonth - usage.requestsUsed);
    const tokensRemaining = Math.max(0, tier.limits.tokensPerMonth - usage.tokensUsed);

    // Check if within limits
    if (usage.requestsUsed >= tier.limits.requestsPerMonth) {
      return {
        allowed: false,
        reason: `Monthly request limit of ${tier.limits.requestsPerMonth} exceeded`,
        subscription,
        usage: {
          requestsUsed: usage.requestsUsed,
          tokensUsed: usage.tokensUsed,
          requestsRemaining,
          tokensRemaining
        }
      };
    }

    if (usage.tokensUsed + estimatedTokens > tier.limits.tokensPerMonth) {
      return {
        allowed: false,
        reason: `Monthly token limit of ${tier.limits.tokensPerMonth} would be exceeded`,
        subscription,
        usage: {
          requestsUsed: usage.requestsUsed,
          tokensUsed: usage.tokensUsed,
          requestsRemaining,
          tokensRemaining
        }
      };
    }

    return {
      allowed: true,
      subscription,
      usage: {
        requestsUsed: usage.requestsUsed,
        tokensUsed: usage.tokensUsed,
        requestsRemaining,
        tokensRemaining
      }
    };
  }

  /**
   * Create or update user subscription
   */
  async createSubscription(
    userId: string,
    tierId: string,
    organizationId?: string,
    billingInfo?: any
  ): Promise<UserSubscription> {
    const tier = this.getPricingTier(tierId);
    if (!tier) {
      throw new Error(`Invalid pricing tier: ${tierId}`);
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

    const subscription: UserSubscription = {
      userId,
      organizationId,
      tierId,
      status: tierId === 'free' ? 'active' : 'trial',
      startDate: now,
      endDate,
      trialEndsAt: tierId !== 'free' ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) : undefined,
      usage: {
        currentPeriodStart: now,
        currentPeriodEnd: endDate,
        requestsUsed: 0,
        tokensUsed: 0,
        totalCost: 0
      },
      billing: {
        stripeCustomerId: billingInfo?.stripeCustomerId,
        stripeSubscriptionId: billingInfo?.stripeSubscriptionId,
        nextBillingDate: endDate,
        paymentMethod: billingInfo?.paymentMethod || 'none'
      }
    };

    this.subscriptions.set(userId, subscription);
    
    logger.info(`💳 Created ${tierId} subscription for user ${userId}`);
    
    return subscription;
  }

  /**
   * Update subscription usage
   */
  private async updateSubscriptionUsage(userId: string, record: UsageRecord): Promise<void> {
    const subscription = this.subscriptions.get(userId);
    if (!subscription) return;

    subscription.usage.requestsUsed += 1;
    subscription.usage.tokensUsed += record.tokensUsed;
    subscription.usage.totalCost += record.cost;
  }

  /**
   * Generate usage analytics
   */
  getUsageAnalytics(userId: string, days: number = 30): {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    averageLatency: number;
    successRate: number;
    topProjectTypes: Array<{ type: string; count: number }>;
    dailyUsage: Array<{ date: string; requests: number; tokens: number; cost: number }>;
    modelUsage: Array<{ model: string; usage: number; cost: number }>;
  } {
    const records = this.usageRecords.get(userId) || [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const recentRecords = records.filter(r => r.timestamp >= cutoffDate);
    
    if (recentRecords.length === 0) {
      return {
        totalRequests: 0,
        totalTokens: 0,
        totalCost: 0,
        averageLatency: 0,
        successRate: 0,
        topProjectTypes: [],
        dailyUsage: [],
        modelUsage: []
      };
    }

    const totalRequests = recentRecords.length;
    const totalTokens = recentRecords.reduce((sum, r) => sum + r.tokensUsed, 0);
    const totalCost = recentRecords.reduce((sum, r) => sum + r.cost, 0);
    const averageLatency = recentRecords.reduce((sum, r) => sum + r.latency, 0) / totalRequests;
    const successfulRequests = recentRecords.filter(r => r.success).length;
    const successRate = (successfulRequests / totalRequests) * 100;

    // Project types analysis
    const projectTypes = new Map<string, number>();
    recentRecords.forEach(r => {
      projectTypes.set(r.projectType, (projectTypes.get(r.projectType) || 0) + 1);
    });
    const topProjectTypes = Array.from(projectTypes.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Daily usage breakdown
    const dailyUsage = new Map<string, { requests: number; tokens: number; cost: number }>();
    recentRecords.forEach(r => {
      const date = r.timestamp.toISOString().split('T')[0];
      if (!dailyUsage.has(date)) {
        dailyUsage.set(date, { requests: 0, tokens: 0, cost: 0 });
      }
      const day = dailyUsage.get(date)!;
      day.requests += 1;
      day.tokens += r.tokensUsed;
      day.cost += r.cost;
    });

    // Model usage analysis
    const modelUsage = new Map<string, { usage: number; cost: number }>();
    recentRecords.forEach(r => {
      const key = `${r.provider}/${r.model}`;
      if (!modelUsage.has(key)) {
        modelUsage.set(key, { usage: 0, cost: 0 });
      }
      const model = modelUsage.get(key)!;
      model.usage += r.tokensUsed;
      model.cost += r.cost;
    });

    return {
      totalRequests,
      totalTokens,
      totalCost,
      averageLatency,
      successRate,
      topProjectTypes,
      dailyUsage: Array.from(dailyUsage.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      modelUsage: Array.from(modelUsage.entries())
        .map(([model, data]) => ({ model, ...data }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 10)
    };
  }

  /**
   * Generate enterprise quote
   */
  async generateEnterpriseQuote(
    organizationId: string,
    requirements: EnterpriseQuote['requirements']
  ): Promise<EnterpriseQuote> {
    // Calculate custom pricing based on requirements
    let basePrice = 499; // Start with Enterprise tier base
    let volumeDiscount = 0;
    let customFeatures = 0;
    let support = 0;

    // Volume discounts
    if (requirements.estimatedRequestsPerMonth > 500000) {
      volumeDiscount = basePrice * 0.2; // 20% discount for high volume
    } else if (requirements.estimatedRequestsPerMonth > 200000) {
      volumeDiscount = basePrice * 0.1; // 10% discount
    }

    // Custom features pricing
    if (requirements.deploymentType === 'on-premise') {
      customFeatures += 1000; // On-premise deployment cost
    }
    if (requirements.complianceNeeds.length > 3) {
      customFeatures += 500; // Advanced compliance
    }
    if (requirements.integrationRequirements.length > 5) {
      customFeatures += 300; // Custom integrations
    }

    // Support pricing
    switch (requirements.supportLevel) {
      case 'dedicated':
        support = 2000;
        break;
      case 'priority':
        support = 500;
        break;
      default:
        support = 0;
    }

    const totalMonthly = basePrice - volumeDiscount + customFeatures + support;
    const totalYearly = totalMonthly * 10; // 2 months free for yearly

    const quote: EnterpriseQuote = {
      id: this.generateId(),
      organizationId,
      requirements,
      pricing: {
        basePrice,
        volumeDiscount,
        customFeatures,
        support,
        totalMonthly,
        totalYearly
      },
      status: 'draft',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    };

    this.enterpriseQuotes.set(organizationId, quote);
    
    logger.info(`💼 Generated enterprise quote for ${organizationId}: $${totalMonthly}/month`);
    
    return quote;
  }

  /**
   * Process billing cycles
   */
  private async processBillingCycles(): Promise<void> {
    const now = new Date();
    
    for (const [userId, subscription] of this.subscriptions) {
      if (subscription.status === 'active' && subscription.billing.nextBillingDate <= now) {
        await this.processSubscriptionBilling(userId, subscription);
      }
      
      // Check for trial expiration
      if (subscription.status === 'trial' && subscription.trialEndsAt && subscription.trialEndsAt <= now) {
        await this.handleTrialExpiration(userId, subscription);
      }
    }
  }

  private async processSubscriptionBilling(userId: string, subscription: UserSubscription): Promise<void> {
    const tier = this.getPricingTier(subscription.tierId);
    if (!tier) return;

    // Generate invoice
    const invoice: BillingInvoice = {
      id: this.generateId(),
      userId,
      organizationId: subscription.organizationId,
      period: {
        start: subscription.usage.currentPeriodStart,
        end: subscription.usage.currentPeriodEnd
      },
      subscription: {
        tierId: subscription.tierId,
        amount: tier.monthlyPrice
      },
      usage: {
        overageRequests: Math.max(0, subscription.usage.requestsUsed - tier.limits.requestsPerMonth),
        overageTokens: Math.max(0, subscription.usage.tokensUsed - tier.limits.tokensPerMonth),
        overageAmount: 0 // Calculate overage costs
      },
      totalAmount: tier.monthlyPrice,
      status: 'pending',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    };

    // Store invoice
    if (!this.invoices.has(userId)) {
      this.invoices.set(userId, []);
    }
    this.invoices.get(userId)!.push(invoice);

    // Reset usage for new period
    const nextPeriodStart = new Date();
    const nextPeriodEnd = new Date(nextPeriodStart);
    nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

    subscription.usage.currentPeriodStart = nextPeriodStart;
    subscription.usage.currentPeriodEnd = nextPeriodEnd;
    subscription.usage.requestsUsed = 0;
    subscription.usage.tokensUsed = 0;
    subscription.usage.totalCost = 0;
    subscription.billing.nextBillingDate = nextPeriodEnd;

    logger.info(`💳 Generated invoice ${invoice.id} for user ${userId}: $${invoice.totalAmount}`);
  }

  private async handleTrialExpiration(userId: string, subscription: UserSubscription): Promise<void> {
    // Convert trial to paid or suspend account
    if (subscription.billing.stripeSubscriptionId) {
      subscription.status = 'active';
      logger.info(`✅ Trial converted to paid subscription for user ${userId}`);
    } else {
      subscription.status = 'suspended';
      logger.warn(`⚠️ Trial expired for user ${userId}, account suspended`);
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  /**
   * Get user subscription
   */
  getUserSubscription(userId: string): UserSubscription | null {
    return this.subscriptions.get(userId) || null;
  }

  /**
   * Get user invoices
   */
  getUserInvoices(userId: string): BillingInvoice[] {
    return this.invoices.get(userId) || [];
  }

  /**
   * Generate cost optimization recommendations
   */
  getCostOptimizationRecommendations(userId: string): {
    currentTier: string;
    recommendedTier: string;
    potentialSavings: number;
    recommendations: string[];
  } {
    const subscription = this.getUserSubscription(userId);
    const analytics = this.getUsageAnalytics(userId);
    
    if (!subscription) {
      return {
        currentTier: 'none',
        recommendedTier: 'free',
        potentialSavings: 0,
        recommendations: ['Sign up for a free account to get started']
      };
    }

    const currentTier = this.getPricingTier(subscription.tierId)!;
    const recommendations: string[] = [];
    
    // Analyze usage patterns and recommend optimizations
    if (analytics.totalRequests < currentTier.limits.requestsPerMonth * 0.5) {
      recommendations.push('Consider downgrading to save costs - you\'re using less than 50% of your plan');
    }
    
    if (analytics.successRate < 90) {
      recommendations.push('Improve request success rate by refining your prompts and handling errors better');
    }
    
    const expensiveModels = analytics.modelUsage.filter(m => m.model.includes('claude-sonnet-4'));
    if (expensiveModels.length > 0) {
      recommendations.push('Consider using more cost-effective models for simple tasks to reduce expenses');
    }

    // Determine recommended tier based on usage
    let recommendedTier = subscription.tierId;
    const avgMonthlyRequests = analytics.totalRequests;
    
    for (const tier of this.PRICING_TIERS) {
      if (avgMonthlyRequests <= tier.limits.requestsPerMonth * 0.8) {
        recommendedTier = tier.id;
        break;
      }
    }

    const recommendedTierInfo = this.getPricingTier(recommendedTier)!;
    const potentialSavings = Math.max(0, currentTier.monthlyPrice - recommendedTierInfo.monthlyPrice);

    return {
      currentTier: subscription.tierId,
      recommendedTier,
      potentialSavings,
      recommendations
    };
  }
}

// Export singleton instance
export const billingService = new BillingService();