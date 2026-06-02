/**
 * Platform Aggregator Service
 *
 * Fetches activity data from all Recoder ecosystem apps in parallel.
 * Each app exposes a `/api/platform/activity` endpoint that returns
 * stats and recent activity.  Failures are isolated per-app so one
 * unavailable service never blocks the rest.
 */

export interface AppActivity {
  app: string;
  stats: {
    totalItems: number;
    activeItems: number;
    lastActivityAt: string | null;
  };
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    timestamp: string;
    url: string;
  }>;
  error?: string;
}

/**
 * Activity endpoints for each ecosystem app.
 *
 * These calls are server-to-server and run from the same host as the target
 * apps in production.  Routing them through the public Cloudflare edge gets
 * them challenged by Bot Fight Mode (UA `node` looks bot-like) and rejected
 * with a 403 "Just a moment..." page.  To avoid that, each URL can be
 * overridden via env to point at the app's internal loopback port, bypassing
 * Cloudflare entirely.  The public URL is kept as a safe fallback.
 */
export const APP_ENDPOINTS = [
  {
    app: "agents",
    url:
      process.env.AGENTS_ACTIVITY_URL ??
      "https://agents.recoder.xyz/api/platform/activity",
  },
  {
    app: "agency",
    url:
      process.env.AGENCY_ACTIVITY_URL ??
      "https://agency.recoder.xyz/api/platform/activity",
  },
  {
    app: "pm",
    url:
      process.env.PM_ACTIVITY_URL ??
      "https://pm.recoder.xyz/api/platform/activity",
  },
];

const TIMEOUT_MS = 3000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function emptyActivity(app: string, error: string): AppActivity {
  return {
    app,
    stats: { totalItems: 0, activeItems: 0, lastActivityAt: null },
    recentActivity: [],
    error,
  };
}

export async function fetchAllAppActivity(): Promise<AppActivity[]> {
  const serviceKey = process.env.INTERNAL_SERVICE_KEY ?? "";

  const results = await Promise.all(
    APP_ENDPOINTS.map(async ({ app, url }) => {
      try {
        const res = await fetchWithTimeout(
          url,
          {
            headers: { "x-internal-service-key": serviceKey },
          },
          TIMEOUT_MS,
        );
        if (!res.ok) {
          return emptyActivity(app, "unavailable");
        }
        const json = await res.json();
        return {
          app,
          stats: json.stats ?? { totalItems: 0, activeItems: 0, lastActivityAt: null },
          recentActivity: Array.isArray(json.recentActivity) ? json.recentActivity : [],
          ...(json.error ? { error: json.error } : {}),
        } as AppActivity;
      } catch {
        return emptyActivity(app, "unavailable");
      }
    }),
  );

  return results;
}
