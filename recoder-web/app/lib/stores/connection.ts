/**
 * Connection Status Store
 * Tracks the status of all backend connections:
 * - Docker backend (health endpoint)
 * - Terminal WebSocket
 * - FileWatcher WebSocket
 *
 * Provides overall system health status and reconnection tracking.
 */

import { atom, computed } from 'nanostores';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'reconnecting' | 'error';

export interface ConnectionInfo {
  status: ConnectionStatus;
  lastConnected?: Date;
  lastError?: string;
  reconnectAttempt?: number;
  latency?: number; // ms for health checks
}

export interface ConnectionState {
  docker: ConnectionInfo;
  terminal: ConnectionInfo;
  fileWatcher: ConnectionInfo;
}

// Individual connection stores
export const dockerConnection = atom<ConnectionInfo>({
  status: 'disconnected',
});

export const terminalConnection = atom<ConnectionInfo>({
  status: 'disconnected',
});

export const fileWatcherConnection = atom<ConnectionInfo>({
  status: 'disconnected',
});

// Computed overall health status
export const overallHealth = computed(
  [dockerConnection, terminalConnection, fileWatcherConnection],
  (docker, terminal, fileWatcher) => {
    const statuses = [docker.status, terminal.status, fileWatcher.status];

    // If all connected, we're healthy
    if (statuses.every(s => s === 'connected')) {
      return 'healthy' as const;
    }

    // If any has an error, we have issues
    if (statuses.some(s => s === 'error')) {
      return 'error' as const;
    }

    // If any is reconnecting, we're recovering
    if (statuses.some(s => s === 'reconnecting' || s === 'connecting')) {
      return 'reconnecting' as const;
    }

    // If docker is disconnected, we're unhealthy
    if (docker.status === 'disconnected') {
      return 'unhealthy' as const;
    }

    // Some connections may not be established yet (e.g., no project loaded)
    return 'partial' as const;
  }
);

// Toast notification tracking (to avoid duplicate toasts)
let lastToastTime = 0;
let lastToastStatus: string | null = null;
const TOAST_DEBOUNCE_MS = 10000; // 10 seconds between same status toasts (increased to reduce spam)

// Disconnection tracking for warning after extended disconnect
let disconnectionStart: number | null = null;
let disconnectionWarningShown = false;
const DISCONNECTION_WARNING_THRESHOLD_MS = 10000; // 10 seconds

/**
 * Update Docker backend connection status
 */
export function updateDockerStatus(
  status: ConnectionStatus,
  options?: { latency?: number; error?: string }
) {
  const current = dockerConnection.get();
  const newInfo: ConnectionInfo = {
    ...current,
    status,
    lastError: options?.error,
    latency: options?.latency,
  };

  if (status === 'connected' && current.status !== 'connected') {
    newInfo.lastConnected = new Date();
    newInfo.reconnectAttempt = 0;
  }

  dockerConnection.set(newInfo);
  checkAndNotify('Docker backend', status, options?.error);
}

/**
 * Update Terminal WebSocket connection status
 */
export function updateTerminalStatus(
  status: ConnectionStatus,
  options?: { reconnectAttempt?: number; error?: string }
) {
  const current = terminalConnection.get();
  const newInfo: ConnectionInfo = {
    ...current,
    status,
    lastError: options?.error,
    reconnectAttempt: options?.reconnectAttempt,
  };

  if (status === 'connected' && current.status !== 'connected') {
    newInfo.lastConnected = new Date();
    newInfo.reconnectAttempt = 0;
  }

  terminalConnection.set(newInfo);
  checkAndNotify('Terminal', status, options?.error);
}

/**
 * Update FileWatcher WebSocket connection status
 */
export function updateFileWatcherStatus(
  status: ConnectionStatus,
  options?: { reconnectAttempt?: number; error?: string }
) {
  const current = fileWatcherConnection.get();
  const newInfo: ConnectionInfo = {
    ...current,
    status,
    lastError: options?.error,
    reconnectAttempt: options?.reconnectAttempt,
  };

  if (status === 'connected' && current.status !== 'connected') {
    newInfo.lastConnected = new Date();
    newInfo.reconnectAttempt = 0;
  }

  fileWatcherConnection.set(newInfo);
  checkAndNotify('File watcher', status, options?.error);
}

