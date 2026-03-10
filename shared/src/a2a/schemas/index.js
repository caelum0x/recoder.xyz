"use strict";
/**
 * @module @recoder/shared/a2a/schemas
 *
 * Canonical TypeScript schemas for the Recoder A2A control plane.
 *
 * This barrel re-exports all schema types, enums, constants, and factory
 * helpers so that consumers can import everything from a single path:
 *
 * ```ts
 * import type {
 *   TaskEnvelope,
 *   AuditEvent,
 *   A2AError,
 * } from '@recoder/shared/a2a/schemas';
 *
 * import {
 *   TaskStateEnum,
 *   AuditEventTypeEnum,
 *   A2AErrorCodeEnum,
 *   createTaskEnvelope,
 *   createAuditEvent,
 *   buildA2AError,
 * } from '@recoder/shared/a2a/schemas';
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.A2AStructuredError = exports.isA2AErrorCode = exports.getErrorCodeMeta = exports.buildA2AError = exports.A2A_ERROR_CODE_REGISTRY = exports.A2AErrorCodeEnum = exports.A2AErrorCategoryEnum = exports.A2AErrorSeverityEnum = exports.createAuditEvent = exports.AuditSeverityEnum = exports.AuditTargetKindEnum = exports.AuditActorKindEnum = exports.AUDIT_EVENT_TYPES = exports.AuditEventTypeEnum = exports.AUDIT_EVENT_VERSION = exports.createTaskEnvelope = exports.transitionTaskEnvelope = exports.isValidTransition = exports.ALLOWED_STATE_TRANSITIONS = exports.isTerminalState = exports.TERMINAL_TASK_STATES = exports.TASK_STATES = exports.TaskStateEnum = exports.TASK_ENVELOPE_VERSION = void 0;
var task_envelope_1 = require("./task-envelope");
// -- version ----------------------------------------------------------------
Object.defineProperty(exports, "TASK_ENVELOPE_VERSION", { enumerable: true, get: function () { return task_envelope_1.TASK_ENVELOPE_VERSION; } });
// -- task state -------------------------------------------------------------
Object.defineProperty(exports, "TaskStateEnum", { enumerable: true, get: function () { return task_envelope_1.TaskStateEnum; } });
Object.defineProperty(exports, "TASK_STATES", { enumerable: true, get: function () { return task_envelope_1.TASK_STATES; } });
Object.defineProperty(exports, "TERMINAL_TASK_STATES", { enumerable: true, get: function () { return task_envelope_1.TERMINAL_TASK_STATES; } });
Object.defineProperty(exports, "isTerminalState", { enumerable: true, get: function () { return task_envelope_1.isTerminalState; } });
// -- state transitions ------------------------------------------------------
Object.defineProperty(exports, "ALLOWED_STATE_TRANSITIONS", { enumerable: true, get: function () { return task_envelope_1.ALLOWED_STATE_TRANSITIONS; } });
Object.defineProperty(exports, "isValidTransition", { enumerable: true, get: function () { return task_envelope_1.isValidTransition; } });
Object.defineProperty(exports, "transitionTaskEnvelope", { enumerable: true, get: function () { return task_envelope_1.transitionTaskEnvelope; } });
// -- factory ----------------------------------------------------------------
Object.defineProperty(exports, "createTaskEnvelope", { enumerable: true, get: function () { return task_envelope_1.createTaskEnvelope; } });
var audit_event_1 = require("./audit-event");
// -- version ----------------------------------------------------------------
Object.defineProperty(exports, "AUDIT_EVENT_VERSION", { enumerable: true, get: function () { return audit_event_1.AUDIT_EVENT_VERSION; } });
// -- event types ------------------------------------------------------------
Object.defineProperty(exports, "AuditEventTypeEnum", { enumerable: true, get: function () { return audit_event_1.AuditEventTypeEnum; } });
Object.defineProperty(exports, "AUDIT_EVENT_TYPES", { enumerable: true, get: function () { return audit_event_1.AUDIT_EVENT_TYPES; } });
// -- actor ------------------------------------------------------------------
Object.defineProperty(exports, "AuditActorKindEnum", { enumerable: true, get: function () { return audit_event_1.AuditActorKindEnum; } });
// -- target -----------------------------------------------------------------
Object.defineProperty(exports, "AuditTargetKindEnum", { enumerable: true, get: function () { return audit_event_1.AuditTargetKindEnum; } });
// -- severity ---------------------------------------------------------------
Object.defineProperty(exports, "AuditSeverityEnum", { enumerable: true, get: function () { return audit_event_1.AuditSeverityEnum; } });
// -- factory ----------------------------------------------------------------
Object.defineProperty(exports, "createAuditEvent", { enumerable: true, get: function () { return audit_event_1.createAuditEvent; } });
var error_taxonomy_1 = require("./error-taxonomy");
// -- severity ---------------------------------------------------------------
Object.defineProperty(exports, "A2AErrorSeverityEnum", { enumerable: true, get: function () { return error_taxonomy_1.A2AErrorSeverityEnum; } });
// -- categories -------------------------------------------------------------
Object.defineProperty(exports, "A2AErrorCategoryEnum", { enumerable: true, get: function () { return error_taxonomy_1.A2AErrorCategoryEnum; } });
// -- codes ------------------------------------------------------------------
Object.defineProperty(exports, "A2AErrorCodeEnum", { enumerable: true, get: function () { return error_taxonomy_1.A2AErrorCodeEnum; } });
Object.defineProperty(exports, "A2A_ERROR_CODE_REGISTRY", { enumerable: true, get: function () { return error_taxonomy_1.A2A_ERROR_CODE_REGISTRY; } });
// -- helpers ----------------------------------------------------------------
Object.defineProperty(exports, "buildA2AError", { enumerable: true, get: function () { return error_taxonomy_1.buildA2AError; } });
Object.defineProperty(exports, "getErrorCodeMeta", { enumerable: true, get: function () { return error_taxonomy_1.getErrorCodeMeta; } });
Object.defineProperty(exports, "isA2AErrorCode", { enumerable: true, get: function () { return error_taxonomy_1.isA2AErrorCode; } });
// -- error class ------------------------------------------------------------
Object.defineProperty(exports, "A2AStructuredError", { enumerable: true, get: function () { return error_taxonomy_1.A2AStructuredError; } });
