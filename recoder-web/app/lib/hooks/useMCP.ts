import { useState, useEffect, useCallback } from 'react';
import { mcpClient, type MCPServerConfig, type MCPTool } from '../mcp/client';

const STORAGE_KEY = 'recoder-mcp-servers';

// Default MCP servers
const DEFAULT_SERVERS: MCPServerConfig[] = [
  {
    id: 'eternos',
    name: 'Eternos (72 tools)',
    command: 'npx',
    args: ['-y', 'recoder-mcp-eternos'],
    enabled: true,
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
    enabled: false,
  },
  {
    id: 'brave-search',
    name: 'Brave Search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    enabled: false,
  },
  {
    id: 'github',
    name: 'GitHub',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    enabled: false,
  },
];

export function useMCP() {
  const [servers, setServers] = useState<MCPServerConfig[]>([]);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load servers from storage
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

  // Save servers to storage
  const saveServers = useCallback((newServers: MCPServerConfig[]) => {
    setServers(newServers);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newServers));
  }, []);

  // Connect to enabled servers
  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const enabledServers = servers.filter(s => s.enabled);
      const discoveredTools = await mcpClient.connectAll(enabledServers);
      setTools(discoveredTools);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [servers]);

  // Disconnect all
  const disconnect = useCallback(async () => {
    await mcpClient.disconnectAll();
    setTools([]);
  }, []);

  // Add server
  const addServer = useCallback((server: Omit<MCPServerConfig, 'id'>) => {
    const newServer: MCPServerConfig = {
      ...server,
      id: `server-${Date.now()}`,
    };
    saveServers([...servers, newServer]);
  }, [servers, saveServers]);

  // Update server
  const updateServer = useCallback((id: string, updates: Partial<MCPServerConfig>) => {
    saveServers(servers.map(s => s.id === id ? { ...s, ...updates } : s));
  }, [servers, saveServers]);

  // Remove server
  const removeServer = useCallback(async (id: string) => {
    await mcpClient.disconnect(id);
    saveServers(servers.filter(s => s.id !== id));
    setTools(tools.filter(t => t.serverId !== id));
  }, [servers, tools, saveServers]);

  // Toggle server
  const toggleServer = useCallback((id: string) => {
    saveServers(servers.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  }, [servers, saveServers]);

  // Call tool
  const callTool = useCallback(async (toolName: string, args: any) => {
    return mcpClient.callTool(toolName, args);
  }, []);

  // Get tools for AI
  const getToolsForAI = useCallback(() => {
    return mcpClient.getToolsForAI();
  }, []);

  const getToolsPrompt = useCallback(() => {
    return mcpClient.getToolsPrompt();
  }, []);

  return {
    servers,
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
    connectedServers: mcpClient.getConnectedServers(),
  };
}
