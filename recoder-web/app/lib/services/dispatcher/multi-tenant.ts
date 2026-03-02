/**
 * Multi-Tenant Domain Handler
 * Manages custom domains and tenant-specific routing
 */

import type { CustomDomainProject, CustomDomainResult, ValidationResult } from './types'
import { CommonErrors, DispatcherError } from './errors'
import {
  isCustomDomain,
  extractBaseDomain,
  extractSubdomain,
  isValidWorkerSubdomain,
} from './domains'
import { generateRequestId } from './dispatcher'

/**
 * Custom domain configuration
 */
export interface CustomDomainConfig {
  /** The custom domain hostname */
  domain: string
  /** Project/tenant identifier */
  projectId: string
  /** Whether the domain has been verified */
  verified: boolean
  /** Production deploy URL to forward to */
  productionUrl?: string
  /** SSL certificate status */
  sslStatus?: 'pending' | 'active' | 'failed'
  /** Created timestamp */
  createdAt: Date
  /** Last verified timestamp */
  verifiedAt?: Date
}

/**
 * Domain verification methods
 */
export type VerificationMethod = 'dns_txt' | 'dns_cname' | 'http_file'

/**
 * Domain verification record
 */
export interface DomainVerification {
  /** Domain to verify */
  domain: string
  /** Verification method */
  method: VerificationMethod
  /** Expected record/file content */
  expectedValue: string
  /** Current verification status */
  verified: boolean
  /** Last check timestamp */
  lastCheckedAt?: Date
  /** Verification expiry */
  expiresAt?: Date
}

/**
 * In-memory domain registry
 * In production, replace with database storage
 */
class DomainRegistry {
  private domains: Map<string, CustomDomainConfig> = new Map()
  private verifications: Map<string, DomainVerification> = new Map()

  /**
   * Register a custom domain
   * @param config Domain configuration
   */
  register(config: CustomDomainConfig): void {
    this.domains.set(config.domain.toLowerCase(), config)
  }

  /**
   * Get domain configuration
   * @param domain The domain to look up
   * @returns Domain configuration or undefined
   */
  get(domain: string): CustomDomainConfig | undefined {
    return this.domains.get(domain.toLowerCase())
  }

  /**
   * Check if domain is registered
   * @param domain The domain to check
   * @returns Whether domain is registered
   */
  has(domain: string): boolean {
    return this.domains.has(domain.toLowerCase())
  }

  /**
   * Remove a domain registration
   * @param domain The domain to remove
   */
  remove(domain: string): void {
    this.domains.delete(domain.toLowerCase())
    this.verifications.delete(domain.toLowerCase())
  }

  /**
   * Get all domains for a project
   * @param projectId Project identifier
   * @returns Array of domain configurations
   */
  getByProject(projectId: string): CustomDomainConfig[] {
    return Array.from(this.domains.values()).filter((d) => d.projectId === projectId)
  }

  /**
   * Store verification record
   * @param verification Verification record
   */
  setVerification(verification: DomainVerification): void {
    this.verifications.set(verification.domain.toLowerCase(), verification)
  }

  /**
   * Get verification record
   * @param domain The domain
   * @returns Verification record or undefined
   */
  getVerification(domain: string): DomainVerification | undefined {
    return this.verifications.get(domain.toLowerCase())
  }
}

// Global domain registry instance
const domainRegistry = new DomainRegistry()

/**
 * Validate a custom domain format
 * @param domain The domain to validate
 * @returns Validation result
 */
