"use strict";
/**
 * Public API Types
 *
 * Type definitions for the Recoder.xyz Public API.
 * This API allows external developers to programmatically create and manage
 * sandboxes for code execution, file operations, and command running.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicApiErrorCode = void 0;
// ==================== Error Codes ====================
/**
 * Public API error codes
 */
var PublicApiErrorCode;
(function (PublicApiErrorCode) {
    // Authentication errors
    PublicApiErrorCode["INVALID_API_KEY"] = "INVALID_API_KEY";
    PublicApiErrorCode["API_KEY_EXPIRED"] = "API_KEY_EXPIRED";
    PublicApiErrorCode["API_KEY_REVOKED"] = "API_KEY_REVOKED";
    PublicApiErrorCode["INSUFFICIENT_SCOPE"] = "INSUFFICIENT_SCOPE";
    PublicApiErrorCode["IP_NOT_ALLOWED"] = "IP_NOT_ALLOWED";
    // Rate limiting
    PublicApiErrorCode["RATE_LIMIT_EXCEEDED"] = "RATE_LIMIT_EXCEEDED";
    PublicApiErrorCode["QUOTA_EXCEEDED"] = "QUOTA_EXCEEDED";
    PublicApiErrorCode["CONCURRENT_LIMIT_EXCEEDED"] = "CONCURRENT_LIMIT_EXCEEDED";
    // Sandbox errors
    PublicApiErrorCode["SANDBOX_NOT_FOUND"] = "SANDBOX_NOT_FOUND";
    PublicApiErrorCode["SANDBOX_NOT_RUNNING"] = "SANDBOX_NOT_RUNNING";
    PublicApiErrorCode["SANDBOX_CREATION_FAILED"] = "SANDBOX_CREATION_FAILED";
    PublicApiErrorCode["SANDBOX_LIMIT_EXCEEDED"] = "SANDBOX_LIMIT_EXCEEDED";
    // Project errors
    PublicApiErrorCode["PROJECT_NOT_FOUND"] = "PROJECT_NOT_FOUND";
    PublicApiErrorCode["PROJECT_CREATION_FAILED"] = "PROJECT_CREATION_FAILED";
    PublicApiErrorCode["PROJECT_PUBLISH_FAILED"] = "PROJECT_PUBLISH_FAILED";
    // File errors
    PublicApiErrorCode["FILE_NOT_FOUND"] = "FILE_NOT_FOUND";
    PublicApiErrorCode["FILE_TOO_LARGE"] = "FILE_TOO_LARGE";
    PublicApiErrorCode["INVALID_FILE_PATH"] = "INVALID_FILE_PATH";
    PublicApiErrorCode["FILE_OPERATION_FAILED"] = "FILE_OPERATION_FAILED";
    // Command errors
    PublicApiErrorCode["COMMAND_TIMEOUT"] = "COMMAND_TIMEOUT";
    PublicApiErrorCode["COMMAND_FAILED"] = "COMMAND_FAILED";
    PublicApiErrorCode["COMMAND_NOT_ALLOWED"] = "COMMAND_NOT_ALLOWED";
    // Validation errors
    PublicApiErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    PublicApiErrorCode["INVALID_REQUEST"] = "INVALID_REQUEST";
    PublicApiErrorCode["MISSING_REQUIRED_FIELD"] = "MISSING_REQUIRED_FIELD";
    // Identity token errors
    PublicApiErrorCode["IDENTITY_TOKEN_INVALID"] = "IDENTITY_TOKEN_INVALID";
    PublicApiErrorCode["IDENTITY_TOKEN_EXPIRED"] = "IDENTITY_TOKEN_EXPIRED";
    PublicApiErrorCode["IDENTITY_TOKEN_REVOKED"] = "IDENTITY_TOKEN_REVOKED";
    PublicApiErrorCode["IDENTITY_TOKEN_AUDIENCE_MISMATCH"] = "IDENTITY_TOKEN_AUDIENCE_MISMATCH";
    PublicApiErrorCode["IDENTITY_TOKEN_CREATION_FAILED"] = "IDENTITY_TOKEN_CREATION_FAILED";
    PublicApiErrorCode["IDENTITY_SCOPE_INVALID"] = "IDENTITY_SCOPE_INVALID";
    // App key errors
    PublicApiErrorCode["APP_KEY_INVALID"] = "APP_KEY_INVALID";
    PublicApiErrorCode["APP_KEY_REVOKED"] = "APP_KEY_REVOKED";
    PublicApiErrorCode["APP_KEY_NOT_FOUND"] = "APP_KEY_NOT_FOUND";
    PublicApiErrorCode["APP_KEY_CREATION_FAILED"] = "APP_KEY_CREATION_FAILED";
    PublicApiErrorCode["APP_KEY_FORBIDDEN"] = "APP_KEY_FORBIDDEN";
    // External identity errors
    PublicApiErrorCode["EXTERNAL_IDENTITY_NOT_FOUND"] = "EXTERNAL_IDENTITY_NOT_FOUND";
    PublicApiErrorCode["EXTERNAL_IDENTITY_ALREADY_LINKED"] = "EXTERNAL_IDENTITY_ALREADY_LINKED";
    PublicApiErrorCode["EXTERNAL_PROVIDER_ERROR"] = "EXTERNAL_PROVIDER_ERROR";
    PublicApiErrorCode["EXTERNAL_TOKEN_INVALID"] = "EXTERNAL_TOKEN_INVALID";
    // Server errors
    PublicApiErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    PublicApiErrorCode["SERVICE_UNAVAILABLE"] = "SERVICE_UNAVAILABLE";
})(PublicApiErrorCode || (exports.PublicApiErrorCode = PublicApiErrorCode = {}));
