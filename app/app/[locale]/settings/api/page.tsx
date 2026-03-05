/**
 * API Settings Page
 * Manage OpenRouter API key and configuration
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft,
  Terminal,
  Key,
  Eye,
  EyeOff,
  Check,
  X,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Copy,
  Trash2
} from 'lucide-react';

export default function APISettingsPage() {
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null);

  const [apiConfig, setApiConfig] = useState({
    apiKey: '',
    useOwnKey: false,
    defaultModel: 'anthropic/claude-3-sonnet',
    maxTokens: 4096,
    temperature: 0.7
  });

  const models = [
    { id: 'anthropic/claude-3-sonnet', name: 'Claude 3 Sonnet' },
    { id: 'anthropic/claude-3-opus', name: 'Claude 3 Opus' },
    { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
    { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo' },
    { id: 'openai/gpt-4', name: 'GPT-4' },
    { id: 'google/gemini-pro', name: 'Gemini Pro' },
    { id: 'meta-llama/llama-3-70b', name: 'Llama 3 70B' }
  ];

  const validateApiKey = async (key: string) => {
    if (!key || key.length < 20) {
      setApiKeyValid(false);
      return false;
    }

    setValidating(true);
    setError('');

    try {
      const response = await fetch('/api/user/api-key/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key })
      });

      const data = await response.json();

      if (data.valid) {
        setApiKeyValid(true);
        return true;
      } else {
        setApiKeyValid(false);
        setError(data.error || 'Invalid API key');
        return false;
      }
    } catch (err) {
      setApiKeyValid(false);
      setError('Failed to validate API key');
      return false;
    } finally {
      setValidating(false);
    }
  };

  const handleSave = async () => {
    if (apiConfig.useOwnKey && !apiConfig.apiKey) {
      setError('Please enter your OpenRouter API key');
      return;
    }

    if (apiConfig.useOwnKey) {
      const isValid = await validateApiKey(apiConfig.apiKey);
      if (!isValid) return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/user/api-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiConfig)
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('API configuration saved successfully');
        setTimeout(() => setSuccess(''), 3000);
      } else {
        setError(data.error || 'Failed to save configuration');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveKey = () => {
    setApiConfig({ ...apiConfig, apiKey: '', useOwnKey: false });
    setApiKeyValid(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess('Copied to clipboard!');
    setTimeout(() => setSuccess(''), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="container mx-auto px-6 py-24">
        <div className="max-w-2xl mx-auto">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2">API Configuration</h1>
            <p className="text-gray-400">Manage your OpenRouter API key and settings</p>
          </div>

          {/* Messages */}
          {success && (
            <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-green-400">{success}</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* API Key Option */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">API Key</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5">
                  <div>
                    <div className="font-medium">Use Your Own API Key</div>
                    <div className="text-sm text-gray-400">
                      Bring your own OpenRouter API key for unlimited usage
                    </div>
                  </div>
                  <button
                    onClick={() => setApiConfig({ ...apiConfig, useOwnKey: !apiConfig.useOwnKey })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      apiConfig.useOwnKey ? 'bg-orange-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        apiConfig.useOwnKey ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {apiConfig.useOwnKey && (
                  <div className="space-y-4 p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <div className="space-y-2">
                      <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300">
                        OpenRouter API Key
                      </label>
                      <div className="relative">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                          id="apiKey"
                          type={showApiKey ? 'text' : 'password'}
                          value={apiConfig.apiKey}
                          onChange={(e) => {
                            setApiConfig({ ...apiConfig, apiKey: e.target.value });
                            setApiKeyValid(null);
                          }}
                          placeholder="sk-or-v1-..."
                          className="w-full pl-12 pr-24 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white font-mono text-sm"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                          {apiKeyValid !== null && (
                            <div className={apiKeyValid ? 'text-green-500' : 'text-red-500'}>
                              {apiKeyValid ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="text-gray-400 hover:text-white"
                          >
                            {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">
                          Format: sk-or-v1-...
                        </span>
                        {apiConfig.apiKey && (
                          <button
                            onClick={handleRemoveKey}
                            className="text-red-400 hover:text-red-300 flex items-center space-x-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex space-x-3">
                      <button
                        onClick={() => validateApiKey(apiConfig.apiKey)}
                        disabled={validating || !apiConfig.apiKey}
                        className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                      >
                        {validating ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Validating...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            <span>Validate Key</span>
                          </>
                        )}
                      </button>
                      <a
                        href="https://openrouter.ai/keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center space-x-2"
                      >
                        <span>Get Key</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>

                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                        <div className="text-xs text-blue-300">
                          <strong>Privacy:</strong> Your API key is encrypted and stored securely. We never see or log your key.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Model Configuration */}
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-lg font-bold mb-4">Model Configuration</h2>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="defaultModel" className="block text-sm font-medium text-gray-300">
                    Default Model
                  </label>
                  <select
                    id="defaultModel"
                    value={apiConfig.defaultModel}
                    onChange={(e) => setApiConfig({ ...apiConfig, defaultModel: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white appearance-none"
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id} className="bg-gray-900">
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label htmlFor="maxTokens" className="block text-sm font-medium text-gray-300">
                    Max Tokens: {apiConfig.maxTokens}
                  </label>
                  <input
                    id="maxTokens"
                    type="range"
                    min="1024"
                    max="8192"
                    step="512"
                    value={apiConfig.maxTokens}
                    onChange={(e) => setApiConfig({ ...apiConfig, maxTokens: parseInt(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>1K</span>
                    <span>4K</span>
                    <span>8K</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor="temperature" className="block text-sm font-medium text-gray-300">
                    Temperature: {apiConfig.temperature}
                  </label>
                  <input
                    id="temperature"
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={apiConfig.temperature}
                    onChange={(e) => setApiConfig({ ...apiConfig, temperature: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Precise</span>
                    <span>Balanced</span>
                    <span>Creative</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Documentation */}
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <div className="flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-gray-400">
                  <strong className="text-white">Need help?</strong> Check out the{' '}
                  <Link href="/docs/api" className="text-orange-500 hover:text-orange-400 underline">
                    API documentation
                  </Link>{' '}
                  for more information about OpenRouter and model configuration.
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end space-x-3">
              <Link
                href="/settings"
                className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all"
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center space-x-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>Save Configuration</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
