"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.A2ATraceService = void 0;
exports.getTraceService = getTraceService;
exports.resetTraceService = resetTraceService;
const async_hooks_1 = require("async_hooks");
const crypto_1 = __importDefault(require("crypto"));
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TRACE_PREFIX = 'trc_';
const SPAN_PREFIX = 'spn_';
const MAX_COMPLETED_SPANS = 10_000;
/** URL-safe random ID (similar to nanoid but without the dependency). */
function randomId(length) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    const bytes = crypto_1.default.randomBytes(length);
    let id = '';
    for (let i = 0; i < length; i++) {
        id += alphabet[bytes[i] % alphabet.length];
    }
    return id;
}
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
class A2ATraceService {
    storage = new async_hooks_1.AsyncLocalStorage();
    completedSpans = [];
    // ---- Context accessors --------------------------------------------------
    /** Get the current trace context (or undefined if none). */
    getCurrentContext() {
        return this.storage.getStore();
    }
    /** Get the current trace ID (or 'no-trace'). */
    getTraceId() {
        return this.storage.getStore()?.traceId ?? 'no-trace';
    }
    /** Get the current span ID (or 'no-span'). */
    getSpanId() {
        return this.storage.getStore()?.spanId ?? 'no-span';
    }
    // ---- Running within context ---------------------------------------------
    /** Run a function within a new trace context. */
    runWithTrace(traceId, fn) {
        const spanId = this.generateSpanId();
        const ctx = {
            traceId,
            spanId,
            startedAt: Date.now(),
            baggage: {},
        };
        return this.storage.run(ctx, fn);
    }
    /**
     * Run a function within a child span (inherits parent trace).
     * If no parent trace is active, a new root trace is created.
     */
    runWithSpan(options, fn) {
        const parent = this.storage.getStore();
        const traceId = parent?.traceId ?? this.generateTraceId();
        const spanId = this.generateSpanId();
        const parentSpanId = parent?.spanId;
        const childCtx = {
            traceId,
            spanId,
            parentSpanId,
            originAgentId: parent?.originAgentId,
            startedAt: Date.now(),
            baggage: { ...(parent?.baggage ?? {}) },
        };
        const recordCompleted = (startedAt, status, error) => {
            const endedAt = Date.now();
            const span = {
                traceId,
                spanId,
                parentSpanId,
                operationName: options.operationName,
                startedAt,
                endedAt,
                durationMs: endedAt - startedAt,
                attributes: options.attributes ? { ...options.attributes } : {},
                status,
                error,
            };
            this.completedSpans.push(span);
            if (this.completedSpans.length > MAX_COMPLETED_SPANS) {
                this.completedSpans.shift();
            }
        };
        return this.storage.run(childCtx, () => {
            const startedAt = Date.now();
            let result;
            try {
                result = fn();
            }
            catch (err) {
                recordCompleted(startedAt, 'error', err?.message ?? String(err));
                throw err;
            }
            // Handle async results
            if (result instanceof Promise) {
                return result.then((value) => {
                    recordCompleted(startedAt, 'ok');
                    return value;
                }, (err) => {
                    recordCompleted(startedAt, 'error', err?.message ?? String(err));
                    throw err;
                });
            }
            recordCompleted(startedAt, 'ok');
            return result;
        });
    }
    // ---- ID generation ------------------------------------------------------
    /** Generate a new trace ID in format trc_<21 chars>. */
    generateTraceId() {
        return `${TRACE_PREFIX}${randomId(21)}`;
    }
    /** Generate a new span ID in format spn_<16 chars>. */
    generateSpanId() {
        return `${SPAN_PREFIX}${randomId(16)}`;
    }
    // ---- Header extraction / propagation ------------------------------------
    /**
     * Extract trace ID from request headers.
     *
     * Priority:
     * 1. `x-trace-id` (custom header)
     * 2. `traceparent` (W3C Trace Context format: 00-<traceId>-<spanId>-<flags>)
     * 3. undefined (caller should generate a new trace ID)
     */
    extractTraceId(headers) {
        // 1. Custom header
        const customTraceId = headers['x-trace-id'];
        if (customTraceId) {
            const value = Array.isArray(customTraceId) ? customTraceId[0] : customTraceId;
            if (value)
                return value;
        }
        // 2. W3C traceparent: 00-<traceId>-<spanId>-<flags>
        const traceparent = headers['traceparent'];
        if (traceparent) {
            const value = Array.isArray(traceparent) ? traceparent[0] : traceparent;
            if (value) {
                const parts = value.split('-');
                if (parts.length >= 2 && parts[1]) {
                    return parts[1];
                }
            }
        }
        return undefined;
    }
    /**
     * Build propagation headers for outgoing requests.
     * Returns empty object if no trace context is active.
     */
    buildPropagationHeaders() {
        const ctx = this.storage.getStore();
        if (!ctx)
            return {};
        const headers = {
            'x-trace-id': ctx.traceId,
            'x-span-id': ctx.spanId,
        };
        if (ctx.parentSpanId) {
            headers['x-parent-span-id'] = ctx.parentSpanId;
        }
        return headers;
    }
    // ---- Span queries -------------------------------------------------------
    /** Get all completed spans (for testing / debugging). */
    getCompletedSpans() {
        return [...this.completedSpans];
    }
    /** Get completed spans for a specific trace. */
    getSpansForTrace(traceId) {
        return this.completedSpans.filter((s) => s.traceId === traceId);
    }
    // ---- Reset --------------------------------------------------------------
    /** Reset all state. */
    reset() {
        this.completedSpans = [];
    }
}
exports.A2ATraceService = A2ATraceService;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let singleton = null;
function getTraceService() {
    if (!singleton) {
        singleton = new A2ATraceService();
    }
    return singleton;
}
function resetTraceService() {
    if (singleton) {
        singleton.reset();
    }
    singleton = null;
}
