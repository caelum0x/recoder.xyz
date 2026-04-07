"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTaskStreamChunk = extractTaskStreamChunk;
exports.isTerminalTaskState = isTerminalTaskState;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function collectFragments(value, seen) {
    if (typeof value === 'string') {
        const normalized = value.trim();
        if (normalized)
            seen.add(normalized);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value)
            collectFragments(item, seen);
        return;
    }
    if (!isRecord(value))
        return;
    for (const key of ['chunk', 'delta', 'text', 'content', 'output', 'message', 'result']) {
        collectFragments(value[key], seen);
    }
    if (Array.isArray(value.parts)) {
        for (const part of value.parts)
            collectFragments(part, seen);
    }
}
function extractTaskStreamChunk(value) {
    const seen = new Set();
    collectFragments(value, seen);
    return Array.from(seen).join('\n').trim();
}
function isTerminalTaskState(state) {
    if (typeof state !== 'string')
        return false;
    return new Set([
        'completed',
        'complete',
        'failed',
        'cancelled',
        'canceled',
        'stopped',
        'done',
        'success',
        'succeeded',
    ]).has(state.toLowerCase());
}
