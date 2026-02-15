/**
 * System Monitor Component
 * Real-time monitoring of optimization system health and performance
 */

import { useEffect, useState } from 'react';
import type { ApiResponse } from "~/types/api-responses";
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('SystemMonitor');

interface SystemHealth {
  status: 'operational' | 'degraded' | 'down';
  components: {
    templateSystem: ComponentStatus;
    modelRouting: ComponentStatus;
    database: ComponentStatus;
    analytics: ComponentStatus;
    openrouter: ComponentStatus;
  };
  performance: {
    avgResponseTime: number;
    requestsPerMinute: number;
    errorRate: number;
    cacheHitRate: number;
  };
  costMetrics: {
    currentHourCost: number;
    currentHourSavings: number;
    projectedDailyCost: number;
    projectedMonthlyCost: number;
  };
}

interface ComponentStatus {
  status: 'operational' | 'degraded' | 'down';
  message?: string;
  lastCheck: number;
  metrics?: Record<string, any>;
}

interface PublicApiReadiness {
  status: 'ready' | 'not_ready' | 'error';
  overallReady?: boolean;
  queue?: {
    status?: string;
    queue?: {
      configuredBackend?: string;
      selectedBackend?: string;
      hasRedisUrl?: boolean;
    };
    warnings?: string[];
  };
  byok?: {
    missing?: string[];
    warnings?: string[];
  };
  error?: string;
}

