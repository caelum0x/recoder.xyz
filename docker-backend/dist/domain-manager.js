"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addDomain = addDomain;
exports.removeDomain = removeDomain;
exports.getDomainsForProject = getDomainsForProject;
exports.getDomain = getDomain;
exports.verifyDns = verifyDns;
exports.provisionSsl = provisionSsl;
exports.activateDomain = activateDomain;
exports.renewExpiringSsl = renewExpiringSsl;
exports.startSslRenewalScheduler = startSslRenewalScheduler;
exports.stopSslRenewalScheduler = stopSslRenewalScheduler;
exports.getDomainStats = getDomainStats;
const dns_1 = __importDefault(require("dns"));
const util_1 = require("util");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const persistence_js_1 = require("./persistence.js");
const resolveCname = (0, util_1.promisify)(dns_1.default.resolveCname);
const resolveTxt = (0, util_1.promisify)(dns_1.default.resolveTxt);
// ==================== Constants ====================
const STORE_NAME = 'domains';
const CNAME_TARGET = 'web.recoder.xyz';
const TXT_PREFIX = 'recoder-verify=';
const NGINX_CUSTOM_DOMAINS_DIR = process.env.NGINX_CUSTOM_DOMAINS_DIR || '/etc/nginx/conf.d/custom-domains';
const CERTBOT_WEBROOT = process.env.CERTBOT_WEBROOT || '/var/www/html';
const CERTBOT_EMAIL = process.env.ACME_EMAIL || '';
const MAX_DOMAINS_PER_PROJECT = 5;
// ==================== Store ====================
let _store = null;
function getStore() {
    if (!_store) {
        _store = (0, persistence_js_1.loadStore)(STORE_NAME, { domains: {}, domainsByProject: {} });
    }
    return _store;
}
function save() {
    if (_store) {
        (0, persistence_js_1.saveStore)(STORE_NAME, _store);
    }
}
// ==================== Domain CRUD ====================
/**
 * Add a custom domain for a published project.
 * The project must already be published (have a slug).
 */
function addDomain(domain, projectId, userId) {
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
    const slug = (0, persistence_js_1.getSlugForProject)(projectId);
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
    const record = {
        id: `dom_${Date.now()}_${crypto_1.default.randomUUID().slice(0, 8)}`,
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
function removeDomain(domain, projectId) {
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
function getDomainsForProject(projectId) {
    const store = getStore();
    const domainNames = store.domainsByProject[projectId] || [];
    return domainNames
        .map(d => store.domains[d])
        .filter((d) => !!d && d.status !== 'removed');
}
/**
 * Get a specific domain record.
 */
function getDomain(domain) {
    const store = getStore();
    const record = store.domains[domain.trim().toLowerCase()];
    return record && record.status !== 'removed' ? record : null;
}
// ==================== DNS Verification ====================
/**
 * Verify DNS records for a domain.
 * Checks both CNAME and TXT records.
 */
async function verifyDns(domain) {
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
    }
    catch {
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
    }
    catch {
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
async function provisionSsl(domain) {
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
        (0, child_process_1.execFileSync)('certbot', [
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
    }
    catch (err) {
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
function writeNginxConfig(record) {
    const { domain, slug } = record;
    const publishedPath = (0, persistence_js_1.getPublishedPath)(slug);
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
        if (!fs_1.default.existsSync(NGINX_CUSTOM_DOMAINS_DIR)) {
            fs_1.default.mkdirSync(NGINX_CUSTOM_DOMAINS_DIR, { recursive: true });
        }
        const configPath = path_1.default.join(NGINX_CUSTOM_DOMAINS_DIR, `${domain}.conf`);
        fs_1.default.writeFileSync(configPath, config);
        console.log(`[Domains] Nginx config written for ${domain}`);
        // Reload nginx
        reloadNginx();
    }
    catch (err) {
        console.error(`[Domains] Failed to write nginx config for ${domain}:`, err.message);
    }
}
/**
 * Remove nginx config for a domain.
 */
function removeNginxConfig(domain) {
    try {
        const configPath = path_1.default.join(NGINX_CUSTOM_DOMAINS_DIR, `${domain}.conf`);
        if (fs_1.default.existsSync(configPath)) {
            fs_1.default.unlinkSync(configPath);
            console.log(`[Domains] Nginx config removed for ${domain}`);
            reloadNginx();
        }
    }
    catch (err) {
        console.error(`[Domains] Failed to remove nginx config for ${domain}:`, err.message);
    }
}
/**
 * Reload nginx configuration (graceful reload).
 */
function reloadNginx() {
    try {
        (0, child_process_1.execFileSync)('nginx', ['-s', 'reload'], { timeout: 10000, stdio: 'pipe' });
        console.log('[Domains] Nginx reloaded');
    }
    catch (err) {
        // Might fail in dev or if nginx isn't running locally
        console.warn('[Domains] Failed to reload nginx (may not be running locally):', err.message?.slice(0, 200));
    }
}
// ==================== Full Provisioning Flow ====================
/**
 * Full domain setup: verify DNS → provision SSL → write nginx config.
 * Call this after DNS is expected to be configured.
 */
async function activateDomain(domain) {
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
async function renewExpiringSsl() {
    const store = getStore();
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    for (const [domain, record] of Object.entries(store.domains)) {
        if (record.status !== 'active' || !record.sslExpiresAt)
            continue;
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
let _renewalInterval = null;
function startSslRenewalScheduler() {
    if (_renewalInterval)
        return;
    // Check every 24 hours
    _renewalInterval = setInterval(renewExpiringSsl, 24 * 60 * 60 * 1000);
    console.log('[Domains] SSL renewal scheduler started');
}
function stopSslRenewalScheduler() {
    if (_renewalInterval) {
        clearInterval(_renewalInterval);
        _renewalInterval = null;
    }
}
// ==================== Helpers ====================
function generateVerificationToken(_projectId, _domain) {
    // Crypto-grade random token for domain ownership verification
    return `recoder-verify-${crypto_1.default.randomBytes(16).toString('hex')}`;
}
/**
 * Get stats about custom domains.
 */
function getDomainStats() {
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
