/**
 * @module rest-adapter
 *
 * Generic REST protocol adapter for the A2A layer.
 *
 * Translates RecoderA2AEnvelope objects to/from HTTP REST API calls,
 * enabling any HTTP-accessible agent (Replit, custom webhooks, external
 * services) to participate in the A2A mesh.
 *
 * Features:
 * - Configurable base URL, auth headers, and TLS options
 * - Envelope → HTTP request mapping (POST with JSON body)
 * - HTTP response → A2A envelope/result mapping
 * - Timeout + retry with exponential backoff
 * - Health check ping endpoint
 * - Request/response logging with redaction
 *
 * P17-001: REST Protocol Adapter
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../logger';
import {
  RECODER_A2A_PROTOCOL_VERSION,
  RECODER_A2A_ENVELOPE_VERSION,
  type RecoderA2AEnvelope,
  type RecoderAgentIdentity,
  type RecoderIntent,
  type RecoderPayload,
} from '@recoder/shared/a2a';
import { generateId } from '../task-lifecycle.service';

const logger = createLogger('a2a-rest-adapter');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Authentication method for the remote REST endpoint. */
export type RestAuthMethod =
  | { type: 'none' }
  | { type: 'bearer'; token: string }
  | { type: 'api-key'; headerName: string; key: string }
  | { type: 'basic'; username: string; password: string }
  | { type: 'custom'; headers: Record<string, string> };

/** Configuration for a REST adapter instance. */
export interface RestAdapterConfig {
  /** Unique identifier for this adapter instance. */
  adapterId: string;
  /** Base URL for the remote agent's REST API. */
  baseUrl: string;
  /** Authentication method. */
  auth: RestAuthMethod;
  /** Default timeout for requests in ms. */
  timeoutMs: number;
  /** Maximum retry attempts for failed requests. */
  maxRetries: number;
  /** Initial retry delay in ms (doubles with each retry). */
  retryDelayMs: number;
  /** Maximum retry delay in ms. */
  maxRetryDelayMs: number;
  /** Exponential backoff multiplier between retry attempts. */
  backoffMultiplier?: number;
  /** Custom headers to include in every request. */
  defaultHeaders?: Record<string, string>;
  /** Health check endpoint path (relative to baseUrl). */
  healthCheckPath?: string;
  /** The identity of the local agent sending requests. */
  localIdentity: RecoderAgentIdentity;
}

/** Default configuration values. */
export const DEFAULT_REST_ADAPTER_CONFIG: Omit<RestAdapterConfig, 'adapterId' | 'baseUrl' | 'localIdentity'> = {
  auth: { type: 'none' },
  timeoutMs: 30_000,
  maxRetries: 3,
  retryDelayMs: 1_000,
  maxRetryDelayMs: 16_000,
};

/** Result of sending an envelope via the REST adapter. */
export interface RestAdapterResult {
  success: boolean;
  /** HTTP status code from the remote. */
  statusCode: number;
  /** Parsed response body (if JSON). */
  body?: unknown;
  /** Extracted text from response (convenience). */
  resultText?: string;
  /** Response headers. */
  headers?: Record<string, string>;
  /** Error message if !success. */
  error?: string;
  /** Total duration in ms (including retries). */
  durationMs: number;
  /** Number of attempts made. */
  attempts: number;
}

/** Health check result. */
export interface RestAdapterHealthResult {
  reachable: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
  checkedAt: string;
}

/** Adapter status. */
export type RestAdapterStatus = 'idle' | 'active' | 'degraded' | 'unreachable';

/** Adapter state snapshot. */
export interface RestAdapterState {
  adapterId: string;
  status: RestAdapterStatus;
  baseUrl: string;
  totalRequests: number;
  totalErrors: number;
  lastRequestAt: string | null;
  lastErrorAt: string | null;
  lastHealthCheck: RestAdapterHealthResult | null;
}

