/**
 * Stripe Integration for Recoder.xyz Billing
 * 
 * Handles subscription management, usage-based billing, and overage charges
 */

import Stripe from 'stripe';
import { PricingManager, PricingTier, UsageQuota } from '../pricing/pricing-tiers';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  priceIds: {
    [tierId: string]: {
      monthly: string;
      yearly: string;
    };
  };
}

export interface SubscriptionInfo {
  id: string;
  customerId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  tierId: string;
  billingPeriod: 'monthly' | 'yearly';
  nextBillingDate: Date;
  amount: number;
  currency: string;
}

export interface UsageBillingItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  metadata: Record<string, any>;
}

export class StripeBillingManager {
  private stripe: Stripe;
  private pricingManager: PricingManager;
  private config: StripeConfig;

  constructor(config: StripeConfig, pricingManager: PricingManager) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2023-10-16'
    });
    this.pricingManager = pricingManager;
    this.config = config;
  }

  /**
   * Create a new customer
   */
  async createCustomer(
    email: string,
    name?: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.Customer> {
    return await this.stripe.customers.create({
      email,
      name,
      metadata: {
        source: 'recoder_xyz',
        ...metadata
      }
    });
  }

  /**
   * Create a subscription for a tier
   */
  async createSubscription(
    customerId: string,
    tierId: string,
    billingPeriod: 'monthly' | 'yearly' = 'monthly'
  ): Promise<SubscriptionInfo> {
    const tier = this.pricingManager.getTier(tierId);
    if (!tier) {
      throw new Error(`Tier ${tierId} not found`);
    }

    const priceId = this.config.priceIds[tierId]?.[billingPeriod];
    if (!priceId) {
      throw new Error(`Price ID not found for tier ${tierId} ${billingPeriod}`);
    }

    const subscription = await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      metadata: {
        tierId,
        billingPeriod,
        source: 'recoder_xyz'
      },
      billing_cycle_anchor: undefined, // Start immediately
      proration_behavior: 'create_prorations'
    });

    return this.mapSubscriptionInfo(subscription, tierId, billingPeriod);
  }

  /**
   * Update subscription tier
   */
  async updateSubscription(
    subscriptionId: string,
    newTierId: string,
    billingPeriod?: 'monthly' | 'yearly'
  ): Promise<SubscriptionInfo> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const currentTierId = subscription.metadata.tierId;
    const currentBillingPeriod = subscription.metadata.billingPeriod as 'monthly' | 'yearly';
    
    const finalBillingPeriod = billingPeriod || currentBillingPeriod;
    const newPriceId = this.config.priceIds[newTierId]?.[finalBillingPeriod];
    
    if (!newPriceId) {
      throw new Error(`Price ID not found for tier ${newTierId} ${finalBillingPeriod}`);
    }

    const updatedSubscription = await this.stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newPriceId
      }],
      metadata: {
        tierId: newTierId,
        billingPeriod: finalBillingPeriod,
        previousTierId: currentTierId,
        source: 'recoder_xyz'
      },
      proration_behavior: 'create_prorations'
    });

    return this.mapSubscriptionInfo(updatedSubscription, newTierId, finalBillingPeriod);
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    immediately: boolean = false
  ): Promise<Stripe.Subscription> {
    if (immediately) {
      return await this.stripe.subscriptions.cancel(subscriptionId);
    } else {
      return await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      });
    }
  }

  /**
   * Create usage-based invoice for overages
   */
  async createUsageInvoice(
    customerId: string,
    usageItems: UsageBillingItem[],
    description: string = 'Usage charges'
  ): Promise<Stripe.Invoice> {
    const invoice = await this.stripe.invoices.create({
      customer: customerId,
      description,
      metadata: {
        type: 'usage_billing',
        source: 'recoder_xyz'
      }
    });

    // Add usage line items
    for (const item of usageItems) {
      await this.stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_amount: Math.round(item.unitPrice * 100), // Convert to cents
        metadata: item.metadata
      });
    }

    return await this.stripe.invoices.finalizeInvoice(invoice.id);
  }

  /**
   * Calculate and bill monthly overages
   */
  async billMonthlyOverages(userId: string, customerId: string): Promise<Stripe.Invoice | null> {
    const quota = this.pricingManager.getUserQuota(userId);
    if (!quota) return null;

    const overageAmount = this.pricingManager.calculateOverage(userId);
    if (overageAmount <= 0) return null;

    const usageItems: UsageBillingItem[] = [];

    // Request overage
    if (quota.limits.requests > 0 && quota.usage.requests > quota.limits.requests) {
      const overageRequests = quota.usage.requests - quota.limits.requests;
      usageItems.push({
        description: `Request overage (${overageRequests.toLocaleString()} requests)`,
        quantity: overageRequests,
        unitPrice: 0.001,
        totalAmount: overageRequests * 0.001,
        metadata: { type: 'request_overage' }
      });
    }

    // Token overage
    if (quota.limits.tokens > 0 && quota.usage.tokens > quota.limits.tokens) {
      const overageTokens = quota.usage.tokens - quota.limits.tokens;
      const overageMillions = Math.ceil(overageTokens / 1_000_000);
      usageItems.push({
        description: `Token overage (${overageMillions}M tokens)`,
        quantity: overageMillions,
        unitPrice: 2.0,
        totalAmount: overageMillions * 2.0,
        metadata: { type: 'token_overage', tokens: overageTokens }
      });
    }

    // Cost overage
    if (quota.limits.cost > 0 && quota.usage.cost > quota.limits.cost) {
      const overageCost = quota.usage.cost - quota.limits.cost;
      usageItems.push({
        description: `AI cost overage with 50% markup`,
        quantity: 1,
        unitPrice: overageCost * 1.5,
        totalAmount: overageCost * 1.5,
        metadata: { type: 'cost_overage', base_cost: overageCost }
      });
    }

    if (usageItems.length === 0) return null;

    return await this.createUsageInvoice(
      customerId,
      usageItems,
      `Monthly overage charges for ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
    );
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(
    body: string,
    signature: string
  ): Promise<{ processed: boolean; message: string }> {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(body, signature, this.config.webhookSecret);
    } catch (err) {
      return { processed: false, message: `Webhook signature verification failed: ${err}` };
    }

    switch (event.type) {
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
        
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
        
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
        
      default:
        return { processed: false, message: `Unhandled event type: ${event.type}` };
    }

    return { processed: true, message: `Successfully processed ${event.type}` };
  }

  /**
   * Get subscription info
   */
  async getSubscription(subscriptionId: string): Promise<SubscriptionInfo | null> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const tierId = subscription.metadata.tierId;
      const billingPeriod = subscription.metadata.billingPeriod as 'monthly' | 'yearly';
      
      return this.mapSubscriptionInfo(subscription, tierId, billingPeriod);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get customer's invoices
   */
  async getCustomerInvoices(customerId: string, limit: number = 10): Promise<Stripe.Invoice[]> {
    const invoices = await this.stripe.invoices.list({
      customer: customerId,
      limit,
      status: 'paid'
    });
    
    return invoices.data;
  }

  /**
   * Create payment intent for one-time charges
   */
  async createPaymentIntent(
    amount: number,
    customerId: string,
    description: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.PaymentIntent> {
    return await this.stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      customer: customerId,
      description,
      metadata: {
        source: 'recoder_xyz',
        ...metadata
      }
    });
  }

  // Private helper methods

  private mapSubscriptionInfo(
    subscription: Stripe.Subscription,
    tierId: string,
    billingPeriod: 'monthly' | 'yearly'
  ): SubscriptionInfo {
    return {
      id: subscription.id,
      customerId: subscription.customer as string,
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      tierId,
      billingPeriod,
      nextBillingDate: new Date(subscription.current_period_end * 1000),
      amount: subscription.items.data[0]?.price.unit_amount || 0,
      currency: subscription.items.data[0]?.price.currency || 'usd'
    };
  }

  private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
    const tierId = subscription.metadata.tierId;
    const customerId = subscription.customer as string;
    
    // Initialize user quota for the new tier
    // In production, you'd get the userId from customer metadata
    const userId = `user_${customerId}`;
    this.pricingManager.initializeUserQuota(userId, tierId);
    
    console.log(`Subscription created for customer ${customerId}, tier ${tierId}`);
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const tierId = subscription.metadata.tierId;
    const customerId = subscription.customer as string;
    const userId = `user_${customerId}`;
    
    // Update user quota for the new tier
    this.pricingManager.initializeUserQuota(userId, tierId);
    
    console.log(`Subscription updated for customer ${customerId}, new tier ${tierId}`);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const customerId = subscription.customer as string;
    const userId = `user_${customerId}`;
    
    // Move user to free tier
    this.pricingManager.initializeUserQuota(userId, 'free');
    
    console.log(`Subscription cancelled for customer ${customerId}`);
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    
    console.log(`Payment succeeded for customer ${customerId}, amount: ${invoice.amount_paid}`);
    
    // Reset quota if this is a subscription renewal
    if (invoice.subscription) {
      const userId = `user_${customerId}`;
      this.pricingManager.resetUserQuota(userId);
    }
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const customerId = invoice.customer as string;
    
    console.log(`Payment failed for customer ${customerId}, amount: ${invoice.amount_due}`);
    
    // Handle payment failure (send notifications, suspend service, etc.)
    // Implementation depends on business logic
  }
}

export default StripeBillingManager;