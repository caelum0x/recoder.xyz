'use client';

import { backendApi } from '@/lib/api-client';
import { useAuth } from '@/components/AuthProvider';
import { getSessionAccessToken } from '@/lib/auth/session-token';
import { connectTokenizedSSE, type TokenizedSSEConnection } from '@/lib/realtime/sse';
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type PresenceStatus = 'online' | 'idle' | 'offline';
type PresenceEventPayload = {
  type: string;
  session_id?: string;
  account_id: string;
  active_thread_id: string | null;
  platform?: string;
  status?: PresenceStatus;
  last_seen?: string;
  client_timestamp?: string;
};

type PresenceContextValue = {
  activeThreadId: string | null;
  setActiveThreadId: (threadId: string | null) => void;
  connectionState: 'idle' | 'connecting' | 'connected' | 'error';
  presences: Record<string, PresenceEventPayload>;
  sessionId: string | null;
};

const PresenceContext = createContext<PresenceContextValue | undefined>(undefined);

const HEARTBEAT_INTERVAL = 60000;
const DEBOUNCE_DELAY = 500;

const DISABLE_PRESENCE = process.env.NEXT_PUBLIC_DISABLE_PRESENCE === 'true';

function generateSessionId(): string {
  // Use crypto.randomUUID if available, otherwise fallback to a custom implementation
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback UUID v4 implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeThreadId, setActiveThreadState] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [presences, setPresences] = useState<Record<string, PresenceEventPayload>>({});
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    
    let storedId = sessionStorage.getItem('presence_session_id');
    if (!storedId) {
      storedId = generateSessionId();
      sessionStorage.setItem('presence_session_id', storedId);
    } else {
    }
    return storedId;
  });
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const presenceStreamRef = useRef<TokenizedSSEConnection | null>(null);
  const latestThreadRef = useRef<string | null>(null);
  const pendingRequestRef = useRef<Promise<void> | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSentThreadRef = useRef<string | null>(null);
  const hasInitializedRef = useRef<boolean>(false);
  const lastUpdateTimeRef = useRef<number>(0);
  const MIN_UPDATE_INTERVAL = 2000; // Minimum 2 seconds between updates

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const sendPresenceUpdate = useCallback(
    async (threadId: string | null, force: boolean = false) => {
      if (DISABLE_PRESENCE || !user || !sessionId) {
        return;
      }

      const threadKey = threadId || 'null';
      const now = Date.now();

      if (!force && now - lastUpdateTimeRef.current < MIN_UPDATE_INTERVAL) {
        
        return;
      }

      if (!force && lastSentThreadRef.current === threadKey && pendingRequestRef.current) {
        
        return;
      }

      if (pendingRequestRef.current) {
        try {
          await pendingRequestRef.current;
        } catch {
        }
      }

      const timestamp = new Date().toISOString();
      lastSentThreadRef.current = threadKey;
      lastUpdateTimeRef.current = now;

      const requestPromise = (async () => {
        try {
          
          await backendApi.post('/presence/update', {
            session_id: sessionId,
            active_thread_id: threadId,
            platform: 'web',
            client_timestamp: timestamp,
          }, { showErrors: false });
        } catch (err) {
          console.error('[Presence] Update failed:', err);
          throw err;
        } finally {
          setTimeout(() => {
            if (pendingRequestRef.current === requestPromise) {
              pendingRequestRef.current = null;
            }
          }, 100);
        }
      })();

      pendingRequestRef.current = requestPromise;
      return requestPromise;
    },
    [user, sessionId],
  );

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    if (!user) {
      return;
    }
    heartbeatRef.current = setInterval(() => {
      sendPresenceUpdate(latestThreadRef.current);
    }, HEARTBEAT_INTERVAL);
  }, [sendPresenceUpdate, stopHeartbeat, user]);

  const stopPresenceStream = useCallback(() => {
    if (presenceStreamRef.current) {
      presenceStreamRef.current.close();
      presenceStreamRef.current = null;
    }
    setConnectionState('idle');
  }, []);

  const applyViewers = useCallback(
    (threadId: string, viewers: Array<Record<string, unknown>>) => {
      const nextPresences: Record<string, PresenceEventPayload> = {};
      viewers.forEach((viewer, index) => {
        const accountId =
          typeof viewer.account_id === 'string'
            ? viewer.account_id
            : typeof viewer.user_id === 'string'
              ? viewer.user_id
              : '';
        if (!accountId) {
          return;
        }

        const sessionIdValue =
          typeof viewer.session_id === 'string'
            ? viewer.session_id
            : `${accountId}:${index}`;
        const activeThread =
          typeof viewer.active_thread_id === 'string'
            ? viewer.active_thread_id
            : threadId;

        nextPresences[`${accountId}:${sessionIdValue}`] = {
          type: 'presence_update',
          session_id: sessionIdValue,
          account_id: accountId,
          active_thread_id: activeThread,
          platform: typeof viewer.platform === 'string' ? viewer.platform : undefined,
          status: activeThread ? 'online' : 'idle',
          last_seen: typeof viewer.last_seen === 'string' ? viewer.last_seen : undefined,
          client_timestamp:
            typeof viewer.client_timestamp === 'string' ? viewer.client_timestamp : undefined,
        };
      });
      setPresences(nextPresences);
      setConnectionState('connected');
    },
    []
  );

  const startPresenceStream = useCallback(
    async (threadIdOverride?: string | null) => {
      stopPresenceStream();
      if (DISABLE_PRESENCE || !user) {
        return;
      }

      const threadId = threadIdOverride ?? latestThreadRef.current;
      if (!threadId) {
        setPresences({});
        setConnectionState('idle');
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!apiUrl) {
        setConnectionState('error');
        return;
      }

      setConnectionState('connecting');
      presenceStreamRef.current = connectTokenizedSSE({
        url: `${apiUrl}/presence/thread/${threadId}/stream`,
        events: {
          'presence.update': (event) => {
            try {
              const parsed = JSON.parse(event.data as string) as {
                thread_id?: string;
                viewers?: Array<Record<string, unknown>>;
              };
              const payloadThreadId = parsed.thread_id || threadId;
              const viewers = Array.isArray(parsed.viewers) ? parsed.viewers : [];
              applyViewers(payloadThreadId, viewers);
            } catch (error) {
              console.error('[Presence] Failed to parse presence update:', error);
            }
          },
        },
      });
    },
    [applyViewers, stopPresenceStream, user]
  );

  const sendBeaconClear = useCallback(() => {
    if (DISABLE_PRESENCE || typeof navigator === 'undefined' || !sessionId) {
      return;
    }
    const apiUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!apiUrl) {
      return;
    }

    const token = sessionTokenRef.current;
    if (!token) {
      return;
    }

    const url = new URL(`${apiUrl}/presence/clear`);
    url.searchParams.set('token', token);
    url.searchParams.set('session_id', sessionId);
    
    const payload = new Blob([JSON.stringify({})], { type: 'application/json' });
    navigator.sendBeacon(url.toString(), payload);
    
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('presence_session_id');
    }
  }, [sessionId]);

  const setActiveThreadId = useCallback((threadId: string | null) => {
    const normalized = threadId || null;
    
    if (latestThreadRef.current === normalized) {
      return;
    }
    
    latestThreadRef.current = normalized;
    setActiveThreadState(normalized);
    
    if (DISABLE_PRESENCE || !user) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      sendPresenceUpdate(normalized, true);
      startHeartbeat();
      void startPresenceStream(normalized);
    }, DEBOUNCE_DELAY);
  }, [sendPresenceUpdate, startHeartbeat, startPresenceStream, user]);

  useEffect(() => {
    if (DISABLE_PRESENCE || !user) {
      stopHeartbeat();
      stopPresenceStream();
      setConnectionState('idle');
      setPresences({});
      latestThreadRef.current = null;
      setActiveThreadState(null);
      lastSentThreadRef.current = null;
      hasInitializedRef.current = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }
    
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      sendPresenceUpdate(latestThreadRef.current, true);
    }
    
    startHeartbeat();
    void startPresenceStream();
    
    return () => {
      stopHeartbeat();
      stopPresenceStream();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [sendPresenceUpdate, startHeartbeat, startPresenceStream, stopHeartbeat, stopPresenceStream, user]);

  useEffect(() => {
    if (DISABLE_PRESENCE || typeof document === 'undefined') {
      return;
    }
    
    let wasHidden = document.hidden;
    
    const handleVisibilityChange = () => {
      if (!user) {
        return;
      }
      
      if (wasHidden === document.hidden) {
        return;
      }
      
      wasHidden = document.hidden;
      
      if (document.hidden) {
        stopHeartbeat();
        stopPresenceStream();
        sendPresenceUpdate(null, false);
      } else {
        if (hasInitializedRef.current) {
          sendPresenceUpdate(latestThreadRef.current, false);
        }
        startHeartbeat();
        void startPresenceStream();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sendPresenceUpdate, startHeartbeat, startPresenceStream, stopHeartbeat, stopPresenceStream, user]);

  useEffect(() => {
    if (!user) {
      sessionTokenRef.current = null;
      return;
    }

    let cancelled = false;
    const refreshToken = async () => {
      const token = await getSessionAccessToken();
      if (!cancelled) {
        sessionTokenRef.current = token;
      }
    };
    void refreshToken();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handler = () => {
      void sendBeaconClear();
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  }, [sendBeaconClear]);

  const value = useMemo(() => ({
    activeThreadId,
    setActiveThreadId,
    connectionState,
    presences,
    sessionId,
  }), [activeThreadId, connectionState, presences, setActiveThreadId, sessionId]);

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresenceContext() {
  const context = useContext(PresenceContext);
  if (!context) {
    throw new Error('usePresenceContext must be used within PresenceProvider');
  }
  return context;
}
