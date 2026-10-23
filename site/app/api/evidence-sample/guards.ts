// Abuse guards for the public, unauthenticated POST /api/evidence-sample
// endpoint (the "Evidence Sample" lead magnet). This endpoint does real
// parsing + hashing + (optionally) Ed25519 signing per request, so it is
// heavier than /api/leads — the token bucket here is tighter and the request
// body is hard-capped so a large paste can't turn into a memory/CPU problem.
//
// Same in-memory, process-local token-bucket shape as site/app/api/leads —
// one marketing-site process on one box, a restart resetting buckets is fine.

/** Requests allowed in a full bucket (burst). */
export const RATE_LIMIT_BURST = 3;
/** One token refills per this many milliseconds (~1 request per 20s sustained). */
export const RATE_LIMIT_REFILL_MS = 20_000;
/** Hard bound on tracked IPs — beyond this, idle entries are evicted first. */
export const RATE_LIMIT_MAX_ENTRIES = 4096;
/** An entry untouched this long is evictable. */
export const RATE_LIMIT_IDLE_MS = 10 * 60 * 1000;

/** Hard caps on pasted input size — generous for a real PR diff, but bounded. */
export const MAX_DIFF_CHARS = 200_000;
export const MAX_VERIFICATION_CHARS = 60_000;
export const MAX_TASK_DESCRIPTION_CHARS = 2_000;

interface Bucket {
  tokens: number;
  lastRefillMs: number;
  lastSeenMs: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Take one token from `ip`'s bucket. Returns true when the request is allowed.
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
