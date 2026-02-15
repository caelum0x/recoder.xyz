/**
 * MCP Hook - Manages MCP server connections via Docker Backend
 *
 * This hook communicates with the docker-backend to start/stop MCP servers
 * that run inside user containers. Servers are spawned on-demand and
 * auto-killed after 5 minutes of inactivity.
 */

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { workbenchStore } from '../stores/workbench';
import { dockerGet, dockerPost } from '../services/docker-api';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MCPHook');

export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  serverId: string;
}

interface CatalogServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  preinstalled: boolean;
  requiresApiKey: boolean;
  requiredEnvVars?: string[];
}

const STORAGE_KEY = 'recoder-mcp-servers';

// Default servers (shown in settings, fetched from catalog on load)
const DEFAULT_SERVERS: MCPServerConfig[] = [
  {
    id: 'filesystem',
    name: 'Filesystem',
    command: 'node',
    args: [],
    enabled: true,
  },
  {
    id: 'memory',
    name: 'Memory',
    command: 'node',
    args: [],
    enabled: false,
  },
];

export function useMCP() {
  const projectId = useStore(workbenchStore.projectId);
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [catalog, setCatalog] = useState<CatalogServer[]>([]);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [connectedServers, setConnectedServers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load servers from storage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setServers(JSON.parse(saved));
      } catch {
        setServers(DEFAULT_SERVERS);
      }
    } else {
      setServers(DEFAULT_SERVERS);
    }
  }, []);

  // Load catalog from docker-backend
  useEffect(() => {
    async function loadCatalog() {
      try {
        const data = await dockerGet<{ servers?: CatalogServer[] }>('/api/mcp/catalog');
        setCatalog(data.servers || []);
      } catch (err) {
        logger.error('[MCP] Failed to load catalog:', err);
      }
    }
    loadCatalog();
  }, []);

  // Load running servers status when projectId changes
  useEffect(() => {
    if (!projectId) return;

    async function loadStatus() {
      try {
        const data = await dockerGet<{ servers?: any[] }>(`/api/mcp/${projectId}/servers`);
        const running = (data.servers || []).filter((s: any) => s.status === 'running');
        setConnectedServers(running.map((s: any) => s.id));

        // Collect all tools from running servers
        const allTools: MCPTool[] = [];
        for (const server of running) {
          allTools.push(...(server.tools || []));
        }
        setTools(allTools);
      } catch (err) {
        logger.error('[MCP] Failed to load status:', err);
      }
    }
    loadStatus();
  }, [projectId]);

  // Save servers to storage
  const saveServers = useCallback((newServers: MCPServerConfig[]) => {
    setServers(newServers);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newServers));
  }, []);

  // Connect to enabled servers
  const connect = useCallback(async () => {
    if (!projectId) {
      setError('No project selected');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const enabledServers = servers.filter(s => s.enabled);
      const allTools: MCPTool[] = [];
      const connected: string[] = [];

      for (const server of enabledServers) {
        try {
          const data = await dockerPost<{ success?: boolean; tools?: MCPTool[] }>(`/api/mcp/${projectId}/start`, {
            serverId: server.id,
            config: {
              name: server.name,
              command: server.command,
              args: server.args,
              env: server.env,
            },
          });

          if (data.success && data.tools) {
            allTools.push(...data.tools);
            connected.push(server.id);
            logger.info(`[MCP] Connected to ${server.name} with ${data.tools.length} tools`);
          }
        } catch (err: any) {
          logger.error(`[MCP] Error starting ${server.name}:`, err.message);
        }
      }

      setTools(allTools);
      setConnectedServers(connected);

      if (connected.length === 0 && enabledServers.length > 0) {
        setError('Failed to connect to any MCP servers');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, servers]);

  // Disconnect all servers
  const disconnect = useCallback(async () => {
    if (!projectId) return;

    try {
      await dockerPost(`/api/mcp/${projectId}/stop-all`, {});
      setTools([]);
      setConnectedServers([]);
    } catch (err: any) {
      logger.error('[MCP] Error disconnecting:', err.message);
    }
  }, [projectId]);

  // Add server (optionally with a specific ID)
  const addServer = useCallback((server: Omit<MCPServerConfig, 'id'> & { id?: string }) => {
    const existingId = server.id;
    if (existingId && servers.some(s => s.id === existingId)) {
      logger.info(`Server ${existingId} already exists, skipping`);
      return;
    }

    const newServer: MCPServerConfig = {
      ...server,
      id: server.id || `server-${Date.now()}`,
    };
    saveServers([...servers, newServer]);
  }, [servers, saveServers]);

  // Update server
  const updateServer = useCallback((id: string, updates: Partial<MCPServerConfig>) => {
    saveServers(servers.map(s => s.id === id ? { ...s, ...updates } : s));
  }, [servers, saveServers]);

  // Remove server
  const removeServer = useCallback(async (id: string) => {
    if (projectId && connectedServers.includes(id)) {
      try {
        await dockerPost(`/api/mcp/${projectId}/stop`, { serverId: id });
      } catch (err) {
        logger.error('[MCP] Error stopping server:', err);
      }
    }
    saveServers(servers.filter(s => s.id !== id));
    setTools(tools.filter(t => t.serverId !== id));
    setConnectedServers(connectedServers.filter(s => s !== id));
  }, [projectId, servers, tools, connectedServers, saveServers]);

  // Toggle server enabled state
  const toggleServer = useCallback((id: string) => {
    saveServers(servers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }, [servers, saveServers]);

  // Call a tool on an MCP server
  const callTool = useCallback(async (toolName: string, args: any) => {
    if (!projectId) {
      throw new Error('No project selected');
    }

    // Parse serverId from tool name (format: serverId__toolName or just toolName)
    let serverId: string;
    let actualToolName: string;

    if (toolName.includes('__')) {
      [serverId, actualToolName] = toolName.split('__', 2);
    } else {
      // Find which server has this tool
      const tool = tools.find(t => t.name === toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }
      serverId = tool.serverId;
      actualToolName = toolName;
    }

    const data = await dockerPost<{ result?: any }>(`/api/mcp/${projectId}/call`, {
      serverId,
      toolName: actualToolName,
      args,
    });

    return data.result;
  }, [projectId, tools]);

  // Get tools formatted for AI (OpenAI/Anthropic function calling format)
  const getToolsForAI = useCallback(() => {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: `${tool.serverId}__${tool.name}`,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }, [tools]);

  // Get tools description for system prompt
  const getToolsPrompt = useCallback(() => {
    if (tools.length === 0) return '';

    return `
## Available MCP Tools
You have access to these tools via MCP servers:

${tools.map(t => `- **${t.name}** (${t.serverId}): ${t.description}`).join('\n')}

To use a tool, respond with a tool_use block specifying the tool name and arguments.
`;
  }, [tools]);

  return {
    servers,
    catalog,
    tools,
    loading,
    error,
    connect,
    disconnect,
    addServer,
    updateServer,
    removeServer,
    toggleServer,
    callTool,
    getToolsForAI,
    getToolsPrompt,
    connectedServers,
  };
}
