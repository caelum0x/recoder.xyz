import { useState, useEffect } from 'react';

interface MCPTool {
  serverId: string;
  name: string;
  description?: string;
  inputSchema: any;
}

export function useMCPTools() {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTools();
  }, []);

  async function loadTools() {
    try {
      const res = await fetch('/api/mcp/tools');
      const data = await res.json();
      setTools(data.tools || []);
    } catch (error) {
      console.error('Failed to load tools:', error);
    } finally {
      setLoading(false);
    }
  }

  async function callTool(serverId: string, toolName: string, args: any) {
    const res = await fetch('/api/mcp/tools/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverId, toolName, args }),
    });
    return res.json();
  }

  return { tools, loading, callTool, refresh: loadTools };
}
