"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PLATFORM_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://recoder.xyz";

/**
 * In-memory response cache shared across all hook instances.
 * Prevents duplicate concurrent requests and caches successful responses.
 */
const responseCache = new Map<
  string,
  { data: unknown; fetchedAt: number; promise?: Promise<unknown> }
>();

/** How long a cached response is considered fresh (ms) */
const CACHE_TTL = 60_000; // 1 minute

/** Deduplicate in-flight requests */
const inflightRequests = new Map<string, Promise<unknown>>();

async function cachedFetch<T>(path: string): Promise<{
  data: T | null;
  error: string | null;
}> {
  const now = Date.now();
  const cached = responseCache.get(path);

  // Return cached data if still fresh
  if (cached && now - cached.fetchedAt < CACHE_TTL) {
    return { data: cached.data as T, error: null };
  }

  // Deduplicate: if a request for this path is already in flight, wait for it
  const inflight = inflightRequests.get(path);
  if (inflight) {
    try {
      const result = await inflight;
      return { data: result as T, error: null };
    } catch {
      return { data: null, error: "fetch_failed" };
    }
  }

  // Start new request
  const fetchPromise = (async () => {
    const res = await fetch(`${PLATFORM_BASE}${path}`, {
      credentials: "include",
    });

    if (!res.ok) {
      if (res.status === 429) {
        // Rate limited — keep stale cache if available, don't retry
        if (cached) {
          return cached.data;
        }
        throw new Error("rate_limited");
      }
      if (res.status === 403) {
        const body = await res.json().catch(() => null);
        if (body?.error === "plan_limit_exceeded") {
          throw new Error(`limit:${JSON.stringify(body)}`);
        }
      }
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();
    responseCache.set(path, { data: json, fetchedAt: Date.now() });
    return json;
  })();

  inflightRequests.set(path, fetchPromise);

  try {
    const result = await fetchPromise;
    return { data: result as T, error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "fetch_failed";
    // On rate limit, return stale data if available
    if (message === "rate_limited" && cached) {
      return { data: cached.data as T, error: null };
    }
    return { data: null, error: message };
  } finally {
    inflightRequests.delete(path);
  }
}

export function usePlatformApi<T>(
  path: string,
  options?: { enabled?: boolean; refreshInterval?: number }
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rateLimitedRef = useRef(false);

  const fetchData = useCallback(async () => {
    // Skip polling if we were rate-limited (will retry on next manual refetch)
    if (rateLimitedRef.current) {
      return;
    }

    try {
      setLoading(true);
      const result = await cachedFetch<T>(path);
      if (result.data) {
        setData(result.data);
        setError(null);
      } else if (result.error) {
        if (result.error === "rate_limited") {
          rateLimitedRef.current = true;
          // Clear rate limit flag after 60 seconds
          setTimeout(() => {
            rateLimitedRef.current = false;
          }, 60_000);
        }
        setError(result.error);
      }
    } catch {
      setError("fetch_failed");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (options?.enabled === false) return;
    fetchData();
    if (options?.refreshInterval) {
      intervalRef.current = setInterval(fetchData, options.refreshInterval);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchData, options?.enabled, options?.refreshInterval]);

  return { data, error, loading, refetch: fetchData };
}

export async function platformFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${PLATFORM_BASE}${path}`, {
    credentials: "include",
    ...init,
  });
}

export { PLATFORM_BASE };
