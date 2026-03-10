"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapOpenClawEventStrict = exports.mapOpenClawEvent = exports.runValidationAssertions = exports.validateOpenClawEvent = exports.isOpenClawEventName = exports.OPENCLAW_EVENT_NAMES = exports.A2AStructuredError = exports.isA2AErrorCode = exports.getErrorCodeMeta = exports.buildA2AError = exports.A2A_ERROR_CODE_REGISTRY = exports.A2AErrorCodeEnum = exports.A2AErrorCategoryEnum = exports.A2AErrorSeverityEnum = exports.createAuditEvent = exports.AuditSeverityEnum = exports.AuditTargetKindEnum = exports.AuditActorKindEnum = exports.AUDIT_EVENT_TYPES = exports.AuditEventTypeEnum = exports.AUDIT_EVENT_VERSION = exports.createTaskEnvelope = exports.transitionTaskEnvelope = exports.isValidTransition = exports.ALLOWED_STATE_TRANSITIONS = exports.isTerminalState = exports.TERMINAL_TASK_STATES = exports.TASK_STATES = exports.TaskStateEnum = exports.TASK_ENVELOPE_VERSION = void 0;
__exportStar(require("./types"), exports);
__exportStar(require("./bridge"), exports);
__exportStar(require("./error-contract"), exports);
__exportStar(require("./error-contract.snapshot"), exports);
__exportStar(require("./control-plane"), exports);
__exportStar(require("./persistent-services"), exports);
__exportStar(require("./redis-persistence"), exports);
// Re-export schemas selectively to avoid TaskState name collision with
// control-plane.ts (both define the same TaskState union).
// Consumers who want the full schemas surface should use
// '@recoder/shared/a2a/schemas' directly.
var schemas_1 = require("./schemas");
// task-envelope (excluding TaskState -- already re-exported from control-plane)
Object.defineProperty(exports, "TASK_ENVELOPE_VERSION", { enumerable: true, get: function () { return schemas_1.TASK_ENVELOPE_VERSION; } });
Object.defineProperty(exports, "TaskStateEnum", { enumerable: true, get: function () { return schemas_1.TaskStateEnum; } });
Object.defineProperty(exports, "TASK_STATES", { enumerable: true, get: function () { return schemas_1.TASK_STATES; } });
Object.defineProperty(exports, "TERMINAL_TASK_STATES", { enumerable: true, get: function () { return schemas_1.TERMINAL_TASK_STATES; } });
Object.defineProperty(exports, "isTerminalState", { enumerable: true, get: function () { return schemas_1.isTerminalState; } });
Object.defineProperty(exports, "ALLOWED_STATE_TRANSITIONS", { enumerable: true, get: function () { return schemas_1.ALLOWED_STATE_TRANSITIONS; } });
Object.defineProperty(exports, "isValidTransition", { enumerable: true, get: function () { return schemas_1.isValidTransition; } });
Object.defineProperty(exports, "transitionTaskEnvelope", { enumerable: true, get: function () { return schemas_1.transitionTaskEnvelope; } });
Object.defineProperty(exports, "createTaskEnvelope", { enumerable: true, get: function () { return schemas_1.createTaskEnvelope; } });
// audit-event
Object.defineProperty(exports, "AUDIT_EVENT_VERSION", { enumerable: true, get: function () { return schemas_1.AUDIT_EVENT_VERSION; } });
Object.defineProperty(exports, "AuditEventTypeEnum", { enumerable: true, get: function () { return schemas_1.AuditEventTypeEnum; } });
Object.defineProperty(exports, "AUDIT_EVENT_TYPES", { enumerable: true, get: function () { return schemas_1.AUDIT_EVENT_TYPES; } });
Object.defineProperty(exports, "AuditActorKindEnum", { enumerable: true, get: function () { return schemas_1.AuditActorKindEnum; } });
Object.defineProperty(exports, "AuditTargetKindEnum", { enumerable: true, get: function () { return schemas_1.AuditTargetKindEnum; } });
Object.defineProperty(exports, "AuditSeverityEnum", { enumerable: true, get: function () { return schemas_1.AuditSeverityEnum; } });
Object.defineProperty(exports, "createAuditEvent", { enumerable: true, get: function () { return schemas_1.createAuditEvent; } });
// error-taxonomy
Object.defineProperty(exports, "A2AErrorSeverityEnum", { enumerable: true, get: function () { return schemas_1.A2AErrorSeverityEnum; } });
Object.defineProperty(exports, "A2AErrorCategoryEnum", { enumerable: true, get: function () { return schemas_1.A2AErrorCategoryEnum; } });
Object.defineProperty(exports, "A2AErrorCodeEnum", { enumerable: true, get: function () { return schemas_1.A2AErrorCodeEnum; } });
Object.defineProperty(exports, "A2A_ERROR_CODE_REGISTRY", { enumerable: true, get: function () { return schemas_1.A2A_ERROR_CODE_REGISTRY; } });
Object.defineProperty(exports, "buildA2AError", { enumerable: true, get: function () { return schemas_1.buildA2AError; } });
Object.defineProperty(exports, "getErrorCodeMeta", { enumerable: true, get: function () { return schemas_1.getErrorCodeMeta; } });
Object.defineProperty(exports, "isA2AErrorCode", { enumerable: true, get: function () { return schemas_1.isA2AErrorCode; } });
Object.defineProperty(exports, "A2AStructuredError", { enumerable: true, get: function () { return schemas_1.A2AStructuredError; } });
// Re-export OpenClaw adapter under a namespace-like path.
// Consumers who want the full adapter surface should use
// '@recoder/shared/a2a/adapters/openclaw' directly.
var openclaw_1 = require("./adapters/openclaw");
// types
Object.defineProperty(exports, "OPENCLAW_EVENT_NAMES", { enumerable: true, get: function () { return openclaw_1.OPENCLAW_EVENT_NAMES; } });
Object.defineProperty(exports, "isOpenClawEventName", { enumerable: true, get: function () { return openclaw_1.isOpenClawEventName; } });
// validation
Object.defineProperty(exports, "validateOpenClawEvent", { enumerable: true, get: function () { return openclaw_1.validateOpenClawEvent; } });
Object.defineProperty(exports, "runValidationAssertions", { enumerable: true, get: function () { return openclaw_1.runValidationAssertions; } });
// mapper
Object.defineProperty(exports, "mapOpenClawEvent", { enumerable: true, get: function () { return openclaw_1.mapOpenClawEvent; } });
Object.defineProperty(exports, "mapOpenClawEventStrict", { enumerable: true, get: function () { return openclaw_1.mapOpenClawEventStrict; } });
