import { useState, useEffect } from 'react';
import { classNames } from '~/utils/classNames';

export function MCPButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [servers, setServers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadServers();
  }, []);

  async function loadServers() {
    try {
      const res = await fetch('/api/mcp/servers');
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers || []);
      }
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
    }
  }

  async function addServer(config: any) {
    setLoading(true);
    try {
      await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      await loadServers();
    } catch (error) {
      console.error('Failed to add server:', error);
    }
    setLoading(false);
  }

  async function removeServer(serverId: string) {
    setLoading(true);
    try {
      await fetch(`/api/mcp/servers/${serverId}`, { method: 'DELETE' });
      await loadServers();
    } catch (error) {
      console.error('Failed to remove server:', error);
    }
    setLoading(false);
  }

  const defaultServers = [
    { id: 'github', name: 'GitHub', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
    { id: 'filesystem', name: 'Filesystem', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'] },
    { id: 'brave-search', name: 'Web Search', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] },
    { id: 'playwright', name: 'Browser', command: 'npx', args: ['-y', '@modelcontextprotocol/server-playwright'] },
  ];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={classNames(
          'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors font-medium whitespace-nowrap h-[38px] text-sm',
          'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
          'hover:bg-bolt-elements-background-depth-3',
          'text-bolt-elements-textPrimary',
          {
            'bg-blue-500/20 text-blue-400 border-blue-500/30': servers.length > 0,
          }
        )}
        title="MCP Tools"
      >
        <div className="i-ph:lightning-fill text-lg" />
        <span>MCP</span>
        {servers.length > 0 && (
          <span className="px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
            {servers.length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setIsOpen(false)} />
          <div className="absolute bottom-full right-0 mb-2 w-80 rounded-lg shadow-lg z-[1000] max-h-96 overflow-auto"
            style={{ zIndex: 1000, backgroundColor: '#000000', borderColor: '#000000', border: '1px solid #000000' }}>
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-white">MCP Tools</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white"
                >
                  <div className="i-ph:x text-xl" />
                </button>
              </div>
              <p className="text-xs text-gray-400">
                Extend AI with external tools and data sources
              </p>
            </div>

            {servers.length > 0 && (
              <div className="p-4 border-b border-gray-700">
                <h4 className="text-sm font-medium text-white mb-2">Active Servers</h4>
                <div className="space-y-2">
                  {servers.map((server) => (
                    <div
                      key={server.id}
                      className="flex items-center justify-between p-2 bg-gray-800 rounded"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="text-sm text-white">{server.name}</span>
                      </div>
                      <button
                        onClick={() => removeServer(server.serverId)}
                        disabled={loading}
                        className="text-xs text-gray-400 hover:text-red-400"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="p-4">
              <h4 className="text-sm font-medium text-white mb-2">Available Servers</h4>
              <div className="space-y-2">
                {defaultServers.map((def) => {
                  const isAdded = servers.some((s) => s.serverId === def.id);
                  return (
                    <div
                      key={def.id}
                      className="flex items-center justify-between p-2 bg-gray-800 rounded"
                    >
                      <span className="text-sm text-white">{def.name}</span>
                      {isAdded ? (
                        <span className="text-xs text-green-400">Added</span>
                      ) : (
                        <button
                          onClick={() => addServer(def)}
                          disabled={loading}
                          className="text-xs px-2 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50"
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
