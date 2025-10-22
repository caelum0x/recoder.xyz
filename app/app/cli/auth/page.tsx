'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from '@/lib/auth-client';
import { useRouter, useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';

function CLIAuthContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get('code');

  const [userCode, setUserCode] = useState(codeFromUrl || '');
  const [deviceCodeInfo, setDeviceCodeInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent('/cli/auth' + (codeFromUrl ? `?code=${codeFromUrl}` : ''))}`);
    }
  }, [status, router, codeFromUrl]);

  // Load device code info when user code is provided
  useEffect(() => {
    if (userCode && session) {
      loadDeviceCodeInfo();
    }
  }, [userCode, session]);

  // Countdown timer
  useEffect(() => {
    if (deviceCodeInfo?.expiresAt) {
      const interval = setInterval(() => {
        const now = new Date().getTime();
        const expiry = new Date(deviceCodeInfo.expiresAt).getTime();
        const remaining = Math.max(0, Math.floor((expiry - now) / 1000));
        setTimeRemaining(remaining);

        if (remaining === 0) {
          setError('This code has expired. Please generate a new one from your CLI.');
        }
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [deviceCodeInfo]);

  const loadDeviceCodeInfo = async () => {
    try {
      setError('');
      const response = await fetch(`/api/auth/cli/authorize?user_code=${userCode}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Invalid or expired code');
        return;
      }

      setDeviceCodeInfo(data);
    } catch (err: any) {
      setError('Failed to load code information');
    }
  };

  const handleAuthorize = async (action: 'approve' | 'deny') => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch('/api/auth/cli/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_code: userCode,
          action,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Authorization failed');
      }

      if (action === 'approve') {
        setSuccess(true);
      } else {
        setError('Authorization denied');
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-full bg-green-500/20 border-2 border-green-500 mb-6">
              <svg className="h-10 w-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">
              Authorization Successful!
            </h1>
            <p className="text-gray-400 mb-6">
              You can now return to your terminal. The CLI has been successfully authenticated.
            </p>
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700 mb-6">
              <p className="text-sm text-gray-400 mb-2">Authenticated as:</p>
              <p className="text-white font-medium">{session?.user?.email}</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg transition-all"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main authorization flow
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-gradient-to-r from-orange-500 to-purple-600 text-white px-4 py-2 rounded-lg font-bold text-xl mb-4">
            recoder.xyz
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            Authorize CLI Access
          </h1>
          <p className="text-gray-400">
            Authenticate your Recoder CLI with your account
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 rounded-lg p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Code input */}
        {!deviceCodeInfo && (
          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Enter the code from your terminal:
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={userCode}
                onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                placeholder="ABCD-1234"
                className="flex-1 bg-gray-900 border border-gray-600 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono text-lg tracking-wider text-center"
                maxLength={9}
              />
              <button
                onClick={loadDeviceCodeInfo}
                disabled={!userCode || loading}
                className="bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold px-6 py-3 rounded-lg transition-all disabled:cursor-not-allowed"
              >
                {loading ? 'Loading...' : 'Continue'}
              </button>
            </div>
            <p className="text-gray-500 text-sm mt-2">
              The code is shown in your terminal after running <code className="bg-gray-900 px-2 py-1 rounded">recoder auth login</code>
            </p>
          </div>
        )}

        {/* Device code info and authorization */}
        {deviceCodeInfo && !success && (
          <>
            {/* Timer */}
            {timeRemaining > 0 && (
              <div className="mb-6 bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Time remaining:</span>
                  <span className={`font-mono font-bold ${timeRemaining < 60 ? 'text-red-500' : 'text-orange-500'}`}>
                    {formatTime(timeRemaining)}
                  </span>
                </div>
                <div className="mt-2 bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-orange-500 to-purple-600 h-full transition-all duration-1000"
                    style={{ width: `${(timeRemaining / 600) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* User info */}
            <div className="mb-6 bg-gray-900/50 border border-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Authorizing as:</h3>
              <div className="flex items-center gap-4">
                {session?.user?.image && (
                  <img
                    src={session.user.image}
                    alt={session.user.name || ''}
                    className="w-12 h-12 rounded-full border-2 border-orange-500"
                  />
                )}
                <div>
                  <p className="text-white font-medium">{session?.user?.name}</p>
                  <p className="text-gray-400 text-sm">{session?.user?.email}</p>
                </div>
              </div>
            </div>

            {/* Code display */}
            <div className="mb-6 bg-gray-900/50 border border-gray-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Device Code:</h3>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-600">
                <p className="text-4xl font-mono font-bold text-orange-500 text-center tracking-wider">
                  {userCode}
                </p>
              </div>
            </div>

            {/* QR Code */}
            <div className="mb-8 flex justify-center">
              <div className="bg-white p-4 rounded-lg">
                <QRCodeSVG
                  value={`${process.env.NEXT_PUBLIC_APP_URL || 'https://recoder.xyz'}/cli/auth?code=${userCode}`}
                  size={160}
                />
              </div>
            </div>

            {/* Warning */}
            <div className="mb-6 bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="text-yellow-500 font-semibold text-sm mb-1">Important</h4>
                  <p className="text-yellow-200 text-sm">
                    Only authorize this device if you initiated this request from your terminal.
                    This will grant full access to your Recoder account.
                  </p>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => handleAuthorize('deny')}
                disabled={loading || timeRemaining === 0}
                className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white font-semibold py-3 px-6 rounded-lg transition-all disabled:cursor-not-allowed"
              >
                Deny
              </button>
              <button
                onClick={() => handleAuthorize('approve')}
                disabled={loading || timeRemaining === 0}
                className="flex-1 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-all disabled:cursor-not-allowed"
              >
                {loading ? 'Authorizing...' : 'Authorize Device'}
              </button>
            </div>
          </>
        )}

        {/* Help text */}
        <div className="mt-8 pt-8 border-t border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Need help?</h3>
          <div className="space-y-2 text-sm text-gray-500">
            <p>• Make sure you've run <code className="bg-gray-900 px-2 py-1 rounded text-orange-500">recoder auth login</code> in your terminal</p>
            <p>• The code expires after 10 minutes</p>
            <p>• You can scan the QR code with your phone if this page is open on another device</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CLIAuthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center">
        <div className="text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto"></div>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    }>
      <CLIAuthContent />
    </Suspense>
  );
}
