"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PLATFORM_BASE =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://recoder.xyz";

export function usePlatformApi<T>(
  path: string,
  options?: { enabled?: boolean; refreshInterval?: number }
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const authFailedRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (authFailedRef.current) return;
    try {
      setLoading(true);
      const res = await fetch(`${PLATFORM_BASE}${path}`, {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401) {
          authFailedRef.current = true;
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setError("unauthorized");
          return;
        }
        if (res.status === 403) {
          const body = await res.json().catch(() => null);
          if (body?.error === "plan_limit_exceeded") {
            setError(`limit:${JSON.stringify(body)}`);
            return;
          }
        }
        setError(`HTTP ${res.status}`);
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError("fetch_failed");
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    if (options?.enabled === false) return;
    authFailedRef.current = false;
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