/**
 * Check overall status and show toast notifications
 */
function checkAndNotify(service: string, status: ConnectionStatus, error?: string) {
  const now = Date.now();
  const toastKey = `${service}-${status}`;

  // Track disconnection for warning
  if (status === 'disconnected' || status === 'error') {
    if (!disconnectionStart) {
      disconnectionStart = now;
      disconnectionWarningShown = false;
    }

    // Check if we should show warning after extended disconnect
    if (!disconnectionWarningShown && (now - disconnectionStart) >= DISCONNECTION_WARNING_THRESHOLD_MS) {
      disconnectionWarningShown = true;
      showToast('warning', `Connection lost for more than 10 seconds. Some features may not work.`);
    }
  } else if (status === 'connected') {
    // Reset disconnection tracking on reconnect
    if (disconnectionStart && disconnectionWarningShown) {
      // Only show recovery toast if disconnection lasted long enough to be meaningful
      // Prevents toast spam when connection bounces rapidly
      const disconnectedDuration = now - disconnectionStart;
      if (disconnectedDuration > DISCONNECTION_WARNING_THRESHOLD_MS) {
        showToast('success', 'Connection recovered');
      }
    }
    disconnectionStart = null;
    disconnectionWarningShown = false;
  }

  // Debounce toasts
  if (toastKey === lastToastStatus && (now - lastToastTime) < TOAST_DEBOUNCE_MS) {
    return;
  }

  // Show appropriate toast
  if (status === 'reconnecting') {
    showToast('info', `${service} reconnecting...`);
    lastToastStatus = toastKey;
    lastToastTime = now;
  } else if (status === 'error' && error) {
    showToast('error', `${service}: ${error}`);
    lastToastStatus = toastKey;
    lastToastTime = now;
  }
}

/**
 * Show toast notification (lazy load to avoid circular deps)
 */
function showToast(type: 'success' | 'error' | 'info' | 'warning', message: string) {
  // Dynamic import to avoid issues with SSR and circular deps
  import('react-toastify').then(({ toast }) => {
    switch (type) {
      case 'success':
        toast.success(message, { autoClose: 3000 });
        break;
      case 'error':
        toast.error(message, { autoClose: 5000 });
        break;
      case 'warning':
        toast.warning(message, { autoClose: 5000 });
        break;
      case 'info':
        toast.info(message, { autoClose: 2000 });
        break;
    }
  }).catch(() => {
    // Silently fail if toast not available
    console.log(`[Connection] ${type}: ${message}`);
  });
}

/**
 * Get human-readable status text
 */
export function getStatusText(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'disconnected':
      return 'Disconnected';
    case 'reconnecting':
      return 'Reconnecting...';
    case 'error':
      return 'Error';
    default:
      return 'Unknown';
  }
}

/**
 * Get status color class for tailwind
 */
export function getStatusColor(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'bg-green-500';
    case 'connecting':
    case 'reconnecting':
      return 'bg-yellow-500';
    case 'disconnected':
      return 'bg-gray-500';
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

/**
 * Get overall health color
 */
export function getHealthColor(health: 'healthy' | 'unhealthy' | 'partial' | 'reconnecting' | 'error'): string {
  switch (health) {
    case 'healthy':
      return 'bg-green-500';
    case 'partial':
      return 'bg-green-400';
    case 'reconnecting':
      return 'bg-yellow-500';
    case 'unhealthy':
    case 'error':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
}

/**
 * Start health check polling for Docker backend
 */
let healthCheckInterval: NodeJS.Timeout | null = null;

export function startHealthCheckPolling(intervalMs: number = 30000) {
  // Clear existing interval
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  // Initial check
  performHealthCheck();

  // Start polling
  healthCheckInterval = setInterval(performHealthCheck, intervalMs);
}

export function stopHealthCheckPolling() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }
}

async function performHealthCheck() {
  try {
    const { checkDockerHealth } = await import('~/lib/services/docker-api');
    const result = await checkDockerHealth();

    if (result.healthy) {
      updateDockerStatus('connected', { latency: result.latency });
    } else {
      updateDockerStatus('error', { error: 'Health check failed' });
    }
  } catch (error) {
    updateDockerStatus('error', {
      error: error instanceof Error ? error.message : 'Health check failed'
    });
  }
}