export function SystemMonitor() {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [publicApiReadiness, setPublicApiReadiness] = useState<PublicApiReadiness | null>(null);
  const [logs, setLogs] = useState<Array<{ time: string; level: string; message: string }>>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    fetchSystemHealth();
    if (autoRefresh) {
      const interval = setInterval(fetchSystemHealth, 10000); // Every 10s
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchSystemHealth = async () => {
    try {
      const [response, readinessResponse] = await Promise.all([
        fetch('/api/system-health'),
        fetch('/api/health/public-api-readiness'),
      ]);
      const data = await response.json() as { health: SystemHealth };
      setHealth(data.health);
      const readinessData = await readinessResponse.json() as PublicApiReadiness;
      setPublicApiReadiness(readinessData);

      // Add log entry
      const newLog = {
        time: new Date().toLocaleTimeString(),
        level: data.health.status === 'operational' && readinessData.status === 'ready' ? 'info' : 'warn',
        message: `System check: ${data.health.status}; public API readiness: ${readinessData.status}`,
      };
      setLogs((prev) => [newLog, ...prev].slice(0, 50)); // Keep last 50 logs
    } catch (error) {
      logger.error('Failed to fetch system health:', error);
      const errorLog = {
        time: new Date().toLocaleTimeString(),
        level: 'error',
        message: `Health check failed: ${error}`,
      };
      setLogs((prev) => [errorLog, ...prev].slice(0, 50));
    }
  };

  if (!health) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-bolt-elements-textTertiary">Loading system status...</div>
      </div>
    );
  }

  const overallStatus = health.status;
  const statusColor = {
    operational: 'green',
    degraded: 'yellow',
    down: 'red',
  }[overallStatus];

  return (
    <div className="p-6 bg-bolt-elements-background-depth-1 min-h-screen">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-bolt-elements-textPrimary">System Monitor</h1>
          <p className="text-bolt-elements-textTertiary mt-2">Real-time health and performance metrics</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (10s)
          </label>
          <button
            onClick={fetchSystemHealth}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Refresh Now
          </button>
        </div>
      </div>

      {/* Overall Status */}
      <div className={`mb-6 p-6 rounded-lg border-2 ${
        statusColor === 'green' ? 'bg-green-50 border-green-300' :
        statusColor === 'yellow' ? 'bg-yellow-50 border-yellow-300' :
        'bg-red-50 border-red-300'
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-bolt-elements-textTertiary mb-1">System Status</div>
            <div className="text-3xl font-bold capitalize" style={{
              color: statusColor === 'green' ? '#059669' :
                     statusColor === 'yellow' ? '#D97706' : '#DC2626'
            }}>
              {overallStatus}
            </div>
          </div>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
            statusColor === 'green' ? 'bg-green-500' :
            statusColor === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
          }`}>
            <div className="w-12 h-12 bg-bolt-elements-background-depth-1 rounded-full" />
          </div>
        </div>
      </div>

      {/* Component Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <ComponentCard
          name="Template System"
          status={health.components.templateSystem.status}
          message={health.components.templateSystem.message}
          metrics={health.components.templateSystem.metrics}
        />
        <ComponentCard
          name="Model Routing"
          status={health.components.modelRouting.status}
          message={health.components.modelRouting.message}
          metrics={health.components.modelRouting.metrics}
        />
        <ComponentCard
          name="Database"
          status={health.components.database.status}
          message={health.components.database.message}
          metrics={health.components.database.metrics}
        />
        <ComponentCard
          name="Analytics"
          status={health.components.analytics.status}
          message={health.components.analytics.message}
          metrics={health.components.analytics.metrics}
        />
        <ComponentCard
          name="OpenRouter"
          status={health.components.openrouter.status}
          message={health.components.openrouter.message}
          metrics={health.components.openrouter.metrics}
        />
      </div>

      {/* Public API/BYOK readiness */}
      <PublicApiReadinessCard readiness={publicApiReadiness} />

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <PerformanceCard
          label="Avg Response Time"
          value={`${health.performance.avgResponseTime}ms`}
          threshold={2000}
          currentValue={health.performance.avgResponseTime}
        />
        <PerformanceCard
          label="Requests/Min"
          value={health.performance.requestsPerMinute.toString()}
          threshold={100}
          currentValue={health.performance.requestsPerMinute}
          inverse
        />
        <PerformanceCard
          label="Error Rate"
          value={`${health.performance.errorRate.toFixed(2)}%`}
          threshold={5}
          currentValue={health.performance.errorRate}
        />
        <PerformanceCard
          label="Cache Hit Rate"
          value={`${health.performance.cacheHitRate.toFixed(1)}%`}
          threshold={50}
          currentValue={health.performance.cacheHitRate}
          inverse
        />
      </div>

      {/* Cost Metrics */}
      <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Cost Metrics</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <div className="text-sm text-bolt-elements-textTertiary mb-1">Current Hour</div>
            <div className="text-2xl font-bold text-bolt-elements-textPrimary">
              ${health.costMetrics.currentHourCost.toFixed(4)}
            </div>
            <div className="text-sm text-green-600">
              Saved: ${health.costMetrics.currentHourSavings.toFixed(4)}
            </div>
          </div>
          <div>
            <div className="text-sm text-bolt-elements-textTertiary mb-1">Projected Daily</div>
            <div className="text-2xl font-bold text-bolt-elements-textPrimary">
              ${health.costMetrics.projectedDailyCost.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-bolt-elements-textTertiary mb-1">Projected Monthly</div>
            <div className="text-2xl font-bold text-bolt-elements-textPrimary">
              ${health.costMetrics.projectedMonthlyCost.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-sm text-bolt-elements-textTertiary mb-1">Efficiency</div>
            <div className="text-2xl font-bold text-green-600">
              {health.costMetrics.currentHourSavings > 0
                ? ((health.costMetrics.currentHourSavings / (health.costMetrics.currentHourCost + health.costMetrics.currentHourSavings)) * 100).toFixed(1)
                : '0'}%
            </div>
          </div>
        </div>
      </div>

      {/* System Logs */}
      <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-6">
        <h2 className="text-xl font-semibold mb-4">System Logs</h2>
        <div className="bg-bolt-elements-background-depth-1 rounded-lg p-4 font-mono text-sm h-64 overflow-y-auto">
          {logs.map((log, index) => (
            <div key={index} className="mb-1">
              <span className="text-bolt-elements-textTertiary">[{log.time}]</span>{' '}
              <span className={
                log.level === 'error' ? 'text-red-400' :
                log.level === 'warn' ? 'text-yellow-400' :
                'text-green-400'
              }>
                {log.level.toUpperCase()}
              </span>{' '}
              <span className="text-bolt-elements-textSecondary">{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PublicApiReadinessCard({ readiness }: { readiness: PublicApiReadiness | null }) {
  if (!readiness) {
    return (
      <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-6 mb-6">
        <h2 className="text-xl font-semibold mb-2">Public API / BYOK Readiness</h2>
        <div className="text-sm text-bolt-elements-textTertiary">Loading readiness...</div>
      </div>
    );
  }

  const ready = readiness.status === 'ready';
  const queueSelected = readiness.queue?.queue?.selectedBackend || 'unknown';
  const queueConfigured = readiness.queue?.queue?.configuredBackend || 'unknown';
  const hasRedisUrl = readiness.queue?.queue?.hasRedisUrl;
  const missing = readiness.byok?.missing || [];
  const warnings = [...(readiness.queue?.warnings || []), ...(readiness.byok?.warnings || [])];

  return (
    <div className={`rounded-lg border p-6 mb-6 ${
      ready
        ? 'bg-green-50 border-green-300'
        : 'bg-yellow-50 border-yellow-300'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xl font-semibold">Public API / BYOK Readiness</h2>
        <span className={`text-sm font-semibold px-2 py-1 rounded ${
          ready ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {ready ? 'READY' : readiness.status === 'error' ? 'ERROR' : 'NOT READY'}
        </span>
      </div>

      {readiness.error && (
        <div className="text-sm text-red-700 mb-3">{readiness.error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div className="bg-bolt-elements-background-depth-1 rounded p-3">
          <div className="text-bolt-elements-textTertiary mb-1">Queue Configured</div>
          <div className="font-semibold text-bolt-elements-textPrimary">{queueConfigured}</div>
        </div>
        <div className="bg-bolt-elements-background-depth-1 rounded p-3">
          <div className="text-bolt-elements-textTertiary mb-1">Queue Selected</div>
          <div className="font-semibold text-bolt-elements-textPrimary">{queueSelected}</div>
        </div>
        <div className="bg-bolt-elements-background-depth-1 rounded p-3">
          <div className="text-bolt-elements-textTertiary mb-1">Redis URL</div>
          <div className="font-semibold text-bolt-elements-textPrimary">{typeof hasRedisUrl === 'boolean' ? String(hasRedisUrl) : 'unknown'}</div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="mt-3 text-sm">
          <span className="font-medium text-yellow-700">Missing: </span>
          <span className="text-yellow-800">{missing.join(', ')}</span>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mt-2 text-sm">
          <span className="font-medium text-yellow-700">Warnings: </span>
          <span className="text-yellow-800">{warnings.join(' | ')}</span>
        </div>
      )}
    </div>
  );
}

// Component Status Card
function ComponentCard({
  name,
  status,
  message,
  metrics,
}: {
  name: string;
  status: string;
  message?: string;
  metrics?: Record<string, any>;
}) {
  const statusColor = {
    operational: 'green',
    degraded: 'yellow',
    down: 'red',
  }[status] || 'gray';

  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-bolt-elements-textPrimary">{name}</h3>
        <div className={`w-3 h-3 rounded-full ${
          statusColor === 'green' ? 'bg-green-500' :
          statusColor === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
        }`} />
      </div>
      <div className={`text-sm font-medium capitalize mb-1 ${
        statusColor === 'green' ? 'text-green-600' :
        statusColor === 'yellow' ? 'text-yellow-600' : 'text-red-600'
      }`}>
        {status}
      </div>
      {message && <div className="text-xs text-bolt-elements-textTertiary mb-2">{message}</div>}
      {metrics && (
        <div className="text-xs text-bolt-elements-textTertiary space-y-1">
          {Object.entries(metrics).map(([key, value]) => (
            <div key={key}>
              {key}: {String(value)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Performance Metric Card
function PerformanceCard({
  label,
  value,
  threshold,
  currentValue,
  inverse = false,
}: {
  label: string;
  value: string;
  threshold: number;
  currentValue: number;
  inverse?: boolean;
}) {
  const isGood = inverse ? currentValue >= threshold : currentValue <= threshold;
  const color = isGood ? 'green' : 'yellow';

  return (
    <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-4">
      <div className="text-sm text-bolt-elements-textTertiary mb-1">{label}</div>
      <div className={`text-2xl font-bold ${
        color === 'green' ? 'text-green-600' : 'text-yellow-600'
      }`}>
        {value}
      </div>
    </div>
  );
}
