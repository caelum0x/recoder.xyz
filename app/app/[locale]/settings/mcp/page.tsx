'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface MCPServer {
  id: string;
  name: string;
  description: string;
  category: string;
  requiresAuth?: boolean;
  envVars?: { key: string; description: string; required: boolean }[];
}

interface InstalledServer {
  id: string;
  serverId: string;
  name: string;
  enabled: boolean;
}

interface ServerHealth {
  serverId: string;
  name: string;
  status: string;
  healthy: boolean;
  error?: string;
}

export default function MCPSettingsPage() {
  const [availableServers, setAvailableServers] = useState<MCPServer[]>([]);
  const [installedServers, setInstalledServers] = useState<InstalledServer[]>([]);
  const [serverHealth, setServerHealth] = useState<Record<string, ServerHealth>>({});
  const [loading, setLoading] = useState(true);
  const [showQuickInstall, setShowQuickInstall] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [available, installed, health] = await Promise.all([
        fetch('/api/mcp/servers/available').then((r) => r.json()),
        fetch('/api/mcp/servers').then((r) => r.json()),
        fetch('/api/mcp/health').then((r) => r.json()),
      ]);

      setAvailableServers(available.servers || []);
      setInstalledServers(installed.servers || []);
      
      const healthMap: Record<string, ServerHealth> = {};
      (health.servers || []).forEach((s: ServerHealth) => {
        healthMap[s.serverId] = s;
      });
      setServerHealth(healthMap);
    } catch (error) {
      console.error('Failed to load MCP data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function installServer(serverId: string) {
    try {
      await fetch('/api/mcp/servers/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId }),
      });
      await loadData();
    } catch (error) {
      console.error('Failed to install server:', error);
    }
  }

  async function uninstallServer(serverId: string) {
    try {
      await fetch(`/api/mcp/servers/${serverId}`, { method: 'DELETE' });
      await loadData();
    } catch (error) {
      console.error('Failed to uninstall server:', error);
    }
  }

  async function toggleServer(serverId: string, enabled: boolean) {
    try {
      await fetch(`/api/mcp/servers/${serverId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: enabled ? 'disable' : 'enable' }),
      });
      await loadData();
    } catch (error) {
      console.error('Failed to toggle server:', error);
    }
  }

  async function batchInstall(serverIds: string[]) {
    for (const serverId of serverIds) {
      await installServer(serverId);
    }
  }

  const isInstalled = (serverId: string) => 
    installedServers.some((s) => s.serverId === serverId);

  const getInstalledServer = (serverId: string) =>
    installedServers.find((s) => s.serverId === serverId);

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Settings
      </Link>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">MCP Servers</h1>
          <p className="text-muted-foreground mt-2">
            Manage Model Context Protocol servers to extend AI capabilities
          </p>
        </div>
        <Button onClick={() => setShowQuickInstall(true)}>
          Quick Setup
        </Button>
      </div>

      <div className="grid gap-6">
        {['reference', 'custom'].map((category) => {
          const servers = availableServers.filter((s) => s.category === category);
          if (servers.length === 0) return null;

          return (
            <div key={category}>
              <h2 className="text-xl font-semibold mb-4 capitalize">
                {category} Servers
              </h2>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {servers.map((server) => {
                  const installed = getInstalledServer(server.id);
                  const health = serverHealth[server.id];

                  return (
                    <Card key={server.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{server.name}</CardTitle>
                            <CardDescription className="mt-1">
                              {server.description}
                            </CardDescription>
                          </div>
                          {installed && (
                            <Badge variant={health?.healthy ? 'default' : 'destructive'}>
                              {health?.status || 'unknown'}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {server.requiresAuth && (
                            <div className="text-sm text-muted-foreground">
                              Requires authentication
                            </div>
                          )}
                          
                          {installed ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant={installed.enabled ? 'outline' : 'default'}
                                onClick={() => toggleServer(server.id, installed.enabled)}
                              >
                                {installed.enabled ? 'Disable' : 'Enable'}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => uninstallServer(server.id)}
                              >
                                Uninstall
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => installServer(server.id)}
                            >
                              Install
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
