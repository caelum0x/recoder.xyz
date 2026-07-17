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

// -- Types ------------------------------------------------------------------
export {
  // Trace context
  type OpenClawTraceContext,

  // Node events
  type OpenClawVoiceTranscriptEvent,
  type OpenClawAgentRequestEvent,
  type OpenClawChatSubscribeEvent,
  type OpenClawChatUnsubscribeEvent,
  type OpenClawExecStartedEvent,
  type OpenClawExecFinishedEvent,
  type OpenClawExecDeniedEvent,

  // HTTP hook events
  type OpenClawHookWakeEvent,
  type OpenClawHookAgentEvent,

  // Agent bus events
  type OpenClawLifecyclePhase,
  type OpenClawAgentStream,
  type OpenClawAgentLifecycleEvent,
  type OpenClawAgentToolEvent,
  type OpenClawAgentAssistantEvent,
  type OpenClawAgentErrorEvent,

  // Discriminated union and helpers
  type OpenClawGatewayEvent,
  type OpenClawTaskGeneratingEvent,
  type OpenClawEventName,
  OPENCLAW_EVENT_NAMES,
  isOpenClawEventName,
} from './types';

// -- Validation -------------------------------------------------------------
export {
  validateOpenClawEvent,
  runValidationAssertions,
  type ValidationSuccess,
  type ValidationFailure,
  type ValidationResult,
} from './validation';

// -- Mapper -----------------------------------------------------------------
export {
  // Primary dispatch entry points
  mapOpenClawEvent,
  mapOpenClawEventStrict,

  // Individual mappers (for direct use when the event type is known)
  mapVoiceTranscript,
  mapAgentRequest,
  mapChatSubscribe,
  mapChatUnsubscribe,
  mapExecStarted,
  mapExecFinished,
  mapExecDenied,
  mapHookWake,
  mapHookAgent,
  mapAgentLifecycle,
  mapAgentTool,
  mapAgentAssistant,
  mapAgentError,

  // Options and result types
  type OpenClawMapperOptions,
  type OpenClawMapperSuccess,
  type OpenClawMapperFailure,
  type OpenClawMapperSkipped,
  type OpenClawMapperResult,
} from './mapper';
