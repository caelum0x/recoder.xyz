/**
 * Sign Out Page
 * Handles user sign out and redirects
 */

'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signOut } from '@/lib/auth-client';
import { Terminal, LogOut, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';

function SignOutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'signing-out' | 'success' | 'error'>('signing-out');
  const [error, setError] = useState<string | null>(null);

  const rawRedirect = searchParams.get('redirect') || '/';
  const redirectUrl = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';

  useEffect(() => {
    handleSignOut();
  }, []);

  async function handleSignOut() {
    try {
      await signOut({
        fetchOptions: {
          onSuccess: () => {
            setStatus('success');
            // Clear any local storage items
            if (typeof window !== 'undefined') {
              localStorage.removeItem('recoder-session');
              localStorage.removeItem('recoder-user');
            }
            // Redirect after a short delay
            setTimeout(() => {
              router.push(redirectUrl);
            }, 1500);
          },
          onError: (ctx) => {
            console.error('Sign out error:', ctx.error);
            setError(ctx.error.message || 'Failed to sign out');
            setStatus('error');
          },
        },
      });
    } catch (err: any) {
      console.error('Sign out exception:', err);
      setError(err?.message || 'An unexpected error occurred');
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-md mx-auto">
          <div className="p-8 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
            {status === 'signing-out' && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center relative">
                    <LogOut className="w-8 h-8 text-white" />
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full animate-ping opacity-20"></div>
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold">Signing Out...</h1>
                  <p className="text-gray-400">
                    Please wait while we sign you out securely.
                  </p>
                </div>
                <div className="flex justify-center pt-4">
                  <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                </div>
              </div>
            )}

            {status === 'success' && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-green-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-green-500">Signed Out Successfully</h1>
                  <p className="text-gray-400">
                    You have been signed out securely. Redirecting...
                  </p>
                </div>
                <div className="pt-4">
                  <Link
                    href="/"
                    className="inline-flex items-center space-x-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all"
                  >
                    <span>Go to Home</span>
                    <ArrowLeft className="w-4 h-4 rotate-180" />
                  </Link>
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                    <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-red-500">Sign Out Failed</h1>
                  <p className="text-gray-400">
                    {error || 'An error occurred while signing out.'}
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                  <button
                    onClick={handleSignOut}
                    className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all"
                  >
                    Try Again
                  </button>
                  <Link
                    href="/"
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all"
                  >
                    Go to Home
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="mt-6 space-y-4">
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="text-sm text-gray-400 text-center">
                Your session has been cleared from this device.
                <br />
                <span className="text-gray-500">Other devices may still be signed in.</span>
              </p>
            </div>

            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <p className="text-sm text-orange-200 text-center">
                Want to sign back in?{' '}
                <Link href="/auth/signin" className="underline hover:text-orange-300 font-medium">
                  Sign In
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignOutPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <SignOutContent />
    </Suspense>
  );
}
