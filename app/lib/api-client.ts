/**
 * API Client for frontend
 * Handles all API calls to the backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
   * Get usage analytics
   */
  async getUsageAnalytics(timeRange: string = '7d', model?: string) {
    const params = new URLSearchParams({ 
      range: timeRange,
      detailed: 'true',
      includeProjections: 'true'
    });
    
    if (model && model !== 'all') {
      params.append('model', model);
    }

    return this.request<any>(`/api/usage-monitoring/analytics?${params}`);
  }

  /**
   * Get real-time usage stats
   */
  async getUsageStats() {
    return this.request<any>('/api/usage-monitoring/stats');
  }

  /**
   * Get cost breakdown
   */
  async getCostBreakdown(period: 'day' | 'week' | 'month' = 'month') {
    return this.request<any>(`/api/usage-monitoring/cost-breakdown?period=${period}`);
  }

  /**
   * Get usage history
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

    return this.request<any>(`/api/usage-monitoring/history?${searchParams}`);
  }

  /**
   * Export usage data
   */
  async exportUsageData(format: 'json' | 'csv' = 'json', timeRange: string = '7d') {
    const params = new URLSearchParams({ format, range: timeRange });
    
    const url = `${this.baseUrl}/api/usage-monitoring/export?${params}`;
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
    return this.request<any>(`/api/analytics/metrics?range=${timeRange}`);
  }

  /**
   * Get analytics time series
   */
  async getAnalyticsTimeSeries(timeRange: string = '7d') {
    return this.request<any>(`/api/analytics/timeseries?range=${timeRange}`);
  }

  /**
   * Get provider breakdown
   */
  async getProviderBreakdown(timeRange: string = '7d') {
    return this.request<any>(`/api/analytics/providers?range=${timeRange}`);
  }
}

export const apiClient = new ApiClient();
export default apiClient;
