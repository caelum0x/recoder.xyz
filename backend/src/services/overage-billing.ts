/**
 * Overage Billing Service
 * Handles automatic billing when users exceed their rate limits
 */

import { EventEmitter } from 'events';
import { prisma } from '../database/prisma';
import { redisCache } from './redis-cache';
import { unifiedPaymentService } from './unified-payment-service';
import { realTimeUsageTracker } from './real-time-usage-tracker';
import { logger } from '../utils/logger';

interface OverageConfig {
  enableAutoBilling: boolean;
  overageRate: number; // Cost per additional request
  notificationThreshold: number; // Percentage threshold for notifications
  maxOveragePerMonth: number; // Maximum overage amount allowed
  graceRequests: number; // Free requests allowed over limit
}

interface OverageBilling {
  id: string;
  userId: string;
  planType: string;
  periodStart: Date;
  periodEnd: Date;
  baseRequestLimit: number;
  requestsUsed: number;
  overageRequests: number;
  overageAmount: number;
  status: 'pending' | 'charged' | 'failed' | 'waived';
  chargedAt?: Date;
  paymentId?: string;
  metadata: Record<string, any>;
}

class OverageBillingService extends EventEmitter {
  private static instance: OverageBillingService;
  private config: OverageConfig;
  private billingCache = new Map<string, OverageBilling>();
  private notificationsSent = new Set<string>();

  // Overage rates per plan type (per request over limit)
  private readonly OVERAGE_RATES = {
    'free': 0.005, // $0.005 per request
    '$10/week': 0.003, // $0.003 per request
    '$20/month': 0.002, // $0.002 per request
    '$100/month': 0.001, // $0.001 per request
    '$200/month': 0.0005, // $0.0005 per request
    'enterprise': 0.0001 // $0.0001 per request
  } as const;

  // Grace requests (free overage) per plan
  private readonly GRACE_REQUESTS = {
    'free': 5, // 5 free requests over limit
    '$10/week': 50, // 50 free requests over limit
    '$20/month': 100, // 100 free requests over limit
    '$100/month': 500, // 500 free requests over limit
    '$200/month': 1000, // 1000 free requests over limit
    'enterprise': 10000 // 10000 free requests over limit
  } as const;

  // Maximum overage amount per month
  private readonly MAX_OVERAGE = {
    'free': 5.00, // $5 max overage
    '$10/week': 25.00, // $25 max overage
    '$20/month': 50.00, // $50 max overage
    '$100/month': 200.00, // $200 max overage
    '$200/month': 500.00, // $500 max overage
    'enterprise': 10000.00 // $10,000 max overage
  } as const;

  constructor() {
    super();
    this.config = {
      enableAutoBilling: process.env.ENABLE_OVERAGE_BILLING === 'true',
      overageRate: 0.002, // Default rate
      notificationThreshold: 0.8, // 80% of limit
      maxOveragePerMonth: 100.00,
      graceRequests: 10
    };

    // Monitor usage in real-time
    this.setupUsageMonitoring();
    logger.info('Overage billing service initialized', this.config);
  }

  public static getInstance(): OverageBillingService {
    if (!OverageBillingService.instance) {
      OverageBillingService.instance = new OverageBillingService();
    }
    return OverageBillingService.instance;
  }

  private setupUsageMonitoring(): void {
    // Listen for usage events from real-time tracker
    realTimeUsageTracker.on('usageLimitApproaching', async (data: any) => {
      await this.handleUsageLimitApproaching(data.userId, data.usage, data.limit, data.planType);
    });

    realTimeUsageTracker.on('usageLimitExceeded', async (data: any) => {
      await this.handleUsageLimitExceeded(data.userId, data.usage, data.limit, data.planType);
    });
  }

  /**
   * Handle when user approaches their usage limit
   */
  private async handleUsageLimitApproaching(
    userId: string,
    currentUsage: number,
    limit: number,
    planType: string
  ): Promise<void> {
    const percentage = currentUsage / limit;
    
    if (percentage >= this.config.notificationThreshold) {
      const notificationKey = `${userId}:${planType}:${new Date().toISOString().slice(0, 7)}`; // Monthly key
      
      if (!this.notificationsSent.has(notificationKey)) {
        await this.sendUsageWarningNotification(userId, currentUsage, limit, planType);
        this.notificationsSent.add(notificationKey);
        
        // Store notification in cache
        await redisCache.set(
          `overage:notification:${notificationKey}`,
          { sent: true, timestamp: new Date() },
          { ttl: 86400 } // 24 hours
        );
      }
    }
  }