export function validateCustomDomain(domain: string): ValidationResult {
  if (!domain || domain.trim() === '') {
    return {
      valid: false,
      error: 'Domain is required',
      code: 'DOMAIN_REQUIRED',
    }
  }

  // Remove protocol if present
  const cleanDomain = domain.replace(/^https?:\/\//, '').split('/')[0]

  // Basic format validation
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/
  if (!domainRegex.test(cleanDomain)) {
    return {
      valid: false,
      error: 'Invalid domain format',
      code: 'INVALID_DOMAIN_FORMAT',
    }
  }

  // Check length
  if (cleanDomain.length > 253) {
    return {
      valid: false,
      error: 'Domain name too long',
      code: 'DOMAIN_TOO_LONG',
    }
  }

  return { valid: true }
}

/**
 * Register a custom domain for a project
 * @param domain The custom domain
 * @param projectId Project identifier
 * @param productionUrl Optional production URL
 * @returns Registration result
 */
export function registerCustomDomain(
  domain: string,
  projectId: string,
  productionUrl?: string
): {
  success: boolean
  config?: CustomDomainConfig
  verification?: DomainVerification
  error?: string
} {
  // Validate domain format
  const validation = validateCustomDomain(domain)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').split('/')[0]

  // Check if already registered
  if (domainRegistry.has(cleanDomain)) {
    const existing = domainRegistry.get(cleanDomain)
    if (existing?.projectId !== projectId) {
      return { success: false, error: 'Domain is already registered to another project' }
    }
  }

  // Create domain configuration
  const config: CustomDomainConfig = {
    domain: cleanDomain,
    projectId,
    verified: false,
    productionUrl,
    sslStatus: 'pending',
    createdAt: new Date(),
  }

  // Generate verification record
  const verification: DomainVerification = {
    domain: cleanDomain,
    method: 'dns_txt',
    expectedValue: `recoder-verify=${generateVerificationToken(cleanDomain, projectId)}`,
    verified: false,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  }

  // Store in registry
  domainRegistry.register(config)
  domainRegistry.setVerification(verification)

  return {
    success: true,
    config,
    verification,
  }
}

/**
 * Generate a verification token for domain ownership
 * @param domain The domain
 * @param projectId Project identifier
 * @returns Verification token
 */
function generateVerificationToken(domain: string, projectId: string): string {
  // Simple token generation - in production use cryptographic signing
  const data = `${domain}:${projectId}:${Date.now()}`
  return Buffer.from(data).toString('base64').slice(0, 32)
}

/**
 * Verify a custom domain
 * @param domain The domain to verify
 * @returns Verification result
 */
export async function verifyCustomDomain(domain: string): Promise<{
  success: boolean
  verified: boolean
  error?: string
}> {
  const cleanDomain = domain.toLowerCase()

  const config = domainRegistry.get(cleanDomain)
  if (!config) {
    return { success: false, verified: false, error: 'Domain not registered' }
  }

  const verification = domainRegistry.getVerification(cleanDomain)
  if (!verification) {
    return { success: false, verified: false, error: 'Verification record not found' }
  }

  // Check if verification has expired
  if (verification.expiresAt && new Date() > verification.expiresAt) {
    return { success: false, verified: false, error: 'Verification has expired' }
  }

  // Perform DNS TXT record verification
  try {
    const { promises: dns } = await import('node:dns')
    const txtRecords = await dns.resolveTxt(cleanDomain)
    // txtRecords is an array of arrays (each TXT record can be chunked)
    const flatRecords = txtRecords.map((chunks) => chunks.join(''))

    const expectedValue = verification.expectedValue
    const found = flatRecords.some((record) => record === expectedValue)

    verification.lastCheckedAt = new Date()
    verification.verified = found

    if (found) {
      markDomainVerified(cleanDomain)
    }

    domainRegistry.setVerification(verification)

    return {
      success: true,
      verified: found,
    }
  } catch (dnsError) {
    verification.lastCheckedAt = new Date()
    domainRegistry.setVerification(verification)

    // ENOTFOUND / ENODATA means no TXT records — not verified yet
    const code = (dnsError as NodeJS.ErrnoException).code
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      return { success: true, verified: false }
    }

    return {
      success: false,
      verified: false,
      error: 'DNS lookup failed',
    }
  }
}

/**
 * Mark a domain as verified
 * @param domain The domain to mark as verified
 */
export function markDomainVerified(domain: string): void {
  const cleanDomain = domain.toLowerCase()
  const config = domainRegistry.get(cleanDomain)
  const verification = domainRegistry.getVerification(cleanDomain)

  if (config) {
    config.verified = true
    config.verifiedAt = new Date()
    config.sslStatus = 'active'
    domainRegistry.register(config)
  }

  if (verification) {
    verification.verified = true
    domainRegistry.setVerification(verification)
  }
}

/**
 * Look up a custom domain configuration
 * @param hostname The hostname to look up
 * @returns Custom domain project or null
 */
export async function lookupCustomDomain(hostname: string): Promise<CustomDomainProject | null> {
  const cleanHostname = hostname.toLowerCase().split(':')[0]

  const config = domainRegistry.get(cleanHostname)
  if (!config) {
    return null
  }

  return {
    id: config.projectId,
    name: config.projectId, // Would come from database in production
    slug: config.projectId,
    customDomain: config.domain,
    customDomainVerified: config.verified,
    productionDeployUrl: config.productionUrl,
    createdAt: config.createdAt,
    updatedAt: config.verifiedAt || config.createdAt,
  }
}

/**
 * Validate a custom domain project configuration
 * @param project The project to validate
 * @returns Validation result with valid flag and optional error
 */
export function validateCustomDomainProject(project: CustomDomainProject): {
  valid: boolean
  error?: string
} {
  if (!project.customDomainVerified) {
    return { valid: false, error: 'Custom domain has not been verified' }
  }

  if (!project.productionDeployUrl) {
    return { valid: false, error: 'Production deploy URL is not configured' }
  }

  return { valid: true }
}

/**
 * Get verification instructions for a domain
 * @param domain The domain
 * @returns Verification instructions or null
 */
