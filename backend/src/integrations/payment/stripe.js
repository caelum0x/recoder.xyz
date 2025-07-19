const stripe = require('stripe');
const { logger } = require('../../utils/logger');

class StripeIntegration {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.STRIPE_SECRET_KEY;
    this.publishableKey = options.publishableKey || process.env.STRIPE_PUBLISHABLE_KEY;
    this.webhookSecret = options.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET;
    this.timeout = options.timeout || 30000;
    
    if (!this.apiKey) {
      throw new Error('Stripe API key is required');
    }
    
    this.stripe = stripe(this.apiKey, {
      timeout: this.timeout,
      maxNetworkRetries: 3
    });
  }

  async createCustomer(options) {
    const { email, name, phone, address, metadata = {} } = options;

    try {
      const customer = await this.stripe.customers.create({
        email,
        name,
        phone,
        address,
        metadata
      });

      return {
        success: true,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          created: customer.created
        }
      };
    } catch (error) {
      logger.error('Failed to create Stripe customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getCustomer(customerId) {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);

      return {
        success: true,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          address: customer.address,
          created: customer.created,
          metadata: customer.metadata
        }
      };
    } catch (error) {
      logger.error('Failed to get Stripe customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateCustomer(customerId, updates) {
    try {
      const customer = await this.stripe.customers.update(customerId, updates);

      return {
        success: true,
        customer: {
          id: customer.id,
          email: customer.email,
          name: customer.name,
          phone: customer.phone,
          address: customer.address
        }
      };
    } catch (error) {
      logger.error('Failed to update Stripe customer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createPaymentIntent(options) {
    const { 
      amount, 
      currency = 'usd', 
      customerId, 
      paymentMethodId,
      description,
      metadata = {},
      confirmImmediately = false 
    } = options;

    try {
      const paymentIntentData = {
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        description,
        metadata
      };

      if (customerId) {
        paymentIntentData.customer = customerId;
      }

      if (paymentMethodId) {
        paymentIntentData.payment_method = paymentMethodId;
        if (confirmImmediately) {
          paymentIntentData.confirm = true;
        }
      }

      const paymentIntent = await this.stripe.paymentIntents.create(paymentIntentData);

      return {
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          status: paymentIntent.status,
          clientSecret: paymentIntent.client_secret
        }
      };
    } catch (error) {
      logger.error('Failed to create payment intent:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async confirmPaymentIntent(paymentIntentId, paymentMethodId = null) {
    try {
      const confirmData = {};
      if (paymentMethodId) {
        confirmData.payment_method = paymentMethodId;
      }

      const paymentIntent = await this.stripe.paymentIntents.confirm(
        paymentIntentId,
        confirmData
      );

      return {
        success: true,
        paymentIntent: {
          id: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          status: paymentIntent.status
        }
      };
    } catch (error) {
      logger.error('Failed to confirm payment intent:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createSubscription(options) {
    const { 
      customerId, 
      priceId, 
      quantity = 1,
      trialPeriodDays,
      metadata = {},
      paymentMethodId 
    } = options;

    try {
      const subscriptionData = {
        customer: customerId,
        items: [{ price: priceId, quantity }],
        metadata
      };

      if (trialPeriodDays) {
        subscriptionData.trial_period_days = trialPeriodDays;
      }

      if (paymentMethodId) {
        subscriptionData.default_payment_method = paymentMethodId;
      }

      const subscription = await this.stripe.subscriptions.create(subscriptionData);

      return {
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          trialEnd: subscription.trial_end
        }
      };
    } catch (error) {
      logger.error('Failed to create subscription:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getSubscription(subscriptionId) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);

      return {
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          customerId: subscription.customer,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          items: subscription.items.data.map(item => ({
            id: item.id,
            priceId: item.price.id,
            quantity: item.quantity
          }))
        }
      };
    } catch (error) {
      logger.error('Failed to get subscription:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async updateSubscription(subscriptionId, options) {
    const { priceId, quantity, metadata } = options;

    try {
      const updateData = {};
      
      if (priceId || quantity) {
        const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
        updateData.items = [{
          id: subscription.items.data[0].id,
          price: priceId || subscription.items.data[0].price.id,
          quantity: quantity || subscription.items.data[0].quantity
        }];
      }

      if (metadata) {
        updateData.metadata = metadata;
      }

      const subscription = await this.stripe.subscriptions.update(subscriptionId, updateData);

      return {
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          currentPeriodStart: subscription.current_period_start,
          currentPeriodEnd: subscription.current_period_end
        }
      };
    } catch (error) {
      logger.error('Failed to update subscription:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async cancelSubscription(subscriptionId, cancelAtPeriodEnd = true) {
    try {
      let subscription;
      
      if (cancelAtPeriodEnd) {
        subscription = await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
      } else {
        subscription = await this.stripe.subscriptions.del(subscriptionId);
      }

      return {
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: subscription.canceled_at
        }
      };
    } catch (error) {
      logger.error('Failed to cancel subscription:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createProduct(options) {
    const { name, description, images = [], metadata = {} } = options;

    try {
      const product = await this.stripe.products.create({
        name,
        description,
        images,
        metadata
      });

      return {
        success: true,
        product: {
          id: product.id,
          name: product.name,
          description: product.description,
          created: product.created
        }
      };
    } catch (error) {
      logger.error('Failed to create product:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createPrice(options) {
    const { 
      productId, 
      unitAmount, 
      currency = 'usd', 
      recurring = null,
      metadata = {} 
    } = options;

    try {
      const priceData = {
        product: productId,
        unit_amount: Math.round(unitAmount * 100), // Convert to cents
        currency,
        metadata
      };

      if (recurring) {
        priceData.recurring = {
          interval: recurring.interval, // 'day', 'week', 'month', 'year'
          interval_count: recurring.intervalCount || 1
        };
      }

      const price = await this.stripe.prices.create(priceData);

      return {
        success: true,
        price: {
          id: price.id,
          productId: price.product,
          unitAmount: price.unit_amount / 100,
          currency: price.currency,
          recurring: price.recurring
        }
      };
    } catch (error) {
      logger.error('Failed to create price:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createPaymentMethod(options) {
    const { type = 'card', card, billing_details } = options;

    try {
      const paymentMethod = await this.stripe.paymentMethods.create({
        type,
        card,
        billing_details
      });

      return {
        success: true,
        paymentMethod: {
          id: paymentMethod.id,
          type: paymentMethod.type,
          card: paymentMethod.card ? {
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            expMonth: paymentMethod.card.exp_month,
            expYear: paymentMethod.card.exp_year
          } : null
        }
      };
    } catch (error) {
      logger.error('Failed to create payment method:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async attachPaymentMethod(paymentMethodId, customerId) {
    try {
      const paymentMethod = await this.stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId
      });

      return {
        success: true,
        paymentMethod: {
          id: paymentMethod.id,
          customerId: paymentMethod.customer
        }
      };
    } catch (error) {
      logger.error('Failed to attach payment method:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createInvoice(options) {
    const { customerId, description, metadata = {}, autoAdvance = true } = options;

    try {
      const invoice = await this.stripe.invoices.create({
        customer: customerId,
        description,
        metadata,
        auto_advance: autoAdvance
      });

      return {
        success: true,
        invoice: {
          id: invoice.id,
          status: invoice.status,
          amountDue: invoice.amount_due / 100,
          currency: invoice.currency,
          hostedInvoiceUrl: invoice.hosted_invoice_url
        }
      };
    } catch (error) {
      logger.error('Failed to create invoice:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createRefund(options) {
    const { paymentIntentId, amount = null, reason = null, metadata = {} } = options;

    try {
      const refundData = {
        payment_intent: paymentIntentId,
        metadata
      };

      if (amount) {
        refundData.amount = Math.round(amount * 100); // Convert to cents
      }

      if (reason) {
        refundData.reason = reason; // 'duplicate', 'fraudulent', 'requested_by_customer'
      }

      const refund = await this.stripe.refunds.create(refundData);

      return {
        success: true,
        refund: {
          id: refund.id,
          amount: refund.amount / 100,
          currency: refund.currency,
          status: refund.status,
          reason: refund.reason
        }
      };
    } catch (error) {
      logger.error('Failed to create refund:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async handleWebhook(rawBody, signature) {
    try {
      if (!this.webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      const event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret
      );

      return {
        success: true,
        event: {
          id: event.id,
          type: event.type,
          data: event.data,
          created: event.created
        }
      };
    } catch (error) {
      logger.error('Failed to handle webhook:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getPaymentIntents(options = {}) {
    const { customerId, limit = 10, startingAfter } = options;

    try {
      const params = { limit };
      
      if (customerId) {
        params.customer = customerId;
      }
      
      if (startingAfter) {
        params.starting_after = startingAfter;
      }

      const paymentIntents = await this.stripe.paymentIntents.list(params);

      return {
        success: true,
        paymentIntents: paymentIntents.data.map(pi => ({
          id: pi.id,
          amount: pi.amount / 100,
          currency: pi.currency,
          status: pi.status,
          created: pi.created
        })),
        hasMore: paymentIntents.has_more
      };
    } catch (error) {
      logger.error('Failed to get payment intents:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getCustomerSubscriptions(customerId) {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId
      });

      return {
        success: true,
        subscriptions: subscriptions.data.map(sub => ({
          id: sub.id,
          status: sub.status,
          currentPeriodStart: sub.current_period_start,
          currentPeriodEnd: sub.current_period_end,
          cancelAtPeriodEnd: sub.cancel_at_period_end
        }))
      };
    } catch (error) {
      logger.error('Failed to get customer subscriptions:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Configuration methods
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this.stripe = stripe(apiKey, {
      timeout: this.timeout,
      maxNetworkRetries: 3
    });
  }

  setWebhookSecret(webhookSecret) {
    this.webhookSecret = webhookSecret;
  }

  setTimeout(timeout) {
    this.timeout = timeout;
    this.stripe = stripe(this.apiKey, {
      timeout: timeout,
      maxNetworkRetries: 3
    });
  }

  // Helper methods
  formatAmount(amount) {
    return Math.round(amount * 100); // Convert dollars to cents
  }

  parseAmount(amount) {
    return amount / 100; // Convert cents to dollars
  }

  getPublishableKey() {
    return this.publishableKey;
  }

  // Generate payment form configuration
  generatePaymentConfig(options = {}) {
    const { theme = 'stripe', locale = 'auto' } = options;
    
    return {
      publishableKey: this.publishableKey,
      appearance: {
        theme: theme,
        variables: {
          colorPrimary: '#0570de',
          colorBackground: '#ffffff',
          colorText: '#30313d',
          colorDanger: '#df1b41',
          fontFamily: 'Ideal Sans, system-ui, sans-serif',
          spacingUnit: '2px',
          borderRadius: '4px'
        }
      },
      locale: locale
    };
  }
}

module.exports = { StripeIntegration };