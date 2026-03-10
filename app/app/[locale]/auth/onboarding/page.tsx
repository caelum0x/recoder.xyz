'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    // Get user ID from query params or session
    const userIdParam = searchParams.get('userId');
    if (userIdParam) {
      setUserId(userIdParam);
    }
  }, [searchParams]);

  const validateApiKey = async () => {
    if (!apiKey || !apiKey.startsWith('sk-or-')) {
      setError('Please enter a valid OpenRouter API key starting with "sk-or-"');
      return false;
    }

    // Format check passes, actual validation happens on save
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (step === 1) {
      // Validate and save API key
      const isValid = await validateApiKey();
      if (!isValid) return;

      setLoading(true);
      try {
        const response = await fetch('/api/user/api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          setError(data.error || data.message || 'Failed to save API key');
          return;
        }

        setStep(2);
      } catch (err) {
        setError('Failed to save API key. Please try again.');
      } finally {
        setLoading(false);
      }
    } else {
      // Mark onboarding as complete and go to dashboard
      await fetch('/api/onboarding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboardingCompleted: true }),
      }).catch(() => {});
      router.push('/dashboard');
    }
  };

  const skipForNow = async () => {
    await fetch('/api/onboarding/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboardingCompleted: true }),
    }).catch(() => {});
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated gradient background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-black to-purple-600/5" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '12s' }} />
      </div>
      <div className="relative z-10 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl max-w-2xl w-full p-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-400">Step {step} of 2</span>
            <span className="text-sm font-medium text-gray-400">{step === 1 ? '50%' : '100%'}</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-purple-600 transition-all duration-300"
              style={{ width: `${step === 1 ? 50 : 100}%` }}
            />
          </div>
        </div>

        {step === 1 ? (
          <>
            {/* Step 1: API Key Setup */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500/10 rounded-full mb-4">
                <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">Add Your OpenRouter API Key</h1>
              <p className="text-gray-400">
                Free plan users need to provide their own OpenRouter API key to use Recoder CLI.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-2">
                  OpenRouter API Key
                </label>
                <input
                  type="password"
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder-gray-500"
                  required
                />
                <p className="mt-2 text-sm text-gray-400">
                  Don't have an OpenRouter API key?{' '}
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 hover:text-orange-400 font-medium"
                  >
                    Get one here →
                  </a>
                </p>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                </div>
              )}

              <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-blue-400 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-blue-300">
                    <p className="font-medium mb-1">Your API key is secure</p>
                    <p>We encrypt your API key before storing it. You can update or remove it anytime from your settings.</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={skipForNow}
                  className="flex-1 px-6 py-3 border border-white/10 rounded-lg text-gray-300 font-medium hover:border-white/20 hover:bg-white/5 transition-colors"
                >
                  Skip for Now
                </button>
                <button
                  type="submit"
                  disabled={loading || validating || !apiKey}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 text-white font-medium rounded-lg hover:from-orange-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {validating ? 'Validating...' : loading ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t border-white/10">
              <div className="text-sm text-gray-400">
                <p className="font-medium mb-2">💡 Why do I need this?</p>
                <ul className="space-y-1 ml-4">
                  <li>• Free tier uses your own API credits</li>
                  <li>• Pro users get platform API keys included</li>
                  <li>• You maintain full control of your usage</li>
                </ul>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: Success */}
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500/10 rounded-full mb-6">
                <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-white mb-4">You're All Set!</h1>
              <p className="text-gray-400 mb-8">
                Your OpenRouter API key has been securely saved. You can now start using Recoder CLI.
              </p>

              <div className="bg-white/5 rounded-lg p-6 mb-8 text-left border border-white/10">
                <h3 className="font-semibold text-white mb-4">Next Steps:</h3>
                <div className="space-y-3">
                  <div className="flex items-start">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-gradient-to-br from-orange-500 to-purple-600 text-white rounded-full text-sm font-medium mr-3 flex-shrink-0">1</span>
                    <div>
                      <p className="font-medium text-white">Install Recoder CLI</p>
                      <code className="text-sm bg-white/10 text-gray-300 px-2 py-1 rounded mt-1 block">npm install -g recoder-code</code>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-gradient-to-br from-orange-500 to-purple-600 text-white rounded-full text-sm font-medium mr-3 flex-shrink-0">2</span>
                    <div>
                      <p className="font-medium text-white">Authenticate</p>
                      <code className="text-sm bg-white/10 text-gray-300 px-2 py-1 rounded mt-1 block">recoder auth login</code>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-gradient-to-br from-orange-500 to-purple-600 text-white rounded-full text-sm font-medium mr-3 flex-shrink-0">3</span>
                    <div>
                      <p className="font-medium text-white">Start Building</p>
                      <code className="text-sm bg-white/10 text-gray-300 px-2 py-1 rounded mt-1 block">recoder "build a React app"</code>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 text-white font-medium rounded-lg hover:from-orange-600 hover:to-purple-700 transition-all"
              >
                Go to Dashboard
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}
