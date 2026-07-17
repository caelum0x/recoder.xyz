/**
 * @module adapters/openclaw/validation
 *
 * Validation functions for OpenClaw gateway events.
 *
 * Validates raw unknown payloads against the OpenClaw event type definitions
 * before they are passed to the mapper. Rejects malformed events with proper
 * A2A error codes from the canonical error taxonomy.
 *
 * Validation is intentionally strict: missing required fields are rejected
 * with MISSING_ENVELOPE_FIELD, structurally invalid events with
 * INVALID_ENVELOPE, and unrecognized event types with INVALID_PAYLOAD.
 *
 * @example
 * ```ts
 * import { validateOpenClawEvent } from '@recoder/shared/a2a/adapters/openclaw';
 *
 * const result = validateOpenClawEvent(rawPayload);
 * if (result.ok) {
 *   // result.event is a validated OpenClawGatewayEvent
 * } else {
 *   // result.error is an A2AError with proper code and details
 * }
 * ```
 */
import { type A2AError } from '../../schemas/error-taxonomy';
import { type OpenClawGatewayEvent } from './types';
export interface ValidationSuccess {
    ok: true;
    event: OpenClawGatewayEvent;
}
export interface ValidationFailure {
    ok: false;
    error: A2AError;
}
export type ValidationResult = ValidationSuccess | ValidationFailure;
/**
 * Validate a raw unknown value as an OpenClaw gateway event.
 *
 * Performs structural validation and rejects malformed events with
 * proper A2A error codes:
 * - `INVALID_ENVELOPE` -- the value is not an object
 * - `MISSING_ENVELOPE_FIELD` -- required fields are missing or invalid
 * - `INVALID_PAYLOAD` -- unrecognized event type
 *
 * @param value - The raw payload to validate.
 * @returns A typed result with the validated event or an A2A error.
 */
export declare function validateOpenClawEvent(value: unknown): ValidationResult;
/**
 * Validate and map in one step. Convenience function that validates a raw
 * payload and then maps it to a TaskEnvelope.
 *
 * This is the recommended entry point for processing raw OpenClaw events
 * from HTTP or WebSocket ingestion.
 */
export { validateOpenClawEvent as validate };
/**
 * Run inline validation assertions. Call during module initialization or
 * in test suites to verify the validation logic is correct.
 *
 * @throws Error if any assertion fails.
 */
export declare function runValidationAssertions(): void;
