/**
 * API Keys Dashboard
 * Manage and monitor API keys
 */

'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/lib/session-provider';
import { useRouter } from 'next/navigation';
import { 
  Key,
  Plus,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle,
  AlertCircle,
  MoreVertical,
  Calendar,
  Activity
} from 'lucide-react';

interface ApiKey {
  id: string;
  keyId: string;
  name: string;
  keyPrefix: string;
  description?: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  usageCount: number;
  scopes: string[];
}

interface NewApiKey {
  apiKey: string;
  keyId: string;
}

interface KeyStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  lastUsed: Date | null;
}

export default function ApiKeysDashboardPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [newKeyData, setNewKeyData] = useState<NewApiKey | null>(null);
  const [selectedKeyStats, setSelectedKeyStats] = useState<{ keyId: string; stats: KeyStats } | null>(null);
  const [keyName, setKeyName] = useState('');
  const [keyDescription, setKeyDescription] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!session && !isPending) {
      router.push('/auth/signin');
    }
  }, [session, isPending, router]);

  // Load API keys (or stop loading if not authenticated)
  useEffect(() => {
    if (!isPending) {
      if (session) {
        void loadKeys();
      } else {
        setLoading(false);
      }
    }
  }, [session, isPending]);

  const loadKeys = async () => {
    try {
      const response = await fetch('/api/user/keys', { credentials: 'include' });

      if (!response.ok) {
        console.error('API keys fetch failed with status:', response.status);
        setApiKeys([]);
        return;
      }

      const data = await response.json();

      if (data && data.success && Array.isArray(data.keys)) {
        // API returns 'permissions' from DB; map to 'scopes' for the UI
        setApiKeys(data.keys.map((k: any) => ({
          ...k,
          keyId: k.keyId || k.id,
          scopes: Array.isArray(k.scopes) ? k.scopes : Array.isArray(k.permissions) ? k.permissions : [],
          usageCount: k.usageCount ?? 0,
          createdAt: k.createdAt ?? new Date().toISOString(),
          lastUsedAt: k.lastUsedAt ?? null,
          expiresAt: k.expiresAt ?? null,
        })));
      } else {
        setApiKeys([]);
      }
    } catch (error) {
      console.error('Error loading keys:', error);
      setApiKeys([]);
    } finally {
      setLoading(false);
    }
  };

  const createKey = async () => {
    if (!keyName.trim()) return;

    try {
      const response = await fetch('/api/user/keys', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyName, description: keyDescription }),
      });

      const data = await response.json();

      if (data.success) {
        setNewKeyData({ apiKey: data.apiKey, keyId: data.keyId });
        setShowNewKeyModal(false);
        setKeyName('');
        setKeyDescription('');
        loadKeys();
      } else {
        showFeedback('error', data.error || 'Failed to create API key');
      }
    } catch (error) {
      console.error('Error creating key:', error);
      showFeedback('error', 'Failed to create API key');
    }
  };

  const revokeKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/user/keys?keyId=${keyId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        loadKeys();
        showFeedback('success', 'API key revoked');
      } else {
        showFeedback('error', data.error || 'Failed to revoke API key');
      }
    } catch (error) {
      console.error('Error revoking key:', error);
      showFeedback('error', 'Failed to revoke API key');
    }
  };

  const loadKeyStats = async (keyId: string) => {
    try {
      const response = await fetch(`/api/user/keys/${keyId}/usage`, { credentials: 'include' });
      const data = await response.json();

      if (data.success) {
        setSelectedKeyStats({ keyId, stats: data.stats });
      }
    } catch (error) {
      console.error('Error loading key stats:', error);
    }
  };

  const copyToClipboard = (key: string, keyId: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const maskKey = (key: string) => {
    return (key || 'sk-recoder-') + '***************************';
  };

  const toggleKeyVisibility = (keyId: string) => {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(keyId)) {
        next.delete(keyId);
      } else {
        next.add(keyId);
      }
      return next;
    });
  };

  const handleDeleteKey = async (keyId: string) => {
    await revokeKey(keyId);
  };

  const totalRequests = apiKeys.reduce((sum, key) => sum + (key.usageCount ?? 0), 0);
  const activeKeys = apiKeys.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-10">
        <div className="max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">API Keys</h1>
              <p className="text-gray-400">Manage your API keys and monitor usage</p>
            </div>
            <button
              onClick={() => setShowNewKeyModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Create New Key</span>
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Active Keys</div>
                <Key className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-3xl font-bold">{activeKeys}</div>
              <div className="text-xs text-gray-500 mt-1">
                {apiKeys.length} total keys
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Total Requests</div>
                <Activity className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-3xl font-bold">{totalRequests.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">
                Across all keys
              </div>
            </div>

            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-gray-400">Last Activity</div>
                <Calendar className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-2xl font-bold">
                {apiKeys[0]?.lastUsedAt ? new Date(apiKeys[0].lastUsedAt).toLocaleDateString() : 'Never'}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Most recent usage
              </div>
            </div>
          </div>

          {/* API Keys List */}
          {apiKeys.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                <Key className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold mb-2">No API Keys Yet</h3>
              <p className="text-gray-400 mb-6">Create your first API key to start using Recoder programmatically</p>
              <button
                onClick={() => setShowNewKeyModal(true)}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all inline-flex items-center space-x-2"
              >
                <Plus className="w-5 h-5" />
                <span>Create Your First Key</span>
              </button>
            </div>
          ) : (
            <div className="space-y-4">{apiKeys.map((apiKey) => (
              <div
                key={apiKey.id}
                className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start space-x-4 flex-1">
                    <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                      <Key className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-bold">{apiKey.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          !apiKey.expiresAt || new Date(apiKey.expiresAt) > new Date()
                            ? 'bg-green-500/20 text-green-500'
                            : 'bg-red-500/20 text-red-500'
                        }`}>
                          {!apiKey.expiresAt || new Date(apiKey.expiresAt) > new Date() ? 'active' : 'expired'}
                        </span>
                      </div>
                      
                      {/* API Key Display */}
                      <div className="mb-3 p-3 bg-white/5 rounded-lg border border-white/10 font-mono text-sm flex items-center justify-between">
                        <span className="truncate">
                          {visibleKeys.has(apiKey.id) ? apiKey.keyPrefix : maskKey(apiKey.keyPrefix)}
                        </span>
                        <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
                          <button
                            onClick={() => toggleKeyVisibility(apiKey.id)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            title={visibleKeys.has(apiKey.id) ? 'Hide key' : 'Show key'}
                          >
                            {visibleKeys.has(apiKey.id) ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => copyToClipboard(apiKey.keyPrefix, apiKey.id)}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            title="Copy to clipboard"
                          >
                            {copiedKey === apiKey.id ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Key Info */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <div className="text-gray-400">Created</div>
                          <div className="font-medium">{new Date(apiKey.createdAt).toLocaleDateString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Last Used</div>
                          <div className="font-medium">{apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleDateString() : 'Never'}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Requests</div>
                          <div className="font-medium">{(apiKey.usageCount ?? 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">Scopes</div>
                          <div className="flex flex-wrap gap-1">
                            {(apiKey.scopes || []).map((scope, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs"
                              >
                                {scope}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  {(!apiKey.expiresAt || new Date(apiKey.expiresAt) > new Date()) && (
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <button
                        onClick={() => handleDeleteKey(apiKey.id)}
                        className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                        title="Revoke key"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Usage Bar */}
                {(!apiKey.expiresAt || new Date(apiKey.expiresAt) > new Date()) && (
                  <div className="pt-4 border-t border-white/10">
                    <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                      <span>Usage this month</span>
                      <span>{Math.floor(((apiKey.usageCount ?? 0) / 10000) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-purple-600 rounded-full"
                        style={{ width: `${Math.min(((apiKey.usageCount ?? 0) / 10000) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
            </div>
          )}

          {/* Security Notice */}
          <div className="mt-6 p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-orange-200">
                <strong>Security Best Practices:</strong> Keep your API keys secure and never share them publicly. 
                Rotate keys regularly and revoke any keys that may have been compromised.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create New Key Modal */}
      {showNewKeyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full p-6 rounded-2xl border border-white/10 bg-black backdrop-blur-xl">
            <h3 className="text-xl font-bold mb-4">Create New API Key</h3>
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Key Name
                </label>
                <input
                  type="text"
                  placeholder="My API Key"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description (optional)
                </label>
                <input
                  type="text"
                  placeholder="Key description"
                  value={keyDescription}
                  onChange={(e) => setKeyDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                />
              </div>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowNewKeyModal(false)}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={createKey}
                disabled={!keyName.trim()}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all disabled:opacity-50"
              >
                Create Key
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Key Created Modal */}
      {newKeyData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full p-6 rounded-2xl border border-white/10 bg-black backdrop-blur-xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <h3 className="text-xl font-bold">API Key Created!</h3>
            </div>
            
            <div className="mb-6">
              <p className="text-sm text-gray-400 mb-4">
                Your API key has been created. <strong className="text-orange-500">Copy it now</strong> - you won't be able to see it again!
              </p>
              
              <div className="p-4 bg-white/5 rounded-lg border border-white/10 font-mono text-sm break-all">
                {newKeyData.apiKey}
              </div>
              
              <button
                onClick={() => {
                  navigator.clipboard.writeText(newKeyData.apiKey);
                  showFeedback('success', 'API key copied to clipboard');
                }}
                className="mt-3 w-full px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
              >
                <Copy className="w-4 h-4" />
                <span>Copy to Clipboard</span>
              </button>
            </div>
            
            <button
              onClick={() => setNewKeyData(null)}
              className="w-full px-4 py-2 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
      {/* Feedback Toast */}
      {feedback && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg border flex items-center gap-2 shadow-lg backdrop-blur-sm transition-all ${
          feedback.type === 'success'
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {feedback.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">{feedback.message}</span>
        </div>
      )}
    </div>
  );
}
