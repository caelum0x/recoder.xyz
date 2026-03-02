'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface MarketplaceServer {
  id: string;
  name: string;
  description: string;
  category: string;
  author: string;
  downloads: number;
  rating: number;
  version: string;
  installed?: boolean;
}

export default function MarketplacePage() {
  const [servers, setServers] = useState<MarketplaceServer[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMarketplace();
  }, []);

  async function loadMarketplace() {
    try {
      const [available, installed] = await Promise.all([
        fetch('/api/mcp/servers/available').then((r) => r.json()),
        fetch('/api/mcp/servers').then((r) => r.json()),
      ]);

      const installedIds = new Set(installed.servers?.map((s: any) => s.serverId) || []);
      
      const marketplaceServers = available.servers.map((s: any) => ({
        ...s,
        author: 'Anthropic',
        downloads: 0,
        rating: 0,
        version: '1.0.0',
        installed: installedIds.has(s.id),
      }));

      setServers(marketplaceServers);
    } catch (error) {
      console.error('Failed to load marketplace:', error);
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
      await loadMarketplace();
    } catch (error) {
      console.error('Failed to install:', error);
    }
  }

  const filteredServers = servers.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
                         s.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = category === 'all' || s.category === category;
    return matchesSearch && matchesCategory;
  });

  const categories = ['all', ...new Set(servers.map((s) => s.category))];

  if (loading) return <div className="p-6">Loading marketplace...</div>;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">MCP Marketplace</h1>
        <p className="text-muted-foreground mt-2">
          Discover and install MCP servers from the community
        </p>
      </div>

      <div className="flex gap-4">
        <Input
          placeholder="Search servers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex gap-2">
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={category === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredServers.map((server) => (
          <Card key={server.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{server.name}</CardTitle>
                  <CardDescription className="mt-1">{server.description}</CardDescription>
                </div>
                {server.installed && <Badge>Installed</Badge>}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>by {server.author}</span>
                  <span>v{server.version}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>⭐ {server.rating.toFixed(1)}</span>
                  <span>📥 {server.downloads.toLocaleString()}</span>
                </div>
                {!server.installed && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => installServer(server.id)}
                  >
                    Install
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
