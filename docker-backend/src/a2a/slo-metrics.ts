import type { ConnectorHealthEventEmitter } from './connector-health-monitor.service';
import { getA2ATaskQueue } from './task-queue.service';
import { getAgentMessagingService } from './agent-messaging.service';
import { getAgentRegistryService } from './agent-registry.service';

export interface AdapterMetricsSummary {
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgDurationMs: number;
  p95DurationMs: number;
  totalRetries: number;
  healthChecks: {
    total: number;
    reachable: number;
    unreachable: number;
    avgLatencyMs: number;
  };
  byAdapter: Record<string, {
    adapterId: string;
    adapterType: string;
    executions: number;
    successRate: number;
    avgDurationMs: number;
    healthChecks: number;
    lastActivity: string | null;
  }>;
  registrations: number;
  deregistrations: number;
}

export interface A2ASloSummary {
  timestamp: string;
  connectors: {
    executionsTotal: number;
    successes: number;
    failures: number;
    successRate: number;
    latencyMs: {
      p50: number;
      p95: number;
      avg: number;
    };
    restartsTotal: number;
    retryRate: number;
    circuitOpenTotal: number;
  };
  approvals: {
    turnaroundCount: number;
    turnaroundMs: {
      p50: number;
      p95: number;
      avg: number;
    };
  };
  adapters: AdapterMetricsSummary;
}

interface ConnectorExecution {
  connectorId: string;
  success: boolean;
  durationMs: number;
  timestamp: number;
}

interface AdapterExecution {
  adapterId: string;
  adapterType: 'rest' | 'git';
  success: boolean;
  durationMs: number;
  retryCount: number;
  timestamp: number;
}

interface AdapterHealthCheck {
  adapterId: string;
  adapterType: 'rest' | 'git';
  reachable: boolean;
  latencyMs: number;
  timestamp: number;
}

interface AdapterLifecycleEvent {
  adapterId: string;
  adapterType: 'rest' | 'git';
  event: 'registered' | 'unregistered';
  timestamp: number;
}

const MAX_SAMPLES = 2000;
const MAX_ADAPTER_SAMPLES = 10000;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

class A2ASloMetricsCollector {
  private executions: ConnectorExecution[] = [];
  private approvalTurnarounds: number[] = [];
  private restartsTotal = 0;
  private circuitOpenTotal = 0;
  private boundMonitors = new WeakSet<ConnectorHealthEventEmitter>();

  private adapterExecutions: AdapterExecution[] = [];
  private adapterHealthChecks: AdapterHealthCheck[] = [];
  private adapterLifecycleEvents: AdapterLifecycleEvent[] = [];

  recordConnectorExecution(input: { connectorId: string; success: boolean; durationMs: number }): void {
    this.executions.push({
      connectorId: input.connectorId,
      success: input.success,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      timestamp: Date.now(),
    });
    if (this.executions.length > MAX_SAMPLES) {
      this.executions.shift();
    }
  }

  recordConnectorRestart(): void {
    this.restartsTotal += 1;
  }

  recordCircuitOpen(): void {
    this.circuitOpenTotal += 1;
  }

  recordApprovalTurnaround(durationMs: number): void {
    this.approvalTurnarounds.push(Math.max(0, Math.round(durationMs)));
    if (this.approvalTurnarounds.length > MAX_SAMPLES) {
      this.approvalTurnarounds.shift();
    }
  }

  bindConnectorHealthMonitor(events: ConnectorHealthEventEmitter): void {
    if (this.boundMonitors.has(events)) return;
    this.boundMonitors.add(events);
    events.on('connector.restarting', () => this.recordConnectorRestart());
    events.on('circuit.open', () => this.recordCircuitOpen());
  }

  recordAdapterExecution(input: {
    adapterId: string;
    adapterType: 'rest' | 'git';
    success: boolean;
    durationMs: number;
    retryCount?: number;
  }): void {
    this.adapterExecutions.push({
      adapterId: input.adapterId,
      adapterType: input.adapterType,
      success: input.success,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      retryCount: input.retryCount ?? 0,
      timestamp: Date.now(),
    });
    if (this.adapterExecutions.length > MAX_ADAPTER_SAMPLES) {
      this.adapterExecutions.shift();
    }
  }

  recordAdapterHealthCheck(input: {
    adapterId: string;
    adapterType: 'rest' | 'git';
    reachable: boolean;
    latencyMs: number;
  }): void {
    this.adapterHealthChecks.push({
      adapterId: input.adapterId,
      adapterType: input.adapterType,
      reachable: input.reachable,
      latencyMs: Math.max(0, Math.round(input.latencyMs)),
      timestamp: Date.now(),
    });
    if (this.adapterHealthChecks.length > MAX_ADAPTER_SAMPLES) {
      this.adapterHealthChecks.shift();
    }
  }

