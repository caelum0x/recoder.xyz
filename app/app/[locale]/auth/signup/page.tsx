/**
 * Authentication Signup/Register Page
 * Enterprise-grade signup for Recoder.xyz
 */

'use client';

import React from 'react';
import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Github,
  Terminal,
  Check,
  ArrowRight,
} from 'lucide-react';
import { signIn } from '@/lib/auth-client';
import { SiteHeader } from '@/components/SiteHeader';
import { LeadCaptureForm } from '@/components/LeadCaptureForm';
import { AnalyticsEvents, trackEvent } from '@/lib/analytics';

function SignUpForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawReturn = searchParams.get('redirect') || searchParams.get('return') || '/dashboard';
  const returnUrl = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : '/dashboard';

  const handleGitHubSignIn = async () => {
    setLoading(true);
    trackEvent(AnalyticsEvents.SIGNUP_STARTED, { method: 'github', source: 'signup_page' });
    try {
      await signIn.social({
        provider: "github",
        callbackURL: returnUrl,
      });
    } catch (err: any) {
      setError(err?.message || 'GitHub authentication failed');
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    trackEvent(AnalyticsEvents.SIGNUP_STARTED, { method: 'google', source: 'signup_page' });
    try {
      await signIn.social({
        provider: "google",
        callbackURL: returnUrl,
      });
    } catch (err: any) {
      setError(err?.message || 'Google authentication failed');
      setLoading(false);
    }
  };

  const features = [
    'Create your workspace with GitHub or Google',
    'Connect your own provider keys after signup',
    'Run CLI, web, and agent workflows from one account',
    'Keep previews, logs, and task state attached to real runs',
    'Start free before deciding whether to upgrade',
    'Move into docs or updates if you are not ready yet',
  ];

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-black to-purple-600/5" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '12s' }} />
      </div>

      <div className="relative z-10">
        <SiteHeader />

        <div className="container mx-auto px-6 py-16 lg:py-24">
          <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-12">
            {/* Left Column - Features */}
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl font-bold">
                  Create your Recoder <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-purple-600">workspace</span>
                </h1>
                <p className="text-xl text-gray-400">
                  Start with OAuth, bring your own model keys later, and keep the execution workflow under one account.
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
                    <h3 className="font-bold text-white">Start free, wire keys later</h3>
                    <p className="text-sm text-gray-400">
                      OAuth creates the workspace. Provider keys, projects, and deeper runtime setup can happen after you get inside.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Sign Up Form */}
            <div className="p-8 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl">
              <div className="text-center space-y-3 mb-8">
                <h2 className="text-3xl font-bold">Create Account</h2>
                <p className="text-gray-400">
                  Use GitHub or Google to create your workspace in under a minute
                </p>
              </div>

              <div className="space-y-4">
                {/* OAuth Buttons */}
                <button
                  className="w-full px-6 py-3 border border-white/10 hover:border-white/20 hover:bg-white/5 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                  onClick={handleGitHubSignIn}
                  disabled={loading}
                >
                  <Github className="w-5 h-5" />
                  <span>Continue with GitHub</span>
                </button>

                <button
                  className="w-full px-6 py-3 border border-white/10 hover:border-white/20 hover:bg-white/5 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Continue with Google</span>
                </button>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-black text-gray-400">
                      OAuth only
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="p-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                    {error}
                  </div>
                )}

                <div className="p-4 rounded-lg border border-white/10 bg-white/5 text-sm text-gray-400">
                  Email/password sign-up is disabled on the main site. Use GitHub or Google to create your account.
                </div>

                <LeadCaptureForm
                  source="signup_page_lead_capture"
                  title="Not ready to connect an account yet?"
                  description="Leave your email and we’ll send launch notes, product updates, and a better moment to come back when the workflow fits."
                  submitLabel="Get updates instead"
                />

                <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 text-sm text-cyan-100">
                  <p className="font-medium text-white">Need proof before creating an account?</p>
                  <Link
                    href="/docs/getting-started"
                    className="mt-2 inline-flex items-center gap-2 text-cyan-200 hover:text-white"
                  >
                    Read the real workflow first
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>

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
