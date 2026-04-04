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

import { createLogger } from '../logger';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';

const logger = createLogger('a2a-zrok-agent-tunnel');

// ── Agent push endpoint registry ────────────────────────────────────

interface AgentPushEndpoint {
  agentId: string;
  callbackUrl: string;
  sessionId?: string;
  registeredAt: string;
  lastPushAt?: string;
  pushCount: number;
  failCount: number;
}

const agentEndpoints = new Map<string, AgentPushEndpoint>();

/**
 * Register an agent's push callback URL.
 * Called when an agent connects via SSE or registers explicitly.
 */
export function registerAgentEndpoint(
  agentId: string,
  callbackUrl: string,
  sessionId?: string,
): void {
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
export function deregisterAgentEndpoint(agentId: string): void {
  agentEndpoints.delete(agentId);
  logger.info({ agentId }, 'Agent push endpoint deregistered');
}

/**
 * Get an agent's push endpoint.
 */
export function getAgentEndpoint(agentId: string): AgentPushEndpoint | undefined {
  return agentEndpoints.get(agentId);
}

/**
 * List all registered agent endpoints.
 */
export function listAgentEndpoints(): AgentPushEndpoint[] {
  return Array.from(agentEndpoints.values());
}

// ── Inbox push ──────────────────────────────────────────────────────

/**
 * Push a notification to an agent's callback URL.
 * Used for inbox messages, task assignments, and other real-time events.
 */
export async function pushToAgent(
  agentId: string,
  event: { type: string; data: unknown },
): Promise<boolean> {
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
  } catch (err) {
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
export function wireInboxPush(): void {
  const bus = getA2AEventBus();

  bus.subscribeGlobal((event) => {
    const data = event.data as Record<string, unknown>;

    // Push when a new task is submitted (to the target agent)
    if (event.type === A2AEventType.TaskSubmitted) {
      const task = data.task as Record<string, unknown> | undefined;
      const targetAgent = task?.target_agent_id as string | undefined;
      if (targetAgent) {
        pushToAgent(targetAgent, { type: 'inbox.task-assigned', data }).catch(() => {});
      }
    }

    // Push when a task requires input
    if (event.type === A2AEventType.TaskInputRequired) {
      const task = data.task as Record<string, unknown> | undefined;
      const targetAgent = task?.target_agent_id as string | undefined;
      if (targetAgent) {
        pushToAgent(targetAgent, { type: 'inbox.input-required', data }).catch(() => {});
      }
    }

    // Push channel messages to recipient
    if (event.type === A2AEventType.MessageNew) {
      const message = data.message as Record<string, unknown> | undefined;
      const targetAgent = message?.toAgentId as string | undefined;
      if (targetAgent) {
        pushToAgent(targetAgent, { type: 'inbox.new', data }).catch(() => {});
      }
    }
  });

  logger.info('Inbox push notifications wired to A2A event bus');
}
