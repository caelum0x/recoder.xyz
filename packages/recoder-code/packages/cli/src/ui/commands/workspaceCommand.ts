/**
 * /workspace slash command - Manage Recoder Space connections
 *
 * Subcommands:
 *   /workspace list    - List available workspaces
 *   /workspace join <id> - Connect to a workspace via AgentBridgeService
 *   /workspace create <prompt> - Create a task in the current Recoder Space
 *   /workspace leave   - Disconnect from current workspace
 *   /workspace status  - Show connection status and online agents
 *   /workspace context - Show the Recoder Space context package
 */

import type { SlashCommand, MessageActionReturn } from './types.js';
import { CommandKind } from './types.js';
import { RecoderAuthService } from '../../services/RecoderAuthService.js';
import { AgentBridgeService } from '../../services/AgentBridgeService.js';
import { installRecoderSpaceAutoWorker } from '../../services/RecoderSpaceAutoWorker.js';
import { randomUUID } from 'node:crypto';

const DOCKER_BACKEND_URL = process.env['DOCKER_BACKEND_URL'] || 'http://localhost:3100';

// Singleton instances
const authService = new RecoderAuthService();
let bridgeInstance: AgentBridgeService | null = null;

function getBridge(): AgentBridgeService {
  if (!bridgeInstance) {
    bridgeInstance = new AgentBridgeService(() => authService.getAccessToken());
    installRecoderSpaceAutoWorker(bridgeInstance, () => authService.getAccessToken());
  }
  return bridgeInstance;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  description?: string;
  agentCount?: number;
  channelCount?: number;
  createdAt?: string;
}

interface WorkspaceAgentInfo {
  agentId: string;
  status: string;
  isLocal: boolean;
  capabilities: string[];
}

interface WorkspaceContextPackage {
  contextVersion: string;
  workspace: {
    workspaceId: string;
    name: string;
    projectId: string;
  };
  summary?: {
    totalAgents?: number;
    onlineAgents?: number;
    totalTasks?: number;
    activeTasks?: number;
    pendingApprovals?: number;
    activeHandoffs?: number;
  };
  recentTasks?: Array<{
    prompt?: string;
    state?: string;
    assignee_agent_id?: string;
  }>;
  pendingApprovals?: Array<{
    action?: string;
    requester?: string;
    target?: string;
  }>;
}

