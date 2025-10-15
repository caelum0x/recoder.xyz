/**
 * Reset Password Page
 * Handles password reset with token validation
 */

'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { 
  ArrowLeft, 
  Terminal,
  Lock,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Loader2
} from 'lucide-react';

function ResetPasswordContent() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    let strength = 0;
    if (pass.length >= 8) strength++;
    if (pass.length >= 12) strength++;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) strength++;
    if (/\d/.test(pass)) strength++;
    if (/[^a-zA-Z\d]/.test(pass)) strength++;
    return strength;
  };

  const passwordStrength = getPasswordStrength(password);
  const strengthLabels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
      setError('No reset token found. Please request a new password reset link.');
      return;
    }

    // Validate token
    validateToken(token);
  }, [token]);

  const validateToken = async (resetToken: string) => {
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: resetToken, validate: true }),
      });

      const data = await response.json();

      if (data.valid) {
        setTokenValid(true);
      } else {
        setTokenValid(false);
        setError(data.error || 'Invalid or expired reset link.');
      }
    } catch (err) {
      setTokenValid(false);
      setError('Failed to validate reset link.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validation
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (passwordStrength < 2) {
      setError('Please choose a stronger password');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          token, 
          password,
          validate: false 
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        
        // Redirect to sign in after 3 seconds
        setTimeout(() => {
          window.location.href = '/auth/signin';
        }, 3000);
      } else {
        setError(data.error || 'Failed to reset password. Please try again.');
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
            {/* Loading Token Validation */}
            {tokenValid === null && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
                </div>
                <p className="text-gray-400">Validating reset link...</p>
              </div>
            )}

            {/* Invalid Token */}
            {tokenValid === false && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center">
                    <XCircle className="w-10 h-10 text-red-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-red-500">Invalid Reset Link</h1>
                  <p className="text-gray-400">{error}</p>
                </div>
                <div className="space-y-3">
                  <Link 
                    href="/auth/forgot-password"
                    className="block w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all text-center"
                  >
                    Request New Link
                  </Link>
                  <Link 
                    href="/auth/signin"
                    className="block text-sm text-orange-500 hover:text-orange-400 transition-colors"
                  >
                    Back to Sign In
                  </Link>
                </div>
              </div>
            )}

            {/* Success State */}
            {success && (
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-green-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h1 className="text-2xl font-bold text-green-500">Password Reset!</h1>
                  <p className="text-gray-400">
                    Your password has been reset successfully.
                  </p>
                </div>
                <div className="space-y-3">
                  <Link 
                    href="/auth/signin"
                    className="block w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all text-center"
                  >
                    Sign In Now
                  </Link>
                  <p className="text-sm text-gray-400">
                    Redirecting automatically in 3 seconds...
                  </p>
                </div>
              </div>
            )}

            {/* Reset Form */}
            {tokenValid && !success && (
              <>
                <div className="text-center space-y-3 mb-8">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center">
                      <Lock className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <h1 className="text-3xl font-bold">Set New Password</h1>
                  <p className="text-gray-400">
                    Choose a strong password for your account.
                  </p>
                </div>

                {error && (
                  <div className="mb-4 p-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder-gray-500"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    
                    {/* Password Strength Indicator */}
                    {password && (
                      <div className="space-y-2">
                        <div className="flex gap-1">
                          {[...Array(5)].map((_, i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-colors ${
                                i < passwordStrength ? strengthColors[passwordStrength - 1] : 'bg-gray-700'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-xs text-gray-400">
                          Strength: <span className={`font-medium ${passwordStrength >= 3 ? 'text-green-500' : 'text-orange-500'}`}>
                            {strengthLabels[passwordStrength - 1] || 'Very Weak'}
                          </span>
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder-gray-500"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-xs text-red-400">Passwords do not match</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading || password !== confirmPassword || passwordStrength < 2}
                    className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Resetting Password...</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-5 h-5" />
                        <span>Reset Password</span>
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
            )}
          </div>

          {/* Password Requirements */}
          {tokenValid && !success && (
            <div className="mt-6 p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="text-sm font-medium text-gray-300 mb-2">Password Requirements:</p>
              <ul className="text-xs text-gray-400 space-y-1">
                <li className={password.length >= 8 ? 'text-green-500' : ''}>• At least 8 characters</li>
                <li className={/[a-z]/.test(password) && /[A-Z]/.test(password) ? 'text-green-500' : ''}>• Mix of uppercase and lowercase</li>
                <li className={/\d/.test(password) ? 'text-green-500' : ''}>• At least one number</li>
                <li className={/[^a-zA-Z\d]/.test(password) ? 'text-green-500' : ''}>• At least one special character</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
