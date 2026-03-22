/**
 * Database operations for subscriptions
 * Real Neon/Postgres implementation
 */

import { createSql } from './pg-pool';

export interface Subscription {
  id: string;
  user_id: string;
  provider: 'paddle' | 'dodopay';
  subscription_id: string;
  customer_id: string;
  plan_id: 'free' | 'pro' | 'team' | 'enterprise';
  status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'incomplete';
  current_period_start: Date;
  current_period_end: Date;
  cancel_at_period_end: boolean;
  cancelled_at?: Date;
  trial_end?: Date;
  generations_limit: number;
  generations_used: number;
  last_reset_at: Date;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface UsageLog {
  id: string;
  user_id: string;
  subscription_id?: string;
  action_type: 'generation' | 'template' | 'export' | 'deployment';
  tokens_used: number;
  cost_estimated: number;
  model_used?: string;
  optimization_strategy?: string;
  request_data?: Record<string, any>;
  response_data?: Record<string, any>;
  created_at: Date;
}

export class SubscriptionDB {
  private sql: ReturnType<typeof createSql>;

  constructor(databaseUrl: string) {
    this.sql = createSql(databaseUrl);
  }

  /**
   * Get user's active subscription
   */
  async getSubscription(userId: string): Promise<Subscription | null> {
    const result = await this.sql`
      SELECT * FROM subscriptions
      WHERE user_id = ${userId}
      LIMIT 1
    ` as unknown as Subscription[];

    return result[0] || null;
  }

  /**
   * Create new subscription
   */
  async createSubscription(data: {
    userId: string;
    provider: 'paddle' | 'dodopay';
    subscriptionId: string;
    customerId: string;
    planId: 'free' | 'pro' | 'team' | 'enterprise';
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    status?: string;
    trialEnd?: Date;
  }): Promise<Subscription> {
    const limits = {
      free: 5,
      pro: 100,
      team: 500,
      enterprise: 2000
    };

    const result = await this.sql`
      INSERT INTO subscriptions (
        user_id,
        provider,
        subscription_id,
        customer_id,
        plan_id,
        status,
        current_period_start,
        current_period_end,
        trial_end,
        generations_limit
      ) VALUES (
        ${data.userId},
        ${data.provider},
        ${data.subscriptionId},
        ${data.customerId},
        ${data.planId},
        ${data.status || 'active'},
        ${data.currentPeriodStart},
        ${data.currentPeriodEnd},
        ${data.trialEnd || null},
        ${limits[data.planId]}
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        provider = EXCLUDED.provider,
        subscription_id = EXCLUDED.subscription_id,
        customer_id = EXCLUDED.customer_id,
        plan_id = EXCLUDED.plan_id,
        status = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        trial_end = EXCLUDED.trial_end,
        generations_limit = EXCLUDED.generations_limit,
        updated_at = NOW()
      RETURNING *
    ` as unknown as Subscription[];

    return result[0];
  }

  /**
   * Update subscription status
   */
  async updateSubscriptionStatus(
    subscriptionId: string,
    status: string,
    cancelAtPeriodEnd?: boolean
  ): Promise<void> {
    await this.sql`
      UPDATE subscriptions
      SET
        status = ${status},
        cancel_at_period_end = ${cancelAtPeriodEnd ?? false},
        cancelled_at = ${status === 'cancelled' ? new Date() : null},
        updated_at = NOW()
      WHERE subscription_id = ${subscriptionId}
    `;
  }

  /**
   * Update subscription plan
   */
  async updateSubscriptionPlan(
    subscriptionId: string,
    newPlanId: 'pro' | 'team' | 'enterprise',
    currentPeriodEnd: Date
  ): Promise<void> {
    const limits = {
      pro: 100,
      team: 500,
      enterprise: 2000
    };

    await this.sql`
      UPDATE subscriptions
      SET
        plan_id = ${newPlanId},
        generations_limit = ${limits[newPlanId]},
        current_period_end = ${currentPeriodEnd},
        updated_at = NOW()
      WHERE subscription_id = ${subscriptionId}
    `;
  }

  /**
   * Check if user can generate (has quota)
   */
  async canGenerate(userId: string): Promise<{
    allowed: boolean;
    remaining: number;
    limit: number;
    planId: string;
  }> {
    const subscription = await this.getSubscription(userId);

    if (!subscription) {
      // No subscription = free tier
      return {
        allowed: false,
        remaining: 0,
        limit: 5,
        planId: 'free'
      };
    }

    // Check if billing period needs reset
    const now = new Date();
    const periodEnd = new Date(subscription.current_period_end);

    if (now > periodEnd) {
      // Reset usage for new period
      await this.sql`
        UPDATE subscriptions
        SET
          generations_used = 0,
          last_reset_at = NOW()
        WHERE id = ${subscription.id}
      `;
      subscription.generations_used = 0;
    }

    const remaining = subscription.generations_limit - subscription.generations_used;

    return {
      allowed: remaining > 0 && subscription.status === 'active',
      remaining: Math.max(0, remaining),
      limit: subscription.generations_limit,
      planId: subscription.plan_id
    };
  }

