/**
 * OTLP Tracing Service
 * OpenTelemetry-compatible tracing for observability
 * Inspired by vscode-ai-toolkit
 *
 * Features:
 * - Trace AI model calls with timing, tokens, and model info
 * - Trace file operations with path and size
 * - Trace WebSocket operations with connection state
 * - Trace shell commands with command and exit code
 * - Context propagation through async operations
 * - Export to console (dev) or OTLP endpoint (prod)
 * - Performance metrics aggregation
 */

import { tracingConfigStore, addTrace, type Trace, type SpanContext } from '~/lib/stores/tracing';

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('Tracing');

// ============================================
// Types
// ============================================

export type SpanKind = 'internal' | 'client' | 'server' | 'producer' | 'consumer';

export type SpanStatus = 'unset' | 'ok' | 'error';

export interface SpanAttributes {
  [key: string]: string | number | boolean | string[] | number[] | boolean[] | undefined;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: SpanKind;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: SpanStatus;
  statusMessage?: string;
  attributes: SpanAttributes;
  events: SpanEvent[];
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: SpanAttributes;
}

export interface TracerOptions {
  serviceName?: string;
  serviceVersion?: string;
}

// ============================================
// ID Generation
// ============================================

function generateId(length: number): string {
  const chars = '0123456789abcdef';
  let result = '';
  const array = new Uint8Array(length / 2);
  crypto.getRandomValues(array);
  for (let i = 0; i < array.length; i++) {
    result += chars[array[i] >> 4] + chars[array[i] & 0xf];
  }
  return result;
}

function generateTraceId(): string {
  return generateId(32);
}

function generateSpanId(): string {
  return generateId(16);
}

// ============================================
// Context Propagation
// ============================================

// Async context for propagating trace context through async operations
const contextStack: SpanContext[] = [];

export function getCurrentContext(): SpanContext | undefined {
  return contextStack[contextStack.length - 1];
}

function pushContext(context: SpanContext): void {
  contextStack.push(context);
}

function popContext(): SpanContext | undefined {
  return contextStack.pop();
}

// ============================================
// Span Builder
// ============================================

export class SpanBuilder {
  private span: Span;
  private contextPushed = false;

  constructor(name: string, kind: SpanKind = 'internal', parentContext?: SpanContext) {
    const traceId = parentContext?.traceId ?? generateTraceId();
    const spanId = generateSpanId();

    this.span = {
      traceId,
      spanId,
      parentSpanId: parentContext?.spanId,
      name,
      kind,
      startTime: performance.now(),
      status: 'unset',
      attributes: {},
      events: [],
    };

    // Push context for child spans
    const context: SpanContext = { traceId, spanId };
    pushContext(context);
    this.contextPushed = true;
  }

  setAttribute(key: string, value: SpanAttributes[string]): this {
    this.span.attributes[key] = value;
    return this;
  }

  setAttributes(attributes: SpanAttributes): this {
    Object.assign(this.span.attributes, attributes);
    return this;
  }

  addEvent(name: string, attributes?: SpanAttributes): this {
    this.span.events.push({
      name,
      timestamp: performance.now(),
      attributes,
    });
    return this;
  }

  setStatus(status: SpanStatus, message?: string): this {
    this.span.status = status;
    if (message) {
      this.span.statusMessage = message;
    }
    return this;
  }

  recordException(error: Error | string): this {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;

    this.addEvent('exception', {
      'exception.type': error instanceof Error ? error.name : 'Error',
      'exception.message': errorMessage,
      'exception.stacktrace': errorStack,
    });
    this.setStatus('error', errorMessage);
    return this;
  }

  end(): Span {
    if (this.contextPushed) {
      popContext();
      this.contextPushed = false;
    }

    this.span.endTime = performance.now();
    this.span.duration = this.span.endTime - this.span.startTime;

    // Record the span
    recordSpan(this.span);

    return this.span;
  }

  getContext(): SpanContext {
    return {
      traceId: this.span.traceId,
      spanId: this.span.spanId,
    };
  }
}

