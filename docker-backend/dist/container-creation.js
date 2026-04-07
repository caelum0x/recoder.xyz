"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCreationStale = isCreationStale;
exports.withCreationTimeout = withCreationTimeout;
function isCreationStale(entry, timeoutMs, now = Date.now()) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        return false;
    return now - entry.startedAt > timeoutMs;
}
function withCreationTimeout(promise, timeoutMs, onTimeout) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
        return promise;
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            onTimeout?.();
            reject(new Error('Container creation timed out'));
        }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutId)
            clearTimeout(timeoutId);
    });
}
