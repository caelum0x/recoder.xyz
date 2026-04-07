"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RestAdapter = exports.DEFAULT_REST_ADAPTER_CONFIG = void 0;
exports.buildEnvelope = buildEnvelope;
exports.registerRestAdapter = registerRestAdapter;
exports.getRestAdapter = getRestAdapter;
exports.listRestAdapters = listRestAdapters;
exports.unregisterRestAdapter = unregisterRestAdapter;
exports.resetRestAdapters = resetRestAdapters;
const events_1 = require("events");
const logger_1 = require("../../logger");
const a2a_1 = require("@recoder/shared/a2a");
const task_lifecycle_service_1 = require("../task-lifecycle.service");
const logger = (0, logger_1.createLogger)('a2a-rest-adapter');
/** Default configuration values. */
exports.DEFAULT_REST_ADAPTER_CONFIG = {
    auth: { type: 'none' },
    timeoutMs: 30_000,
    maxRetries: 3,
    retryDelayMs: 1_000,
    maxRetryDelayMs: 16_000,
};
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildAuthHeaders(auth) {
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
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/** Build an outbound A2A envelope wrapping the given payload. */
function buildEnvelope(from, to, intent, payload, threadId, metadata) {
    return {
        envelopeVersion: a2a_1.RECODER_A2A_ENVELOPE_VERSION,
        protocolVersion: a2a_1.RECODER_A2A_PROTOCOL_VERSION,
        messageId: (0, task_lifecycle_service_1.generateId)('msg'),
        threadId: threadId ?? (0, task_lifecycle_service_1.generateId)('thread'),
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
class RestAdapter extends events_1.EventEmitter {
    config;
    totalRequests = 0;
    totalErrors = 0;
    lastRequestAt = null;
    lastErrorAt = null;
    lastHealthCheck = null;
    _status = 'idle';
    constructor(config) {
        super();
        this.config = {
            ...exports.DEFAULT_REST_ADAPTER_CONFIG,
            ...config,
        };
        logger.info({ adapterId: config.adapterId, baseUrl: config.baseUrl }, 'REST adapter created');
    }
    /** Adapter ID. */
    get adapterId() {
        return this.config.adapterId;
    }
    /** Current status. */
    get status() {
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
    async sendEnvelope(envelope, options) {
        const url = `${this.config.baseUrl}${options?.path ?? '/a2a/envelope'}`;
        const timeout = options?.timeoutMs ?? this.config.timeoutMs;
        return this.postJson(url, envelope, timeout);
    }
    /**
     * Send a simple task execution request.
     * Builds an A2A envelope internally.
     */
    async executeTask(input) {
        const envelope = buildEnvelope(this.config.localIdentity, input.targetAgent, input.intent ?? 'execute', [{ kind: 'text', text: input.prompt }], input.threadId, { ...input.metadata, taskId: input.taskId });
        return this.sendEnvelope(envelope);
    }
    // -----------------------------------------------------------------------
    // Generic HTTP methods
    // -----------------------------------------------------------------------
    /**
     * POST JSON to a URL with retry and timeout.
     */
    async postJson(url, body, timeoutMs) {
        return this.requestWithRetry('POST', url, body, timeoutMs);
    }
    /**
     * GET a URL with retry and timeout.
     */
    async getJson(url, timeoutMs) {
        return this.requestWithRetry('GET', url, undefined, timeoutMs);
    }
    // -----------------------------------------------------------------------
    // Health check
    // -----------------------------------------------------------------------
    /**
     * Ping the remote agent's health endpoint.
     */
    async checkHealth() {
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
            const result = {
                reachable: response.ok,
                statusCode: response.status,
                latencyMs: Date.now() - start,
                checkedAt: new Date().toISOString(),
            };
            this.lastHealthCheck = result;
            this._status = result.reachable ? 'active' : 'degraded';
            this.emit('health.check', { adapterId: this.config.adapterId, result });
            return result;
        }
        catch (err) {
            const result = {
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
    getState() {
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
    async requestWithRetry(method, url, body, timeoutMs) {
        const timeout = timeoutMs ?? this.config.timeoutMs;
        const maxAttempts = this.config.maxRetries + 1;
        let lastError;
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
                const headers = {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    ...buildAuthHeaders(this.config.auth),
                    ...(this.config.defaultHeaders ?? {}),
                };
                const fetchOptions = {
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
                let responseBody;
                const contentType = response.headers.get('content-type') ?? '';
                if (contentType.includes('application/json')) {
                    responseBody = await response.json();
                }
                else {
                    responseBody = await response.text();
                }
                const durationMs = Date.now() - start;
                // Extract result text from common response patterns
                let resultText;
                if (typeof responseBody === 'string') {
                    resultText = responseBody;
                }
                else if (typeof responseBody === 'object' && responseBody !== null) {
                    const rb = responseBody;
                    resultText = typeof rb.result === 'string'
                        ? rb.result
                        : typeof rb.text === 'string'
                            ? rb.text
                            : typeof rb.message === 'string'
                                ? rb.message
                                : undefined;
                }
                // Collect response headers
                const responseHeaders = {};
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
                logger.warn({ adapterId: this.config.adapterId, attempt, statusCode: response.status }, 'retryable HTTP error');
            }
            catch (err) {
                lastError = err.name === 'AbortError'
                    ? `Request timed out after ${timeout}ms`
                    : err.message ?? 'Unknown fetch error';
                logger.warn({ adapterId: this.config.adapterId, attempt, error: lastError }, 'request failed, may retry');
            }
            // Exponential backoff before retry
            if (attempt < maxAttempts - 1) {
                const delay = Math.min(this.config.retryDelayMs * Math.pow(this.config.backoffMultiplier ?? 2, attempt), this.config.maxRetryDelayMs);
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
exports.RestAdapter = RestAdapter;
// ---------------------------------------------------------------------------
// Adapter registry (manage multiple REST adapters)
// ---------------------------------------------------------------------------
const adapterRegistry = new Map();
/** Register a REST adapter instance. */
function registerRestAdapter(adapter) {
    adapterRegistry.set(adapter.adapterId, adapter);
    logger.info({ adapterId: adapter.adapterId }, 'REST adapter registered');
}
/** Get a registered REST adapter by ID. */
function getRestAdapter(adapterId) {
    return adapterRegistry.get(adapterId);
}
/** List all registered REST adapters. */
function listRestAdapters() {
    return [...adapterRegistry.values()];
}
/** Remove a REST adapter from the registry. */
function unregisterRestAdapter(adapterId) {
    const removed = adapterRegistry.delete(adapterId);
    if (removed) {
        logger.info({ adapterId }, 'REST adapter unregistered');
    }
    return removed;
}
/** Clear all REST adapters (for testing). */
function resetRestAdapters() {
    adapterRegistry.clear();
}
