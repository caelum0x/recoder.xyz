/**
 * @module adapters/openclaw/types
 *
 * TypeScript type definitions for all OpenClaw gateway event payloads.
 *
 * OpenClaw is an external assistant gateway that processes incoming requests
 * from multiple surfaces (WebSocket node events, HTTP hooks, agent bus).
 * This module captures the shape of every event kind so that the mapper
 * can transform them into canonical TaskEnvelope instances.
 *
 * Event taxonomy (derived from openclaw/src/gateway):
 *
 * 1. **Node Events** (WebSocket):
 *    - `voice.transcript`  -- voice-to-text transcription forwarded to agent
 *    - `agent.request`     -- deep-link agent invocation from a node
 *    - `chat.subscribe`    -- node subscribes to a chat session
 *    - `chat.unsubscribe`  -- node unsubscribes from a chat session
 *    - `exec.started`      -- command execution started on a node
 *    - `exec.finished`     -- command execution completed on a node
 *    - `exec.denied`       -- command execution denied by policy on a node
 *
 * 2. **HTTP Hook Events** (REST):
 *    - `hook.wake`         -- wake the assistant (heartbeat / nudge)
 *    - `hook.agent`        -- trigger an agent run via HTTP hook
 *
 * 3. **Agent Bus Events** (internal event bus):
 *    - `agent.lifecycle`   -- lifecycle phase changes (start, end, error)
 *    - `agent.tool`        -- tool invocation stream events
 *    - `agent.assistant`   -- assistant text stream events
 *    - `agent.error`       -- error stream events
 */

// ---------------------------------------------------------------------------
// Common fields
// ---------------------------------------------------------------------------

/**
 * Every OpenClaw event carries an optional trace_id for distributed tracing.
 * If the originating client does not supply one, the mapper will generate it.
 */
export interface OpenClawTraceContext {
  /** W3C-compatible trace ID. */
  trace_id?: string;
  /** Optional parent span for nested traces. */
  parent_id?: string;
}

// ---------------------------------------------------------------------------
// Node Events (WebSocket)
// ---------------------------------------------------------------------------

/**
 * `voice.transcript` -- A voice-to-text transcription event from a node.
 * Triggers an agent run with the transcribed text.
 */
export interface OpenClawVoiceTranscriptEvent {
  event: 'voice.transcript';
  nodeId: string;
  text: string;
  sessionKey?: string;
  trace?: OpenClawTraceContext;
}

/**
 * `agent.request` -- A deep-link agent invocation from a node.
 * Carries a message and optional routing parameters.
 */
export interface OpenClawAgentRequestEvent {
  event: 'agent.request';
  nodeId: string;
  message: string;
  sessionKey?: string;
  thinking?: string;
  deliver?: boolean;
  to?: string;
  channel?: string;
  timeoutSeconds?: number;
  key?: string;
  trace?: OpenClawTraceContext;
}

/**
 * `chat.subscribe` -- A node subscribes to chat events for a session.
 */
export interface OpenClawChatSubscribeEvent {
  event: 'chat.subscribe';
  nodeId: string;
  sessionKey: string;
  trace?: OpenClawTraceContext;
}

/**
 * `chat.unsubscribe` -- A node unsubscribes from chat events for a session.
 */
export interface OpenClawChatUnsubscribeEvent {
  event: 'chat.unsubscribe';
  nodeId: string;
  sessionKey: string;
  trace?: OpenClawTraceContext;
}

/**
 * `exec.started` -- A command execution has started on a node.
 */
export interface OpenClawExecStartedEvent {
  event: 'exec.started';
  nodeId: string;
  sessionKey?: string;
  runId?: string;
  command?: string;
  trace?: OpenClawTraceContext;
}

/**
 * `exec.finished` -- A command execution has completed on a node.
 */
export interface OpenClawExecFinishedEvent {
  event: 'exec.finished';
  nodeId: string;
  sessionKey?: string;
  runId?: string;
  command?: string;
  exitCode?: number;
  timedOut?: boolean;
  output?: string;
  trace?: OpenClawTraceContext;
}

/**
 * `exec.denied` -- A command execution was denied by policy on a node.
 */
export interface OpenClawExecDeniedEvent {
  event: 'exec.denied';
  nodeId: string;
  sessionKey?: string;
  runId?: string;
  command?: string;
  reason?: string;
  trace?: OpenClawTraceContext;
}

// ---------------------------------------------------------------------------
// HTTP Hook Events
// ---------------------------------------------------------------------------

/**
 * `hook.wake` -- Wake/nudge the assistant.
 */