// ============================================
// Recording & Export
// ============================================

function recordSpan(span: Span): void {
  const config = tracingConfigStore.get();

  if (!config.enabled) {
    return;
  }

  // Create trace record
  const trace: Trace = {
    id: `${span.traceId}-${span.spanId}`,
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    kind: span.kind,
    startTime: span.startTime,
    endTime: span.endTime,
    duration: span.duration,
    status: span.status,
    statusMessage: span.statusMessage,
    attributes: span.attributes,
    events: span.events,
    timestamp: Date.now(),
  };

  // Add to store for debugging
  addTrace(trace);

  // Export based on mode
  if (config.exportMode === 'console' || (config.exportMode === 'otlp' && !config.otlpEndpoint)) {
    exportToConsole(span);
  } else if (config.exportMode === 'otlp' && config.otlpEndpoint) {
    exportToOTLP(span, config.otlpEndpoint, config.otlpHeaders);
  }
}

function exportToConsole(span: Span): void {
  const statusIcon = span.status === 'ok' ? '✓' : span.status === 'error' ? '✗' : '○';
  const duration = span.duration?.toFixed(2) ?? '?';

  logger.info(
    `%c[Trace] ${statusIcon} ${span.name} (${duration}ms)`,
    span.status === 'error' ? 'color: #ef4444' : span.status === 'ok' ? 'color: #22c55e' : 'color: #6b7280'
  );
  logger.info('Trace ID:', span.traceId);
  logger.info('Span ID:', span.spanId);
  if (span.parentSpanId) {
    logger.info('Parent Span ID:', span.parentSpanId);
  }
  logger.info('Kind:', span.kind);
  logger.info('Duration:', `${duration}ms`);
  logger.info('Status:', span.status, span.statusMessage ?? '');
  if (Object.keys(span.attributes).length > 0) {
    logger.info('Attributes:', span.attributes);
  }
  if (span.events.length > 0) {
    logger.info('Events:', span.events);
  }
  logger.debug();
}

async function exportToOTLP(
  span: Span,
  endpoint: string,
  headers?: Record<string, string>
): Promise<void> {
  // Convert to OTLP format
  const otlpSpan = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'recoder-web' } },
            { key: 'service.version', value: { stringValue: '1.0.0' } },
          ],
        },
        scopeSpans: [
          {
            scope: {
              name: 'recoder-tracing',
              version: '1.0.0',
            },
            spans: [
              {
                traceId: hexToBase64(span.traceId),
                spanId: hexToBase64(span.spanId),
                parentSpanId: span.parentSpanId ? hexToBase64(span.parentSpanId) : undefined,
                name: span.name,
                kind: spanKindToOTLP(span.kind),
                startTimeUnixNano: Math.floor(span.startTime * 1000000).toString(),
                endTimeUnixNano: span.endTime ? Math.floor(span.endTime * 1000000).toString() : undefined,
                attributes: Object.entries(span.attributes)
                  .filter(([, v]) => v !== undefined)
                  .map(([key, value]) => ({
                    key,
                    value: attributeToOTLP(value!),
                  })),
                status: {
                  code: span.status === 'ok' ? 1 : span.status === 'error' ? 2 : 0,
                  message: span.statusMessage,
                },
                events: span.events.map((event) => ({
                  name: event.name,
                  timeUnixNano: Math.floor(event.timestamp * 1000000).toString(),
                  attributes: event.attributes
                    ? Object.entries(event.attributes)
                        .filter(([, v]) => v !== undefined)
                        .map(([key, value]) => ({
                          key,
                          value: attributeToOTLP(value!),
                        }))
                    : [],
                })),
              },
            ],
          },
        ],
      },
    ],
  };

  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(otlpSpan),
    });
  } catch (error) {
    logger.warn('[Tracing] Failed to export span to OTLP:', error);
  }
}

function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return btoa(String.fromCharCode(...bytes));
}

