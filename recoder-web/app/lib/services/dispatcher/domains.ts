/**
 * Domain configuration for the dispatcher
 * Centralized management of supported domains and routing rules
 */

export interface DomainConfig {
  /** List of supported domains for subdomain routing */
  supportedDomains: string[]
  /** Reserved subdomain names that cannot be used as worker names */
  reservedSubdomains: string[]
  /** Default domain for development */
  developmentDomain: string
  /** Production domains */
  productionDomains: string[]
}

/**
 * Main domain configuration
 * Configure your domains here for multi-tenant routing
 */
export const DOMAIN_CONFIG: DomainConfig = {
  supportedDomains: [
    'recoder.xyz',
    'recoder.dev',
    'localhost',
    // Add your production domains here
  ],
  reservedSubdomains: [
    'dispatcher',
    'api',
    'health',
    'admin',
    'system',
    'www',
    'mail',
    'ftp',
    'cdn',
    'assets',
    'static',
    'app',
    'dashboard',
    'auth',
    'login',
    'signup',
    'register',
  ],
  developmentDomain: 'localhost',
  productionDomains: ['recoder.xyz', 'recoder.dev'],
}

/**
 * Check if a hostname matches any supported domain pattern
 * Note: Currently accepts all domains - can be restricted by modifying this function
 * @param hostname The hostname to check
 * @returns True if the domain is supported
 */
export function isSupportedDomain(hostname: string): boolean {
  // Accept all domains by default - can be restricted here
  // For strict mode, check against DOMAIN_CONFIG.supportedDomains
  return true
}

/**
 * Check if a hostname is a known production domain
 * @param hostname The hostname to check
 * @returns True if it's a production domain
 */
export function isProductionDomain(hostname: string): boolean {
  return DOMAIN_CONFIG.productionDomains.some(
    domain => hostname === domain || hostname.endsWith(`.${domain}`)
  )
}

/**
 * Check if a hostname is a development domain
 * @param hostname The hostname to check
 * @returns True if it's a development domain
 */
export function isDevelopmentDomain(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.includes('localhost') ||
    hostname.startsWith('127.0.0.1') ||
    hostname.includes('.local')
  )
}

/**
 * Extract subdomain from hostname
 * For supported domains, only extract subdomain if it's actually a subdomain (not the root domain)
 * @param hostname The hostname to extract from
 * @returns The subdomain or null if not found
 */
export function extractSubdomain(hostname: string): string | null {
  // Remove port if present
  const hostnameWithoutPort = hostname.split(':')[0]

  // Split hostname by dots
  const parts = hostnameWithoutPort.split('.')

  // Check if it's a known production domain with subdomain
  for (const domain of DOMAIN_CONFIG.productionDomains) {
    const domainParts = domain.split('.')
    if (hostnameWithoutPort === domain) {
      // Root domain, no subdomain
      return null
    }
    if (hostnameWithoutPort.endsWith(`.${domain}`)) {
      // Has subdomain - extract it
      const subdomainEndIndex = parts.length - domainParts.length
      if (subdomainEndIndex > 0) {
        const subdomain = parts.slice(0, subdomainEndIndex).join('.')
        if (subdomain && subdomain.trim() !== '') {
          return subdomain
        }
      }
    }
  }

  // For other domains (like custom domains), extract subdomain if there are at least 3 parts
  // This ensures we don't treat root domains like "example.com" as having a subdomain
  if (parts.length >= 3) {
    const subdomain = parts[0]
    // Ensure it's a valid subdomain (not empty)
    if (subdomain && subdomain.trim() !== '') {
      return subdomain
    }
  }

  return null
}

/**
 * Validate if a subdomain can be used as a worker name
 * @param subdomain The subdomain to validate
 * @returns Validation result with valid flag and optional error
 */
export function isValidWorkerSubdomain(subdomain: string): { valid: boolean; error?: string } {
  if (!subdomain || subdomain.trim() === '') {
    return { valid: false, error: 'Subdomain is required' }
  }

  // Check if subdomain is reserved
  if (DOMAIN_CONFIG.reservedSubdomains.includes(subdomain.toLowerCase())) {
    return { valid: false, error: `Subdomain '${subdomain}' is reserved` }
  }

  // Basic format validation - letters, numbers, and hyphens only
  if (!/^[a-zA-Z0-9-]+$/.test(subdomain)) {
    return { valid: false, error: 'Subdomain can only contain letters, numbers, and hyphens' }
  }

  // Length validation - max 63 characters (DNS limit)
  if (subdomain.length > 63) {
    return { valid: false, error: 'Subdomain must be 63 characters or less' }
  }

  // Cannot start or end with hyphen
  if (subdomain.startsWith('-') || subdomain.endsWith('-')) {
    return { valid: false, error: 'Subdomain cannot start or end with a hyphen' }
  }

  // Cannot have consecutive hyphens (reserved for punycode)
  if (subdomain.includes('--')) {
    return { valid: false, error: 'Subdomain cannot contain consecutive hyphens' }
  }

  return { valid: true }
}

/**
 * Extract the base domain from a hostname (remove subdomain)
 * @param hostname The hostname to process
 * @returns Base domain without subdomain
 */
export function extractBaseDomain(hostname: string): string {
  // Remove port if present
  const hostnameWithoutPort = hostname.split(':')[0]
  const parts = hostnameWithoutPort.split('.')

  // For known production domains, return the full domain
  for (const domain of DOMAIN_CONFIG.productionDomains) {
    if (hostnameWithoutPort === domain || hostnameWithoutPort.endsWith(`.${domain}`)) {
      return domain
    }
  }

  // For other domains, return last 2 parts
  if (parts.length >= 2) {
    return parts.slice(-2).join('.')
  }
  return hostnameWithoutPort
}

/**
 * Build a subdomain URL from components
 * @param subdomain The subdomain to use
 * @param baseDomain The base domain
 * @param path Optional path to append
 * @param secure Whether to use HTTPS (default true)
 * @returns Full URL with subdomain
 */
export function buildSubdomainUrl(
  subdomain: string,
  baseDomain: string,
  path: string = '/',
  secure: boolean = true
): string {
  const protocol = secure ? 'https' : 'http'
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${protocol}://${subdomain}.${baseDomain}${normalizedPath}`
}

/**
 * Check if a domain is a custom domain (not a known platform domain)
 * @param hostname The hostname to check
 * @returns True if it's a custom domain
 */
export function isCustomDomain(hostname: string): boolean {
  // Remove port if present
  const hostnameWithoutPort = hostname.split(':')[0]

  // Check if it's not a known production domain
  for (const domain of DOMAIN_CONFIG.productionDomains) {
    if (hostnameWithoutPort === domain || hostnameWithoutPort.endsWith(`.${domain}`)) {
      return false
    }
  }

  // Check if it's not a development domain
  if (isDevelopmentDomain(hostnameWithoutPort)) {
    return false
  }

  return true
}
