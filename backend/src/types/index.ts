/**
 * Shared TypeScript types and interfaces
 * Consolidates common types used across the application
 */

// Base response interface
export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Pagination
export interface PaginationParams {
  page?: number;
  limit?: number;
  offset?: number;
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// User types
export interface UserProfile {
  id: string;
  email: string;
  name: string;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// AI Provider types
export interface AIProvider {
  id: string;
  name: string;
  type: 'chat' | 'completion' | 'embedding';
  models: string[];
  status: 'active' | 'inactive' | 'error';
  config?: Record<string, any>;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  type: string;
  maxTokens: number;
  costPerToken?: {
    input: number;
    output: number;
  };
}

// Project types
export interface Project {
  id: string;
  name: string;
  description?: string;
  type: string;
  status: string;
  config: Record<string, any>;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

// Code generation types
export interface CodeGenerationRequest {
  prompt: string;
  language?: string;
  framework?: string;
  provider?: string;
  model?: string;
  options?: {
    temperature?: number;
    maxTokens?: number;
    stream?: boolean;
  };
}

export interface CodeGenerationResponse {
  content: string;
  model: string;
  provider: string;
  tokens: number;
  cost?: number;
  cached: boolean;
  timestamp: number;
}

// Template types
export interface Template {
  id: string;
  name: string;
  category: string;
  description?: string;
  structure: Record<string, any>;
  config: Record<string, any>;
  public: boolean;
  userId: string;
  createdAt: string;
}

// Usage tracking
export interface UsageRecord {
  id: string;
  type: string;
  metadata: Record<string, any>;
  tokens?: number;
  cost?: number;
  duration?: number;
  success: boolean;
  userId: string;
  projectId?: string;
  timestamp: string;
}

// Analytics
export interface AnalyticsData {
  metric: string;
  value: number;
  timestamp: string;
  dimensions?: Record<string, string>;
}

// Webhook types
export interface WebhookEvent {
  id: string;
  type: string;
  data: Record<string, any>;
  timestamp: string;
}

export interface WebhookConfig {
  url: string;
  events: string[];
  secret?: string;
  isActive: boolean;
}

// Subscription types
export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: string;
  features: string[];
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

// Multi-tenant types
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain?: string;
  customDomain?: string;
  plan: string;
  settings: Record<string, any>;
  branding: Record<string, any>;
  limits: Record<string, any>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  permissions: string[];
  status: string;
  createdAt: string;
}

// RBAC types
export interface Role {
  id: string;
  name: string;
  description?: string;
  type: string;
  permissions: string[];
  isActive: boolean;
  tenantId?: string;
  createdAt: string;
}

export interface Permission {
  resource: string;
  action: string;
  conditions?: PermissionCondition[];
}

export interface PermissionCondition {
  field: string;
  operator: string;
  value: any;
}

// Error types
export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
  stack?: string;
}

// File upload types
export interface FileUpload {
  id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url?: string;
  userId: string;
  createdAt: string;
}

// Notification types
export interface NotificationSettings {
  emailNotifications: boolean;
  pushNotifications: boolean;
  weeklyReports: boolean;
  securityAlerts: boolean;
}

// Device types for cross-platform sync
export interface UserDevice {
  id: string;
  name: string;
  deviceType: string;
  platform: string;
  deviceId: string;
  pushToken?: string;
  lastActiveAt: string;
  isActive: boolean;
}

// Sync state
export interface SyncState {
  dataType: string;
  lastSyncAt: string;
  syncVersion: number;
  syncStatus: string;
  deviceSyncMap: Record<string, any>;
}

// RAG and knowledge base types
export interface CodebaseKnowledge {
  id: string;
  name: string;
  description?: string;
  repositoryUrl?: string;
  type: string;
  language?: string;
  framework?: string;
  status: string;
  totalFiles: number;
  indexedFiles: number;
  userId: string;
  createdAt: string;
}

export interface CodeChunk {
  id: string;
  content: string;
  contentType: string;
  filePath: string;
  language: string;
  functionName?: string;
  className?: string;
  summary?: string;
}

// Backup types
export interface BackupJob {
  id: string;
  type: string;
  status: string;
  backupId: string;
  databaseName: string;
  sizeBytes: number;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

// Theme and responsive design types
export interface ThemePreferences {
  mode: 'light' | 'dark' | 'system';
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  fontSize: number;
}

export interface ResponsiveConfig {
  name: string;
  breakpoints: Record<string, string>;
  gridColumns: Record<string, number>;
  spacingScale: Record<string, string>;
}

// Feature flag types
export interface FeatureFlag {
  key: string;
  name: string;
  enabled: boolean;
  rules?: FeatureFlagRule[];
  description?: string;
}

export interface FeatureFlagRule {
  condition: string;
  value: boolean;
  percentage?: number;
  userIds?: string[];
}

// Marketplace types
export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  author: string;
  price: number;
  downloads: number;
  rating: number;
  tags: string[];
}

// Referral types
export interface ReferralProgram {
  code: string;
  userId: string;
  credits: number;
  used: number;
  maxUses?: number;
  expiresAt?: string;
}

// Request context types
export interface RequestContext {
  user?: UserProfile;
  tenant?: Tenant;
  device?: UserDevice;
  permissions?: string[];
}

// Express Request extension
declare global {
  namespace Express {
    interface Request {
      user?: UserProfile;
      tenant?: Tenant;
      device?: UserDevice;
      context?: RequestContext;
    }
  }
}

// Environment configuration
export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  redisUrl?: string;
  jwtSecret: string;
  apiKeys: {
    anthropic?: string;
    openai?: string;
    groq?: string;
    gemini?: string;
  };
}

// HTTP status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const;

// Common validation patterns
export const VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  SLUG: /^[a-z0-9-]+$/,
  PHONE: /^\+?[\d\s\-\(\)]+$/,
  URL: /^https?:\/\/.+/
} as const;

export default {
  HTTP_STATUS,
  VALIDATION_PATTERNS
};