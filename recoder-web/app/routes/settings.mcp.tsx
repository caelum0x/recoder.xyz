/**
 * MCP Settings Page
 * Manage MCP servers and tools
 */

import { useState, useMemo } from 'react';
import { useMCP } from '~/lib/hooks/useMCP';
import MCPMarketplace from '~/components/mcp/MCPMarketplace';

export default function MCPSettings() {
  const {
    servers, tools, loading, error,
    connect, disconnect, addServer, updateServer, removeServer, toggleServer,
    connectedServers
  } = useMCP();

  const [showAdd, setShowAdd] = useState(false);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', command: '', args: '' });

  // Get list of installed server IDs for marketplace
  const installedServerIds = useMemo(() => {
    return servers.map(s => s.id).filter(Boolean) as string[];
  }, [servers]);

  const handleMarketplaceInstall = (serverConfig: { id: string; name: string; command: string; args: string[]; env?: Record<string, string>; enabled: boolean }) => {
    // Check if already installed
    if (installedServerIds.includes(serverConfig.id)) {
      return;
    }
    // Add server using the useMCP hook (saves to localStorage)
    addServer({
      id: serverConfig.id, // Use marketplace ID for deduplication
      name: serverConfig.name,
      command: serverConfig.command,
      args: serverConfig.args,
      env: serverConfig.env,
      enabled: serverConfig.enabled,
    });
    setShowMarketplace(false);
  };

  const handleAdd = () => {
    if (!newServer.name || !newServer.command) return;
    addServer({
      name: newServer.name,
      command: newServer.command,
      args: newServer.args.split(' ').filter(Boolean),
      enabled: false,
    });
    setNewServer({ name: '', command: '', args: '' });
    setShowAdd(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">MCP Servers</h2>
          <p className="text-sm text-bolt-elements-textSecondary">
            Connect to MCP servers to give AI access to external tools
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowMarketplace(true)}
            className="px-3 py-1.5 text-sm bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-md hover:from-blue-700 hover:to-purple-700"
          >
            Marketplace
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="px-3 py-1.5 text-sm bg-bolt-elements-background-depth-3 rounded-md hover:bg-bolt-elements-item-backgroundHover"
          >
            {showAdd ? 'Cancel' : '+ Custom'}
          </button>
          <button
            onClick={connectedServers.length > 0 ? disconnect : connect}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-md disabled:opacity-50"
          >
            {loading ? 'Connecting...' : connectedServers.length > 0 ? 'Disconnect All' : 'Connect'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Add Server Form */}
      {showAdd && (
        <div className="p-4 bg-bolt-elements-background-depth-2 rounded-lg border border-bolt-elements-borderColor space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-bolt-elements-textSecondary mb-1">Name</label>
              <input
                value={newServer.name}
                onChange={e => setNewServer(p => ({ ...p, name: e.target.value }))}
                placeholder="My Server"
                className="w-full px-3 py-2 text-sm bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs text-bolt-elements-textSecondary mb-1">Command</label>
              <input
                value={newServer.command}
                onChange={e => setNewServer(p => ({ ...p, command: e.target.value }))}
                placeholder="npx"
                className="w-full px-3 py-2 text-sm bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-md"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-bolt-elements-textSecondary mb-1">Arguments (space-separated)</label>
            <input
              value={newServer.args}
              onChange={e => setNewServer(p => ({ ...p, args: e.target.value }))}
              placeholder="-y @modelcontextprotocol/server-filesystem /workspace"
              className="w-full px-3 py-2 text-sm font-mono bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-md"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!newServer.name || !newServer.command}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            Add Server
          </button>
        </div>
      )}

      {/* Servers List */}
      <div className="space-y-2">
        {servers.map(server => {
          const isConnected = connectedServers.includes(server.id);
          const serverTools = tools.filter(t => t.serverId === server.id);
          
          return (
            <div key={server.id} className={`p-4 rounded-lg border ${server.enabled ? 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor' : 'bg-bolt-elements-background-depth-1 border-transparent opacity-60'}`}>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={server.enabled}
                  onChange={() => toggleServer(server.id)}
                  className="w-4 h-4"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{server.name}</span>
                    {isConnected && (
                      <span className="px-1.5 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">Connected</span>
                    )}
                    {serverTools.length > 0 && (
                      <span className="px-1.5 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded">{serverTools.length} tools</span>
                    )}
                  </div>
                  <code className="text-xs text-bolt-elements-textTertiary">{server.command} {server.args.join(' ')}</code>
                </div>
                <button
                  onClick={() => removeServer(server.id)}
                  className="p-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded"
                >
                  ✕
                </button>
              </div>
              
              {/* Show tools when connected */}
              {serverTools.length > 0 && (
                <div className="mt-3 pt-3 border-t border-bolt-elements-borderColor">
                  <div className="text-xs text-bolt-elements-textSecondary mb-2">Available Tools:</div>
                  <div className="flex flex-wrap gap-1">
                    {serverTools.map(tool => (
                      <span key={tool.name} className="px-2 py-0.5 text-xs bg-bolt-elements-background-depth-3 rounded" title={tool.description}>
                        {tool.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info */}
      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <div className="text-sm text-blue-400 font-medium">💡 How MCP Works</div>
        <p className="text-xs text-bolt-elements-textSecondary mt-1">
          MCP servers provide tools that AI can use. Enable servers, click Connect, and the AI will automatically have access to their tools.
        </p>
      </div>

      <div className="pt-2">
        <a
          href="https://modelcontextprotocol.io/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary underline"
        >
          Learn more about MCP →
        </a>
      </div>

      {/* Marketplace Modal */}
      {showMarketplace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-5xl h-[80vh] bg-bolt-elements-background-depth-1 rounded-xl shadow-2xl overflow-hidden">
            <MCPMarketplace
              installedServerIds={installedServerIds}
              onInstall={handleMarketplaceInstall}
              onClose={() => setShowMarketplace(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