function spanKindToOTLP(kind: SpanKind): number {
  switch (kind) {
    case 'internal':
      return 1;
    case 'server':
      return 2;
    case 'client':
      return 3;
    case 'producer':
      return 4;
    case 'consumer':
      return 5;
    default:
      return 0;
  }
}

function attributeToOTLP(
  value: string | number | boolean | string[] | number[] | boolean[]
): { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean; arrayValue?: unknown } {
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { intValue: value.toString() } : { doubleValue: value };
  }
  if (typeof value === 'boolean') {
    return { boolValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((v) => attributeToOTLP(v as string | number | boolean)),
      },
    };
  }
  return { stringValue: String(value) };
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Create a new span for tracing
 */
export function startSpan(name: string, kind: SpanKind = 'internal'): SpanBuilder {
  return new SpanBuilder(name, kind, getCurrentContext());
}

/**
 * Create a child span under the current context
 */
export function startChildSpan(name: string, kind: SpanKind = 'internal'): SpanBuilder {
  const parentContext = getCurrentContext();
  return new SpanBuilder(name, kind, parentContext);
}

/**
 * Wrap an async function with tracing
 */
export async function withSpan<T>(
  name: string,
  fn: (span: SpanBuilder) => Promise<T>,
  options?: { kind?: SpanKind; attributes?: SpanAttributes }
): Promise<T> {
  const span = startSpan(name, options?.kind ?? 'internal');

  if (options?.attributes) {
    span.setAttributes(options.attributes);
  }

  try {
    const result = await fn(span);
    span.setStatus('ok');
    return result;
  } catch (error) {
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Wrap a sync function with tracing
 */
export function withSpanSync<T>(
  name: string,
  fn: (span: SpanBuilder) => T,
  options?: { kind?: SpanKind; attributes?: SpanAttributes }
): T {
  const span = startSpan(name, options?.kind ?? 'internal');

  if (options?.attributes) {
    span.setAttributes(options.attributes);
  }

  try {
    const result = fn(span);
    span.setStatus('ok');
    return result;
  } catch (error) {
    span.recordException(error as Error);
    throw error;
  } finally {
    span.end();
  }
}

// ============================================
// Domain-Specific Tracing Helpers
// ============================================

/**
 * Trace an AI model call
 */
export function traceAICall(options: {
  model: string;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}): SpanBuilder {
  const span = startSpan('ai.completion', 'client');

  span.setAttributes({
    'ai.model': options.model,
    'ai.provider': options.provider,
    'ai.prompt_tokens': options.promptTokens,
    'ai.completion_tokens': options.completionTokens,
    'ai.total_tokens': options.totalTokens,
    'ai.temperature': options.temperature,
    'ai.max_tokens': options.maxTokens,
    'ai.streaming': options.streaming,
  });

  return span;
}

/**
 * Trace a file operation
 */
export function traceFileOperation(options: {
  operation: 'read' | 'write' | 'delete' | 'rename' | 'create';
  path: string;
  size?: number;
  projectId?: string;
}): SpanBuilder {
  const span = startSpan(`file.${options.operation}`, 'client');

  span.setAttributes({
    'file.operation': options.operation,
    'file.path': options.path,
    'file.size': options.size,
    'project.id': options.projectId,
  });

  return span;
}

/**
 * Trace a shell command
 */
export function traceShellCommand(options: {
  command: string;
  args?: string[];
  cwd?: string;
  projectId?: string;
}): SpanBuilder {
  const span = startSpan('shell.execute', 'client');

  span.setAttributes({
    'shell.command': options.command,
    'shell.args': options.args,
    'shell.cwd': options.cwd,
    'project.id': options.projectId,
  });

  return span;
}

/**
 * Complete a shell command span with exit code
 */
export function completeShellSpan(
  span: SpanBuilder,
  exitCode: number,
  output?: string
): void {
  span.setAttribute('shell.exit_code', exitCode);
  if (output) {
    span.setAttribute('shell.output_length', output.length);
  }
  span.setStatus(exitCode === 0 ? 'ok' : 'error', exitCode !== 0 ? `Exit code: ${exitCode}` : undefined);
  span.end();
}

/**
 * Trace a WebSocket operation
 */
export function traceWebSocket(options: {
  operation: 'connect' | 'disconnect' | 'send' | 'receive' | 'error';
  url?: string;
  messageType?: string;
  messageSize?: number;
}): SpanBuilder {
  const span = startSpan(`websocket.${options.operation}`, options.operation === 'receive' ? 'consumer' : 'producer');

  span.setAttributes({
    'websocket.operation': options.operation,
    'websocket.url': options.url,
    'websocket.message_type': options.messageType,
    'websocket.message_size': options.messageSize,
  });

  return span;
}

/**
 * Trace an HTTP request
 */
export function traceHttpRequest(options: {
  method: string;
  url: string;
  statusCode?: number;
  requestSize?: number;
  responseSize?: number;
}): SpanBuilder {
  const span = startSpan(`http.${options.method.toLowerCase()}`, 'client');

  span.setAttributes({
    'http.method': options.method,
    'http.url': options.url,
    'http.status_code': options.statusCode,
    'http.request_size': options.requestSize,
    'http.response_size': options.responseSize,
  });

  return span;
}

/**
 * Complete an HTTP span with response info
 */
export function completeHttpSpan(
  span: SpanBuilder,
  statusCode: number,
  responseSize?: number
): void {
  span.setAttribute('http.status_code', statusCode);
  if (responseSize !== undefined) {
    span.setAttribute('http.response_size', responseSize);
  }
  span.setStatus(statusCode >= 200 && statusCode < 400 ? 'ok' : 'error', statusCode >= 400 ? `HTTP ${statusCode}` : undefined);
  span.end();
}

// ============================================
// Metrics Aggregation
// ============================================

interface MetricsBucket {
  count: number;
  totalDuration: number;
  minDuration: number;
  maxDuration: number;
  errorCount: number;
  lastUpdated: number;
}

const metricsStore = new Map<string, MetricsBucket>();

/**
 * Record metrics for a span
 */
export function recordMetrics(spanName: string, duration: number, isError: boolean): void {
  const existing = metricsStore.get(spanName);

  if (existing) {
    existing.count++;
    existing.totalDuration += duration;
    existing.minDuration = Math.min(existing.minDuration, duration);
    existing.maxDuration = Math.max(existing.maxDuration, duration);
    if (isError) existing.errorCount++;
    existing.lastUpdated = Date.now();
  } else {
    metricsStore.set(spanName, {
      count: 1,
      totalDuration: duration,
      minDuration: duration,
      maxDuration: duration,
      errorCount: isError ? 1 : 0,
      lastUpdated: Date.now(),
    });
  }
}

/**
 * Get aggregated metrics for all spans
 */
export function getMetrics(): Map<string, {
  count: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  errorRate: number;
}> {
  const result = new Map();

  for (const [name, bucket] of metricsStore) {
    result.set(name, {
      count: bucket.count,
      avgDuration: bucket.totalDuration / bucket.count,
      minDuration: bucket.minDuration,
      maxDuration: bucket.maxDuration,
      errorRate: bucket.errorCount / bucket.count,
    });
  }

  return result;
}

/**
 * Clear metrics
 */
export function clearMetrics(): void {
  metricsStore.clear();
}

/**
 * Get metrics summary as formatted string
 */
export function getMetricsSummary(): string {
  const metrics = getMetrics();
  const lines: string[] = [];

  for (const [name, data] of metrics) {
    lines.push(
      `${name}: ${data.count} calls, avg ${data.avgDuration.toFixed(2)}ms, ` +
        `min ${data.minDuration.toFixed(2)}ms, max ${data.maxDuration.toFixed(2)}ms, ` +
        `error rate ${(data.errorRate * 100).toFixed(1)}%`
    );
  }

  return lines.join('\n');
}

// ============================================
// Export types for store
// ============================================

export type { Trace, SpanContext };
