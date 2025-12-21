/**
 * MCP Server Manager Component
 * Allows users to connect and manage MCP (Model Context Protocol) servers
 */

import { useState, useEffect } from 'react';
import { Server, Plus, Trash2, Power, PowerOff, AlertCircle, CheckCircle, Loader2, Settings } from 'lucide-react';
import { toast } from 'react-toastify';

interface MCPServer {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  status: 'connected' | 'disconnected' | 'error';
  type: 'filesystem' | 'git' | 'database' | 'custom';
  lastConnected?: Date;
  error?: string;
}

const PRESET_SERVERS = [
  {
    name: 'Filesystem Server',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', './'],
    type: 'filesystem' as const,
    description: 'Access and modify project files',
  },
  {
    name: 'Git Server',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-git'],
    type: 'git' as const,
    description: 'Git operations and repository management',
  },
  {
    name: 'PostgreSQL Server',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres'],
    type: 'database' as const,
    description: 'Database query and management',
    env: { DATABASE_URL: '' },
  },
];

export default function MCPServerManager() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<typeof PRESET_SERVERS[0] | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    command: '',
    args: '',
    env: '',
    type: 'custom' as MCPServer['type'],
  });

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    try {
      const response = await fetch('/api/mcp/servers');
      if (response.ok) {
        const data = await response.json();
        setServers(data.servers || []);
      }
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
    }
  };

  const handleAddServer = async () => {
    if (!formData.name || !formData.command) {
      toast.error('Please fill in required fields');
      return;
    }

    setLoading(true);
    try {
      const server: Omit<MCPServer, 'id' | 'status'> = {
        name: formData.name,
        command: formData.command,
        args: formData.args.split(' ').filter(Boolean),
        type: formData.type,
        env: formData.env ? JSON.parse(formData.env) : undefined,
      };

      const response = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(server),
      });

      if (!response.ok) throw new Error('Failed to add server');

      const data = await response.json();
      setServers([...servers, data.server]);
      toast.success(`Server "${formData.name}" added successfully`);
      
      // Reset form
      setFormData({
        name: '',
        command: '',
        args: '',
        env: '',
        type: 'custom',
      });
      setShowAddForm(false);
      setSelectedPreset(null);
    } catch (error) {
      toast.error('Failed to add server');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectServer = async (serverId: string) => {
    try {
      const response = await fetch(`/api/mcp/servers/${serverId}/connect`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to connect');

      const data = await response.json();
      setServers(servers.map(s => 
        s.id === serverId 
          ? { ...s, status: 'connected', lastConnected: new Date() }
          : s
      ));
      toast.success(`Connected to "${data.server.name}"`);
    } catch (error) {
      toast.error('Failed to connect to server');
      console.error(error);
    }
  };

  const handleDisconnectServer = async (serverId: string) => {
    try {
      const response = await fetch(`/api/mcp/servers/${serverId}/disconnect`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to disconnect');

      setServers(servers.map(s => 
        s.id === serverId ? { ...s, status: 'disconnected' } : s
      ));
      toast.success('Server disconnected');
    } catch (error) {
      toast.error('Failed to disconnect');
      console.error(error);
    }
  };

  const handleDeleteServer = async (serverId: string) => {
    if (!confirm('Are you sure you want to delete this server?')) return;

    try {
      const response = await fetch(`/api/mcp/servers/${serverId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete');

      setServers(servers.filter(s => s.id !== serverId));
      toast.success('Server deleted');
    } catch (error) {
      toast.error('Failed to delete server');
      console.error(error);
    }
  };

  const handlePresetSelect = (preset: typeof PRESET_SERVERS[0]) => {
    setSelectedPreset(preset);
    setFormData({
      name: preset.name,
      command: preset.command,
      args: preset.args.join(' '),
      env: preset.env ? JSON.stringify(preset.env, null, 2) : '',
      type: preset.type,
    });
    setShowAddForm(true);
  };

  const getStatusIcon = (status: MCPServer['status']) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'disconnected':
        return <PowerOff className="w-4 h-4 text-gray-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-bolt-elements-background-depth-1">
      {/* Header */}
      <div className="border-b border-bolt-elements-borderColor p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg">
              <Server className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-bolt-elements-textPrimary">
                MCP Server Manager
              </h1>
              <p className="text-sm text-bolt-elements-textSecondary">
                Connect and manage Model Context Protocol servers
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Server
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {/* Add Server Form */}
        {showAddForm && (
          <div className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-6 mb-6">
            <h2 className="text-lg font-semibold text-bolt-elements-textPrimary mb-4">
              {selectedPreset ? `Add ${selectedPreset.name}` : 'Add Custom Server'}
            </h2>

            {/* Preset Selection */}
            {!selectedPreset && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Quick Start (Presets)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {PRESET_SERVERS.map((preset) => (
                    <button
                      key={preset.name}
                      onClick={() => handlePresetSelect(preset)}
                      className="text-left p-4 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg hover:border-blue-500 transition-colors"
                    >
                      <div className="font-medium text-bolt-elements-textPrimary mb-1">
                        {preset.name}
                      </div>
                      <div className="text-xs text-bolt-elements-textSecondary">
                        {preset.description}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="my-4 flex items-center gap-2">
                  <div className="flex-1 h-px bg-bolt-elements-borderColor"></div>
                  <span className="text-sm text-bolt-elements-textTertiary">or custom</span>
                  <div className="flex-1 h-px bg-bolt-elements-borderColor"></div>
                </div>
              </div>
            )}

            {/* Form Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Server Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My MCP Server"
                  className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                    Command *
                  </label>
                  <input
                    type="text"
                    value={formData.command}
                    onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                    placeholder="npx"
                    className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                    Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as MCPServer['type'] })}
                    className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="custom">Custom</option>
                    <option value="filesystem">Filesystem</option>
                    <option value="git">Git</option>
                    <option value="database">Database</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Arguments (space-separated)
                </label>
                <input
                  type="text"
                  value={formData.args}
                  onChange={(e) => setFormData({ ...formData, args: e.target.value })}
                  placeholder="-y @modelcontextprotocol/server-filesystem ./"
                  className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
                  Environment Variables (JSON)
                </label>
                <textarea
                  value={formData.env}
                  onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                  placeholder='{"KEY": "value"}'
                  rows={3}
                  className="w-full px-4 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setSelectedPreset(null);
                  }}
                  className="px-4 py-2 bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary rounded-lg hover:bg-bolt-elements-background-depth-4 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddServer}
                  disabled={loading}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add Server
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Server List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
            Connected Servers ({servers.length})
          </h2>

          {servers.length === 0 ? (
            <div className="text-center py-12 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor border-dashed">
              <Server className="w-12 h-12 text-bolt-elements-textTertiary mx-auto mb-3" />
              <p className="text-bolt-elements-textSecondary">No MCP servers configured</p>
              <p className="text-sm text-bolt-elements-textTertiary mt-1">
                Add a server to get started
              </p>
            </div>
          ) : (
            servers.map((server) => (
              <div
                key={server.id}
                className="bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor p-4 hover:border-bolt-elements-borderColor-hover transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(server.status)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-bolt-elements-textPrimary">
                          {server.name}
                        </h3>
                        <span className="px-2 py-0.5 text-xs bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary rounded">
                          {server.type}
                        </span>
                      </div>
                      <p className="text-sm text-bolt-elements-textSecondary mt-1">
                        <span className="font-mono">{server.command}</span>
                        {server.args.length > 0 && (
                          <span className="ml-2 text-bolt-elements-textTertiary">
                            {server.args.join(' ')}
                          </span>
                        )}
                      </p>
                      {server.lastConnected && (
                        <p className="text-xs text-bolt-elements-textTertiary mt-1">
                          Last connected: {new Date(server.lastConnected).toLocaleString()}
                        </p>
                      )}
                      {server.error && (
                        <p className="text-xs text-red-400 mt-1">
                          Error: {server.error}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {server.status === 'disconnected' ? (
                      <button
                        onClick={() => handleConnectServer(server.id)}
                        className="p-2 text-green-500 hover:bg-green-500/10 rounded-lg transition-colors"
                        title="Connect"
                      >
                        <Power className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => handleDisconnectServer(server.id)}
                        className="p-2 text-yellow-500 hover:bg-yellow-500/10 rounded-lg transition-colors"
                        title="Disconnect"
                      >
                        <PowerOff className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteServer(server.id)}
                      className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Info Section */}
        <div className="mt-6 bg-blue-500/10 border border-blue-500/50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Settings className="w-5 h-5 text-blue-400 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-400 mb-1">About MCP Servers</h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                Model Context Protocol (MCP) servers provide additional capabilities to the AI assistant,
                such as file system access, git operations, database queries, and more. Connect servers
                to extend functionality.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
