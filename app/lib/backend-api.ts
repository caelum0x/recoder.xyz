/**
 * Backend API Client
 * Handles authenticated requests to the backend API
 */

import { logger } from '@/lib/logger';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' ? 'https://docker.recoder.xyz' : 'http://localhost:3100');

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  interval: string;
  features: string[];
}

export interface Subscription {
  id: string;
  planId: string;
  planName: string;
  status: 'active' | 'cancelled' | 'past_due' | 'trialing' | 'pending' | 'cancelled_at_period_end';
  amount: number;
  currency: string;
  nextBillingDate?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  createdAt?: string;
}

export interface CreateSubscriptionRequest {
  planId: string;
  billingAddress: {
    country: string;
    state: string;
    city: string;
    street: string;
    zipcode: string;
  };
  returnUrl?: string;
}

class BackendApiClient {
  private baseUrl: string;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(baseUrl: string = BACKEND_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get JWT token for backend authentication
   */
  private async getToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }

    // Get new token from our token endpoint
    const response = await fetch('/api/auth/token', {
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to get authentication token');
    }

    const data = await response.json();

    // Cache token for 14 minutes (token expires in 15 minutes)
    this.tokenCache = {
      token: data.accessToken,
      expiresAt: Date.now() + 14 * 60 * 1000,
    };

    return data.accessToken;
  }

  /**
   * Make an authenticated request to the backend API
   */
  private async request<T = unknown>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    // Get authentication token
    const token = await this.getToken();

    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // ============ Subscription Plans ============

  /**
   * Get available subscription plans
   */
  async getPlans(): Promise<SubscriptionPlan[]> {
    const result = await this.request<{ success: boolean; plans: SubscriptionPlan[] }>(
      '/api/subscriptions/plans'
    );
    return result.plans || [];
  }

  // ============ Subscriptions ============

  /**
   * Create a new subscription
   */
  async createSubscription(data: CreateSubscriptionRequest): Promise<{
    id: string;
    paymentLink: string;
    amount: number;
    planId: string;
  }> {
    const result = await this.request<{
      success: boolean;
      subscription: {
        id: string;
        paymentLink: string;
        amount: number;
        planId: string;
      };
    }>('/api/subscriptions/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (!result.success) {
      throw new Error('Failed to create subscription');
    }

    return result.subscription;
  }

  /**
   * Get user's subscriptions
   */
  async getSubscriptions(): Promise<Subscription[]> {
    const result = await this.request<{
      success: boolean;
      subscriptions: Subscription[];
    }>('/api/subscriptions');

    return result.subscriptions || [];
  }

  /**
   * Get subscription by ID
   */
  async getSubscription(id: string): Promise<Subscription> {
    const result = await this.request<{
      success: boolean;
      subscription: Subscription;
    }>(`/api/subscriptions/${id}`);

    if (!result.success) {
      throw new Error('Subscription not found');
    }

    return result.subscription;
  }

  /**
   * Change subscription plan
   */
  async changePlan(subscriptionId: string, newPlanId: string): Promise<void> {
    const result = await this.request<{ success: boolean; message: string }>(
      `/api/subscriptions/${subscriptionId}/change-plan`,
      {
        method: 'POST',
        body: JSON.stringify({ newPlanId }),
      }
    );

    if (!result.success) {
      throw new Error(result.message || 'Failed to change plan');
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    cancelAtPeriodEnd: boolean = true
  ): Promise<void> {
    const result = await this.request<{ success: boolean; message: string }>(
      `/api/subscriptions/${subscriptionId}/cancel`,
      {
        method: 'POST',
        body: JSON.stringify({ cancelAtPeriodEnd }),
      }
    );

    if (!result.success) {
      throw new Error(result.message || 'Failed to cancel subscription');
    }
  }

  /**
   * Reactivate cancelled subscription
   */
  async reactivateSubscription(subscriptionId: string): Promise<void> {
    const result = await this.request<{ success: boolean; message: string }>(
      `/api/subscriptions/${subscriptionId}/reactivate`,
      {
        method: 'POST',
      }
    );

    if (!result.success) {
      throw new Error(result.message || 'Failed to reactivate subscription');
    }
  }

  // ============ Subscription Management (Alternative endpoints) ============

  /**
   * Get current subscription (alternative endpoint)
   */
  async getCurrentSubscription(): Promise<Subscription | null> {
    try {
      const result = await this.request<{
        hasSubscription: boolean;
        subscription?: Subscription;
        plan?: string;
      }>('/api/subscriptions/current');

      if (!result.hasSubscription) {
        return null;
      }

      return result.subscription || null;
    } catch (error) {
      logger.error('Error getting current subscription', { error: String(error) });
      return null;
    }
  }

  /**
   * Change plan (alternative endpoint)
   */
  async changePlanAlt(planId: string): Promise<Subscription> {
    const result = await this.request<{
      success: boolean;
      subscription: Subscription;
      message: string;
    }>('/api/subscriptions/change-plan', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    });

    if (!result.success) {
      throw new Error(result.message || 'Failed to change plan');
    }

    return result.subscription;
  }