export function getVerificationInstructions(domain: string): {
  method: VerificationMethod
  instructions: string[]
  expectedValue: string
} | null {
  const verification = domainRegistry.getVerification(domain.toLowerCase())
  if (!verification) {
    return null
  }

  const instructions: string[] = []

  switch (verification.method) {
    case 'dns_txt':
      instructions.push(`Add a TXT record to your DNS configuration for ${domain}`)
      instructions.push(`Set the record value to: ${verification.expectedValue}`)
      instructions.push('Wait for DNS propagation (may take up to 48 hours)')
      instructions.push('Click "Verify" to check your DNS configuration')
      break

    case 'dns_cname':
      instructions.push(`Add a CNAME record for ${domain}`)
      instructions.push(`Point it to: ${verification.expectedValue}`)
      instructions.push('Wait for DNS propagation')
      break

    case 'http_file':
      instructions.push(`Create a file at: https://${domain}/.well-known/recoder-verification`)
      instructions.push(`File content should be: ${verification.expectedValue}`)
      break
  }

  return {
    method: verification.method,
    instructions,
    expectedValue: verification.expectedValue,
  }
}

/**
 * Update production URL for a domain
 * @param domain The domain
 * @param productionUrl New production URL
 * @returns Whether update was successful
 */
export function updateProductionUrl(domain: string, productionUrl: string): boolean {
  const config = domainRegistry.get(domain.toLowerCase())
  if (!config) {
    return false
  }

  config.productionUrl = productionUrl
  domainRegistry.register(config)
  return true
}

/**
 * Get all custom domains for a project
 * @param projectId Project identifier
 * @returns Array of domain configurations
 */
export function getProjectDomains(projectId: string): CustomDomainConfig[] {
  return domainRegistry.getByProject(projectId)
}

/**
 * Remove a custom domain
 * @param domain The domain to remove
 * @param projectId Project identifier (for authorization)
 * @returns Whether removal was successful
 */
export function removeCustomDomain(domain: string, projectId: string): boolean {
  const config = domainRegistry.get(domain.toLowerCase())
  if (!config) {
    return false
  }

  // Verify ownership
  if (config.projectId !== projectId) {
    return false
  }

  domainRegistry.remove(domain)
  return true
}

/**
 * Handle a request to a custom domain
 * @param request The incoming request
 * @param requestId Optional request ID
 * @returns Custom domain result with response
 */
export async function handleCustomDomainRequest(
  request: Request,
  requestId?: string
): Promise<CustomDomainResult> {
  const id = requestId || generateRequestId()
  const url = new URL(request.url)
  const hostname = url.hostname

  // Look up the custom domain
  const project = await lookupCustomDomain(hostname)
  if (!project) {
    return {
      success: false,
      error: 'Custom domain not found',
      response: new Response(
        JSON.stringify({
          error: 'Custom domain not found',
          message: `The domain '${hostname}' is not configured`,
          requestId: id,
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    }
  }

  // Validate the project configuration
  const validation = validateCustomDomainProject(project)
  if (!validation.valid) {
    return {
      success: false,
      error: validation.error,
      project,
      response: new Response(
        JSON.stringify({
          error: 'Custom domain configuration invalid',
          message: validation.error,
          domain: hostname,
          requestId: id,
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    }
  }

  // Forward the request to the production URL
  try {
    const response = await forwardToProductionUrl(request, project.productionDeployUrl!, id)
    return {
      success: true,
      response,
      project,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Request forwarding failed',
      project,
      response: new Response(
        JSON.stringify({
          error: 'Service temporarily unavailable',
          message: 'Failed to forward request to application',
          domain: hostname,
          requestId: id,
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      ),
    }
  }
}

/**
 * Forward request to production URL
 * @param request Original request
 * @param productionUrl Target production URL
 * @param requestId Request ID for tracking
 * @returns Response from production URL
 */
async function forwardToProductionUrl(
  request: Request,
  productionUrl: string,
  requestId: string
): Promise<Response> {
  const originalUrl = new URL(request.url)
  const targetUrl = new URL(productionUrl)

  // Construct forward URL
  const forwardUrl = new URL(originalUrl.pathname + originalUrl.search, targetUrl.origin)

  // Create forwarding request
  const headers = new Headers(request.headers)
  headers.set('X-Forwarded-Host', originalUrl.hostname)
  headers.set('X-Forwarded-Proto', originalUrl.protocol.slice(0, -1))
  headers.set('X-Request-ID', requestId)
  headers.set('X-Custom-Domain', 'true')

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'

  const forwardRequest = new Request(forwardUrl.href, {
    method: request.method,
    headers,
    body: hasBody ? request.body : null,
    duplex: 'half',
  } as RequestInit)

  return fetch(forwardRequest)
}
