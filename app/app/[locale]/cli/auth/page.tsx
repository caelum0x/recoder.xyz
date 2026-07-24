'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSession } from '@/lib/session-provider';
import { useRouter, useSearchParams } from 'next/navigation';

// Clean, monochrome brand chrome shared across every state of this page. The old
// orange→purple gradient was the retired (Kortix/recortix) look; the current
// Recoder brand is restrained and dark, so this page is white-on-near-black with
// a single white primary action.
function Wordmark() {
  return (
    <div className="inline-flex items-center gap-2 mb-6">
      <div className="h-7 w-7 rounded-md bg-white text-black flex items-center justify-center font-bold text-sm">R</div>
      <span className="text-white font-semibold text-lg tracking-tight">Recoder</span>
    </div>
  );
}

const PRIMARY_BTN =
  'w-full bg-white text-black font-medium py-3 px-6 rounded-lg transition-colors hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed';
const SECONDARY_BTN =
  'flex-1 bg-neutral-800 text-white font-medium py-3 px-6 rounded-lg border border-neutral-700 transition-colors hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed';
const SHELL = 'min-h-screen bg-neutral-950 flex items-center justify-center p-4';
const CARD = 'w-full bg-neutral-900 rounded-2xl border border-neutral-800 p-8';

function CLIAuthContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeFromUrl = searchParams.get('code');

  const [userCode, setUserCode] = useState(codeFromUrl || '');
  const [deviceCodeInfo, setDeviceCodeInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    if (!isPending && !session) {
      setNeedsAuth(true);
    } else {
      setNeedsAuth(false);
    }
  }, [session, isPending]);

  useEffect(() => {
    if (userCode && session && !isPending) {
      loadDeviceCodeInfo();
    }
  }, [userCode, session, isPending]);

  const handleSignIn = () => {
    const callbackUrl = `/cli/auth${codeFromUrl ? `?code=${codeFromUrl}` : ''}`;
    router.push(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  };

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
        body: JSON.stringify({ user_code: userCode, action }),
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

  if (isPending) {
    return (
      <div className={SHELL}>
        <div className="text-center text-neutral-400">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-neutral-700 border-t-white mx-auto"></div>
          <p className="mt-4 text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (needsAuth) {
    return (
      <div className={SHELL}>
        <div className={`max-w-md ${CARD}`}>
          <div className="text-center">
            <Wordmark />
            <h1 className="text-2xl font-semibold text-white mb-2">Sign in required</h1>
            <p className="text-neutral-400 mb-6">Sign in to authorize your CLI device.</p>
            {userCode && (
              <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 mb-6">
                <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Device code</p>
                <p className="text-2xl font-mono font-semibold text-white tracking-widest">{userCode}</p>
              </div>
            )}
            <button onClick={handleSignIn} className={PRIMARY_BTN}>
              Sign in to continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={SHELL}>
        <div className={`max-w-md ${CARD}`}>
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-white/10 border border-white/20 mb-6">
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-white mb-2">Device authorized</h1>
            <p className="text-neutral-400 mb-6">
              You can return to your terminal — the CLI is now signed in.
            </p>
            <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 mb-6">
              <p className="text-xs uppercase tracking-wide text-neutral-500 mb-2">Signed in as</p>
              <p className="text-white font-medium">{session?.user?.email}</p>
            </div>
            <button onClick={() => router.push('/dashboard')} className={PRIMARY_BTN}>
              Go to dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={SHELL}>
      <div className={`max-w-2xl ${CARD}`}>
        <div className="text-center mb-8">
          <Wordmark />
          <h1 className="text-2xl font-semibold text-white mb-2">Authorize CLI access</h1>
          <p className="text-neutral-400">Connect your Recoder CLI to your account.</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/40 rounded-lg p-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {!deviceCodeInfo && (
          <div className="mb-8">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Enter the code from your terminal
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={userCode}
                onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                placeholder="ABCD-1234"
                className="flex-1 bg-neutral-950 border border-neutral-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-white/20 font-mono text-lg tracking-widest text-center"
                maxLength={9}
              />
              <button
                onClick={loadDeviceCodeInfo}
                disabled={!userCode || loading}
                className="bg-white text-black font-medium px-6 py-3 rounded-lg transition-colors hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? 'Loading…' : 'Continue'}
              </button>
            </div>
            <p className="text-neutral-500 text-sm mt-2">
              The code is shown in your terminal after running{' '}
              <code className="bg-neutral-950 border border-neutral-800 px-2 py-1 rounded text-neutral-300">recoder auth login</code>
            </p>
          </div>
        )}

        {deviceCodeInfo && !success && (
          <>
            {timeRemaining > 0 && (
              <div className="mb-6 bg-neutral-950 border border-neutral-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-400 text-sm">Time remaining</span>
                  <span className={`font-mono font-semibold ${timeRemaining < 60 ? 'text-red-400' : 'text-white'}`}>
                    {formatTime(timeRemaining)}
                  </span>
                </div>
                <div className="mt-2 bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-white h-full transition-all duration-1000"
                    style={{ width: `${(timeRemaining / 600) * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="mb-6 bg-neutral-950 border border-neutral-800 rounded-lg p-6">
              <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-4">Authorizing as</h3>
              <div className="flex items-center gap-4">
                {session?.user?.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || ''}
                    className="w-11 h-11 rounded-full border border-neutral-700"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-11 h-11 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                    <span className="text-white font-semibold text-sm">
                      {session?.user?.name?.charAt(0).toUpperCase() || session?.user?.email?.charAt(0).toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
                <div>
                  <p className="text-white font-medium">{session?.user?.name}</p>
                  <p className="text-neutral-400 text-sm">{session?.user?.email}</p>
                </div>
              </div>
            </div>

            <div className="mb-6 bg-neutral-950 border border-neutral-800 rounded-lg p-6">
              <h3 className="text-sm uppercase tracking-wide text-neutral-500 mb-4">Device code</h3>
              <div className="bg-neutral-900 rounded-lg p-4 border border-neutral-800">
                <p className="text-4xl font-mono font-semibold text-white text-center tracking-widest">
                  {userCode}
                </p>
              </div>
            </div>

            <div className="mb-6 bg-neutral-950 border border-neutral-800 rounded-lg p-4">
              <div className="flex gap-3">
                <svg className="w-5 h-5 text-neutral-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <h4 className="text-white font-medium text-sm mb-1">Only authorize if you started this</h4>
                  <p className="text-neutral-400 text-sm">
                    Authorizing grants this device full access to your Recoder account.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => handleAuthorize('deny')}
                disabled={loading || timeRemaining === 0}
                className={SECONDARY_BTN}
              >
                Deny
              </button>
              <button
                onClick={() => handleAuthorize('approve')}
                disabled={loading || timeRemaining === 0}
                className="flex-1 bg-white text-black font-medium py-3 px-6 rounded-lg transition-colors hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? 'Authorizing…' : 'Authorize device'}
              </button>
            </div>
          </>
        )}

        <div className="mt-8 pt-6 border-t border-neutral-800">
          <h3 className="text-sm font-medium text-neutral-400 mb-3">Need help?</h3>
          <div className="space-y-2 text-sm text-neutral-500">
            <p>• Run <code className="bg-neutral-950 border border-neutral-800 px-2 py-1 rounded text-neutral-300">recoder auth login</code> in your terminal first</p>
            <p>• The code expires after 10 minutes</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CLIAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
          <div className="text-center text-neutral-400">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-neutral-700 border-t-white mx-auto"></div>
            <p className="mt-4 text-sm">Loading…</p>
          </div>
        </div>
      }
    >
      <CLIAuthContent />
    </Suspense>
  );
}
