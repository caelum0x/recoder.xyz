// Abuse guards for the public, unauthenticated POST /api/leads endpoint — the
// only acquisition path while releases are gated. Everything here is pure and
// in-memory: one marketing-site process on one box, so a process-local token
// bucket is the right weight (a restart resetting buckets is acceptable).

/** Requests allowed in a full bucket (burst). */
export const RATE_LIMIT_BURST = 5;
/** One token refills per this many milliseconds (≈5/min sustained). */
export const RATE_LIMIT_REFILL_MS = 12_000;
/** Hard bound on tracked IPs — beyond this, idle entries are evicted first. */
export const RATE_LIMIT_MAX_ENTRIES = 4096;
/** An entry untouched this long is evictable. */
export const RATE_LIMIT_IDLE_MS = 10 * 60 * 1000;

interface Bucket {
  tokens: number;
  lastRefillMs: number;
  lastSeenMs: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Take one token from `ip`'s bucket. Returns true when the request is allowed.
 * The map is bounded: when full, idle entries are evicted; if none are idle the
 * oldest-seen entry goes (an attacker cycling IPs evicts itself, not the map).
 */
export function takeRateLimitToken(ip: string, nowMs: number): boolean {
  let bucket = buckets.get(ip);
  if (!bucket) {
    if (buckets.size >= RATE_LIMIT_MAX_ENTRIES) {
      evictOne(nowMs);
    }
    bucket = { tokens: RATE_LIMIT_BURST, lastRefillMs: nowMs, lastSeenMs: nowMs };
    buckets.set(ip, bucket);
  }
  const refilled = Math.floor((nowMs - bucket.lastRefillMs) / RATE_LIMIT_REFILL_MS);
  if (refilled > 0) {
    bucket.tokens = Math.min(RATE_LIMIT_BURST, bucket.tokens + refilled);
    bucket.lastRefillMs += refilled * RATE_LIMIT_REFILL_MS;
  }
  bucket.lastSeenMs = nowMs;
  if (bucket.tokens <= 0) return false;
  bucket.tokens -= 1;
  return true;
}

function evictOne(nowMs: number): void {
  let oldestKey: string | null = null;
  let oldestSeen = Infinity;
  for (const [key, bucket] of buckets) {
    if (nowMs - bucket.lastSeenMs > RATE_LIMIT_IDLE_MS) {
      buckets.delete(key);
      return;
    }
    if (bucket.lastSeenMs < oldestSeen) {
      oldestSeen = bucket.lastSeenMs;
      oldestKey = key;
    }
  }
  if (oldestKey != null) buckets.delete(oldestKey);
}

/** Test seam: reset all buckets. */
export function resetRateLimit(): void {
  buckets.clear();
}

/** Current tracked-IP count (bound observability for tests). */
export function rateLimitSize(): number {
  return buckets.size;
}

/**
 * The lead form never renders a `website` field — only bots autofilling every
 * input set it. A tripped honeypot is dropped without storage; the route still
 * answers 201 so scripts don't learn to skip the field. This deliberate
 * deception targets abusive automation only — a human submission never trips it.
 */
export function isHoneypotTripped(body: { website?: unknown }): boolean {
  return typeof body.website === "string" && body.website.trim() !== "";
}

/**
 * First client IP from x-forwarded-for (nginx fronts this app), else a stable
 * fallback key so direct hits still share one bucket instead of bypassing it.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}
