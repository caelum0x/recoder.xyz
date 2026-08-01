/**
 * egress-guard — a shared outbound-request trust boundary (SSRF defense).
 *
 * Agents drive real network calls (browser automation, git clone, webhook/preview
 * fetches). Without a guard, a hostile task/URL can reach loopback, the cloud
 * metadata endpoint (169.254.169.254), or private RFC-1918 space — the classic
 * SSRF pivot. This module refuses non-http(s) schemes and any address that
 * resolves into a non-public range, and it does so at a single chokepoint so
 * every egress site enforces the same policy.
 *
 * Two entry points:
 *   - assertEgressAllowed(url)          — SYNC: scheme + literal-IP/hostname guard.
 *   - assertEgressAllowedResolved(url, resolve) — ASYNC: DNS-resolves the host and
 *     re-checks every resolved address, so a public hostname that maps to a
 *     private/metadata IP is still blocked. The resolver is injected (no direct
 *     `dns` coupling), which makes the anti-SSRF core deterministically testable.
 */
import { isIP } from 'node:net';

export type HostClass = 'public' | 'loopback' | 'private' | 'link-local' | 'metadata' | 'unspecified' | 'invalid';

export class EgressBlockedError extends Error {
  readonly code = 'EGRESS_BLOCKED';
  readonly reason: string;
  readonly target: string;
  constructor(target: string, reason: string) {
    super(`egress blocked: ${reason} (${target})`);
    this.name = 'EgressBlockedError';
    this.reason = reason;
    this.target = target;
  }
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:']);

/** Parse a dotted-quad into its four octets, or null if not a valid IPv4. */
function ipv4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
  if (nums.some((n) => n < 0 || n > 255)) return null;
  return nums as [number, number, number, number];
}

function classifyIpv4(ip: string): HostClass {
  const o = ipv4Octets(ip);
  if (o == null) return 'invalid';
  const [a, b] = o;
  if (a === 0) return 'unspecified'; // 0.0.0.0/8
  if (a === 127) return 'loopback'; // 127.0.0.0/8
  if (a === 169 && b === 254) {
    // 169.254.0.0/16 link-local; 169.254.169.254 is the cloud metadata endpoint.
    return o[2] === 169 && o[3] === 254 ? 'metadata' : 'link-local';
  }
  if (a === 10) return 'private'; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return 'private'; // 172.16.0.0/12
  if (a === 192 && b === 168) return 'private'; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return 'private'; // 100.64.0.0/10 CGNAT
  return 'public';
}

function classifyIpv6(raw: string): HostClass {
  // Strip a zone id (fe80::1%eth0) and lowercase for prefix checks.
  const ip = raw.split('%')[0].toLowerCase();
  if (ip === '::1') return 'loopback';
  if (ip === '::' ) return 'unspecified';
  // IPv4-mapped, dotted form (::ffff:127.0.0.1) — classify by the embedded v4.
  const mappedDotted = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted) return classifyIpv4(mappedDotted[1]);
  // IPv4-mapped, hex form (::ffff:7f00:1) — the WHATWG URL parser normalizes to
  // this; reconstruct the dotted v4 from the trailing 32 bits.
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return classifyIpv4(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`);
  }
  if (ip.startsWith('fe80')) return 'link-local'; // fe80::/10
  if (ip.startsWith('fc') || ip.startsWith('fd')) return 'private'; // fc00::/7 ULA
  if (ip === 'fd00:ec2::254') return 'metadata'; // IMDSv2 IPv6 metadata
  return 'public';
}

/** Classify a literal IP address. Non-IP input returns 'invalid'. */
export function classifyIp(ip: string): HostClass {
  const kind = isIP(ip);
  if (kind === 4) return classifyIpv4(ip);
  if (kind === 6) return classifyIpv6(ip);
  return 'invalid';
}

/** Hostnames that must never be reachable regardless of resolution. */
function blockedHostname(host: string): HostClass | null {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || h.endsWith('.localhost')) return 'loopback';
  // Cloud metadata hostnames commonly used instead of the literal IP.
  if (h === 'metadata.google.internal' || h === 'metadata' || h === 'instance-data') return 'metadata';
  return null;
}

/** True for any class we refuse to reach. */
function isBlockedClass(c: HostClass): boolean {
  return c !== 'public';
}

function parseUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new EgressBlockedError(url, 'unparseable url');
  }
  if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
    throw new EgressBlockedError(url, `scheme '${parsed.protocol}' not allowed (http/https only)`);
  }
  return parsed;
}

/**
 * SYNC guard: reject a non-http(s) scheme, and — when the host is a LITERAL IP or
 * a known-dangerous hostname — reject non-public targets. A DNS hostname passes
 * here (its resolution is unknown synchronously); use assertEgressAllowedResolved
 * to also block hostnames that resolve into private/metadata space.
 */
export function assertEgressAllowed(url: string): URL {
  const parsed = parseUrl(url);
  const host = parsed.hostname.replace(/^\[|\]$/g, ''); // unwrap [::1]
  const named = blockedHostname(host);
  if (named != null) throw new EgressBlockedError(url, `blocked host class '${named}'`);
  if (isIP(host) !== 0) {
    const c = classifyIp(host);
    if (isBlockedClass(c)) throw new EgressBlockedError(url, `blocked ip class '${c}'`);
  }
  return parsed;
}

export type HostResolver = (host: string) => Promise<string[]>;

/**
 * ASYNC guard: sync checks PLUS a DNS re-check — resolves the hostname and blocks
 * the request if ANY resolved address is non-public. Pass an injected resolver
 * (e.g. a wrapper over dns.lookup with `all:true`) so this stays testable and the
 * DNS-rebinding window is closed at the point of use.
 */
export async function assertEgressAllowedResolved(url: string, resolve: HostResolver): Promise<URL> {
  const parsed = assertEgressAllowed(url);
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) !== 0) return parsed; // already a literal IP, vetted above
  let addrs: string[];
  try {
    addrs = await resolve(host);
  } catch {
    throw new EgressBlockedError(url, 'dns resolution failed');
  }
  if (addrs.length === 0) throw new EgressBlockedError(url, 'host did not resolve');
  for (const addr of addrs) {
    const c = classifyIp(addr);
    if (c === 'invalid' || isBlockedClass(c)) {
      throw new EgressBlockedError(url, `host resolves to blocked address ${addr} (${c})`);
    }
  }
  return parsed;
}
