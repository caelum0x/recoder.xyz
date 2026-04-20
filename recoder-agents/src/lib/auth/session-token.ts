import { parseSessionTokenResponse } from '@/lib/auth/contracts';

let cachedToken: string | null = null;
let cacheExpiryMs = 0;
let failureCacheExpiryMs = 0;
let inflightTokenRequest: Promise<string | null> | null = null;

const SUCCESS_CACHE_MS = 15_000;
const FAILURE_CACHE_MS = 10_000;

export async function getSessionAccessToken(forceRefresh = false): Promise<string | null> {
  const now = Date.now();
  if (!forceRefresh) {
    if (cachedToken && now < cacheExpiryMs) {
      return cachedToken;
    }

    if (now < failureCacheExpiryMs) {
      return null;
    }
  }

  if (inflightTokenRequest) {
    return inflightTokenRequest;
  }

  inflightTokenRequest = (async () => {
    try {
      const response = await fetch("/api/auth/session-token", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        cachedToken = null;
        cacheExpiryMs = 0;
        failureCacheExpiryMs = Date.now() + FAILURE_CACHE_MS;
        return null;
      }

      const payload = parseSessionTokenResponse(await response.json());
      const token = payload.data?.accessToken ?? null;

      cachedToken = token;
      cacheExpiryMs = token ? Date.now() + SUCCESS_CACHE_MS : 0;
      failureCacheExpiryMs = token ? 0 : Date.now() + FAILURE_CACHE_MS;
      return token;
    } catch {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[auth/session-token] invalid or unavailable session-token payload');
      }
      cachedToken = null;
      cacheExpiryMs = 0;
      failureCacheExpiryMs = Date.now() + FAILURE_CACHE_MS;
      return null;
    } finally {
      inflightTokenRequest = null;
    }
  })();

  return inflightTokenRequest;
}

export async function requireSessionAccessToken(): Promise<string> {
  const token = await getSessionAccessToken();
  if (!token) {
    throw new Error("You must be logged in to continue");
  }
  return token;
}
