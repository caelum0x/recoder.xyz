'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { toast } from 'sonner';
import { CheckCircle, XCircle, MessageCircle, AlertTriangle } from 'lucide-react';
import { resolveBackendApiUrl } from '@/lib/runtime-urls';
import { connectTokenizedSSE, type TokenizedSSEConnection } from '@/lib/realtime/sse';

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

function handleNotificationEvent(event: MessageEvent) {
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
}

export function NotificationToastProvider() {
  const { session } = useAuth();
  const connectionRef = useRef<TokenizedSSEConnection | null>(null);

  useEffect(() => {
    if (!session?.user) return;

    // Check notification preferences
    try {
      const prefs = JSON.parse(localStorage.getItem('notification-preferences') || '{}');
      if (prefs.push === false) return;
    } catch {
      // ignore parse errors
    }

    const backendUrl = resolveBackendApiUrl();
    const url = `${backendUrl}/notifications/stream`;

    // Use connectTokenizedSSE which has:
    // - Auto-reconnect with configurable delay
    // - Fetch-based SSE (bypasses EventSource entirely to avoid HTTP/2 issues)
    // - Automatic token injection via query param
    connectionRef.current = connectTokenizedSSE({
      url,
      reconnectDelayMs: 5000,
      events: {
        message: handleNotificationEvent,
      },
    });

    return () => {
      connectionRef.current?.close();
      connectionRef.current = null;
    };
  }, [session?.user]);

  return null; // This is a side-effect-only provider
}
