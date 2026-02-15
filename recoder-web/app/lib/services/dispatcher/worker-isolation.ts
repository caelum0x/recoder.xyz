/**
 * Worker Isolation Service
 * Provides tenant isolation and security boundaries for multi-tenant worker dispatch
 */

import type { DispatchNamespace, UserSession, ValidationResult } from './types'
import { CommonErrors, DispatcherError } from './errors'
import { generateRequestId } from './dispatcher'

/**
 * Worker isolation context for secure dispatch
 */
export interface IsolationContext {
  /** Unique tenant/user identifier */
  tenantId: string
  /** Worker name being accessed */
  workerName: string
  /** Request ID for tracing */
  requestId: string
  /** User session if authenticated */
  session?: UserSession
  /** Resource quotas and limits */
  quotas?: WorkerQuotas
}

/**
 * Worker resource quotas
 */
export interface WorkerQuotas {
  /** Maximum request body size in bytes */
  maxRequestSize: number
  /** Maximum response size in bytes */
  maxResponseSize: number
  /** Request timeout in milliseconds */
  timeoutMs: number
  /** Maximum concurrent requests */
  maxConcurrent: number
  /** Rate limit requests per minute */
  rateLimitPerMinute: number
}

/**
 * Default quotas for workers
 */
export const DEFAULT_QUOTAS: WorkerQuotas = {
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  maxResponseSize: 100 * 1024 * 1024, // 100MB
  timeoutMs: 30000, // 30 seconds
  maxConcurrent: 100,
  rateLimitPerMinute: 1000,
}

/**
 * Worker access permissions
 */
export interface WorkerPermissions {
  /** Can read from worker */
  read: boolean
  /** Can write/execute worker */
  write: boolean
  /** Can manage worker settings */
  admin: boolean
  /** Specific allowed methods */
  allowedMethods: string[]
  /** Allowed origin patterns */
  allowedOrigins: string[]
}

/**
 * Default permissions for authenticated users
 */
export const DEFAULT_PERMISSIONS: WorkerPermissions = {
  read: true,
  write: true,
  admin: false,
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  allowedOrigins: ['*'],
}

/**
 * In-memory rate limiter for worker requests
 * In production, use a distributed rate limiter (Redis, etc.)
 */
class RateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map()

  /**
   * Check if request is allowed under rate limit
   * @param key Rate limit key (usually tenantId:workerName)
   * @param limit Maximum requests per window
   * @param windowMs Window duration in milliseconds
   * @returns Whether request is allowed
   */
  isAllowed(key: string, limit: number, windowMs: number = 60000): boolean {
    const now = Date.now()
    const record = this.requests.get(key)

    if (!record || now > record.resetTime) {
      // New window
      this.requests.set(key, {
        count: 1,
        resetTime: now + windowMs,
      })
      return true
    }

    if (record.count >= limit) {
      return false
    }

    record.count++
    return true
  }

  /**
   * Get remaining requests in current window
   * @param key Rate limit key
   * @param limit Maximum requests per window
   * @returns Remaining requests
   */
  getRemaining(key: string, limit: number): number {
    const record = this.requests.get(key)
    if (!record || Date.now() > record.resetTime) {
      return limit
    }
    return Math.max(0, limit - record.count)
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now()
    const keysToDelete: string[] = []
    this.requests.forEach((record, key) => {
      if (now > record.resetTime) {
        keysToDelete.push(key)
      }
    })
    keysToDelete.forEach(key => this.requests.delete(key))
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter()

// Cleanup expired entries periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => rateLimiter.cleanup(), 60000)
}

/**
 * Concurrent request tracker
 */
class ConcurrencyTracker {
  private concurrent: Map<string, number> = new Map()

  /**
   * Try to acquire a slot for concurrent execution
   * @param key Concurrency key
   * @param max Maximum concurrent requests
   * @returns Whether slot was acquired
   */
  acquire(key: string, max: number): boolean {
    const current = this.concurrent.get(key) || 0
    if (current >= max) {
      return false
    }
    this.concurrent.set(key, current + 1)
    return true
  }

