/**
 * useFileWatcher - Listens for file changes from CLI tools (claude, recoder-code)
 * Auto-refreshes preview and updates file tree when changes detected
 *
 * Features:
 * - Exponential backoff for reconnection (1s -> 2s -> 4s -> ... -> 30s max)
 * - Waits for container to be ready before connecting
 * - Graceful handling of container-not-found errors
 * - Reports connection status to connection store
 * - Smart reconnection that avoids spam during container startup
 * - Quiet mode that suppresses expected transient errors
 * - Event deduplication to prevent duplicate change notifications after reconnect
 * - Batch write awareness to suppress events during rapid file writes
 */

import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '~/lib/stores/workbench';
import { getSessionToken } from '~/lib/services/docker-api';
import { updateFileWatcherStatus } from '~/lib/stores/connection';
import { FileEventDeduper, type FileChange } from './file-watcher-dedup';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('FileWatcher');

const DOCKER_URL = import.meta.env.VITE_DOCKER_BACKEND_URL || 'https://docker.recoder.xyz';

// Reconnection configuration
const INITIAL_RECONNECT_DELAY = 2000;  // Start at 2 seconds (slower to avoid spam)
const MAX_RECONNECT_DELAY = 30000;     // Max 30 seconds between attempts
const RECONNECT_BACKOFF_MULTIPLIER = 1.5; // Slower backoff
const MAX_RECONNECT_ATTEMPTS = 8;      // Give up after 8 attempts
const HEARTBEAT_INTERVAL = 30000;      // Send ping every 30 seconds
const HEARTBEAT_TIMEOUT = 10000;       // Expect pong within 10 seconds (server now handles JSON pings)
const CONTAINER_READY_GRACE_PERIOD = 3000; // Wait 3s after container ready before connecting
const CONNECTION_COOLDOWN = 1000;      // Min time between connection attempts

// Rapid disconnect detection
const RAPID_DISCONNECT_THRESHOLD = 5000;  // Connection lasting < 5s is "rapid"
const MAX_RAPID_DISCONNECTS = 5;          // Stop after 5 rapid disconnects

// Event deduplication configuration
const DEDUP_WINDOW_MS = 3000;          // Skip events for same file within 3 seconds
const DEDUP_CLEANUP_INTERVAL = 10000;  // Clean up stale dedup entries every 10 seconds

// WebSocket close codes
const CLOSE_NORMAL = 1000;
const CLOSE_CONTAINER_NOT_FOUND = 1008;  // Server sends this when container doesn't exist
const CLOSE_HEARTBEAT_TIMEOUT = 4000;  // Our custom code for heartbeat timeout

// Debug mode - set to true for verbose logging
const DEBUG_MODE = false;

interface UseFileWatcherOptions {
  onFileChange?: (changes: FileChange[]) => void;
  onPreviewRefresh?: () => void;
  enabled?: boolean;
}

// ============================================================================
// Batch write signaling - allows ActionRunner to pause FileWatcher events
// ============================================================================

let _batchWriteInProgress = false;
let _batchWriteCallbacks: Array<() => void> = [];
let _bufferedChanges: FileChange[] = [];

/**
 * Signal that a batch write operation is starting.
 * FileWatcher will buffer events instead of dispatching them immediately.
 */
export function signalBatchWriteStart(): void {
  _batchWriteInProgress = true;
  _bufferedChanges = [];
  if (DEBUG_MODE) {
    logger.info('[FileWatcher] Batch write started - buffering events');
  }
}

/**
 * Signal that a batch write operation has completed.
 * Buffered events will be deduplicated and dispatched once.
 */
export function signalBatchWriteEnd(): void {
  _batchWriteInProgress = false;
  if (DEBUG_MODE) {
    logger.info('[FileWatcher] Batch write ended - flushing', _bufferedChanges.length, 'buffered events');
  }

  // Notify any waiting reconnection callbacks
  const callbacks = [..._batchWriteCallbacks];
  _batchWriteCallbacks = [];
  for (const cb of callbacks) {
    cb();
  }

  // Note: buffered changes are NOT re-dispatched here.
  // During a batch write, the ActionRunner already updates the local file store,
  // and the server-side FileWatcher will report the changes once the WS reconnects.
  // We simply discard buffered duplicates to prevent the 3x event replay problem.
  _bufferedChanges = [];
}

/**
 * Check if a batch write is currently in progress.
 */
