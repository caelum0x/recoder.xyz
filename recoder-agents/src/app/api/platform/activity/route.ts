import { NextRequest, NextResponse } from "next/server";
import { resolveBackendApiUrl } from "@/lib/runtime-urls";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BackendThread {
  thread_id: string;
  project_id?: string | null;
  name?: string;
  is_public?: boolean;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
  project?: {
    name?: string;
    project_id?: string;
    icon_name?: string | null;
  };
}

interface BackendThreadsResponse {
  threads: BackendThread[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface ActivityItem {
  id: string;
  type: "thread";
  title: string;
  timestamp: string;
  url: string;
}

interface ActivityResponse {
  app: "agents";
  stats: {
    totalItems: number;
    activeItems: number;
    lastActivityAt: string | null;
  };
  recentActivity: ActivityItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BACKEND_TIMEOUT_MS = 3_000;
const RECENT_ACTIVITY_LIMIT = 10;
const AGENTS_BASE_URL = "https://agents.recoder.xyz";

function emptyResponse(): ActivityResponse {
  return {
    app: "agents",
    stats: { totalItems: 0, activeItems: 0, lastActivityAt: null },
    recentActivity: [],
  };
}

/**
 * Fetch threads from the backend API.
 *
 * Uses RECODER_ADMIN_API_KEY as a Bearer token for service-to-service auth.
 * The backend's verify_and_get_user_id_from_jwt treats Bearer tokens as
 * better-auth session tokens, so in production the admin key should be
 * configured as a valid service-account session token.
 */
async function fetchThreadsFromBackend(
  page: number,
  limit: number,
): Promise<BackendThreadsResponse | null> {
  const backendUrl = process.env.BACKEND_INTERNAL_URL || resolveBackendApiUrl();
  const adminKey = process.env.RECODER_ADMIN_API_KEY;

  if (!backendUrl || !adminKey) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BACKEND_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
    });

    const res = await fetch(`${backendUrl}/threads?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminKey}`,
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn(
        `[platform/activity] Backend /threads returned ${res.status}`,
      );
      return null;
    }

    return (await res.json()) as BackendThreadsResponse;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // AbortError is expected on timeout -- no need to log loudly
    if (message.includes("abort")) {
      console.warn("[platform/activity] Backend /threads request timed out");
    } else {
      console.error("[platform/activity] Backend /threads error:", message);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Determine whether a thread was active within the last `days` days.
 */
function isActiveWithinDays(thread: BackendThread, days: number): boolean {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const updatedMs = new Date(thread.updated_at).getTime();
  return updatedMs >= cutoff;
}

/**
 * Build a user-facing URL for a thread.
 */
function threadUrl(thread: BackendThread): string {
  const projectId = thread.project_id ?? thread.project?.project_id;
  if (projectId) {
    return `${AGENTS_BASE_URL}/projects/${projectId}/thread/${thread.thread_id}`;
  }
  // Fallback for threads without a project (rare)
  return `${AGENTS_BASE_URL}/thread/${thread.thread_id}`;
}

/**
 * Derive a human-readable title for a thread.
 */
function threadTitle(thread: BackendThread): string {
  if (thread.name && thread.name.trim()) {
    return thread.name.trim();
  }
  if (thread.project?.name && thread.project.name.trim()) {
    return thread.project.name.trim();
  }
  // Fallback: abbreviated thread ID
  return `Thread ${thread.thread_id.slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  // 1. Verify internal service key
  const serviceKey = request.headers.get("x-internal-service-key");
  const expectedKey = process.env.INTERNAL_SERVICE_KEY;

  if (!expectedKey || serviceKey !== expectedKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Fetch threads from backend (page 1, generous limit for stats)
  const data = await fetchThreadsFromBackend(1, 100);

  if (!data || !data.threads) {
    // Backend unavailable or misconfigured -- return empty but valid payload
    return NextResponse.json(emptyResponse());
  }

  const { threads, pagination } = data;
  const totalItems = pagination.total;

  // 3. Compute active threads (updated within last 7 days)
  const activeItems = threads.filter((t) => isActiveWithinDays(t, 7)).length;

  // 4. Determine most recent activity timestamp
  let lastActivityAt: string | null = null;
  if (threads.length > 0) {
    // Threads are returned sorted by created_at DESC; pick the most recent
    // updated_at across all returned threads.
    const mostRecent = threads.reduce((latest, t) => {
      const ts = new Date(t.updated_at).getTime();
      return ts > latest ? ts : latest;
    }, 0);
    if (mostRecent > 0) {
      lastActivityAt = new Date(mostRecent).toISOString();
    }
  }

  // 5. Build recent activity list (most recently updated first)
  const sorted = [...threads]
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    )
    .slice(0, RECENT_ACTIVITY_LIMIT);

  const recentActivity: ActivityItem[] = sorted.map((t) => ({
    id: t.thread_id,
    type: "thread" as const,
    title: threadTitle(t),
    timestamp: t.updated_at,
    url: threadUrl(t),
  }));

  // 6. Respond
  const response: ActivityResponse = {
    app: "agents",
    stats: {
      totalItems,
      activeItems,
      lastActivityAt,
    },
    recentActivity,
  };

  return NextResponse.json(response);
}
