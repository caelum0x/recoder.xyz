'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Trash2, Eye, EyeOff, ExternalLink, CheckCircle2, ArrowLeft, Terminal, Key as KeyIcon, Loader2 } from 'lucide-react';

interface ApiKey {
  id: string;
  provider: string;
  name: string;
  keyPrefix: string;
  lastUsed: string | null;
  createdAt: string;
}

const PROVIDERS = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access 40+ AI models from one API (Recommended)',
    getKeyUrl: 'https://openrouter.ai/keys',
    docs: 'https://openrouter.ai/docs',
    keyFormat: 'sk-or-v1-...',
    features: ['GPT-4, Claude, Gemini, Llama', 'Pay-as-you-go pricing', 'No subscriptions needed']
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Claude AI models (Sonnet, Opus, Haiku)',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    docs: 'https://docs.anthropic.com/',
    keyFormat: 'sk-ant-...',
    features: ['Claude 3.5 Sonnet', 'Claude 3 Opus', 'Long context (200K tokens)']
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    description: 'Use your Claude Pro/Max subscription in containers',
    getKeyUrl: '/settings/claude-code',
    docs: 'https://code.claude.com/docs',
    keyFormat: 'sk-ant-oat01-...',
    features: ['No API costs', 'Uses your subscription', 'Available in all containers'],
    isSpecial: true
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5, and DALL-E',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    docs: 'https://platform.openai.com/docs',
    keyFormat: 'sk-...',
    features: ['GPT-4 Turbo', 'GPT-3.5 Turbo', 'Function calling']
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Ultra-fast LLM inference',
    getKeyUrl: 'https://console.groq.com/keys',
    docs: 'https://console.groq.com/docs',
    keyFormat: 'gsk_...',
    features: ['Llama 3', 'Mixtral', 'Lightning fast responses']
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: 'Google\'s latest AI models (Gemini Pro, Ultra)',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    docs: 'https://ai.google.dev/docs',
    keyFormat: 'AIza...',
    features: ['Gemini Pro', 'Gemini Ultra', 'Multimodal capabilities', 'Used by Gemini CLI in containers']
  }
];

