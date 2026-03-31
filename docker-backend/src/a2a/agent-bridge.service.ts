/**
 * @module agent-bridge.service
 *
 * WebSocket-based bridge that connects local agents (recoder-code CLI)
 * to the A2A workspace system.
 *
 * Local agents connect via ws://docker-backend/agent-bridge?token=<session_token>
 * and exchange JSON messages to register, receive task assignments, report
 * progress, and participate in channel conversations.
 *
 * Protocol — Client → Server:
 *   { type: "register", agentId, capabilities, workspaceIds }
 *   { type: "heartbeat" }
 *   { type: "task.progress", taskId, progress, output }
 *   { type: "task.complete", taskId, result }
 *   { type: "task.failed", taskId, error }
 *   { type: "channel.message", channelId, content }
 *   { type: "join_workspace", workspaceId }
 *   { type: "leave_workspace", workspaceId }
 *
 * Protocol — Server → Client:
 *   { type: "registered", agentId, workspaces }
 *   { type: "task.assigned", taskId, prompt, context, worktreeBranch? }
 *   { type: "task.cancelled", taskId }
 *   { type: "channel.message", channelId, from, content }
 *   { type: "workspace.updated", workspaceId, changes }
 *   { type: "ping" }
 */

import WebSocket from 'ws';
import { v4 as uuid } from 'uuid';
import { getA2AEventBus, A2AEventType } from './a2a-event-bus';
import { getWorkspaceService } from './workspace.service';
import { getCollaborationSvc } from './collaboration.service';
import { getHeartbeatTracker } from './heartbeat-tracker.service';
import { createLogger } from '../logger';

const logger = createLogger('agent-bridge');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectedAgent {
  agentId: string;
  userId: string;
  socket: WebSocket;
  workspaceIds: string[];
  capabilities: string[];
  status: 'online' | 'working' | 'idle';
  connectedAt: string;
  lastHeartbeat: string;
}

interface BridgeMessage {
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AgentBridgeService {
  private readonly agents = new Map<string, ConnectedAgent>();
  private readonly socketToAgent = new Map<WebSocket, string>();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHeartbeatSweep();
  }

  private recordBridgeHeartbeat(agent: Pick<ConnectedAgent, 'agentId' | 'userId' | 'capabilities' | 'workspaceIds'>): void {
    getHeartbeatTracker().recordHeartbeat(agent.agentId, 'healthy', {
      source: 'bridge',
      userId: agent.userId,
      capabilityCount: agent.capabilities.length,
      workspaceCount: agent.workspaceIds.length,
    });
  }

  private removeBridgeHeartbeat(agentId: string): void {
    const tracker = getHeartbeatTracker();
    const record = tracker.getRecord(agentId);
    if (record?.metadata?.source === 'bridge') {
      tracker.removeAgent(agentId);
    }
  }

  // -----------------------------------------------------------------------
  // Agent connection lifecycle
  // -----------------------------------------------------------------------

  registerAgent(
    ws: WebSocket,
    agentId: string,
    userId: string,
    capabilities: string[] = [],
    workspaceIds: string[] = [],
  ): ConnectedAgent {
    // Disconnect existing connection for same agentId (reconnect case)
    const existing = this.agents.get(agentId);
    if (existing && existing.socket !== ws) {
      try {
        existing.socket.close(1000, 'Replaced by new connection');
      } catch { /* ignore */ }
      this.socketToAgent.delete(existing.socket);
    }

    const now = new Date().toISOString();
    const agent: ConnectedAgent = {
      agentId,
      userId,
      socket: ws,
      workspaceIds: [...workspaceIds],
      capabilities,
      status: 'online',
      connectedAt: now,
      lastHeartbeat: now,
    };

    this.agents.set(agentId, agent);
    this.socketToAgent.set(ws, agentId);
    this.recordBridgeHeartbeat(agent);

    // Auto-add to workspace member lists
    const wsSvc = getWorkspaceService();
    for (const wsId of workspaceIds) {
      wsSvc.addAgent(wsId, agentId);
    }

    // Publish agent.online event for each workspace
    const bus = getA2AEventBus();
    for (const wsId of workspaceIds) {
      bus.publish({
        id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
        type: A2AEventType.AgentOnline,
        timestamp: now,
        data: { agentId, userId, capabilities, isLocal: true },
        workspaceId: wsId,
      });
    }

    logger.info(
      { agentId, userId, workspaces: workspaceIds.length, capabilities: capabilities.length },
      'agent registered via bridge',
    );

    return agent;
  }

  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    this.socketToAgent.delete(agent.socket);
    this.agents.delete(agentId);
    this.removeBridgeHeartbeat(agentId);

    // Publish agent.offline
    const bus = getA2AEventBus();
    const now = new Date().toISOString();
    for (const wsId of agent.workspaceIds) {
      bus.publish({
        id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
        type: A2AEventType.AgentOffline,
        timestamp: now,
        data: { agentId, isLocal: true },
        workspaceId: wsId,
      });
    }

