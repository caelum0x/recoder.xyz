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

import dns from 'dns';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import { loadStore, saveStore, getSlugForProject, getPublishedPath } from './persistence.js';

const resolveCname = promisify(dns.resolveCname);
const resolveTxt = promisify(dns.resolveTxt);

// ==================== Types ====================

export type DomainStatus = 'pending_dns' | 'dns_verified' | 'pending_ssl' | 'active' | 'error' | 'removed';

export interface CustomDomain {
  id: string;
  domain: string;
  projectId: string;
  userId: string;
  slug: string; // The published project slug this domain points to
  status: DomainStatus;
  createdAt: string;
  updatedAt: string;
  dnsVerifiedAt?: string;
  sslIssuedAt?: string;
  sslExpiresAt?: string;
  error?: string;
  // Expected CNAME target for DNS verification
  cnameTarget: string;
  // TXT verification record (alternative to CNAME)
  txtVerificationValue: string;
}

interface DomainStore {
  domains: Record<string, CustomDomain>; // keyed by domain name
  domainsByProject: Record<string, string[]>; // projectId -> domain names
}

// ==================== Constants ====================

const STORE_NAME = 'domains';
const CNAME_TARGET = 'web.recoder.xyz';
const TXT_PREFIX = 'recoder-verify=';
const NGINX_CUSTOM_DOMAINS_DIR = process.env.NGINX_CUSTOM_DOMAINS_DIR || '/etc/nginx/conf.d/custom-domains';
const CERTBOT_WEBROOT = process.env.CERTBOT_WEBROOT || '/var/www/html';
const CERTBOT_EMAIL = process.env.ACME_EMAIL || '';
const MAX_DOMAINS_PER_PROJECT = 5;

// ==================== Store ====================

let _store: DomainStore | null = null;

function getStore(): DomainStore {
  if (!_store) {
    _store = loadStore<DomainStore>(STORE_NAME, { domains: {}, domainsByProject: {} });
  }
  return _store;
}

function save(): void {
  if (_store) {
    saveStore(STORE_NAME, _store);
  }
}

// ==================== Domain CRUD ====================

/**
 * Add a custom domain for a published project.
 * The project must already be published (have a slug).
 */
