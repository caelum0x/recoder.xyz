/**
 * MCP Server Management Panel
 * Allows users to view, enable/disable, and configure MCP servers
 */

import { useState, useEffect } from 'react';
import { Server, Circle, Settings, RefreshCw, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';

interface MCPServer {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: any;
  }>;
  status: 'active' | 'inactive' | 'error';
  errorMessage?: string;
}

interface MCPStats {
  totalServers: number;
  enabledServers: number;
  totalTools: number;
}

export function MCPServerPanel() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [stats, setStats] = useState<MCPStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);

  const loadServers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/mcp?action=list');
      const data = await response.json();
      
      if (data.success) {
        setServers(data.servers);
        setStats(data.stats);
      } else {
        toast.error('Failed to load MCP servers');
      }
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
      toast.error('Error loading MCP servers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const toggleServer = async (serverId: string, enabled: boolean) => {
    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: enabled ? 'enable' : 'disable',
          serverId,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(`Server ${enabled ? 'enabled' : 'disabled'} successfully`);
        loadServers();
      } else {
        toast.error(data.error || 'Failed to update server');
      }
    } catch (error) {
      console.error('Failed to toggle server:', error);
      toast.error('Error updating server');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Circle className="w-4 h-4 text-gray-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-bolt-elements-textSecondary">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading MCP servers...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-bolt-elements-background-depth-1">
      {/* Header */}
      <div className="border-b border-bolt-elements-borderColor p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg">
              <Server className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
                MCP Servers
              </h2>
              <p className="text-sm text-bolt-elements-textSecondary">
                Model Context Protocol integration
              </p>
            </div>
          </div>
          <button
            onClick={loadServers}
            className="p-2 hover:bg-bolt-elements-background-depth-2 rounded-lg transition-colors"
            title="Refresh servers"
          >
            <RefreshCw className="w-4 h-4 text-bolt-elements-textSecondary" />
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-bolt-elements-background-depth-2 rounded-lg p-3">
              <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                {stats.totalServers}
              </div>
              <div className="text-xs text-bolt-elements-textSecondary">Total Servers</div>
            </div>
            <div className="bg-bolt-elements-background-depth-2 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-500">
                {stats.enabledServers}
              </div>
              <div className="text-xs text-bolt-elements-textSecondary">Enabled</div>
            </div>
            <div className="bg-bolt-elements-background-depth-2 rounded-lg p-3">
              <div className="text-2xl font-bold text-bolt-elements-textPrimary">
                {stats.totalTools}
              </div>
              <div className="text-xs text-bolt-elements-textSecondary">Available Tools</div>
            </div>
          </div>
        )}
      </div>

      {/* Server List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textSecondary">
            <AlertCircle className="w-12 h-12 mb-4" />
            <p>No MCP servers configured</p>
            <p className="text-sm mt-2">Configure servers in your .dev.vars file</p>
          </div>
        ) : (
          servers.map((server) => (
            <div
              key={server.id}
              className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-4 hover:border-bolt-elements-borderColorHover transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className="pt-1">{getStatusIcon(server.status)}</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-bolt-elements-textPrimary">
                        {server.name}
                      </h3>
                      {server.enabled && (
                        <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">
                          Enabled
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-bolt-elements-textSecondary mb-2">
                      {server.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-bolt-elements-textTertiary">
                      <span>{server.tools.length} tools available</span>
                      {server.errorMessage && (
                        <span className="text-red-400">Error: {server.errorMessage}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setSelectedServer(selectedServer === server.id ? null : server.id)
                    }
                    className="p-2 hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
                    title="View tools"
                  >
                    <Settings className="w-4 h-4 text-bolt-elements-textSecondary" />
                  </button>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={server.enabled}
                      onChange={(e) => toggleServer(server.id, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-bolt-elements-background-depth-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>

              {/* Tools List */}
              {selectedServer === server.id && server.tools.length > 0 && (
                <div className="mt-3 pt-3 border-t border-bolt-elements-borderColor">
                  <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2">
                    Available Tools:
                  </h4>
                  <div className="space-y-2">
                    {server.tools.map((tool, index) => (
                      <div
                        key={index}
                        className="bg-bolt-elements-background-depth-3 rounded p-3"
                      >
                        <div className="font-mono text-sm text-bolt-elements-textPrimary">
                          {tool.name}
                        </div>
                        <div className="text-xs text-bolt-elements-textSecondary mt-1">
                          {tool.description}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
