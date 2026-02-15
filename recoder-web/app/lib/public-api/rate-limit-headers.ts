const RATE_LIMIT_HEADER_NAMES = [
  'Retry-After',
  'RateLimit-Limit',
  'RateLimit-Remaining',
  'RateLimit-Reset',
  'RateLimit-Policy',
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'X-RateLimit-Window',
] as const;

export function copyRateLimitHeaders(
  source: Headers,
  target: Headers,
): void {
  for (const headerName of RATE_LIMIT_HEADER_NAMES) {
    const value = source.get(headerName);
    if (value) {
      target.set(headerName, value);
    }
  }
}

