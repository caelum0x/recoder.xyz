import { isIP } from 'node:net';

/**
 * SSRF guard for operator-supplied pilot proof URLs. Accepts only public
 * HTTP(S) URLs and rejects loopback / link-local / private / reserved hosts,
 * including IPv4-mapped IPv6 addresses (see `mappedIpv4From`).
 *
 * Kept prisma-free (and in its own module) so the guard is unit-testable
 * without loading the Prisma client that `service.ts` pulls in at import time.
 */
export function isPublicHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return false;
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.invalid') ||
    hostname.endsWith('.example')
  ) return false;
  const version = isIP(hostname);
  if (version === 4) return !isPrivateIpv4(hostname);
  if (version === 6) return !isPrivateIpv6(hostname);
  return hostname.includes('.');
}

function isPrivateIpv4(hostname: string): boolean {
  const [a, b] = hostname.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (
    normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
    normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb')
  ) {
    return true;
  }
  const mappedIpv4 = mappedIpv4From(normalized);
  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
}

/**
 * Extract the embedded IPv4 from an IPv4-mapped IPv6 address so a mapped
 * loopback/private/metadata host (e.g. ::ffff:169.254.169.254) can't tunnel past
 * the private-IP denylist. `new URL()` canonicalises the dotted form to hex
 * (::ffff:127.0.0.1 → ::ffff:7f00:1), so both encodings must be decoded.
 */
function mappedIpv4From(hostname: string): string | null {
  const dotted = hostname.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (dotted) return dotted;
  const hex = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const high = parseInt(hex[1], 16);
  const low = parseInt(hex[2], 16);
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}
