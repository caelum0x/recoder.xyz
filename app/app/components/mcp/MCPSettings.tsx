'use client';

import { useState, useEffect } from 'react';

interface MCPServer {
  id: string;
  serverId: string;
  name: string;
  enabled: boolean;
}

export function MCPSettings() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [defaults, setDefaults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingServer, setAddingServer] = useState<string | null>(null);
  const [removingServer, setRemovingServer] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    loadServers();
  }, []);

  async function loadServers() {
    const res = await fetch('/api/mcp/servers');
    const data = await res.json();
    setServers(data.servers);
    setDefaults(data.defaults);
    setLoading(false);
  }

  async function addServer(config: any) {
    setAddingServer(config.id);
    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      
      if (res.ok) {
        await loadServers();
        setSuccessMessage(`${config.name} added successfully!`);
        setTimeout(() => setSuccessMessage(null), 3000);
      }
    } finally {
      setAddingServer(null);
    }
  }

  async function removeServer(serverId: string) {
    setRemovingServer(serverId);
    try {
      await fetch(`/api/mcp/servers/${serverId}`, { method: 'DELETE' });
      await loadServers();
    } finally {
      setRemovingServer(null);
    }
  }

  if (loading) return <div className="flex items-center justify-center p-8"><div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full"></div></div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4">MCP Servers</h2>
        <p className="text-sm text-gray-600 mb-4">
          Model Context Protocol servers extend AI capabilities with external tools and data sources.
        </p>
      </div>

      {successMessage && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex items-center gap-2">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {successMessage}
        </div>
      )}

      <div className="space-y-3">
        {servers.length === 0 ? (
          <div className="text-center p-8 border-2 border-dashed rounded-lg text-gray-500">
            No MCP servers added yet. Add one from the available servers below.
          </div>
        ) : (
          servers.map((server) => (
            <div key={server.id} className="flex items-center justify-between p-4 border rounded-lg bg-white shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div>
                  <div className="font-medium">{server.name}</div>
                  <div className="text-sm text-gray-500">{server.serverId}</div>
                </div>
              </div>
              <button
                onClick={() => removeServer(server.serverId)}
                disabled={removingServer === server.serverId}
                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
              >
                {removingServer === server.serverId ? 'Removing...' : 'Remove'}
              </button>
            </div>
          ))
        )}
      </div>

      <div>
        <h3 className="text-lg font-medium mb-3">Available Servers</h3>
        <div className="space-y-3">
          {defaults.map((def) => {
            const isAdded = servers.some((s) => s.serverId === def.id);
            const isAdding = addingServer === def.id;
            return (
              <div key={def.id} className="flex items-center justify-between p-4 border rounded-lg bg-white shadow-sm">
                <div>
                  <div className="font-medium text-base">{def.name}</div>
                  <div className="text-sm text-gray-500 mt-1">{def.id}</div>
                </div>
                {isAdded ? (
                  <div className="px-4 py-2 text-sm text-green-600 bg-green-50 rounded-md font-medium">
                    ✓ Added
                  </div>
                ) : (
                  <button
                    onClick={() => addServer(def)}
                    disabled={isAdding}
                    className="px-6 py-2.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]"
                  >
                    {isAdding ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Adding...
                      </span>
                    ) : (
                      'Add Server'
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