/**
 * Reset all connection states (e.g., on logout or page unload)
 */
export function resetAllConnections() {
  dockerConnection.set({ status: 'disconnected' });
  terminalConnection.set({ status: 'disconnected' });
  fileWatcherConnection.set({ status: 'disconnected' });
  stopHealthCheckPolling();
  stopConnectionHealthMonitor();
  disconnectionStart = null;
  disconnectionWarningShown = false;
  lastToastStatus = null;
  lastToastTime = 0;
}

/**
 * Connection Health Monitor
 * Monitors overall connection health and triggers reconnection when needed.
 * This provides a safety net for detecting and recovering from stale connections.
 */
let connectionHealthInterval: NodeJS.Timeout | null = null;
let consecutiveUnhealthyChecks = 0;
const HEALTH_MONITOR_INTERVAL = 15000; // Check every 15 seconds
const UNHEALTHY_THRESHOLD = 3; // Trigger reconnect after 3 consecutive unhealthy checks

export function startConnectionHealthMonitor() {
  // Clear existing interval
  if (connectionHealthInterval) {
    clearInterval(connectionHealthInterval);
  }

  consecutiveUnhealthyChecks = 0;

  connectionHealthInterval = setInterval(() => {
    const health = overallHealth.get();
    const docker = dockerConnection.get();
    const terminal = terminalConnection.get();
    const fileWatcher = fileWatcherConnection.get();

    // Check if any connection has been in error or disconnected state for too long
    if (health === 'error' || health === 'unhealthy') {
      consecutiveUnhealthyChecks++;

      if (consecutiveUnhealthyChecks >= UNHEALTHY_THRESHOLD) {
        console.log('[ConnectionHealthMonitor] Detected prolonged unhealthy state, triggering reconnection');
        consecutiveUnhealthyChecks = 0;

        // Dispatch reconnect-all event
        window.dispatchEvent(new CustomEvent('recoder:reconnect-all'));

        // Also trigger a health check
        performHealthCheck();
      }
    } else {
      // Reset counter on healthy state
      consecutiveUnhealthyChecks = 0;
    }

    // Log connection status for debugging (only in development)
    if (typeof window !== 'undefined' && (window as any).__DEV__) {
      console.log('[ConnectionHealthMonitor] Status:', {
        health,
        docker: docker.status,
        terminal: terminal.status,
        fileWatcher: fileWatcher.status,
        consecutiveUnhealthyChecks
      });
    }
  }, HEALTH_MONITOR_INTERVAL);
}

export function stopConnectionHealthMonitor() {
  if (connectionHealthInterval) {
    clearInterval(connectionHealthInterval);
    connectionHealthInterval = null;
  }
  consecutiveUnhealthyChecks = 0;
}

/**
 * Get connection statistics for diagnostics
 */
export function getConnectionStats() {
  const docker = dockerConnection.get();
  const terminal = terminalConnection.get();
  const fileWatcher = fileWatcherConnection.get();
  const health = overallHealth.get();

  return {
    overallHealth: health,
    docker: {
      status: docker.status,
      lastConnected: docker.lastConnected,
      latency: docker.latency,
      lastError: docker.lastError
    },
    terminal: {
      status: terminal.status,
      lastConnected: terminal.lastConnected,
      reconnectAttempt: terminal.reconnectAttempt,
      lastError: terminal.lastError
    },
    fileWatcher: {
      status: fileWatcher.status,
      lastConnected: fileWatcher.lastConnected,
      reconnectAttempt: fileWatcher.reconnectAttempt,
      lastError: fileWatcher.lastError
    },
    monitoring: {
      healthCheckActive: healthCheckInterval !== null,
      connectionMonitorActive: connectionHealthInterval !== null,
      consecutiveUnhealthyChecks
    }
  };
}

/**
 * Force trigger reconnection of all WebSocket connections
 */
export function forceReconnectAll() {
  console.log('[Connection] Force reconnecting all connections');

  // Reset reconnect counters
  consecutiveUnhealthyChecks = 0;

  // Dispatch reconnect event
  window.dispatchEvent(new CustomEvent('recoder:reconnect-all'));

  // Also trigger a health check
  performHealthCheck();
}