  /**
   * Handle when user exceeds their usage limit
   */
  private async handleUsageLimitExceeded(
    userId: string,
    currentUsage: number,
    limit: number,
    planType: string
  ): Promise<void> {
    try {
      const overageRequests = Math.max(0, currentUsage - limit);
      const graceRequests = this.GRACE_REQUESTS[planType as keyof typeof this.GRACE_REQUESTS] || 0;
      const billableOverage = Math.max(0, overageRequests - graceRequests);
      
      if (billableOverage > 0) {
        const overageRate = this.OVERAGE_RATES[planType as keyof typeof this.OVERAGE_RATES] || 0.002;
        const overageAmount = billableOverage * overageRate;
        const maxOverage = this.MAX_OVERAGE[planType as keyof typeof this.MAX_OVERAGE] || 100;
        
        // Cap overage at maximum allowed
        const cappedAmount = Math.min(overageAmount, maxOverage);
        
        await this.createOverageBilling(
          userId,
          planType,
          limit,
          currentUsage,
          overageRequests,
          cappedAmount
        );
      }
      
      logger.info('Usage limit exceeded', {
        userId,
        currentUsage,
        limit,
        overageRequests,
        billableOverage,
        planType
      });
      
    } catch (error) {
      logger.error('Failed to handle usage limit exceeded', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        currentUsage,
        limit,
        planType
      });
    }
  }

  /**
   * Create overage billing record
   */
  private async createOverageBilling(
    userId: string,
    planType: string,
    baseLimit: number,
    requestsUsed: number,
    overageRequests: number,
    overageAmount: number
  ): Promise<OverageBilling> {
    const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const periodEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
    
    const billingId = `overage_${userId}_${Date.now()}`;
    
    const overageBilling: OverageBilling = {
      id: billingId,
      userId,
      planType,
      periodStart,
      periodEnd,
      baseRequestLimit: baseLimit,
      requestsUsed,
      overageRequests,
      overageAmount,
      status: 'pending',
      metadata: {
        overageRate: this.OVERAGE_RATES[planType as keyof typeof this.OVERAGE_RATES],
        graceRequests: this.GRACE_REQUESTS[planType as keyof typeof this.GRACE_REQUESTS],
        maxOverage: this.MAX_OVERAGE[planType as keyof typeof this.MAX_OVERAGE],
        createdAt: new Date()
      }
    };

    // Store in cache and database
    this.billingCache.set(billingId, overageBilling);
    
    // Store in database via audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'overage_billing_created',
        resource: 'overage_billing',
        resourceId: billingId,
        metadata: JSON.parse(JSON.stringify(overageBilling))
      }
    });

    // Auto-charge if enabled
    if (this.config.enableAutoBilling && overageAmount > 0) {
      await this.processOveragePayment(billingId);
    }

    // Send notification
    await this.sendOverageNotification(userId, overageBilling);

    this.emit('overageBillingCreated', overageBilling);
    
    return overageBilling;
  }

  /**
   * Process overage payment
   */
  private async processOveragePayment(billingId: string): Promise<boolean> {
    const billing = this.billingCache.get(billingId);
    if (!billing) {
      logger.error('Overage billing not found', { billingId });
      return false;
    }

    try {
      const paymentResult = await unifiedPaymentService.createPayment({
        userId: billing.userId,
        planId: 'overage',
        planName: `Overage Billing - ${billing.planType}`,
        amount: billing.overageAmount,
        currency: 'USD',
        paymentType: 'one_time',
        frontend: 'web',
        metadata: {
          overageBillingId: billingId,
          overageRequests: billing.overageRequests,
          planType: billing.planType
        }
      });

      if (paymentResult.success) {
        billing.status = 'charged';
        billing.paymentId = paymentResult.paymentId;
        billing.chargedAt = new Date();
        
        // Update database
        await prisma.auditLog.create({
          data: {
            userId: billing.userId,
            action: 'overage_billing_charged',
            resource: 'overage_billing',
            resourceId: billingId,
            metadata: {
              paymentId: paymentResult.paymentId,
              amount: billing.overageAmount,
              status: 'charged'
            }
          }
        });

        logger.info('Overage billing charged successfully', {
          billingId,
          paymentId: paymentResult.paymentId,
          amount: billing.overageAmount
        });

        this.emit('overageCharged', billing);
        return true;
      } else {
        billing.status = 'failed';
        logger.error('Overage billing payment failed', {
          billingId,
          error: paymentResult.error
        });
        return false;
      }
    } catch (error) {
      billing.status = 'failed';
      logger.error('Overage billing processing error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        billingId
      });
      return false;
    }
  }

  /**
   * Send usage warning notification
   */
  private async sendUsageWarningNotification(
    userId: string,
    currentUsage: number,
    limit: number,
    planType: string
  ): Promise<void> {
    const percentage = Math.round((currentUsage / limit) * 100);
    
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'usage_warning_sent',
        resource: 'notification',
        resourceId: `warning_${userId}_${Date.now()}`,
        metadata: {
          type: 'usage_warning',
          currentUsage,
          limit,
          percentage,
          planType,
          message: `You have used ${percentage}% of your ${planType} plan limit (${currentUsage}/${limit} requests)`
        }
      }
    });

    logger.info('Usage warning notification sent', {
      userId,
      currentUsage,
      limit,
      percentage,
      planType
    });
  }

  /**
   * Send overage notification
   */
  private async sendOverageNotification(userId: string, billing: OverageBilling): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'overage_notification_sent',
        resource: 'notification',
        resourceId: `overage_${billing.id}`,
        metadata: {
          type: 'overage_billing',
          overageRequests: billing.overageRequests,
          overageAmount: billing.overageAmount,
          planType: billing.planType,
          message: `You have exceeded your ${billing.planType} plan limit by ${billing.overageRequests} requests. Overage charge: $${billing.overageAmount.toFixed(2)}`
        }
      }
    });

    logger.info('Overage notification sent', {
      userId,
      billingId: billing.id,
      overageAmount: billing.overageAmount
    });
  }

  /**
   * Get overage billing for user
   */
  public async getOverageBilling(userId: string, month?: string): Promise<OverageBilling[]> {
    const monthFilter = month || new Date().toISOString().slice(0, 7);
    
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        userId,
        action: 'overage_billing_created',
        timestamp: {
          gte: new Date(`${monthFilter}-01`),
          lt: new Date(new Date(`${monthFilter}-01`).setMonth(new Date(`${monthFilter}-01`).getMonth() + 1))
        }
      },
      orderBy: { timestamp: 'desc' }
    });

    return auditLogs.map(log => log.metadata as unknown as OverageBilling);
  }

  /**
   * Get overage statistics
   */
  public async getOverageStatistics(): Promise<any> {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const stats = await prisma.auditLog.groupBy({
      by: ['userId'],
      where: {
        action: 'overage_billing_created',
        timestamp: {
          gte: new Date(`${currentMonth}-01`)
        }
      },
      _count: true
    });

    const chargedBillings = await prisma.auditLog.findMany({
      where: {
        action: 'overage_billing_charged',
        timestamp: {
          gte: new Date(`${currentMonth}-01`)
        }
      }
    });

    const totalRevenue = chargedBillings.reduce((sum, log) => {
      return sum + ((log.metadata as any)?.amount || 0);
    }, 0);

    return {
      totalUsers: stats.length,
      totalOverageBillings: stats.reduce((sum, stat) => sum + stat._count, 0),
      totalRevenue: totalRevenue,
      currentMonth,
      averageOveragePerUser: stats.length > 0 ? totalRevenue / stats.length : 0
    };
  }

  /**
   * Waive overage billing
   */
  public async waiveOverageBilling(billingId: string, reason: string): Promise<boolean> {
    const billing = this.billingCache.get(billingId);
    if (!billing) {
      logger.error('Overage billing not found for waiving', { billingId });
      return false;
    }

    billing.status = 'waived';
    billing.metadata.waivedReason = reason;
    billing.metadata.waivedAt = new Date();

    await prisma.auditLog.create({
      data: {
        userId: billing.userId,
        action: 'overage_billing_waived',
        resource: 'overage_billing',
        resourceId: billingId,
        metadata: {
          reason,
          originalAmount: billing.overageAmount,
          waivedAt: new Date()
        }
      }
    });

    logger.info('Overage billing waived', { billingId, reason });
    this.emit('overageWaived', billing);
    
    return true;
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<OverageConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Overage billing configuration updated', this.config);
  }

  /**
   * Health check
   */
  public healthCheck(): any {
    return {
      status: 'healthy',
      config: this.config,
      cachedBillings: this.billingCache.size,
      notificationsSent: this.notificationsSent.size,
      timestamp: new Date()
    };
  }
}

// Export singleton instance
export const overageBillingService = OverageBillingService.getInstance();