export interface OpenClawHookWakeEvent {
  event: 'hook.wake';
  text: string;
  mode: 'now' | 'next-heartbeat';
  trace?: OpenClawTraceContext;
}

/**
 * `hook.agent` -- Trigger an agent run via HTTP hook.
 * Mirrors the HookAgentPayload from hooks.ts.
 */
export interface OpenClawHookAgentEvent {
  event: 'hook.agent';
  message: string;
  name: string;
  wakeMode: 'now' | 'next-heartbeat';
  sessionKey: string;
  deliver: boolean;
  channel: string;
  to?: string;
  model?: string;
  thinking?: string;
  timeoutSeconds?: number;
  runId?: string;
  trace?: OpenClawTraceContext;
}

// ---------------------------------------------------------------------------
// Agent Bus Events (internal event bus)
// ---------------------------------------------------------------------------

/**
 * Lifecycle phase values emitted by the OpenClaw agent bus.
 */
export type OpenClawLifecyclePhase = 'start' | 'end' | 'error';

/**
 * Agent event stream kinds from the OpenClaw agent bus.
 */
export type OpenClawAgentStream = 'lifecycle' | 'tool' | 'assistant' | 'error';

/**
 * `agent.lifecycle` -- Agent run lifecycle phase change.
 */
export interface OpenClawAgentLifecycleEvent {
  event: 'agent.lifecycle';
  runId: string;
  seq: number;
  ts: number;
  phase: OpenClawLifecyclePhase;
  sessionKey?: string;
  data?: Record<string, unknown>;
  trace?: OpenClawTraceContext;
}

/**
 * `agent.tool` -- Tool invocation stream event.
 */
export interface OpenClawAgentToolEvent {
  event: 'agent.tool';
  runId: string;
  seq: number;
  ts: number;
  sessionKey?: string;
  data?: Record<string, unknown>;
  trace?: OpenClawTraceContext;
}

/**
 * `agent.assistant` -- Assistant text stream event.
 */
export interface OpenClawAgentAssistantEvent {
  event: 'agent.assistant';
  runId: string;
  seq: number;
  ts: number;
  sessionKey?: string;
  data?: {
    text?: string;
    [key: string]: unknown;
  };
  trace?: OpenClawTraceContext;
}

/**
 * `agent.error` -- Error stream event from the agent bus.
 */
export interface OpenClawAgentErrorEvent {
  event: 'agent.error';
  runId: string;
  seq: number;
  ts: number;
  sessionKey?: string;
  data?: {
    reason?: string;
    error?: string;
    [key: string]: unknown;
  };
  trace?: OpenClawTraceContext;
}

// ---------------------------------------------------------------------------
// Discriminated union of all OpenClaw events
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all OpenClaw gateway event types.
 * The `event` field serves as the discriminator.
 */
export type OpenClawGatewayEvent =
  // Node events
  | OpenClawVoiceTranscriptEvent
  | OpenClawAgentRequestEvent
  | OpenClawChatSubscribeEvent
  | OpenClawChatUnsubscribeEvent
  | OpenClawExecStartedEvent
  | OpenClawExecFinishedEvent
  | OpenClawExecDeniedEvent
  // HTTP hook events
  | OpenClawHookWakeEvent
  | OpenClawHookAgentEvent
  // Agent bus events
  | OpenClawAgentLifecycleEvent
  | OpenClawAgentToolEvent
  | OpenClawAgentAssistantEvent
  | OpenClawAgentErrorEvent;

/**
 * Extract the event name string literal union from the discriminated union.
 */
export type OpenClawEventName = OpenClawGatewayEvent['event'];

/**
 * All recognized OpenClaw event names as a const array.
 */
export const OPENCLAW_EVENT_NAMES = [
  'voice.transcript',
  'agent.request',
  'chat.subscribe',
  'chat.unsubscribe',
  'exec.started',
  'exec.finished',
  'exec.denied',
  'hook.wake',
  'hook.agent',
  'agent.lifecycle',
  'agent.tool',
  'agent.assistant',
  'agent.error',
] as const satisfies readonly OpenClawEventName[];

/**
 * Events that produce a TaskEnvelope (task-generating events).
 * Chat subscribe/unsubscribe are control-plane signals that do not
 * produce tasks.
 */
export type OpenClawTaskGeneratingEvent = Exclude<
  OpenClawGatewayEvent,
  OpenClawChatSubscribeEvent | OpenClawChatUnsubscribeEvent
>;

/**
 * Check whether an event name is recognized.
 */
export function isOpenClawEventName(name: string): name is OpenClawEventName {
  return (OPENCLAW_EVENT_NAMES as readonly string[]).includes(name);
}
