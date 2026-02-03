/**
 * Container Monitor Service
 * Monitors Docker container lifecycle, resource usage, and health.
 * Inspired by December's container management patterns.
 *
 * Features:
 * - Poll container status and detect state changes
 * - Monitor CPU and memory usage
 * - Detect container crashes and restarts
 * - Health check endpoints
 * - Auto-restart on failure (configurable)
 */

import { dockerGet, dockerPost, DOCKER_URL, getSessionToken } from '~/lib/services/docker-api';
import {
  containerStatusStore,
  updateContainerStatus,
  updateResourceUsage,
  updatePortMappings,
  addContainerLog,
  setContainerHealth,
  setContainerError,
  resetContainerStatus,
  type ContainerState,
  type ResourceUsage,
  type PortMapping,
  type HealthStatus,
} from '~/lib/stores/container-status';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ContainerMonitor');

// Configuration
const DEFAULT_POLL_INTERVAL = 5000; // 5 seconds
const HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
const MAX_LOG_LINES = 100;
const AUTO_RESTART_DELAY = 3000; // 3 seconds before auto-restart
const MAX_AUTO_RESTART_ATTEMPTS = 3;

// Health check backoff configuration
const HEALTH_CHECK_BACKOFF_INTERVAL = 30000; // 30 seconds after consecutive failures
const MAX_CONSECUTIVE_HEALTH_FAILURES = 3;

// Monitor state
let pollInterval: NodeJS.Timeout | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let currentProjectId: string | null = null;
let autoRestartEnabled = true;
let autoRestartAttempts = 0;
let lastKnownState: ContainerState = 'unknown';
let consecutiveHealthFailures = 0;
let healthCheckBackedOff = false;
let configuredHealthCheckInterval = HEALTH_CHECK_INTERVAL;

/**
 * Container stats from Docker API
 */
interface ContainerStats {
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  block_read: number;
  block_write: number;
}

/**
 * Container info from Docker API
 */
interface ContainerInfo {
  id: string;
  name: string;
  state: ContainerState;
  status: string;
  created: string;
  started_at?: string;
  finished_at?: string;
  exit_code?: number;
  ports: PortMapping[];
  image: string;
  restart_count: number;
}

/**
 * Start monitoring a container
 */
export function startContainerMonitor(
  projectId: string,
  options: {
    pollInterval?: number;
    healthCheckInterval?: number;
    autoRestart?: boolean;
  } = {}
): void {
  // Stop any existing monitor
  stopContainerMonitor();

  currentProjectId = projectId;
  autoRestartEnabled = options.autoRestart ?? true;
  autoRestartAttempts = 0;
  consecutiveHealthFailures = 0;
  healthCheckBackedOff = false;

  const pollMs = options.pollInterval ?? DEFAULT_POLL_INTERVAL;
  const healthMs = options.healthCheckInterval ?? HEALTH_CHECK_INTERVAL;
  configuredHealthCheckInterval = healthMs;

  logger.info(`Starting container monitor for project: ${projectId}`);

  // Initial status check
  pollContainerStatus();

  // Start polling
  pollInterval = setInterval(pollContainerStatus, pollMs);

  // Start health checks
  healthCheckInterval = setInterval(performHealthCheck, healthMs);
}

/**
 * Stop monitoring
 */
export function stopContainerMonitor(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
  }

  currentProjectId = null;
  autoRestartAttempts = 0;
  consecutiveHealthFailures = 0;
  healthCheckBackedOff = false;
  logger.info('Container monitor stopped');
}

/**
 * Poll container status
 */
async function pollContainerStatus(): Promise<void> {
  if (!currentProjectId) return;

  try {
    // Get container info
    const info = await getContainerInfo(currentProjectId);

    if (info) {
      // Detect state changes
      const previousState = lastKnownState;
      lastKnownState = info.state;

      // Update status
      updateContainerStatus(info.state, info.status);
      updatePortMappings(info.ports);

      // Handle state transitions
      if (previousState !== info.state) {
        handleStateChange(previousState, info.state, info);
      }

      // Get resource usage if running
      if (info.state === 'running') {
        const stats = await getContainerStats(currentProjectId);
        if (stats) {
          updateResourceUsage({
            cpuPercent: stats.cpu_percent,
            memoryUsage: stats.memory_usage,
            memoryLimit: stats.memory_limit,
            memoryPercent: stats.memory_percent,
            networkRx: stats.network_rx,
            networkTx: stats.network_tx,
          });
        }
      }
    } else {
      // Container not found
      updateContainerStatus('not_found', 'Container not found');
      lastKnownState = 'not_found';
    }
  } catch (error) {
    logger.error('Failed to poll container status:', error);
    setContainerError(error instanceof Error ? error.message : 'Failed to poll status');
  }
}

/**
 * Get container info from backend
 */
