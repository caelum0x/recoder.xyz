/**
 * Core Dispatcher Service
 * Routes requests to user workers with isolation and multi-tenancy support
 */

import type {
  DispatchOptions,
  DispatchResult,
  DispatchNamespace,
  RouteInfo,
  CustomDomainProject,
  CustomDomainResult,
} from './types'
import { CommonErrors, DispatcherError, createErrorResponse } from './errors'
import { isValidWorkerSubdomain, extractSubdomain, isSupportedDomain, isCustomDomain } from './domains'
import { parseRouteInfo, createWorkerRequest, extractWorkerName } from './routing'
import { validateDispatchRequest } from './validation'

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return crypto.randomUUID()
}

/**
 * Core dispatch function to route requests to user workers
 * This is the main entry point for worker dispatch operations
 * @param options Dispatch options including worker name, request, and namespace
 * @returns Dispatch result with success status and response
 */
export async function dispatchToWorker(options: DispatchOptions): Promise<DispatchResult> {
  const { workerName, request, namespace, requestId = generateRequestId() } = options

  try {
    // Validate worker name
    if (!workerName || workerName.trim() === '') {
      throw CommonErrors.missingWorkerName()
    }

    const validation = isValidWorkerSubdomain(workerName)
    if (!validation.valid) {
      throw CommonErrors.invalidWorkerName(workerName, validation.error)
    }

    // Check if namespace is configured
    if (!namespace) {
      throw CommonErrors.namespaceNotConfigured()
    }

    // Get the user worker from dispatch namespace
    const userWorker = namespace.get(workerName)

    // Forward the request to the user worker
    const response = await userWorker.fetch(request)

    return {
      success: true,
      response,
      workerName,
      requestId,
    }
  } catch (error) {
    // Handle known worker not found errors
    if (error instanceof Error && error.message.includes('Worker not found')) {
      return {
        success: false,
        error: `Worker '${workerName}' is not deployed or does not exist`,
        workerName,
        requestId,
      }
    }

    // Re-throw DispatcherErrors
    if (error instanceof DispatcherError) {
      throw error
    }

    // Wrap unknown errors
    throw CommonErrors.dispatchFailed(workerName, {
      originalError: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Dispatch request using automatic worker name extraction
 * Extracts worker name from subdomain, path, or query parameters
 * @param request The incoming request
 * @param namespace The dispatch namespace
 * @param requestId Optional request ID
 * @returns Dispatch result
 */
export async function dispatchRequest(
  request: Request,
  namespace: DispatchNamespace,
  requestId?: string
): Promise<DispatchResult> {
  const id = requestId || generateRequestId()
  const url = new URL(request.url)

  // Extract worker name from request
  const headersObj: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headersObj[key] = value
  })

  const workerName = extractWorkerName({
    url: request.url,
    headers: headersObj,
    searchParams: url.searchParams,
  })

  if (!workerName) {
    return {
      success: false,
      error: 'Could not determine target worker from request',
      workerName: 'unknown',
      requestId: id,
    }
  }

  // Parse route info for path transformation
  const routeInfo = parseRouteInfo(request.url, id)

  // Create modified request for worker
  const workerRequest = createWorkerRequest(request, routeInfo)

  return dispatchToWorker({
    workerName,
    request: workerRequest,
    namespace,
    requestId: id,
  })
}

/**
 * Handle subdomain-based worker routing
 * Primary routing strategy for user workers
 * @param request The incoming request
 * @param namespace The dispatch namespace
 * @param requestId Optional request ID
 * @returns Response from the worker or error response
 */
export async function handleSubdomainWorker(
  request: Request,
  namespace: DispatchNamespace,
  requestId?: string
): Promise<Response> {
  const id = requestId || generateRequestId()
  const url = new URL(request.url)
  const hostname = url.hostname

  // Extract subdomain
  const subdomain = extractSubdomain(hostname)
  if (!subdomain) {
    return createJsonResponse(
      {
        error: 'Invalid subdomain',
        message: 'No valid subdomain found',
        hostname,
        requestId: id,
      },
      400
    )
  }

  // Validate subdomain
  const validation = isValidWorkerSubdomain(subdomain)
  if (!validation.valid) {
    return createJsonResponse(
      {
        error: 'Invalid worker name',
        message: validation.error,
        subdomain,
        hostname,
        requestId: id,
      },
      400
    )
  }

  try {
    const result = await dispatchToWorker({
      workerName: subdomain,
      request,
      namespace,
      requestId: id,
    })

    if (result.success && result.response) {
      return result.response
    }

    return createJsonResponse(
      {
        error: 'Worker not found',
        message: result.error || `Worker '${subdomain}' is not deployed or does not exist`,
        workerName: subdomain,
        requestId: id,
        suggestion: 'Please check if the worker is deployed correctly',
      },
      404
    )
  } catch (error) {
    if (error instanceof DispatcherError) {
      return createJsonResponse(error.toJSON(id), error.statusCode)
    }

    return createJsonResponse(
      {
        error: 'Worker dispatch failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        workerName: subdomain,
        requestId: id,
      },
      500
    )
  }
}

/**
 * Handle path-based worker routing
 * Fallback routing strategy for API endpoints
 * @param request The incoming request
 * @param namespace The dispatch namespace
 * @param workerName The worker name from path
 * @param requestId Optional request ID
 * @returns Response from the worker or error response
 */
export async function handlePathWorker(
  request: Request,
  namespace: DispatchNamespace,
  workerName: string,
  requestId?: string
): Promise<Response> {
  const id = requestId || generateRequestId()

  // Validate worker name
  const validation = isValidWorkerSubdomain(workerName)
  if (!validation.valid) {
    return createJsonResponse(
      {
        error: 'Invalid worker name',
        message: validation.error,
        workerName,
        requestId: id,
      },
      400
    )
  }

  // Parse route info for path transformation
  const routeInfo = parseRouteInfo(request.url, id)

  // Create modified request
  const workerRequest = createWorkerRequest(request, routeInfo)

  try {
    const result = await dispatchToWorker({
      workerName,
      request: workerRequest,
      namespace,
      requestId: id,
    })

    if (result.success && result.response) {
      return result.response
    }

    return createJsonResponse(
      {
        error: 'Worker not found',
        message: result.error || `Worker '${workerName}' not found`,
        workerName,
        requestId: id,
      },
      404
    )
  } catch (error) {
    if (error instanceof DispatcherError) {
      return createJsonResponse(error.toJSON(id), error.statusCode)
    }

    return createJsonResponse(
      {
        error: 'Dispatch failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        workerName,
        requestId: id,
      },
      500
    )
  }
}

/**
 * Handle custom domain routing
 * Routes requests from custom domains to their configured workers
 * @param request The incoming request
 * @param project The custom domain project configuration
 * @param requestId Optional request ID
 * @returns Response from the production URL or error response
 */
export async function handleCustomDomain(
  request: Request,
  project: CustomDomainProject,
  requestId?: string
): Promise<CustomDomainResult> {
  const id = requestId || generateRequestId()
  const url = new URL(request.url)
  const hostname = url.hostname

  // Validate project has production URL
  if (!project.productionDeployUrl) {
    return {
      success: false,
      error: 'Production deploy URL is not configured',
      response: createJsonResponse(
        {
          error: 'Custom domain not configured',
          message: 'Production deploy URL is not set for this domain',
          domain: hostname,
          requestId: id,
        },
        503
      ),
    }
  }

  // Validate domain is verified
  if (!project.customDomainVerified) {
    return {
      success: false,
      error: 'Custom domain not verified',
      response: createJsonResponse(
        {
          error: 'Domain not verified',
          message: 'This custom domain has not been verified',
          domain: hostname,
          requestId: id,
        },
        403
      ),
    }
  }

  try {
    // Forward request to production URL
    const response = await forwardRequestToProductionUrl(
      request,
      project.productionDeployUrl,
      id
    )

    return {
      success: true,
      response,
      project,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request forwarding failed',
      response: createJsonResponse(
        {
          error: 'Service temporarily unavailable',
          message: 'Failed to forward request to application',
          domain: hostname,
          requestId: id,
        },
        502
      ),
    }
  }
}

/**
 * Forward request to production deploy URL
 * @param request Original request
 * @param productionUrl Target production URL
 * @param requestId Request ID for tracking
 * @returns Response from production URL
 */
async function forwardRequestToProductionUrl(
  request: Request,
  productionUrl: string,
  requestId: string
): Promise<Response> {
  const originalUrl = new URL(request.url)
  const targetUrl = new URL(productionUrl)

  // Construct the target URL with original path and query parameters
  const forwardUrl = new URL(originalUrl.pathname + originalUrl.search, targetUrl.origin)

  // Get request body for non-GET/HEAD requests
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const requestBody = hasBody ? request.body : null

  // Create forwarding headers
  const headers = new Headers(request.headers)
  headers.set('X-Forwarded-Host', originalUrl.hostname)
  headers.set('X-Forwarded-Proto', originalUrl.protocol.slice(0, -1))
  headers.set('X-Request-ID', requestId)
  headers.set('X-Custom-Domain', 'true')

  // Create and send forwarding request
  const forwardRequest = new Request(forwardUrl.href, {
    method: request.method,
    headers,
    body: requestBody,
    // @ts-ignore - duplex is needed for streaming
    duplex: 'half',
  })

  return fetch(forwardRequest)
}

/**
 * Main request handler that routes based on domain type
 * Automatically determines routing strategy and dispatches accordingly
 * @param request The incoming request
 * @param options Handler options
 * @returns Response from worker or error response
 */
export async function handleRequest(
  request: Request,
  options: {
    namespace?: DispatchNamespace
    lookupCustomDomain?: (hostname: string) => Promise<CustomDomainProject | null>
    requestId?: string
  }
): Promise<Response> {
  const id = options.requestId || generateRequestId()
  const url = new URL(request.url)
  const hostname = url.hostname
  const pathname = url.pathname

  try {
    // Check if it's a custom domain
    if (isCustomDomain(hostname)) {
      if (options.lookupCustomDomain) {
        const project = await options.lookupCustomDomain(hostname)
        if (project) {
          const result = await handleCustomDomain(request, project, id)
          return result.response || createJsonResponse({ error: 'No response' }, 500)
        }
      }

      return createJsonResponse(
        {
          error: 'Custom domain not found',
          message: `The domain '${hostname}' is not configured`,
          hostname,
          requestId: id,
        },
        404
      )
    }

    // Check for subdomain routing
    const subdomain = extractSubdomain(hostname)
    if (subdomain && options.namespace) {
      const validation = isValidWorkerSubdomain(subdomain)
      if (validation.valid) {
        return handleSubdomainWorker(request, options.namespace, id)
      }
    }

    // Check for path-based routing
    const pathMatch = pathname.match(/^\/(?:api\/)?dispatch\/([^\/]+)/)
    if (pathMatch?.[1] && options.namespace) {
      return handlePathWorker(request, options.namespace, pathMatch[1], id)
    }

    // No routing match found
    return createJsonResponse(
      {
        error: 'Not found',
        message: 'No worker routing could be determined for this request',
        hostname,
        pathname,
        requestId: id,
      },
      404
    )
  } catch (error) {
    if (error instanceof DispatcherError) {
      return createJsonResponse(error.toJSON(id), error.statusCode)
    }

    return createJsonResponse(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
        hostname,
        requestId: id,
        timestamp: new Date().toISOString(),
      },
      500
    )
  }
}

/**
 * Create a JSON response
 * @param data Response data
 * @param status HTTP status code
 * @returns Response object
 */
function createJsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

/**
 * Get namespace information
 * @param namespaceName The namespace name
 * @param accountId The account ID
 * @returns Namespace info object
 */
export function getNamespaceInfo(namespaceName?: string, accountId?: string) {
  return {
    name: namespaceName || 'default',
    accountId: accountId || 'unknown',
  }
}
