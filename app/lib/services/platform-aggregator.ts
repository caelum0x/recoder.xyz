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

export const APP_ENDPOINTS = [
  { app: "agents", url: "https://agents.recoder.xyz/api/platform/activity" },
  { app: "agency", url: "https://agency.recoder.xyz/api/platform/activity" },
  { app: "pm", url: "https://pm.recoder.xyz/api/platform/activity" },
  { app: "web", url: "https://web.recoder.xyz/api/platform/activity" },
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
        return (await res.json()) as AppActivity;
      } catch {
        return emptyActivity(app, "unavailable");
      }
    }),
  );

  return results;
}