  /**
   * Release a concurrent slot
   * @param key Concurrency key
   */
  release(key: string): void {
    const current = this.concurrent.get(key) || 0
    if (current > 0) {
      this.concurrent.set(key, current - 1)
    }
  }

  /**
   * Get current concurrent count
   * @param key Concurrency key
   * @returns Current count
   */
  getCount(key: string): number {
    return this.concurrent.get(key) || 0
  }
}

// Global concurrency tracker
const concurrencyTracker = new ConcurrencyTracker()

/**
 * Create an isolation context for a worker request
 * @param options Context creation options
 * @returns Isolation context
 */
export function createIsolationContext(options: {
  tenantId: string
  workerName: string
  session?: UserSession
  quotas?: Partial<WorkerQuotas>
  requestId?: string
}): IsolationContext {
  return {
    tenantId: options.tenantId,
    workerName: options.workerName,
    requestId: options.requestId || generateRequestId(),
    session: options.session,
    quotas: {
      ...DEFAULT_QUOTAS,
      ...options.quotas,
    },
  }
}

/**
 * Validate request against isolation rules
 * @param context Isolation context
 * @param request The request to validate
 * @returns Validation result
 */
export function validateIsolatedRequest(
  context: IsolationContext,
  request: Request
): ValidationResult {
  const quotas = context.quotas || DEFAULT_QUOTAS

  // Check request size
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10)
    if (!Number.isNaN(size) && size > quotas.maxRequestSize) {
      return {
        valid: false,
        error: `Request size (${size} bytes) exceeds limit (${quotas.maxRequestSize} bytes)`,
        code: 'REQUEST_TOO_LARGE',
      }
    }
  }

  // Check rate limit
  const rateLimitKey = `${context.tenantId}:${context.workerName}`
  if (!rateLimiter.isAllowed(rateLimitKey, quotas.rateLimitPerMinute)) {
    return {
      valid: false,
      error: 'Rate limit exceeded',
      code: 'RATE_LIMITED',
    }
  }

  // Check concurrency
  const concurrencyKey = `${context.tenantId}:${context.workerName}`
  if (!concurrencyTracker.acquire(concurrencyKey, quotas.maxConcurrent)) {
    return {
      valid: false,
      error: 'Too many concurrent requests',
      code: 'CONCURRENT_LIMIT_EXCEEDED',
    }
  }

  return { valid: true }
}

/**
 * Release resources after request completion
 * @param context Isolation context
 */
export function releaseIsolatedResources(context: IsolationContext): void {
  const concurrencyKey = `${context.tenantId}:${context.workerName}`
  concurrencyTracker.release(concurrencyKey)
}

/**
 * Check if user has permission to access worker
 * @param session User session
 * @param workerName Worker name
 * @param permissions Required permissions
 * @returns Whether access is allowed
 */
export function checkWorkerAccess(
  session: UserSession | undefined,
  workerName: string,
  permissions: Partial<WorkerPermissions> = {}
): ValidationResult {
  // Unauthenticated requests are rejected by default
  if (!session) {
    return {
      valid: false,
      error: 'Authentication required to access workers',
      code: 'AUTHENTICATION_REQUIRED',
    }
  }

  // User must belong to an organization to access workers
  if (!session.activeOrganizationId) {
    return {
      valid: false,
      error: 'No active organization for worker access',
      code: 'NO_ORGANIZATION',
    }
  }

  // Verify the worker name belongs to the user's organization
  // Workers are namespaced as: {orgId}-{workerSlug} or {orgId}/{workerSlug}
  const orgPrefix = session.activeOrganizationId
  const workerBelongsToOrg =
    workerName.startsWith(`${orgPrefix}-`) ||
    workerName.startsWith(`${orgPrefix}/`)

  if (!workerBelongsToOrg) {
    return {
      valid: false,
      error: 'Worker does not belong to your organization',
      code: 'INSUFFICIENT_PERMISSIONS',
    }
  }

  // Check admin permission requirement
  if (permissions.admin) {
    const isAdmin = session.role === 'admin' || session.role === 'owner'
    if (!isAdmin) {
      return {
        valid: false,
        error: 'Admin access required for this operation',
        code: 'INSUFFICIENT_PERMISSIONS',
      }
    }
  }

  return { valid: true }
}

