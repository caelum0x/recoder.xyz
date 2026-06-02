/**
 * Authentication Signin Page
 * Unified authentication for all Recoder.xyz platforms
 */

'use client';

import React from 'react';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Github,
  Terminal,
  Globe,
  Bot,
  LayoutDashboard,
  Briefcase,
  Workflow
} from 'lucide-react';
import { signIn } from '@/lib/auth-client';
import { SiteHeader } from '@/components/SiteHeader';
import { AnalyticsEvents, trackEvent } from '@/lib/analytics';

function SignInForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawReturn = searchParams.get('redirect') || searchParams.get('return') || '/dashboard';
  // Allow relative paths and *.recoder.xyz subdomains, block open redirects
  const isRelative = rawReturn.startsWith('/') && !rawReturn.startsWith('//');
  const isRecoderSubdomain = /^https:\/\/[a-z-]+\.recoder\.xyz(\/|$)/.test(rawReturn);
  const returnUrl = isRelative || isRecoderSubdomain ? rawReturn : '/dashboard';

  useEffect(() => {
    if (!returnUrl.startsWith('/dashboard')) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'include',
        });
        const data = await response.json() as { user?: { id: string } | null };

        if (!data.user || cancelled) {
          return;
        }

        window.location.href = returnUrl;
      } catch {
        // Keep the user on the sign-in page if session detection fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [returnUrl]);

  const handleGitHubSignIn = async () => {
    setLoading(true);
    trackEvent(AnalyticsEvents.LOGIN_STARTED, { method: 'github', source: 'signin_page' });
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
    trackEvent(AnalyticsEvents.LOGIN_STARTED, { method: 'google', source: 'signin_page' });
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

  const platforms = [
    { name: 'Agents', description: 'AI agent IDE', icon: Bot, url: 'https://agents.recoder.xyz' },
    { name: 'Spaces', description: 'Shared workspace', icon: Workflow, url: '/dashboard/spaces' },
    { name: 'PM', description: 'Project management', icon: LayoutDashboard, url: 'https://pm.recoder.xyz' },
    { name: 'Agency', description: 'AI agency platform', icon: Briefcase, url: 'https://agency.recoder.xyz' },
    { name: 'CLI', description: 'Terminal access', icon: Terminal, url: 'https://recoder.xyz/tools' },
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
          <div className="max-w-5xl mx-auto grid lg:grid-cols-2 gap-12 items-start">
            {/* Left Column - Sign In Card */}
            <div>
              <div className="mb-8 p-8 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl">
                <div className="text-center space-y-3 mb-8">
                  <h1 className="text-3xl font-bold">Welcome Back</h1>
                  <p className="text-gray-400">
                    Sign in to access the Recoder platform
                  </p>
                </div>
                <div className="space-y-4">
                  {searchParams.get('verified') === 'true' && (
                    <div className="p-4 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg">
                      Email verified successfully! You can now sign in.
                    </div>
                  )}

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

                  <div className="relative my-2">
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
                    Email/password sign-in is disabled on the main site. Use GitHub or Google to continue.
                  </div>

                  <div className="text-center text-sm pt-4">
                    <span className="text-gray-400">Don&apos;t have an account? </span>
                    <Link href="/auth/signup" className="text-orange-500 hover:text-orange-400 transition-colors">
                      Sign up
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Platform Showcase */}
            <div className="hidden lg:block">
              <div className="p-8 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl sticky top-24">
                <div className="space-y-2 mb-6">
                  <h2 className="text-xl font-bold">One Account. All Platforms.</h2>
                  <p className="text-gray-400 text-sm">
                    Your Recoder account gives you access to every platform
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {platforms.map((platform) => {
                    const Icon = platform.icon;
                    return (
                      <div key={platform.name} className="flex items-center space-x-3 p-3 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 transition-colors">
                        <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-white text-sm">{platform.name}</div>
                          <div className="text-xs text-gray-500">{platform.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 p-4 rounded-lg border border-orange-500/20 bg-orange-500/5">
                  <p className="text-sm text-gray-300">
                    <span className="text-orange-400 font-medium">Unified SSO</span> — Sign in once and access all Recoder apps seamlessly.
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile-only Platform Card */}
            <div className="lg:hidden p-8 rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl">
              <div className="space-y-2 mb-6">
                <h2 className="text-xl font-bold">One Account. All Platforms.</h2>
                <p className="text-gray-400 text-sm">
                  Your Recoder account gives you access to every platform
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {platforms.map((platform) => {
                  const Icon = platform.icon;
                  return (
                    <div key={platform.name} className="flex items-center space-x-3 p-3 rounded-lg border border-white/5 bg-white/5">
                      <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-white text-sm">{platform.name}</div>
                        <div className="text-xs text-gray-500">{platform.description}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}
