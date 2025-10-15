/**
 * Forgot Password Page
 * Handles password reset requests
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, 
  Terminal,
  Mail,
  CheckCircle,
  Loader2
} from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.error || 'Failed to send reset email. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/auth/signin" className="flex items-center space-x-2 group text-white hover:text-orange-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Sign In</span>
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
            {!success ? (
              <>
                <div className="text-center space-y-3 mb-8">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center">
                      <Mail className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <h1 className="text-3xl font-bold">Reset Your Password</h1>
                  <p className="text-gray-400">
                    Enter your email address and we'll send you a link to reset your password.
                  </p>
                </div>

                {error && (
                  <div className="mb-4 p-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
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
                        <span>Sending Reset Link...</span>
                      </>
                    ) : (
                      <>
                        <Mail className="w-5 h-5" />
                        <span>Send Reset Link</span>
                      </>
                    )}
                  </button>
                </form>

                <div className="mt-6 text-center text-sm">
                  <Link href="/auth/signin" className="text-orange-500 hover:text-orange-400 transition-colors">
                    Back to Sign In
                  </Link>
                </div>
              </>
            ) : (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-green-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-green-500">Check Your Email</h1>
                  <p className="text-gray-400">
                    We've sent a password reset link to <strong className="text-white">{email}</strong>
                  </p>
                  <p className="text-sm text-gray-500">
                    The link will expire in 1 hour for security reasons.
                  </p>
                </div>

                <div className="space-y-3 pt-4">
                  <button
                    onClick={() => {
                      setSuccess(false);
                      setEmail('');
                    }}
                    className="block w-full px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all"
                  >
                    Send Another Link
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
          </div>

          {/* Help Section */}
          <div className="mt-6 space-y-4">
            <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
              <p className="text-sm text-orange-200">
                <strong>Didn't receive the email?</strong> Check your spam folder or{' '}
                <button 
                  onClick={() => setSuccess(false)}
                  className="underline hover:text-orange-300"
                >
                  try again
                </button>
              </p>
            </div>
            
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
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
    </div>
  );
}
