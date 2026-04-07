"use strict";
/**
 * @module a2a/data-hygiene
 *
 * Shared retention/redaction helpers for A2A in-memory records.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.redactSensitiveData = redactSensitiveData;
exports.getA2ARetentionWindowConfig = getA2ARetentionWindowConfig;
const REDACTED_VALUE = '[REDACTED]';
const SENSITIVE_KEY_MATCHERS = [
    /token/i,
    /secret/i,
    /password/i,
    /passwd/i,
    /api[-_]?key/i,
    /authorization/i,
    /cookie/i,
    /session/i,
    /credential/i,
];
function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isSensitiveKey(key) {
    return SENSITIVE_KEY_MATCHERS.some((matcher) => matcher.test(key));
}
function redactSensitiveData(input) {
    if (Array.isArray(input)) {
        return input.map((item) => redactSensitiveData(item));
    }
    if (isPlainObject(input)) {
        const output = {};
        for (const [key, value] of Object.entries(input)) {
            if (isSensitiveKey(key)) {
                output[key] = REDACTED_VALUE;
            }
            else {
                output[key] = redactSensitiveData(value);
            }
        }
        return output;
    }
    return input;
}
function parsePositiveInt(raw, fallback) {
    if (!raw)
        return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
function getA2ARetentionWindowConfig() {
    return {
        contextTtlMs: parsePositiveInt(process.env.RECODER_A2A_CONTEXT_TTL_MS, 60 * 60 * 1000),
        eventTtlMs: parsePositiveInt(process.env.RECODER_A2A_EVENT_RETENTION_MS, 24 * 60 * 60 * 1000),
        auditTtlMs: parsePositiveInt(process.env.RECODER_A2A_AUDIT_RETENTION_MS, 30 * 24 * 60 * 60 * 1000),
        eventMaxRecords: parsePositiveInt(process.env.RECODER_A2A_EVENT_MAX_RECORDS, 5000),
        auditMaxRecords: parsePositiveInt(process.env.RECODER_A2A_AUDIT_MAX_RECORDS, 10000),
    };
}
