/**
 * MCP Tools Panel
 * Shows available MCP tools and allows manual execution
 */

import { useState, useEffect } from 'react';
import { Wrench, Server, Play, RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';

interface MCPTool {
  name: string;
  serverId: string;
  description: string;
  parameters: {
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }[];
}

interface MCPServer {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error';
  toolCount: number;
}

export default function MCPToolsPanel() {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<MCPTool | null>(null);
  const [parameters, setParameters] = useState<Record<string, any>>({});

  useEffect(() => {
    loadMCPData();
  }, []);

  const loadMCPData = async () => {
    setLoading(true);
    try {
      // Load servers
      const serversRes = await fetch('/api/mcp?action=list-servers');
      const serversData = (await serversRes.json()) as any;
      if (serversData.success) {
        setServers(serversData.data);
      }

      // Load tools
      const toolsRes = await fetch('/api/mcp?action=list-tools');
      const toolsData = (await toolsRes.json()) as any;
      if (toolsData.success) {
        setTools(toolsData.data);
      }
    } catch (error: any) {
      console.error('Failed to load MCP data:', error);
      toast.error('Failed to load MCP tools');
    } finally {
      setLoading(false);
    }
  };

  const executeTool = async (tool: MCPTool) => {
    if (!tool) return;

    setExecuting(tool.name);
    try {
      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolName: tool.name,
          parameters,
          context: {},
        }),
      });

      const result = await response.json() as any;

      if (result.success) {
        toast.success(`Tool executed successfully: ${tool.name}`);
        console.log('Tool result:', result.data);
      } else {
        throw new Error(result.error || 'Tool execution failed');
      }
    } catch (error: any) {
      console.error('Tool execution error:', error);
      toast.error(`Failed to execute ${tool.name}`);
    } finally {
      setExecuting(null);
    }
  };

  const getServerStatus = (server: MCPServer) => {
    switch (server.status) {
      case 'connected':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <div className="w-4 h-4 rounded-full bg-bolt-elements-background-depth-3" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-bolt-elements-background-depth-1 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-bolt-elements-borderColor">
        <div className="flex items-center gap-2">
          <Wrench className="w-5 h-5 text-bolt-elements-textPrimary" />
          <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">MCP Tools</h2>
        </div>
        <button
          onClick={loadMCPData}
          disabled={loading}
          className="p-2 hover:bg-bolt-elements-background-depth-2 rounded-lg transition-colors"
          title="Refresh tools and servers"
        >
          <RefreshCw className={`w-4 h-4 text-bolt-elements-textSecondary ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Servers Section */}
        <div className="p-4 border-b border-bolt-elements-borderColor">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-3 flex items-center gap-2">
            <Server className="w-4 h-4" />
            Connected Servers ({servers.length})
          </h3>
          <div className="space-y-2">
            {servers.map((server) => (
              <div
                key={server.id}
                className="flex items-center justify-between p-3 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor"
              >
                <div className="flex items-center gap-3">
                  {getServerStatus(server)}
                  <div>
                    <div className="text-sm font-medium text-bolt-elements-textPrimary">
                      {server.name}
                    </div>
                    <div className="text-xs text-bolt-elements-textSecondary">
                      {server.toolCount} tools available
                    </div>
                  </div>
                </div>
                <div className={`text-xs px-2 py-1 rounded ${
                  server.enabled 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary'
                }`}>
                  {server.enabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tools Section */}
        <div className="p-4">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary mb-3">
            Available Tools ({tools.length})
          </h3>
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-bolt-elements-textSecondary">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="ml-2">Loading tools...</span>
              </div>
            ) : tools.length === 0 ? (
              <div className="text-center py-8 text-bolt-elements-textSecondary">
                No tools available
              </div>
            ) : (
              tools.map((tool) => (
                <div
                  key={`${tool.serverId}-${tool.name}`}
                  className="p-3 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor hover:border-bolt-elements-borderColorActive transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-bolt-elements-textPrimary font-mono">
                        {tool.name}
                      </div>
                      <div className="text-xs text-bolt-elements-textSecondary mt-1">
                        {tool.description}
                      </div>
                      <div className="text-xs text-bolt-elements-textTertiary mt-1">
                        Server: {tool.serverId}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedTool(selectedTool?.name === tool.name ? null : tool)}
                      className="p-2 hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
                      title="Execute tool"
                    >
                      {executing === tool.name ? (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      ) : (
                        <Play className="w-4 h-4 text-bolt-elements-textSecondary" />
                      )}
                    </button>
                  </div>

                  {/* Tool Parameters */}
                  {selectedTool?.name === tool.name && tool.parameters && tool.parameters.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-bolt-elements-borderColor space-y-2">
                      <div className="text-xs font-medium text-bolt-elements-textPrimary mb-2">
                        Parameters:
                      </div>
                      {tool.parameters.map((param) => (
                        <div key={param.name}>
                          <label className="block text-xs text-bolt-elements-textSecondary mb-1">
                            {param.name}
                            {param.required && <span className="text-red-400 ml-1">*</span>}
                          </label>
                          <input
                            type={param.type === 'number' ? 'number' : 'text'}
                            value={parameters[param.name] || ''}
                            onChange={(e) => setParameters({
                              ...parameters,
                              [param.name]: param.type === 'number' 
                                ? parseFloat(e.target.value) 
                                : e.target.value
                            })}
                            placeholder={param.description}
                            className="w-full px-2 py-1 text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded text-bolt-elements-textPrimary focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => executeTool(tool)}
                        disabled={executing === tool.name}
                        className="w-full mt-2 px-3 py-2 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded font-medium transition-colors disabled:opacity-50"
                      >
                        {executing === tool.name ? 'Executing...' : 'Execute Tool'}
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Status Footer */}
      <div className="p-3 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex items-center justify-between text-xs text-bolt-elements-textSecondary">
          <span>{servers.filter(s => s.enabled).length} servers active</span>
          <span>{tools.length} tools available</span>
        </div>
      </div>
    </div>
  );
}
