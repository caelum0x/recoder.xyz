"use strict";
/**
 * @module openmeter-client
 *
 * Bridges the existing metering system to OpenMeter for persistent usage tracking.
 *
 * Emits usage events on:
 *   - LLM calls (model, input/output tokens, userId, projectId)
 *   - Sandbox exec (command, duration, userId, projectId)
 *   - File operations (read/write, size, userId, projectId)
 *   - Publish operations (slug, userId, projectId)
 *
 * Events are batched and flushed every 5s to reduce HTTP overhead.
 * If OpenMeter is unavailable, events are dropped with a warning (non-blocking).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackLlmCall = trackLlmCall;
exports.trackSandboxExec = trackSandboxExec;
exports.trackFileOp = trackFileOp;
exports.trackPublish = trackPublish;
exports.shutdownMetering = shutdownMetering;
const logger_js_1 = require("../logger.js");
const OPENMETER_URL = process.env.OPENMETER_URL ?? 'http://localhost:8888';
const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH = 200;
// ── Internal buffer ───────────────────────────────────────────────────────────
const buffer = [];
let flushTimer = null;
async function flush() {
    if (!buffer.length)
        return;
    const batch = buffer.splice(0, MAX_BATCH);
    try {
        const res = await fetch(`${OPENMETER_URL}/api/v1/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch),
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            logger_js_1.logger.warn({ status: res.status, body: text.slice(0, 200), count: batch.length }, '[openmeter] Flush failed');
        }
    }
    catch (err) {
        logger_js_1.logger.warn({ err, count: batch.length }, '[openmeter] Flush error — events dropped');
    }
}
function ensureFlushTimer() {
    if (flushTimer)
        return;
    flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
    flushTimer.unref();
}
// ── Public helpers ────────────────────────────────────────────────────────────
function emit(event) {
    buffer.push(event);
    if (buffer.length >= MAX_BATCH) {
        flush().catch(() => { });
    }
    ensureFlushTimer();
}
/** Track an LLM API call. */
function trackLlmCall(params) {
    emit({
        type: 'llm_call',
        time: new Date().toISOString(),
        subject: params.userId,
        data: {
            model: params.model,
            input_tokens: params.inputTokens,
            output_tokens: params.outputTokens,
            total_tokens: params.inputTokens + params.outputTokens,
            project_id: params.projectId ?? '',
            provider: params.provider ?? 'openrouter',
            duration_ms: params.durationMs ?? 0,
        },
    });
}
/** Track a sandbox command execution. */
function trackSandboxExec(params) {
    emit({
        type: 'sandbox_exec',
        time: new Date().toISOString(),
        subject: params.userId,
        data: {
            project_id: params.projectId,
            command: params.command.slice(0, 200),
            duration_ms: params.durationMs,
            exit_code: params.exitCode,
        },
    });
}
/** Track a file operation (read or write). */
function trackFileOp(params) {
    emit({
        type: 'file_op',
        time: new Date().toISOString(),
        subject: params.userId,
        data: {
            project_id: params.projectId,
            operation: params.operation,
            file_path: params.filePath.slice(0, 200),
            size_bytes: params.sizeBytes,
        },
    });
}
/** Track a project publish event. */
function trackPublish(params) {
    emit({
        type: 'publish',
        time: new Date().toISOString(),
        subject: params.userId,
        data: {
            project_id: params.projectId,
            slug: params.slug,
            target: params.target,
        },
    });
}
/** Graceful shutdown — flush remaining events. */
async function shutdownMetering() {
    if (flushTimer)
        clearInterval(flushTimer);
    flushTimer = null;
    await flush();
}
