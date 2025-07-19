const { StripeIntegration } = require('./stripe');
const { PayPalIntegration } = require('./paypal');
const { SquareIntegration } = require('./square');

class PaymentIntegrationManager {
  constructor() {
    this.integrations = {
      stripe: null,
      paypal: null,
      square: null
    };
    this.activeProvider = null;
    this.fallbackProviders = [];
  }

  initializeStripe(options = {}) {
    this.integrations.stripe = new StripeIntegration(options);
    return this.integrations.stripe;
  }

  initializePayPal(options = {}) {
    this.integrations.paypal = new PayPalIntegration(options);
    return this.integrations.paypal;
  }

  initializeSquare(options = {}) {
    this.integrations.square = new SquareIntegration(options);
    return this.integrations.square;
  }

  getIntegration(provider) {
    const integration = this.integrations[provider.toLowerCase()];
    if (!integration) {
      throw new Error(`${provider} integration not initialized`);
    }
    return integration;
  }

  setActiveProvider(provider) {
    if (!this.integrations[provider.toLowerCase()]) {
      throw new Error(`${provider} integration not initialized`);
    }
    this.activeProvider = provider.toLowerCase();
  }

  setFallbackProviders(providers) {
    this.fallbackProviders = providers.map(p => p.toLowerCase());
  }

  getActiveIntegration() {
    if (!this.activeProvider) {
      throw new Error('No active payment provider set');
    }
    return this.integrations[this.activeProvider];
  }

  async createPayment(options, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No payment provider specified and no active provider set');
    }

