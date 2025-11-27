'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';

function CLIAuthorizeContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [userCode, setUserCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Get user code from URL params if provided
  useEffect(() => {
    const codeFromUrl = searchParams.get('code');
    if (codeFromUrl) {
      setUserCode(codeFromUrl);
    }
  }, [searchParams]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isPending && !session) {
      const currentUrl = window.location.href;
      router.push(`/auth/signin?redirect=${encodeURIComponent(currentUrl)}`);
    }
  }, [session, isPending, router]);

  const handleAuthorize = async (action: 'authorize' | 'deny') => {
    if (!userCode.trim()) {
      setError('Please enter the code from your CLI');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/cli/device', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userCode: userCode.toUpperCase().trim(),
          action,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Authorization failed');
      }

      setSuccess(true);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed');
    } finally {
      setLoading(false);
    }
  };

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect to login
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Authorize CLI Access
          </h1>
          <p className="text-gray-400">
            Connect your CLI to your Recoder account
          </p>
        </div>

        {/* Success State */}
        {success ? (
          <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-xl p-8 text-center">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Authorization Successful!
            </h2>
            <p className="text-gray-400 mb-6">
              Return to your CLI to continue
            </p>
            <button
              onClick={() => router.push('/dashboard')}
              className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white rounded-lg transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700 rounded-xl p-8 backdrop-blur-sm">
            {/* User Info */}
            <div className="flex items-center space-x-3 mb-6 p-4 bg-gray-800/50 rounded-lg">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xl">
                {session.user.name?.charAt(0).toUpperCase() || session.user.email?.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-white font-medium">{session.user.name}</div>
                <div className="text-gray-400 text-sm">{session.user.email}</div>
              </div>
            </div>

            {/* Instructions */}
            <div className="mb-6">
              <h2 className="text-white font-semibold mb-2">Enter Device Code</h2>
              <p className="text-gray-400 text-sm">
                Enter the 6-character code displayed in your CLI (e.g., ABC-123)
              </p>
            </div>

            {/* Code Input */}
            <input
              type="text"
              value={userCode}
              onChange={(e) => {
                const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                setUserCode(value);
                setError('');
              }}
              placeholder="ABC-123"
              maxLength={7}
              className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-lg text-white text-center text-2xl font-mono tracking-wider focus:outline-none focus:border-orange-500 transition-colors mb-2"
              disabled={loading}
            />

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3 mt-6">
              <button
                onClick={() => handleAuthorize('deny')}
                disabled={loading || !userCode.trim()}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                Deny
              </button>
              <button
                onClick={() => handleAuthorize('authorize')}
                disabled={loading || !userCode.trim()}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-600 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {loading ? 'Authorizing...' : 'Authorize'}
              </button>
            </div>

            {/* Security Note */}
            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <div className="flex items-start space-x-2">
                <svg
                  className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="text-blue-400 text-sm font-medium mb-1">Security Notice</p>
                  <p className="text-gray-400 text-xs">
                    Only authorize if you initiated this request from your CLI. This will grant CLI access to your Recoder account.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CLIAuthorizePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900">
          <div className="text-white">Loading...</div>
        </div>
      }
    >
      <CLIAuthorizeContent />
    </Suspense>
  );
}
