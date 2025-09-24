/**
 * Shared types for the backend API
 */

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  details?: any;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface UsageEvent {
  userId: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  feature: string;
  platform: string;
  metadata?: any;
}

export interface CostAnalytics {
  totalCost: number;
  breakdown: {
    byProvider: Record<string, { cost: number; percentage: number }>;
    byModel: Record<string, { cost: number; requests: number }>;
    byFeature: Record<string, { cost: number; percentage: number }>;
  };
  trends: {
    daily: Array<{ date: string; cost: number }>;
  };
}