    try {
      const integration = this.getIntegration(targetProvider);
      
      switch (targetProvider) {
        case 'stripe':
          return await integration.createPaymentIntent(options);
        case 'paypal':
          return await integration.createOrder(options);
        case 'square':
          return await integration.createPayment(options);
        default:
          throw new Error(`Unsupported payment provider: ${targetProvider}`);
      }
    } catch (error) {
      if (this.fallbackProviders.length > 0) {
        return await this.tryFallbackProviders('createPayment', options);
      }
      throw error;
    }
  }

  async createCustomer(options, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No payment provider specified and no active provider set');
    }

    try {
      const integration = this.getIntegration(targetProvider);
      return await integration.createCustomer(options);
    } catch (error) {
      if (this.fallbackProviders.length > 0) {
        return await this.tryFallbackProviders('createCustomer', options);
      }
      throw error;
    }
  }

  async createSubscription(options, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No payment provider specified and no active provider set');
    }

    try {
      const integration = this.getIntegration(targetProvider);
      return await integration.createSubscription(options);
    } catch (error) {
      if (this.fallbackProviders.length > 0) {
        return await this.tryFallbackProviders('createSubscription', options);
      }
      throw error;
    }
  }

  async createRefund(options, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No payment provider specified and no active provider set');
    }

    try {
      const integration = this.getIntegration(targetProvider);
      
      switch (targetProvider) {
        case 'stripe':
          return await integration.createRefund(options);
        case 'paypal':
          return await integration.createRefund(options);
        case 'square':
          return await integration.refundPayment(options);
        default:
          throw new Error(`Unsupported payment provider: ${targetProvider}`);
      }
    } catch (error) {
      if (this.fallbackProviders.length > 0) {
        return await this.tryFallbackProviders('createRefund', options);
      }
      throw error;
    }
  }

  async tryFallbackProviders(method, options) {
    for (const provider of this.fallbackProviders) {
      try {
        const integration = this.getIntegration(provider);
        
        switch (method) {
          case 'createPayment':
            if (provider === 'stripe') {
              return await integration.createPaymentIntent(options);
            } else if (provider === 'paypal') {
              return await integration.createOrder(options);
            } else if (provider === 'square') {
              return await integration.createPayment(options);
            }
            break;
          case 'createCustomer':
            return await integration.createCustomer(options);
          case 'createSubscription':
            return await integration.createSubscription(options);
          case 'createRefund':
            if (provider === 'stripe') {
              return await integration.createRefund(options);
            } else if (provider === 'paypal') {
              return await integration.createRefund(options);
            } else if (provider === 'square') {
              return await integration.refundPayment(options);
            }
            break;
        }
      } catch (error) {
        console.warn(`Fallback provider ${provider} failed:`, error.message);
        continue;
      }
    }
    
    throw new Error('All payment providers failed');
  }

  async getPaymentMethods(customerId, provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No payment provider specified and no active provider set');
    }

    const integration = this.getIntegration(targetProvider);
    
    switch (targetProvider) {
      case 'stripe':
        // Stripe doesn't have a direct getPaymentMethods in our integration
        // This would need to be implemented
        return { success: true, paymentMethods: [] };
      case 'paypal':
        // PayPal payment methods are handled differently
        return { success: true, paymentMethods: [] };
      case 'square':
        // Square would need customer card retrieval
        return { success: true, paymentMethods: [] };
      default:
        throw new Error(`Unsupported payment provider: ${targetProvider}`);
    }
  }

  async webhookHandler(provider, headers, body, options = {}) {
    const integration = this.getIntegration(provider);
    
    switch (provider) {
      case 'stripe':
        return await integration.handleWebhook(body, headers['stripe-signature']);
      case 'paypal':
        return await integration.verifyWebhook(headers, body, options.webhookId);
      case 'square':
        return integration.verifyWebhookSignature(
          body, 
          headers['x-square-signature'], 
          options.signatureKey, 
          options.notificationUrl
        );
      default:
        throw new Error(`Webhook handling not supported for provider: ${provider}`);
    }
  }

  getProviderCapabilities(provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No payment provider specified and no active provider set');
    }

    const capabilities = {
      stripe: {
        payments: true,
        subscriptions: true,
        customers: true,
        refunds: true,
        invoices: true,
        paymentMethods: true,
        webhooks: true,
        marketplaces: true,
        connect: true,
        internationalPayments: true,
        currencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', /* many more */],
        paymentTypes: ['card', 'bank_transfer', 'wallet']
      },
      paypal: {
        payments: true,
        subscriptions: true,
        customers: false,
        refunds: true,
        invoices: false,
        paymentMethods: false,
        webhooks: true,
        marketplaces: false,
        connect: false,
        internationalPayments: true,
        currencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', /* many more */],
        paymentTypes: ['paypal_account', 'card']
      },
      square: {
        payments: true,
        subscriptions: true,
        customers: true,
        refunds: true,
        invoices: true,
        paymentMethods: true,
        webhooks: true,
        marketplaces: false,
        connect: false,
        internationalPayments: false,
        currencies: ['USD'],
        paymentTypes: ['card', 'cash', 'gift_card']
      }
    };

    return capabilities[targetProvider] || {};
  }

  getProviderFees(provider = null) {
    const targetProvider = provider || this.activeProvider;
    if (!targetProvider) {
      throw new Error('No payment provider specified and no active provider set');
    }

    const fees = {
      stripe: {
        card: {
          rate: 0.029,
          fixed: 0.30,
          currency: 'USD'
        },
        internationalCard: {
          rate: 0.034,
          fixed: 0.30,
          currency: 'USD'
        }
      },
      paypal: {
        standard: {
          rate: 0.0349,
          fixed: 0.49,
          currency: 'USD'
        },
        international: {
          rate: 0.0449,
          fixed: 0.49,
          currency: 'USD'
        }
      },
      square: {
        card: {
          rate: 0.026,
          fixed: 0.10,
          currency: 'USD'
        },
        keyed: {
          rate: 0.035,
          fixed: 0.15,
          currency: 'USD'
        }
      }
    };

    return fees[targetProvider] || {};
  }

  async compareProviders() {
    const results = {};
    
    for (const [provider, integration] of Object.entries(this.integrations)) {
      if (integration) {
        results[provider] = {
          initialized: true,
          capabilities: this.getProviderCapabilities(provider),
          fees: this.getProviderFees(provider),
          environment: this.getProviderEnvironment(provider)
        };
      } else {
        results[provider] = {
          initialized: false
        };
      }
    }
    
    return results;
  }

  getProviderEnvironment(provider) {
    const integration = this.integrations[provider];
    if (!integration) return null;

    switch (provider) {
      case 'stripe':
        return integration.apiKey?.includes('sk_live') ? 'live' : 'test';
      case 'paypal':
        return integration.mode;
      case 'square':
        return integration.environment;
      default:
        return null;
    }
  }

  getAllProviders() {
    return Object.keys(this.integrations).filter(provider => 
      this.integrations[provider] !== null
    );
  }

  getActiveProvider() {
    return this.activeProvider;
  }

  getFallbackProviders() {
    return this.fallbackProviders;
  }

  // Health check for all providers
  async healthCheck() {
    const results = {};
    
    for (const [provider, integration] of Object.entries(this.integrations)) {
      if (integration) {
        try {
          // Basic health check - try to access provider
          switch (provider) {
            case 'stripe':
              // Stripe doesn't have a health endpoint, but we can check if API key is valid
              results[provider] = { healthy: true, message: 'Integration initialized' };
              break;
            case 'paypal':
              const token = await integration.getAccessToken();
              results[provider] = { healthy: !!token, message: token ? 'Connected' : 'Failed to get token' };
              break;
            case 'square':
              const locations = await integration.getLocations();
              results[provider] = { healthy: locations.success, message: locations.success ? 'Connected' : 'Failed to get locations' };
              break;
          }
        } catch (error) {
          results[provider] = { healthy: false, message: error.message };
        }
      } else {
        results[provider] = { healthy: false, message: 'Not initialized' };
      }
    }
    
    return results;
  }

  // Generate unified payment form configuration
  generateUnifiedPaymentConfig(options = {}) {
    const { preferredProvider, theme = 'default' } = options;
    const provider = preferredProvider || this.activeProvider;
    
    if (!provider) {
      throw new Error('No payment provider specified');
    }

    const integration = this.getIntegration(provider);
    
    switch (provider) {
      case 'stripe':
        return {
          provider: 'stripe',
          config: integration.generatePaymentConfig({ theme })
        };
      case 'paypal':
        return {
          provider: 'paypal',
          config: integration.generateButtonConfig({ style: { color: theme === 'dark' ? 'black' : 'blue' } })
        };
      case 'square':
        return {
          provider: 'square',
          config: integration.generateWebPaymentsConfig()
        };
      default:
        throw new Error(`Unified config not supported for provider: ${provider}`);
    }
  }
}

// Export all payment integrations
module.exports = {
  PaymentIntegrationManager,
  StripeIntegration,
  PayPalIntegration,
  SquareIntegration
};