/**
 * Authentication Signup/Register Page
 * Enterprise-grade signup for Recoder.xyz
 */

'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Github,
  Mail,
  Terminal,
  Check,
  MailCheck,
  RefreshCw
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { signIn } from '@/lib/auth-client';

// Check if OAuth providers are configured (not placeholder values)
const githubId = process.env.NEXT_PUBLIC_GITHUB_ID || '';
const googleId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const hasGithubOAuth = githubId.length > 0 && !githubId.startsWith('placeholder');
const hasGoogleOAuth = googleId.length > 0 && !googleId.startsWith('placeholder');

function SignUpForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('return');

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password strength
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // If no verification required (e.g. OAuth), redirect directly
        if (data.requiresVerification === false && data.user?.token) {
          localStorage.setItem('authToken', data.user.token);
          const redirectTo = returnUrl || '/dashboard';
          setTimeout(() => {
            window.location.href = redirectTo;
          }, 1500);
        }

        // Show "check your email" screen for email/password signups
        setRegisteredEmail(formData.email);
        setSuccess(true);
      } else {
        setError(data.error || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResending(true);
    setResendMessage('');
    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: registeredEmail }),
      });
      const data = await response.json();
      if (data.success) {
        setResendMessage('Verification email sent! Check your inbox.');
      } else {
        setResendMessage(data.error || 'Failed to resend. Please try again.');
      }
    } catch {
      setResendMessage('Network error. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const features = [
    'Access to recoder-code CLI',
    'Access to recoder-web platform',
    'Multi-AI model support',
    'Real code generation',
    'Production-ready output',
    'Community support'
  ];

  // Show "Check your email" screen after successful registration
  if (success && registeredEmail) {
    return (
      <div className="min-h-screen bg-black text-white">
        <SiteHeader />
        <div className="container mx-auto px-6 py-24">
          <div className="max-w-lg mx-auto text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-8">
              <MailCheck className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Check your email</h1>
            <p className="text-xl text-gray-400 mb-2">
              We sent a verification link to
            </p>
            <p className="text-lg text-white font-medium mb-8">
              {registeredEmail}
            </p>
            <p className="text-gray-400 mb-8">
              Click the link in your email to verify your account, then sign in to get started.
            </p>

            {resendMessage && (
              <div className={`p-4 text-sm rounded-lg mb-6 ${
                resendMessage.includes('sent')
                  ? 'text-green-400 bg-green-500/10 border border-green-500/20'
                  : 'text-red-400 bg-red-500/10 border border-red-500/20'
              }`}>
                {resendMessage}
              </div>
            )}

            <div className="space-y-4">
              <button
                onClick={handleResendVerification}
                disabled={resending}
                className="w-full px-6 py-3 border border-white/10 hover:border-white/20 hover:bg-white/5 rounded-lg font-medium transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {resending ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Mail className="w-5 h-5" />
                    <span>Resend verification email</span>
                  </>
                )}
              </button>

              <Link
                href="/auth/signin"
                className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
              >
                <span>Already verified? Sign in</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
          {/* Left Column - Features */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold">
                Start Building with <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-purple-600">AI</span>
              </h1>
              <p className="text-xl text-gray-400">
                Build production-ready software with AI-powered tools
              </p>
            </div>

            <div className="space-y-4">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center space-x-3 text-gray-300">
                  <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <div className="p-6 rounded-2xl border border-orange-500/20 bg-orange-500/5">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Terminal className="w-6 h-6 text-white" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-bold text-white">Start Free</h3>
                  <p className="text-sm text-gray-400">
                    Get started with our free tier. No credit card required. Upgrade anytime.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Sign Up Form */}
          <div className="p-8 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="text-center space-y-3 mb-8">
              <h2 className="text-3xl font-bold">Create Account</h2>
              <p className="text-gray-400">
                Get started with recoder.xyz today
              </p>
            </div>

            <div className="space-y-4">
              {/* OAuth Buttons — only shown when providers are configured */}
              {hasGithubOAuth && (
                <button
                  className="w-full px-6 py-3 border border-white/10 hover:border-white/20 hover:bg-white/5 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                  onClick={async () => {
                    try {
                      await signIn.social({
                        provider: "github",
                        callbackURL: returnUrl || "/dashboard",
                      });
                    } catch (err) {
                      setError('GitHub authentication failed. Please try again.');
                    }
                  }}
                >
                  <Github className="w-5 h-5" />
                  <span>Continue with GitHub</span>
                </button>
              )}

              {hasGoogleOAuth && (
                <button
                  className="w-full px-6 py-3 border border-white/10 hover:border-white/20 hover:bg-white/5 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                  onClick={async () => {
                    try {
                      await signIn.social({
                        provider: "google",
                        callbackURL: returnUrl || "/dashboard",
                      });
                    } catch (err) {
                      setError('Google authentication failed. Please try again.');
                    }
                  }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>
              )}

              {(hasGithubOAuth || hasGoogleOAuth) && (
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-black text-gray-400">
                      Or sign up with email
                    </span>
                  </div>
                </div>
              )}

              {/* Email Form */}
              <form onSubmit={handleSignUp} className="space-y-4">
                {error && (
                  <div className="p-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                    {error}
                  </div>
                )}
                
                <div className="space-y-2">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-300">
                    Full Name
                  </label>
                  <input
                    id="name" 
                    type="text" 
                    placeholder="John Doe"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder-gray-500"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="block text-sm font-medium text-gray-300">
                    Email
                  </label>
                  <input
                    id="email" 
                    type="email" 
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder-gray-500"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-300">
                    Password
                  </label>
                  <input
                    id="password" 
                    type="password" 
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder-gray-500"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300">
                    Confirm Password
                  </label>
                  <input
                    id="confirmPassword" 
                    type="password" 
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-white placeholder-gray-500"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                    required
                  />
                </div>

                <button 
                  className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                  type="submit" 
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-5 h-5" />
                      <span>Create Account</span>
                    </>
                  )}
                </button>

                <div className="text-center text-xs text-gray-400">
                  By signing up, you agree to our{' '}
                  <Link href="/terms" className="text-orange-500 hover:text-orange-400">
                    Terms of Service
                  </Link>{' '}
                  and{' '}
                  <Link href="/privacy" className="text-orange-500 hover:text-orange-400">
                    Privacy Policy
                  </Link>
                </div>
              </form>
              
              <div className="text-center text-sm pt-4 border-t border-white/10">
                <span className="text-gray-400">Already have an account? </span>
                <Link href="/auth/signin" className="text-orange-500 hover:text-orange-400 transition-colors">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <SignUpForm />
    </Suspense>
  );
}
