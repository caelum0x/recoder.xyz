/**
 * @module adapters/openclaw/mapper
 *
 * Mapper functions that transform OpenClaw gateway events into canonical
 * TaskEnvelope instances.
 *
 * Each OpenClaw event type has a dedicated mapper that:
 * 1. Extracts or generates a trace_id for distributed tracing.
 * 2. Maps OpenClaw-specific fields to canonical envelope fields.
 * 3. Sets the correct initial TaskState based on the event semantics.
 * 4. Populates connector info for the OpenClaw adapter.
 * 5. Constructs proper requester/assignee agent references.
 *
 * The top-level `mapOpenClawEvent` function dispatches to the correct mapper
 * based on the event discriminator.
 *
 * @example
 * ```ts
 * import { mapOpenClawEvent } from '@recoder/shared/a2a/adapters/openclaw';
 *
 * const result = mapOpenClawEvent(openclawEvent, { workspace_id: 'ws_abc' });
 * if (result.ok) {
 *   // result.envelope is a TaskEnvelope
 * } else {
 *   // result.error is an A2AError
 * }
 * ```
 */
import { type TaskEnvelope } from '../../schemas/task-envelope';
import { type A2AError } from '../../schemas/error-taxonomy';
import type { OpenClawGatewayEvent, OpenClawTaskGeneratingEvent, OpenClawVoiceTranscriptEvent, OpenClawAgentRequestEvent, OpenClawChatSubscribeEvent, OpenClawChatUnsubscribeEvent, OpenClawExecStartedEvent, OpenClawExecFinishedEvent, OpenClawExecDeniedEvent, OpenClawHookWakeEvent, OpenClawHookAgentEvent, OpenClawAgentLifecycleEvent, OpenClawAgentToolEvent, OpenClawAgentAssistantEvent, OpenClawAgentErrorEvent } from './types';
/**
 * Options passed to the mapper to provide context that the event itself
 * does not carry (workspace scoping, default agent identities).
 */
export interface OpenClawMapperOptions {
    /** The workspace ID to scope the envelope to. Required. */
    workspace_id: string;
    /**
     * Default thread ID when the event does not carry one.
     * If not provided, a session-key-based or generated thread_id is used.
     */
    default_thread_id?: string;
    /**
     * The agent ID representing the OpenClaw gateway itself.
     * Defaults to 'openclaw-gateway'.
     */
    gateway_agent_id?: string;
    /**
     * The agent ID representing the assignee agent that processes tasks.
     * Defaults to 'openclaw-agent'.
     */
    assignee_agent_id?: string;
    /**
     * Override the ID factory for task IDs.
     * Defaults to generating a `task_<hex>` identifier.
     */
    id_factory?: () => string;
    /**
     * Override the trace_id factory.
     * Defaults to generating a 32-char hex W3C trace ID.
     */
    trace_id_factory?: () => string;
    /**
     * Override the current timestamp.
     * Defaults to `new Date().toISOString()`.
     */
    now?: string;
}
/** Successful mapping result. */
export interface OpenClawMapperSuccess {
    ok: true;
    envelope: TaskEnvelope;
}
/** Failed mapping result. */
export interface OpenClawMapperFailure {
    ok: false;
    error: A2AError;
}
/**
 * Skipped result -- the event is valid but does not produce a TaskEnvelope
 * (e.g. chat.subscribe / chat.unsubscribe are control signals).
 */
export interface OpenClawMapperSkipped {
    ok: true;
    skipped: true;
    reason: string;
}
/** Union of all possible mapping outcomes. */
export type OpenClawMapperResult = OpenClawMapperSuccess | OpenClawMapperFailure | OpenClawMapperSkipped;
declare function mapVoiceTranscript(evt: OpenClawVoiceTranscriptEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapAgentRequest(evt: OpenClawAgentRequestEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapChatSubscribe(_evt: OpenClawChatSubscribeEvent, _opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapChatUnsubscribe(_evt: OpenClawChatUnsubscribeEvent, _opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapExecStarted(evt: OpenClawExecStartedEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapExecFinished(evt: OpenClawExecFinishedEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapExecDenied(evt: OpenClawExecDeniedEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapHookWake(evt: OpenClawHookWakeEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapHookAgent(evt: OpenClawHookAgentEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapAgentLifecycle(evt: OpenClawAgentLifecycleEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapAgentTool(evt: OpenClawAgentToolEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapAgentAssistant(evt: OpenClawAgentAssistantEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
declare function mapAgentError(evt: OpenClawAgentErrorEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
/**
 * Map any OpenClaw gateway event to a canonical TaskEnvelope.
 *
 * This is the primary entry point. It dispatches to the correct per-event
 * mapper based on the `event` discriminator field.
 *
 * @param event - The raw OpenClaw gateway event.
 * @param opts  - Mapping options (workspace_id is required).
 * @returns A result indicating success (with envelope), skip, or failure.
 */
export declare function mapOpenClawEvent(event: OpenClawGatewayEvent, opts: OpenClawMapperOptions): OpenClawMapperResult;
/**
 * Map an OpenClaw event, asserting that it produces a TaskEnvelope
 * (not skipped). Throws A2AStructuredError on failure.
 *
 * Convenience wrapper for cases where the caller knows the event type
 * is task-generating and wants to skip the result discrimination.
 */
export declare function mapOpenClawEventStrict(event: OpenClawTaskGeneratingEvent, opts: OpenClawMapperOptions): TaskEnvelope;
export { mapVoiceTranscript, mapAgentRequest, mapChatSubscribe, mapChatUnsubscribe, mapExecStarted, mapExecFinished, mapExecDenied, mapHookWake, mapHookAgent, mapAgentLifecycle, mapAgentTool, mapAgentAssistant, mapAgentError, };
