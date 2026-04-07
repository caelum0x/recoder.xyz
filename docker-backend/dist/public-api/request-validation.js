"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestValidationError = void 0;
exports.requireNonEmptyString = requireNonEmptyString;
exports.optionalString = optionalString;
exports.parseRouteIds = parseRouteIds;
class RequestValidationError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
    }
}
exports.RequestValidationError = RequestValidationError;
function requireNonEmptyString(value, field, code = 'MISSING_REQUIRED_FIELD') {
    if (typeof value !== 'string') {
        throw new RequestValidationError(code, `${field} is required and must be a non-empty string`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
        throw new RequestValidationError(code, `${field} is required and must be a non-empty string`);
    }
    return trimmed;
}
function optionalString(value) {
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    return trimmed || undefined;
}
function parseRouteIds(params) {
    const id = requireNonEmptyString(params.id, 'id', 'INVALID_REQUEST');
    const taskId = params.taskId ? requireNonEmptyString(params.taskId, 'taskId', 'INVALID_REQUEST') : undefined;
    return { id, taskId };
}
