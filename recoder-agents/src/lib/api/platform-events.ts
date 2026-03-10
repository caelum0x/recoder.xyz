import { requireSessionAccessToken } from '@/lib/auth/session-token';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlatformEvent {
  type: 'agent.task.completed' | 'agent.thread.created' | 'agent.error.occurred';
  userId: string;
  title: string;
  message: string;
  sourceApp: 'agents';
  actionUrl?: string;
  channels?: ('in_app' | 'email' | 'push')[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLATFORM_EVENTS_URL =
  `${process.env.NEXT_PUBLIC_URL || 'https://recoder.xyz'}/api/platform/events`;

async function platformEventFetch<T>(
  options: RequestInit = {},
): Promise<T> {
  const token = await requireSessionAccessToken();

  const res = await fetch(PLATFORM_EVENTS_URL, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => 'Unknown error');
    throw new Error(body || `Platform event request failed with status ${res.status}`);
  }

  if (res.status === 204) {
    return undefined!;
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Emit a platform event to the central recoder.xyz event bus. */
export async function emitPlatformEvent(event: PlatformEvent): Promise<void> {
  return platformEventFetch<void>({
    method: 'POST',
    body: JSON.stringify(event),
  });
}
