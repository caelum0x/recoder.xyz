"use strict";
/**
 * @module @recoder/shared/a2a/adapters/openclaw
 *
 * OpenClaw gateway adapter for the Recoder A2A control plane.
 *
 * This module provides:
 * 1. TypeScript types for all OpenClaw gateway event payloads.
 * 2. Validation functions to reject malformed events with A2A error codes.
 * 3. Mapper functions to transform OpenClaw events into canonical TaskEnvelope.
 *
 * Usage:
 * ```ts
 * import {
 *   validateOpenClawEvent,
 *   mapOpenClawEvent,
 *   type OpenClawGatewayEvent,
 * } from '@recoder/shared/a2a/adapters/openclaw';
 *
 * // Validate raw input
 * const validated = validateOpenClawEvent(rawPayload);
 * if (!validated.ok) {
 *   console.error(validated.error);
 *   return;
 * }
 *
 * // Map to canonical TaskEnvelope
 * const result = mapOpenClawEvent(validated.event, { workspace_id: 'ws_abc' });
 * if (result.ok && !('skipped' in result)) {
 *   processEnvelope(result.envelope);
 * }
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapAgentError = exports.mapAgentAssistant = exports.mapAgentTool = exports.mapAgentLifecycle = exports.mapHookAgent = exports.mapHookWake = exports.mapExecDenied = exports.mapExecFinished = exports.mapExecStarted = exports.mapChatUnsubscribe = exports.mapChatSubscribe = exports.mapAgentRequest = exports.mapVoiceTranscript = exports.mapOpenClawEventStrict = exports.mapOpenClawEvent = exports.runValidationAssertions = exports.validateOpenClawEvent = exports.isOpenClawEventName = exports.OPENCLAW_EVENT_NAMES = void 0;
// -- Types ------------------------------------------------------------------
var types_1 = require("./types");
Object.defineProperty(exports, "OPENCLAW_EVENT_NAMES", { enumerable: true, get: function () { return types_1.OPENCLAW_EVENT_NAMES; } });
Object.defineProperty(exports, "isOpenClawEventName", { enumerable: true, get: function () { return types_1.isOpenClawEventName; } });
// -- Validation -------------------------------------------------------------
var validation_1 = require("./validation");
Object.defineProperty(exports, "validateOpenClawEvent", { enumerable: true, get: function () { return validation_1.validateOpenClawEvent; } });
Object.defineProperty(exports, "runValidationAssertions", { enumerable: true, get: function () { return validation_1.runValidationAssertions; } });
// -- Mapper -----------------------------------------------------------------
var mapper_1 = require("./mapper");
// Primary dispatch entry points
Object.defineProperty(exports, "mapOpenClawEvent", { enumerable: true, get: function () { return mapper_1.mapOpenClawEvent; } });
Object.defineProperty(exports, "mapOpenClawEventStrict", { enumerable: true, get: function () { return mapper_1.mapOpenClawEventStrict; } });
// Individual mappers (for direct use when the event type is known)
Object.defineProperty(exports, "mapVoiceTranscript", { enumerable: true, get: function () { return mapper_1.mapVoiceTranscript; } });
Object.defineProperty(exports, "mapAgentRequest", { enumerable: true, get: function () { return mapper_1.mapAgentRequest; } });
Object.defineProperty(exports, "mapChatSubscribe", { enumerable: true, get: function () { return mapper_1.mapChatSubscribe; } });
Object.defineProperty(exports, "mapChatUnsubscribe", { enumerable: true, get: function () { return mapper_1.mapChatUnsubscribe; } });
Object.defineProperty(exports, "mapExecStarted", { enumerable: true, get: function () { return mapper_1.mapExecStarted; } });
Object.defineProperty(exports, "mapExecFinished", { enumerable: true, get: function () { return mapper_1.mapExecFinished; } });
Object.defineProperty(exports, "mapExecDenied", { enumerable: true, get: function () { return mapper_1.mapExecDenied; } });
Object.defineProperty(exports, "mapHookWake", { enumerable: true, get: function () { return mapper_1.mapHookWake; } });
Object.defineProperty(exports, "mapHookAgent", { enumerable: true, get: function () { return mapper_1.mapHookAgent; } });
Object.defineProperty(exports, "mapAgentLifecycle", { enumerable: true, get: function () { return mapper_1.mapAgentLifecycle; } });
Object.defineProperty(exports, "mapAgentTool", { enumerable: true, get: function () { return mapper_1.mapAgentTool; } });
Object.defineProperty(exports, "mapAgentAssistant", { enumerable: true, get: function () { return mapper_1.mapAgentAssistant; } });
Object.defineProperty(exports, "mapAgentError", { enumerable: true, get: function () { return mapper_1.mapAgentError; } });