  recordAdapterLifecycle(input: {
    adapterId: string;
    adapterType: 'rest' | 'git';
    event: 'registered' | 'unregistered';
  }): void {
    this.adapterLifecycleEvents.push({
      adapterId: input.adapterId,
      adapterType: input.adapterType,
      event: input.event,
      timestamp: Date.now(),
    });
  }

  getAdapterMetrics(): AdapterMetricsSummary {
    const totalExecutions = this.adapterExecutions.length;
    const successCount = this.adapterExecutions.filter((e) => e.success).length;
    const failureCount = totalExecutions - successCount;
    const successRate = totalExecutions > 0 ? successCount / totalExecutions : 1;

    const durations = this.adapterExecutions.map((e) => e.durationMs).sort((a, b) => a - b);
    const avgDurationMs = durations.length > 0
      ? Math.round(durations.reduce((sum, v) => sum + v, 0) / durations.length)
      : 0;
    const p95DurationMs = Math.round(percentile(durations, 95));

    const totalRetries = this.adapterExecutions.reduce((sum, e) => sum + e.retryCount, 0);

    const totalHealthChecks = this.adapterHealthChecks.length;
    const reachableChecks = this.adapterHealthChecks.filter((h) => h.reachable).length;
    const unreachableChecks = totalHealthChecks - reachableChecks;
    const healthLatencies = this.adapterHealthChecks.map((h) => h.latencyMs);
    const avgHealthLatencyMs = healthLatencies.length > 0
      ? Math.round(healthLatencies.reduce((sum, v) => sum + v, 0) / healthLatencies.length)
      : 0;

    const registrations = this.adapterLifecycleEvents.filter((e) => e.event === 'registered').length;
    const deregistrations = this.adapterLifecycleEvents.filter((e) => e.event === 'unregistered').length;

    // Build per-adapter breakdown
    const adapterIds = new Set<string>();
    for (const e of this.adapterExecutions) adapterIds.add(e.adapterId);
    for (const h of this.adapterHealthChecks) adapterIds.add(h.adapterId);
    for (const l of this.adapterLifecycleEvents) adapterIds.add(l.adapterId);

    const byAdapter: AdapterMetricsSummary['byAdapter'] = {};
    for (const id of adapterIds) {
      const execs = this.adapterExecutions.filter((e) => e.adapterId === id);
      const checks = this.adapterHealthChecks.filter((h) => h.adapterId === id);
      const lifecycle = this.adapterLifecycleEvents.filter((l) => l.adapterId === id);

      const execCount = execs.length;
      const execSuccesses = execs.filter((e) => e.success).length;
      const adapterDurations = execs.map((e) => e.durationMs);
      const adapterAvgDuration = adapterDurations.length > 0
        ? Math.round(adapterDurations.reduce((sum, v) => sum + v, 0) / adapterDurations.length)
        : 0;

      // Determine adapter type from latest record
      const allRecords = [
        ...execs.map((e) => ({ type: e.adapterType, ts: e.timestamp })),
        ...checks.map((h) => ({ type: h.adapterType, ts: h.timestamp })),
        ...lifecycle.map((l) => ({ type: l.adapterType, ts: l.timestamp })),
      ];
      const latestRecord = allRecords.sort((a, b) => b.ts - a.ts)[0];
      const adapterType = latestRecord?.type ?? 'rest';

      // Find last activity timestamp across all record types
      const allTimestamps = [
        ...execs.map((e) => e.timestamp),
        ...checks.map((h) => h.timestamp),
        ...lifecycle.map((l) => l.timestamp),
      ];
      const lastTs = allTimestamps.length > 0 ? Math.max(...allTimestamps) : null;

      byAdapter[id] = {
        adapterId: id,
        adapterType,
        executions: execCount,
        successRate: execCount > 0 ? execSuccesses / execCount : 1,
        avgDurationMs: adapterAvgDuration,
        healthChecks: checks.length,
        lastActivity: lastTs !== null ? new Date(lastTs).toISOString() : null,
      };
    }

    return {
      totalExecutions,
      successCount,
      failureCount,
      successRate,
      avgDurationMs,
      p95DurationMs,
      totalRetries,
      healthChecks: {
        total: totalHealthChecks,
        reachable: reachableChecks,
        unreachable: unreachableChecks,
        avgLatencyMs: avgHealthLatencyMs,
      },
      byAdapter,
      registrations,
      deregistrations,
    };
  }