  /**
   * Cancel subscription (alternative endpoint)
   */
  async cancelSubscriptionAlt(reason?: string, cancelImmediately: boolean = false): Promise<void> {
    const result = await this.request<{
      success: boolean;
      message: string;
    }>('/api/subscriptions/cancel', {
      method: 'POST',
      body: JSON.stringify({ reason, cancelImmediately }),
    });

    if (!result.success) {
      throw new Error(result.message || 'Failed to cancel subscription');
    }
  }

  /**
   * Reactivate subscription (alternative endpoint)
   */
  async reactivateSubscriptionAlt(): Promise<void> {
    const result = await this.request<{
      success: boolean;
      message: string;
    }>('/api/subscriptions/reactivate', {
      method: 'POST',
    });

    if (!result.success) {
      throw new Error(result.message || 'Failed to reactivate subscription');
    }
  }

  // ============ User Management ============

  /**
   * Get current user profile
   */
  async getUserProfile(): Promise<unknown> {
    return this.request('/api/user/profile');
  }

  /**
   * Update user profile
   */
  async updateUserProfile(data: Record<string, unknown>): Promise<unknown> {
    return this.request('/api/user/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get user API keys
   */
  async getUserApiKeys(): Promise<unknown[]> {
    const result = await this.request<{ apiKeys: unknown[] }>('/api/user/keys');
    return result.apiKeys || [];
  }

  /**
   * Create new API key
   */
  async createApiKey(data: { name: string; scopes?: string[] }): Promise<unknown> {
    return this.request('/api/user/keys', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(keyId: string): Promise<void> {
    await this.request(`/api/user/keys/${keyId}`, {
      method: 'DELETE',
    });
  }

  // ============ Usage & Analytics ============

  /**
   * Get usage statistics
   */
  async getUsageStats(params?: { startDate?: string; endDate?: string }): Promise<unknown> {
    const queryParams = params ? new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] != null)).toString() : '';
    return this.request(`/api/usage/stats${queryParams ? '?' + queryParams : ''}`);
  }

  /**
   * Get usage history
   */
  async getUsageHistory(params?: { page?: number; limit?: number }): Promise<unknown> {
    const queryParams = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : '';
    return this.request(`/api/usage/history${queryParams ? '?' + queryParams : ''}`);
  }

  /**
   * Export usage data
   */
  async exportUsage(format: 'csv' | 'json' = 'csv'): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/usage/export?format=${format}`, {
      headers: {
        'Authorization': `Bearer ${await this.getToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to export usage data');
    }

    return response.blob();
  }

  // ============ Billing ============

  /**
   * Get billing invoices
   */
  async getInvoices(params?: { page?: number; limit?: number }): Promise<unknown> {
    const queryParams = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : '';
    return this.request(`/api/billing/invoices${queryParams ? '?' + queryParams : ''}`);
  }

  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: string): Promise<unknown> {
    return this.request(`/api/billing/invoices/${invoiceId}`);
  }

  /**
   * Download invoice
   */
  async downloadInvoice(invoiceId: string): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/billing/invoices/${invoiceId}/download`, {
      headers: {
        'Authorization': `Bearer ${await this.getToken()}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download invoice');
    }

    return response.blob();
  }

  /**
   * Get payment methods
   */
  async getPaymentMethods(): Promise<unknown[]> {
    const result = await this.request<{ paymentMethods: unknown[] }>('/api/billing/payment-methods');
    return result.paymentMethods || [];
  }

  /**
   * Add payment method
   */
  async addPaymentMethod(data: Record<string, unknown>): Promise<unknown> {
    return this.request('/api/billing/payment-methods', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Set default payment method
   */
  async setDefaultPaymentMethod(methodId: string): Promise<void> {
    await this.request(`/api/billing/payment-methods/${methodId}/set-default`, {
      method: 'POST',
    });
  }

  /**
   * Delete payment method
   */
  async deletePaymentMethod(methodId: string): Promise<void> {
    await this.request(`/api/billing/payment-methods/${methodId}`, {
      method: 'DELETE',
    });
  }

  // ============ Dashboard & Overview ============

  /**
   * Get dashboard overview data
   */
  async getDashboardOverview(): Promise<unknown> {
    return this.request('/api/dashboard/overview');
  }

  /**
   * Get dashboard analytics
   */
  async getDashboardAnalytics(params?: { period?: string }): Promise<unknown> {
    const queryParams = params ? new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => e[1] != null)).toString() : '';
    return this.request(`/api/dashboard/analytics${queryParams ? '?' + queryParams : ''}`);
  }

  // ============ AI Usage ============

  /**
   * Track AI request
   */
  async trackAIRequest(data: {
    model: string;
    tokensUsed: number;
    cost: number;
    endpoint: string;
    success: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.request('/api/usage/track', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get available AI models
   */
  async getAIModels(): Promise<unknown[]> {
    const result = await this.request<{ models: unknown[] }>('/api/ai-providers/models');
    return result.models || [];
  }

  /**
   * Get usage limits for current plan
   */
  async getUsageLimits(): Promise<unknown> {
    return this.request('/api/subscriptions/usage-limits');
  }
}

// Export singleton instance
export const backendApi = new BackendApiClient();
