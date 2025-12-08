/**
 * Onboarding - Setup API Key
 * Fourth step: Configure OpenRouter API key (for free users)
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session-provider';
import Link from 'next/link';
import { 
  Terminal,
  Key,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Check,
  AlertCircle,
  Eye,
  EyeOff
} from 'lucide-react';

export default function SetupApiKeyPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (!session && !isPending) {
      router.push('/auth/signin');
    } else if (session && !isPending) {
      setLoading(false);
    }
  }, [session, isPending, router]);

  const validateApiKey = (key: string): boolean => {
    // OpenRouter keys start with sk-or-v1-
    return key.startsWith('sk-or-v1-') && key.length > 20;
  };

  const handleValidate = async () => {
    if (!apiKey) {
      setError('Please enter an API key');
      return;
    }

    if (!validateApiKey(apiKey)) {
      setError('Invalid API key format. Must start with sk-or-v1-');
      return;
    }

    setValidating(true);
    setError('');

    try {
      // TODO: Add actual API key validation endpoint
      const response = await fetch('/api/user/api-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey }),
      });

      if (!response.ok) {
        throw new Error('Failed to validate API key');
      }

      // Key is valid, continue to complete
      router.push('/onboarding/complete');
    } catch (error) {
      console.error('Validation error:', error);
      setError('Failed to validate API key. Please try again.');
    } finally {
      setValidating(false);
    }
  };

  const handleSkip = () => {
    router.push('/onboarding/complete');
  };

  if (loading || isPending) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Progress Bar */}
      <div className="fixed top-0 w-full h-1 bg-white/10 z-50">
        <div
          className="h-full bg-gradient-to-r from-orange-500 to-purple-600 transition-all duration-500"
          style={{ width: '80%' }}
        />
      </div>

      {/* Header */}
      <header className="fixed top-1 w-full z-40 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          <div className="text-sm text-gray-400">
            Step 4 of 5
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-24 mt-16">
        <div className="max-w-2xl mx-auto">
          {/* Title */}
          <div className="text-center mb-12">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Key className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Setup Your API Key</h1>
            <p className="text-xl text-gray-400">Connect your OpenRouter API key to get started</p>
          </div>

          {/* Info Box */}
          <div className="p-6 rounded-2xl border border-blue-500/30 bg-blue-500/5 mb-8">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-gray-300">
                <p className="font-medium mb-2">Why do I need this?</p>
                <p className="text-gray-400">
                  Free tier users use their own OpenRouter API key to access 50+ AI models. 
                  This gives you full control over your API usage and costs. Pro and Enterprise 
                  users get platform-provided credits and don't need to provide their own key.
                </p>
              </div>
            </div>
          </div>

          {/* API Key Input */}
          <div className="mb-8">
            <label className="block text-lg font-medium mb-4">
              OpenRouter API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setError('');
                }}
                placeholder="sk-or-v1-..."
                className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-white placeholder-gray-500"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
              >
                {showKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {error && (
              <div className="mt-2 flex items-center space-x-2 text-red-500 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* How to Get Key */}
          <div className="p-6 rounded-2xl border border-white/10 bg-white/5 mb-8">
            <h3 className="font-bold mb-4">How to get your OpenRouter API key:</h3>
            <ol className="space-y-3 text-sm text-gray-300">
              <li className="flex items-start space-x-3">
                <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                <div>
                  <a 
                    href="https://openrouter.ai/keys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-orange-500 hover:text-orange-400 inline-flex items-center space-x-1"
                  >
                    <span>Visit OpenRouter</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <span className="text-gray-400"> and sign up for a free account</span>
                </div>
              </li>
              <li className="flex items-start space-x-3">
                <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                <span>Navigate to the API Keys section</span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                <span>Create a new API key</span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-xs font-bold flex-shrink-0">4</span>
                <span>Copy the key (starts with sk-or-v1-) and paste it above</span>
              </li>
            </ol>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-4 mb-8">
            <button
              onClick={handleValidate}
              disabled={!apiKey || validating}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {validating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Validating...</span>
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  <span>Save & Continue</span>
                </>
              )}
            </button>
          </div>

          {/* Skip Option */}
          <div className="text-center">
            <button
              onClick={handleSkip}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Skip for now, I'll add it later
            </button>
          </div>

          {/* Navigation */}
          <div className="flex justify-between items-center mt-12">
            <Link
              href="/onboarding/choose-plan"
              className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium transition-all flex items-center space-x-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
