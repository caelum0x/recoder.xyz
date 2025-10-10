'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function OnboardingPage() {
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
    if (!apiKey || !apiKey.startsWith('sk-or-v1-')) {
      setError('Please enter a valid OpenRouter API key starting with "sk-or-v1-"');
      return false;
    }

    setValidating(true);
    setError('');

    try {
      const response = await fetch('/api/user/openrouter/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });

      const data = await response.json();

      if (!data.valid) {
        setError(data.error || 'Invalid API key');
        return false;
      }

      return true;
    } catch (err) {
      setError('Failed to validate API key. Please try again.');
      return false;
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (step === 1) {
      // Validate and save API key
      const isValid = await validateApiKey();
      if (!isValid) return;

      setLoading(true);
      try {
        const response = await fetch('/api/user/openrouter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            userId,
            apiKey,
            provider: 'openrouter'
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || 'Failed to save API key');
          return;
        }

        setStep(2);
      } catch (err) {
        setError('Failed to save API key. Please try again.');
      } finally {
        setLoading(false);
      }
    } else {
      // Complete onboarding
      router.push('/dashboard');
    }
  };

  const skipForNow = () => {
    router.push('/dashboard?onboarding=incomplete');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-indigo-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Step {step} of 2</span>
            <span className="text-sm font-medium text-gray-600">{step === 1 ? '50%' : '100%'}</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-purple-600 to-blue-600 transition-all duration-300"
              style={{ width: `${step === 1 ? 50 : 100}%` }}
            />
          </div>
        </div>

        {step === 1 ? (
          <>
            {/* Step 1: API Key Setup */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Add Your OpenRouter API Key</h1>
              <p className="text-gray-600">
                Free plan users need to provide their own OpenRouter API key to use Recoder CLI.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
                  OpenRouter API Key
                </label>
                <input
                  type="password"
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-or-v1-..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  required
                />
                <p className="mt-2 text-sm text-gray-500">
                  Don't have an OpenRouter API key?{' '}
                  <a 
                    href="https://openrouter.ai/keys" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-700 font-medium"
                  >
                    Get one here →
                  </a>
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <svg className="w-5 h-5 text-red-500 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-blue-500 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-blue-700">
                    <p className="font-medium mb-1">Your API key is secure</p>
                    <p>We encrypt your API key before storing it. You can update or remove it anytime from your settings.</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={skipForNow}
                  className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
                >
                  Skip for Now
                </button>
                <button
                  type="submit"
                  disabled={loading || validating || !apiKey}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {validating ? 'Validating...' : loading ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </form>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="text-sm text-gray-600">
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
              <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">You're All Set!</h1>
              <p className="text-gray-600 mb-8">
                Your OpenRouter API key has been securely saved. You can now start using Recoder CLI.
              </p>

              <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
                <h3 className="font-semibold text-gray-900 mb-4">Next Steps:</h3>
                <div className="space-y-3">
                  <div className="flex items-start">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-purple-600 text-white rounded-full text-sm font-medium mr-3 flex-shrink-0">1</span>
                    <div>
                      <p className="font-medium text-gray-900">Install Recoder CLI</p>
                      <code className="text-sm bg-gray-200 px-2 py-1 rounded mt-1 block">npm install -g recoder-code</code>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-purple-600 text-white rounded-full text-sm font-medium mr-3 flex-shrink-0">2</span>
                    <div>
                      <p className="font-medium text-gray-900">Authenticate</p>
                      <code className="text-sm bg-gray-200 px-2 py-1 rounded mt-1 block">recoder auth login</code>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <span className="inline-flex items-center justify-center w-6 h-6 bg-purple-600 text-white rounded-full text-sm font-medium mr-3 flex-shrink-0">3</span>
                    <div>
                      <p className="font-medium text-gray-900">Start Building</p>
                      <code className="text-sm bg-gray-200 px-2 py-1 rounded mt-1 block">recoder "build a React app"</code>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => router.push('/dashboard')}
                className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all"
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
