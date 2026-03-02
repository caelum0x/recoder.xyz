/**
 * @module heartbeat-tracker.service
 *
 * Agent heartbeat tracking service for liveness detection in the A2A
 * control plane.
 *
 * Each agent sends periodic heartbeats via the REST API. This service:
 *
 * 1. Records the timestamp and reported status for each heartbeat.
 * 2. Marks agents as offline when no heartbeat is received within the
 *    configurable timeout window (default: 90 s = 3x the 30 s interval).
 * 3. Runs a periodic sweep (every 60 s by default) to detect stale agents.
 * 4. Emits typed events when an agent transitions between online/offline
 *    so that SSE or WebSocket layers can push updates to clients.
 * 5. Optionally performs active health probing against agents that expose
 *    a health endpoint URL in their agent card.
 * 6. Cleans up tracking state when an agent is unregistered.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../logger';

const logger = createLogger('a2a-heartbeat-tracker');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Status reported by the agent in its heartbeat payload. */
export type AgentHeartbeatStatus = 'healthy' | 'degraded' | 'unhealthy';

/** Overall liveness derived from heartbeat recency + reported status. */
export type AgentLivenessStatus = 'online' | 'offline';

/** Optional resource metadata attached to a heartbeat. */
export interface HeartbeatMetadata {
  cpu?: number;
  memory?: number;
  activeTaskCount?: number;
  version?: string;
  [key: string]: unknown;
}

/** Internal record stored per agent. */
export interface HeartbeatRecord {
  agentId: string;
  status: AgentHeartbeatStatus;
  lastHeartbeatAt: number; // epoch ms
  metadata: HeartbeatMetadata;
  /** Whether the agent is considered reachable (heartbeat within timeout). */
  isOnline: boolean;
  /** Results from active health probing (if applicable). */
  probe?: HealthProbeResult;
}

/** Result of an active health probe against an agent's health endpoint. */
export interface HealthProbeResult {
  url: string;
  statusCode: number | null;
  responseTimeMs: number;
  ok: boolean;
  lastProbeAt: number; // epoch ms
  error?: string;
}

/** Per-agent view returned by the health aggregation endpoint. */
export interface AgentHealthSummaryEntry {
  agentId: string;
  status: AgentHeartbeatStatus;
  lastHeartbeat: string; // ISO 8601
  isOnline: boolean;
  metadata: HeartbeatMetadata;
  probe?: HealthProbeResult;
}

/** Aggregated summary across all agents. */
export interface HealthAggregation {
  agents: AgentHealthSummaryEntry[];
  summary: {
    total: number;
    online: number;
    offline: number;
    degraded: number;
  };
}

/** Configuration for the HeartbeatTracker. */
export interface HeartbeatTrackerConfig {
  /** Heartbeat interval that agents should use (seconds). Default 30. */
  heartbeatIntervalSeconds: number;
  /** Time after which an agent without heartbeat is marked offline (ms). Default 90000. */
  timeoutMs: number;
  /** Interval between sweep passes that detect stale agents (ms). Default 60000. */
  sweepIntervalMs: number;
  /** Interval between active health probes for agents with health URLs (ms). Default 60000. */
  probeIntervalMs: number;
  /** Timeout for individual HTTP probe requests (ms). Default 5000. */
  probeRequestTimeoutMs: number;
}

/** Events emitted by the HeartbeatTracker. */
export interface HeartbeatTrackerEvents {
  'agent:online': { agentId: string; status: AgentHeartbeatStatus; timestamp: string };
  'agent:offline': { agentId: string; lastHeartbeat: string; timestamp: string };
  'agent:status-changed': {
    agentId: string;
    previousStatus: AgentHeartbeatStatus;
    newStatus: AgentHeartbeatStatus;
    timestamp: string;
  };
  'agent:probe-failed': {
    agentId: string;
    url: string;
    error: string;
    timestamp: string;
  };
  'sweep:completed': {
    totalAgents: number;
    onlineCount: number;
    offlineCount: number;
    newlyOffline: string[];
    timestamp: string;
  };
}

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: HeartbeatTrackerConfig = {
  heartbeatIntervalSeconds: 30,
  timeoutMs: 90_000,
  sweepIntervalMs: 60_000,
  probeIntervalMs: 60_000,
  probeRequestTimeoutMs: 5_000,
};

// ---------------------------------------------------------------------------
// Typed EventEmitter
// ---------------------------------------------------------------------------

export type HeartbeatEventName = keyof HeartbeatTrackerEvents;

export class HeartbeatEventEmitter extends EventEmitter {
  override emit<K extends HeartbeatEventName>(
    event: K,
    payload: HeartbeatTrackerEvents[K],
  ): boolean {
    return super.emit(event, payload);
  }

  override on<K extends HeartbeatEventName>(
    event: K,
    listener: (payload: HeartbeatTrackerEvents[K]) => void,
  ): this {
    return super.on(event, listener);
  }

  override once<K extends HeartbeatEventName>(
    event: K,
    listener: (payload: HeartbeatTrackerEvents[K]) => void,
  ): this {
    return super.once(event, listener);
  }

