/**
 * Polar.sh API Client
 * Handles all interactions with the Polar.sh payment platform API
 *
 * @see https://docs.polar.sh/api
 */

import {
  BillingError,
  BillingErrorCodes,
  type CreateCheckoutRequest,
  type CreateCheckoutResponse,
  type Invoice,
  type PaginatedResponse,
  type PolarCheckout,
  type PolarCustomer,
  type PolarProduct,
  type PolarSubscription,
  type ReportUsageRequest,
} from './types';

// ==================== Configuration ====================

const POLAR_API_BASE = 'https://api.polar.sh/v1';

/**
 * Get Polar access token from environment
 * In browser context, this calls our backend API
 * In server context, this uses the environment variable
 */
function getPolarAccessToken(): string | null {
  if (typeof window !== 'undefined') {
    // Client-side: will use backend proxy
    return null;
  }
  return import.meta.env?.POLAR_ACCESS_TOKEN || process.env.POLAR_ACCESS_TOKEN || null;
}

// ==================== HTTP Helpers ====================

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Make an authenticated request to Polar.sh API
 */
async function polarFetch<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, timeout = 30000 } = options;

  const accessToken = getPolarAccessToken();
  if (!accessToken) {
    throw new BillingError(
      'Polar access token not configured',
      BillingErrorCodes.API_ERROR
    );
  }

  const url = `${POLAR_API_BASE}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as Record<string, any>;
      throw new BillingError(
        errorData.message || `Polar API error: ${response.status}`,
        BillingErrorCodes.API_ERROR,
        { status: response.status, ...errorData }
      );
    }

    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof BillingError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new BillingError(
        'Request timed out',
        BillingErrorCodes.NETWORK_ERROR
      );
    }

    throw new BillingError(
      error instanceof Error ? error.message : 'Network error',
      BillingErrorCodes.NETWORK_ERROR
    );
  }
}

// ==================== Customer API ====================

/**
 * Create a new Polar customer
 */
export async function createCustomer(params: {
  email: string;
  name?: string;
  metadata?: Record<string, unknown>;
}): Promise<PolarCustomer> {
  const response = await polarFetch<PolarCustomer>('/customers', {
    method: 'POST',
    body: params,
  });

  return {
    ...response,
    createdAt: new Date(response.createdAt),
  };
}

/**
 * Get a customer by ID
 */
export async function getCustomer(customerId: string): Promise<PolarCustomer> {
  const response = await polarFetch<PolarCustomer>(`/customers/${customerId}`);

  return {
    ...response,
    createdAt: new Date(response.createdAt),
  };
}

/**
 * Get customer by email
 */
export async function getCustomerByEmail(email: string): Promise<PolarCustomer | null> {
  try {
    const response = await polarFetch<PaginatedResponse<PolarCustomer>>(
      `/customers?email=${encodeURIComponent(email)}&limit=1`
    );

    if (response.items.length === 0) {
      return null;
    }

    return {
      ...response.items[0],
      createdAt: new Date(response.items[0].createdAt),
    };
  } catch (error) {
    if (error instanceof BillingError && error.details?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Update customer metadata
 */
export async function updateCustomer(
  customerId: string,
  updates: { name?: string; metadata?: Record<string, unknown> }
): Promise<PolarCustomer> {
  const response = await polarFetch<PolarCustomer>(`/customers/${customerId}`, {
    method: 'PATCH',
    body: updates,
  });

  return {
    ...response,
    createdAt: new Date(response.createdAt),
  };
}

// ==================== Product API ====================

/**
 * List all products
 */
export async function listProducts(params?: {
  limit?: number;
  page?: number;
}): Promise<PaginatedResponse<PolarProduct>> {
  const queryParams = new URLSearchParams();
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.page) queryParams.set('page', params.page.toString());

  const query = queryParams.toString();
  const endpoint = query ? `/products?${query}` : '/products';

  const response = await polarFetch<PaginatedResponse<PolarProduct>>(endpoint);

  return {
    ...response,
    items: response.items.map(product => ({
      ...product,
      createdAt: new Date(product.createdAt),
    })),
  };
}

/**
 * Get a product by ID
 */
export async function getProduct(productId: string): Promise<PolarProduct> {
  const response = await polarFetch<PolarProduct>(`/products/${productId}`);

  return {
    ...response,
    createdAt: new Date(response.createdAt),
  };
}

// ==================== Subscription API ====================

/**
 * Get a subscription by ID
 */
export async function getSubscription(subscriptionId: string): Promise<PolarSubscription> {
  const response = await polarFetch<PolarSubscription>(
    `/subscriptions/${subscriptionId}`
  );

  return normalizeSubscription(response);
}

/**
 * List subscriptions for a customer
 */
export async function listSubscriptions(params: {
  customerId: string;
  status?: string;
  limit?: number;
  page?: number;
}): Promise<PaginatedResponse<PolarSubscription>> {
  const queryParams = new URLSearchParams();
  queryParams.set('customer_id', params.customerId);
  if (params.status) queryParams.set('status', params.status);
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.page) queryParams.set('page', params.page.toString());

  const response = await polarFetch<PaginatedResponse<PolarSubscription>>(
    `/subscriptions?${queryParams.toString()}`
  );

  return {
    ...response,
    items: response.items.map(normalizeSubscription),
  };
}

/**
 * Cancel a subscription
 */
export async function cancelSubscription(params: {
  subscriptionId: string;
  cancelAtPeriodEnd?: boolean;
}): Promise<PolarSubscription> {
  const { subscriptionId, cancelAtPeriodEnd = true } = params;

  const response = await polarFetch<PolarSubscription>(
    `/subscriptions/${subscriptionId}`,
    {
      method: 'DELETE',
      body: { cancel_at_period_end: cancelAtPeriodEnd },
    }
  );

  return normalizeSubscription(response);
}

/**
 * Update subscription (e.g., change plan)
 */
export async function updateSubscription(
  subscriptionId: string,
  updates: {
    productId?: string;
    priceId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<PolarSubscription> {
  const response = await polarFetch<PolarSubscription>(
    `/subscriptions/${subscriptionId}`,
    {
      method: 'PATCH',
      body: {
        product_id: updates.productId,
        price_id: updates.priceId,
        metadata: updates.metadata,
      },
    }
  );

  return normalizeSubscription(response);
}

// ==================== Checkout API ====================

/**
 * Create a checkout session
 */
export async function createCheckout(
  params: CreateCheckoutRequest
): Promise<CreateCheckoutResponse> {
  const response = await polarFetch<PolarCheckout>('/checkouts/custom', {
    method: 'POST',
    body: {
      product_id: params.productId,
      price_id: params.priceId,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      customer_email: params.customerEmail,
      customer_id: params.customerId,
      metadata: params.metadata,
    },
  });

  return {
    checkoutId: response.id,
    checkoutUrl: response.url,
    expiresAt: new Date(response.expiresAt),
  };
}

/**
 * Get a checkout session
 */
export async function getCheckout(checkoutId: string): Promise<PolarCheckout> {
  const response = await polarFetch<PolarCheckout>(`/checkouts/${checkoutId}`);

  return {
    ...response,
    expiresAt: new Date(response.expiresAt),
    createdAt: new Date(response.createdAt),
    confirmedAt: response.confirmedAt ? new Date(response.confirmedAt) : undefined,
  };
}

// ==================== Invoice API ====================

/**
 * List invoices for a customer
 */
export async function listInvoices(params: {
  customerId: string;
  status?: string;
  limit?: number;
  page?: number;
}): Promise<PaginatedResponse<Invoice>> {
  const queryParams = new URLSearchParams();
  queryParams.set('customer_id', params.customerId);
  if (params.status) queryParams.set('status', params.status);
  if (params.limit) queryParams.set('limit', params.limit.toString());
  if (params.page) queryParams.set('page', params.page.toString());

  const response = await polarFetch<PaginatedResponse<Invoice>>(
    `/invoices?${queryParams.toString()}`
  );

  return {
    ...response,
    items: response.items.map(normalizeInvoice),
  };
}

/**
 * Get an invoice by ID
 */
export async function getInvoice(invoiceId: string): Promise<Invoice> {
  const response = await polarFetch<Invoice>(`/invoices/${invoiceId}`);
  return normalizeInvoice(response);
}

// ==================== Usage API ====================

/**
 * Report usage for metered billing
 */
export async function reportUsage(params: ReportUsageRequest): Promise<void> {
  await polarFetch('/usage', {
    method: 'POST',
    body: {
      subscription_id: params.subscriptionId,
      usage_type: params.usageType,
      quantity: params.quantity,
      timestamp: params.timestamp?.toISOString() || new Date().toISOString(),
      metadata: params.metadata,
    },
  });
}

/**
 * Get usage summary for a subscription
 */
export async function getUsageSummary(params: {
  subscriptionId: string;
  periodStart?: Date;
  periodEnd?: Date;
}): Promise<Record<string, number>> {
  const queryParams = new URLSearchParams();
  queryParams.set('subscription_id', params.subscriptionId);
  if (params.periodStart) {
    queryParams.set('period_start', params.periodStart.toISOString());
  }
  if (params.periodEnd) {
    queryParams.set('period_end', params.periodEnd.toISOString());
  }

  const response = await polarFetch<Record<string, number>>(
    `/usage/summary?${queryParams.toString()}`
  );

  return response;
}

// ==================== Webhook Verification ====================

/**
 * Verify webhook signature (server-side only)
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  webhookSecret: string
): boolean {
  // Polar.sh uses HMAC-SHA256 for webhook signatures
  // This should be called server-side where crypto is available
  if (typeof window !== 'undefined') {
    throw new Error('Webhook verification must be done server-side');
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ==================== Helper Functions ====================

/**
 * Normalize subscription response
 */
function normalizeSubscription(sub: PolarSubscription): PolarSubscription {
  return {
    ...sub,
    currentPeriodStart: new Date(sub.currentPeriodStart),
    currentPeriodEnd: new Date(sub.currentPeriodEnd),
    canceledAt: sub.canceledAt ? new Date(sub.canceledAt) : undefined,
    endedAt: sub.endedAt ? new Date(sub.endedAt) : undefined,
    trialStart: sub.trialStart ? new Date(sub.trialStart) : undefined,
    trialEnd: sub.trialEnd ? new Date(sub.trialEnd) : undefined,
    createdAt: new Date(sub.createdAt),
    customer: sub.customer ? {
      ...sub.customer,
      createdAt: new Date(sub.customer.createdAt),
    } : undefined,
    product: sub.product ? {
      ...sub.product,
      createdAt: new Date(sub.product.createdAt),
    } : undefined,
  };
}

/**
 * Normalize invoice response
 */
function normalizeInvoice(invoice: Invoice): Invoice {
  return {
    ...invoice,
    periodStart: new Date(invoice.periodStart),
    periodEnd: new Date(invoice.periodEnd),
    dueDate: invoice.dueDate ? new Date(invoice.dueDate) : undefined,
    paidAt: invoice.paidAt ? new Date(invoice.paidAt) : undefined,
    createdAt: new Date(invoice.createdAt),
  };
}

// ==================== Client Class ====================

/**
 * Polar.sh API client class for object-oriented usage
 */
export class PolarClient {
  private organizationId?: string;

  constructor(options?: { organizationId?: string }) {
    this.organizationId = options?.organizationId;
  }

  // Customer methods
  createCustomer = createCustomer;
  getCustomer = getCustomer;
  getCustomerByEmail = getCustomerByEmail;
  updateCustomer = updateCustomer;

  // Product methods
  listProducts = listProducts;
  getProduct = getProduct;

  // Subscription methods
  getSubscription = getSubscription;
  listSubscriptions = listSubscriptions;
  cancelSubscription = cancelSubscription;
  updateSubscription = updateSubscription;

  // Checkout methods
  createCheckout = createCheckout;
  getCheckout = getCheckout;

  // Invoice methods
  listInvoices = listInvoices;
  getInvoice = getInvoice;

  // Usage methods
  reportUsage = reportUsage;
  getUsageSummary = getUsageSummary;
}

// Export default singleton instance
export const polarClient = new PolarClient();
