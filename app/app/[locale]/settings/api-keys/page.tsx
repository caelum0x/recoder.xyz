/**
 * API Key Management Page
 * Allows users to generate, view, and revoke API keys for CLI/automation
 * Also manages Public API keys for programmatic access (via docker-backend)
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Copy, Key, Trash2, Plus, AlertTriangle, Eye, EyeOff, Globe, Shield } from 'lucide-react';
import Link from 'next/link';

const DOCKER_BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

// ==================== Types ====================

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

interface PublicApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  tier: string;
  environment: 'test' | 'live';
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
  isActive: boolean;
  totalRequests: number;
}

// ==================== Constants ====================

const PUBLIC_API_SCOPES = [
  { value: 'projects:read', label: 'projects:read' },
  { value: 'projects:write', label: 'projects:write' },
  { value: 'sandboxes:read', label: 'sandboxes:read' },
  { value: 'sandboxes:write', label: 'sandboxes:write' },
  { value: 'files:read', label: 'files:read' },
  { value: 'files:write', label: 'files:write' },
  { value: 'execute:commands', label: 'execute:commands' },
];

// ==================== Helpers ====================

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

async function dockerFetch(endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${DOCKER_BACKEND_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(data.error?.message || data.error || `Request failed (${res.status})`);
  }
  return data.data ?? data;
}

// ==================== Component ====================

export default function ApiKeysPage() {
  // CLI keys state
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyDescription, setNewKeyDescription] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['cli:full', 'profile']);

  // Public API keys state
  const [publicKeys, setPublicKeys] = useState<PublicApiKeyInfo[]>([]);
  const [publicLoading, setPublicLoading] = useState(true);
  const [publicError, setPublicError] = useState('');
  const [showCreatePublicKey, setShowCreatePublicKey] = useState(false);
  const [publicKeyName, setPublicKeyName] = useState('');
  const [publicKeyIsTest, setPublicKeyIsTest] = useState(false);
  const [publicKeyScopes, setPublicKeyScopes] = useState<string[]>(['projects:read']);
  const [creatingPublicKey, setCreatingPublicKey] = useState(false);
  const [createdPublicKey, setCreatedPublicKey] = useState('');
  const [showCreatedKey, setShowCreatedKey] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const showFeedback = (type: 'error' | 'success', text: string) => {
    setFeedbackMsg({ type, text });
    setTimeout(() => setFeedbackMsg(null), 4000);
  };
  const [copiedCreatedKey, setCopiedCreatedKey] = useState(false);

  // ==================== CLI Keys ====================

  useEffect(() => {
    fetchKeys();
    fetchPublicKeys();
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
      showFeedback('error', 'Please enter a name for the API key');
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
      showFeedback('error', 'Failed to generate API key');
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

  // ==================== Public API Keys ====================

  const fetchPublicKeys = async () => {
    setPublicLoading(true);
    try {
      const result = await dockerFetch('/api/v1/api-keys');
      setPublicKeys(result.keys || []);
      setPublicError('');
    } catch (err: any) {
      // Don't show error if user simply isn't authenticated to docker-backend
      if (!err.message?.includes('Authentication required')) {
        setPublicError(err.message || 'Failed to load public API keys');
      }
    } finally {
      setPublicLoading(false);
    }
  };

  const createPublicKey = async () => {
    if (!publicKeyName.trim()) {
      setPublicError('Name is required');
      return;
    }
    if (publicKeyScopes.length === 0) {
      setPublicError('Select at least one permission');
      return;
    }

    setCreatingPublicKey(true);
    setPublicError('');

    try {
      const result = await dockerFetch('/api/v1/api-keys', {
        method: 'POST',
        body: JSON.stringify({
          name: publicKeyName.trim(),
          scopes: publicKeyScopes,
          isTestKey: publicKeyIsTest,
        }),
      });
      setCreatedPublicKey(result.apiKey);
      setShowCreatedKey(true);
      setShowCreatePublicKey(false);
      setPublicKeyName('');
      setPublicKeyScopes(['projects:read']);
      setPublicKeyIsTest(false);
      fetchPublicKeys();
    } catch (err: any) {
      setPublicError(err.message || 'Failed to create API key');
    } finally {
      setCreatingPublicKey(false);
    }
  };

  const revokePublicKey = async (keyId: string, keyName: string) => {
    if (!confirm(`Revoke "${keyName}"? This key will immediately stop working.`)) return;

    try {
      await dockerFetch(`/api/v1/api-keys/${keyId}`, { method: 'PATCH' });
      setPublicKeys((prev) =>
        prev.map((k) => (k.id === keyId ? { ...k, isActive: false } : k))
      );
    } catch (err: any) {
      setPublicError(err.message || 'Failed to revoke key');
    }
  };

  const copyCreatedKey = async () => {
    try {
      await navigator.clipboard.writeText(createdPublicKey);
      setCopiedCreatedKey(true);
      setTimeout(() => setCopiedCreatedKey(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = createdPublicKey;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedCreatedKey(true);
      setTimeout(() => setCopiedCreatedKey(false), 2000);
    }
  };

  const togglePublicScope = (scope: string) => {
    setPublicKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const activePublicKeys = publicKeys.filter((k) => k.isActive);
  const revokedPublicKeys = publicKeys.filter((k) => !k.isActive);

  return (
    <div className="container max-w-6xl mx-auto p-8">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Settings
      </Link>
      <h1 className="text-3xl font-bold mb-2">Developer API Keys</h1>
      <p className="text-gray-600 mb-4">
        Generate API keys for CLI authentication, automation, and programmatic access to the Recoder API.
      </p>
      <div className="mb-8 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-300">
        Looking to connect AI models? Go to{' '}
        <Link href="/settings/ai-providers" className="text-orange-400 hover:text-orange-300 underline font-medium">
          AI Provider Keys
        </Link>{' '}
        to add your OpenRouter, Anthropic, or OpenAI key.
      </div>

      {/* ==================== CLI Keys Section ==================== */}

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

      {/* Generate New CLI Key */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Generate New CLI Key
          </CardTitle>
          <CardDescription>For CLI authentication and automation</CardDescription>
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

      {/* Existing CLI Keys */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Your CLI Keys ({keys.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500 text-center py-8">Loading...</p>
          ) : keys.length === 0 ? (
            <div className="text-center py-8">
              <Key className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-500">No CLI keys yet</p>
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
                        {(key.scopes || []).map((scope) => (
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

      {/* ==================== Public API Keys Section ==================== */}

      <div className="border-t pt-8 mt-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="h-6 w-6" />
              Public API Keys
            </h2>
            <p className="text-gray-600 mt-1">
              Manage keys for programmatic access to the Recoder API
            </p>
          </div>
          <Button onClick={() => setShowCreatePublicKey(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Key
          </Button>
        </div>

        {/* Public key error */}
        {publicError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {publicError}
            <button onClick={() => setPublicError('')} className="ml-2 text-red-500 hover:text-red-700">
              &times;
            </button>
          </div>
        )}

        {/* Created public key alert */}
        {showCreatedKey && createdPublicKey && (
          <Card className="mb-6 border-yellow-400 bg-yellow-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <h3 className="font-bold text-yellow-900 mb-1">Save this API key!</h3>
                  <p className="text-sm text-yellow-800">This key will only be shown once. Store it securely.</p>
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 border border-yellow-200">
                <div className="flex items-center justify-between gap-3">
                  <code className="flex-1 font-mono text-sm break-all select-all text-gray-900">
                    {createdPublicKey}
                  </code>
                  <Button size="sm" onClick={copyCreatedKey}>
                    <Copy className="h-4 w-4 mr-2" />
                    {copiedCreatedKey ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
              </div>

              <div className="mt-4 p-3 bg-white rounded border border-yellow-200">
                <p className="text-sm font-medium mb-2 text-gray-900">Usage example:</p>
                <code className="text-xs bg-gray-100 p-2 rounded block text-gray-800">
                  curl -H &quot;Authorization: Bearer {createdPublicKey.substring(0, 20)}...&quot; {DOCKER_BACKEND_URL}/api/v1/projects
                </code>
              </div>

              <Button variant="outline" className="mt-4" onClick={() => { setShowCreatedKey(false); setCreatedPublicKey(''); }}>
                Done, I've saved it
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Create public key form */}
        {showCreatePublicKey && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Create Public API Key</CardTitle>
              <CardDescription>
                For external integrations and programmatic access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="publicKeyName">Name *</Label>
                  <Input
                    id="publicKeyName"
                    placeholder="e.g. My Production Key"
                    value={publicKeyName}
                    onChange={(e) => setPublicKeyName(e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label>Type</Label>
                  <div className="mt-2 flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!publicKeyIsTest}
                        onChange={() => setPublicKeyIsTest(false)}
                      />
                      <span className="text-sm">Live</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={publicKeyIsTest}
                        onChange={() => setPublicKeyIsTest(true)}
                      />
                      <span className="text-sm">Test</span>
                    </label>
                  </div>
                </div>

                <div>
                  <Label>Permissions</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {PUBLIC_API_SCOPES.map((scope) => (
                      <label key={scope.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={publicKeyScopes.includes(scope.value)}
                          onChange={() => togglePublicScope(scope.value)}
                        />
                        <span className="text-sm font-mono">{scope.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setShowCreatePublicKey(false)}>
                    Cancel
                  </Button>
                  <Button onClick={createPublicKey} disabled={creatingPublicKey || !publicKeyName.trim()}>
                    {creatingPublicKey ? 'Creating...' : 'Create Key'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Public keys list */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Your Public API Keys ({publicKeys.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {publicLoading ? (
              <p className="text-gray-500 text-center py-8">Loading...</p>
            ) : publicKeys.length === 0 ? (
              <div className="text-center py-8">
                <Globe className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                <p className="text-gray-500 mb-2">No public API keys yet</p>
                <p className="text-gray-400 text-sm">Create a key to get started with the Recoder API</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Active keys */}
                {activePublicKeys.map((key) => (
                  <div key={key.id} className="border rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold">{key.name}</h3>
                          <Badge className="bg-green-500">Active</Badge>
                          <Badge variant={key.environment === 'live' ? 'default' : 'secondary'} className="text-xs">
                            {key.environment}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                          <span className="font-mono">{key.keyPrefix}...</span>
                          <span>•</span>
                          <span>Created {timeAgo(key.createdAt)}</span>
                          {key.lastUsedAt ? (
                            <>
                              <span>•</span>
                              <span>Last used {timeAgo(key.lastUsedAt)}</span>
                            </>
                          ) : (
                            <>
                              <span>•</span>
                              <span>Never used</span>
                            </>
                          )}
                          <span>•</span>
                          <span>{key.totalRequests.toLocaleString()} requests</span>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1">
                          {(key.scopes || []).map((scope) => (
                            <Badge key={scope} variant="outline" className="text-xs font-mono">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => revokePublicKey(key.id, key.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Revoked keys */}
                {revokedPublicKeys.map((key) => (
                  <div key={key.id} className="border rounded-lg p-4 opacity-60">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold line-through">{key.name}</h3>
                      <Badge variant="secondary">Revoked</Badge>
                    </div>
                    <div className="text-sm text-gray-500">
                      <span className="font-mono">{key.keyPrefix}...</span>
                      <span className="ml-4">{key.totalRequests.toLocaleString()} total requests</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