export default function AIProvidersPage() {
  const searchParams = useSearchParams();
  const redirectToWebIDE = searchParams.get('redirect') === 'web-ide';

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [keyName, setKeyName] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const response = await fetch('/api/user/ai-provider-keys');
      const data = await response.json();

      if (data.success) {
        setApiKeys(data.keys || []);
      }
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const response = await fetch('/api/user/ai-provider-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedProvider,
          apiKey: newApiKey,
          name: keyName || undefined
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Show appropriate success message based on redirect flow
        if (redirectToWebIDE) {
          setSuccess('API key added successfully! Redirecting to Web IDE...');
        } else {
          setSuccess(data.message);
        }

        setShowAddForm(false);
        setSelectedProvider('');
        setNewApiKey('');
        setKeyName('');
        fetchApiKeys();

        // If user came from "Launch Web IDE" flow, redirect them to Web IDE
        if (redirectToWebIDE) {
          // Show success message briefly, then redirect
          setTimeout(() => {
            const webIdeUrl = process.env.NEXT_PUBLIC_RECODER_WEB_URL ||
              (process.env.NODE_ENV === 'production' ? 'https://web.recoder.xyz' : 'http://localhost:5173');
            window.location.href = webIdeUrl;
          }, 1500); // 1.5 second delay to show success message
        }
      } else {
        setError(data.error || 'Failed to add API key');
      }
    } catch (err) {
      setError('Failed to add API key');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) return;

    try {
      const response = await fetch(`/api/user/ai-provider-keys?id=${keyId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess('API key deleted');
        fetchApiKeys();
      } else {
        setError(data.error || 'Failed to delete API key');
      }
    } catch (err) {
      setError('Failed to delete API key');
    }
  };

  const getProviderInfo = (providerId: string) => {
    return PROVIDERS.find(p => p.id === providerId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading API keys...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/settings" className="flex items-center space-x-2 group text-white hover:text-orange-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Settings</span>
          </Link>
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-xl flex items-center justify-center">
                <KeyIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">AI Provider Keys</h1>
                <p className="text-gray-400">
                  Recoder.xyz is 100% free! Just bring your own API key from your preferred AI provider.
                </p>
              </div>
            </div>
          </div>

          {/* Alert Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              <span>{success}</span>
              {redirectToWebIDE && success.includes('Redirecting') && (
                <Loader2 className="w-5 h-5 animate-spin ml-2" />
              )}
            </div>
          )}

          {/* Current Keys */}
          {apiKeys.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Your API Keys</h2>
              <div className="space-y-3">
                {apiKeys.map(key => {
                  const provider = getProviderInfo(key.provider);
                  return (
                    <div
                      key={key.id}
                      className="p-4 border border-white/10 rounded-xl bg-black/50 backdrop-blur-xl flex items-center justify-between hover:border-orange-500/30 transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-white">{provider?.name || key.provider}</div>
                        <div className="text-sm text-gray-400 font-mono">
                          {key.keyPrefix}
                        </div>
                        {key.lastUsed && (
                          <div className="text-xs text-gray-500 mt-1">
                            Last used: {new Date(key.lastUsed).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteKey(key.id)}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add New Key Button */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="mb-8 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add API Key
            </button>
          )}

          {/* Add Key Form */}
          {showAddForm && (
            <div className="mb-8 p-6 border border-white/10 rounded-2xl bg-black/50 backdrop-blur-xl">
              <h2 className="text-xl font-semibold mb-4">Add New API Key</h2>

              <form onSubmit={handleAddKey} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Select Provider</label>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-white/10 rounded-lg bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">Choose a provider...</option>
                    {PROVIDERS.map(provider => (
                      <option key={provider.id} value={provider.id} className="bg-gray-900">
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedProvider && (
                  <>
                    {/* Provider Info */}
                    <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                      {(() => {
                        const provider = getProviderInfo(selectedProvider);
                        if (!provider) return null;

                        return (
                          <div className="space-y-3">
                            <div>
                              <h3 className="font-semibold text-orange-500 mb-1">{provider.name}</h3>
                              <p className="text-sm text-gray-300">{provider.description}</p>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-300 mb-1">Features:</p>
                              <ul className="text-sm text-gray-400 space-y-1">
                                {provider.features.map((feature, idx) => (
                                  <li key={idx}>• {feature}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="flex items-center gap-3">
                              <a
                                href={provider.getKeyUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1"
                              >
                                Get API Key <ExternalLink className="w-3 h-3" />
                              </a>
                              <span className="text-gray-600">|</span>
                              <a
                                href={provider.docs}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-orange-400 hover:text-orange-300 flex items-center gap-1"
                              >
                                Documentation <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                            <div className="text-xs text-gray-500">
                              Expected format: <code className="font-mono bg-white/5 px-2 py-0.5 rounded">{provider.keyFormat}</code>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Key Name (Optional) */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Key Name <span className="text-gray-500">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={keyName}
                        onChange={(e) => setKeyName(e.target.value)}
                        placeholder="My Production Key"
                        className="w-full px-4 py-3 border border-white/10 rounded-lg bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    {/* API Key Input */}
                    <div>
                      <label className="block text-sm font-medium mb-2">API Key</label>
                      <div className="relative">
                        <input
                          type={showKey ? 'text' : 'password'}
                          value={newApiKey}
                          onChange={(e) => setNewApiKey(e.target.value)}
                          required
                          placeholder={getProviderInfo(selectedProvider)?.keyFormat}
                          className="w-full px-4 py-3 pr-12 border border-white/10 rounded-lg bg-white/5 text-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey(!showKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                        >
                          {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Your API key is encrypted and stored securely. We never see or store your plain text key.
                      </p>
                    </div>

                    {/* Form Actions */}
                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddForm(false);
                          setSelectedProvider('');
                          setNewApiKey('');
                          setKeyName('');
                          setError('');
                        }}
                        className="px-6 py-3 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Plus className="w-5 h-5" />
                            Add API Key
                          </>
                        )}
                      </button>
                    </div>
                  </>
                )}
              </form>
            </div>
          )}

          {/* Info Section */}
          <div className="p-6 rounded-2xl bg-blue-500/10 border border-blue-500/20">
            <h3 className="font-semibold text-blue-400 mb-2">Why Bring Your Own Key?</h3>
            <ul className="text-sm text-gray-300 space-y-2">
              <li>• <strong>100% Free:</strong> No monthly subscription, no hidden fees</li>
              <li>• <strong>Pay-as-you-go:</strong> Only pay your AI provider for what you use (typically $0.01-0.10 per chat)</li>
              <li>• <strong>Your Control:</strong> Use your own credits, switch providers anytime</li>
              <li>• <strong>Privacy First:</strong> Your API key is encrypted and only you can access it</li>
            </ul>
          </div>

          {/* AI CLI Tools Section */}
          <div className="mt-6 p-6 rounded-2xl bg-purple-500/10 border border-purple-500/20">
            <h3 className="font-semibold text-purple-400 mb-2 flex items-center gap-2">
              <Terminal className="w-5 h-5" />
              AI CLI Tools in Containers
            </h3>
            <p className="text-sm text-gray-300 mb-3">
              Your API keys are automatically injected into container environments, enabling these powerful AI CLI tools:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="font-medium text-white mb-1">OpenAI Codex</div>
                <p className="text-xs text-gray-400">AI coding assistant from OpenAI</p>
                <code className="text-xs text-orange-400">codex</code>
                <span className="text-xs text-gray-500 ml-2">Uses: OPENAI_API_KEY</span>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="font-medium text-white mb-1">Google Gemini CLI</div>
                <p className="text-xs text-gray-400">Google&apos;s AI assistant for terminal</p>
                <code className="text-xs text-orange-400">gemini</code>
                <span className="text-xs text-gray-500 ml-2">Uses: GEMINI_API_KEY</span>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="font-medium text-white mb-1">Claude Code</div>
                <p className="text-xs text-gray-400">Anthropic&apos;s CLI coding assistant</p>
                <code className="text-xs text-orange-400">claude</code>
                <span className="text-xs text-gray-500 ml-2">Uses: Claude Code Token</span>
              </div>
              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="font-medium text-white mb-1">OpenCode</div>
                <p className="text-xs text-gray-400">Multi-provider AI agent</p>
                <code className="text-xs text-orange-400">opencode</code>
                <span className="text-xs text-gray-500 ml-2">Supports multiple providers</span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Just open a terminal in your project and run these commands. Your keys are securely injected at container startup.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
