'use client';

import { useState } from 'react';
import { AlertCircle, Check, ExternalLink, Key, Loader2, X } from 'lucide-react';

interface APIKeyCollectionProps {
  onComplete: () => void;
  onSkip?: () => void;
  canSkip?: boolean;
}

export function APIKeyCollection({ onComplete, onSkip, canSkip = false }: APIKeyCollectionProps) {
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!apiKey.trim()) {
      setError('Please enter your API key');
      return;
    }

    if (!apiKey.startsWith('sk-or-')) {
      setError('Invalid API key format. OpenRouter keys start with "sk-or-"');
      return;
    }

    setIsValidating(true);

    try {
      const response = await fetch('/api/user/api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save API key');
      }

      // Success!
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save API key');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Key className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Connect Your OpenRouter API Key
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Free tier users need to provide their own API key
              </p>
            </div>
          </div>
          {canSkip && (
            <button
              onClick={onSkip}
              className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900 dark:text-blue-100">
                <p className="font-semibold mb-1">Why do I need this?</p>
                <p className="text-blue-700 dark:text-blue-300">
                  Recoder uses OpenRouter to access multiple AI models. Free tier users provide their own API
                  key, while Pro users get unlimited access with platform keys.
                </p>
              </div>
            </div>
          </div>

          {/* How to Get API Key */}
          <div className="space-y-4">
            <button
              onClick={() => setShowHelp(!showHelp)}
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
            >
              {showHelp ? 'Hide' : 'Show'} instructions to get your API key
            </button>

            {showHelp && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">
                    1
                  </div>
                  <div>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      Go to OpenRouter
                    </p>
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 mt-1"
                    >
                      openrouter.ai/keys
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">
                    2
                  </div>
                  <div>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      Sign up or log in
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      Create a free account if you don't have one
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">
                    3
                  </div>
                  <div>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      Create an API key
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      Click "Create Key" and copy the key (starts with sk-or-)
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold">
                    4
                  </div>
                  <div>
                    <p className="text-gray-900 dark:text-gray-100 font-medium">
                      Add credits (optional)
                    </p>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                      OpenRouter offers pay-as-you-go pricing. Start with $5 for testing.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* API Key Input Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="apiKey"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                OpenRouter API Key
              </label>
              <input
                type="password"
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-..."
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                disabled={isValidating}
              />
              {error && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </p>
              )}
            </div>

            {/* Security Notice */}
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <div className="flex gap-2 text-sm text-green-900 dark:text-green-100">
                <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <p>
                  Your API key is encrypted and stored securely. We never log or share your key.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isValidating || !apiKey.trim()}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {isValidating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Validating...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Save API Key
                  </>
                )}
              </button>

              {canSkip && (
                <button
                  type="button"
                  onClick={onSkip}
                  disabled={isValidating}
                  className="px-6 py-3 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Skip for Now
                </button>
              )}
            </div>
          </form>

          {/* Upgrade Option */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                Want to skip this step?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Upgrade to Pro and use our platform API keys with higher limits and no setup required.
              </p>
              <a
                href="/pricing"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                View Pro plans
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
