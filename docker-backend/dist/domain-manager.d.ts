/**
 * Custom Domain Manager
 * Handles domain registration, DNS verification, SSL provisioning (Let's Encrypt),
 * and nginx config generation for custom domains on published projects.
 *
 * Architecture:
 *  - Domain records stored in JSON persistence (data/domains.json)
 *  - DNS verification via CNAME record lookup (dns.resolveCname)
 *  - SSL via certbot (Let's Encrypt) - free
 *  - Nginx config generated per-domain, included via /etc/nginx/conf.d/custom-domains/*.conf
 */
export type DomainStatus = 'pending_dns' | 'dns_verified' | 'pending_ssl' | 'active' | 'error' | 'removed';
export interface CustomDomain {
    id: string;
    domain: string;
    projectId: string;
    userId: string;
    slug: string;
    status: DomainStatus;
    createdAt: string;
    updatedAt: string;
    dnsVerifiedAt?: string;
    sslIssuedAt?: string;
    sslExpiresAt?: string;
    error?: string;
    cnameTarget: string;
    txtVerificationValue: string;
}
/**
 * Add a custom domain for a published project.
 * The project must already be published (have a slug).
 */
export declare function addDomain(domain: string, projectId: string, userId: string): {
    success: boolean;
    domain?: CustomDomain;
    error?: string;
};
/**
 * Remove a custom domain.
 */
export declare function removeDomain(domain: string, projectId: string): {
    success: boolean;
    error?: string;
};
/**
 * Get all domains for a project.
 */
export declare function getDomainsForProject(projectId: string): CustomDomain[];
/**
 * Get a specific domain record.
 */
export declare function getDomain(domain: string): CustomDomain | null;
/**
 * Verify DNS records for a domain.
 * Checks both CNAME and TXT records.
 */
export declare function verifyDns(domain: string): Promise<{
    verified: boolean;
    method?: 'cname' | 'txt';
    error?: string;
}>;
/**
 * Request SSL certificate for a domain via certbot (Let's Encrypt).
 * Requires DNS to be verified first.
 */
export declare function provisionSsl(domain: string): Promise<{
    success: boolean;
    error?: string;
}>;
/**
 * Full domain setup: verify DNS → provision SSL → write nginx config.
 * Call this after DNS is expected to be configured.
 */
export declare function activateDomain(domain: string): Promise<{
    success: boolean;
    status: DomainStatus;
    error?: string;
}>;
/**
 * Check and renew SSL certificates that are close to expiry (within 30 days).
 * Should be called periodically (e.g., daily via setInterval).
 */
export declare function renewExpiringSsl(): Promise<void>;
export declare function startSslRenewalScheduler(): void;
export declare function stopSslRenewalScheduler(): void;
/**
 * Get stats about custom domains.
 */
export declare function getDomainStats(): {
    total: number;
    active: number;
    pendingDns: number;
    pendingSsl: number;
    errors: number;
};
