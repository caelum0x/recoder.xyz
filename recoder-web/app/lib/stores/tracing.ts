/**
 * Tracing Store - Nanostores for trace configuration and state management
 * Manages OTLP tracing configuration, recent traces for debugging,
 * and performance metrics aggregation
 */

import { atom, map, computed } from 'nanostores';
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('TracingStore');

// ============================================
// Types
// ============================================

export type ExportMode = 'console' | 'otlp' | 'none';

export interface TracingConfig {
  /** Whether tracing is enabled */
  enabled: boolean;
  /** Export mode: console (dev), otlp (prod), or none */
  exportMode: ExportMode;
  /** OTLP endpoint URL */
  otlpEndpoint?: string;
  /** OTLP headers for authentication */
  otlpHeaders?: Record<string, string>;
  /** Service name for traces */
  serviceName: string;
  /** Service version for traces */
  serviceVersion: string;
  /** Maximum number of recent traces to keep for debugging */
  maxRecentTraces: number;
  /** Sample rate (0.0 - 1.0) for production */
  sampleRate: number;
  /** Enable verbose console logging */
  verboseConsole: boolean;
}

export interface SpanContext {
  traceId: string;
  spanId: string;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface Trace {
  id: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'unset' | 'ok' | 'error';
  statusMessage?: string;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
  timestamp: number;
}

export interface PerformanceMetric {
  name: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  errorCount: number;
  errorRate: number;
  lastUpdated: number;
}

// ============================================
// Constants
// ============================================

const STORAGE_KEY = 'recoder_tracing_config';
const DEFAULT_MAX_TRACES = 100;

const DEFAULT_CONFIG: TracingConfig = {
  enabled: typeof window !== 'undefined' && window.location.hostname === 'localhost',
  exportMode: 'console',
  serviceName: 'recoder-web',
  serviceVersion: '1.0.0',
  maxRecentTraces: DEFAULT_MAX_TRACES,
  sampleRate: 1.0,
  verboseConsole: false,
};

// ============================================
// Persistence
// ============================================

function loadConfig(): TracingConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    logger.warn('[Tracing] Failed to load config:', e);
  }

  return DEFAULT_CONFIG;
}

function saveConfig(config: TracingConfig): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    logger.warn('[Tracing] Failed to save config:', e);
  }
}

// ============================================
// Stores
// ============================================

/**
 * Tracing configuration store
 */
export const tracingConfigStore = map<TracingConfig>(loadConfig());

// Persist config changes
tracingConfigStore.subscribe((config) => {
  saveConfig(config);
});

/**
 * Recent traces store for debugging
 */
export const recentTracesStore = atom<Trace[]>([]);

/**
 * Performance metrics aggregation
 */
export const metricsStore = map<Record<string, PerformanceMetric>>({});

/**
 * Active spans (for context tracking)
 */
export const activeSpansStore = atom<Map<string, SpanContext>>(new Map());

// ============================================
// Config Functions
// ============================================

/**
 * Enable/disable tracing
 */
export function setTracingEnabled(enabled: boolean): void {
  tracingConfigStore.setKey('enabled', enabled);
}

/**
 * Set export mode
 */
export function setExportMode(mode: ExportMode): void {
  tracingConfigStore.setKey('exportMode', mode);
}

/**
 * Configure OTLP endpoint
 */
export function setOTLPEndpoint(endpoint: string, headers?: Record<string, string>): void {
  const current = tracingConfigStore.get();
  tracingConfigStore.set({
    ...current,
    otlpEndpoint: endpoint,
    otlpHeaders: headers,
    exportMode: 'otlp',
  });
}

/**
 * Set sample rate for production
 */
export function setSampleRate(rate: number): void {
  tracingConfigStore.setKey('sampleRate', Math.max(0, Math.min(1, rate)));
}

/**
 * Set max recent traces to keep
 */
export function setMaxRecentTraces(max: number): void {
  tracingConfigStore.setKey('maxRecentTraces', max);

  // Prune existing traces if needed
  const traces = recentTracesStore.get();
  if (traces.length > max) {
    recentTracesStore.set(traces.slice(-max));
  }
}

