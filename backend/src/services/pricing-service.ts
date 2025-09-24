/**
 * Pricing Service - Real Payment Processing with Transaction Costs
 * 
 * Features:
 * - Multiple subscription tiers with usage limits
 * - 5% + $0.50 processing fee on all transactions
 * - Real-time cost calculation
 * - Overage billing system
 * - Tax calculation by region
 * - Multi-currency support
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export interface PricingTier {
  id: string;
  name: string;
  description: string;
  basePrice: number; // USD per billing period
  billingPeriod: 'week' | 'month' | 'year';
  currency: 'USD';
  limits: {
    requestsPerHour: number;
    tokensPerMonth: number;
    projects: number;
    teamMembers: number;
    apiCalls: number;
  };
  features: string[];
  modelAccess: 'free' | 'premium' | 'enterprise';
  priority: 'low' | 'normal' | 'high' | 'enterprise';
}

export interface TransactionFee {
  percentage: number; // 5%
  fixedFee: number; // $0.50
  currency: 'USD';
}

export interface PricingCalculation {
  subtotal: number;
  processingFeePercentage: number;
  processingFeeFixed: number;
  totalProcessingFee: number;
  taxes: number;
  total: number;
  currency: string;
  breakdown: {
    baseAmount: number;
    processingFees: number;
    taxAmount: number;
    finalTotal: number;
  };
}

export interface OverageCalculation {
  requestOverage: number;
  tokenOverage: number;
  overageCost: number;
  totalWithOverage: number;
}

export class PricingService {
  private prisma: PrismaClient;
  private transactionFee: TransactionFee = {
    percentage: 5.0, // 5%
    fixedFee: 0.50,  // $0.50
    currency: 'USD'
  };

  // Tax rates by region (simplified - in production use tax service)
  private taxRates = {
    'US-CA': 0.0725, // California
    'US-NY': 0.08,   // New York
    'US-DEFAULT': 0.065, // Average US tax
    'EU': 0.20,      // EU VAT
    'UK': 0.20,      // UK VAT
    'DEFAULT': 0.00  // No tax for other regions
  };

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  /**
   * Get all available pricing tiers
   */
  getPricingTiers(): PricingTier[] {
    return [
      {
        id: 'free',
        name: 'FREE',
        description: 'Perfect for trying out Recoder',
        basePrice: 0,
        billingPeriod: 'month',
        currency: 'USD',
        limits: {
          requestsPerHour: 10,
          tokensPerMonth: 10000,
          projects: 3,
          teamMembers: 1,
          apiCalls: 100
        },
        features: [
          'DeepSeek free models only',
          'Basic code generation',
          'Community support',
          '3 projects max'
        ],
        modelAccess: 'free',
        priority: 'low'
      },
      {
        id: 'weekly-10',
        name: '$10/Week',
        description: 'Great for weekly sprints and rapid development',
        basePrice: 10,
        billingPeriod: 'week',
        currency: 'USD',
        limits: {
          requestsPerHour: 50,
          tokensPerMonth: 50000,
          projects: 10,
          teamMembers: 2,
          apiCalls: 500
        },
        features: [
          'All premium models (Claude, Gemini, etc.)',
          'Priority support',
          'Advanced code generation',
          '10 projects',
          'Team collaboration'
        ],
        modelAccess: 'premium',
        priority: 'normal'
      },
      {
        id: 'monthly-20',
        name: '$20/Month',
        description: 'Perfect for individual developers',
        basePrice: 20,
        billingPeriod: 'month',
        currency: 'USD',
        limits: {
          requestsPerHour: 100,
          tokensPerMonth: 100000,
          projects: 25,
          teamMembers: 5,
          apiCalls: 2000
        },
        features: [
          'All premium models',
          'Priority support',
          'Advanced features',
          '25 projects',
          'Team dashboard',
          'Analytics & insights'
        ],
        modelAccess: 'premium',
        priority: 'normal'
      },
      {
        id: 'monthly-100',
        name: '$100/Month',
        description: 'Ideal for growing teams',
        basePrice: 100,
        billingPeriod: 'month',
        currency: 'USD',
        limits: {
          requestsPerHour: 500,
          tokensPerMonth: 500000,
          projects: 100,
          teamMembers: 15,
          apiCalls: 10000
        },
        features: [
          'All premium models',
          'Priority support',
          'Advanced team features',
          '100 projects',
          'Advanced analytics',
          'Custom integrations',
          'Dedicated account manager'
        ],
        modelAccess: 'premium',
        priority: 'high'
      },
      {
        id: 'monthly-200',
        name: '$200/Month',
        description: 'For large teams and organizations',
        basePrice: 200,
        billingPeriod: 'month',
        currency: 'USD',
        limits: {
          requestsPerHour: 1000,
          tokensPerMonth: 1000000,
          projects: 500,
          teamMembers: 50,
          apiCalls: 25000
        },
        features: [
          'All premium models',
          'Enterprise support',
          'Unlimited team features',
          '500 projects',
          'Real-time analytics',
          'Custom integrations',
          'Priority processing',
          'SLA guarantees'
        ],
        modelAccess: 'enterprise',
        priority: 'high'
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        description: 'Custom solutions for enterprise needs',
        basePrice: 0, // Custom pricing
        billingPeriod: 'month',
        currency: 'USD',
        limits: {
          requestsPerHour: -1, // Unlimited
          tokensPerMonth: -1,  // Unlimited
          projects: -1,        // Unlimited
          teamMembers: -1,     // Unlimited
          apiCalls: -1         // Unlimited
        },
        features: [
          'All models including enterprise-only',
          '24/7 dedicated support',
          'Custom model training',
          'On-premise deployment options',
          'Advanced security features',
          'Custom SLA',
          'Dedicated infrastructure'
        ],
        modelAccess: 'enterprise',
        priority: 'enterprise'
      }
    ];
  }

  /**
   * Calculate total price including processing fees and taxes
   */
  calculatePricing(
    baseAmount: number, 
    region: string = 'DEFAULT',
    currency: string = 'USD'
  ): PricingCalculation {
    // Calculate processing fees (5% + $0.50)
    const processingFeePercentage = (baseAmount * this.transactionFee.percentage) / 100;
    const processingFeeFixed = this.transactionFee.fixedFee;
    const totalProcessingFee = processingFeePercentage + processingFeeFixed;

    // Calculate subtotal (base + processing fees)
    const subtotal = baseAmount + totalProcessingFee;

    // Calculate taxes
    const taxRate = this.taxRates[region] || this.taxRates.DEFAULT;
    const taxes = subtotal * taxRate;

    // Calculate final total
    const total = subtotal + taxes;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      processingFeePercentage: parseFloat(processingFeePercentage.toFixed(2)),
      processingFeeFixed: processingFeeFixed,
      totalProcessingFee: parseFloat(totalProcessingFee.toFixed(2)),
      taxes: parseFloat(taxes.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      currency,
      breakdown: {
        baseAmount: parseFloat(baseAmount.toFixed(2)),
        processingFees: parseFloat(totalProcessingFee.toFixed(2)),
        taxAmount: parseFloat(taxes.toFixed(2)),
        finalTotal: parseFloat(total.toFixed(2))
      }
    };
  }

  /**
   * Calculate overage costs when users exceed their plan limits
   */
  calculateOverage(
    currentUsage: {
      requests: number;
      tokens: number;
    },
    planLimits: {
      requestsPerHour: number;
      tokensPerMonth: number;
    },
    overageRates: {
      requestOverageRate: number;  // Cost per extra request
      tokenOverageRate: number;    // Cost per extra 1000 tokens
    } = {
      requestOverageRate: 0.01,    // $0.01 per extra request
      tokenOverageRate: 0.002      // $0.002 per extra 1000 tokens
    }
  ): OverageCalculation {
    // Calculate request overage
    const requestOverage = Math.max(0, currentUsage.requests - planLimits.requestsPerHour);
    const requestOverageCost = requestOverage * overageRates.requestOverageRate;

    // Calculate token overage
    const tokenOverage = Math.max(0, currentUsage.tokens - planLimits.tokensPerMonth);
    const tokenOverageCost = (tokenOverage / 1000) * overageRates.tokenOverageRate;

    // Total overage cost
    const overageCost = requestOverageCost + tokenOverageCost;

    return {
      requestOverage,
      tokenOverage,
      overageCost: parseFloat(overageCost.toFixed(4)),
      totalWithOverage: parseFloat(overageCost.toFixed(4))
    };
  }

  /**
   * Get pricing for a specific tier
   */
  getTierPricing(tierId: string, region: string = 'DEFAULT'): {
    tier: PricingTier;
    pricing: PricingCalculation;
  } | null {
    const tier = this.getPricingTiers().find(t => t.id === tierId);
    if (!tier) return null;

    const pricing = this.calculatePricing(tier.basePrice, region, tier.currency);

    return { tier, pricing };
  }

  /**
   * Compare all pricing tiers with calculated costs
   */
  getAllTierPricing(region: string = 'DEFAULT') {
    const tiers = this.getPricingTiers();
    
    return tiers.map(tier => ({
      tier,
      pricing: this.calculatePricing(tier.basePrice, region, tier.currency)
    }));
  }

  /**
   * Calculate cost for a specific usage pattern
   */
  calculateUsageCost(
    usage: {
      requests: number;
      tokens: number;
      projectCount: number;
      teamMembers: number;
    },
    tierId: string,
    region: string = 'DEFAULT'
  ) {
    const tierInfo = this.getTierPricing(tierId, region);
    if (!tierInfo) {
      throw new Error(`Invalid tier ID: ${tierId}`);
    }

    const { tier, pricing } = tierInfo;

    // Calculate overage if usage exceeds limits
    const overage = this.calculateOverage(
      { requests: usage.requests, tokens: usage.tokens },
      { 
        requestsPerHour: tier.limits.requestsPerHour,
        tokensPerMonth: tier.limits.tokensPerMonth
      }
    );

    // If there's overage, recalculate total pricing
    if (overage.overageCost > 0) {
      const totalBaseAmount = tier.basePrice + overage.overageCost;
      const finalPricing = this.calculatePricing(totalBaseAmount, region, tier.currency);
      
      return {
        tier,
        basePricing: pricing,
        overage,
        finalPricing,
        totalCost: finalPricing.total
      };
    }

    return {
      tier,
      basePricing: pricing,
      overage,
      finalPricing: pricing,
      totalCost: pricing.total
    };
  }

  /**
   * Get recommended tier based on usage patterns
   */
  getRecommendedTier(
    usage: {
      averageRequestsPerHour: number;
      averageTokensPerMonth: number;
      projectCount: number;
      teamSize: number;
    }
  ): {
    recommended: PricingTier;
    alternatives: PricingTier[];
    reason: string;
  } {
    const tiers = this.getPricingTiers();
    
    // Find the most cost-effective tier that meets the requirements
    const suitableTiers = tiers.filter(tier => {
      if (tier.id === 'enterprise') return false; // Handle enterprise separately
      
      return (
        (tier.limits.requestsPerHour === -1 || usage.averageRequestsPerHour <= tier.limits.requestsPerHour) &&
        (tier.limits.tokensPerMonth === -1 || usage.averageTokensPerMonth <= tier.limits.tokensPerMonth) &&
        (tier.limits.projects === -1 || usage.projectCount <= tier.limits.projects) &&
        (tier.limits.teamMembers === -1 || usage.teamSize <= tier.limits.teamMembers)
      );
    });

    if (suitableTiers.length === 0) {
      // Recommend enterprise for high usage
      const enterprise = tiers.find(t => t.id === 'enterprise')!;
      return {
        recommended: enterprise,
        alternatives: [],
        reason: 'Your usage exceeds our standard plans. Enterprise plan offers unlimited usage with custom pricing.'
      };
    }

    // Sort by price and recommend the cheapest suitable option
    suitableTiers.sort((a, b) => a.basePrice - b.basePrice);
    const recommended = suitableTiers[0];
    const alternatives = suitableTiers.slice(1, 4); // Show up to 3 alternatives

    let reason = `Best value for your usage pattern of ${usage.averageRequestsPerHour} requests/hour and ${usage.averageTokensPerMonth.toLocaleString()} tokens/month.`;
    
    if (recommended.id === 'free') {
      reason = 'Free tier is perfect for your current usage level.';
    }

    return {
      recommended,
      alternatives,
      reason
    };
  }

  /**
   * Save user's pricing preferences and calculations
   */
  async saveUserPricingData(
    userId: string,
    tierId: string,
    calculation: PricingCalculation,
    usage?: any
  ) {
    try {
      await this.prisma.userPricingHistory.create({
        data: {
          userId,
          tierId,
          baseAmount: calculation.breakdown.baseAmount,
          processingFees: calculation.breakdown.processingFees,
          taxAmount: calculation.breakdown.taxAmount,
          totalAmount: calculation.breakdown.finalTotal,
          currency: calculation.currency,
          usageData: usage ? JSON.stringify(usage) : null,
          calculatedAt: new Date()
        }
      });

      logger.info(`Saved pricing calculation for user ${userId}, tier ${tierId}, total: $${calculation.total}`);
    } catch (error) {
      logger.error('Failed to save user pricing data:', error);
      throw error;
    }
  }

  /**
   * Get user's pricing history
   */
  async getUserPricingHistory(userId: string, limit: number = 10) {
    try {
      return await this.prisma.userPricingHistory.findMany({
        where: { userId },
        orderBy: { calculatedAt: 'desc' },
        take: limit
      });
    } catch (error) {
      logger.error('Failed to get user pricing history:', error);
      throw error;
    }
  }

  /**
   * Calculate annual savings for yearly plans
   */
  calculateAnnualSavings(monthlyPrice: number): {
    monthlyTotal: number;
    yearlyPrice: number;
    yearlyTotal: number;
    savings: number;
    savingsPercentage: number;
  } {
    const monthlyTotal = monthlyPrice * 12;
    const yearlyDiscount = 0.15; // 15% discount for annual plans
    const yearlyPrice = monthlyPrice * 12 * (1 - yearlyDiscount);
    const yearlyPricing = this.calculatePricing(yearlyPrice);
    
    const savings = monthlyTotal - yearlyPricing.total;
    const savingsPercentage = (savings / monthlyTotal) * 100;

    return {
      monthlyTotal,
      yearlyPrice,
      yearlyTotal: yearlyPricing.total,
      savings: parseFloat(savings.toFixed(2)),
      savingsPercentage: parseFloat(savingsPercentage.toFixed(1))
    };
  }

  /**
   * Generate pricing quote for enterprise customers
   */
  generateEnterpriseQuote(requirements: {
    teamSize: number;
    expectedUsage: {
      requestsPerMonth: number;
      tokensPerMonth: number;
      projectCount: number;
    };
    features: string[];
    supportLevel: 'standard' | 'premium' | 'white-glove';
    deploymentType: 'cloud' | 'hybrid' | 'on-premise';
  }): {
    estimatedPrice: number;
    breakdown: any;
    features: string[];
    nextSteps: string[];
  } {
    // Base enterprise pricing calculation
    let basePrice = 500; // Starting at $500/month for enterprise
    
    // Scale by team size
    if (requirements.teamSize > 50) {
      basePrice += (requirements.teamSize - 50) * 10; // $10 per user over 50
    }

    // Scale by usage
    const baseTokens = 1000000; // 1M tokens included
    if (requirements.expectedUsage.tokensPerMonth > baseTokens) {
      const extraTokens = requirements.expectedUsage.tokensPerMonth - baseTokens;
      basePrice += (extraTokens / 1000000) * 100; // $100 per extra 1M tokens
    }

    // Support level pricing
    const supportMultiplier = {
      'standard': 1.0,
      'premium': 1.3,
      'white-glove': 1.6
    };
    basePrice *= supportMultiplier[requirements.supportLevel];

    // Deployment type pricing
    const deploymentMultiplier = {
      'cloud': 1.0,
      'hybrid': 1.4,
      'on-premise': 1.8
    };
    basePrice *= deploymentMultiplier[requirements.deploymentType];

    const finalPricing = this.calculatePricing(basePrice);

    return {
      estimatedPrice: finalPricing.total,
      breakdown: {
        basePrice,
        teamScaling: requirements.teamSize > 50 ? (requirements.teamSize - 50) * 10 : 0,
        usageScaling: requirements.expectedUsage.tokensPerMonth > 1000000 ? 
          ((requirements.expectedUsage.tokensPerMonth - 1000000) / 1000000) * 100 : 0,
        supportLevel: requirements.supportLevel,
        deploymentType: requirements.deploymentType,
        processingFees: finalPricing.totalProcessingFee,
        taxes: finalPricing.taxes,
        total: finalPricing.total
      },
      features: [
        'Unlimited usage',
        'All premium models',
        'Custom model training',
        'Dedicated support team',
        'SLA guarantees',
        'Advanced security',
        'Custom integrations',
        ...requirements.features
      ],
      nextSteps: [
        'Schedule consultation call',
        'Technical requirements assessment',
        'Custom proposal generation',
        'Pilot program setup',
        'Contract negotiation'
      ]
    };
  }
}

export default PricingService;