async function getContainerInfo(projectId: string): Promise<ContainerInfo | null> {
  try {
    const response = await dockerGet<{
      container?: ContainerInfo;
      exists: boolean;
    }>(`/api/container/${projectId}/info`);

    if (response.exists && response.container) {
      return response.container;
    }
    return null;
  } catch (error) {
    // Container might not exist yet
    if ((error as any)?.statusCode === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Get container resource stats
 */
async function getContainerStats(projectId: string): Promise<ContainerStats | null> {
  try {
    const response = await dockerGet<ContainerStats>(`/api/container/${projectId}/stats`);
    return response;
  } catch (error) {
    logger.debug('Failed to get container stats:', error);
    return null;
  }
}

/**
 * Perform health check
 */
async function performHealthCheck(): Promise<void> {
  if (!currentProjectId) return;

  const status = containerStatusStore.get();

  // Guard: only poll health if container is confirmed to exist and running.
  // Skip for unknown, not_found, exited, etc. to avoid pointless 10s+ timeout requests.
  if (status.state !== 'running') {
    // Only mark unhealthy if the container was previously known (avoid noise during startup)
    if (status.state !== 'unknown') {
      setContainerHealth('unhealthy', 'Container not running');
    }
    return;
  }

  try {
    // Check if dev server is responding (10s timeout to avoid 40s+ hangs)
    const response = await dockerGet<{
      healthy: boolean;
      ports: Array<{ port: number; responding: boolean }>;
    }>(`/api/preview/${currentProjectId}/health`, { timeout: 10000, skipRetry: true });

    if (response.healthy) {
      const respondingPorts = response.ports.filter(p => p.responding);
      setContainerHealth('healthy', `${respondingPorts.length} port(s) responding`);

      // Reset failure counter on success
      if (consecutiveHealthFailures > 0) {
        consecutiveHealthFailures = 0;

        // If we were backed off, restore normal interval
        if (healthCheckBackedOff) {
          healthCheckBackedOff = false;
          if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
            healthCheckInterval = setInterval(performHealthCheck, configuredHealthCheckInterval);
          }
          logger.info('Health check restored to normal interval after recovery');
        }
      }
    } else {
      setContainerHealth('degraded', 'Dev server not responding');
      handleHealthCheckFailure();
    }
  } catch (error) {
    setContainerHealth('unhealthy', 'Health check failed');
    logger.debug('Health check failed:', error);
    handleHealthCheckFailure();
  }
}

/**
 * Track consecutive health check failures and back off if needed
 */
function handleHealthCheckFailure(): void {
  consecutiveHealthFailures++;

  if (consecutiveHealthFailures >= MAX_CONSECUTIVE_HEALTH_FAILURES && !healthCheckBackedOff) {
    healthCheckBackedOff = true;
    logger.info(
      `Health check failed ${consecutiveHealthFailures} consecutive times, ` +
      `backing off to ${HEALTH_CHECK_BACKOFF_INTERVAL / 1000}s interval`
    );

    // Replace the current health check interval with a slower one
    if (healthCheckInterval) {
      clearInterval(healthCheckInterval);
      healthCheckInterval = setInterval(performHealthCheck, HEALTH_CHECK_BACKOFF_INTERVAL);
    }
  }
}

/**
 * Handle container state changes
 */
function handleStateChange(
  previousState: ContainerState,
  newState: ContainerState,
  info: ContainerInfo
): void {
  logger.info(`Container state changed: ${previousState} -> ${newState}`);

  // Log the state change
  addContainerLog({
    timestamp: new Date(),
    level: 'info',
    message: `Container state: ${previousState} -> ${newState}`,
  });

  // Handle crash detection
  if (previousState === 'running' && (newState === 'exited' || newState === 'dead')) {
    const exitCode = info.exit_code ?? -1;

    if (exitCode !== 0) {
      // Container crashed
      addContainerLog({
        timestamp: new Date(),
        level: 'error',
        message: `Container crashed with exit code ${exitCode}`,
      });

      // Auto-restart if enabled
      if (autoRestartEnabled && autoRestartAttempts < MAX_AUTO_RESTART_ATTEMPTS) {
        autoRestartAttempts++;
        addContainerLog({
          timestamp: new Date(),
          level: 'info',
          message: `Auto-restart attempt ${autoRestartAttempts}/${MAX_AUTO_RESTART_ATTEMPTS}`,
        });

        setTimeout(() => {
          restartContainer().catch(err => {
            logger.error('Auto-restart failed:', err);
          });
        }, AUTO_RESTART_DELAY);
      }
    }
  }

  // Reset auto-restart counter when container starts successfully
  if (newState === 'running') {
    autoRestartAttempts = 0;
  }
}

/**
 * Restart the container
 */
export async function restartContainer(): Promise<boolean> {
  if (!currentProjectId) {
    logger.warn('No project ID set, cannot restart container');
    return false;
  }

  try {
    updateContainerStatus('restarting', 'Restarting container...');

    await dockerPost(`/api/container/${currentProjectId}/restart`);

    addContainerLog({
      timestamp: new Date(),
      level: 'info',
      message: 'Container restart initiated',
    });

    // Wait a bit for container to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Poll for updated status
    await pollContainerStatus();

    return true;
  } catch (error) {
    logger.error('Failed to restart container:', error);
    setContainerError(error instanceof Error ? error.message : 'Restart failed');
    return false;
  }
}

/**
 * Stop the container
 */
export async function stopContainer(): Promise<boolean> {
  if (!currentProjectId) {
    logger.warn('No project ID set, cannot stop container');
    return false;
  }

  try {
    updateContainerStatus('stopping', 'Stopping container...');

    await dockerPost(`/api/container/${currentProjectId}/stop`);

    addContainerLog({
      timestamp: new Date(),
      level: 'info',
      message: 'Container stop initiated',
    });

    // Poll for updated status
    await pollContainerStatus();

    return true;
  } catch (error) {
    logger.error('Failed to stop container:', error);
    setContainerError(error instanceof Error ? error.message : 'Stop failed');
    return false;
  }
}

/**
 * Start the container
 */
export async function startContainer(): Promise<boolean> {
  if (!currentProjectId) {
    logger.warn('No project ID set, cannot start container');
    return false;
  }

  try {
    updateContainerStatus('starting', 'Starting container...');

    await dockerPost(`/api/container/${currentProjectId}/start`);

    addContainerLog({
      timestamp: new Date(),
      level: 'info',
      message: 'Container start initiated',
    });

    // Poll for updated status
    await pollContainerStatus();

    return true;
  } catch (error) {
    logger.error('Failed to start container:', error);
    setContainerError(error instanceof Error ? error.message : 'Start failed');
    return false;
  }
}

/**
 * Get container logs
 */
export async function fetchContainerLogs(
  lines: number = MAX_LOG_LINES
): Promise<string[]> {
  if (!currentProjectId) {
    return [];
  }

  try {
    const response = await dockerGet<{ logs: string[] }>(
      `/api/container/${currentProjectId}/logs?lines=${lines}`
    );

    // Add logs to store
    response.logs.forEach(line => {
      addContainerLog({
        timestamp: new Date(),
        level: 'info',
        message: line,
      });
    });

    return response.logs;
  } catch (error) {
    logger.error('Failed to fetch container logs:', error);
    return [];
  }
}

/**
 * Stream container logs via WebSocket
 */
export function streamContainerLogs(
  projectId: string,
  onLog: (log: string) => void
): () => void {
  const wsUrl = DOCKER_URL.replace(/^http/, 'ws');
  const token = getSessionToken();
  const url = `${wsUrl}/api/container/${projectId}/logs/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;

  let ws: WebSocket | null = null;
  let reconnectTimeout: NodeJS.Timeout | null = null;
  let shouldReconnect = true;

  const connect = () => {
    if (!shouldReconnect) return;

    ws = new WebSocket(url);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.log) {
          onLog(data.log);
          addContainerLog({
            timestamp: new Date(),
            level: data.level || 'info',
            message: data.log,
          });
        }
      } catch {
        onLog(event.data);
        addContainerLog({
          timestamp: new Date(),
          level: 'info',
          message: event.data,
        });
      }
    };

    ws.onclose = () => {
      if (shouldReconnect) {
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    ws.onerror = (error) => {
      logger.error('Log stream error:', error);
    };
  };

  connect();

  // Return cleanup function
  return () => {
    shouldReconnect = false;
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    if (ws) {
      ws.close();
    }
  };
}

/**
 * Set auto-restart enabled/disabled
 */
export function setAutoRestart(enabled: boolean): void {
  autoRestartEnabled = enabled;
  if (!enabled) {
    autoRestartAttempts = 0;
  }
}

/**
 * Get current monitor state
 */
export function getMonitorState(): {
  projectId: string | null;
  isMonitoring: boolean;
  autoRestartEnabled: boolean;
  autoRestartAttempts: number;
} {
  return {
    projectId: currentProjectId,
    isMonitoring: pollInterval !== null,
    autoRestartEnabled,
    autoRestartAttempts,
  };
}

/**
 * Force a status refresh
 */
export async function refreshContainerStatus(): Promise<void> {
  await pollContainerStatus();
  await performHealthCheck();
}

/**
 * Reset monitor state (e.g., on project change)
 */
export function resetMonitor(): void {
  stopContainerMonitor();
  resetContainerStatus();
  lastKnownState = 'unknown';
}

// Export types
export type { ContainerInfo, ContainerStats };
