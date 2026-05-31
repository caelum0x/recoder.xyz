/**
 * API Client for frontend
 * Handles all API calls to the backend
 */

const API_BASE_URL =
  typeof window !== 'undefined'
    ? ''
    : process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || 'https://api.recoder.xyz';

export interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  successRate: number;
  trend: {
    requests: number;
    tokens: number;
    cost: number;
  };
}

export interface DailyUsage {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface ModelBreakdown {
  model: string;
  requests: number;
  tokens: number;
  cost: number;
  percentage: number;
}

export interface RecentActivity {
  id: number;
  model: string;
  tokens: number;
  cost: number;
  time: string;
  status: 'success' | 'error';
}

export interface UsageResponse {
  overview: UsageStats;
  dailyUsage: DailyUsage[];
  modelBreakdown: ModelBreakdown[];
  recentActivity: RecentActivity[];
}

interface UsageRecord {
  timestamp: string;
  model?: string;
  tokens?: number;
  cost?: number;
  platform?: string;
  status?: string;
}

interface UsageHistoryResponse {
  records: UsageRecord[];
  summary: { totalRecords: number; totalTokens: number; totalCost: number };
}

class ApiClient {
  private baseUrl: string;
  
  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    // Get auth token from localStorage or cookies
    const token = typeof window !== 'undefined' 
      ? localStorage.getItem('auth_token') 
      : null;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      credentials: options.credentials ?? 'include',
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data || data;
  }

  /**
   * Get usage analytics - uses real user data with Redis caching
   */
  async getUsageAnalytics(timeRange: string = '7d', model?: string) {
    // Try cache first (server-side only)
    if (typeof window === 'undefined') {
      const { CacheService } = await import('./redis-cache');
      const userId = this.getCurrentUserId();
      if (userId) {
        const cached = await CacheService.getAnalytics(userId, timeRange, model);
        if (cached) return cached;
      }
    }

    // Use existing /api/usage/history endpoint for real data
    const endDate = new Date().toISOString();
    const startDate = new Date();
    
    switch (timeRange) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    const params = new URLSearchParams({
      startDate: startDate.toISOString(),
      endDate: endDate,
      limit: '1000'
    });
    
    if (model && model !== 'all') {
      params.append('model', model);
    }

    const response = await this.request<UsageHistoryResponse>(`/api/usage/history?${params}`);

    // Transform real data into expected format
    const records = response.records || [];
    const summary = response.summary || { totalRecords: 0, totalTokens: 0, totalCost: 0 };
    
    // Calculate aggregations from real data
    const dailyUsage = this.aggregateByDay(records);
    const modelBreakdown = this.aggregateByModel(records);
    const platformBreakdown = this.aggregateByPlatform(records);
    
    const analytics = {
      overview: {
        totalRequests: summary.totalRecords,
        totalTokens: summary.totalTokens,
        totalCost: summary.totalCost,
        averageCostPerRequest: summary.totalRecords > 0 ? summary.totalCost / summary.totalRecords : 0,
        currentPlan: 'free',
        quotaStatus: 'normal'
      },
      detailed: {
        weeklyTrend: dailyUsage,
        topModels: modelBreakdown,
        platformBreakdown: platformBreakdown,
        featureUsage: {}
      },
      projections: {
        projectedMonthlyCost: this.calculateProjectedCost(records, timeRange),
        projectedAnnualCost: this.calculateProjectedCost(records, timeRange) * 12,
        costTrend: 'stable',
        recommendations: this.generateRecommendations(records)
      }
    };

    // Cache the result (server-side only)
    if (typeof window === 'undefined') {
      const { CacheService } = await import('./redis-cache');
      const userId = this.getCurrentUserId();
      if (userId) {
        await CacheService.setAnalytics(userId, timeRange, analytics, model);
      }
    }

    return analytics;
  }

  private getCurrentUserId(): string | null {
    // This would get the current user ID from auth context
    return null; // Placeholder
  }

  /**
   * Get real-time usage stats from existing API
   */
  async getUsageStats() {
    // Use today's data from existing API
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    const params = new URLSearchParams({
      startDate: startOfDay.toISOString(),
      endDate: new Date().toISOString(),
      limit: '1000'
    });

    const response = await this.request<UsageHistoryResponse>(`/api/usage/history?${params}`);
    const records = response.records || [];

    return {
      totalRequests: records.length,
      totalTokens: records.reduce((sum: number, r: UsageRecord) => sum + (r.tokens || 0), 0),
      totalCost: records.reduce((sum: number, r: UsageRecord) => sum + (r.cost || 0), 0),
      averageLatency: 0, // Not tracked in current schema
      successRate: 100, // Assume success if recorded
      trend: {
        requests: records.length,
        tokens: records.reduce((sum: number, r: UsageRecord) => sum + (r.tokens || 0), 0),
        cost: records.reduce((sum: number, r: UsageRecord) => sum + (r.cost || 0), 0)
      }
    };
  }

  /**
   * Get cost breakdown from real data
   */
  async getCostBreakdown(period: 'day' | 'week' | 'month' = 'month') {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    const params = new URLSearchParams({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      limit: '1000'
    });

    const response = await this.request<UsageHistoryResponse>(`/api/usage/history?${params}`);
    const records = response.records || [];

    return this.aggregateByModel(records);
  }

