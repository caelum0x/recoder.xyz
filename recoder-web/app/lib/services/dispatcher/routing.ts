/**
 * Routing utilities for Dispatcher service
 * Request routing resolution and URL transformation
 */

import type { RouteInfo, ValidationResult } from './types'
import {
  isSupportedDomain,
  extractSubdomain,
  isValidWorkerSubdomain,
  isCustomDomain,
} from './domains'

/**
 * Parse routing information from a request URL
 * Supports both subdomain-based and path-based routing strategies
 * @param url The request URL
 * @param requestId Optional request ID for logging
 * @returns Route information with worker name and strategy
 */
export function parseRouteInfo(url: string | URL, requestId?: string): RouteInfo {
  const parsedUrl = typeof url === 'string' ? new URL(url) : url
  const hostname = parsedUrl.hostname
  const pathname = parsedUrl.pathname

  let workerName: string | null = null
  let strategy: RouteInfo['strategy'] = 'none'
  let targetPath = pathname

  // Primary strategy: Subdomain-based routing
  if (isSupportedDomain(hostname)) {
    const subdomain = extractSubdomain(hostname)
    if (subdomain) {
      const validation = isValidWorkerSubdomain(subdomain)
      if (validation.valid) {
        workerName = subdomain
        strategy = 'subdomain'
        // For subdomain routing, the entire path is forwarded
        targetPath = pathname
      }
    }
  }

  // Fallback strategy: Path-based routing (for API endpoints)
  if (!workerName) {
    // Match patterns like /dispatch/worker-name or /api/dispatch/worker-name
    const pathMatch = pathname.match(/^\/(?:api\/)?dispatch\/([^\/]+)(.*)$/)
    if (pathMatch?.[1]) {
      const pathWorkerName = pathMatch[1]
      const validation = isValidWorkerSubdomain(pathWorkerName)
      if (validation.valid) {
        workerName = pathWorkerName
        strategy = 'path'
        // Remove the dispatch prefix from the target path
        targetPath = pathMatch[2] || '/'
      }
    }
  }

  return {
    workerName,
    strategy,
    originalUrl: parsedUrl.href,
    targetPath,
  }
}

/**
 * Extract worker name from various request sources
 * Checks subdomain, path, headers, and query parameters
 * @param options Extraction options
 * @returns Worker name or null if not found
 */
export function extractWorkerName(options: {
  url: string | URL
  headers?: Record<string, string | undefined>
  searchParams?: URLSearchParams
}): string | null {
  const { url, headers, searchParams } = options

  // 1. Try route info (subdomain or path)
  const routeInfo = parseRouteInfo(url)
  if (routeInfo.workerName) {
    return routeInfo.workerName
  }

  // 2. Try query parameter
  if (searchParams) {
    const queryWorker = searchParams.get('worker')
    if (queryWorker) {
      const validation = isValidWorkerSubdomain(queryWorker)
      if (validation.valid) {
        return queryWorker
      }
    }
  }

  // 3. Try custom header
  if (headers) {
    const headerWorker = headers['x-worker-name'] || headers['x-target-worker']
    if (headerWorker) {
      const validation = isValidWorkerSubdomain(headerWorker)
      if (validation.valid) {
        return headerWorker
      }
    }
  }

  return null
}

/**
 * Create a new request with modified URL for the target worker
 * @param originalRequest The original request to transform
 * @param routeInfo Route information with target path
 * @returns New request with modified URL and routing headers
 */