  getSummary(): A2ASloSummary {
    const executionsTotal = this.executions.length;
    const successes = this.executions.filter((m) => m.success).length;
    const failures = executionsTotal - successes;
    const successRate = executionsTotal > 0 ? successes / executionsTotal : 1;

    const durations = this.executions.map((m) => m.durationMs).sort((a, b) => a - b);
    const avgLatency = durations.length > 0
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : 0;

    const approvalDurations = [...this.approvalTurnarounds].sort((a, b) => a - b);
    const approvalAvg = approvalDurations.length > 0
      ? Math.round(approvalDurations.reduce((sum, value) => sum + value, 0) / approvalDurations.length)
      : 0;

    return {
      timestamp: new Date().toISOString(),
      connectors: {
        executionsTotal,
        successes,
        failures,
        successRate,
        latencyMs: {
          p50: Math.round(percentile(durations, 50)),
          p95: Math.round(percentile(durations, 95)),
          avg: avgLatency,
        },
        restartsTotal: this.restartsTotal,
        retryRate: executionsTotal > 0 ? this.restartsTotal / executionsTotal : 0,
        circuitOpenTotal: this.circuitOpenTotal,
      },
      approvals: {
        turnaroundCount: approvalDurations.length,
        turnaroundMs: {
          p50: Math.round(percentile(approvalDurations, 50)),
          p95: Math.round(percentile(approvalDurations, 95)),
          avg: approvalAvg,
        },
      },
      adapters: this.getAdapterMetrics(),
    };
  }