/**
 * Create an isolated dispatch function with context
 * @param namespace Dispatch namespace
 * @param context Isolation context
 * @returns Isolated dispatch function
 */
export function createIsolatedDispatcher(
  namespace: DispatchNamespace,
  context: IsolationContext
): {
  dispatch: (request: Request) => Promise<Response>
  release: () => void
} {
  let released = false

  return {
    dispatch: async (request: Request): Promise<Response> => {
      if (released) {
        throw CommonErrors.internalError('Dispatcher has been released')
      }

      const validation = validateIsolatedRequest(context, request)
      if (!validation.valid) {
        throw new DispatcherError(
          validation.code === 'RATE_LIMITED' ? 429 : 400,
          validation.code as any,
          validation.error || 'Validation failed'
        )
      }

      const quotas = context.quotas || DEFAULT_QUOTAS

      try {
        // Create abort controller for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), quotas.timeoutMs)

        const userWorker = namespace.get(context.workerName)

        // Clone request with abort signal
        const requestWithSignal = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          signal: controller.signal,
          // @ts-ignore
          duplex: 'half',
        })

        const response = await userWorker.fetch(requestWithSignal)
        clearTimeout(timeoutId)

        return response
      } finally {
        releaseIsolatedResources(context)
      }
    },

    release: () => {
      if (!released) {
        released = true
        releaseIsolatedResources(context)
      }
    },
  }
}

/**
 * Sanitize headers for worker isolation
 * Removes sensitive headers that shouldn't be forwarded
 * @param headers Original headers
 * @returns Sanitized headers
 */
export function sanitizeHeadersForWorker(headers: Headers): Headers {
  const sanitized = new Headers(headers)

  // Remove potentially sensitive headers
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
    'x-session-id',
  ]

  for (const header of sensitiveHeaders) {
    sanitized.delete(header)
  }

  return sanitized
}

/**
 * Add isolation headers to request
 * @param headers Headers to modify
 * @param context Isolation context
 * @returns Modified headers
 */
export function addIsolationHeaders(headers: Headers, context: IsolationContext): Headers {
  const modified = new Headers(headers)

  modified.set('X-Tenant-ID', context.tenantId)
  modified.set('X-Worker-Name', context.workerName)
  modified.set('X-Request-ID', context.requestId)
  modified.set('X-Isolated', 'true')

  if (context.session?.userId) {
    modified.set('X-User-ID', context.session.userId)
  }

  return modified
}

/**
 * Get rate limit status for a tenant/worker
 * @param tenantId Tenant identifier
 * @param workerName Worker name
 * @param quotas Worker quotas
 * @returns Rate limit status
 */
export function getRateLimitStatus(
  tenantId: string,
  workerName: string,
  quotas: WorkerQuotas = DEFAULT_QUOTAS
): {
  remaining: number
  limit: number
  resetIn: number
} {
  const key = `${tenantId}:${workerName}`
  return {
    remaining: rateLimiter.getRemaining(key, quotas.rateLimitPerMinute),
    limit: quotas.rateLimitPerMinute,
    resetIn: 60, // seconds (simplified)
  }
}

/**
 * Get concurrency status for a tenant/worker
 * @param tenantId Tenant identifier
 * @param workerName Worker name
 * @param quotas Worker quotas
 * @returns Concurrency status
 */
export function getConcurrencyStatus(
  tenantId: string,
  workerName: string,
  quotas: WorkerQuotas = DEFAULT_QUOTAS
): {
  current: number
  max: number
  available: number
} {
  const key = `${tenantId}:${workerName}`
  const current = concurrencyTracker.getCount(key)
  return {
    current,
    max: quotas.maxConcurrent,
    available: Math.max(0, quotas.maxConcurrent - current),
  }
}
