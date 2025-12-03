/**
 * Common API Response Types
 * Shared across all API endpoints
 */

// Base response types
export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: any;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// GitHub API responses
export interface GitHubRepoInfo {
  name: string;
  owner: string;
  description?: string;
  url: string;
  defaultBranch: string;
}

export interface GitHubPushResponse {
  repoUrl: string;
  branch: string;
  commits: number;
}

export interface GitHubPullResponse {
  files: number;
  changes: number;
  conflicts?: string[];
}

export interface GitHubHealthResponse {
  connected: boolean;
  user?: {
    login: string;
    name: string;
    avatar_url: string;
  };
  rateLimit?: {
    remaining: number;
    limit: number;
    reset: Date;
  };
}

// Deployment API responses
export interface DeploymentResponse {
  id: string;
  url: string;
  status: 'building' | 'ready' | 'error';
  platform: 'vercel' | 'netlify' | 'cloudflare';
  deployedAt: string;
}

export interface DeploymentListResponse {
  deployments: DeploymentResponse[];
  total: number;
}

// Project API responses
export interface ProjectFile {
  path: string;
  content: string;
  size: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  files: ProjectFile[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListResponse {
  projects: Project[];
  total: number;
}

// Subscription API responses
export interface Subscription {
  id: string;
  userId: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'canceled' | 'expired';
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
}

export interface SubscriptionResponse {
  subscription: Subscription;
}

// Model/Analytics responses
export interface ModelUsage {
  model: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface AnalyticsResponse {
  usage: ModelUsage[];
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
}

// Download responses
export interface DownloadResponse {
  url: string;
  filename: string;
  size: number;
  expiresAt: string;
}

// Type guards
export function isApiError(response: any): response is ApiErrorResponse {
  return response && !response.success && typeof response.error === 'string';
}

export function isApiSuccess<T>(response: any): response is ApiSuccessResponse<T> {
  return response && response.success === true && 'data' in response;
}
