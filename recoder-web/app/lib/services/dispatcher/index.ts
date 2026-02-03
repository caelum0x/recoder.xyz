/**
 * Recoder Dispatcher Service
 *
 * Multi-tenant request routing to user workers with:
 * - Subdomain-based routing (primary strategy)
 * - Path-based routing (API endpoints)
 * - Custom domain handling
 * - Worker isolation and security
 * - Rate limiting and concurrency control
 *
 * Usage:
 * ```typescript
 * import {
 *   dispatchToWorker,
 *   handleRequest,
 *   handleSubdomainWorker,
 *   extractSubdomain,
 *   isValidWorkerSubdomain,
 * } from '~/lib/services/dispatcher'
 *
 * // Dispatch to a specific worker
 * const result = await dispatchToWorker({
 *   workerName: 'my-worker',
 *   request: request,
 *   namespace: dispatchNamespace,
 * })
 *
 * // Handle any incoming request with automatic routing
 * const response = await handleRequest(request, {
 *   namespace: dispatchNamespace,
 *   lookupCustomDomain: async (hostname) => lookupInDatabase(hostname),
 * })
 * ```
 */

// Core types
export type {
  DispatchNamespace,
  WorkerBindings,
  ContextVariables,
  UserSession,
  DispatchRequest,
  CustomDomainProject,
  CustomDomainResult,
  DispatchResponse,
  RouteStrategy,
  ValidationError,
  HealthCheckResult,
  NamespaceInfo,
  DispatchMetrics,
  MiddlewareContext,
  LogEntry,
  DispatcherConfig,
  DispatchOptions,
  DispatchResult,
  RouteInfo,
  ValidationResult,
} from './types'

export { DispatchErrorCode, HttpStatusCode } from './types'

// Domain utilities
export {
  DOMAIN_CONFIG,
  isSupportedDomain,
  isProductionDomain,
  isDevelopmentDomain,
  extractSubdomain,
  isValidWorkerSubdomain,
  extractBaseDomain,
  buildSubdomainUrl,
  isCustomDomain,
} from './domains'

export type { DomainConfig } from './domains'

// Error handling
export {
  ErrorCodes,
  DispatcherError,
  createErrorResponse,
  getHttpErrorCode,
  getGenericMessage,
  getStatusCode,
  CommonErrors,
} from './errors'

export type { ErrorCode, ErrorResponse } from './errors'

// Validation utilities
export {
  VALIDATION_CONFIG,
  validateDispatchRequest,
  validateWorkerName,
  validateRequestHeaders,
  validateRequestSize,
  validateUrl,
  sanitizeWorkerName,
  isValidMethod,
  parseDispatchParams,
} from './validation'

// Routing utilities
export {
  parseRouteInfo,
  extractWorkerName,
  createWorkerRequest,
  validateWorkerName as validateWorkerNameFromRouting,
  buildWorkerUrl,
  extractTargetPath,
  determineRoutingStrategy,
  parseForwardedHeaders,
  createForwardingHeaders,
} from './routing'

// Core dispatcher
export {
  generateRequestId,
  dispatchToWorker,
  dispatchRequest,
  handleSubdomainWorker,
  handlePathWorker,
  handleCustomDomain,
  handleRequest,
  getNamespaceInfo,
} from './dispatcher'

// Worker isolation
export {
  DEFAULT_QUOTAS,
  DEFAULT_PERMISSIONS,
  createIsolationContext,
  validateIsolatedRequest,
  releaseIsolatedResources,
  checkWorkerAccess,
  createIsolatedDispatcher,
  sanitizeHeadersForWorker,
  addIsolationHeaders,
  getRateLimitStatus,
  getConcurrencyStatus,
} from './worker-isolation'

export type {
  IsolationContext,
  WorkerQuotas,
  WorkerPermissions,
} from './worker-isolation'

// Multi-tenant domain handling
export {
  validateCustomDomain,
  registerCustomDomain,
  verifyCustomDomain,
  markDomainVerified,
  lookupCustomDomain,
  validateCustomDomainProject,
  getVerificationInstructions,
  updateProductionUrl,
  getProjectDomains,
  removeCustomDomain,
  handleCustomDomainRequest,
} from './multi-tenant'

export type {
  CustomDomainConfig,
  VerificationMethod,
  DomainVerification,
} from './multi-tenant'
