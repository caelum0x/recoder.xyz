const axios = require('axios');
const { logger } = require('../../utils/logger');

class PayPalIntegration {
  constructor(options = {}) {
    this.clientId = options.clientId || process.env.PAYPAL_CLIENT_ID;
    this.clientSecret = options.clientSecret || process.env.PAYPAL_CLIENT_SECRET;
    this.mode = options.mode || process.env.PAYPAL_MODE || 'sandbox'; // 'sandbox' or 'live'
    this.timeout = options.timeout || 30000;
    
    if (!this.clientId || !this.clientSecret) {
      throw new Error('PayPal client ID and secret are required');
    }
    
    this.baseUrl = this.mode === 'live' 
      ? 'https://api.paypal.com' 
      : 'https://api.sandbox.paypal.com';
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    try {
      if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.accessToken;
      }

      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post(`${this.baseUrl}/v1/oauth2/token`, 
        'grant_type=client_credentials',
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 minute buffer

      this.client.defaults.headers['Authorization'] = `Bearer ${this.accessToken}`;

      return this.accessToken;
    } catch (error) {
      logger.error('Failed to get PayPal access token:', error);
      throw error;
    }
  }

  async createOrder(options) {
    await this.getAccessToken();

    const { 
      amount, 
      currency = 'USD', 
      description = '',
      returnUrl,
      cancelUrl,
      metadata = {} 
    } = options;

    try {
      const orderData = {
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: currency,
            value: amount.toFixed(2)
          },
          description: description,
          custom_id: metadata.customId || undefined
        }],
        application_context: {
          return_url: returnUrl,
          cancel_url: cancelUrl,
          brand_name: metadata.brandName || 'Your App',
          landing_page: 'NO_PREFERENCE',
          user_action: 'PAY_NOW'
        }
      };

      const response = await this.client.post('/v2/checkout/orders', orderData);

      return {
        success: true,
        order: {
          id: response.data.id,
          status: response.data.status,
          amount: amount,
          currency: currency,
          approvalUrl: response.data.links.find(link => link.rel === 'approve')?.href,
          captureUrl: response.data.links.find(link => link.rel === 'capture')?.href
        }
      };
    } catch (error) {
      logger.error('Failed to create PayPal order:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async captureOrder(orderId) {
    await this.getAccessToken();

    try {
      const response = await this.client.post(`/v2/checkout/orders/${orderId}/capture`);

      const capture = response.data.purchase_units[0].payments.captures[0];

      return {
        success: true,
        capture: {
          id: capture.id,
          status: capture.status,
          amount: parseFloat(capture.amount.value),
          currency: capture.amount.currency_code,
          orderId: orderId,
          finalCapture: capture.final_capture
        }
      };
    } catch (error) {
      logger.error('Failed to capture PayPal order:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async getOrder(orderId) {
    await this.getAccessToken();

    try {
      const response = await this.client.get(`/v2/checkout/orders/${orderId}`);

      return {
        success: true,
        order: {
          id: response.data.id,
          status: response.data.status,
          amount: parseFloat(response.data.purchase_units[0].amount.value),
          currency: response.data.purchase_units[0].amount.currency_code,
          created: response.data.create_time,
          updated: response.data.update_time
        }
      };
    } catch (error) {
      logger.error('Failed to get PayPal order:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async createSubscription(options) {
    await this.getAccessToken();

    const { 
      planId, 
      subscriberName,
      subscriberEmail,
      returnUrl,
      cancelUrl,
      metadata = {} 
    } = options;

    try {
      const subscriptionData = {
        plan_id: planId,
        subscriber: {
          name: {
            given_name: subscriberName.split(' ')[0],
            surname: subscriberName.split(' ').slice(1).join(' ')
          },
          email_address: subscriberEmail
        },
        application_context: {
          brand_name: metadata.brandName || 'Your App',
          locale: 'en-US',
          shipping_preference: 'NO_SHIPPING',
          user_action: 'SUBSCRIBE_NOW',
          payment_method: {
            payer_selected: 'PAYPAL',
            payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
          },
          return_url: returnUrl,
          cancel_url: cancelUrl
        }
      };

      const response = await this.client.post('/v1/billing/subscriptions', subscriptionData);

      return {
        success: true,
        subscription: {
          id: response.data.id,
          status: response.data.status,
          planId: response.data.plan_id,
          approvalUrl: response.data.links.find(link => link.rel === 'approve')?.href,
          created: response.data.create_time
        }
      };
    } catch (error) {
      logger.error('Failed to create PayPal subscription:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async getSubscription(subscriptionId) {
    await this.getAccessToken();

    try {
      const response = await this.client.get(`/v1/billing/subscriptions/${subscriptionId}`);

      return {
        success: true,
        subscription: {
          id: response.data.id,
          status: response.data.status,
          planId: response.data.plan_id,
          startTime: response.data.start_time,
          quantity: response.data.quantity,
          subscriberName: `${response.data.subscriber.name.given_name} ${response.data.subscriber.name.surname}`,
          subscriberEmail: response.data.subscriber.email_address
        }
      };
    } catch (error) {
      logger.error('Failed to get PayPal subscription:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async cancelSubscription(subscriptionId, reason = 'User requested cancellation') {
    await this.getAccessToken();

    try {
      await this.client.post(`/v1/billing/subscriptions/${subscriptionId}/cancel`, {
        reason: reason
      });

      return {
        success: true,
        subscriptionId: subscriptionId,
        status: 'CANCELLED'
      };
    } catch (error) {
      logger.error('Failed to cancel PayPal subscription:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async createProduct(options) {
    await this.getAccessToken();

    const { name, description, type = 'SERVICE', category = 'SOFTWARE' } = options;

    try {
      const productData = {
        name: name,
        description: description,
        type: type,
        category: category
      };

      const response = await this.client.post('/v1/catalogs/products', productData);

      return {
        success: true,
        product: {
          id: response.data.id,
          name: response.data.name,
          description: response.data.description,
          created: response.data.create_time
        }
      };
    } catch (error) {
      logger.error('Failed to create PayPal product:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async createPlan(options) {
    await this.getAccessToken();

    const { 
      productId, 
      name, 
      description, 
      amount, 
      currency = 'USD',
      interval = 'MONTH',
      intervalCount = 1 
    } = options;

    try {
      const planData = {
        product_id: productId,
        name: name,
        description: description,
        billing_cycles: [{
          frequency: {
            interval_unit: interval, // DAY, WEEK, MONTH, YEAR
            interval_count: intervalCount
          },
          tenure_type: 'REGULAR',
          sequence: 1,
          total_cycles: 0, // 0 means infinite
          pricing_scheme: {
            fixed_price: {
              value: amount.toFixed(2),
              currency_code: currency
            }
          }
        }],
        payment_preferences: {
          auto_bill_outstanding: true,
          setup_fee_failure_action: 'CONTINUE',
          payment_failure_threshold: 3
        }
      };

      const response = await this.client.post('/v1/billing/plans', planData);

      return {
        success: true,
        plan: {
          id: response.data.id,
          productId: response.data.product_id,
          name: response.data.name,
          status: response.data.status,
          created: response.data.create_time
        }
      };
    } catch (error) {
      logger.error('Failed to create PayPal plan:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async createRefund(options) {
    await this.getAccessToken();

    const { captureId, amount = null, currency = 'USD', note = '' } = options;

    try {
      const refundData = {
        note_to_payer: note
      };

      if (amount) {
        refundData.amount = {
          value: amount.toFixed(2),
          currency_code: currency
        };
      }

      const response = await this.client.post(`/v2/payments/captures/${captureId}/refund`, refundData);

      return {
        success: true,
        refund: {
          id: response.data.id,
          status: response.data.status,
          amount: parseFloat(response.data.amount.value),
          currency: response.data.amount.currency_code,
          created: response.data.create_time
        }
      };
    } catch (error) {
      logger.error('Failed to create PayPal refund:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async getPayments(options = {}) {
    await this.getAccessToken();

    const { 
      startTime, 
      endTime, 
      transactionId,
      transactionType = 'T0001', // All transaction types
      pageSize = 10,
      page = 1 
    } = options;

    try {
      const params = new URLSearchParams({
        transaction_type: transactionType,
        page_size: pageSize.toString(),
        page: page.toString()
      });

      if (startTime) params.append('start_date', startTime);
      if (endTime) params.append('end_date', endTime);
      if (transactionId) params.append('transaction_id', transactionId);

      const response = await this.client.get(`/v1/reporting/transactions?${params}`);

      return {
        success: true,
        transactions: response.data.transaction_details?.map(tx => ({
          id: tx.transaction_info.transaction_id,
          status: tx.transaction_info.transaction_status,
          amount: parseFloat(tx.transaction_info.transaction_amount.value),
          currency: tx.transaction_info.transaction_amount.currency_code,
          created: tx.transaction_info.transaction_initiation_date,
          updated: tx.transaction_info.transaction_updated_date
        })) || [],
        totalItems: response.data.total_items,
        totalPages: response.data.total_pages
      };
    } catch (error) {
      logger.error('Failed to get PayPal payments:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async verifyWebhook(headers, body, webhookId) {
    await this.getAccessToken();

    try {
      const verificationData = {
        auth_algo: headers['paypal-auth-algo'],
        cert_id: headers['paypal-cert-id'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: body
      };

      const response = await this.client.post('/v1/notifications/verify-webhook-signature', verificationData);

      return {
        success: true,
        verified: response.data.verification_status === 'SUCCESS'
      };
    } catch (error) {
      logger.error('Failed to verify PayPal webhook:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async createWebhook(options) {
    await this.getAccessToken();

    const { url, eventTypes = [] } = options;

    const defaultEventTypes = [
      'CHECKOUT.ORDER.APPROVED',
      'CHECKOUT.ORDER.COMPLETED',
      'PAYMENT.CAPTURE.COMPLETED',
      'PAYMENT.CAPTURE.DENIED',
      'BILLING.SUBSCRIPTION.CREATED',
      'BILLING.SUBSCRIPTION.ACTIVATED',
      'BILLING.SUBSCRIPTION.CANCELLED'
    ];

    try {
      const webhookData = {
        url: url,
        event_types: (eventTypes.length > 0 ? eventTypes : defaultEventTypes).map(type => ({
          name: type
        }))
      };

      const response = await this.client.post('/v1/notifications/webhooks', webhookData);

      return {
        success: true,
        webhook: {
          id: response.data.id,
          url: response.data.url,
          eventTypes: response.data.event_types.map(et => et.name)
        }
      };
    } catch (error) {
      logger.error('Failed to create PayPal webhook:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  // Configuration methods
  setCredentials(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = null; // Force token refresh
  }

  setMode(mode) {
    this.mode = mode;
    this.baseUrl = mode === 'live' 
      ? 'https://api.paypal.com' 
      : 'https://api.sandbox.paypal.com';
    
    this.client.defaults.baseURL = this.baseUrl;
    this.accessToken = null; // Force token refresh
  }

  setTimeout(timeout) {
    this.timeout = timeout;
    this.client.defaults.timeout = timeout;
  }

  // Helper methods
  isLive() {
    return this.mode === 'live';
  }

  getCheckoutUrl() {
    return this.mode === 'live' 
      ? 'https://www.paypal.com/checkoutnow'
      : 'https://www.sandbox.paypal.com/checkoutnow';
  }

  // Generate PayPal button configuration
  generateButtonConfig(options = {}) {
    const { 
      style = {},
      onApprove,
      onError,
      onCancel 
    } = options;

    const defaultStyle = {
      layout: 'vertical',
      color: 'blue',
      shape: 'rect',
      label: 'paypal'
    };

    return {
      clientId: this.clientId,
      currency: 'USD',
      environment: this.mode,
      style: { ...defaultStyle, ...style },
      onApprove: onApprove,
      onError: onError,
      onCancel: onCancel
    };
  }
}

module.exports = { PayPalIntegration };