  override off<K extends HeartbeatEventName>(
    event: K,
    listener: (payload: HeartbeatTrackerEvents[K]) => void,
  ): this {
    return super.off(event, listener);
  }
}

// ---------------------------------------------------------------------------
// Fetch function type (injectable for testing)
// ---------------------------------------------------------------------------

export type FetchFn = (
  url: string,
  options: { signal?: AbortSignal; method?: string },
) => Promise<{ status: number; ok: boolean }>;

// ---------------------------------------------------------------------------
// HeartbeatTracker
// ---------------------------------------------------------------------------

export class HeartbeatTracker {
  readonly config: Readonly<HeartbeatTrackerConfig>;
  readonly events: HeartbeatEventEmitter;

  private readonly records = new Map<string, HeartbeatRecord>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private probeTimer: ReturnType<typeof setInterval> | null = null;
  private readonly healthUrls = new Map<string, string>();
  private fetchFn: FetchFn;

  constructor(config?: Partial<HeartbeatTrackerConfig>, fetchFn?: FetchFn) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = new HeartbeatEventEmitter();
    // Default fetch implementation uses global fetch (available in Node 18+)
    this.fetchFn = fetchFn ?? (async (url, opts) => {
      const res = await globalThis.fetch(url, opts);
      return { status: res.status, ok: res.ok };
    });
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /** Start the background sweep and probe timers. */
  start(): void {
    if (this.sweepTimer) return; // already running

    logger.info(
      {
        timeoutMs: this.config.timeoutMs,
        sweepIntervalMs: this.config.sweepIntervalMs,
        probeIntervalMs: this.config.probeIntervalMs,
      },
      'heartbeat tracker started',
    );

    this.sweepTimer = setInterval(() => {
      this.sweep();
    }, this.config.sweepIntervalMs);

    // Unref so the timer does not keep the process alive
    if (this.sweepTimer && typeof this.sweepTimer === 'object' && 'unref' in this.sweepTimer) {
      (this.sweepTimer as NodeJS.Timeout).unref();
    }

    this.probeTimer = setInterval(() => {
      void this.probeAll();
    }, this.config.probeIntervalMs);

    if (this.probeTimer && typeof this.probeTimer === 'object' && 'unref' in this.probeTimer) {
      (this.probeTimer as NodeJS.Timeout).unref();
    }
  }

