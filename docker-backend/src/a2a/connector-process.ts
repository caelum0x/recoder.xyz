/**
 * @module connector-process
 *
 * Abstraction layer for spawned connector child processes (Codex, Claude, etc.).
 *
 * Defines the `ConnectorProcess` interface that concrete runtimes
 * (CodexConnectorRuntime, ClaudeConnectorRuntime) implement, plus all
 * supporting types for health monitoring, circuit breaker state, and
 * per-connector metrics.
 *
 * P13-008: Connector Health Monitor with Auto-Restart and Circuit Breaker
 */

import type { ChildProcess } from 'child_process';

// ---------------------------------------------------------------------------
// Connector platform enum
// ---------------------------------------------------------------------------

/** Supported connector platforms. */
export type ConnectorPlatform = 'codex' | 'claude' | 'cursor' | 'windsurf' | 'replit' | 'custom';

// ---------------------------------------------------------------------------
// Health types
// ---------------------------------------------------------------------------

/** Health status reported by a connector process. */
export type ConnectorHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/** Detailed health information for a connector. */
export interface ConnectorHealthInfo {
  status: ConnectorHealthStatus;
  pid: number | null;
  uptime: number; // ms since last successful start
  lastCheckedAt: string; // ISO 8601
  message?: string;
}

// ---------------------------------------------------------------------------
// Circuit breaker types
// ---------------------------------------------------------------------------

/** Circuit breaker states following the standard pattern. */
export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

/** Detailed circuit breaker status for a connector. */
export interface CircuitBreakerStatus {
  state: CircuitBreakerState;
  /** Number of consecutive failures that triggered the circuit to open. */
  failureCount: number;
  /** Timestamp when the circuit last transitioned (ISO 8601). */
  lastTransitionAt: string;
  /** When the circuit opened, how long until half-open (ms). */
  cooldownMs: number;
  /** If open, when the cooldown expires and half-open begins (ISO 8601 or null). */
  cooldownExpiresAt: string | null;
}

// ---------------------------------------------------------------------------
// Per-connector metrics
// ---------------------------------------------------------------------------

/** Runtime metrics tracked per connector. */
export interface ConnectorMetrics {
  /** Total number of times start() has been called. */
  totalStarts: number;
  /** Total number of process crashes detected. */
  totalCrashes: number;
  /** Current uptime in milliseconds (0 if not running). */
  uptimeMs: number;
  /** Reason for the last crash (null if never crashed). */
  lastCrashReason: string | null;
  /** Timestamp of the last crash (ISO 8601 or null). */
  lastCrashAt: string | null;
  /** Current circuit breaker state. */
  circuitState: CircuitBreakerState;
  /** Number of restart attempts in the current restart window. */
  restartAttemptsInWindow: number;
}

// ---------------------------------------------------------------------------
// Connector health monitor events
// ---------------------------------------------------------------------------

/** Typed events emitted by the ConnectorHealthMonitor. */
export interface ConnectorHealthEvents {
  'connector.started': {
    connectorId: string;
    platform: ConnectorPlatform;
    pid: number | null;
    timestamp: string;
  };
  'connector.stopped': {
    connectorId: string;
    platform: ConnectorPlatform;
    reason: string;
    timestamp: string;
  };
  'connector.crashed': {
    connectorId: string;
    platform: ConnectorPlatform;
    exitCode: number | null;
    signal: string | null;
    error: string | null;
    timestamp: string;
  };
  'connector.restarting': {
    connectorId: string;
    platform: ConnectorPlatform;
    attempt: number;
    delayMs: number;
    timestamp: string;
  };
  'circuit.open': {
    connectorId: string;
    platform: ConnectorPlatform;
    failureCount: number;
    cooldownMs: number;
    timestamp: string;
  };
  'circuit.half-open': {
    connectorId: string;
    platform: ConnectorPlatform;
    timestamp: string;
  };
  'circuit.closed': {
    connectorId: string;
    platform: ConnectorPlatform;
    timestamp: string;
  };
}

/** Union of all connector health event names. */
export type ConnectorHealthEventName = keyof ConnectorHealthEvents;

// ---------------------------------------------------------------------------
// ConnectorProcess interface
// ---------------------------------------------------------------------------

/**
 * Interface that concrete connector runtimes must implement.
 *
 * CodexConnectorRuntime (P13-005) and ClaudeConnectorRuntime (P13-006)
 * will implement this so the ConnectorHealthMonitor can manage them
 * uniformly.
 */
export interface ConnectorProcess {
  /** Unique identifier for this connector instance. */
  readonly connectorId: string;

  /** The platform this connector bridges to. */
  readonly platform: ConnectorPlatform;

  /** Reference to the underlying child process (null if not running). */
  readonly processRef: ChildProcess | null;

  /**
   * Start the connector process.
   * Resolves when the process is spawned and initial health check passes.
   * Throws if the process fails to start.
   */
  start(): Promise<void>;

  /**
   * Gracefully stop the connector process.
   * Sends SIGTERM, waits for graceful shutdown, then SIGKILL if needed.
   */
  stop(): Promise<void>;

  /** Whether the connector process is currently running. */
  isRunning(): boolean;

  /** Get the current health status of the connector. */
  getHealth(): ConnectorHealthInfo;

  /** Get the PID of the running process (null if not running). */
  getPid(): number | null;
}

// ---------------------------------------------------------------------------
// Configuration for the ConnectorHealthMonitor
// ---------------------------------------------------------------------------

/** Configuration for the ConnectorHealthMonitor. */
export interface ConnectorHealthMonitorConfig {
  /** Maximum restart attempts within the restart window. Default: 5. */
  maxRestartAttempts: number;

  /** Duration of the restart counting window in ms. Default: 300000 (5 min). */
  restartWindowMs: number;

  /** Initial backoff delay for restarts in ms. Default: 1000 (1s). */
  initialBackoffMs: number;

  /** Maximum backoff delay for restarts in ms. Default: 16000 (16s). */
  maxBackoffMs: number;

  /** Backoff multiplier. Default: 2. */
  backoffMultiplier: number;

  /** Circuit breaker cooldown period in ms. Default: 60000 (60s). */
  circuitCooldownMs: number;

  /** Health check interval in ms. Default: 30000 (30s). */
  healthCheckIntervalMs: number;
}

/** Default configuration values. */
export const DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG: ConnectorHealthMonitorConfig = {
  maxRestartAttempts: 5,
  restartWindowMs: 300_000, // 5 minutes
  initialBackoffMs: 1_000,  // 1 second
  maxBackoffMs: 16_000,     // 16 seconds
  backoffMultiplier: 2,
  circuitCooldownMs: 60_000, // 60 seconds
  healthCheckIntervalMs: 30_000, // 30 seconds
};

// ---------------------------------------------------------------------------
// Aggregate health response types (for HTTP endpoints)
// ---------------------------------------------------------------------------

/** Health summary for a single connector (returned by API). */
export interface ConnectorHealthSummary {
  connectorId: string;
  platform: ConnectorPlatform;
  isRunning: boolean;
  health: ConnectorHealthInfo;
  circuit: CircuitBreakerStatus;
  metrics: ConnectorMetrics;
}

/** Aggregated health of all connectors (returned by API). */
export interface AllConnectorsHealth {
  connectors: ConnectorHealthSummary[];
  summary: {
    total: number;
    running: number;
    stopped: number;
    circuitOpen: number;
  };
  timestamp: string;
}
