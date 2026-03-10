"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INVALID_A2A_ENVELOPE_CODE = exports.A2A_ENVELOPE_ERROR_SCHEMA_VERSION = void 0;
exports.buildInvalidA2AEnvelopeErrorResponse = buildInvalidA2AEnvelopeErrorResponse;
exports.validateInvalidA2AEnvelopeErrorResponse = validateInvalidA2AEnvelopeErrorResponse;
exports.assertInvalidA2AEnvelopeErrorResponse = assertInvalidA2AEnvelopeErrorResponse;
exports.A2A_ENVELOPE_ERROR_SCHEMA_VERSION = 'a2a-envelope-error-v1';
exports.INVALID_A2A_ENVELOPE_CODE = 'INVALID_A2A_ENVELOPE';
function buildInvalidA2AEnvelopeErrorResponse(input) {
    return {
        ok: false,
        error: input.error || 'Invalid A2A envelope',
        code: exports.INVALID_A2A_ENVELOPE_CODE,
        schemaVersion: exports.A2A_ENVELOPE_ERROR_SCHEMA_VERSION,
        issues: input.issues,
    };
}
/**
 * Runtime validation for InvalidA2AEnvelopeErrorResponse shape.
 * Use at API boundaries to verify error payloads match the contract.
 */
function validateInvalidA2AEnvelopeErrorResponse(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { valid: false, reason: 'must be an object' };
    }
    const obj = value;
    if (obj.ok !== false) {
        return { valid: false, reason: 'ok must be false' };
    }
    if (typeof obj.error !== 'string') {
        return { valid: false, reason: 'error must be a string' };
    }
    if (obj.code !== exports.INVALID_A2A_ENVELOPE_CODE) {
        return { valid: false, reason: `code must be '${exports.INVALID_A2A_ENVELOPE_CODE}'` };
    }
    if (obj.schemaVersion !== exports.A2A_ENVELOPE_ERROR_SCHEMA_VERSION) {
        return { valid: false, reason: `schemaVersion must be '${exports.A2A_ENVELOPE_ERROR_SCHEMA_VERSION}'` };
    }
    if (!Array.isArray(obj.issues)) {
        return { valid: false, reason: 'issues must be an array' };
    }
    for (let i = 0; i < obj.issues.length; i++) {
        const issue = obj.issues[i];
        if (!issue || typeof issue !== 'object' || Array.isArray(issue)) {
            return { valid: false, reason: `issues[${i}] must be an object` };
        }
        if (typeof issue.path !== 'string') {
            return { valid: false, reason: `issues[${i}].path must be a string` };
        }
        if (typeof issue.message !== 'string') {
            return { valid: false, reason: `issues[${i}].message must be a string` };
        }
    }
    return { valid: true, data: value };
}
/**
 * Assertion wrapper — throws if the value doesn't match the contract.
 */
function assertInvalidA2AEnvelopeErrorResponse(value) {
    const result = validateInvalidA2AEnvelopeErrorResponse(value);
    if (result.valid)
        return;
    const reason = "reason" in result ? result.reason : "unknown contract violation";
    throw new Error(`InvalidA2AEnvelopeErrorResponse contract violation: ${reason}`);
}