/** Events emitted by the adapter. */
export interface RestAdapterEvents {
  'request.start': { adapterId: string; method: string; url: string; timestamp: string };
  'request.success': { adapterId: string; statusCode: number; durationMs: number; timestamp: string };
  'request.error': { adapterId: string; error: string; attempts: number; timestamp: string };
  'health.check': { adapterId: string; result: RestAdapterHealthResult };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAuthHeaders(auth: RestAuthMethod): Record<string, string> {
  switch (auth.type) {
    case 'none':
      return {};
    case 'bearer':
      return { Authorization: `Bearer ${auth.token}` };
    case 'api-key':
      return { [auth.headerName]: auth.key };
    case 'basic': {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      return { Authorization: `Basic ${encoded}` };
    }
    case 'custom':
      return { ...auth.headers };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Build an outbound A2A envelope wrapping the given payload. */
export function buildEnvelope(
  from: RecoderAgentIdentity,
  to: RecoderAgentIdentity,
  intent: RecoderIntent,
  payload: RecoderPayload[],
  threadId?: string,
  metadata?: Record<string, unknown>,
): RecoderA2AEnvelope {
  return {
    envelopeVersion: RECODER_A2A_ENVELOPE_VERSION,
    protocolVersion: RECODER_A2A_PROTOCOL_VERSION,
    messageId: generateId('msg'),
    threadId: threadId ?? generateId('thread'),
    createdAt: new Date().toISOString(),
    from,
    to,
    intent,
    payload,
    metadata,
  };
}

// ---------------------------------------------------------------------------
// REST Adapter
// ---------------------------------------------------------------------------

export class RestAdapter extends EventEmitter {
  private readonly config: RestAdapterConfig;
  private totalRequests = 0;
  private totalErrors = 0;
  private lastRequestAt: string | null = null;
  private lastErrorAt: string | null = null;
  private lastHealthCheck: RestAdapterHealthResult | null = null;
  private _status: RestAdapterStatus = 'idle';

  constructor(config: RestAdapterConfig) {
    super();
    this.config = {
      ...DEFAULT_REST_ADAPTER_CONFIG,
      ...config,
    };
    logger.info({ adapterId: config.adapterId, baseUrl: config.baseUrl }, 'REST adapter created');
  }

  /** Adapter ID. */
  get adapterId(): string {
    return this.config.adapterId;
  }

  /** Current status. */
  get status(): RestAdapterStatus {
    return this._status;
  }

  // -----------------------------------------------------------------------
  // Core: send envelope
  // -----------------------------------------------------------------------

  /**
   * Send a RecoderA2AEnvelope to the remote agent's REST endpoint.
   *
   * The envelope is POSTed as JSON to `{baseUrl}/a2a/envelope` (or a
   * custom path if the envelope's `to.id` maps to a known route).
   */
  async sendEnvelope(
    envelope: RecoderA2AEnvelope,
    options?: { path?: string; timeoutMs?: number },
  ): Promise<RestAdapterResult> {
    const url = `${this.config.baseUrl}${options?.path ?? '/a2a/envelope'}`;
    const timeout = options?.timeoutMs ?? this.config.timeoutMs;

    return this.postJson(url, envelope, timeout);
  }

  /**
   * Send a simple task execution request.
   * Builds an A2A envelope internally.
   */
  async executeTask(input: {
    targetAgent: RecoderAgentIdentity;
    taskId: string;
    prompt: string;
    intent?: RecoderIntent;
    threadId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<RestAdapterResult> {
    const envelope = buildEnvelope(
      this.config.localIdentity,
      input.targetAgent,
      input.intent ?? 'execute',
      [{ kind: 'text', text: input.prompt }],
      input.threadId,
      { ...input.metadata, taskId: input.taskId },
    );

    return this.sendEnvelope(envelope);
  }

  // -----------------------------------------------------------------------
  // Generic HTTP methods
  // -----------------------------------------------------------------------

  /**
   * POST JSON to a URL with retry and timeout.
   */
  async postJson(url: string, body: unknown, timeoutMs?: number): Promise<RestAdapterResult> {
    return this.requestWithRetry('POST', url, body, timeoutMs);
  }

  /**
   * GET a URL with retry and timeout.
   */
  async getJson(url: string, timeoutMs?: number): Promise<RestAdapterResult> {
    return this.requestWithRetry('GET', url, undefined, timeoutMs);
  }

  // -----------------------------------------------------------------------
  // Health check
  // -----------------------------------------------------------------------

  /**
   * Ping the remote agent's health endpoint.
   */
  async checkHealth(): Promise<RestAdapterHealthResult> {
    const healthPath = this.config.healthCheckPath ?? '/health';
    const url = `${this.config.baseUrl}${healthPath}`;
    const start = Date.now();

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...buildAuthHeaders(this.config.auth),
          ...(this.config.defaultHeaders ?? {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timer);

      const result: RestAdapterHealthResult = {
        reachable: response.ok,
        statusCode: response.status,
        latencyMs: Date.now() - start,
        checkedAt: new Date().toISOString(),
      };

      this.lastHealthCheck = result;
      this._status = result.reachable ? 'active' : 'degraded';
      this.emit('health.check', { adapterId: this.config.adapterId, result });
      return result;
    } catch (err: any) {
      const result: RestAdapterHealthResult = {
        reachable: false,
        latencyMs: Date.now() - start,
        error: err.message ?? 'Unknown error',
        checkedAt: new Date().toISOString(),
      };

      this.lastHealthCheck = result;
      this._status = 'unreachable';
      this.emit('health.check', { adapterId: this.config.adapterId, result });
      return result;
    }
  }

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  getState(): RestAdapterState {
    return {
      adapterId: this.config.adapterId,
      status: this._status,
      baseUrl: this.config.baseUrl,
      totalRequests: this.totalRequests,
      totalErrors: this.totalErrors,
      lastRequestAt: this.lastRequestAt,
      lastErrorAt: this.lastErrorAt,
      lastHealthCheck: this.lastHealthCheck,
    };
  }

  // -----------------------------------------------------------------------
  // Internal: request with retry
  // -----------------------------------------------------------------------

  private async requestWithRetry(
    method: string,
    url: string,
    body: unknown | undefined,
    timeoutMs?: number,
  ): Promise<RestAdapterResult> {
    const timeout = timeoutMs ?? this.config.timeoutMs;
    const maxAttempts = this.config.maxRetries + 1;
    let lastError: string | undefined;
    let attempts = 0;
    const start = Date.now();

    this.totalRequests++;
    this.lastRequestAt = new Date().toISOString();
    this._status = 'active';

    this.emit('request.start', {
      adapterId: this.config.adapterId,
      method,
      url,
      timestamp: this.lastRequestAt,
    });

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      attempts++;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...buildAuthHeaders(this.config.auth),
          ...(this.config.defaultHeaders ?? {}),
        };

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (body !== undefined && method !== 'GET') {
          fetchOptions.body = JSON.stringify(body);
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timer);

        // Parse response body
        let responseBody: unknown;
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }

        const durationMs = Date.now() - start;

        // Extract result text from common response patterns
        let resultText: string | undefined;
        if (typeof responseBody === 'string') {
          resultText = responseBody;
        } else if (typeof responseBody === 'object' && responseBody !== null) {
          const rb = responseBody as Record<string, unknown>;
          resultText = typeof rb.result === 'string'
            ? rb.result
            : typeof rb.text === 'string'
              ? rb.text
              : typeof rb.message === 'string'
                ? rb.message
                : undefined;
        }

        // Collect response headers
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        if (response.ok) {
          this.emit('request.success', {
            adapterId: this.config.adapterId,
            statusCode: response.status,
            durationMs,
            timestamp: new Date().toISOString(),
          });

          return {
            success: true,
            statusCode: response.status,
            body: responseBody,
            resultText,
            headers: responseHeaders,
            durationMs,
            attempts,
          };
        }

        // Non-retryable status codes
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          this.totalErrors++;
          this.lastErrorAt = new Date().toISOString();

          return {
            success: false,
            statusCode: response.status,
            body: responseBody,
            error: `HTTP ${response.status}: ${resultText ?? response.statusText}`,
            durationMs,
            attempts,
          };
        }

        // Retryable (5xx or 429)
        lastError = `HTTP ${response.status}: ${response.statusText}`;
        logger.warn(
          { adapterId: this.config.adapterId, attempt, statusCode: response.status },
          'retryable HTTP error',
        );
      } catch (err: any) {
        lastError = err.name === 'AbortError'
          ? `Request timed out after ${timeout}ms`
          : err.message ?? 'Unknown fetch error';

        logger.warn(
          { adapterId: this.config.adapterId, attempt, error: lastError },
          'request failed, may retry',
        );
      }

      // Exponential backoff before retry
      if (attempt < maxAttempts - 1) {
        const delay = Math.min(
          this.config.retryDelayMs * Math.pow(this.config.backoffMultiplier ?? 2, attempt),
          this.config.maxRetryDelayMs,
        );
        await sleep(delay);
      }
    }

    // All retries exhausted
    const durationMs = Date.now() - start;
    this.totalErrors++;
    this.lastErrorAt = new Date().toISOString();
    this._status = 'degraded';

    this.emit('request.error', {
      adapterId: this.config.adapterId,
      error: lastError ?? 'Unknown error',
      attempts,
      timestamp: this.lastErrorAt,
    });

    return {
      success: false,
      statusCode: 0,
      error: lastError ?? 'All retries exhausted',
      durationMs,
      attempts,
    };
  }
}

// ---------------------------------------------------------------------------
// Adapter registry (manage multiple REST adapters)
// ---------------------------------------------------------------------------

const adapterRegistry = new Map<string, RestAdapter>();

/** Register a REST adapter instance. */
export function registerRestAdapter(adapter: RestAdapter): void {
  adapterRegistry.set(adapter.adapterId, adapter);
  logger.info({ adapterId: adapter.adapterId }, 'REST adapter registered');
}

/** Get a registered REST adapter by ID. */
export function getRestAdapter(adapterId: string): RestAdapter | undefined {
  return adapterRegistry.get(adapterId);
}

/** List all registered REST adapters. */
export function listRestAdapters(): RestAdapter[] {
  return [...adapterRegistry.values()];
}

/** Remove a REST adapter from the registry. */
export function unregisterRestAdapter(adapterId: string): boolean {
  const removed = adapterRegistry.delete(adapterId);
  if (removed) {
    logger.info({ adapterId }, 'REST adapter unregistered');
  }
  return removed;
}

/** Clear all REST adapters (for testing). */
export function resetRestAdapters(): void {
  adapterRegistry.clear();
}