export const workspaceCommand: SlashCommand = {
  name: 'workspace',
  description: 'Manage Recoder Space connections',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    // -----------------------------------------------------------------------
    // /workspace list
    // -----------------------------------------------------------------------
    {
      name: 'list',
      description: 'List available workspaces',
      kind: CommandKind.BUILT_IN,
      action: async (): Promise<MessageActionReturn> => {
        const token = await authService.getAccessToken();
        if (!token) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Not authenticated. Please run /recoder-login first.',
          };
        }

        try {
          const response = await fetch(`${DOCKER_BACKEND_URL}/api/spaces`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => 'Unknown error');
            return {
              type: 'message',
              messageType: 'error',
              content: `Failed to fetch workspaces (${response.status}): ${errText}`,
            };
          }

          const data = await response.json();
          const workspaces: WorkspaceInfo[] = data.workspaces || data.data || data || [];

          if (!Array.isArray(workspaces) || workspaces.length === 0) {
            return {
              type: 'message',
              messageType: 'info',
              content: [
                '┌────────────────────────────────────────────────┐',
                '│  Recoder Spaces                                │',
                '├────────────────────────────────────────────────┤',
                '│  No workspaces found.                          │',
                '│                                                │',
                '│  Create one from the recoder.xyz dashboard     │',
                '│  or via the backend API.                       │',
                '└────────────────────────────────────────────────┘',
              ].join('\n'),
            };
          }

          const lines: string[] = [
            '┌────────────────────────────────────────────────┐',
            '│  Recoder Spaces                                │',
            '├────────────────────────────────────────────────┤',
          ];

          for (const ws of workspaces) {
            const agents = ws.agentCount !== undefined ? `${ws.agentCount} agents` : '';
            const channels = ws.channelCount !== undefined ? `${ws.channelCount} channels` : '';
            const meta = [agents, channels].filter(Boolean).join(', ');

            lines.push(`│  ${ws.name.padEnd(45)}│`);
            lines.push(`│    ID: ${ws.id.padEnd(39)}│`);
            if (ws.description) {
              lines.push(`│    ${ws.description.substring(0, 43).padEnd(45)}│`);
            }
            if (meta) {
              lines.push(`│    ${meta.padEnd(45)}│`);
            }
            lines.push('│                                                │');
          }

          lines.push('├────────────────────────────────────────────────┤');
          lines.push(`│  Total: ${String(workspaces.length).padEnd(38)}│`);
          lines.push('│  Join with: /workspace join <id>               │');
          lines.push('└────────────────────────────────────────────────┘');

          return { type: 'message', messageType: 'info', content: lines.join('\n') };
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to list workspaces: ${msg}`,
          };
        }
      },
    },

    // -----------------------------------------------------------------------
    // /workspace join <id>
    // -----------------------------------------------------------------------
    {
      name: 'join',
      description: 'Connect to a workspace (e.g., /workspace join <workspace-id>)',
      kind: CommandKind.BUILT_IN,
      action: async (_context, args): Promise<MessageActionReturn> => {
        if (!args?.trim()) {
          return {
            type: 'message',
            messageType: 'info',
            content: [
              'Join Workspace',
              '',
              'Usage: /workspace join <workspace-id>',
              '',
              'Run /workspace list to see available workspace IDs.',
            ].join('\n'),
          };
        }

        const workspaceId = args.trim();
        const bridge = getBridge();

        if (bridge.isConnected() && bridge.getWorkspaceId() === workspaceId) {
          return {
            type: 'message',
            messageType: 'info',
            content: `Already connected to workspace: ${workspaceId}`,
          };
        }

        // Disconnect from any existing workspace first
        if (bridge.isConnected()) {
          bridge.disconnect();
        }

        try {
          await bridge.connect(workspaceId, ['code', 'review', 'test']);

          if (bridge.isConnected()) {
            return {
              type: 'message',
              messageType: 'info',
              content: [
                '┌────────────────────────────────────────────────┐',
                '│  Recoder Space Connected                       │',
                '├────────────────────────────────────────────────┤',
                `│  Workspace: ${workspaceId.substring(0, 35).padEnd(35)}│`,
                `│  Agent ID:  ${bridge.getAgentId().substring(0, 35).padEnd(35)}│`,
                '│  Status:    Online                             │',
                '├────────────────────────────────────────────────┤',
                '│  You will receive task assignments in          │',
                '│  real-time from the Recoder Space.             │',
                '│                                                │',
                '│  /workspace status  - Check connection         │',
                '│  /workspace leave   - Disconnect               │',
                '└────────────────────────────────────────────────┘',
              ].join('\n'),
            };
          } else {
            return {
              type: 'message',
              messageType: 'error',
              content: [
                'Failed to connect to workspace.',
                '',
                'Possible reasons:',
                '  - docker-backend is not running',
                '  - Workspace ID does not exist',
                '  - Authentication token is invalid',
                '',
                'Check your connection and try again.',
              ].join('\n'),
            };
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to join workspace: ${msg}`,
          };
        }
      },
    },

    // -----------------------------------------------------------------------
    // /workspace create <prompt>
    // -----------------------------------------------------------------------
    {
      name: 'create',
      description: 'Create a task in the current Recoder Space',
      kind: CommandKind.BUILT_IN,
      action: async (_context, args): Promise<MessageActionReturn> => {
        const token = await authService.getAccessToken();
        if (!token) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Not authenticated. Please run /recoder-login first.',
          };
        }

        const prompt = args?.trim();
        if (!prompt) {
          return {
            type: 'message',
            messageType: 'info',
            content: [
              'Create Task',
              '',
              'Usage: /workspace create <task prompt>',
              '',
              'Example:',
              '  /workspace create Add pricing page with three tiers and FAQ',
            ].join('\n'),
          };
        }

        const bridge = getBridge();
        const workspaceId = bridge.getWorkspaceId();
        if (!workspaceId) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Not connected to a Recoder Space. Run /workspace join <id> first.',
          };
        }

        const threadId = `thread_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

        try {
          const response = await fetch(`${DOCKER_BACKEND_URL}/api/a2a/tasks`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              workspace_id: workspaceId,
              thread_id: threadId,
              requester: {
                agent_id: bridge.getAgentId(),
                platform: 'custom',
                name: 'Recoder Code CLI',
              },
              payload: {
                kind: 'text',
                text: prompt,
              },
              auto_route: true,
              metadata: {
                source: 'recoder-code-cli',
                createdFrom: 'workspace.create',
              },
            }),
          });

          if (!response.ok) {
            const errText = await response.text().catch(() => 'Unknown error');
            return {
              type: 'message',
              messageType: 'error',
              content: `Failed to create task (${response.status}): ${errText}`,
            };
          }

          const raw = await response.json();
          const task = raw.data || raw;
          return {
            type: 'message',
            messageType: 'info',
            content: [
              '┌────────────────────────────────────────────────┐',
              '│  Recoder Space Task Created                    │',
              '├────────────────────────────────────────────────┤',
              `│  Workspace: ${workspaceId.substring(0, 34).padEnd(34)}│`,
              `│  Task ID:   ${String(task.id || 'unknown').substring(0, 34).padEnd(34)}│`,
              `│  State:     ${String(task.state || 'submitted').substring(0, 34).padEnd(34)}│`,
              '├────────────────────────────────────────────────┤',
              `│  ${prompt.substring(0, 46).padEnd(46)}│`,
              '│                                                │',
              '│  The Space can now route or dispatch this      │',
              '│  task to an available agent.                   │',
              '└────────────────────────────────────────────────┘',
            ].join('\n'),
          };
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to create task: ${msg}`,
          };
        }
      },
    },

    // -----------------------------------------------------------------------
    // /workspace context
    // -----------------------------------------------------------------------
    {
      name: 'context',
      description: 'Show the structured context package for the current or specified Recoder Space',
      kind: CommandKind.BUILT_IN,
      action: async (_context, args): Promise<MessageActionReturn> => {
        const token = await authService.getAccessToken();
        if (!token) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Not authenticated. Please run /recoder-login first.',
          };
        }

        const bridge = getBridge();
        const workspaceId = args?.trim() || bridge.getWorkspaceId();
        if (!workspaceId) {
          return {
            type: 'message',
            messageType: 'info',
            content: [
              'Recoder Space Context',
              '',
              'Usage: /workspace context [workspace-id]',
              '',
              'Connect to a space first with /workspace join <id>,',
              'or pass a workspace ID explicitly.',
            ].join('\n'),
          };
        }

        try {
          const response = await fetch(
            `${DOCKER_BACKEND_URL}/api/spaces/${encodeURIComponent(workspaceId)}/context`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            },
          );

          if (!response.ok) {
            const errText = await response.text().catch(() => 'Unknown error');
            return {
              type: 'message',
              messageType: 'error',
              content: `Failed to fetch space context (${response.status}): ${errText}`,
            };
          }

          const raw = await response.json();
          const context: WorkspaceContextPackage = raw.data || raw;
          const summary = context.summary || {};
          const recentTasks = context.recentTasks || [];
          const pendingApprovals = context.pendingApprovals || [];

          const lines: string[] = [
            '┌────────────────────────────────────────────────┐',
            '│  Recoder Space Context                         │',
            '├────────────────────────────────────────────────┤',
            `│  Name: ${String(context.workspace?.name || workspaceId).substring(0, 40).padEnd(40)}│`,
            `│  ID:   ${String(context.workspace?.workspaceId || workspaceId).substring(0, 40).padEnd(40)}│`,
            `│  Ver:  ${String(context.contextVersion || 'unknown').substring(0, 40).padEnd(40)}│`,
            '├────────────────────────────────────────────────┤',
            `│  Agents: ${String(summary.totalAgents ?? 0).padEnd(4)} Online: ${String(summary.onlineAgents ?? 0).padEnd(5)} Tasks: ${String(summary.totalTasks ?? 0).padEnd(6)}│`,
            `│  Active: ${String(summary.activeTasks ?? 0).padEnd(4)} Approvals: ${String(summary.pendingApprovals ?? 0).padEnd(3)} Handoffs: ${String(summary.activeHandoffs ?? 0).padEnd(3)}│`,
          ];

          if (recentTasks.length > 0) {
            lines.push('├────────────────────────────────────────────────┤');
            lines.push('│  Recent Tasks                                  │');
            lines.push('│                                                │');
            for (const task of recentTasks.slice(0, 3)) {
              const prompt = String(task.prompt || '').substring(0, 31);
              const state = String(task.state || '').substring(0, 10);
              const assignee = String(task.assignee_agent_id || '').substring(0, 44);
              lines.push(`│  ${prompt.padEnd(31)} ${state.padEnd(10)}│`);
              if (assignee) {
                lines.push(`│    -> ${assignee.padEnd(40)}│`);
              }
            }
          }

          if (pendingApprovals.length > 0) {
            lines.push('├────────────────────────────────────────────────┤');
            lines.push('│  Pending Approvals                             │');
            lines.push('│                                                │');
            for (const approval of pendingApprovals.slice(0, 2)) {
              const action = String(approval.action || '').substring(0, 18);
              const requester = String(approval.requester || '').substring(0, 10);
              const target = String(approval.target || '').substring(0, 10);
              lines.push(`│  ${action.padEnd(18)} ${requester.padEnd(10)} ${target.padEnd(10)}│`);
            }
          }

          lines.push('└────────────────────────────────────────────────┘');
          return { type: 'message', messageType: 'info', content: lines.join('\n') };
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          return {
            type: 'message',
            messageType: 'error',
            content: `Failed to fetch space context: ${msg}`,
          };
        }
      },
    },

    // -----------------------------------------------------------------------
    // /workspace leave
    // -----------------------------------------------------------------------
    {
      name: 'leave',
      description: 'Disconnect from current workspace',
      kind: CommandKind.BUILT_IN,
      action: async (): Promise<MessageActionReturn> => {
        const bridge = getBridge();

        if (!bridge.isConnected()) {
          return {
            type: 'message',
            messageType: 'info',
            content: 'Not connected to any workspace.',
          };
        }

        const workspaceId = bridge.getWorkspaceId() || 'unknown';
        bridge.disconnect();

        return {
          type: 'message',
          messageType: 'info',
          content: [
            '┌────────────────────────────────────────────────┐',
            '│  Recoder Space Disconnected                    │',
            '├────────────────────────────────────────────────┤',
            `│  Left: ${workspaceId.substring(0, 40).padEnd(40)}│`,
            '│  Status: Offline                               │',
            '│                                                │',
            '│  Reconnect with: /workspace join <id>          │',
            '└────────────────────────────────────────────────┘',
          ].join('\n'),
        };
      },
    },

    // -----------------------------------------------------------------------
    // /workspace status
    // -----------------------------------------------------------------------
    {
      name: 'status',
      description: 'Show current connection status and online agents',
      kind: CommandKind.BUILT_IN,
      action: async (): Promise<MessageActionReturn> => {
        const bridge = getBridge();

        if (!bridge.isConnected()) {
          return {
            type: 'message',
            messageType: 'info',
            content: [
              '┌────────────────────────────────────────────────┐',
              '│  Recoder Space Status                          │',
              '├────────────────────────────────────────────────┤',
              '│  Status:    Disconnected                       │',
              `│  Agent ID:  ${bridge.getAgentId().substring(0, 35).padEnd(35)}│`,
              '│                                                │',
              '│  Connect with: /workspace join <id>            │',
              '└────────────────────────────────────────────────┘',
            ].join('\n'),
          };
        }

        const workspaceId = bridge.getWorkspaceId() || 'none';
        const lines: string[] = [
          '┌────────────────────────────────────────────────┐',
          '│  Recoder Space Status                          │',
          '├────────────────────────────────────────────────┤',
          '│  Status:    Connected                          │',
          `│  Workspace: ${workspaceId.substring(0, 35).padEnd(35)}│`,
          `│  Agent ID:  ${bridge.getAgentId().substring(0, 35).padEnd(35)}│`,
        ];

        // Try to fetch online agents from the backend
        const token = await authService.getAccessToken();
        if (token) {
          try {
            const response = await fetch(
              `${DOCKER_BACKEND_URL}/api/spaces/${encodeURIComponent(workspaceId)}/agents`,
              {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              },
            );

            if (response.ok) {
              const data = await response.json();
              const agents: WorkspaceAgentInfo[] = data.agents || data.data || [];

              if (agents.length > 0) {
                lines.push('├────────────────────────────────────────────────┤');
                lines.push(`│  Online Agents (${String(agents.length).padEnd(30)}│`);
                lines.push('│                                                │');

                for (const agent of agents) {
                  const local = agent.isLocal ? ' (local)' : '';
                  const caps = agent.capabilities.length > 0
                    ? ` [${agent.capabilities.join(', ')}]`
                    : '';
                  const label = `${agent.agentId}${local}${caps}`;
                  lines.push(`│    ${label.substring(0, 44).padEnd(44)}│`);
                }
              }
            }
          } catch {
            // Silently skip agent listing on error
          }
        }

        lines.push('├────────────────────────────────────────────────┤');
        lines.push('│  /workspace leave  - Disconnect                │');
        lines.push('└────────────────────────────────────────────────┘');

        return { type: 'message', messageType: 'info', content: lines.join('\n') };
      },
    },
  ],

  // -------------------------------------------------------------------------
  // Default action (no subcommand)
  // -------------------------------------------------------------------------
  action: async (): Promise<MessageActionReturn> => {
    const bridge = getBridge();
    const connected = bridge.isConnected();
    const wsId = bridge.getWorkspaceId();

    const statusLine = connected
      ? `Connected to: ${wsId}`
      : 'Disconnected';

    return {
      type: 'message',
      messageType: 'info',
      content: [
        `Recoder Space (${statusLine})`,
        '',
        'Commands:',
        '  /workspace list       - List available workspaces',
        '  /workspace join <id>  - Connect to a workspace',
        '  /workspace create ... - Create a task in the current space',
        '  /workspace context    - Show space context',
        '  /workspace leave      - Disconnect from workspace',
        '  /workspace status     - Show connection status',
      ].join('\n'),
    };
  },
};
