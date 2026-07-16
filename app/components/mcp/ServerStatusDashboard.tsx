'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';

interface ServerStatus {
  serverId: string;
  name: string;
  status: string;
  healthy: boolean;
}

export function ServerStatusDashboard() {
  const [servers, setServers] = useState<ServerStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  async function loadStatus() {
    try {
      const res = await fetch('/api/mcp/health');
      const data = await res.json();
      setServers(data.servers || []);
    } catch (error) {
      console.error('Failed to load status:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return null;
  if (servers.length === 0) return null;

  const healthy = servers.filter(s => s.healthy).length;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">MCP:</span>
      <Badge variant={healthy === servers.length ? 'default' : 'destructive'}>
        {healthy}/{servers.length}
      </Badge>
    </div>
  );
}
