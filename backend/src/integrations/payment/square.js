const { Client, Environment } = require('squareup');
const { logger } = require('../../utils/logger');

class SquareIntegration {
  constructor(options = {}) {
    this.accessToken = options.accessToken || process.env.SQUARE_ACCESS_TOKEN;
    this.applicationId = options.applicationId || process.env.SQUARE_APPLICATION_ID;
    this.environment = options.environment || process.env.SQUARE_ENVIRONMENT || 'sandbox';
    this.locationId = options.locationId || process.env.SQUARE_LOCATION_ID;
    this.timeout = options.timeout || 30000;
    
    if (!this.accessToken) {
      throw new Error('Square access token is required');
    }
    
    this.client = new Client({
      accessToken: this.accessToken,
      environment: this.environment === 'production' ? Environment.Production : Environment.Sandbox,
      timeout: this.timeout
    });

    this.paymentsApi = this.client.paymentsApi;
    this.customersApi = this.client.customersApi;
    this.ordersApi = this.client.ordersApi;
    this.catalogApi = this.client.catalogApi;
    this.subscriptionsApi = this.client.subscriptionsApi;
    this.invoicesApi = this.client.invoicesApi;
    this.locationsApi = this.client.locationsApi;
  }

  async createPayment(options) {
    const { 
      amount, 
      currency = 'USD', 
      sourceId, 
      customerId,
      note,
      orderId,
      idempotencyKey = this.generateIdempotencyKey() 
    } = options;

    try {
      const paymentRequest = {
        sourceId: sourceId,
        idempotencyKey: idempotencyKey,
        amountMoney: {
          amount: Math.round(amount * 100), // Convert to cents
          currency: currency
        },
        locationId: this.locationId,
        note: note,
        orderId: orderId,
        customerId: customerId
      };

      const { result } = await this.paymentsApi.createPayment(paymentRequest);

      return {
        success: true,
        payment: {
          id: result.payment.id,
          amount: result.payment.amountMoney.amount / 100,
          currency: result.payment.amountMoney.currency,
          status: result.payment.status,
          sourceType: result.payment.sourceType,
          cardDetails: result.payment.cardDetails ? {
            brand: result.payment.cardDetails.card.cardBrand,
            last4: result.payment.cardDetails.card.last4,
            fingerprint: result.payment.cardDetails.card.fingerprint
          } : null,
          createdAt: result.payment.createdAt,
          updatedAt: result.payment.updatedAt
        }
      };
    } catch (error) {
      logger.error('Failed to create Square payment:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async getPayment(paymentId) {
    try {
      const { result } = await this.paymentsApi.getPayment(paymentId);

      return {
        success: true,
        payment: {
          id: result.payment.id,
          amount: result.payment.amountMoney.amount / 100,
          currency: result.payment.amountMoney.currency,
          status: result.payment.status,
          sourceType: result.payment.sourceType,
          createdAt: result.payment.createdAt,
          updatedAt: result.payment.updatedAt
        }
      };
    } catch (error) {
      logger.error('Failed to get Square payment:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async refundPayment(options) {
    const { 
      paymentId, 
      amount,
      currency = 'USD',
      reason,
      idempotencyKey = this.generateIdempotencyKey() 
    } = options;

    try {
      const refundRequest = {
        idempotencyKey: idempotencyKey,
        amountMoney: {
          amount: Math.round(amount * 100), // Convert to cents
          currency: currency
        },
        paymentId: paymentId,
        reason: reason
      };

      const { result } = await this.paymentsApi.createRefund(refundRequest);

      return {
        success: true,
        refund: {
          id: result.refund.id,
          amount: result.refund.amountMoney.amount / 100,
          currency: result.refund.amountMoney.currency,
          status: result.refund.status,
          paymentId: result.refund.paymentId,
          reason: result.refund.reason,
          createdAt: result.refund.createdAt,
          updatedAt: result.refund.updatedAt
        }
      };
    } catch (error) {
      logger.error('Failed to create Square refund:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async createCustomer(options) {
    const { 
      givenName, 
      familyName, 
      emailAddress, 
      phoneNumber, 
      address,
      note 
    } = options;

    try {
      const customerRequest = {
        givenName: givenName,
        familyName: familyName,
        emailAddress: emailAddress,
        phoneNumber: phoneNumber,
        address: address,
        note: note
      };

      const { result } = await this.customersApi.createCustomer(customerRequest);

      return {
        success: true,
        customer: {
          id: result.customer.id,
          givenName: result.customer.givenName,
          familyName: result.customer.familyName,
          emailAddress: result.customer.emailAddress,
          phoneNumber: result.customer.phoneNumber,
          createdAt: result.customer.createdAt,
          updatedAt: result.customer.updatedAt
        }
      };
    } catch (error) {
      logger.error('Failed to create Square customer:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async getCustomer(customerId) {
    try {
      const { result } = await this.customersApi.retrieveCustomer(customerId);

      return {
        success: true,
        customer: {
          id: result.customer.id,
          givenName: result.customer.givenName,
          familyName: result.customer.familyName,
          emailAddress: result.customer.emailAddress,
          phoneNumber: result.customer.phoneNumber,
          address: result.customer.address,
          createdAt: result.customer.createdAt,
          updatedAt: result.customer.updatedAt
        }
      };
    } catch (error) {
      logger.error('Failed to get Square customer:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async updateCustomer(customerId, updates) {
    try {
      const { result } = await this.customersApi.updateCustomer(customerId, updates);

      return {
        success: true,
        customer: {
          id: result.customer.id,
          givenName: result.customer.givenName,
          familyName: result.customer.familyName,
          emailAddress: result.customer.emailAddress,
          phoneNumber: result.customer.phoneNumber
        }
      };
    } catch (error) {
      logger.error('Failed to update Square customer:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async createOrder(options) {
    const { 
      lineItems, 
      customerId,
      taxes = [],
      discounts = [],
      serviceCharges = [],
      note 
    } = options;

    try {
      const orderRequest = {
        order: {
          locationId: this.locationId,
          lineItems: lineItems.map(item => ({
            name: item.name,
            quantity: item.quantity.toString(),
            basePriceMoney: {
              amount: Math.round(item.price * 100),
              currency: item.currency || 'USD'
            },
            note: item.note
          })),
          customerId: customerId,
          taxes: taxes,
          discounts: discounts,
          serviceCharges: serviceCharges,
          metadata: {
            note: note
          }
        },
        idempotencyKey: this.generateIdempotencyKey()
      };

      const { result } = await this.ordersApi.createOrder(orderRequest);

      return {
        success: true,
        order: {
          id: result.order.id,
          locationId: result.order.locationId,
          state: result.order.state,
          totalMoney: {
            amount: result.order.totalMoney.amount / 100,
            currency: result.order.totalMoney.currency
          },
          createdAt: result.order.createdAt,
          updatedAt: result.order.updatedAt
        }
      };
    } catch (error) {
      logger.error('Failed to create Square order:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async getOrder(orderId) {
    try {
      const { result } = await this.ordersApi.retrieveOrder(orderId);

      return {
        success: true,
        order: {
          id: result.order.id,
          locationId: result.order.locationId,
          state: result.order.state,
          totalMoney: {
            amount: result.order.totalMoney.amount / 100,
            currency: result.order.totalMoney.currency
          },
          lineItems: result.order.lineItems?.map(item => ({
            name: item.name,
            quantity: item.quantity,
            totalMoney: {
              amount: item.totalMoney.amount / 100,
              currency: item.totalMoney.currency
            }
          })) || [],
          createdAt: result.order.createdAt,
          updatedAt: result.order.updatedAt
        }
      };
    } catch (error) {
      logger.error('Failed to get Square order:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async createSubscription(options) {
    const { 
      planId, 
      customerId, 
      cardId,
      startDate,
      timezone = 'America/New_York' 
    } = options;

    try {
      const subscriptionRequest = {
        locationId: this.locationId,
        planId: planId,
        customerId: customerId,
        cardId: cardId,
        startDate: startDate,
        timezone: timezone,
        idempotencyKey: this.generateIdempotencyKey()
      };

      const { result } = await this.subscriptionsApi.createSubscription(subscriptionRequest);

      return {
        success: true,
        subscription: {
          id: result.subscription.id,
          locationId: result.subscription.locationId,
          planId: result.subscription.planId,
          customerId: result.subscription.customerId,
          status: result.subscription.status,
          startDate: result.subscription.startDate,
          createdAt: result.subscription.createdAt
        }
      };
    } catch (error) {
      logger.error('Failed to create Square subscription:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async getSubscription(subscriptionId) {
    try {
      const { result } = await this.subscriptionsApi.retrieveSubscription(subscriptionId);

      return {
        success: true,
        subscription: {
          id: result.subscription.id,
          locationId: result.subscription.locationId,
          planId: result.subscription.planId,
          customerId: result.subscription.customerId,
          status: result.subscription.status,
          startDate: result.subscription.startDate,
          timezone: result.subscription.timezone,
          createdAt: result.subscription.createdAt
        }
      };
    } catch (error) {
      logger.error('Failed to get Square subscription:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async cancelSubscription(subscriptionId) {
    try {
      const { result } = await this.subscriptionsApi.cancelSubscription(subscriptionId);

      return {
        success: true,
        subscription: {
          id: result.subscription.id,
          status: result.subscription.status,
          canceledDate: result.subscription.canceledDate
        }
      };
    } catch (error) {
      logger.error('Failed to cancel Square subscription:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async createInvoice(options) {
    const { 
      customerId, 
      description, 
      amount, 
      currency = 'USD',
      dueDate 
    } = options;

    try {
      const invoiceRequest = {
        invoice: {
          locationId: this.locationId,
          customerId: customerId,
          description: description,
          amountMoney: {
            amount: Math.round(amount * 100),
            currency: currency
          },
          dueDate: dueDate,
          status: 'DRAFT'
        }
      };

      const { result } = await this.invoicesApi.createInvoice(invoiceRequest);

      return {
        success: true,
        invoice: {
          id: result.invoice.id,
          locationId: result.invoice.locationId,
          customerId: result.invoice.customerId,
          description: result.invoice.description,
          status: result.invoice.status,
          totalAmount: result.invoice.totalAmount / 100,
          createdAt: result.invoice.createdAt
        }
      };
    } catch (error) {
      logger.error('Failed to create Square invoice:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async listPayments(options = {}) {
    const { 
      beginTime, 
      endTime, 
      sortOrder = 'DESC',
      cursor,
      locationId = this.locationId 
    } = options;

    try {
      const params = {
        locationId: locationId,
        sortOrder: sortOrder,
        cursor: cursor
      };

      if (beginTime) params.beginTime = beginTime;
      if (endTime) params.endTime = endTime;

      const { result } = await this.paymentsApi.listPayments(params);

      return {
        success: true,
        payments: result.payments?.map(payment => ({
          id: payment.id,
          amount: payment.amountMoney.amount / 100,
          currency: payment.amountMoney.currency,
          status: payment.status,
          createdAt: payment.createdAt
        })) || [],
        cursor: result.cursor
      };
    } catch (error) {
      logger.error('Failed to list Square payments:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async listCustomers(options = {}) {
    const { cursor, limit = 100, sortField = 'DEFAULT', sortOrder = 'ASC' } = options;

    try {
      const params = {
        cursor: cursor,
        limit: limit,
        sortField: sortField,
        sortOrder: sortOrder
      };

      const { result } = await this.customersApi.listCustomers(params);

      return {
        success: true,
        customers: result.customers?.map(customer => ({
          id: customer.id,
          givenName: customer.givenName,
          familyName: customer.familyName,
          emailAddress: customer.emailAddress,
          createdAt: customer.createdAt
        })) || [],
        cursor: result.cursor
      };
    } catch (error) {
      logger.error('Failed to list Square customers:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  async getLocations() {
    try {
      const { result } = await this.locationsApi.listLocations();

      return {
        success: true,
        locations: result.locations?.map(location => ({
          id: location.id,
          name: location.name,
          status: location.status,
          address: location.address,
          timezone: location.timezone,
          capabilities: location.capabilities
        })) || []
      };
    } catch (error) {
      logger.error('Failed to get Square locations:', error);
      return {
        success: false,
        error: error.message,
        errors: error.result?.errors
      };
    }
  }

  // Configuration methods
  setAccessToken(accessToken) {
    this.accessToken = accessToken;
    this.client = new Client({
      accessToken: accessToken,
      environment: this.environment === 'production' ? Environment.Production : Environment.Sandbox,
      timeout: this.timeout
    });
    this._initializeApis();
  }

  setEnvironment(environment) {
    this.environment = environment;
    this.client = new Client({
      accessToken: this.accessToken,
      environment: environment === 'production' ? Environment.Production : Environment.Sandbox,
      timeout: this.timeout
    });
    this._initializeApis();
  }

  setLocationId(locationId) {
    this.locationId = locationId;
  }

  setTimeout(timeout) {
    this.timeout = timeout;
    this.client = new Client({
      accessToken: this.accessToken,
      environment: this.environment === 'production' ? Environment.Production : Environment.Sandbox,
      timeout: timeout
    });
    this._initializeApis();
  }

  _initializeApis() {
    this.paymentsApi = this.client.paymentsApi;
    this.customersApi = this.client.customersApi;
    this.ordersApi = this.client.ordersApi;
    this.catalogApi = this.client.catalogApi;
    this.subscriptionsApi = this.client.subscriptionsApi;
    this.invoicesApi = this.client.invoicesApi;
    this.locationsApi = this.client.locationsApi;
  }

  // Helper methods
  generateIdempotencyKey() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  formatAmount(amount) {
    return Math.round(amount * 100); // Convert dollars to cents
  }

  parseAmount(amount) {
    return amount / 100; // Convert cents to dollars
  }

  isProduction() {
    return this.environment === 'production';
  }

  // Generate Square Web Payments SDK configuration
  generateWebPaymentsConfig(options = {}) {
    const { style = {} } = options;

    const defaultStyle = {
      '.input-container': {
        borderColor: '#ECEFF1',
        borderRadius: '6px'
      },
      '.input-container.is-focus': {
        borderColor: '#4A90E2'
      },
      '.input-container.is-error': {
        borderColor: '#FF6B6B'
      },
      '.message-text': {
        color: '#999999'
      },
      '.message-text.is-error': {
        color: '#FF6B6B'
      }
    };

    return {
      applicationId: this.applicationId,
      locationId: this.locationId,
      environment: this.environment,
      style: { ...defaultStyle, ...style }
    };
  }

  // Webhook signature verification
  verifyWebhookSignature(body, signature, signatureKey, notificationUrl) {
    try {
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', signatureKey);
      hmac.update(notificationUrl + body);
      const hash = hmac.digest('base64');
      
      return hash === signature;
    } catch (error) {
      logger.error('Failed to verify Square webhook signature:', error);
      return false;
    }
  }
}

module.exports = { SquareIntegration };