  /**
   * Increment usage counter
   */
  async incrementUsage(userId: string, amount: number = 1): Promise<void> {
    await this.sql`
      UPDATE subscriptions
      SET
        generations_used = generations_used + ${amount},
        updated_at = NOW()
      WHERE user_id = ${userId}
    `;
  }

  /**
   * Log usage details
   */
  async logUsage(data: {
    userId: string;
    actionType: 'generation' | 'template' | 'export' | 'deployment';
    tokensUsed?: number;
    costEstimated?: number;
    modelUsed?: string;
    optimizationStrategy?: string;
    requestData?: Record<string, any>;
    responseData?: Record<string, any>;
  }): Promise<void> {
    const subscription = await this.getSubscription(data.userId);

    await this.sql`
      INSERT INTO usage_logs (
        user_id,
        subscription_id,
        action_type,
        tokens_used,
        cost_estimated,
        model_used,
        optimization_strategy,
        request_data,
        response_data
      ) VALUES (
        ${data.userId},
        ${subscription?.id || null},
        ${data.actionType},
        ${data.tokensUsed || 0},
        ${data.costEstimated || 0},
        ${data.modelUsed || null},
        ${data.optimizationStrategy || null},
        ${JSON.stringify(data.requestData || {})},
        ${JSON.stringify(data.responseData || {})}
      )
    `;
  }

  /**
   * Get usage statistics for user
   */
  async getUsageStats(userId: string, days: number = 30): Promise<{
    totalGenerations: number;
    totalTokens: number;
    totalCost: number;
    byModel: Record<string, number>;
    byDay: Array<{ date: string; count: number }>;
  }> {
    const statsResult = await this.sql`
      SELECT
        COUNT(*) as total_generations,
        SUM(tokens_used) as total_tokens,
        SUM(cost_estimated) as total_cost,
        model_used,
        DATE(created_at) as date
      FROM usage_logs
      WHERE
        user_id = ${userId}
        AND created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY model_used, DATE(created_at)
    ` as unknown as Record<string, any>[];

    const byModel: Record<string, number> = {};
    const byDay: Array<{ date: string; count: number }> = [];

    statsResult.forEach((row: any) => {
      if (row.model_used) {
        byModel[row.model_used] = (byModel[row.model_used] || 0) + parseInt(row.total_generations);
      }

      const dateStr = row.date?.toISOString().split('T')[0];
      if (dateStr) {
        byDay.push({
          date: dateStr,
          count: parseInt(row.total_generations)
        });
      }
    });

    return {
      totalGenerations: statsResult.reduce((sum: number, row: any) => sum + parseInt(row.total_generations || 0), 0),
      totalTokens: statsResult.reduce((sum: number, row: any) => sum + parseInt(row.total_tokens || 0), 0),
      totalCost: statsResult.reduce((sum: number, row: any) => sum + parseFloat(row.total_cost || 0), 0),
      byModel,
      byDay
    };
  }

  /**
   * Store webhook event
   */
  async storeWebhookEvent(data: {
    provider: 'paddle' | 'dodopay';
    eventId: string;
    eventType: string;
    payload: Record<string, any>;
  }): Promise<void> {
    await this.sql`
      INSERT INTO webhook_events (
        provider,
        event_id,
        event_type,
        payload
      ) VALUES (
        ${data.provider},
        ${data.eventId},
        ${data.eventType},
        ${JSON.stringify(data.payload)}
      )
      ON CONFLICT (event_id) DO NOTHING
    `;
  }

  /**
   * Mark webhook as processed
   */
  async markWebhookProcessed(eventId: string, error?: string): Promise<void> {
    await this.sql`
      UPDATE webhook_events
      SET
        processed = ${!error},
        processed_at = NOW(),
        error_message = ${error || null},
        retry_count = retry_count + 1
      WHERE event_id = ${eventId}
    `;
  }

  /**
   * Create payment transaction record
   */
  async createTransaction(data: {
    userId: string;
    subscriptionId?: string;
    provider: 'paddle' | 'dodopay';
    transactionId: string;
    amount: number;
    currency: string;
    status: 'pending' | 'succeeded' | 'failed' | 'refunded';
    paymentMethod?: string;
    receiptUrl?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    await this.sql`
      INSERT INTO payment_transactions (
        user_id,
        subscription_id,
        provider,
        transaction_id,
        amount,
        currency,
        status,
        payment_method,
        receipt_url,
        metadata
      ) VALUES (
        ${data.userId},
        ${data.subscriptionId || null},
        ${data.provider},
        ${data.transactionId},
        ${data.amount},
        ${data.currency},
        ${data.status},
        ${data.paymentMethod || null},
        ${data.receiptUrl || null},
        ${JSON.stringify(data.metadata || {})}
      )
      ON CONFLICT (transaction_id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = NOW()
    `;
  }
}

/**
 * Initialize database client from environment
 */
export function createSubscriptionDB(env: any): SubscriptionDB {
  const databaseUrl = env.DATABASE_URL || env.NEON_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL not configured');
  }

  return new SubscriptionDB(databaseUrl);
}
