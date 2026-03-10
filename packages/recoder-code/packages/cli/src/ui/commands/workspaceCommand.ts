/**
 * /workspace slash command - Manage A2A workspace connections
 *
 * Subcommands:
 *   /workspace list    - List available workspaces
 *   /workspace join <id> - Connect to a workspace via AgentBridgeService
 *   /workspace leave   - Disconnect from current workspace
 *   /workspace status  - Show connection status and online agents
 */

import type { SlashCommand, MessageActionReturn } from './types.js';
import { CommandKind } from './types.js';
import { RecoderAuthService } from '../../services/RecoderAuthService.js';
import { AgentBridgeService } from '../../services/AgentBridgeService.js';

const DOCKER_BACKEND_URL = process.env['DOCKER_BACKEND_URL'] || 'http://localhost:3100';

// Singleton instances
const authService = new RecoderAuthService();
let bridgeInstance: AgentBridgeService | null = null;

function getBridge(): AgentBridgeService {
  if (!bridgeInstance) {
    bridgeInstance = new AgentBridgeService(() => authService.getAccessToken());
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

export const workspaceCommand: SlashCommand = {
  name: 'workspace',
  description: 'Manage A2A workspace connections',
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
          const response = await fetch(`${DOCKER_BACKEND_URL}/api/a2a/workspaces`, {
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
                '│  A2A Workspaces                                │',
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
            '│  A2A Workspaces                                │',
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
                '│  Workspace Connected                           │',
                '├────────────────────────────────────────────────┤',
                `│  Workspace: ${workspaceId.substring(0, 35).padEnd(35)}│`,
                `│  Agent ID:  ${bridge.getAgentId().substring(0, 35).padEnd(35)}│`,
                '│  Status:    Online                             │',
                '├────────────────────────────────────────────────┤',
                '│  You will receive task assignments in          │',
                '│  real-time from the workspace coordinator.     │',
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
            '│  Workspace Disconnected                        │',
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
              '│  Workspace Status                              │',
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
          '│  Workspace Status                              │',
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
              `${DOCKER_BACKEND_URL}/api/a2a/workspaces/${encodeURIComponent(workspaceId)}/agents`,
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
        `A2A Workspace (${statusLine})`,
        '',
        'Commands:',
        '  /workspace list       - List available workspaces',
        '  /workspace join <id>  - Connect to a workspace',
        '  /workspace leave      - Disconnect from workspace',
        '  /workspace status     - Show connection status',
      ].join('\n'),
    };
  },
};
