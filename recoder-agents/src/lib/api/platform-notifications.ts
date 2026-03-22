import { requireSessionAccessToken } from '@/lib/auth/session-token';

// Always call the main recoder.xyz app for platform-level endpoints
const PLATFORM_URL = 'https://recoder.xyz';

export interface PlatformNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  sourceApp: 'agents' | 'agency' | 'pm' | 'web';
  actionUrl?: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: PlatformNotification[];
  unreadCount: number;
}

/**
 * Fetch platform notifications from recoder.xyz.
 * Uses direct fetch with session cookies (not backendApi) because the
 * endpoint lives on the main recoder.xyz domain, not the backend API.
 */
export async function getNotifications(): Promise<NotificationsResponse> {
  const token = await requireSessionAccessToken();

  const response = await fetch(`${PLATFORM_URL}/api/platform/notifications`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to fetch notifications' }));
    throw new Error(error.detail || error.message || `Failed to fetch notifications: ${response.status}`);
  }

  return response.json();
}

/**
 * Mark a single notification as read.
 */
export async function markNotificationRead(id: string): Promise<void> {
  const token = await requireSessionAccessToken();

  const response = await fetch(`${PLATFORM_URL}/api/platform/notifications/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    credentials: 'include',
    body: JSON.stringify({ read: true }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to mark notification as read' }));
    throw new Error(error.detail || error.message || `Failed to mark notification as read: ${response.status}`);
  }
}

/**
 * Mark all notifications as read.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const token = await requireSessionAccessToken();

  const response = await fetch(`${PLATFORM_URL}/api/platform/notifications/mark-all-read`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to mark all notifications as read' }));
    throw new Error(error.detail || error.message || `Failed to mark all notifications as read: ${response.status}`);
  }
}