  getPrometheusFormat(): string {
    const summary = this.getSummary();
    const lines: string[] = [];

    lines.push('# HELP recoder_a2a_connector_executions_total Total A2A connector execution attempts');
    lines.push('# TYPE recoder_a2a_connector_executions_total counter');
    lines.push(`recoder_a2a_connector_executions_total ${summary.connectors.executionsTotal}`);

    lines.push('# HELP recoder_a2a_connector_successes_total Total successful A2A connector executions');
    lines.push('# TYPE recoder_a2a_connector_successes_total counter');
    lines.push(`recoder_a2a_connector_successes_total ${summary.connectors.successes}`);

    lines.push('# HELP recoder_a2a_connector_failures_total Total failed A2A connector executions');
    lines.push('# TYPE recoder_a2a_connector_failures_total counter');
    lines.push(`recoder_a2a_connector_failures_total ${summary.connectors.failures}`);

    lines.push('# HELP recoder_a2a_connector_success_rate Ratio of successful connector executions');
    lines.push('# TYPE recoder_a2a_connector_success_rate gauge');
    lines.push(`recoder_a2a_connector_success_rate ${summary.connectors.successRate}`);

    lines.push('# HELP recoder_a2a_connector_latency_p50_ms P50 connector execution latency in milliseconds');
    lines.push('# TYPE recoder_a2a_connector_latency_p50_ms gauge');
    lines.push(`recoder_a2a_connector_latency_p50_ms ${summary.connectors.latencyMs.p50}`);

    lines.push('# HELP recoder_a2a_connector_latency_p95_ms P95 connector execution latency in milliseconds');
    lines.push('# TYPE recoder_a2a_connector_latency_p95_ms gauge');
    lines.push(`recoder_a2a_connector_latency_p95_ms ${summary.connectors.latencyMs.p95}`);

    lines.push('# HELP recoder_a2a_connector_restarts_total Total connector restart attempts');
    lines.push('# TYPE recoder_a2a_connector_restarts_total counter');
    lines.push(`recoder_a2a_connector_restarts_total ${summary.connectors.restartsTotal}`);

    lines.push('# HELP recoder_a2a_connector_retry_rate Restart-attempts to execution ratio');
    lines.push('# TYPE recoder_a2a_connector_retry_rate gauge');
    lines.push(`recoder_a2a_connector_retry_rate ${summary.connectors.retryRate}`);

    lines.push('# HELP recoder_a2a_connector_circuit_open_total Total circuit-open transitions');
    lines.push('# TYPE recoder_a2a_connector_circuit_open_total counter');
    lines.push(`recoder_a2a_connector_circuit_open_total ${summary.connectors.circuitOpenTotal}`);

    lines.push('# HELP recoder_a2a_approval_turnaround_p50_ms P50 approval turnaround in milliseconds');
    lines.push('# TYPE recoder_a2a_approval_turnaround_p50_ms gauge');
    lines.push(`recoder_a2a_approval_turnaround_p50_ms ${summary.approvals.turnaroundMs.p50}`);

    lines.push('# HELP recoder_a2a_approval_turnaround_p95_ms P95 approval turnaround in milliseconds');
    lines.push('# TYPE recoder_a2a_approval_turnaround_p95_ms gauge');
    lines.push(`recoder_a2a_approval_turnaround_p95_ms ${summary.approvals.turnaroundMs.p95}`);

    // --- Task queue metrics ---
    try {
      const queueStats = getA2ATaskQueue().getStats();
      lines.push('# HELP recoder_a2a_queue_queued_count Tasks currently queued');
      lines.push('# TYPE recoder_a2a_queue_queued_count gauge');
      lines.push(`recoder_a2a_queue_queued_count ${queueStats.queuedCount}`);

      lines.push('# HELP recoder_a2a_queue_running_count Tasks currently running');
      lines.push('# TYPE recoder_a2a_queue_running_count gauge');
      lines.push(`recoder_a2a_queue_running_count ${queueStats.runningCount}`);

      lines.push('# HELP recoder_a2a_queue_completed_count Tasks completed');
      lines.push('# TYPE recoder_a2a_queue_completed_count counter');
      lines.push(`recoder_a2a_queue_completed_count ${queueStats.completedCount}`);

      lines.push('# HELP recoder_a2a_queue_failed_count Tasks failed');
      lines.push('# TYPE recoder_a2a_queue_failed_count counter');
      lines.push(`recoder_a2a_queue_failed_count ${queueStats.failedCount}`);
    } catch { /* queue not initialized */ }

    // --- Messaging metrics ---
    try {
      const msgStats = getAgentMessagingService().getStats();
      lines.push('# HELP recoder_a2a_messages_total Total messages sent');
      lines.push('# TYPE recoder_a2a_messages_total counter');
      lines.push(`recoder_a2a_messages_total ${msgStats.totalSent}`);

      lines.push('# HELP recoder_a2a_messages_unread Total unread messages');
      lines.push('# TYPE recoder_a2a_messages_unread gauge');
      lines.push(`recoder_a2a_messages_unread ${msgStats.totalUnread}`);
    } catch { /* messaging not initialized */ }

    // --- Agent registry metrics ---
    try {
      const agents = getAgentRegistryService().discover();
      const onlineCount = agents.filter((a: any) => a.status === 'online').length;
      lines.push('# HELP recoder_a2a_agents_registered Total registered agents');
      lines.push('# TYPE recoder_a2a_agents_registered gauge');
      lines.push(`recoder_a2a_agents_registered ${agents.length}`);

      lines.push('# HELP recoder_a2a_agents_online Agents currently online');
      lines.push('# TYPE recoder_a2a_agents_online gauge');
      lines.push(`recoder_a2a_agents_online ${onlineCount}`);
    } catch { /* registry not initialized */ }

    // --- Adapter metrics ---
    const adapterMetrics = summary.adapters;
    lines.push('# HELP recoder_a2a_adapter_executions_total Total adapter executions');
    lines.push('# TYPE recoder_a2a_adapter_executions_total counter');
    lines.push(`recoder_a2a_adapter_executions_total ${adapterMetrics.totalExecutions}`);

    lines.push('# HELP recoder_a2a_adapter_success_rate Adapter execution success rate');
    lines.push('# TYPE recoder_a2a_adapter_success_rate gauge');
    lines.push(`recoder_a2a_adapter_success_rate ${adapterMetrics.successRate}`);

    lines.push('# HELP recoder_a2a_adapter_retries_total Total adapter retries');
    lines.push('# TYPE recoder_a2a_adapter_retries_total counter');
    lines.push(`recoder_a2a_adapter_retries_total ${adapterMetrics.totalRetries}`);

    return lines.join('\n');
  }

  reset(): void {
    this.executions = [];
    this.approvalTurnarounds = [];
    this.restartsTotal = 0;
    this.circuitOpenTotal = 0;
    this.boundMonitors = new WeakSet<ConnectorHealthEventEmitter>();
    this.adapterExecutions = [];
    this.adapterHealthChecks = [];
    this.adapterLifecycleEvents = [];
  }
}

let singleton: A2ASloMetricsCollector | null = null;

export function getA2ASloMetrics(): A2ASloMetricsCollector {
  if (!singleton) {
    singleton = new A2ASloMetricsCollector();
  }
  return singleton;
}

export function resetA2ASloMetrics(): void {
  if (singleton) {
    singleton.reset();
  }
}