  /** Stop the background timers. */
  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
    logger.info('heartbeat tracker stopped');
  }

  /** Remove all tracking state and stop timers. */
  destroy(): void {
    this.stop();
    this.records.clear();
    this.healthUrls.clear();
    this.events.removeAllListeners();
  }

  // -----------------------------------------------------------------------
  // Heartbeat recording
  // -----------------------------------------------------------------------

  /**
   * Record a heartbeat from an agent.
   *
   * Returns the recommended interval for the next heartbeat so that the
   * agent can dynamically adjust its cadence.
   */
  recordHeartbeat(
    agentId: string,
    status: AgentHeartbeatStatus,
    metadata: HeartbeatMetadata = {},
  ): { acknowledged: true; next_heartbeat_seconds: number } {
    const now = Date.now();
    const existing = this.records.get(agentId);

    const wasOnline = existing?.isOnline ?? false;
    const previousStatus = existing?.status;

    const record: HeartbeatRecord = {
      agentId,
      status,
      lastHeartbeatAt: now,
      metadata,
      isOnline: true,
      probe: existing?.probe,
    };

    this.records.set(agentId, record);

    // Emit online event if transitioning from offline -> online
    if (!wasOnline) {
      logger.info({ agentId, status }, 'agent came online');
      this.events.emit('agent:online', {
        agentId,
        status,
        timestamp: new Date(now).toISOString(),
      });
    }

    // Emit status-changed event if status changed
    if (previousStatus !== undefined && previousStatus !== status) {
      logger.info({ agentId, from: previousStatus, to: status }, 'agent status changed');
      this.events.emit('agent:status-changed', {
        agentId,
        previousStatus,
        newStatus: status,
        timestamp: new Date(now).toISOString(),
      });
    }

    return {
      acknowledged: true,
      next_heartbeat_seconds: this.config.heartbeatIntervalSeconds,
    };
  }

  // -----------------------------------------------------------------------
  // Agent cleanup
  // -----------------------------------------------------------------------

  /** Remove tracking state for an agent (called on unregistration). */
  removeAgent(agentId: string): boolean {
    this.healthUrls.delete(agentId);
    return this.records.delete(agentId);
  }

  // -----------------------------------------------------------------------
  // Health URL management (for active probing)
  // -----------------------------------------------------------------------

  /** Register a health endpoint URL for active probing. */
  setHealthUrl(agentId: string, url: string): void {
    this.healthUrls.set(agentId, url);
  }

  /** Remove a health endpoint URL. */
  removeHealthUrl(agentId: string): void {
    this.healthUrls.delete(agentId);
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /** Get the heartbeat record for a single agent. */
  getRecord(agentId: string): HeartbeatRecord | undefined {
    return this.records.get(agentId);
  }

  /** Get all heartbeat records. */
  getAllRecords(): HeartbeatRecord[] {
    return [...this.records.values()];
  }

  /** Check whether a specific agent is considered online. */
  isAgentOnline(agentId: string): boolean {
    const record = this.records.get(agentId);
    if (!record) return false;
    return record.isOnline && (Date.now() - record.lastHeartbeatAt) < this.config.timeoutMs;
  }

  /** Build the full health aggregation response. */
  getHealthAggregation(): HealthAggregation {
    const agents: AgentHealthSummaryEntry[] = [];
    let online = 0;
    let offline = 0;
    let degraded = 0;

    for (const record of this.records.values()) {
      const isOnline = this.isAgentOnline(record.agentId);

      agents.push({
        agentId: record.agentId,
        status: record.status,
        lastHeartbeat: new Date(record.lastHeartbeatAt).toISOString(),
        isOnline,
        metadata: record.metadata,
        probe: record.probe,
      });

      if (isOnline) {
        online++;
        if (record.status === 'degraded') {
          degraded++;
        }
      } else {
        offline++;
      }
    }

    return {
      agents,
      summary: {
        total: agents.length,
        online,
        offline,
        degraded,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Sweep -- detect stale agents
  // -----------------------------------------------------------------------

  /**
   * Run a single sweep pass.
   *
   * Iterates all tracked agents and marks any with expired heartbeats as
   * offline. Emits an `agent:offline` event for each newly-offline agent
   * and a `sweep:completed` summary event.
   */
  sweep(): void {
    const now = Date.now();
    const newlyOffline: string[] = [];
    let onlineCount = 0;
    let offlineCount = 0;

    for (const record of this.records.values()) {
      const elapsed = now - record.lastHeartbeatAt;
      const wasOnline = record.isOnline;

      if (elapsed >= this.config.timeoutMs) {
        record.isOnline = false;
        offlineCount++;

        if (wasOnline) {
          newlyOffline.push(record.agentId);
          logger.warn(
            { agentId: record.agentId, elapsedMs: elapsed, timeoutMs: this.config.timeoutMs },
            'agent heartbeat timed out -- marking offline',
          );
          this.events.emit('agent:offline', {
            agentId: record.agentId,
            lastHeartbeat: new Date(record.lastHeartbeatAt).toISOString(),
            timestamp: new Date(now).toISOString(),
          });
        }
      } else {
        record.isOnline = true;
        onlineCount++;
      }
    }

    this.events.emit('sweep:completed', {
      totalAgents: this.records.size,
      onlineCount,
      offlineCount,
      newlyOffline,
      timestamp: new Date(now).toISOString(),
    });

    if (newlyOffline.length > 0) {
      logger.info(
        { newlyOffline, total: this.records.size, onlineCount, offlineCount },
        'sweep completed with newly-offline agents',
      );
    }
  }

  // -----------------------------------------------------------------------
  // Active health probing
  // -----------------------------------------------------------------------

  /**
   * Probe all agents that have a registered health URL.
   *
   * Sends an HTTP GET to each health URL and records the result.
   * Factored into overall health assessment via the `probe` field on the
   * HeartbeatRecord.
   */
  async probeAll(): Promise<void> {
    const promises: Promise<HealthProbeResult>[] = [];
    for (const [agentId, url] of this.healthUrls.entries()) {
      promises.push(this.probeAgent(agentId, url));
    }
    await Promise.allSettled(promises);
  }

  /**
   * Probe a single agent's health endpoint.
   */
  async probeAgent(agentId: string, url: string): Promise<HealthProbeResult> {
    const start = Date.now();
    let result: HealthProbeResult;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.probeRequestTimeoutMs);

      try {
        const res = await this.fetchFn(url, {
          signal: controller.signal,
          method: 'GET',
        });
        clearTimeout(timeout);

        result = {
          url,
          statusCode: res.status,
          responseTimeMs: Date.now() - start,
          ok: res.ok,
          lastProbeAt: Date.now(),
        };
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      result = {
        url,
        statusCode: null,
        responseTimeMs: Date.now() - start,
        ok: false,
        lastProbeAt: Date.now(),
        error: errorMessage,
      };

      logger.warn({ agentId, url, error: errorMessage }, 'health probe failed');
      this.events.emit('agent:probe-failed', {
        agentId,
        url,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }

    // Store probe result on the agent's record (if it exists)
    const record = this.records.get(agentId);
    if (record) {
      record.probe = result;
    }

    return result;
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _defaultTracker: HeartbeatTracker | null = null;

/** Get or create the default singleton HeartbeatTracker. */
export function getHeartbeatTracker(): HeartbeatTracker {
  if (!_defaultTracker) {
    _defaultTracker = new HeartbeatTracker();
  }
  return _defaultTracker;
}

/** Replace or set the singleton (for production config or testing). */
export function setHeartbeatTracker(tracker: HeartbeatTracker): void {
  _defaultTracker = tracker;
}

/** Reset the singleton (for testing). */
export function resetHeartbeatTracker(): void {
  if (_defaultTracker) {
    _defaultTracker.destroy();
  }
  _defaultTracker = null;
}
