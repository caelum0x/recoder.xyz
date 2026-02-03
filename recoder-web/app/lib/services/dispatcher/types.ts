/**
 * Type definitions for Recoder Dispatcher
 * Request routing to user workers for multi-tenant deployment
 */

/**
 * Dispatch namespace interface for worker routing
 * Compatible with Cloudflare Workers for Platforms
 */
export interface DispatchNamespace {
  get(name: string): {
    fetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response>
  }
}

/**
 * Worker bindings configuration
 */
export interface WorkerBindings {
  /** Database connection (optional) */
  DATABASE?: unknown
  /** Key-value storage (optional) */
  KV?: unknown
  /** Dispatch namespace for worker routing */
  dispatcher?: DispatchNamespace
  /** Dispatch namespace name */
  DISPATCH_NAMESPACE_NAME?: string
  /** Dispatch namespace account ID */
  DISPATCH_NAMESPACE_ACCOUNT_ID?: string
}

/**
 * Context variables for request handling
 */
export interface ContextVariables {
  /** User session information */
  userSession?: UserSession
  /** Unique request identifier */
  requestId: string
}

/**
 * User session information
 */
export interface UserSession {
  userId: string
  email?: string
  activeOrganizationId?: string
  [key: string]: unknown
}

/**
 * Dispatch request configuration
 */
export interface DispatchRequest {
  workerName: string
  method: string
  url: string
  headers: Record<string, string>
  body?: string | ArrayBuffer | ReadableStream
}

/**
 * Custom domain project mapping result
 */
export interface CustomDomainProject {
  id: string
  name: string
  slug: string
  customDomain: string
  customDomainVerified: boolean
  productionDeployUrl?: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Custom domain lookup result
 */
export interface CustomDomainResult {
  success: boolean
  response?: Response
  error?: string
  project?: CustomDomainProject
}

/**
 * Dispatch operation response
 */
export interface DispatchResponse {
  success: boolean
  status?: number
  headers?: Record<string, string>
  body?: string | ArrayBuffer | ReadableStream
  error?: string
  requestId: string
}

/**
 * Route resolution strategy
 */
export interface RouteStrategy {
  type: 'subdomain' | 'path' | 'header' | 'query'
  value: string
}

/**
 * Validation error details
 */
export interface ValidationError {
  code: string
  message: string
  field?: string
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'error'
  timestamp: string
  service: string
  version: string
  requestId: string
  checks?: {
    [key: string]: boolean | {
      status: boolean
      message: string
    }
  }
  error?: string
}

/**
 * Namespace information
 */
export interface NamespaceInfo {
  name: string
  accountId: string
}

/**
 * Dispatch metrics for monitoring
 */
export interface DispatchMetrics {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  workerStats: {
    [workerName: string]: {
      requests: number
      errors: number
      lastAccessed: string
    }
  }
}

/**
 * Error codes for dispatcher operations
 */
export enum DispatchErrorCode {
  WORKER_NOT_FOUND = 'WORKER_NOT_FOUND',
  INVALID_WORKER_NAME = 'INVALID_WORKER_NAME',
  NAMESPACE_NOT_CONFIGURED = 'NAMESPACE_NOT_CONFIGURED',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  REQUEST_TOO_LARGE = 'REQUEST_TOO_LARGE',
  INVALID_REQUEST_FORMAT = 'INVALID_REQUEST_FORMAT',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

/**
 * HTTP status codes
 */
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  REQUEST_TOO_LARGE = 413,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503
}

/**
 * Middleware context for request handling
 */
export interface MiddlewareContext {
  requestId: string
  startTime: number
  userSession?: UserSession
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  requestId: string
  metadata?: Record<string, unknown>
}

/**
 * Dispatcher configuration
 */
export interface DispatcherConfig {
  /** Maximum request size in bytes */
  maxRequestSize: number
  /** Allowed HTTP methods */
  allowedMethods: string[]
  /** CORS allowed origins */
  corsOrigins: string[]
  /** Whether authentication is required */
  authRequired: boolean
  /** Rate limiting configuration */
  rateLimiting?: {
    enabled: boolean
    requestsPerMinute: number
  }
}

/**
 * Dispatch options for worker routing
 */
export interface DispatchOptions {
  workerName: string
  request: Request
  namespace?: DispatchNamespace
  requestId?: string
}

/**
 * Dispatch result from worker routing
 */
export interface DispatchResult {
  success: boolean
  response?: Response
  error?: string
  workerName: string
  requestId: string
}

/**
 * Route information extracted from request
 */
export interface RouteInfo {
  workerName: string | null
  strategy: 'subdomain' | 'path' | 'none'
  originalUrl: string
  targetPath: string
}

/**
 * Validation result for various checks
 */
export interface ValidationResult {
  valid: boolean
  error?: string
  code?: string
}
