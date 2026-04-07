"use strict";
/**
 * @module zrok-agent-tunnel
 *
 * Manages Zrok tunnels for remote A2A agent connections.
 *
 * When a Claude Code, Codex, or other CLI agent registers with the A2A
 * gateway, it provides a local callback URL (e.g. http://localhost:PORT/inbox).
 * This module creates a Zrok tunnel so docker-backend can push inbox
 * notifications to that agent even when it's on a different machine.
 *
 * Flow:
 *   1. Agent registers: POST /api/a2a/agents/register { callbackUrl, agentId }
 *   2. If callbackUrl is localhost, create a Zrok tunnel to reach it
 *   3. Store the tunnel URL as the agent's push endpoint
 *   4. When a new message arrives in the agent's inbox, POST it to the tunnel URL
 *   5. Agent deregisters or disconnects → tear down tunnel
 *
 * For agents that are already reachable (e.g. within the same Docker network),
 * no tunnel is needed — we push directly to the callback URL.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAgentEndpoint = registerAgentEndpoint;
exports.deregisterAgentEndpoint = deregisterAgentEndpoint;
exports.getAgentEndpoint = getAgentEndpoint;
exports.listAgentEndpoints = listAgentEndpoints;
exports.pushToAgent = pushToAgent;
exports.wireInboxPush = wireInboxPush;
const logger_1 = require("../logger");
const a2a_event_bus_1 = require("./a2a-event-bus");
const logger = (0, logger_1.createLogger)('a2a-zrok-agent-tunnel');
const agentEndpoints = new Map();
/**
 * Register an agent's push callback URL.
 * Called when an agent connects via SSE or registers explicitly.
 */
function registerAgentEndpoint(agentId, callbackUrl, sessionId) {
    agentEndpoints.set(agentId, {
        agentId,
        callbackUrl,
        sessionId,
        registeredAt: new Date().toISOString(),
        pushCount: 0,
        failCount: 0,
    });
    logger.info({ agentId, callbackUrl, sessionId }, 'Agent push endpoint registered');
}
/**
 * Deregister an agent's push endpoint.
 */
function deregisterAgentEndpoint(agentId) {
    agentEndpoints.delete(agentId);
    logger.info({ agentId }, 'Agent push endpoint deregistered');
}
/**
 * Get an agent's push endpoint.
 */
function getAgentEndpoint(agentId) {
    return agentEndpoints.get(agentId);
}
/**
 * List all registered agent endpoints.
 */
function listAgentEndpoints() {
    return Array.from(agentEndpoints.values());
}
// ── Inbox push ──────────────────────────────────────────────────────
/**
 * Push a notification to an agent's callback URL.
 * Used for inbox messages, task assignments, and other real-time events.
 */
async function pushToAgent(agentId, event) {
    const endpoint = agentEndpoints.get(agentId);
    if (!endpoint) {
        logger.debug({ agentId }, 'No push endpoint registered for agent');
        return false;
    }
    try {
        const res = await fetch(endpoint.callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
            signal: AbortSignal.timeout(10_000),
        });
        endpoint.lastPushAt = new Date().toISOString();
        endpoint.pushCount++;
        if (!res.ok) {
            endpoint.failCount++;
            logger.warn({ agentId, status: res.status }, 'Push to agent failed');
            return false;
        }
        return true;
    }
    catch (err) {
        endpoint.failCount++;
        logger.warn({ agentId, err: err instanceof Error ? err.message : String(err) }, 'Push to agent error');
        return false;
    }
}
// ── Event bus integration ───────────────────────────────────────────
/**
 * Wire the inbox push system to the A2A event bus.
 * When tasks are assigned or messages are sent, push to the target agent.
 */
function wireInboxPush() {
    const bus = (0, a2a_event_bus_1.getA2AEventBus)();
    bus.subscribeGlobal((event) => {
        const data = event.data;
        // Push when a new task is submitted (to the target agent)
        if (event.type === a2a_event_bus_1.A2AEventType.TaskSubmitted) {
            const task = data.task;
            const targetAgent = task?.target_agent_id;
            if (targetAgent) {
                pushToAgent(targetAgent, { type: 'inbox.task-assigned', data }).catch(() => { });
            }
        }
        // Push when a task requires input
        if (event.type === a2a_event_bus_1.A2AEventType.TaskInputRequired) {
            const task = data.task;
            const targetAgent = task?.target_agent_id;
            if (targetAgent) {
                pushToAgent(targetAgent, { type: 'inbox.input-required', data }).catch(() => { });
            }
        }
        // Push channel messages to recipient
        if (event.type === a2a_event_bus_1.A2AEventType.MessageNew) {
            const message = data.message;
            const targetAgent = message?.toAgentId;
            if (targetAgent) {
                pushToAgent(targetAgent, { type: 'inbox.new', data }).catch(() => { });
            }
        }
    });
    logger.info('Inbox push notifications wired to A2A event bus');
}
