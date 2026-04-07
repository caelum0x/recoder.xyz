"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG = void 0;
/** Default configuration values. */
exports.DEFAULT_CONNECTOR_HEALTH_MONITOR_CONFIG = {
    maxRestartAttempts: 5,
    restartWindowMs: 300_000, // 5 minutes
    initialBackoffMs: 1_000, // 1 second
    maxBackoffMs: 16_000, // 16 seconds
    backoffMultiplier: 2,
    circuitCooldownMs: 60_000, // 60 seconds
    healthCheckIntervalMs: 30_000, // 30 seconds
};