    logger.info({ agentId }, 'agent unregistered from bridge');
  }

  unregisterBySocket(ws: WebSocket): void {
    const agentId = this.socketToAgent.get(ws);
    if (agentId) {
      this.unregisterAgent(agentId);
    }
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  getOnlineAgents(workspaceId?: string): ConnectedAgent[] {
    const all = [...this.agents.values()];
    if (!workspaceId) return all;
    return all.filter((a) => a.workspaceIds.includes(workspaceId));
  }

  getAgent(agentId: string): ConnectedAgent | undefined {
    return this.agents.get(agentId);
  }

  isAgentOnline(agentId: string): boolean {
    return this.agents.has(agentId);
  }

  // -----------------------------------------------------------------------
  // Messaging
  // -----------------------------------------------------------------------

  sendToAgent(agentId: string, message: BridgeMessage): boolean {
    const agent = this.agents.get(agentId);
    if (!agent || agent.socket.readyState !== WebSocket.OPEN) return false;

    try {
      agent.socket.send(JSON.stringify(message));
      return true;
    } catch (err) {
      logger.warn({ agentId, err }, 'failed to send message to agent');
      return false;
    }
  }

  broadcastToWorkspace(workspaceId: string, message: BridgeMessage): void {
    for (const agent of this.agents.values()) {
      if (agent.workspaceIds.includes(workspaceId)) {
        this.sendToAgent(agent.agentId, message);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Workspace join/leave
  // -----------------------------------------------------------------------

  joinWorkspace(agentId: string, workspaceId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    if (!agent.workspaceIds.includes(workspaceId)) {
      agent.workspaceIds.push(workspaceId);
    }

    // Add to workspace member list
    getWorkspaceService().addAgent(workspaceId, agentId);

    // Publish online event
    getA2AEventBus().publish({
      id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
      type: A2AEventType.AgentOnline,
      timestamp: new Date().toISOString(),
      data: { agentId, isLocal: true },
      workspaceId,
    });

    return true;
  }

  leaveWorkspace(agentId: string, workspaceId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;

    agent.workspaceIds = agent.workspaceIds.filter((id) => id !== workspaceId);

    getA2AEventBus().publish({
      id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
      type: A2AEventType.AgentOffline,
      timestamp: new Date().toISOString(),
      data: { agentId, isLocal: true },
      workspaceId,
    });

    return true;
  }

  // -----------------------------------------------------------------------
  // Handle incoming messages from a connected agent
  // -----------------------------------------------------------------------

  handleMessage(ws: WebSocket, raw: string): void {
    const agentId = this.socketToAgent.get(ws);

    let msg: BridgeMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      logger.warn('invalid JSON from agent bridge connection');
      return;
    }

    switch (msg.type) {
      case 'register': {
        // Registration is handled separately in the WS handler (needs userId from auth)
        // This handles re-registration over an existing connection
        if (agentId) {
          const agent = this.agents.get(agentId);
          if (agent) {
            if (Array.isArray(msg.capabilities)) {
              agent.capabilities = msg.capabilities as string[];
            }
            if (Array.isArray(msg.workspaceIds)) {
              for (const wsId of msg.workspaceIds as string[]) {
                this.joinWorkspace(agentId, wsId);
              }
            }
            this.sendToAgent(agentId, {
              type: 'registered',
              agentId,
              workspaces: agent.workspaceIds,
            });
          }
        }
        break;
      }

      case 'heartbeat': {
        if (agentId) {
          const agent = this.agents.get(agentId);
          if (agent) {
            agent.lastHeartbeat = new Date().toISOString();
            this.recordBridgeHeartbeat(agent);
          }
        }
        break;
      }

      case 'task.progress': {
        if (!agentId) break;
        const bus = getA2AEventBus();
        bus.publish({
          id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
          type: A2AEventType.TaskProgress,
          timestamp: new Date().toISOString(),
          taskId: msg.taskId as string,
          data: {
            agentId,
            progress: msg.progress,
            output: msg.output,
          },
        });
        break;
      }

      case 'task.complete': {
        if (!agentId) break;
        const agent = this.agents.get(agentId);
        if (agent) {
          agent.status = 'idle';
        }
        getA2AEventBus().publish({
          id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
          type: A2AEventType.TaskCompleted,
          timestamp: new Date().toISOString(),
          taskId: msg.taskId as string,
          data: {
            agentId,
            result: msg.result,
          },
        });
        break;
      }

      case 'task.failed': {
        if (!agentId) break;
        const agent = this.agents.get(agentId);
        if (agent) {
          agent.status = 'idle';
        }
        getA2AEventBus().publish({
          id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
          type: A2AEventType.TaskFailed,
          timestamp: new Date().toISOString(),
          taskId: msg.taskId as string,
          data: {
            agentId,
            error: msg.error,
          },
        });
        break;
      }

      case 'channel.message': {
        if (!agentId) break;
        const channelWorkspaceId = msg.channelId as string | undefined;

        // 1. Persist to collaboration service for history
        try {
          const collab = getCollaborationSvc();
          collab.sendMessage({
            threadId: channelWorkspaceId || 'default',
            senderAgentId: agentId,
            text: msg.content as string,
          });
        } catch (err) {
          logger.warn({ agentId, err }, 'failed to persist channel message');
        }

        // 2. Relay to all other agents in the same workspace via WebSocket
        if (channelWorkspaceId) {
          for (const peer of this.agents.values()) {
            if (peer.agentId === agentId) continue; // skip sender
            if (!peer.workspaceIds.includes(channelWorkspaceId)) continue;
            this.sendToAgent(peer.agentId, {
              type: 'channel.message',
              channelId: channelWorkspaceId,
              from: agentId,
              content: msg.content,
            });
          }
        }

        // 3. Publish event for SSE subscribers
        getA2AEventBus().publish({
          id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
          type: A2AEventType.MessageNew,
          timestamp: new Date().toISOString(),
          data: {
            channelId: channelWorkspaceId,
            from: agentId,
            content: msg.content,
          },
          workspaceId: channelWorkspaceId,
        });
        break;
      }

      case 'intent': {
        // Sent by recoder-a2a MCP clients (recoder_send_task tool)
        if (!agentId) break;
        const targetAgentId = msg.target as string;
        if (!targetAgentId) {
          logger.warn({ agentId }, 'intent message missing target agent');
          break;
        }

        const delivered = this.sendToAgent(targetAgentId, {
          type: 'task.assigned',
          taskId: `task_${uuid().replace(/-/g, '').slice(0, 16)}`,
          from: agentId,
          intent: msg.intent || 'execute',
          prompt: msg.task as string,
          context: { source: 'a2a-bridge', from: agentId },
        });

        // Acknowledge back to sender
        this.sendToAgent(agentId, {
          type: 'intent.ack',
          target: targetAgentId,
          delivered,
          reason: delivered ? undefined : 'target agent not connected',
        });

        // Publish event
        getA2AEventBus().publish({
          id: `evt_${uuid().replace(/-/g, '').slice(0, 16)}`,
          type: A2AEventType.TaskSubmitted,
          timestamp: new Date().toISOString(),
          data: {
            from: agentId,
            target: targetAgentId,
            intent: msg.intent,
            task: msg.task,
            delivered,
          },
        });

        logger.info(
          { from: agentId, target: targetAgentId, delivered, intent: msg.intent },
          'intent routed via bridge',
        );
        break;
      }

      case 'join_workspace': {
        if (agentId && msg.workspaceId) {
          this.joinWorkspace(agentId, msg.workspaceId as string);
          this.sendToAgent(agentId, {
            type: 'workspace.joined',
            workspaceId: msg.workspaceId,
          });
        }
        break;
      }

      case 'leave_workspace': {
        if (agentId && msg.workspaceId) {
          this.leaveWorkspace(agentId, msg.workspaceId as string);
          this.sendToAgent(agentId, {
            type: 'workspace.left',
            workspaceId: msg.workspaceId,
          });
        }
        break;
      }

      default:
        logger.debug({ type: msg.type, agentId }, 'unknown bridge message type');
    }
  }

  // -----------------------------------------------------------------------
  // Heartbeat sweep
  // -----------------------------------------------------------------------

  private startHeartbeatSweep(): void {
    // Every 60s, check for agents that haven't sent a heartbeat in 90s
    this.heartbeatInterval = setInterval(() => {
      const cutoff = Date.now() - 90_000;
      for (const [agentId, agent] of this.agents) {
        const lastBeat = new Date(agent.lastHeartbeat).getTime();
        if (lastBeat < cutoff) {
          logger.info({ agentId }, 'agent timed out, disconnecting');
          try {
            agent.socket.close(1000, 'Heartbeat timeout');
          } catch { /* ignore */ }
          this.unregisterAgent(agentId);
        }
      }
    }, 60_000);
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  get connectionCount(): number {
    return this.agents.size;
  }

  getStats(): {
    totalConnections: number;
    byWorkspace: Record<string, number>;
    byStatus: Record<string, number>;
  } {
    const byWorkspace: Record<string, number> = {};
    const byStatus: Record<string, number> = {};

    for (const agent of this.agents.values()) {
      byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;
      for (const wsId of agent.workspaceIds) {
        byWorkspace[wsId] = (byWorkspace[wsId] || 0) + 1;
      }
    }

    return {
      totalConnections: this.agents.size,
      byWorkspace,
      byStatus,
    };
  }

  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    for (const agent of this.agents.values()) {
      try {
        agent.socket.close(1001, 'Server shutting down');
      } catch { /* ignore */ }
    }
    this.agents.clear();
    this.socketToAgent.clear();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: AgentBridgeService | null = null;

export function getAgentBridgeService(): AgentBridgeService {
  if (!_instance) {
    _instance = new AgentBridgeService();
  }
  return _instance;
}

export function resetAgentBridgeService(): void {
  if (_instance) {
    _instance.shutdown();
  }
  _instance = null;
}
