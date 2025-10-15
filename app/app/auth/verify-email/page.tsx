/**
 * Email Verification Page
 * Handles email verification tokens and resending verification emails
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, 
  Terminal,
  CheckCircle,
  XCircle,
  Mail,
  Loader2
} from 'lucide-react';

function VerifyEmailContent() {
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'resend'>('verifying');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (token) {
      verifyEmail(token);
    } else {
      setStatus('resend');
      setMessage('No verification token found. Please enter your email to resend.');
    }
  }, [token]);

  const verifyEmail = async (verificationToken: string) => {
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: verificationToken }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus('success');
        setMessage('Your email has been verified successfully!');
        
        // Redirect to dashboard after 3 seconds
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 3000);
      } else {
        setStatus('error');
        setMessage(data.error || 'Verification failed. The link may have expired.');
      }
    } catch (error) {
      setStatus('error');
      setMessage('Network error. Please try again.');
    }
  };

  const handleResendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, resend: true }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus('success');
        setMessage('Verification email sent! Please check your inbox.');
      } else {
        setMessage(data.error || 'Failed to send email. Please try again.');
      }
    } catch (error) {
      setMessage('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 group text-white hover:text-orange-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Home</span>
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
        <div className="max-w-md mx-auto">
          <div className="p-8 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
            {/* Verifying State */}
            {status === 'verifying' && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold">Verifying Your Email</h1>
                  <p className="text-gray-400">
                    Please wait while we verify your email address...
                  </p>
                </div>
              </div>
            )}

            {/* Success State */}
            {status === 'success' && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-green-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-green-500">Email Verified!</h1>
                  <p className="text-gray-400">{message}</p>
                </div>
                <div className="space-y-3">
                  <Link 
                    href="/dashboard"
                    className="block w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all text-center"
                  >
                    Go to Dashboard
                  </Link>
                  <p className="text-sm text-gray-400">
                    Redirecting automatically in 3 seconds...
                  </p>
                </div>
              </div>
            )}

            {/* Error State */}
            {status === 'error' && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                    <XCircle className="w-10 h-10 text-red-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-red-500">Verification Failed</h1>
                  <p className="text-gray-400">{message}</p>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => setStatus('resend')}
                    className="block w-full px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all"
                  >
                    Request New Link
                  </button>
                  <Link 
                    href="/auth/signin"
                    className="block text-sm text-orange-500 hover:text-orange-400 transition-colors"
                  >
                    Back to Sign In
                  </Link>
                </div>
              </div>
            )}

            {/* Resend State */}
            {status === 'resend' && (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center">
                      <Mail className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <h1 className="text-2xl font-bold">Resend Verification Email</h1>
                  <p className="text-gray-400">
                    Enter your email address and we'll send you a new verification link.
                  </p>
                </div>

                {message && (
                  <div className="p-4 text-sm text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                    {message}
                  </div>
                )}

                <form onSubmit={handleResendEmail} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                      Email Address
                    </label>
                    <input
                      id="email"
                      type="email"
                      placeholder="your@email.com"
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder-gray-500"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Sending...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-5 h-5" />
                        <span>Send Verification Email</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="text-center text-sm">
                  <Link href="/auth/signin" className="text-orange-500 hover:text-orange-400 transition-colors">
                    Back to Sign In
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Help Section */}
          <div className="mt-6 p-4 rounded-lg bg-white/5 border border-white/10">
            <p className="text-sm text-gray-400 text-center">
              Need help?{' '}
              <Link href="/support" className="text-orange-500 hover:text-orange-400">
                Contact Support
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
