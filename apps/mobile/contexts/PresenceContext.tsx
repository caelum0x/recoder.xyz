import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import EventSource from 'react-native-sse';
import { API_URL, getAuthToken } from '@/api/config';
import { useAuthContext } from '@/contexts/AuthContext';
import { log } from '@/lib/logger';

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
const SESSION_STORAGE_KEY = 'presence_session_id';

const DISABLE_PRESENCE = process.env.EXPO_PUBLIC_DISABLE_PRESENCE === 'true';

function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

export function PresenceProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, user } = useAuthContext();
  const [activeThreadId, setActiveThreadState] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [presences, setPresences] = useState<Record<string, PresenceEventPayload>>({});
  const [sessionId, setSessionId] = useState<string | null>(null);
  
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceStreamRef = useRef<EventSource | null>(null);
  const latestThreadRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const pendingRequestRef = useRef<Promise<void> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentThreadRef = useRef<string | null>(null);

  useEffect(() => {
    async function loadSessionId() {
      try {
        let storedId = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
        if (!storedId) {
          storedId = generateSessionId();
          await AsyncStorage.setItem(SESSION_STORAGE_KEY, storedId);
        }
        setSessionId(storedId);
      } catch (error) {
        log.error('[Presence] Failed to load session ID:', error);
        const fallbackId = generateSessionId();
        setSessionId(fallbackId);
      }
    }
    loadSessionId();
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  const sendPresenceUpdate = useCallback(
    async (threadId: string | null, force: boolean = false) => {
      if (DISABLE_PRESENCE || !isAuthenticated || !user || !sessionId) {
        return;
      }

      const threadKey = threadId || 'null';
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

      const requestPromise = (async () => {
        try {
          const token = await getAuthToken();
          if (!token) return;

          await fetch(`${API_URL}/presence/update`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              session_id: sessionId,
              active_thread_id: threadId,
              platform: Platform.OS,
              client_timestamp: timestamp,
            }),
          });
        } catch (err) {
          log.error('[Presence] Update failed:', err);
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
    [isAuthenticated, user, sessionId],
  );

  const startHeartbeat = useCallback(() => {
    stopHeartbeat();
    if (!isAuthenticated || !user) {
      return;
    }
    heartbeatRef.current = setInterval(() => {
      sendPresenceUpdate(latestThreadRef.current);
    }, HEARTBEAT_INTERVAL);
  }, [sendPresenceUpdate, stopHeartbeat, isAuthenticated, user]);

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
        if (!accountId) return;

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
      if (DISABLE_PRESENCE || !isAuthenticated || !user) {
        return;
      }

      const threadId = threadIdOverride ?? latestThreadRef.current;
      if (!threadId) {
        setPresences({});
        setConnectionState('idle');
        return;
      }

      try {
        const token = await getAuthToken();
        if (!token) return;
        setConnectionState('connecting');

        const streamUrl = `${API_URL}/presence/thread/${threadId}/stream?token=${encodeURIComponent(token)}`;
        const eventSource = new EventSource(streamUrl);

        const addListener = eventSource.addEventListener as unknown as (
          type: string,
          listener: (event: any) => void
        ) => void;

        addListener('presence.update', (event: any) => {
          try {
            const raw = typeof event?.data === 'string' ? event.data : '';
            const parsed = JSON.parse(raw) as {
              thread_id?: string;
              viewers?: Array<Record<string, unknown>>;
            };
            const payloadThreadId = parsed.thread_id || threadId;
            const viewers = Array.isArray(parsed.viewers) ? parsed.viewers : [];
            applyViewers(payloadThreadId, viewers);
          } catch (error) {
            log.error('[Presence] Failed to parse stream payload:', error);
          }
        });

        eventSource.addEventListener('error', () => {
          setConnectionState('error');
        });

        presenceStreamRef.current = eventSource;
      } catch (error) {
        log.error('[Presence] Failed to start presence stream:', error);
        setConnectionState('error');
      }
    },
    [applyViewers, isAuthenticated, stopPresenceStream, user]
  );

  const clearPresence = useCallback(async () => {
    if (DISABLE_PRESENCE || !sessionId || !API_URL) {
      return;
    }
    
    try {
      const token = await getAuthToken();
      if (!token) return;

      await fetch(`${API_URL}/presence/clear?token=${token}&session_id=${sessionId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      await AsyncStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (error) {
      log.error('[Presence] Failed to clear presence:', error);
    }
  }, [sessionId]);

  const setActiveThreadId = useCallback((threadId: string | null) => {
    const normalized = threadId || null;
    
    latestThreadRef.current = normalized;
    setActiveThreadState(normalized);
    
    if (DISABLE_PRESENCE || !isAuthenticated || !user) {
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
  }, [sendPresenceUpdate, startHeartbeat, startPresenceStream, isAuthenticated, user]);

  useEffect(() => {
    if (DISABLE_PRESENCE || !isAuthenticated || !user || !sessionId) {
      stopHeartbeat();
      stopPresenceStream();
      setConnectionState('idle');
      setPresences({});
      latestThreadRef.current = null;
      setActiveThreadState(null);
      lastSentThreadRef.current = null;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      return;
    }
    
    sendPresenceUpdate(latestThreadRef.current, true);
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
  }, [sendPresenceUpdate, startHeartbeat, startPresenceStream, stopHeartbeat, stopPresenceStream, isAuthenticated, user, sessionId]);

  useEffect(() => {
    if (DISABLE_PRESENCE || !isAuthenticated || !user) return;

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const currentThread = latestThreadRef.current;

      if (nextAppState === 'active' && appStateRef.current.match(/inactive|background/)) {
        sendPresenceUpdate(currentThread, false);
        startHeartbeat();
        void startPresenceStream();
      } else if (nextAppState === 'inactive' || nextAppState === 'background') {
        stopHeartbeat();
        stopPresenceStream();
        sendPresenceUpdate(null, false);
      }

      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
      stopHeartbeat();
      stopPresenceStream();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [isAuthenticated, user, sendPresenceUpdate, startHeartbeat, startPresenceStream, stopHeartbeat, stopPresenceStream]);

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
