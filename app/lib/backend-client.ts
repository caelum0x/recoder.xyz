/**
 * Backend API Client
 * Centralized client for making requests to the Express backend
 */

import { logger } from '@/lib/logger';

const BACKEND_URL = process.env.BACKEND_URL || (process.env.NODE_ENV === 'production' ? 'https://docker.recoder.xyz' : 'http://localhost:3001');
const BACKEND_API_KEY = process.env.BACKEND_API_KEY || (process.env.NODE_ENV === 'production' ? '' : 'dev-internal-key');

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  userId?: string;
  userEmail?: string;
  cache?: RequestCache;
}

export class BackendClient {
  private baseURL: string;
  private apiKey: string;

  constructor() {
    this.baseURL = BACKEND_URL;
    this.apiKey = BACKEND_API_KEY;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      body,
      headers = {},
      userId,
      userEmail,
      cache = 'no-store'
    } = options;

    const url = `${this.baseURL}${endpoint}`;
    
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Internal-API-Key': this.apiKey,
      ...headers
    };

    if (userId) {
      requestHeaders['X-User-ID'] = userId;
    }

    if (userEmail) {
      requestHeaders['X-User-Email'] = userEmail;
    }

    const config: RequestInit = {
      method,
      headers: requestHeaders,
      cache
    };

    if (body && method !== 'GET') {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(error.message || `Backend request failed: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      logger.error('Backend request failed', { endpoint: String(endpoint), error: String(error) });
      throw error;
    }
  }

  // API Keys Management
  async getApiKeys(userId: string) {
    return this.request('/api/premium/api-keys', { userId });
  }

  async createApiKey(userId: string, userEmail: string, data: {
    name: string;
    permissions?: string[];
    expiresIn?: number;
    rateLimit?: number;
  }) {
    return this.request('/api/premium/api-key', {
      method: 'POST',
      body: data,
      userId,
      userEmail
    });
  }

  async revokeApiKey(userId: string, keyId: string) {
    return this.request(`/api/premium/api-key/${keyId}`, {
      method: 'DELETE',
      userId
    });
  }

  async updateApiKey(userId: string, keyId: string, data: any) {
    return this.request(`/api/premium/api-key/${keyId}`, {
      method: 'PATCH',
      body: data,
      userId
    });
  }

  // Usage Tracking
  async trackUsage(userId: string, data: {
    model: string;
    tokensUsed: number;
    inputTokens: number;
    outputTokens: number;
    cost: number;
    source: string;
    requestType: string;
  }) {
    return this.request('/api/usage/track', {
      method: 'POST',
      body: data,
      userId
    });
  }

  async getUsageStats(userId: string, period?: string) {
    const query = period ? `?period=${period}` : '';
    return this.request(`/api/usage/stats${query}`, { userId });
  }

  async getUserQuota(userId: string) {
    return this.request(`/api/usage/quota/${userId}`, { userId });
  }

  // Subscription Management
  async getSubscription(userId: string) {
    return this.request(`/api/subscription/${userId}`, { userId });
  }

  async updateSubscription(userId: string, data: {
    plan?: string;
    status?: string;
    currentPeriodEnd?: Date;
  }) {
    return this.request(`/api/subscription/${userId}`, {
      method: 'PATCH',
      body: data,
      userId
    });
  }

  async cancelSubscription(userId: string) {
    return this.request(`/api/subscription/${userId}/cancel`, {
      method: 'POST',
      userId
    });
  }

  // Device Management
  async getDevices(userId: string) {
    return this.request(`/api/devices/${userId}`, { userId });
  }

  async registerDevice(userId: string, data: {
    deviceId: string;
    deviceName: string;
    deviceType: string;
    userAgent?: string;
    ipAddress?: string;
  }) {
    return this.request('/api/devices', {
      method: 'POST',
      body: data,
      userId
    });
  }

  async revokeDevice(userId: string, deviceId: string) {
    return this.request(`/api/devices/${deviceId}`, {
      method: 'DELETE',
      userId
    });
  }

  // Cost Tracking
  async getCostAnalytics(userId: string, period: string) {
    return this.request(`/api/analytics/costs?period=${period}`, { userId });
  }

  // Health Check
  async health() {
    return this.request('/health');
  }
}

// Export singleton instance
export const backendClient = new BackendClient();
