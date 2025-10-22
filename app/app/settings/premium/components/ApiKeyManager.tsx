'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Key, Plus, Copy, Trash2, CheckCircle, AlertTriangle, Eye, EyeOff, Calendar 
} from 'lucide-react';

interface ApiKeyManagerProps {
  apiKeys: any[];
  onRefresh: () => void;
  maxKeys: number;
  currentPlan: string;
}

export default function ApiKeyManager({ apiKeys, onRefresh, maxKeys, currentPlan }: ApiKeyManagerProps) {
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      alert('Please enter a key name');
      return;
    }

    if (apiKeys.length >= maxKeys) {
      alert(`You can only create ${maxKeys} API keys on ${currentPlan} plan`);
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create key');
      }

      const data = await response.json();
      setGeneratedKey(data.apiKey?.key || null);
      setNewKeyName('');
      setCreating(false);
      onRefresh();
    } catch (error: any) {
      alert(error.message || 'Failed to create API key');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyKey = async (key: string, keyId?: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(keyId || 'generated');
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (error) {
      alert('Failed to copy to clipboard');
    }
  };

  const handleRevokeKey = async (keyId: string, keyName: string) => {
    if (!confirm(`Are you sure you want to revoke "${keyName}"? This cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/user/api-keys?id=${keyId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to revoke key');
      }

      onRefresh();
    } catch (error: any) {
      alert(error.message || 'Failed to revoke API key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Key className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-xl font-semibold">API Keys</h2>
            <p className="text-sm text-gray-600">
              {apiKeys.length} of {maxKeys === -1 ? 'unlimited' : maxKeys} keys used
            </p>
          </div>
        </div>
        {!creating && !generatedKey && (
          <Button
            onClick={() => setCreating(true)}
            disabled={apiKeys.length >= maxKeys && maxKeys !== -1}
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Key
          </Button>
        )}
      </div>

      {/* Show generated key once */}
      {generatedKey && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-green-900 mb-2">
                API Key Created Successfully!
              </p>
              <p className="text-sm text-green-700 mb-3">
                Make sure to copy your API key now. You won&apos;t be able to see it again!
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-white border border-green-300 rounded font-mono text-sm overflow-hidden">
                  <code className="flex-1 overflow-x-auto">
                    {showKey ? generatedKey : generatedKey.substring(0, 20) + '••••••••••••••'}
                  </code>
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="text-green-700 hover:text-green-800 flex-shrink-0"
                  >
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button
                  onClick={() => handleCopyKey(generatedKey)}
                  size="sm"
                  variant="outline"
                  className="flex-shrink-0"
                >
                  {copiedKey === 'generated' ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <Button
                onClick={() => {
                  setGeneratedKey(null);
                  setShowKey(false);
                }}
                variant="outline"
                size="sm"
                className="mt-3"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Create new key form */}
      {creating && !generatedKey && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-3">Create New API Key</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Enter key name (e.g., 'My CLI Key')"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateKey()}
              disabled={loading}
            />
            <Button
              onClick={handleCreateKey}
              disabled={loading || !newKeyName.trim()}
            >
              {loading ? 'Creating...' : 'Create'}
            </Button>
            <Button
              onClick={() => {
                setCreating(false);
                setNewKeyName('');
              }}
              variant="outline"
              disabled={loading}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Existing keys list */}
      <div className="space-y-3">
        {apiKeys.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Key className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="mb-2">No API keys yet</p>
            <p className="text-sm">Create one to get started with the CLI</p>
          </div>
        ) : (
          apiKeys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between p-4 bg-white border rounded-lg hover:shadow-md transition-shadow"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium">{key.name}</p>
                  {key.lastUsedAt && (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                      Active
                    </span>
                  )}
                  {key.expiresAt && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Expires {new Date(key.expiresAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <code className="font-mono">{key.keyPrefix}••••••••</code>
                  <span>Used {key.usageCount || 0} times</span>
                  {key.lastUsedAt && (
                    <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </div>
              <Button
                onClick={() => handleRevokeKey(key.id, key.name)}
                variant="ghost"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                disabled={loading}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Upgrade prompt for free users */}
      {currentPlan === 'free' && apiKeys.length >= maxKeys && maxKeys !== -1 && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-blue-900 mb-1">
                You&apos;ve reached your API key limit
              </p>
              <p className="text-sm text-blue-700 mb-3">
                Upgrade to Pro for 5 API keys and unlimited CLI usage
              </p>
              <Button
                onClick={() => window.location.href = '/pricing'}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700"
              >
                Upgrade Now
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
