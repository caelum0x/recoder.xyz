/**
 * API-related type definitions
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp?: string;
  requestId?: string;
}

export interface PaginatedResponse<T = any> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
  requestId?: string;
  path?: string;
}

export interface RequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  params?: Record<string, any>;
  data?: any;
  timeout?: number;
  retries?: number;
  authenticated?: boolean;
}

export interface ApiClientConfig {
  baseURL: string;
  timeout: number;
  retries: number;
  defaultHeaders?: Record<string, string>;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface FileUploadResponse {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  url: string;
  downloadUrl?: string;
  metadata?: Record<string, any>;
}

export interface BatchRequest {
  id: string;
  method: string;
  url: string;
  data?: any;
  headers?: Record<string, string>;
}

export interface BatchResponse {
  id: string;
  status: number;
  data?: any;
  error?: string;
}

export interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
  signature?: string;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

export interface ApiKey {
  id: string;
  name: string;
  key: string;
  permissions: string[];
  expiresAt?: string;
  createdAt: string;
  lastUsed?: string;
}

export interface ApiUsage {
  requests: number;
  errors: number;
  responseTime: number;
  period: string;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: Record<string, {
    status: 'pass' | 'fail' | 'warn';
    time: string;
    output?: string;
  }>;
}