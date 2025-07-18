const { logger } = require('../utils/logger');

class BillingService {
  constructor() {
    this.plans = new Map();
    this.loadPlans();
  }

  loadPlans() {
    const plans = [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        currency: 'USD',
        interval: 'month',
        features: {
          projects: 3,
          templates: 10,
          agents: 5,
          apiCalls: 1000,
          storage: '1GB',
          support: 'community'
        }
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 29,
        currency: 'USD',
        interval: 'month',
        features: {
          projects: 50,
          templates: 100,
          agents: 25,
          apiCalls: 50000,
          storage: '10GB',
          support: 'email'
        }
      },
      {
        id: 'premium',
        name: 'Premium',
        price: 99,
        currency: 'USD',
        interval: 'month',
        features: {
          projects: 'unlimited',
          templates: 'unlimited',
          agents: 100,
          apiCalls: 200000,
          storage: '50GB',
          support: 'priority'
        }
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 299,
        currency: 'USD',
        interval: 'month',
        features: {
          projects: 'unlimited',
          templates: 'unlimited',
          agents: 'unlimited',
          apiCalls: 'unlimited',
          storage: '200GB',
          support: 'dedicated'
        }
      }
    ];

    plans.forEach(plan => {
      this.plans.set(plan.id, plan);
    });

    logger.info(`${plans.length} billing plans loaded`);
  }

  async getUserSubscription(userId) {
    try {
      // Mock subscription data - in real implementation, this would query the database
      return {
        userId,
        planId: 'free',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        plan: this.plans.get('free')
      };
    } catch (error) {
      logger.error('Failed to get user subscription:', error);
      throw error;
    }
  }

  async createOrUpdateSubscription(userId, subscriptionData) {
    try {
      const { planId, paymentMethodId } = subscriptionData;
      
      const plan = this.plans.get(planId);
      if (!plan) {
        throw new Error('Plan not found');
      }

      // Mock subscription creation
      const subscription = {
        userId,
        planId,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        plan,
        paymentMethodId
      };

      logger.info(`Subscription created/updated for user: ${userId}, plan: ${planId}`);
      return subscription;
    } catch (error) {
      logger.error('Failed to create/update subscription:', error);
      throw error;
    }
  }

  async cancelSubscription(userId) {
    try {
      // Mock subscription cancellation
      const subscription = await this.getUserSubscription(userId);
      subscription.cancelAtPeriodEnd = true;
      subscription.status = 'cancel_at_period_end';

      logger.info(`Subscription cancelled for user: ${userId}`);
      return subscription;
    } catch (error) {
      logger.error('Failed to cancel subscription:', error);
      throw error;
    }
  }

  async getAvailablePlans() {
    try {
      return Array.from(this.plans.values());
    } catch (error) {
      logger.error('Failed to get available plans:', error);
      throw error;
    }
  }

  async getUserUsage(userId, options = {}) {
    try {
      const { startDate, endDate } = options;
      
      // Mock usage data
      const usage = {
        userId,
        period: {
          start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          end: endDate || new Date()
        },
        metrics: {
          projects: { used: 2, limit: 3 },
          templates: { used: 5, limit: 10 },
          agents: { used: 3, limit: 5 },
          apiCalls: { used: 850, limit: 1000 },
          storage: { used: '0.5GB', limit: '1GB' }
        },
        costs: {
          subscription: 0,
          overages: 0,
          total: 0
        }
      };

      return usage;
    } catch (error) {
      logger.error('Failed to get user usage:', error);
      throw error;
    }
  }

  async getUserInvoices(userId, options = {}) {
    try {
      const { limit = 20, offset = 0 } = options;
      
      // Mock invoice data
      const invoices = {
        invoices: [
          {
            id: 'inv_123',
            userId,
            amount: 0,
            currency: 'USD',
            status: 'paid',
            createdAt: new Date(),
            paidAt: new Date(),
            description: 'Free Plan - No charge'
          }
        ],
        total: 1,
        limit,
        offset
      };

      return invoices;
    } catch (error) {
      logger.error('Failed to get user invoices:', error);
      throw error;
    }
  }

  async getInvoiceDetails(invoiceId, userId) {
    try {
      // Mock invoice details
      const invoice = {
        id: invoiceId,
        userId,
        amount: 0,
        currency: 'USD',
        status: 'paid',
        createdAt: new Date(),
        paidAt: new Date(),
        description: 'Free Plan - No charge',
        items: [
          {
            description: 'Free Plan Subscription',
            quantity: 1,
            unitPrice: 0,
            amount: 0
          }
        ]
      };

      return invoice;
    } catch (error) {
      logger.error('Failed to get invoice details:', error);
      throw error;
    }
  }

  async getUserPaymentMethods(userId) {
    try {
      // Mock payment methods
      const paymentMethods = [
        {
          id: 'pm_123',
          userId,
          type: 'card',
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2025,
          isDefault: true
        }
      ];

      return paymentMethods;
    } catch (error) {
      logger.error('Failed to get payment methods:', error);
      throw error;
    }
  }

  async addPaymentMethod(userId, paymentMethodData) {
    try {
      const { token, type, setDefault } = paymentMethodData;
      
      // Mock payment method creation
      const paymentMethod = {
        id: `pm_${Date.now()}`,
        userId,
        type,
        brand: 'visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2025,
        isDefault: setDefault || false
      };

      logger.info(`Payment method added for user: ${userId}`);
      return paymentMethod;
    } catch (error) {
      logger.error('Failed to add payment method:', error);
      throw error;
    }
  }

  async deletePaymentMethod(paymentMethodId, userId) {
    try {
      // Mock payment method deletion
      logger.info(`Payment method deleted: ${paymentMethodId} for user: ${userId}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete payment method:', error);
      throw error;
    }
  }

  async checkUsageQuota(userId, resourceType, subscription) {
    try {
      const plan = this.plans.get(subscription);
      if (!plan) {
        return false;
      }

      const usage = await this.getUserUsage(userId);
      const currentUsage = usage.metrics[resourceType]?.used || 0;
      const limit = plan.features[resourceType];

      if (limit === 'unlimited') {
        return true;
      }

      return currentUsage < limit;
    } catch (error) {
      logger.error('Failed to check usage quota:', error);
      return false;
    }
  }

  async trackUsage(userId, resourceType, amount = 1) {
    try {
      // Mock usage tracking
      logger.info(`Usage tracked: ${userId} used ${amount} ${resourceType}`);
      return true;
    } catch (error) {
      logger.error('Failed to track usage:', error);
      throw error;
    }
  }

  async calculateOverages(userId) {
    try {
      const usage = await this.getUserUsage(userId);
      let overageCost = 0;

      // Calculate overages for each resource type
      for (const [resource, data] of Object.entries(usage.metrics)) {
        if (data.used > data.limit && data.limit !== 'unlimited') {
          const overage = data.used - data.limit;
          const rate = this.getOverageRate(resource);
          overageCost += overage * rate;
        }
      }

      return overageCost;
    } catch (error) {
      logger.error('Failed to calculate overages:', error);
      throw error;
    }
  }

  getOverageRate(resourceType) {
    const rates = {
      projects: 5,
      templates: 1,
      agents: 2,
      apiCalls: 0.001,
      storage: 0.1
    };

    return rates[resourceType] || 0;
  }
}

module.exports = { billingService: new BillingService() };