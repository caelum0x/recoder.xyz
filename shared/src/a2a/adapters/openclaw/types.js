"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPENCLAW_EVENT_NAMES = void 0;
exports.isOpenClawEventName = isOpenClawEventName;
/**
 * All recognized OpenClaw event names as a const array.
 */
exports.OPENCLAW_EVENT_NAMES = [
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
];
/**
 * Check whether an event name is recognized.
 */
function isOpenClawEventName(name) {
    return exports.OPENCLAW_EVENT_NAMES.includes(name);
}
