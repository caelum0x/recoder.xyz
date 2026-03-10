'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { toast } from 'sonner';
import { CheckCircle, XCircle, MessageCircle, AlertTriangle } from 'lucide-react';
import { resolveBackendApiUrl } from '@/lib/runtime-urls';
import { getSessionAccessToken } from '@/lib/auth/session-token';

interface NotificationEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  created_at?: string;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  'agent.completed': <CheckCircle className="h-4 w-4 text-green-500" />,
  'agent.failed': <XCircle className="h-4 w-4 text-red-500" />,
  'thread.message': <MessageCircle className="h-4 w-4 text-blue-500" />,
  'system.alert': <AlertTriangle className="h-4 w-4 text-amber-500" />,
};

const TOAST_TYPE_MAP: Record<string, 'success' | 'error' | 'info' | 'warning'> = {
  'agent.completed': 'success',
  'agent.failed': 'error',
  'thread.message': 'info',
  'system.alert': 'warning',
};

export function NotificationToastProvider() {
  const { session } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!session?.user) return;

    // Check notification preferences
    try {
      const prefs = JSON.parse(localStorage.getItem('notification-preferences') || '{}');
      if (prefs.push === false) return;
    } catch {
      // ignore parse errors
    }

    let cancelled = false;

    async function connect() {
      if (cancelled) return;

      // Get a session token to pass as query param (EventSource cannot set headers)
      const token = await getSessionAccessToken();
      if (!token || cancelled) return;

      const backendUrl = resolveBackendApiUrl();
      const url = `${backendUrl}/notifications/stream?token=${encodeURIComponent(token)}`;

      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data: NotificationEvent = JSON.parse(event.data);
          const toastType = TOAST_TYPE_MAP[data.type] || 'info';
          const icon = ICON_MAP[data.type];

          toast[toastType](data.title, {
            description: data.message,
            icon,
            duration: 5000,
          });
        } catch {
          // Ignore parse errors (heartbeats, etc.)
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        if (!cancelled) {
          // Reconnect after 5 seconds
          reconnectTimeoutRef.current = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [session?.user]);

  return null; // This is a side-effect-only provider
}
