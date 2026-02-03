/**
 * Container Status Store
 * Tracks Docker container state, resource usage, ports, and logs.
 * Uses nanostores for reactive state management.
 *
 * Features:
 * - Container state and status
 * - CPU/memory usage metrics
 * - Port mappings
 * - Container logs (last N lines)
 * - Health status tracking
 */

import { atom, computed } from 'nanostores';

// Container states matching Docker states
export type ContainerState =
  | 'unknown'
  | 'not_found'
  | 'created'
  | 'running'
  | 'paused'
  | 'restarting'
  | 'removing'
  | 'exited'
  | 'dead'
  | 'starting'
  | 'stopping';

// Health status
export type HealthStatus = 'unknown' | 'healthy' | 'degraded' | 'unhealthy';

// Resource usage metrics
export interface ResourceUsage {
  cpuPercent: number;
  memoryUsage: number; // bytes
  memoryLimit: number; // bytes
  memoryPercent: number;
  networkRx: number; // bytes
  networkTx: number; // bytes
  timestamp?: Date;
}

// Port mapping
export interface PortMapping {
  containerPort: number;
  hostPort: number;
  protocol: 'tcp' | 'udp';
  hostIp?: string;
}

// Log entry
export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source?: string;
}

// Full container status
export interface ContainerStatus {
  state: ContainerState;
  statusText: string;
  health: HealthStatus;
  healthMessage?: string;
  resources: ResourceUsage | null;
  ports: PortMapping[];
  logs: LogEntry[];
  lastUpdated: Date | null;
  error?: string;
  restartCount: number;
}

// Maximum number of log entries to keep
const MAX_LOG_ENTRIES = 100;

// Initial state
const initialStatus: ContainerStatus = {
  state: 'unknown',
  statusText: 'Unknown',
  health: 'unknown',
  healthMessage: undefined,
  resources: null,
  ports: [],
  logs: [],
  lastUpdated: null,
  error: undefined,
  restartCount: 0,
};

// Main container status store
export const containerStatusStore = atom<ContainerStatus>({ ...initialStatus });

// Computed stores for individual values
export const containerState = computed(containerStatusStore, (status) => status.state);
export const containerHealth = computed(containerStatusStore, (status) => status.health);
export const containerResources = computed(containerStatusStore, (status) => status.resources);
export const containerPorts = computed(containerStatusStore, (status) => status.ports);
export const containerLogs = computed(containerStatusStore, (status) => status.logs);

// Computed: Is container running?
export const isContainerRunning = computed(
  containerStatusStore,
  (status) => status.state === 'running'
);

// Computed: Is container in a transitional state?
export const isContainerTransitioning = computed(
  containerStatusStore,
  (status) =>
    status.state === 'starting' ||
    status.state === 'stopping' ||
    status.state === 'restarting' ||
    status.state === 'removing'
);

// Computed: Can container be started?
export const canStartContainer = computed(
  containerStatusStore,
  (status) =>
    status.state === 'exited' ||
    status.state === 'created' ||
    status.state === 'dead' ||
    status.state === 'not_found'
);

// Computed: Can container be stopped?
export const canStopContainer = computed(
  containerStatusStore,
  (status) => status.state === 'running' || status.state === 'paused'
);

// Computed: Formatted memory usage
export const formattedMemoryUsage = computed(containerStatusStore, (status) => {
  if (!status.resources) return null;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return {
    used: formatBytes(status.resources.memoryUsage),
    limit: formatBytes(status.resources.memoryLimit),
    percent: status.resources.memoryPercent.toFixed(1),
  };
});

// Computed: State color for UI
export const stateColor = computed(containerStatusStore, (status) => {
  switch (status.state) {
    case 'running':
      return 'bg-green-500';
    case 'paused':
      return 'bg-yellow-500';
    case 'starting':
    case 'restarting':
      return 'bg-blue-500';
    case 'stopping':
    case 'removing':
      return 'bg-orange-500';
    case 'exited':
    case 'dead':
      return 'bg-red-500';
    case 'created':
      return 'bg-gray-500';
    case 'not_found':
    case 'unknown':
    default:
      return 'bg-gray-400';
  }
});

// Computed: Health color for UI
export const healthColor = computed(containerStatusStore, (status) => {
  switch (status.health) {
    case 'healthy':
      return 'bg-green-500';
    case 'degraded':
      return 'bg-yellow-500';
    case 'unhealthy':
      return 'bg-red-500';
    case 'unknown':
    default:
      return 'bg-gray-400';
  }
});

// ==================== Actions ====================

/**
 * Update container state and status text
 */
export function updateContainerStatus(state: ContainerState, statusText: string): void {
  const current = containerStatusStore.get();
  containerStatusStore.set({
    ...current,
    state,
    statusText,
    lastUpdated: new Date(),
    error: undefined, // Clear error on successful update
  });
}

/**
 * Update resource usage metrics
 */
export function updateResourceUsage(resources: ResourceUsage): void {
  const current = containerStatusStore.get();
  containerStatusStore.set({
    ...current,
    resources: {
      ...resources,
      timestamp: new Date(),
    },
    lastUpdated: new Date(),
  });
}

/**
 * Update port mappings
 */
export function updatePortMappings(ports: PortMapping[]): void {
  const current = containerStatusStore.get();
  containerStatusStore.set({
    ...current,
    ports,
    lastUpdated: new Date(),
  });
}