export function createWorkerRequest(originalRequest: Request, routeInfo: RouteInfo): Request {
  const originalUrl = new URL(originalRequest.url)

  // Create new URL with the target path
  const newUrl = new URL(originalUrl)
  newUrl.pathname = routeInfo.targetPath

  // Create new request with modified URL
  const newRequest = new Request(newUrl.toString(), {
    method: originalRequest.method,
    headers: new Headers(originalRequest.headers),
    body: originalRequest.body,
    // @ts-ignore - duplex is needed for streaming bodies
    duplex: 'half',
  })

  // Add routing metadata headers
  newRequest.headers.set('X-Original-URL', originalRequest.url)
  newRequest.headers.set('X-Routing-Strategy', routeInfo.strategy)
  if (routeInfo.workerName) {
    newRequest.headers.set('X-Target-Worker', routeInfo.workerName)
  }

  return newRequest
}

/**
 * Validate worker name format (convenience function)
 * @param workerName The worker name to validate
 * @returns Validation result
 */
export function validateWorkerName(workerName: string): ValidationResult {
  const result = isValidWorkerSubdomain(workerName)
  return {
    valid: result.valid,
    error: result.error,
    code: result.valid ? undefined : 'INVALID_WORKER_NAME',
  }
}

/**
 * Build target URL for worker dispatch
 * @param workerName The target worker name
 * @param baseDomain The base domain for subdomain routing
 * @param path The path to forward
 * @param queryString Optional query string
 * @returns Full target URL
 */
export function buildWorkerUrl(
  workerName: string,
  baseDomain: string,
  path: string = '/',
  queryString?: string
): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const query = queryString ? `?${queryString}` : ''
  return `https://${workerName}.${baseDomain}${normalizedPath}${query}`
}

/**
 * Extract target path from URL, removing dispatch prefixes
 * @param pathname The URL pathname
 * @returns Clean target path
 */
export function extractTargetPath(pathname: string): string {
  // Remove dispatch prefix patterns
  const cleanPath = pathname
    .replace(/^\/api\/dispatch\/[^\/]+/, '') // Remove /api/dispatch/worker-name
    .replace(/^\/dispatch\/[^\/]+/, '') // Remove /dispatch/worker-name

  return cleanPath || '/'
}

/**
 * Determine routing strategy from hostname
 * @param hostname The hostname to analyze
 * @returns Routing strategy type
 */
export function determineRoutingStrategy(
  hostname: string
): 'subdomain' | 'custom_domain' | 'path' | 'unknown' {
  // Check if it's a custom domain
  if (isCustomDomain(hostname)) {
    return 'custom_domain'
  }

  // Check if hostname has a valid subdomain
  const subdomain = extractSubdomain(hostname)
  if (subdomain) {
    const validation = isValidWorkerSubdomain(subdomain)
    if (validation.valid) {
      return 'subdomain'
    }
  }

  return 'unknown'
}

/**
 * Parse forwarded headers to get original client info
 * @param headers Request headers
 * @returns Parsed forwarding information
 */
export function parseForwardedHeaders(headers: Record<string, string | undefined>): {
  clientIp: string | null
  protocol: string | null
  host: string | null
} {
  return {
    clientIp:
      headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'] || null,
    protocol: headers['x-forwarded-proto'] || null,
    host: headers['x-forwarded-host'] || headers['host'] || null,
  }
}

/**
 * Create forwarding headers for proxied requests
 * @param originalRequest Original request
 * @param additionalHeaders Additional headers to include
 * @returns Headers object for forwarding
 */
export function createForwardingHeaders(
  originalRequest: Request,
  additionalHeaders?: Record<string, string>
): Headers {
  const headers = new Headers(originalRequest.headers)
  const url = new URL(originalRequest.url)

  // Set forwarding headers
  headers.set('X-Forwarded-Host', url.hostname)
  headers.set('X-Forwarded-Proto', url.protocol.slice(0, -1))

  // Add client IP if not already set
  if (!headers.has('X-Forwarded-For')) {
    // In a real scenario, this would be set by the edge/proxy
    headers.set('X-Forwarded-For', '0.0.0.0')
  }

  // Add any additional headers
  if (additionalHeaders) {
    for (const [key, value] of Object.entries(additionalHeaders)) {
      headers.set(key, value)
    }
  }

  return headers
}
