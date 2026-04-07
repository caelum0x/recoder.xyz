"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getA2ASloMetrics = getA2ASloMetrics;
exports.resetA2ASloMetrics = resetA2ASloMetrics;
const task_queue_service_1 = require("./task-queue.service");
const agent_messaging_service_1 = require("./agent-messaging.service");
const agent_registry_service_1 = require("./agent-registry.service");
const MAX_SAMPLES = 2000;
const MAX_ADAPTER_SAMPLES = 10000;
function percentile(sorted, p) {
    if (sorted.length === 0)
        return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
}
class A2ASloMetricsCollector {
    executions = [];
    approvalTurnarounds = [];
    restartsTotal = 0;
    circuitOpenTotal = 0;
    boundMonitors = new WeakSet();
    adapterExecutions = [];
    adapterHealthChecks = [];
    adapterLifecycleEvents = [];
    recordConnectorExecution(input) {
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
    recordConnectorRestart() {
        this.restartsTotal += 1;
    }
    recordCircuitOpen() {
        this.circuitOpenTotal += 1;
    }
    recordApprovalTurnaround(durationMs) {
        this.approvalTurnarounds.push(Math.max(0, Math.round(durationMs)));
        if (this.approvalTurnarounds.length > MAX_SAMPLES) {
            this.approvalTurnarounds.shift();
        }
    }
    bindConnectorHealthMonitor(events) {
        if (this.boundMonitors.has(events))
            return;
        this.boundMonitors.add(events);
        events.on('connector.restarting', () => this.recordConnectorRestart());
        events.on('circuit.open', () => this.recordCircuitOpen());
    }
    recordAdapterExecution(input) {
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
    recordAdapterHealthCheck(input) {
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
    recordAdapterLifecycle(input) {
        this.adapterLifecycleEvents.push({
            adapterId: input.adapterId,
            adapterType: input.adapterType,
            event: input.event,
            timestamp: Date.now(),
        });
    }
    getAdapterMetrics() {
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
        const adapterIds = new Set();
        for (const e of this.adapterExecutions)
            adapterIds.add(e.adapterId);
        for (const h of this.adapterHealthChecks)
            adapterIds.add(h.adapterId);
        for (const l of this.adapterLifecycleEvents)
            adapterIds.add(l.adapterId);
        const byAdapter = {};
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
    getSummary() {
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
    getPrometheusFormat() {
        const summary = this.getSummary();
        const lines = [];
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
            const queueStats = (0, task_queue_service_1.getA2ATaskQueue)().getStats();
            lines.push('# HELP recoder_a2a_queue_queued_count Tasks currently queued');
            lines.push('# TYPE recoder_a2a_queue_queued_count gauge');
            lines.push(`recoder_a2a_queue_queued_count ${queueStats.queuedCount}`);
            lines.push('# HELP recoder_a2a_queue_running_count Tasks currently running');
            lines.push('# TYPE recoder_a2a_queue_running_count gauge');
            lines.push(`recoder_a2a_queue_running_count ${queueStats.processingCount}`);
            lines.push('# HELP recoder_a2a_queue_completed_count Tasks completed');
            lines.push('# TYPE recoder_a2a_queue_completed_count counter');
            lines.push(`recoder_a2a_queue_completed_count ${queueStats.totalProcessed}`);
            lines.push('# HELP recoder_a2a_queue_failed_count Tasks failed');
            lines.push('# TYPE recoder_a2a_queue_failed_count counter');
            lines.push(`recoder_a2a_queue_failed_count ${queueStats.totalFailed}`);
        }
        catch { /* queue not initialized */ }
        // --- Messaging metrics ---
        try {
            const msgStats = (0, agent_messaging_service_1.getAgentMessagingService)().getStats();
            lines.push('# HELP recoder_a2a_messages_total Total messages sent');
            lines.push('# TYPE recoder_a2a_messages_total counter');
            lines.push(`recoder_a2a_messages_total ${msgStats.totalSent}`);
            lines.push('# HELP recoder_a2a_messages_unread Total unread messages');
            lines.push('# TYPE recoder_a2a_messages_unread gauge');
            lines.push(`recoder_a2a_messages_unread ${msgStats.totalSent - msgStats.totalRead}`);
        }
        catch { /* messaging not initialized */ }
        // --- Agent registry metrics ---
        try {
            const agents = (0, agent_registry_service_1.getAgentRegistryService)().discover();
            const onlineCount = agents.filter((a) => a.status === 'online').length;
            lines.push('# HELP recoder_a2a_agents_registered Total registered agents');
            lines.push('# TYPE recoder_a2a_agents_registered gauge');
            lines.push(`recoder_a2a_agents_registered ${agents.length}`);
            lines.push('# HELP recoder_a2a_agents_online Agents currently online');
            lines.push('# TYPE recoder_a2a_agents_online gauge');
            lines.push(`recoder_a2a_agents_online ${onlineCount}`);
        }
        catch { /* registry not initialized */ }
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
    reset() {
        this.executions = [];
        this.approvalTurnarounds = [];
        this.restartsTotal = 0;
        this.circuitOpenTotal = 0;
        this.boundMonitors = new WeakSet();
        this.adapterExecutions = [];
        this.adapterHealthChecks = [];
        this.adapterLifecycleEvents = [];
    }
}
let singleton = null;
function getA2ASloMetrics() {
    if (!singleton) {
        singleton = new A2ASloMetricsCollector();
    }
    return singleton;
}
function resetA2ASloMetrics() {
    if (singleton) {
        singleton.reset();
    }
}