/**
 * Add a log entry
 */
export function addContainerLog(entry: LogEntry): void {
  const current = containerStatusStore.get();
  const logs = [...current.logs, entry];

  // Keep only the last MAX_LOG_ENTRIES
  if (logs.length > MAX_LOG_ENTRIES) {
    logs.splice(0, logs.length - MAX_LOG_ENTRIES);
  }

  containerStatusStore.set({
    ...current,
    logs,
  });
}

/**
 * Add multiple log entries
 */
export function addContainerLogs(entries: LogEntry[]): void {
  const current = containerStatusStore.get();
  const logs = [...current.logs, ...entries];

  // Keep only the last MAX_LOG_ENTRIES
  if (logs.length > MAX_LOG_ENTRIES) {
    logs.splice(0, logs.length - MAX_LOG_ENTRIES);
  }

  containerStatusStore.set({
    ...current,
    logs,
  });
}

/**
 * Clear all logs
 */
export function clearContainerLogs(): void {
  const current = containerStatusStore.get();
  containerStatusStore.set({
    ...current,
    logs: [],
  });
}

/**
 * Set health status
 */
export function setContainerHealth(health: HealthStatus, message?: string): void {
  const current = containerStatusStore.get();
  containerStatusStore.set({
    ...current,
    health,
    healthMessage: message,
    lastUpdated: new Date(),
  });
}

/**
 * Set error message
 */
export function setContainerError(error: string): void {
  const current = containerStatusStore.get();
  containerStatusStore.set({
    ...current,
    error,
    lastUpdated: new Date(),
  });
}

/**
 * Clear error
 */
export function clearContainerError(): void {
  const current = containerStatusStore.get();
  containerStatusStore.set({
    ...current,
    error: undefined,
  });
}

/**
 * Increment restart count
 */
export function incrementRestartCount(): void {
  const current = containerStatusStore.get();
  containerStatusStore.set({
    ...current,
    restartCount: current.restartCount + 1,
  });
}

/**
 * Reset container status to initial state
 */
export function resetContainerStatus(): void {
  containerStatusStore.set({ ...initialStatus });
}

/**
 * Get human-readable state text
 */
export function getStateText(state: ContainerState): string {
  switch (state) {
    case 'running':
      return 'Running';
    case 'paused':
      return 'Paused';
    case 'starting':
      return 'Starting...';
    case 'stopping':
      return 'Stopping...';
    case 'restarting':
      return 'Restarting...';
    case 'removing':
      return 'Removing...';
    case 'exited':
      return 'Stopped';
    case 'dead':
      return 'Dead';
    case 'created':
      return 'Created';
    case 'not_found':
      return 'Not Found';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

/**
 * Get human-readable health text
 */
export function getHealthText(health: HealthStatus): string {
  switch (health) {
    case 'healthy':
      return 'Healthy';
    case 'degraded':
      return 'Degraded';
    case 'unhealthy':
      return 'Unhealthy';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

/**
 * Format port mapping for display
 */
export function formatPortMapping(port: PortMapping): string {
  const host = port.hostIp && port.hostIp !== '0.0.0.0' ? port.hostIp : 'localhost';
  return `${host}:${port.hostPort} -> ${port.containerPort}/${port.protocol}`;
}

/**
 * Get the primary port (usually the dev server port)
 */
export function getPrimaryPort(): PortMapping | null {
  const status = containerStatusStore.get();
  // Prefer port 3000 (common dev server port), otherwise return first port
  return status.ports.find((p) => p.containerPort === 3000) || status.ports[0] || null;
}

/**
 * Get preview URL based on primary port
 */
export function getPreviewUrl(): string | null {
  const primaryPort = getPrimaryPort();
  if (!primaryPort) return null;
  const host = primaryPort.hostIp && primaryPort.hostIp !== '0.0.0.0'
    ? primaryPort.hostIp
    : 'localhost';
  return `http://${host}:${primaryPort.hostPort}`;
}

/**
 * Subscribe to state changes
 */
export function onStateChange(callback: (state: ContainerState) => void): () => void {
  let lastState = containerStatusStore.get().state;

  return containerStatusStore.subscribe((status) => {
    if (status.state !== lastState) {
      lastState = status.state;
      callback(status.state);
    }
  });
}

/**
 * Subscribe to health changes
 */
export function onHealthChange(callback: (health: HealthStatus) => void): () => void {
  let lastHealth = containerStatusStore.get().health;

  return containerStatusStore.subscribe((status) => {
    if (status.health !== lastHealth) {
      lastHealth = status.health;
      callback(status.health);
    }
  });
}

/**
 * Get container status summary for debugging
 */
export function getStatusSummary(): string {
  const status = containerStatusStore.get();
  const mem = status.resources
    ? `${(status.resources.memoryUsage / 1024 / 1024).toFixed(1)}MB / ${(status.resources.memoryLimit / 1024 / 1024).toFixed(1)}MB`
    : 'N/A';
  const cpu = status.resources ? `${status.resources.cpuPercent.toFixed(1)}%` : 'N/A';

  return [
    `State: ${getStateText(status.state)}`,
    `Health: ${getHealthText(status.health)}`,
    `CPU: ${cpu}`,
    `Memory: ${mem}`,
    `Ports: ${status.ports.length}`,
    `Logs: ${status.logs.length}`,
    status.error ? `Error: ${status.error}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}
