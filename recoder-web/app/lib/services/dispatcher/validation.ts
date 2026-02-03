/**
 * Validation utilities for Dispatcher service
 * Request validation, worker name validation, and header checks
 */

import type { ValidationResult, DispatchNamespace } from './types'
import { isValidWorkerSubdomain, DOMAIN_CONFIG } from './domains'

/**
 * Default configuration for validation
 */
export const VALIDATION_CONFIG = {
  /** Maximum request size in bytes (default 10MB) */
  maxRequestSize: 10 * 1024 * 1024,
  /** Allowed HTTP methods */
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  /** Maximum worker name length */
  maxWorkerNameLength: 63,
  /** Minimum worker name length */
  minWorkerNameLength: 1,
  /** Reserved worker names (from domain config) */
  reservedNames: DOMAIN_CONFIG.reservedSubdomains,
}

/**
 * Validate dispatch request
 * @param options Validation options
 * @returns Validation result with valid flag and optional error
 */
export function validateDispatchRequest(options: {
  workerName: string
  method: string
  dispatcher?: DispatchNamespace
  contentType?: string | null
  contentLength?: string | null
  maxRequestSize?: number
}): ValidationResult {
  const {
    workerName,
    method,
    dispatcher,
    contentType,
    contentLength,
    maxRequestSize = VALIDATION_CONFIG.maxRequestSize,
  } = options

  // Check if dispatch namespace is available
  if (!dispatcher) {
    return {
      valid: false,
      error: 'Dispatch namespace not configured',
      code: 'NAMESPACE_NOT_CONFIGURED',
    }
  }

  // Validate worker name
  const workerValidation = validateWorkerName(workerName)
  if (!workerValidation.valid) {
    return {
      valid: false,
      error: workerValidation.error || 'Invalid worker name',
      code: workerValidation.code || 'INVALID_WORKER_NAME',
    }
  }

  // Check request method
  if (!VALIDATION_CONFIG.allowedMethods.includes(method)) {
    return {
      valid: false,
      error: `HTTP method '${method}' not allowed`,
      code: 'METHOD_NOT_ALLOWED',
    }
  }

  // Validate Content-Type for POST/PUT/PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(method) && !contentType) {
    return {
      valid: false,
      error: 'Content-Type header is required for POST/PUT/PATCH requests',
      code: 'CONTENT_TYPE_REQUIRED',
    }
  }

  // Validate request size
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10)
    if (!Number.isNaN(size) && size > maxRequestSize) {
      return {
        valid: false,
        error: `Request size (${size} bytes) exceeds maximum allowed size (${maxRequestSize} bytes)`,
        code: 'REQUEST_TOO_LARGE',
      }
    }
  }

  return { valid: true }
}

/**
 * Validate worker name format
 * @param workerName The worker name to validate
 * @returns Validation result
 */
export function validateWorkerName(workerName: string): ValidationResult {
  if (!workerName || workerName.trim() === '') {
    return {
      valid: false,
      error: 'Worker name is required',
      code: 'WORKER_NAME_REQUIRED',
    }
  }

  // Use the domain validation function
  const subdomainValidation = isValidWorkerSubdomain(workerName)
  if (!subdomainValidation.valid) {
    return {
      valid: false,
      error: subdomainValidation.error,
      code: 'INVALID_WORKER_NAME_FORMAT',
    }
  }

  // Additional format validation - also allow underscores
  if (!/^[a-zA-Z0-9-_]+$/.test(workerName)) {
    return {
      valid: false,
      error: 'Worker name can only contain letters, numbers, hyphens, and underscores',
      code: 'INVALID_WORKER_NAME_FORMAT',
    }
  }

  // Length validation
  if (workerName.length > VALIDATION_CONFIG.maxWorkerNameLength) {
    return {
      valid: false,
      error: `Worker name must be ${VALIDATION_CONFIG.maxWorkerNameLength} characters or less`,
      code: 'WORKER_NAME_TOO_LONG',
    }
  }

  if (workerName.length < VALIDATION_CONFIG.minWorkerNameLength) {
    return {
      valid: false,
      error: `Worker name must be at least ${VALIDATION_CONFIG.minWorkerNameLength} character`,
      code: 'WORKER_NAME_TOO_SHORT',
    }
  }

  // Reserved names check
  if (VALIDATION_CONFIG.reservedNames.includes(workerName.toLowerCase())) {
    return {
      valid: false,
      error: `Worker name '${workerName}' is reserved`,
      code: 'WORKER_NAME_RESERVED',
    }
  }

  return { valid: true }
}

/**
 * Validate request headers
 * @param headers Request headers object
 * @param method HTTP method
 * @returns Validation result
 */
export function validateRequestHeaders(
  headers: Record<string, string | undefined>,
  method: string
): ValidationResult {
  // Validate Content-Type for POST/PUT/PATCH requests
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentType = headers['content-type']
    if (!contentType) {
      return {
        valid: false,
        error: 'Content-Type header is required for POST/PUT/PATCH requests',
        code: 'CONTENT_TYPE_REQUIRED',
      }
    }
  }

  return { valid: true }
}

/**
 * Validate request size
 * @param contentLength Content-Length header value
 * @param maxSizeBytes Maximum allowed size in bytes
 * @returns Validation result
 */
export function validateRequestSize(
  contentLength: string | null | undefined,
  maxSizeBytes: number = VALIDATION_CONFIG.maxRequestSize
): ValidationResult {
  if (contentLength) {
    const size = Number.parseInt(contentLength, 10)
    if (!Number.isNaN(size) && size > maxSizeBytes) {
      return {
        valid: false,
        error: `Request size (${size} bytes) exceeds maximum allowed size (${maxSizeBytes} bytes)`,
        code: 'REQUEST_TOO_LARGE',
      }
    }
  }

  return { valid: true }
}

/**
 * Validate URL format
 * @param url The URL to validate
 * @returns Validation result
 */
export function validateUrl(url: string): ValidationResult {
  try {
    new URL(url)
    return { valid: true }
  } catch {
    return {
      valid: false,
      error: 'Invalid URL format',
      code: 'INVALID_URL',
    }
  }
}

/**
 * Sanitize worker name for safe usage
 * @param workerName The worker name to sanitize
 * @returns Sanitized worker name
 */
export function sanitizeWorkerName(workerName: string): string {
  return workerName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]/g, '-') // Replace invalid chars with hyphens
    .replace(/--+/g, '-') // Replace consecutive hyphens
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .slice(0, VALIDATION_CONFIG.maxWorkerNameLength)
}

/**
 * Check if a value is a valid request method
 * @param method The method to check
 * @returns True if valid
 */
export function isValidMethod(method: string): boolean {
  return VALIDATION_CONFIG.allowedMethods.includes(method.toUpperCase())
}

/**
 * Parse and validate query parameters for dispatch
 * @param searchParams URL search parameters
 * @returns Parsed parameters with validation
 */
export function parseDispatchParams(
  searchParams: URLSearchParams
): {
  workerName: string | null
  path: string | null
  validation: ValidationResult
} {
  const workerName = searchParams.get('worker')
  const path = searchParams.get('path')

  if (!workerName) {
    return {
      workerName: null,
      path,
      validation: {
        valid: false,
        error: 'Worker parameter is required',
        code: 'MISSING_WORKER_PARAM',
      },
    }
  }

  const nameValidation = validateWorkerName(workerName)
  if (!nameValidation.valid) {
    return {
      workerName,
      path,
      validation: nameValidation,
    }
  }

  return {
    workerName,
    path,
    validation: { valid: true },
  }
}
