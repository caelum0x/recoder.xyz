/**
 * API Key Management Page
 * Allows users to generate, view, and revoke API keys for CLI/automation
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Copy, Key, Trash2, Plus, AlertTriangle, Eye, EyeOff } from 'lucide-react';

interface ApiKey {
  id: string;
  keyId: string;
  keyPrefix: string;
  name: string;
  description?: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  usageCount: number;
  isActive: boolean;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyDescription, setNewKeyDescription] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['cli:full', 'profile']);

  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    try {
      const res = await fetch('/api/auth/keys');
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (error) {
      console.error('Failed to fetch keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateKey = async () => {
    if (!newKeyName.trim()) {
      alert('Please enter a name for the API key');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/auth/keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newKeyName,
          description: newKeyDescription,
          scopes: selectedScopes 
        })
      });

      if (!res.ok) throw new Error('Failed to generate API key');

      const data = await res.json();
      setGeneratedKey(data.apiKey);
      setNewKeyName('');
      setNewKeyDescription('');
      setShowKey(true);
      fetchKeys();
    } catch (error) {
      alert('Failed to generate API key');
    } finally {
      setGenerating(false);
    }
  };

  const revokeKey = async (keyId: string) => {
    if (!confirm('Revoke this API key? This cannot be undone.')) return;

    try {
      await fetch('/api/auth/keys/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId })
      });
      fetchKeys();
    } catch (error) {
      console.error('Failed to revoke key:', error);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="container max-w-6xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-2">API Keys</h1>
      <p className="text-gray-600 mb-8">
        Generate and manage API keys for CLI authentication and automation
      </p>

      {/* Generated Key Alert */}
      {generatedKey && (
        <Card className="mb-6 border-yellow-400 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="font-bold text-yellow-900 mb-1">Save this API key!</h3>
                <p className="text-sm text-yellow-800">This key will only be shown once.</p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-yellow-200">
              <div className="flex items-center justify-between gap-3">
                <code className="flex-1 font-mono text-sm break-all select-all">
                  {showKey ? generatedKey : '•'.repeat(generatedKey.length)}
                </code>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setShowKey(!showKey)}>
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="sm" onClick={() => copyToClipboard(generatedKey)}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-white rounded border border-yellow-200">
              <p className="text-sm font-medium mb-2">Usage in CLI:</p>
              <code className="text-xs bg-gray-100 p-2 rounded block">
                recoder auth login --api-key {generatedKey.substring(0, 16)}...
              </code>
            </div>

            <Button variant="outline" className="mt-4" onClick={() => setGeneratedKey('')}>
              Done, I've saved it
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Generate New Key */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Generate New API Key
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="keyName">Key Name *</Label>
              <Input
                id="keyName"
                placeholder="Production Server"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="keyDescription">Description (optional)</Label>
              <Input
                id="keyDescription"
                placeholder="Used for production deployments"
                value={newKeyDescription}
                onChange={(e) => setNewKeyDescription(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label>Scopes</Label>
              <div className="mt-2 space-y-2">
                {['cli:full', 'profile', 'api:read', 'api:write', 'generate:code'].map((scope) => (
                  <label key={scope} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedScopes.includes(scope)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedScopes([...selectedScopes, scope]);
                        } else {
                          setSelectedScopes(selectedScopes.filter(s => s !== scope));
                        }
                      }}
                    />
                    <span className="text-sm">{scope}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button onClick={generateKey} disabled={generating || !newKeyName.trim()}>
              {generating ? 'Generating...' : 'Generate API Key'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Your API Keys ({keys.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500 text-center py-8">Loading...</p>
          ) : keys.length === 0 ? (
            <div className="text-center py-8">
              <Key className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-500">No API keys yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div key={key.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold">{key.name}</h3>
                        {key.isActive ? (
                          <Badge className="bg-green-500">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Revoked</Badge>
                        )}
                      </div>

                      {key.description && (
                        <p className="text-sm text-gray-600 mb-2">{key.description}</p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <span className="font-mono">{key.keyPrefix}...</span>
                        <span>•</span>
                        <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                        {key.lastUsedAt && (
                          <>
                            <span>•</span>
                            <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>{key.usageCount} uses</span>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} variant="outline" className="text-xs">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => revokeKey(key.keyId)}
                      disabled={!key.isActive}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
