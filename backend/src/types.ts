/**
 * Shared types for the backend API
 */

import { Request } from 'express';

// User interface for authentication
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  subscription?: string;
}

// Extend Express Request type to include user and session
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: {
        oauthState?: string;
        [key: string]: any;
      };
    }
  }
}

// Webhook event type
export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  timestamp: Date;
}

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
  planType?: string;
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