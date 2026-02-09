export interface DomainPolicy {
  allowedDomains?: string[];
  blockedDomains?: string[];
}

export interface UrlValidationOptions extends DomainPolicy {
  allowHttp?: boolean;
}

const METADATA_IPV4 = new Set([
  '169.254.169.254', // AWS, GCP, Azure, DigitalOcean
  '100.100.100.200', // Alibaba Cloud
]);

const METADATA_IPV6 = new Set([
  'fd00:ec2::254', // AWS IMDSv2 IPv6
]);

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

export function parseDomainList(value?: string | string[]): string[] | undefined {
  if (!value) return undefined;
  const items = Array.isArray(value) ? value : value.split(',');
  const normalized = items
    .map((item) => normalizeDomain(item))
    .filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function isIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isPrivateIpv4(hostname: string): boolean {
  if (!isIpv4(hostname)) return false;
  if (METADATA_IPV4.has(hostname)) return true;
  const [a, b] = hostname.split('.').map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isIpv6(hostname: string): boolean {
  return hostname.includes(':');
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80')) return true;
  if (normalized.startsWith('::ffff:127.')) return true;
  return false;
}

function isInternalHostname(hostname: string): boolean {
  if (!hostname) return true;
  if (hostname === 'localhost') return true;
  if (hostname.endsWith('.localhost')) return true;
  if (hostname.endsWith('.local')) return true;
  if (hostname.endsWith('.internal')) return true; // catches metadata.google.internal
  if (hostname.endsWith('.home.arpa')) return true;
  if (hostname.endsWith('.amazonaws.com') && hostname.startsWith('169.254.')) return true;
  if (!hostname.includes('.') && !isIpv6(hostname)) return true;
  return false;
}

function matchesDomainRule(hostname: string, rule: string): boolean {
  return hostname === rule || hostname.endsWith(`.${rule}`);
}

export function isDomainAllowed(hostname: string, policy?: DomainPolicy): boolean {
  const normalizedHost = normalizeDomain(hostname);
  if (!normalizedHost) return false;

  const blockedDomains = policy?.blockedDomains || [];
  if (blockedDomains.some((rule) => matchesDomainRule(normalizedHost, rule))) {
    return false;
  }

  const allowedDomains = policy?.allowedDomains || [];
  if (allowedDomains.length === 0) return true;
  return allowedDomains.some((rule) => matchesDomainRule(normalizedHost, rule));
}

export function validateWebUrl(rawUrl: string, options?: UrlValidationOptions): { valid: boolean; reason?: string; normalizedUrl?: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { valid: false, reason: 'URL is required' };
  }

  const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return { valid: false, reason: 'Invalid URL' };
  }

  if (parsed.protocol !== 'https:' && !(options?.allowHttp && parsed.protocol === 'http:')) {
    return { valid: false, reason: 'Only HTTPS URLs are allowed' };
  }

  const hostname = normalizeDomain(parsed.hostname);
  if (isInternalHostname(hostname)) {
    return { valid: false, reason: `Blocked internal host: ${hostname}` };
  }
  if (isPrivateIpv4(hostname) || isPrivateIpv6(hostname)) {
    return { valid: false, reason: `Blocked private address: ${hostname}` };
  }
  if (!isDomainAllowed(hostname, options)) {
    return { valid: false, reason: `Domain policy blocks host: ${hostname}` };
  }

  return { valid: true, normalizedUrl: parsed.toString() };
}

async function resolveDnsAddresses(hostname: string): Promise<string[]> {
  try {
    const dns = await import('node:dns/promises');
    const results = await dns.lookup(hostname, { all: true, verbatim: true });
    return results.map((entry) => entry.address).filter(Boolean);
  } catch {
    return [];
  }
}

function isBlockedResolvedAddress(address: string): boolean {
  const normalized = normalizeDomain(address);
  if (isPrivateIpv4(normalized)) return true;
  if (isPrivateIpv6(normalized)) return true;
  if (METADATA_IPV6.has(normalized)) return true;
  return false;
}

export async function validateWebUrlWithDns(
  rawUrl: string,
  options?: UrlValidationOptions
): Promise<{ valid: boolean; reason?: string; normalizedUrl?: string }> {
  const base = validateWebUrl(rawUrl, options);
  if (!base.valid || !base.normalizedUrl) {
    return base;
  }

  try {
    const parsed = new URL(base.normalizedUrl);
    const hostname = normalizeDomain(parsed.hostname);
    if (isIpv4(hostname) || isIpv6(hostname)) {
      return base;
    }

    const addresses = await resolveDnsAddresses(hostname);
    if (addresses.length === 0) {
      // Best effort: keep existing hostname validation when DNS resolution is unavailable.
      return base;
    }
    if (addresses.some((address) => isBlockedResolvedAddress(address))) {
      return { valid: false, reason: `Host resolves to a private/internal address: ${hostname}` };
    }

    return base;
  } catch {
    return { valid: false, reason: 'Failed to validate URL DNS resolution' };
  }
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

export async function safeFetchWithRedirects(
  inputUrl: string,
  options?: SafeFetchOptions & UrlValidationOptions
): Promise<Response> {
  const maxRedirects = Math.max(0, Math.min(options?.maxRedirects ?? 3, 5));
  let currentUrl = inputUrl;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const validated = await validateWebUrlWithDns(currentUrl, options);
    if (!validated.valid || !validated.normalizedUrl) {
      throw new Error(validated.reason || 'URL blocked');
    }

    const response = await fetch(validated.normalizedUrl, {
      method: 'GET',
      redirect: 'manual',
      signal: options?.signal,
      headers: options?.headers,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Redirect response missing location header');
      }
      currentUrl = new URL(location, validated.normalizedUrl).toString();
      continue;
    }

    return response;
  }

  throw new Error(`Too many redirects (>${maxRedirects})`);
}