export function addDomain(
  domain: string,
  projectId: string,
  userId: string,
): { success: boolean; domain?: CustomDomain; error?: string } {
  const store = getStore();
  const normalizedDomain = domain.trim().toLowerCase();

  // Validate domain format to prevent injection
  const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
  if (!DOMAIN_RE.test(normalizedDomain) || normalizedDomain.length > 253) {
    return { success: false, error: 'Invalid domain format' };
  }

  // Check if domain already registered
  if (store.domains[normalizedDomain]) {
    const existing = store.domains[normalizedDomain];
    if (existing.projectId === projectId && existing.status !== 'removed') {
      return { success: true, domain: existing };
    }
    if (existing.status !== 'removed') {
      return { success: false, error: 'Domain is already registered to another project' };
    }
  }

  // Check if project is published
  const slug = getSlugForProject(projectId);
  if (!slug) {
    return { success: false, error: 'Project must be published before adding a custom domain' };
  }

  // Check per-project limit
  const projectDomains = store.domainsByProject[projectId] || [];
  const activeDomains = projectDomains.filter(d => store.domains[d]?.status !== 'removed');
  if (activeDomains.length >= MAX_DOMAINS_PER_PROJECT) {
    return { success: false, error: `Maximum ${MAX_DOMAINS_PER_PROJECT} custom domains per project` };
  }

  // Generate verification token
  const verifyToken = generateVerificationToken(projectId, normalizedDomain);

  const record: CustomDomain = {
    id: `dom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    domain: normalizedDomain,
    projectId,
    userId,
    slug,
    status: 'pending_dns',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cnameTarget: CNAME_TARGET,
    txtVerificationValue: `${TXT_PREFIX}${verifyToken}`,
  };

  store.domains[normalizedDomain] = record;
  if (!store.domainsByProject[projectId]) {
    store.domainsByProject[projectId] = [];
  }
  if (!store.domainsByProject[projectId].includes(normalizedDomain)) {
    store.domainsByProject[projectId].push(normalizedDomain);
  }

  save();
  console.log(`[Domains] Added domain ${normalizedDomain} for project ${projectId} (slug: ${slug})`);

  return { success: true, domain: record };
}

/**
 * Remove a custom domain.
 */
export function removeDomain(
  domain: string,
  projectId: string,
): { success: boolean; error?: string } {
  const store = getStore();
  const normalizedDomain = domain.trim().toLowerCase();

  const record = store.domains[normalizedDomain];
  if (!record) {
    return { success: false, error: 'Domain not found' };
  }

  if (record.projectId !== projectId) {
    return { success: false, error: 'Domain belongs to a different project' };
  }

  // Mark as removed
  record.status = 'removed';
  record.updatedAt = new Date().toISOString();

  // Remove nginx config
  removeNginxConfig(normalizedDomain);

  // Remove from project list
  const projectDomains = store.domainsByProject[projectId] || [];
  store.domainsByProject[projectId] = projectDomains.filter(d => d !== normalizedDomain);

  // Clean up the record entirely
  delete store.domains[normalizedDomain];

  save();
  console.log(`[Domains] Removed domain ${normalizedDomain} from project ${projectId}`);

  return { success: true };
}

/**
 * Get all domains for a project.
 */
export function getDomainsForProject(projectId: string): CustomDomain[] {
  const store = getStore();
  const domainNames = store.domainsByProject[projectId] || [];
  return domainNames
    .map(d => store.domains[d])
    .filter((d): d is CustomDomain => !!d && d.status !== 'removed');
}

/**
 * Get a specific domain record.
 */
export function getDomain(domain: string): CustomDomain | null {
  const store = getStore();
  const record = store.domains[domain.trim().toLowerCase()];
  return record && record.status !== 'removed' ? record : null;
}

// ==================== DNS Verification ====================

/**
 * Verify DNS records for a domain.
 * Checks both CNAME and TXT records.
 */
export async function verifyDns(domain: string): Promise<{
  verified: boolean;
  method?: 'cname' | 'txt';
  error?: string;
}> {
  const store = getStore();
  const normalizedDomain = domain.trim().toLowerCase();
  const record = store.domains[normalizedDomain];

  if (!record) {
    return { verified: false, error: 'Domain not found' };
  }

  if (record.status === 'removed') {
    return { verified: false, error: 'Domain has been removed' };
  }

  // Try CNAME verification first
  try {
    const cnames = await resolveCname(normalizedDomain);
    if (cnames.some(c => c.toLowerCase() === CNAME_TARGET || c.toLowerCase() === CNAME_TARGET + '.')) {
      record.status = 'dns_verified';
      record.dnsVerifiedAt = new Date().toISOString();
      record.updatedAt = new Date().toISOString();
      record.error = undefined;
      save();
      console.log(`[Domains] DNS verified (CNAME) for ${normalizedDomain}`);
      return { verified: true, method: 'cname' };
    }
  } catch {
    // CNAME lookup failed, try TXT
  }

  // Try TXT verification
  try {
    const txtRecords = await resolveTxt(`_recoder-verify.${normalizedDomain}`);
    const flatRecords = txtRecords.map(r => r.join(''));
    if (flatRecords.some(r => r === record.txtVerificationValue)) {
      record.status = 'dns_verified';
      record.dnsVerifiedAt = new Date().toISOString();
      record.updatedAt = new Date().toISOString();
      record.error = undefined;
      save();
      console.log(`[Domains] DNS verified (TXT) for ${normalizedDomain}`);
      return { verified: true, method: 'txt' };
    }
  } catch {
    // TXT lookup also failed
  }

  record.error = 'DNS verification failed. Please add the required CNAME or TXT record.';
  record.updatedAt = new Date().toISOString();
  save();

  return { verified: false, error: record.error };
}

// ==================== SSL Provisioning ====================

/**
 * Request SSL certificate for a domain via certbot (Let's Encrypt).
 * Requires DNS to be verified first.
 */
export async function provisionSsl(domain: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const store = getStore();
  const normalizedDomain = domain.trim().toLowerCase();
  const record = store.domains[normalizedDomain];

  if (!record) {
    return { success: false, error: 'Domain not found' };
  }

  if (record.status !== 'dns_verified' && record.status !== 'pending_ssl' && record.status !== 'active') {
    return { success: false, error: 'DNS must be verified before requesting SSL' };
  }

  if (!CERTBOT_EMAIL) {
    return { success: false, error: 'ACME_EMAIL not configured on server' };
  }

  record.status = 'pending_ssl';
  record.updatedAt = new Date().toISOString();
  save();

  try {
    // Run certbot to get certificate
    execFileSync('certbot', [
      'certonly',
      '--webroot',
      '-w', CERTBOT_WEBROOT,
      '-d', normalizedDomain,
      '--email', CERTBOT_EMAIL,
      '--agree-tos',
      '--no-eff-email',
      '--non-interactive',
      '--keep-until-expiring',
    ], { timeout: 120000, stdio: 'pipe' });

    // Certificate obtained, update record
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

    record.status = 'active';
    record.sslIssuedAt = now.toISOString();
    record.sslExpiresAt = expiresAt.toISOString();
    record.error = undefined;
    record.updatedAt = now.toISOString();

    // Generate nginx config
    writeNginxConfig(record);

    save();
    console.log(`[Domains] SSL provisioned for ${normalizedDomain}`);

    return { success: true };
  } catch (err: any) {
    const errorMsg = err.stderr?.toString() || err.message || 'certbot failed';
    record.status = 'error';
    record.error = `SSL provisioning failed: ${errorMsg.slice(0, 500)}`;
    record.updatedAt = new Date().toISOString();
    save();
    console.error(`[Domains] SSL provisioning failed for ${normalizedDomain}:`, errorMsg);

    return { success: false, error: record.error };
  }
}

// ==================== Nginx Config ====================

/**
 * Generate and write nginx server block config for a custom domain.
 */
function writeNginxConfig(record: CustomDomain): void {
  const { domain, slug } = record;
  const publishedPath = getPublishedPath(slug);

  // Check if cert paths exist (they should after certbot)
  const certPath = `/etc/letsencrypt/live/${domain}/fullchain.pem`;
  const keyPath = `/etc/letsencrypt/live/${domain}/privkey.pem`;

  const config = `# Custom domain: ${domain}
# Project slug: ${slug}
# Generated: ${new Date().toISOString()}

server {
    listen 80;
    server_name ${domain};

    # ACME challenge for renewal
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${domain};

    ssl_certificate ${certPath};
    ssl_certificate_key ${keyPath};

    root ${publishedPath};
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html =404;
    }

    # Cache static assets
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|webp|woff|woff2|ttf|eot|otf)$ {
        expires 30d;
        add_header Cache-Control "public, max-age=2592000, immutable";
    }

    # HTML - no long-term cache
    location ~* \\.html?$ {
        expires 0;
        add_header Cache-Control "no-cache, must-revalidate";
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # CORS for fonts and assets
    add_header Access-Control-Allow-Origin "*" always;
}
`;

  try {
    // Ensure directory exists
    if (!fs.existsSync(NGINX_CUSTOM_DOMAINS_DIR)) {
      fs.mkdirSync(NGINX_CUSTOM_DOMAINS_DIR, { recursive: true });
    }

    const configPath = path.join(NGINX_CUSTOM_DOMAINS_DIR, `${domain}.conf`);
    fs.writeFileSync(configPath, config);
    console.log(`[Domains] Nginx config written for ${domain}`);

    // Reload nginx
    reloadNginx();
  } catch (err: any) {
    console.error(`[Domains] Failed to write nginx config for ${domain}:`, err.message);
  }
}

/**
 * Remove nginx config for a domain.
 */
function removeNginxConfig(domain: string): void {
  try {
    const configPath = path.join(NGINX_CUSTOM_DOMAINS_DIR, `${domain}.conf`);
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log(`[Domains] Nginx config removed for ${domain}`);
      reloadNginx();
    }
  } catch (err: any) {
    console.error(`[Domains] Failed to remove nginx config for ${domain}:`, err.message);
  }
}

/**
 * Reload nginx configuration (graceful reload).
 */
function reloadNginx(): void {
  try {
    execFileSync('nginx', ['-s', 'reload'], { timeout: 10000, stdio: 'pipe' });
    console.log('[Domains] Nginx reloaded');
  } catch (err: any) {
    // Might fail in dev or if nginx isn't running locally
    console.warn('[Domains] Failed to reload nginx (may not be running locally):', err.message?.slice(0, 200));
  }
}

// ==================== Full Provisioning Flow ====================

/**
 * Full domain setup: verify DNS → provision SSL → write nginx config.
 * Call this after DNS is expected to be configured.
 */
export async function activateDomain(domain: string): Promise<{
  success: boolean;
  status: DomainStatus;
  error?: string;
}> {
  // Step 1: Verify DNS
  const dnsResult = await verifyDns(domain);
  if (!dnsResult.verified) {
    return { success: false, status: 'pending_dns', error: dnsResult.error };
  }

  // Step 2: Provision SSL
  const sslResult = await provisionSsl(domain);
  if (!sslResult.success) {
    return { success: false, status: 'pending_ssl', error: sslResult.error };
  }

  return { success: true, status: 'active' };
}

// ==================== Background Jobs ====================

/**
 * Check and renew SSL certificates that are close to expiry (within 30 days).
 * Should be called periodically (e.g., daily via setInterval).
 */
export async function renewExpiringSsl(): Promise<void> {
  const store = getStore();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  for (const [domain, record] of Object.entries(store.domains)) {
    if (record.status !== 'active' || !record.sslExpiresAt) continue;

    const expiresAt = new Date(record.sslExpiresAt).getTime();
    if (expiresAt - now < thirtyDays) {
      console.log(`[Domains] Renewing SSL for ${domain} (expires: ${record.sslExpiresAt})`);
      await provisionSsl(domain);
    }
  }
}

/**
 * Start background SSL renewal check (runs daily).
 */
let _renewalInterval: ReturnType<typeof setInterval> | null = null;

export function startSslRenewalScheduler(): void {
  if (_renewalInterval) return;
  // Check every 24 hours
  _renewalInterval = setInterval(renewExpiringSsl, 24 * 60 * 60 * 1000);
  console.log('[Domains] SSL renewal scheduler started');
}

export function stopSslRenewalScheduler(): void {
  if (_renewalInterval) {
    clearInterval(_renewalInterval);
    _renewalInterval = null;
  }
}

// ==================== Helpers ====================

function generateVerificationToken(projectId: string, domain: string): string {
  // Simple hash-like token for verification
  const input = `${projectId}:${domain}:${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Get stats about custom domains.
 */
export function getDomainStats(): {
  total: number;
  active: number;
  pendingDns: number;
  pendingSsl: number;
  errors: number;
} {
  const store = getStore();
  const domains = Object.values(store.domains).filter(d => d.status !== 'removed');

  return {
    total: domains.length,
    active: domains.filter(d => d.status === 'active').length,
    pendingDns: domains.filter(d => d.status === 'pending_dns').length,
    pendingSsl: domains.filter(d => d.status === 'pending_ssl').length,
    errors: domains.filter(d => d.status === 'error').length,
  };
}