  /**
   * Get usage history - direct passthrough to existing API
   */
  async getUsageHistory(params: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) {
    const searchParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });

    return this.request<UsageHistoryResponse>(`/api/usage/history?${searchParams}`);
  }

  // Helper methods for data aggregation
  private aggregateByDay(records: UsageRecord[]) {
    const dayMap = new Map();
    
    records.forEach(record => {
      const day = new Date(record.timestamp).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      
      if (!dayMap.has(day)) {
        dayMap.set(day, { day, requests: 0, cost: 0 });
      }
      
      const dayData = dayMap.get(day);
      dayData.requests += 1;
      dayData.cost += record.cost || 0;
    });
    
    return Array.from(dayMap.values()).slice(-7); // Last 7 days
  }

  private aggregateByModel(records: UsageRecord[]) {
    const modelMap = new Map();
    const totalRecords = records.length;
    
    records.forEach(record => {
      const model = record.model || 'unknown';
      
      if (!modelMap.has(model)) {
        modelMap.set(model, { 
          model, 
          usage: 0, 
          cost: 0, 
          efficiency: 0,
          requests: 0 
        });
      }
      
      const modelData = modelMap.get(model);
      modelData.requests += 1;
      modelData.cost += record.cost || 0;
      modelData.usage = totalRecords > 0 ? (modelData.requests / totalRecords) * 100 : 0;
    });
    
    return Array.from(modelMap.values())
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5); // Top 5 models
  }

  private aggregateByPlatform(records: UsageRecord[]) {
    const platformMap = new Map();
    const totalRecords = records.length;
    
    records.forEach(record => {
      const platform = record.platform || 'unknown';
      
      if (!platformMap.has(platform)) {
        platformMap.set(platform, { 
          platform, 
          requests: 0, 
          cost: 0, 
          tokens: 0,
          percentage: 0 
        });
      }
      
      const platformData = platformMap.get(platform);
      platformData.requests += 1;
      platformData.cost += record.cost || 0;
      platformData.tokens += record.tokens || 0;
      platformData.percentage = totalRecords > 0 ? (platformData.requests / totalRecords) * 100 : 0;
    });
    
    return Array.from(platformMap.values())
      .sort((a, b) => b.requests - a.requests);
  }

  private calculateProjectedCost(records: UsageRecord[], timeRange: string): number {
    if (records.length === 0) return 0;
    
    const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const dailyAverage = totalCost / days;
    
    return dailyAverage * 30; // Project to monthly
  }

  private generateRecommendations(records: UsageRecord[]): string[] {
    const recommendations = [];
    
    if (records.length === 0) {
      return ['Start using the platform to get personalized recommendations'];
    }
    
    const modelUsage = this.aggregateByModel(records);
    const platformUsage = this.aggregateByPlatform(records);
    const totalCost = records.reduce((sum, r) => sum + (r.cost || 0), 0);
    
    // Platform-specific recommendations
    const cliUsage = platformUsage.find(p => p.platform === 'cli');
    const spacesUsage = platformUsage.find(p => p.platform === 'spaces');
    
    if (cliUsage && spacesUsage) {
      if (cliUsage.cost > spacesUsage.cost * 2) {
        recommendations.push('Consider using Spaces for cost-effective operations');
      } else if (spacesUsage.cost > cliUsage.cost * 2) {
        recommendations.push('CLI usage is more cost-effective for your workflow');
      }
    }
    
    if (totalCost > 10) {
      recommendations.push('Consider using more cost-effective models for simple tasks');
    }
    
    if (modelUsage.length > 3) {
      recommendations.push('Consolidate to fewer models to optimize costs');
    }
    
    recommendations.push('Monitor usage patterns to identify optimization opportunities');
    
    return recommendations;
  }

  /**
   * Export usage data - uses existing export API
   */
  async exportUsageData(format: 'json' | 'csv' = 'json', timeRange: string = '7d') {
    const endDate = new Date().toISOString();
    const startDate = new Date();
    
    switch (timeRange) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
    }

    const params = new URLSearchParams({ 
      format, 
      startDate: startDate.toISOString(),
      endDate: endDate
    });
    
    const url = `${this.baseUrl}/api/usage/export?${params}`;
    const token = typeof window !== 'undefined' 
      ? localStorage.getItem('auth_token') 
      : null;

    const headers: HeadersInit = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      throw new Error('Export failed');
    }

    if (format === 'csv') {
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `usage-export-${timeRange}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } else {
      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `usage-export-${timeRange}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    }
  }

  /**
   * Get analytics metrics (alternative endpoint)
   */
  async getAnalyticsMetrics(timeRange: string = '7d') {
    return this.request<Record<string, unknown>>(`/api/analytics/metrics?range=${timeRange}`);
  }

  /**
   * Get analytics time series
   */
  async getAnalyticsTimeSeries(timeRange: string = '7d') {
    return this.request<Record<string, unknown>>(`/api/analytics/timeseries?range=${timeRange}`);
  }

  /**
   * Get provider breakdown
   */
  async getProviderBreakdown(timeRange: string = '7d') {
    return this.request<Record<string, unknown>>(`/api/analytics/providers?range=${timeRange}`);
  }

  /**
   * Generic GET request
   */
  async get<T>(endpoint: string): Promise<{ success: boolean; data: T | null; error?: string }> {
    try {
      const data = await this.request<T>(endpoint);
      return { success: true, data };
    } catch (error) {
      return { success: false, data: null, error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Generic POST request
   */
  async post<T>(endpoint: string, body: unknown): Promise<{ success: boolean; data: T | null; error?: string }> {
    try {
      const data = await this.request<T>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return { success: true, data };
    } catch (error) {
      return { success: false, data: null, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export const apiClient = new ApiClient();
export default apiClient;