export function isBatchWriteInProgress(): boolean {
  return _batchWriteInProgress;
}

export function useFileWatcher(options: UseFileWatcherOptions = {}) {
  const { onFileChange, onPreviewRefresh, enabled = true } = options;
  const projectId = useStore(workbenchStore.projectId);
  const containerReady = useStore(workbenchStore.containerReady);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const gracePeriodTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
  const connectionAttemptRef = useRef(0);
  const isConnectingRef = useRef(false);
  const lastPongRef = useRef<number>(Date.now());
  const isUnmountedRef = useRef(false);
  const lastConnectionAttemptRef = useRef<number>(0);
  const hasEverConnectedRef = useRef(false);
  const containerReadyTimeRef = useRef<number>(0);
  const gaveUpRef = useRef(false);

  // Stable refs for callback props — prevents `connect` from being recreated
  // when parent component re-renders with new inline callback references
  const onFileChangeRef = useRef(onFileChange);
  const onPreviewRefreshRef = useRef(onPreviewRefresh);

  // Rapid disconnect detection
  const connectionOpenTimeRef = useRef<number>(0);
  const rapidDisconnectCountRef = useRef(0);

  // Event deduplication: track recently processed changes by "type:path" -> timestamp
  const deduperRef = useRef<FileEventDeduper>(new FileEventDeduper(DEDUP_WINDOW_MS));
  const dedupCleanupRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Helper function for debug logging
  const debugLog = useCallback((...args: unknown[]) => {
    if (DEBUG_MODE) {
      logger.info('[FileWatcher]', ...args);
    }
  }, []);

  // Deduplicate file changes: filter out events we've already processed recently
  const deduplicateChanges = useCallback((changes: FileChange[]): FileChange[] => {
    return deduperRef.current.deduplicate(changes, Date.now(), (key) => {
      debugLog('Dedup: skipping duplicate event', key);
    });
  }, [debugLog]);

  // Keep callback refs in sync with latest prop values
  useEffect(() => { onFileChangeRef.current = onFileChange; }, [onFileChange]);
  useEffect(() => { onPreviewRefreshRef.current = onPreviewRefresh; }, [onPreviewRefresh]);

  // Reset reconnect delay on successful connection
  const resetReconnectDelay = useCallback(() => {
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    connectionAttemptRef.current = 0;
    gaveUpRef.current = false;
    rapidDisconnectCountRef.current = 0;
  }, []);

  // Calculate next reconnect delay with exponential backoff and jitter
  const getNextReconnectDelay = useCallback(() => {
    const delay = reconnectDelayRef.current;
    // Add jitter (0-25% random variation) to prevent thundering herd
    const jitter = delay * (Math.random() * 0.25);
    reconnectDelayRef.current = Math.min(
      delay * RECONNECT_BACKOFF_MULTIPLIER,
      MAX_RECONNECT_DELAY
    );
    return Math.floor(delay + jitter);
  }, []);

  // Start heartbeat ping/pong to detect stale connections
  const startHeartbeat = useCallback(() => {
    // Clear any existing heartbeat
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        // Send ping message
        try {
          ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        } catch {
          // Ping send failed, will retry on next interval
        }

        // Set timeout for pong response
        heartbeatTimeoutRef.current = setTimeout(() => {
          const timeSinceLastPong = Date.now() - lastPongRef.current;
          if (timeSinceLastPong > HEARTBEAT_TIMEOUT) {
            debugLog('Heartbeat timeout, connection may be stale');
            // Force reconnect by closing the socket
            ws?.close(CLOSE_HEARTBEAT_TIMEOUT, 'Heartbeat timeout');
          }
        }, HEARTBEAT_TIMEOUT);
      }
    }, HEARTBEAT_INTERVAL);
  }, [debugLog]);

  // Stop heartbeat
  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = undefined;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = undefined;
    }
  }, []);

  const connect = useCallback(() => {
    // Don't connect if already connecting or connected - set flag IMMEDIATELY to prevent races
    if (isConnectingRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      debugLog('Skipping connect - already connecting or connected');
      return;
    }

    // Set connecting flag IMMEDIATELY before any async gaps to prevent race conditions
    isConnectingRef.current = true;

    // Don't connect if we've given up
    if (gaveUpRef.current) {
      debugLog('Skipping connect - gave up after max attempts');
      isConnectingRef.current = false;
      return;
    }

    // Don't connect until container is confirmed ready
    if (!projectId || !containerReady || !enabled) {
      if (projectId && enabled && !containerReady && !hasEverConnectedRef.current) {
        debugLog('Waiting for container to be ready...');
      }
      isConnectingRef.current = false;
      return;
    }

    // Enforce connection cooldown to prevent rapid reconnection spam
    const now = Date.now();
    const timeSinceLastAttempt = now - lastConnectionAttemptRef.current;
    if (timeSinceLastAttempt < CONNECTION_COOLDOWN) {
      debugLog(`Connection cooldown active, waiting ${CONNECTION_COOLDOWN - timeSinceLastAttempt}ms`);
      isConnectingRef.current = false;
      return;
    }

    // Check max reconnect attempts
    if (connectionAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
      if (!gaveUpRef.current) {
        logger.warn('[FileWatcher] Max reconnection attempts reached, giving up');
        gaveUpRef.current = true;
        updateFileWatcherStatus('error', { error: 'Max reconnection attempts reached' });
      }
      isConnectingRef.current = false;
      return;
    }

    connectionAttemptRef.current++;
    lastConnectionAttemptRef.current = now;

    // Only report connecting status on first attempt or after successful connection
    if (connectionAttemptRef.current === 1 || hasEverConnectedRef.current) {
      updateFileWatcherStatus('connecting');
    }

    const wsUrl = DOCKER_URL.replace('http', 'ws');
    // Include auth token in WebSocket URL for cross-origin authentication
    const token = getSessionToken();
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const ws = new WebSocket(`${wsUrl}/watch/${projectId}${tokenParam}`);

    ws.onopen = () => {
      isConnectingRef.current = false;
      resetReconnectDelay();
      connectionOpenTimeRef.current = Date.now();
      lastPongRef.current = Date.now();
      hasEverConnectedRef.current = true;
      logger.info('[FileWatcher] Connected to file watch stream');
      // Report connected status
      updateFileWatcherStatus('connected');
      // Start heartbeat monitoring
      startHeartbeat();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle pong response for heartbeat
        if (data.type === 'pong') {
          lastPongRef.current = Date.now();
          // Clear the heartbeat timeout since we got a response
          if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = undefined;
          }
          return;
        }

        if (data.type === 'file-changes' && data.changes?.length > 0) {
          // If a batch write is in progress, buffer events instead of dispatching
          if (_batchWriteInProgress) {
            debugLog(`Buffering ${data.changes.length} changes during batch write`);
            _bufferedChanges.push(...data.changes);
            return;
          }

          // Deduplicate events to prevent 3x replay after reconnection
          const uniqueChanges = deduplicateChanges(data.changes);
          if (uniqueChanges.length === 0) {
            debugLog('All file changes were duplicates, skipping');
            return;
          }

          logger.info(`[FileWatcher] ${uniqueChanges.length} file changes detected:`,
            uniqueChanges.map((c: FileChange) => `${c.type}: ${c.path}`).join(', ')
          );

          // Notify callback (via ref to avoid recreating connect on callback change)
          onFileChangeRef.current?.(uniqueChanges);

          // Auto-refresh preview for code file changes
          const codeExtensions = ['.tsx', '.ts', '.jsx', '.js', '.css', '.html', '.json', '.vue', '.svelte'];
          const hasCodeChange = uniqueChanges.some((c: FileChange) =>
            codeExtensions.some(ext => c.path.endsWith(ext))
          );

          if (hasCodeChange) {
            logger.info('[FileWatcher] Code file changed, triggering preview refresh');
            onPreviewRefreshRef.current?.();

            // Dispatch event for preview component
            window.dispatchEvent(new CustomEvent('recoder:file-changed', {
              detail: { changes: uniqueChanges }
            }));
          }

          // Dispatch event for file tree refresh
          window.dispatchEvent(new CustomEvent('recoder:refresh-files', {
            detail: { changes: uniqueChanges }
          }));
        }
      } catch (e) {
        logger.warn('[FileWatcher] Failed to parse message:', e);
      }
    };

    ws.onerror = () => {
      // Error will be followed by close event, so minimal handling here
      stopHeartbeat();
      if (hasEverConnectedRef.current) {
        updateFileWatcherStatus('error', { error: 'Connection error' });
      }
    };

    ws.onclose = (event) => {
      isConnectingRef.current = false;
      wsRef.current = null;
      stopHeartbeat();

      // Don't reconnect if component is unmounting
      if (isUnmountedRef.current) {
        return;
      }

      // Handle different close scenarios
      if (event.code === CLOSE_NORMAL) {
        // Normal close, don't reconnect
        debugLog('Connection closed normally');
        updateFileWatcherStatus('disconnected');
        return;
      }

      if (event.code === CLOSE_CONTAINER_NOT_FOUND) {
        // Container doesn't exist yet - wait for containerReady to change
        debugLog('Container not found, waiting for container to be ready...');
        // Reset delay since this isn't a network error
        resetReconnectDelay();
        updateFileWatcherStatus('disconnected');
        return;
      }

      // For heartbeat timeout, be more aggressive about reconnecting
      if (event.code === CLOSE_HEARTBEAT_TIMEOUT) {
        debugLog('Heartbeat timeout, reconnecting immediately');
        if (enabled && projectId && containerReady && !gaveUpRef.current) {
          reconnectTimeoutRef.current = setTimeout(connect, INITIAL_RECONNECT_DELAY);
        }
        return;
      }

      // Rapid disconnect detection: if connection was open < 5s, count it
      if (connectionOpenTimeRef.current > 0) {
        const connectionDuration = Date.now() - connectionOpenTimeRef.current;
        if (connectionDuration < RAPID_DISCONNECT_THRESHOLD) {
          rapidDisconnectCountRef.current++;
          debugLog(`Rapid disconnect #${rapidDisconnectCountRef.current} (connection lasted ${connectionDuration}ms)`);

          if (rapidDisconnectCountRef.current >= MAX_RAPID_DISCONNECTS) {
            logger.warn(`[FileWatcher] ${MAX_RAPID_DISCONNECTS} rapid disconnects detected, stopping retries`);
            gaveUpRef.current = true;
            updateFileWatcherStatus('error', { error: 'Too many rapid disconnects' });
            return;
          }
        } else {
          // Connection lasted long enough, reset rapid disconnect counter
          rapidDisconnectCountRef.current = 0;
        }
        connectionOpenTimeRef.current = 0;
      }

      // Helper: schedule reconnection, deferring if a batch write is in progress
      const scheduleReconnect = (delay: number) => {
        if (_batchWriteInProgress) {
          // Defer reconnection until the batch write completes to avoid
          // receiving a flood of duplicate events on reconnect
          debugLog('Batch write in progress, deferring reconnection until batch completes');
          updateFileWatcherStatus('reconnecting', { reconnectAttempt: connectionAttemptRef.current });
          _batchWriteCallbacks.push(() => {
            if (!isUnmountedRef.current && enabled && projectId && containerReady && !gaveUpRef.current) {
              debugLog('Batch write completed, reconnecting now');
              reconnectTimeoutRef.current = setTimeout(connect, INITIAL_RECONNECT_DELAY);
            }
          });
        } else {
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      // Other close codes - reconnect with exponential backoff
      if (enabled && projectId && containerReady && !gaveUpRef.current) {
        const delay = getNextReconnectDelay();

        // Only log reconnection attempts after we've had a successful connection
        // or after a few failed attempts (to avoid spam during startup)
        if (hasEverConnectedRef.current || connectionAttemptRef.current > 2) {
          logger.info(`[FileWatcher] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${connectionAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
        } else {
          debugLog(`Reconnecting in ${delay}ms (attempt ${connectionAttemptRef.current})`);
        }

        // Only report 'reconnecting' status (which triggers toast notifications) when
        // NOT in a rapid disconnect loop — prevents notification spam
        if (rapidDisconnectCountRef.current === 0) {
          updateFileWatcherStatus('reconnecting', { reconnectAttempt: connectionAttemptRef.current });
        }
        scheduleReconnect(delay);
      } else if (!gaveUpRef.current) {
        debugLog('Disconnected, not reconnecting (conditions not met)');
        updateFileWatcherStatus('disconnected');
      }
    };

    wsRef.current = ws;
  }, [projectId, containerReady, enabled, resetReconnectDelay, getNextReconnectDelay, startHeartbeat, stopHeartbeat, debugLog, deduplicateChanges]);

  // Force reconnect function for external triggers
  const forceReconnect = useCallback(() => {
    debugLog('Force reconnect requested');
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close(CLOSE_NORMAL);
      wsRef.current = null;
    }
    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }
    if (gracePeriodTimeoutRef.current) {
      clearTimeout(gracePeriodTimeoutRef.current);
      gracePeriodTimeoutRef.current = undefined;
    }
    // Reset delay for fresh start
    resetReconnectDelay();
    // Reset last connection attempt to bypass cooldown
    lastConnectionAttemptRef.current = 0;
    // Reconnect after a short delay
    setTimeout(connect, 500);
  }, [connect, resetReconnectDelay, debugLog]);

  // Effect to connect when dependencies change
  useEffect(() => {
    isUnmountedRef.current = false;

    // Clear any pending reconnect when dependencies change
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = undefined;
    }

    // Reset reconnect delay when project changes
    resetReconnectDelay();

    // Start periodic cleanup of stale dedup entries
    dedupCleanupRef.current = setInterval(() => {
      const now = Date.now();
      deduperRef.current.cleanup(now, DEDUP_WINDOW_MS * 2);
    }, DEDUP_CLEANUP_INTERVAL);

    // Connect if conditions are met
    connect();

    return () => {
      isUnmountedRef.current = true;
      stopHeartbeat();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = undefined;
      }
      if (gracePeriodTimeoutRef.current) {
        clearTimeout(gracePeriodTimeoutRef.current);
        gracePeriodTimeoutRef.current = undefined;
      }
      if (dedupCleanupRef.current) {
        clearInterval(dedupCleanupRef.current);
        dedupCleanupRef.current = undefined;
      }
      if (wsRef.current) {
        wsRef.current.close(CLOSE_NORMAL);
        wsRef.current = null;
      }
      isConnectingRef.current = false;
      // Clear dedup map on disconnect (new connection should start fresh)
      deduperRef.current.clear();
      // Don't reset status on cleanup - let the store handle it
    };
  }, [connect, resetReconnectDelay, stopHeartbeat]);

  // Listen for reconnect-all event from ConnectionStatus component
  useEffect(() => {
    const handleReconnectAll = () => {
      forceReconnect();
    };

    window.addEventListener('recoder:reconnect-all', handleReconnectAll);
    return () => {
      window.removeEventListener('recoder:reconnect-all', handleReconnectAll);
    };
  }, [forceReconnect]);

  // Listen for file-resync event (dispatched when terminal reconnects)
  // Forces file watcher to reconnect and re-sync file state
  useEffect(() => {
    const handleFileResync = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // Already connected - clear dedup cache so new events come through fresh
        deduperRef.current.clear();
      } else {
        // Not connected - force reconnect
        forceReconnect();
      }
    };

    window.addEventListener('recoder:file-resync', handleFileResync);
    return () => {
      window.removeEventListener('recoder:file-resync', handleFileResync);
    };
  }, [forceReconnect]);

  // Additional effect to connect when containerReady becomes true
  // Uses a grace period to let the container fully stabilize
  // Only runs if the main effect hasn't already connected
  useEffect(() => {
    if (containerReady && projectId && enabled && !wsRef.current && !isConnectingRef.current && !hasEverConnectedRef.current) {
      // Record when container became ready
      const now = Date.now();
      const timeSinceReady = now - containerReadyTimeRef.current;

      if (containerReadyTimeRef.current === 0 || timeSinceReady > CONTAINER_READY_GRACE_PERIOD * 2) {
        containerReadyTimeRef.current = now;
      }

      if (timeSinceReady < CONTAINER_READY_GRACE_PERIOD) {
        debugLog(`Container became ready, waiting ${CONTAINER_READY_GRACE_PERIOD}ms grace period...`);

        if (gracePeriodTimeoutRef.current) {
          clearTimeout(gracePeriodTimeoutRef.current);
        }

        gracePeriodTimeoutRef.current = setTimeout(() => {
          // Double-check no connection was established during the grace period
          if (!isUnmountedRef.current && !wsRef.current && !isConnectingRef.current && !hasEverConnectedRef.current) {
            debugLog('Grace period complete, connecting...');
            connect();
          }
        }, CONTAINER_READY_GRACE_PERIOD);
      }
      // Don't call connect() here directly - the main effect already handles it
    }
  }, [containerReady, projectId, enabled, connect, debugLog]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    forceReconnect,
    connectionAttempts: connectionAttemptRef.current,
    hasGivenUp: gaveUpRef.current,
    resetAndReconnect: useCallback(() => {
      // Reset all state and try again
      gaveUpRef.current = false;
      resetReconnectDelay();
      lastConnectionAttemptRef.current = 0;
      forceReconnect();
    }, [forceReconnect, resetReconnectDelay]),
  };
}
