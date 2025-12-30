'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EnvVar {
  key: string;
  description: string;
  required: boolean;
}

interface ServerDefinition {
  id: string;
  name: string;
  description: string;
  envVars?: EnvVar[];
}

export default function ConfigureServerPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = use(params);
  const router = useRouter();
  const [server, setServer] = useState<ServerDefinition | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadServer();
  }, [serverId]);

  async function loadServer() {
    try {
      const res = await fetch('/api/mcp/servers/available');
      const { servers } = await res.json();
      const found = servers.find((s: ServerDefinition) => s.id === serverId);
      setServer(found || null);
    } catch (error) {
      console.error('Failed to load server:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await fetch('/api/mcp/servers/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverId: serverId,
          config: { env: envValues },
        }),
      });
      router.push('/settings/mcp');
    } catch (error) {
      console.error('Failed to save configuration:', error);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-6">Loading...</div>;
  if (!server) return <div className="p-6">Server not found</div>;

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Configure {server.name}</CardTitle>
          <CardDescription>{server.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {server.envVars && server.envVars.length > 0 ? (
            <>
              {server.envVars.map((envVar) => (
                <div key={envVar.key} className="space-y-2">
                  <Label htmlFor={envVar.key}>
                    {envVar.key}
                    {envVar.required && <span className="text-red-500 ml-1">*</span>}
                  </Label>
                  <Input
                    id={envVar.key}
                    type="password"
                    placeholder={envVar.description}
                    value={envValues[envVar.key] || ''}
                    onChange={(e) =>
                      setEnvValues({ ...envValues, [envVar.key]: e.target.value })
                    }
                  />
                  <p className="text-sm text-muted-foreground">{envVar.description}</p>
                </div>
              ))}
              <div className="flex gap-2 pt-4">
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save & Install'}
                </Button>
                <Button variant="outline" onClick={() => router.back()}>
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <div>
              <p className="text-muted-foreground mb-4">
                This server doesn't require any configuration.
              </p>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Installing...' : 'Install'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