/**
 * Set verbose console logging
 */
export function setVerboseConsole(verbose: boolean): void {
  tracingConfigStore.setKey('verboseConsole', verbose);
}

/**
 * Reset config to defaults
 */
export function resetTracingConfig(): void {
  tracingConfigStore.set(DEFAULT_CONFIG);
}

// ============================================
// Trace Functions
// ============================================

/**
 * Add a trace to recent traces
 */
export function addTrace(trace: Trace): void {
  const config = tracingConfigStore.get();

  if (!config.enabled) return;

  // Sample rate check
  if (config.sampleRate < 1.0 && Math.random() > config.sampleRate) {
    return;
  }

  const traces = recentTracesStore.get();
  const newTraces = [...traces, trace];

  // Prune if over limit
  if (newTraces.length > config.maxRecentTraces) {
    newTraces.splice(0, newTraces.length - config.maxRecentTraces);
  }

  recentTracesStore.set(newTraces);

  // Update metrics
  updateMetrics(trace);
}

/**
 * Get traces for a specific trace ID
 */
export function getTracesByTraceId(traceId: string): Trace[] {
  return recentTracesStore.get().filter((t) => t.traceId === traceId);
}

/**
 * Get traces by name pattern
 */
export function getTracesByName(pattern: string | RegExp): Trace[] {
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
  return recentTracesStore.get().filter((t) => regex.test(t.name));
}

/**
 * Get error traces
 */
export function getErrorTraces(): Trace[] {
  return recentTracesStore.get().filter((t) => t.status === 'error');
}

/**
 * Get slow traces (above threshold in ms)
 */
export function getSlowTraces(thresholdMs: number): Trace[] {
  return recentTracesStore.get().filter((t) => (t.duration ?? 0) > thresholdMs);
}

/**
 * Clear all recent traces
 */
export function clearTraces(): void {
  recentTracesStore.set([]);
}

// ============================================
// Metrics Functions
// ============================================

/**
 * Update metrics from a trace
 */
function updateMetrics(trace: Trace): void {
  if (!trace.duration) return;

  const metrics = metricsStore.get();
  const existing = metrics[trace.name];
  const isError = trace.status === 'error';

  if (existing) {
    const newCount = existing.count + 1;
    const newTotalDuration = existing.totalDuration + trace.duration;
    const newErrorCount = existing.errorCount + (isError ? 1 : 0);

    metricsStore.setKey(trace.name, {
      ...existing,
      count: newCount,
      totalDuration: newTotalDuration,
      avgDuration: newTotalDuration / newCount,
      minDuration: Math.min(existing.minDuration, trace.duration),
      maxDuration: Math.max(existing.maxDuration, trace.duration),
      errorCount: newErrorCount,
      errorRate: newErrorCount / newCount,
      lastUpdated: Date.now(),
    });
  } else {
    metricsStore.setKey(trace.name, {
      name: trace.name,
      count: 1,
      totalDuration: trace.duration,
      avgDuration: trace.duration,
      minDuration: trace.duration,
      maxDuration: trace.duration,
      errorCount: isError ? 1 : 0,
      errorRate: isError ? 1 : 0,
      lastUpdated: Date.now(),
    });
  }
}

/**
 * Get all metrics
 */
export function getAllMetrics(): PerformanceMetric[] {
  return Object.values(metricsStore.get());
}

/**
 * Get metrics for a specific span name
 */
export function getMetric(name: string): PerformanceMetric | undefined {
  return metricsStore.get()[name];
}

/**
 * Get top N slowest spans by average duration
 */
export function getSlowestSpans(n: number = 10): PerformanceMetric[] {
  return getAllMetrics()
    .sort((a, b) => b.avgDuration - a.avgDuration)
    .slice(0, n);
}

/**
 * Get top N highest error rate spans
 */
export function getHighestErrorRateSpans(n: number = 10): PerformanceMetric[] {
  return getAllMetrics()
    .filter((m) => m.errorCount > 0)
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, n);
}

/**
 * Get most called spans
 */
export function getMostCalledSpans(n: number = 10): PerformanceMetric[] {
  return getAllMetrics()
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

/**
 * Clear all metrics
 */
export function clearMetrics(): void {
  metricsStore.set({});
}

// ============================================
// Active Spans (Context Tracking)
// ============================================

/**
 * Register an active span
 */
export function registerActiveSpan(spanId: string, context: SpanContext): void {
  const spans = activeSpansStore.get();
  spans.set(spanId, context);
  activeSpansStore.set(new Map(spans));
}

/**
 * Unregister an active span
 */
export function unregisterActiveSpan(spanId: string): void {
  const spans = activeSpansStore.get();
  spans.delete(spanId);
  activeSpansStore.set(new Map(spans));
}

/**
 * Get active span by ID
 */
export function getActiveSpan(spanId: string): SpanContext | undefined {
  return activeSpansStore.get().get(spanId);
}

/**
 * Get all active spans
 */
export function getActiveSpans(): Map<string, SpanContext> {
  return activeSpansStore.get();
}

/**
 * Clear all active spans
 */
export function clearActiveSpans(): void {
  activeSpansStore.set(new Map());
}

// ============================================
// Computed Atoms
// ============================================

/**
 * Is tracing enabled
 */
export const isTracingEnabled = computed(tracingConfigStore, (config) => config.enabled);

/**
 * Current export mode
 */
export const currentExportMode = computed(tracingConfigStore, (config) => config.exportMode);

/**
 * Number of recent traces
 */
export const traceCount = computed(recentTracesStore, (traces) => traces.length);

/**
 * Number of error traces
 */
export const errorTraceCount = computed(
  recentTracesStore,
  (traces) => traces.filter((t) => t.status === 'error').length
);

/**
 * Average response time across all traces
 */
export const avgResponseTime = computed(recentTracesStore, (traces) => {
  const withDuration = traces.filter((t) => t.duration !== undefined);
  if (withDuration.length === 0) return 0;
  return withDuration.reduce((sum, t) => sum + (t.duration ?? 0), 0) / withDuration.length;
});

/**
 * Total metrics count
 */
export const metricsCount = computed(metricsStore, (metrics) => Object.keys(metrics).length);

/**
 * Active span count
 */
export const activeSpanCount = computed(activeSpansStore, (spans) => spans.size);

// ============================================
// Debug Utilities
// ============================================

/**
 * Get tracing state summary for debugging
 */
export function getTracingStateSummary(): {
  config: TracingConfig;
  traceCount: number;
  errorCount: number;
  avgResponseTime: number;
  metricsCount: number;
  activeSpans: number;
} {
  const traces = recentTracesStore.get();
  const errorTraces = traces.filter((t) => t.status === 'error');
  const withDuration = traces.filter((t) => t.duration !== undefined);
  const avgTime =
    withDuration.length > 0
      ? withDuration.reduce((sum, t) => sum + (t.duration ?? 0), 0) / withDuration.length
      : 0;

  return {
    config: tracingConfigStore.get(),
    traceCount: traces.length,
    errorCount: errorTraces.length,
    avgResponseTime: avgTime,
    metricsCount: Object.keys(metricsStore.get()).length,
    activeSpans: activeSpansStore.get().size,
  };
}

/**
 * Export traces as JSON for debugging
 */
export function exportTracesAsJSON(): string {
  return JSON.stringify(
    {
      config: tracingConfigStore.get(),
      traces: recentTracesStore.get(),
      metrics: metricsStore.get(),
    },
    null,
    2
  );
}

/**
 * Import traces from JSON (for debugging/replay)
 */
export function importTracesFromJSON(json: string): void {
  try {
    const data = JSON.parse(json);
    if (data.traces && Array.isArray(data.traces)) {
      recentTracesStore.set(data.traces);
    }
    if (data.metrics && typeof data.metrics === 'object') {
      metricsStore.set(data.metrics);
    }
  } catch (e) {
    logger.error('[Tracing] Failed to import traces:', e);
  }
}

// ============================================
// Cleanup
// ============================================

/**
 * Clear all tracing state
 */
export function clearAllTracingState(): void {
  clearTraces();
  clearMetrics();
  clearActiveSpans();
}
